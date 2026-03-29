import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; count: jest.Mock };
    membership: { findUnique: jest.Mock; create: jest.Mock; count: jest.Mock };
    organization: { create: jest.Mock; count: jest.Mock };
    auditLog: { create: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      membership: {
        findUnique: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      organization: {
        create: jest.fn(),
        count: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (arg: unknown) => {
        if (typeof arg === "function") {
          return (arg as (tx: unknown) => unknown)(prisma);
        }
        return arg;
      }),
    };

    prisma.$queryRaw.mockResolvedValue([]);

    service = new AuthService(prisma as unknown as PrismaService);
  });

  it("should log in with a valid password and single organization", async () => {
    const passwordHash = await bcrypt.hash("AgentPass123!", 4);
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      name: "Agent",
      passwordHash,
      memberships: [
        {
          organizationId: "org_1",
          organization: { id: "org_1", name: "Acme", slug: "acme" },
        },
      ],
    });

    const result = await service.login({
      email: "agent@acme.com",
      password: "AgentPass123!",
    });

    expect(result.requiresOrganizationSelection).toBe(false);
    if (!result.requiresOrganizationSelection) {
      expect(result.organization.id).toBe("org_1");
      expect(result.session.userId).toBe("u1");
    }
  });

  it("should reject login when password is incorrect", async () => {
    const passwordHash = await bcrypt.hash("AgentPass123!", 4);
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      name: "Agent",
      passwordHash,
      memberships: [
        {
          organizationId: "org_1",
          organization: { id: "org_1", name: "Acme", slug: "acme" },
        },
      ],
    });

    await expect(
      service.login({
        email: "agent@acme.com",
        password: "WrongPass123!",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("should direct legacy null-password users to activate via invite", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      name: "Agent",
      passwordHash: null,
      memberships: [
        {
          organizationId: "org_1",
          organization: { id: "org_1", name: "Acme", slug: "acme" },
        },
      ],
    });

    await expect(
      service.login({
        email: "agent@acme.com",
        password: "AgentPass123!",
      }),
    ).rejects.toMatchObject({
      response: {
        code: "AUTH_ACTIVATION_REQUIRED",
        message:
          "Account activation required. Ask an owner for a fresh invite to set your password.",
      },
    });
  });

  it("should require organization selection for multi-org user", async () => {
    const passwordHash = await bcrypt.hash("AgentPass123!", 4);
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      name: "Agent",
      passwordHash,
      memberships: [
        {
          organizationId: "org_1",
          organization: { id: "org_1", name: "Acme", slug: "acme" },
        },
        {
          organizationId: "org_2",
          organization: { id: "org_2", name: "Beta", slug: "beta" },
        },
      ],
    });

    const result = await service.login({
      email: "agent@acme.com",
      password: "AgentPass123!",
    });

    expect(result.requiresOrganizationSelection).toBe(true);
    if (result.requiresOrganizationSelection) {
      expect(result.organizations).toHaveLength(2);
    }
  });

  it("should reject unauthorized organization selection", async () => {
    const passwordHash = await bcrypt.hash("AgentPass123!", 4);
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      name: "Agent",
      passwordHash,
      memberships: [
        {
          organizationId: "org_1",
          organization: { id: "org_1", name: "Acme", slug: "acme" },
        },
      ],
    });

    await expect(
      service.login({
        email: "agent@acme.com",
        password: "AgentPass123!",
        organizationId: "org_2",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("should report bootstrap status when the system is empty", async () => {
    prisma.organization.count.mockResolvedValue(0);
    prisma.user.count.mockResolvedValue(0);
    prisma.membership.count.mockResolvedValue(0);

    await expect(service.getBootstrapStatus()).resolves.toEqual({
      bootstrapEnabled: true,
    });
  });

  it("should bootstrap the first owner with a hashed password", async () => {
    prisma.organization.count.mockResolvedValue(0);
    prisma.user.count.mockResolvedValue(0);
    prisma.membership.count.mockResolvedValue(0);
    prisma.organization.create.mockResolvedValue({
      id: "org_1",
      name: "Acme Store",
      slug: "acme-store",
    });
    prisma.user.create.mockResolvedValue({
      id: "user_1",
      email: "owner@acme.com",
      name: "Ali Yilmaz",
    });
    prisma.membership.create.mockResolvedValue({
      id: "mem_1",
      role: Role.OWNER,
    });
    prisma.auditLog.create.mockResolvedValue({});

    const result = await service.bootstrapOwner({
      name: "Ali Yilmaz",
      email: "owner@acme.com",
      password: "OwnerPass123!",
      organizationName: "Acme Store",
    });

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.membership.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org_1",
        userId: "user_1",
        role: Role.OWNER,
      },
    });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "owner@acme.com",
          passwordHash: expect.any(String),
        }),
      }),
    );
    expect(prisma.user.create.mock.calls[0][0].data.passwordHash).not.toBe(
      "OwnerPass123!",
    );
    expect(result.organization.slug).toBe("acme-store");
    expect(result.session.organizationId).toBe("org_1");
  });

  it("should reject bootstrap once the system already has data", async () => {
    prisma.organization.count.mockResolvedValue(1);
    prisma.user.count.mockResolvedValue(1);
    prisma.membership.count.mockResolvedValue(1);

    await expect(
      service.bootstrapOwner({
        name: "Ali Yilmaz",
        email: "owner@acme.com",
        password: "OwnerPass123!",
        organizationName: "Acme Store",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
