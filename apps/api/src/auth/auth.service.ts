import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { BootstrapOwnerDto } from "./dto/bootstrap-owner.dto";
import { SessionPayload } from "./auth.types";
import { SESSION_TTL_SECONDS } from "./session.constants";
import { PASSWORD_HASH_ROUNDS } from "./password.constants";

const BOOTSTRAP_UNAVAILABLE_MESSAGE =
  "Bootstrap is not available after the first owner is created";
const AUTH_ACTIVATION_REQUIRED_CODE = "AUTH_ACTIVATION_REQUIRED";
const AUTH_ACTIVATION_REQUIRED_MESSAGE =
  "Account activation required. Ask an owner for a fresh invite to set your password.";

type AuthDbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
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
      user: result.user,
      organization: result.organization,
      session: {
        userId: result.user.id,
        organizationId: result.organization.id,
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

    return membership;
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
}
