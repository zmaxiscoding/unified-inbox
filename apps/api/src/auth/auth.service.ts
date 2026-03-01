import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { SessionPayload } from "./auth.types";
import { SESSION_TTL_SECONDS } from "./session.constants";

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
}
