import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SessionPayload } from "../auth/auth.types";
import { SessionService } from "../auth/session.service";
import { SESSION_TTL_SECONDS } from "../auth/session.constants";

const INVITE_EXPIRY_DAYS = 7;
const BCRYPT_ROUNDS = 12;

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
    const actorMembership = await this.getActorMembership(
      organizationId,
      actorUserId,
    );
    this.assertOwner(actorMembership);

    const normalizedEmail = email.trim().toLowerCase();

    const existingMembership = await this.prisma.membership.findFirst({
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

    const existingInvite = await this.prisma.invitation.findFirst({
      where: {
        organizationId,
        email: normalizedEmail,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (existingInvite) {
      throw new BadRequestException(
        "A pending invitation already exists for this email",
      );
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const invitation = await this.prisma.invitation.create({
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

    await this.prisma.auditLog.create({
      data: {
        action: "invite.created",
        targetId: invitation.id,
        metadata: { email: normalizedEmail, role },
        organizationId,
        actorId: actorUserId,
      },
    });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    return {
      inviteId: invitation.id,
      inviteLink: `${appUrl}/invite?token=${rawToken}`,
    };
  }

  async acceptInvite(token: string, name?: string, password?: string) {
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const invitation = await this.prisma.invitation.findUnique({
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
    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException("Invitation has expired");
    }

    let user = await this.prisma.user.findUnique({
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
      user = await this.prisma.user.create({
        data: {
          email: invitation.email,
          name: name.trim(),
          passwordHash,
        },
        select: { id: true, name: true, email: true },
      });
    }

    const existingMembership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invitation.organizationId,
          userId: user.id,
        },
      },
    });

    if (existingMembership) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
    } else {
      await this.prisma.$transaction([
        this.prisma.membership.create({
          data: {
            organizationId: invitation.organizationId,
            userId: user.id,
            role: invitation.role,
          },
        }),
        this.prisma.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        }),
      ]);
    }

    await this.prisma.auditLog.create({
      data: {
        action: "invite.accepted",
        targetId: invitation.id,
        metadata: { email: invitation.email, role: invitation.role },
        organizationId: invitation.organizationId,
        actorId: user.id,
      },
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const sessionPayload: SessionPayload = {
      userId: user.id,
      organizationId: invitation.organizationId,
      iat: nowSeconds,
      exp: nowSeconds + SESSION_TTL_SECONDS,
    };

    return {
      user: { id: user.id, name: user.name, email: user.email },
      organization: invitation.organization,
      sessionPayload,
      sessionCookie: this.sessionService.createSessionCookie(sessionPayload),
    };
  }

  async revokeInvite(
    organizationId: string,
    actorUserId: string,
    inviteId: string,
  ) {
    const actorMembership = await this.getActorMembership(
      organizationId,
      actorUserId,
    );
    this.assertOwner(actorMembership);

    const invitation = await this.prisma.invitation.findFirst({
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

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { revokedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        action: "invite.revoked",
        targetId: invitation.id,
        metadata: { email: invitation.email },
        organizationId,
        actorId: actorUserId,
      },
    });
  }

  async updateMemberRole(
    organizationId: string,
    actorUserId: string,
    membershipId: string,
    role: Role,
  ) {
    const actorMembership = await this.getActorMembership(
      organizationId,
      actorUserId,
    );
    this.assertOwner(actorMembership);

    const targetMembership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId },
      select: { id: true, role: true, userId: true },
    });

    if (!targetMembership) {
      throw new NotFoundException("Membership not found");
    }

    if (targetMembership.role === Role.OWNER && role === Role.AGENT) {
      const ownerCount = await this.prisma.membership.count({
        where: { organizationId, role: Role.OWNER },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException("Cannot downgrade the last owner");
      }
    }

    const updated = await this.prisma.membership.update({
      where: { id: targetMembership.id },
      data: { role },
      select: {
        id: true,
        role: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await this.prisma.auditLog.create({
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
  }

  async removeMember(
    organizationId: string,
    actorUserId: string,
    membershipId: string,
  ) {
    const actorMembership = await this.getActorMembership(
      organizationId,
      actorUserId,
    );
    this.assertOwner(actorMembership);

    const targetMembership = await this.prisma.membership.findFirst({
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
      const ownerCount = await this.prisma.membership.count({
        where: { organizationId, role: Role.OWNER },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException("Cannot remove the last owner");
      }
    }

    await this.prisma.conversation.updateMany({
      where: {
        organizationId,
        assignedMembershipId: targetMembership.id,
      },
      data: { assignedMembershipId: null },
    });

    await this.prisma.membership.delete({
      where: { id: targetMembership.id },
    });

    await this.prisma.auditLog.create({
      data: {
        action: "member.removed",
        targetId: targetMembership.id,
        metadata: { userId: targetMembership.userId },
        organizationId,
        actorId: actorUserId,
      },
    });
  }

  private async getActorMembership(
    organizationId: string,
    userId: string,
  ) {
    const membership = await this.prisma.membership.findUnique({
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
}
