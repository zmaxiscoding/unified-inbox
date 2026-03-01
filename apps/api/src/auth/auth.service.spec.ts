import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    service = new AuthService(prisma as unknown as PrismaService);
  });

  it("should require organization selection for multi-org user", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      name: "Agent",
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

    const result = await service.login({ email: "agent@acme.com" });

    expect(result.requiresOrganizationSelection).toBe(true);
    if (result.requiresOrganizationSelection) {
      expect(result.organizations).toHaveLength(2);
    }
  });

  it("should reject unauthorized organization selection", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      name: "Agent",
      memberships: [
        {
          organizationId: "org_1",
          organization: { id: "org_1", name: "Acme", slug: "acme" },
        },
      ],
    });

    await expect(
      service.login({ email: "agent@acme.com", organizationId: "org_2" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
