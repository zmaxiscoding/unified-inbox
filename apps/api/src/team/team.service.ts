import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SessionPayload } from "../auth/auth.types";
import { SessionService } from "../auth/session.service";
import { SESSION_TTL_SECONDS } from "../auth/session.constants";

const INVITE_EXPIRY_DAYS = 7;
const BCRYPT_ROUNDS = 12;
const INVITE_EXISTS_MESSAGE = "A pending invitation already exists for this email";

type TeamDbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
  ) {}

  async getTeam(organizationId: string) {
    const [members, invites] = await Promise.all([
      this.prisma.membership.findMany({
        where: { organizationId },
        orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      this.prisma.invitation.findMany({
        where: {
          organizationId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      members: members.map((m) => ({
        membershipId: m.id,
        role: m.role,
        createdAt: m.createdAt,
        user: m.user,
      })),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
      })),
    };
  }

  async createInvite(
    organizationId: string,
    actorUserId: string,
    email: string,
    role: Role,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date();

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    let invitationId: string;

    try {
      const invitation = await this.prisma.$transaction(async (tx) => {
        await this.lockOrganizationMemberships(tx, organizationId);

        const actorMembership = await this.getActorMembership(
          tx,
          organizationId,
          actorUserId,
        );
        this.assertOwner(actorMembership);

        // Expired pending invites are auto-revoked so a new invite can be issued.
        await tx.invitation.updateMany({
          where: {
            organizationId,
            email: normalizedEmail,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { lte: now },
          },
          data: { revokedAt: now },
        });

        const existingMembership = await tx.membership.findFirst({
          where: {
            organizationId,
            user: { email: normalizedEmail },
          },
        });
        if (existingMembership) {
          throw new BadRequestException(
            "User is already a member of this organization",
          );
        }

        const existingInvite = await tx.invitation.findFirst({
          where: {
            organizationId,
            email: normalizedEmail,
            acceptedAt: null,
            revokedAt: null,
          },
          select: { id: true },
        });
        if (existingInvite) {
          throw new BadRequestException(INVITE_EXISTS_MESSAGE);
        }

        const createdInvitation = await tx.invitation.create({
          data: {
            email: normalizedEmail,
            role,
            tokenHash,
            expiresAt,
            organizationId,
            createdByMembershipId: actorMembership.id,
          },
          select: { id: true },
        });

        await tx.auditLog.create({
          data: {
            action: "invite.created",
            targetId: createdInvitation.id,
            metadata: { email: normalizedEmail, role },
            organizationId,
            actorId: actorUserId,
          },
        });

        return createdInvitation;
      });

      invitationId = invitation.id;
    } catch (error) {
      if (this.isPendingInviteUniqueViolation(error)) {
        throw new BadRequestException(INVITE_EXISTS_MESSAGE);
      }
      throw error;
    }

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    return {
      inviteId: invitationId,
      inviteLink: `${appUrl}/invite?token=${rawToken}`,
    };
  }

  async acceptInvite(token: string, name?: string, password?: string) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const acceptResult = await this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          organizationId: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
      });

      if (!invitation) {
        throw new BadRequestException("Invalid invitation token");
      }
      if (invitation.acceptedAt) {
        throw new BadRequestException("Invitation has already been accepted");
      }
      if (invitation.revokedAt) {
        throw new BadRequestException("Invitation has been revoked");
      }

      const now = new Date();
      if (invitation.expiresAt <= now) {
        throw new BadRequestException("Invitation has expired");
      }

      let user = await tx.user.findUnique({
        where: { email: invitation.email },
        select: { id: true, name: true, email: true },
      });

      if (!user) {
        if (!name || !password) {
          throw new BadRequestException(
            "name and password are required for new users",
          );
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        try {
          user = await tx.user.create({
            data: {
              email: invitation.email,
              name: name.trim(),
              passwordHash,
            },
            select: { id: true, name: true, email: true },
          });
        } catch (error) {
          if (!this.isUniqueConstraintViolation(error)) {
            throw error;
          }

          const concurrentUser = await tx.user.findUnique({
            where: { email: invitation.email },
            select: { id: true, name: true, email: true },
          });
          if (!concurrentUser) {
            throw error;
          }
          user = concurrentUser;
        }
      }

      const acceptedAt = new Date();
      const acceptUpdate = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: acceptedAt },
        },
        data: { acceptedAt },
      });

      if (acceptUpdate.count !== 1) {
        const latest = await tx.invitation.findUnique({
          where: { id: invitation.id },
          select: { acceptedAt: true, revokedAt: true, expiresAt: true },
        });

        if (latest?.acceptedAt) {
          throw new BadRequestException("Invitation has already been accepted");
        }
        if (latest?.revokedAt) {
          throw new BadRequestException("Invitation has been revoked");
        }
        if (latest && latest.expiresAt <= new Date()) {
          throw new BadRequestException("Invitation has expired");
        }

        throw new BadRequestException("Invitation is no longer valid");
      }

      await tx.membership.upsert({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: user.id,
          },
        },
        create: {
          organizationId: invitation.organizationId,
          userId: user.id,
          role: invitation.role,
        },
        update: {},
      });

      await tx.auditLog.create({
        data: {
          action: "invite.accepted",
          targetId: invitation.id,
          metadata: { email: invitation.email, role: invitation.role },
          organizationId: invitation.organizationId,
          actorId: user.id,
        },
      });

      return {
        user,
        organization: invitation.organization,
        organizationId: invitation.organizationId,
      };
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const sessionPayload: SessionPayload = {
      userId: acceptResult.user.id,
      organizationId: acceptResult.organizationId,
      iat: nowSeconds,
      exp: nowSeconds + SESSION_TTL_SECONDS,
    };

    return {
      user: {
        id: acceptResult.user.id,
        name: acceptResult.user.name,
        email: acceptResult.user.email,
      },
      organization: acceptResult.organization,
      sessionPayload,
      sessionCookie: this.sessionService.createSessionCookie(sessionPayload),
    };
  }

  async revokeInvite(
    organizationId: string,
    actorUserId: string,
    inviteId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockOrganizationMemberships(tx, organizationId);

      const actorMembership = await this.getActorMembership(
        tx,
        organizationId,
        actorUserId,
      );
      this.assertOwner(actorMembership);

      const invitation = await tx.invitation.findFirst({
        where: {
          id: inviteId,
          organizationId,
          acceptedAt: null,
          revokedAt: null,
        },
      });

      if (!invitation) {
        throw new NotFoundException("Invitation not found");
      }

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { revokedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          action: "invite.revoked",
          targetId: invitation.id,
          metadata: { email: invitation.email },
          organizationId,
          actorId: actorUserId,
        },
      });
    });
  }

  async updateMemberRole(
    organizationId: string,
    actorUserId: string,
    membershipId: string,
    role: Role,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockOrganizationMemberships(tx, organizationId);

      const actorMembership = await this.getActorMembership(
        tx,
        organizationId,
        actorUserId,
      );
      this.assertOwner(actorMembership);

      const targetMembership = await tx.membership.findFirst({
        where: { id: membershipId, organizationId },
        select: { id: true, role: true, userId: true },
      });

      if (!targetMembership) {
        throw new NotFoundException("Membership not found");
      }

      if (targetMembership.role === Role.OWNER && role === Role.AGENT) {
        const ownerCount = await tx.membership.count({
          where: { organizationId, role: Role.OWNER },
        });
        if (ownerCount <= 1) {
          throw new BadRequestException("Cannot downgrade the last owner");
        }
      }

      const updated = await tx.membership.update({
        where: { id: targetMembership.id },
        data: { role },
        select: {
          id: true,
          role: true,
          user: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: "member.role_changed",
          targetId: targetMembership.id,
          metadata: {
            userId: targetMembership.userId,
            previousRole: targetMembership.role,
            newRole: role,
          },
          organizationId,
          actorId: actorUserId,
        },
      });

      return {
        membershipId: updated.id,
        role: updated.role,
        user: updated.user,
      };
    });
  }

  async removeMember(
    organizationId: string,
    actorUserId: string,
    membershipId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockOrganizationMemberships(tx, organizationId);

      const actorMembership = await this.getActorMembership(
        tx,
        organizationId,
        actorUserId,
      );
      this.assertOwner(actorMembership);

      const targetMembership = await tx.membership.findFirst({
        where: { id: membershipId, organizationId },
        select: { id: true, role: true, userId: true },
      });

      if (!targetMembership) {
        throw new NotFoundException("Membership not found");
      }

      if (targetMembership.userId === actorUserId) {
        throw new BadRequestException("Cannot remove yourself");
      }

      if (targetMembership.role === Role.OWNER) {
        const ownerCount = await tx.membership.count({
          where: { organizationId, role: Role.OWNER },
        });
        if (ownerCount <= 1) {
          throw new BadRequestException("Cannot remove the last owner");
        }
      }

      await tx.conversation.updateMany({
        where: {
          organizationId,
          assignedMembershipId: targetMembership.id,
        },
        data: { assignedMembershipId: null },
      });

      await tx.membership.delete({
        where: { id: targetMembership.id },
      });

      await tx.auditLog.create({
        data: {
          action: "member.removed",
          targetId: targetMembership.id,
          metadata: { userId: targetMembership.userId },
          organizationId,
          actorId: actorUserId,
        },
      });
    });
  }

  private async getActorMembership(
    db: TeamDbClient,
    organizationId: string,
    userId: string,
  ) {
    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: { organizationId, userId },
      },
      select: { id: true, role: true, userId: true },
    });

    if (!membership) {
      throw new ForbiddenException("Not a member of this organization");
    }

    return membership;
  }

  private assertOwner(membership: { role: Role }) {
    if (membership.role !== Role.OWNER) {
      throw new ForbiddenException("Only owners can perform this action");
    }
  }

  private async lockOrganizationMemberships(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    await tx.$queryRaw`
      SELECT "id"
      FROM "memberships"
      WHERE "organizationId" = ${organizationId}
      FOR UPDATE
    `;
  }

  private isUniqueConstraintViolation(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private isPendingInviteUniqueViolation(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code !== "P2002") {
      return false;
    }

    const target = error.meta?.target;
    if (Array.isArray(target)) {
      const normalizedTarget = target.map(String);
      return (
        normalizedTarget.includes("invitations_org_email_pending_unique") ||
        (normalizedTarget.includes("organizationId") &&
          normalizedTarget.includes("email"))
      );
    }

    return target === "invitations_org_email_pending_unique";
  }
}
