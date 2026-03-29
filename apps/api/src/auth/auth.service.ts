import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthEmailDeliveryService } from "./auth-email-delivery.service";
import { LoginDto } from "./dto/login.dto";
import { BootstrapOwnerDto } from "./dto/bootstrap-owner.dto";
import { EmailVerificationConfirmDto } from "./dto/email-verification-confirm.dto";
import { EmailVerificationRequestDto } from "./dto/email-verification-request.dto";
import { PasswordResetConfirmDto } from "./dto/password-reset-confirm.dto";
import { PasswordResetRequestDto } from "./dto/password-reset-request.dto";
import { RecoverOwnerDto } from "./dto/recover-owner.dto";
import { SessionPayload } from "./auth.types";
import { SESSION_TTL_SECONDS } from "./session.constants";
import { PASSWORD_HASH_ROUNDS } from "./password.constants";

const BOOTSTRAP_UNAVAILABLE_MESSAGE =
  "Bootstrap is not available after the first owner is created";
const AUTH_ACTIVATION_REQUIRED_CODE = "AUTH_ACTIVATION_REQUIRED";
const AUTH_ACTIVATION_REQUIRED_MESSAGE =
  "Account activation required. Ask an owner for a fresh invite to set your password.";
const OWNER_RECOVERY_DISABLED_MESSAGE =
  "Owner recovery is disabled. Set AUTH_RECOVERY_SECRET to enable it.";
const OWNER_RECOVERY_UNAVAILABLE_MESSAGE =
  "Owner recovery is only available when the organization has no password-backed owners.";
const OWNER_RECOVERY_ALREADY_ACTIVE_MESSAGE =
  "Owner account already has a password. Use the normal login flow.";
const PASSWORD_RESET_EXPIRY_MINUTES = 60;
const EMAIL_VERIFICATION_EXPIRY_HOURS = 24;

type AuthDbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authEmailDelivery: AuthEmailDeliveryService,
  ) {}

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        sessionVersion: true,
        memberships: {
          select: {
            organizationId: true,
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException({
        message: AUTH_ACTIVATION_REQUIRED_MESSAGE,
        code: AUTH_ACTIVATION_REQUIRED_CODE,
      });
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (user.memberships.length === 0) {
      throw new ForbiddenException("User has no organization membership");
    }

    const selectedMembership = dto.organizationId
      ? user.memberships.find(
          (membership) => membership.organizationId === dto.organizationId,
        )
      : user.memberships.length === 1
        ? user.memberships[0]
        : null;

    if (!selectedMembership && dto.organizationId) {
      throw new ForbiddenException("Organization access denied");
    }

    if (!selectedMembership) {
      return {
        requiresOrganizationSelection: true as const,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        organizations: user.memberships.map((membership) => membership.organization),
      };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    return {
      requiresOrganizationSelection: false as const,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      organization: selectedMembership.organization,
      session: {
        userId: user.id,
        organizationId: selectedMembership.organizationId,
        sessionVersion: user.sessionVersion,
        iat: nowSeconds,
        exp: nowSeconds + SESSION_TTL_SECONDS,
      } satisfies SessionPayload,
    };
  }

  async getBootstrapStatus() {
    return {
      bootstrapEnabled: await this.isBootstrapAvailable(this.prisma),
    };
  }

  async requestPasswordReset(dto: PasswordResetRequestDto) {
    const deliveryMode = this.authEmailDelivery.getMode();

    if (deliveryMode === "disabled") {
      return { ok: true, deliveryMode };
    }

    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });

    if (!user?.passwordHash) {
      return { ok: true, deliveryMode };
    }

    const now = new Date();
    const rawToken = this.createRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_EXPIRY_MINUTES * 60_000);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: {
            userId: user.id,
            usedAt: null,
            invalidatedAt: null,
          },
          data: {
            invalidatedAt: now,
          },
        });

        await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        });
      });
    } catch (error) {
      if (this.isActiveAuthTokenUniqueViolation(error)) {
        return { ok: true, deliveryMode };
      }

      throw error;
    }

    try {
      await this.authEmailDelivery.send({
        kind: "password-reset",
        to: user.email,
        subject: "Reset your Unified Inbox password",
        actionUrl: this.buildAppUrl("/password-reset", rawToken),
        expiresAt,
      });
    } catch {
      await this.prisma.passwordResetToken.updateMany({
        where: {
          tokenHash,
          usedAt: null,
          invalidatedAt: null,
        },
        data: {
          invalidatedAt: new Date(),
        },
      });
    }

    return { ok: true, deliveryMode };
  }

  async confirmPasswordReset(dto: PasswordResetConfirmDto) {
    const tokenHash = this.hashToken(dto.token.trim());

    await this.prisma.$transaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          usedAt: true,
          invalidatedAt: true,
        },
      });

      if (!resetToken) {
        throw new BadRequestException("Invalid password reset token");
      }
      if (resetToken.usedAt) {
        throw new BadRequestException("Password reset link has already been used");
      }
      if (resetToken.invalidatedAt) {
        throw new BadRequestException("Password reset link is no longer valid");
      }

      const now = new Date();
      if (resetToken.expiresAt <= now) {
        throw new BadRequestException("Password reset link has expired");
      }

      const consume = await tx.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          usedAt: now,
        },
      });

      if (consume.count !== 1) {
        const latest = await tx.passwordResetToken.findUnique({
          where: { id: resetToken.id },
          select: {
            expiresAt: true,
            usedAt: true,
            invalidatedAt: true,
          },
        });

        if (latest?.usedAt) {
          throw new BadRequestException("Password reset link has already been used");
        }
        if (latest?.invalidatedAt) {
          throw new BadRequestException("Password reset link is no longer valid");
        }
        if (latest && latest.expiresAt <= new Date()) {
          throw new BadRequestException("Password reset link has expired");
        }

        throw new ConflictException("Password reset could not be completed");
      }

      const passwordHash = await bcrypt.hash(dto.password, PASSWORD_HASH_ROUNDS);
      await tx.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash,
          sessionVersion: { increment: 1 },
        },
      });
    });

    return { ok: true };
  }

  async requestEmailVerification(dto: EmailVerificationRequestDto) {
    const deliveryMode = this.authEmailDelivery.getMode();

    if (deliveryMode === "disabled") {
      return { ok: true, deliveryMode };
    }

    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
      },
    });

    if (!user || user.emailVerifiedAt) {
      return { ok: true, deliveryMode };
    }

    const now = new Date();
    const rawToken = this.createRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60_000);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.emailVerificationToken.updateMany({
          where: {
            userId: user.id,
            usedAt: null,
            invalidatedAt: null,
          },
          data: {
            invalidatedAt: now,
          },
        });

        await tx.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        });
      });
    } catch (error) {
      if (this.isActiveAuthTokenUniqueViolation(error)) {
        return { ok: true, deliveryMode };
      }

      throw error;
    }

    try {
      await this.authEmailDelivery.send({
        kind: "email-verification",
        to: user.email,
        subject: "Verify your Unified Inbox email",
        actionUrl: this.buildAppUrl("/email-verification", rawToken),
        expiresAt,
      });
    } catch {
      await this.prisma.emailVerificationToken.updateMany({
        where: {
          tokenHash,
          usedAt: null,
          invalidatedAt: null,
        },
        data: {
          invalidatedAt: new Date(),
        },
      });
    }

    return { ok: true, deliveryMode };
  }

  async confirmEmailVerification(dto: EmailVerificationConfirmDto) {
    const tokenHash = this.hashToken(dto.token.trim());

    await this.prisma.$transaction(async (tx) => {
      const verificationToken = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          usedAt: true,
          invalidatedAt: true,
        },
      });

      if (!verificationToken) {
        throw new BadRequestException("Invalid email verification token");
      }
      if (verificationToken.usedAt) {
        throw new BadRequestException("Email verification link has already been used");
      }
      if (verificationToken.invalidatedAt) {
        throw new BadRequestException("Email verification link is no longer valid");
      }

      const now = new Date();
      if (verificationToken.expiresAt <= now) {
        throw new BadRequestException("Email verification link has expired");
      }

      const consume = await tx.emailVerificationToken.updateMany({
        where: {
          id: verificationToken.id,
          usedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          usedAt: now,
        },
      });

      if (consume.count !== 1) {
        const latest = await tx.emailVerificationToken.findUnique({
          where: { id: verificationToken.id },
          select: {
            expiresAt: true,
            usedAt: true,
            invalidatedAt: true,
          },
        });

        if (latest?.usedAt) {
          throw new BadRequestException("Email verification link has already been used");
        }
        if (latest?.invalidatedAt) {
          throw new BadRequestException("Email verification link is no longer valid");
        }
        if (latest && latest.expiresAt <= new Date()) {
          throw new BadRequestException("Email verification link has expired");
        }

        throw new ConflictException("Email verification could not be completed");
      }

      await tx.user.updateMany({
        where: {
          id: verificationToken.userId,
          emailVerifiedAt: null,
        },
        data: {
          emailVerifiedAt: now,
        },
      });
    });

    return { ok: true };
  }

  async bootstrapOwner(dto: BootstrapOwnerDto) {
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();
    const organizationName = dto.organizationName.trim();
    const organizationSlug = this.slugifyOrganizationName(organizationName);

    if (!organizationSlug) {
      throw new BadRequestException(
        "Organization name must include letters or numbers",
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_HASH_ROUNDS);

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockBootstrapGate(tx);

      const bootstrapEnabled = await this.isBootstrapAvailable(tx);
      if (!bootstrapEnabled) {
        throw new ConflictException(BOOTSTRAP_UNAVAILABLE_MESSAGE);
      }

      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug: organizationSlug,
        },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
        },
        select: {
          id: true,
          email: true,
          name: true,
          sessionVersion: true,
        },
      });

      await tx.membership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: Role.OWNER,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "auth.bootstrap_completed",
          targetId: organization.id,
          metadata: { email },
          organizationId: organization.id,
          actorId: user.id,
        },
      });

      return { user, organization };
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      organization: result.organization,
      session: {
        userId: result.user.id,
        organizationId: result.organization.id,
        sessionVersion: result.user.sessionVersion,
        iat: nowSeconds,
        exp: nowSeconds + SESSION_TTL_SECONDS,
      } satisfies SessionPayload,
    };
  }

  async recoverOwnerAccess(dto: RecoverOwnerDto) {
    const configuredSecret = process.env.AUTH_RECOVERY_SECRET?.trim();
    if (!configuredSecret) {
      throw new ConflictException(OWNER_RECOVERY_DISABLED_MESSAGE);
    }

    if (!this.secretsMatch(configuredSecret, dto.recoverySecret.trim())) {
      throw new UnauthorizedException("Invalid recovery credentials");
    }

    const email = dto.email.trim().toLowerCase();
    const organizationSlug = dto.organizationSlug.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_HASH_ROUNDS);

    const result = await this.prisma.$transaction(async (tx) => {
      const targetOwnerMembership = await tx.membership.findFirst({
        where: {
          role: Role.OWNER,
          organization: { slug: organizationSlug },
          user: { email },
        },
        select: {
          organizationId: true,
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              passwordHash: true,
              sessionVersion: true,
            },
          },
        },
      });

      if (!targetOwnerMembership) {
        throw new NotFoundException("Legacy owner account not found for recovery");
      }

      await tx.$queryRaw`
        SELECT id
        FROM organizations
        WHERE id = ${targetOwnerMembership.organizationId}
        FOR UPDATE
      `;

      if (targetOwnerMembership.user.passwordHash) {
        throw new ConflictException(OWNER_RECOVERY_ALREADY_ACTIVE_MESSAGE);
      }

      const passwordBackedOwnerCount = await tx.membership.count({
        where: {
          organizationId: targetOwnerMembership.organizationId,
          role: Role.OWNER,
          user: {
            passwordHash: {
              not: null,
            },
          },
        },
      });

      if (passwordBackedOwnerCount > 0) {
        throw new ConflictException(OWNER_RECOVERY_UNAVAILABLE_MESSAGE);
      }

      const activation = await tx.user.updateMany({
        where: {
          id: targetOwnerMembership.user.id,
          passwordHash: null,
        },
        data: {
          passwordHash,
        },
      });

      if (activation.count !== 1) {
        const refreshedUser = await tx.user.findUnique({
          where: { id: targetOwnerMembership.user.id },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            sessionVersion: true,
          },
        });

        if (!refreshedUser?.passwordHash) {
          throw new ConflictException("Owner recovery could not be completed");
        }

        const passwordMatches = await bcrypt.compare(dto.password, refreshedUser.passwordHash);
        if (!passwordMatches) {
          throw new ConflictException("Owner recovery could not be completed");
        }

        return {
          user: {
            id: refreshedUser.id,
            email: refreshedUser.email,
            name: refreshedUser.name,
            sessionVersion: refreshedUser.sessionVersion,
          },
          organization: targetOwnerMembership.organization,
        };
      }

      await tx.auditLog.create({
        data: {
          action: "auth.owner_recovered",
          targetId: targetOwnerMembership.user.id,
          metadata: { email },
          organizationId: targetOwnerMembership.organizationId,
          actorId: targetOwnerMembership.user.id,
        },
      });

      return {
        user: {
          id: targetOwnerMembership.user.id,
          email: targetOwnerMembership.user.email,
          name: targetOwnerMembership.user.name,
          sessionVersion: targetOwnerMembership.user.sessionVersion,
        },
        organization: targetOwnerMembership.organization,
      };
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      organization: result.organization,
      session: {
        userId: result.user.id,
        organizationId: result.organization.id,
        sessionVersion: result.user.sessionVersion,
        iat: nowSeconds,
        exp: nowSeconds + SESSION_TTL_SECONDS,
      } satisfies SessionPayload,
    };
  }

  async getSessionDetails(session: SessionPayload) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: session.organizationId,
          userId: session.userId,
        },
      },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            emailVerifiedAt: true,
            sessionVersion: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!membership) {
      throw new UnauthorizedException("Invalid session");
    }
    if (membership.user.sessionVersion !== session.sessionVersion) {
      throw new UnauthorizedException("Invalid session");
    }

    return {
      role: membership.role,
      user: {
        id: membership.user.id,
        email: membership.user.email,
        name: membership.user.name,
        emailVerifiedAt: membership.user.emailVerifiedAt,
      },
      organization: membership.organization,
    };
  }

  private async isBootstrapAvailable(db: AuthDbClient) {
    const [organizationCount, userCount, membershipCount] = await Promise.all([
      db.organization.count(),
      db.user.count(),
      db.membership.count(),
    ]);

    return organizationCount === 0 && userCount === 0 && membershipCount === 0;
  }

  private async lockBootstrapGate(tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(32561, 1)`;
  }

  private createRawToken() {
    return randomBytes(32).toString("hex");
  }

  private hashToken(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private buildAppUrl(path: string, rawToken: string) {
    const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
      /\/+$/,
      "",
    );

    return `${appUrl}${path}?token=${rawToken}`;
  }

  private isActiveAuthTokenUniqueViolation(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    if (error.code !== "P2002") {
      return false;
    }

    const target = Array.isArray(error.meta?.target)
      ? error.meta?.target.join(",")
      : String(error.meta?.target ?? "");
    const normalizedTarget = target.toLowerCase();

    return (
      normalizedTarget.includes("password_reset_tokens_userid_active_unique") ||
      normalizedTarget.includes("email_verification_tokens_userid_active_unique") ||
      normalizedTarget.includes("userid")
    );
  }

  private slugifyOrganizationName(value: string) {
    return value
      .replace(/[ğĞ]/g, "g")
      .replace(/[üÜ]/g, "u")
      .replace(/[şŞ]/g, "s")
      .replace(/[ıİ]/g, "i")
      .replace(/[öÖ]/g, "o")
      .replace(/[çÇ]/g, "c")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-");
  }

  private secretsMatch(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
