import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SessionService } from "../auth/session.service";
import { TeamService } from "./team.service";

describe("TeamService", () => {
  let service: TeamService;
  let prisma: {
    membership: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    invitation: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    conversation: {
      updateMany: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
    };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let sessionService: { createSessionCookie: jest.Mock };

  beforeEach(() => {
    prisma = {
      membership: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      invitation: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      conversation: {
        updateMany: jest.fn(),
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
    prisma.invitation.updateMany.mockResolvedValue({ count: 1 });
    sessionService = { createSessionCookie: jest.fn() };

    service = new TeamService(
      prisma as unknown as PrismaService,
      sessionService as unknown as SessionService,
    );
  });

  // ── getTeam ─────────────────────────────────────────────

  it("should return members and pending invites", async () => {
    prisma.membership.findMany.mockResolvedValue([
      {
        id: "mem_1",
        role: "OWNER",
        createdAt: new Date(),
        user: { id: "u1", name: "Ali", email: "ali@acme.com" },
      },
    ]);
    prisma.invitation.findMany.mockResolvedValue([
      {
        id: "inv_1",
        email: "new@acme.com",
        role: "AGENT",
        expiresAt: new Date("2099-01-01"),
        createdAt: new Date(),
      },
    ]);

    const result = await service.getTeam("org_1");

    expect(result.members).toHaveLength(1);
    expect(result.members[0].membershipId).toBe("mem_1");
    expect(result.invites).toHaveLength(1);
    expect(result.invites[0].email).toBe("new@acme.com");
  });

  // ── createInvite ────────────────────────────────────────

  it("should reject invite creation by non-owner", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_1",
      role: "AGENT",
      userId: "u1",
    });

    await expect(
      service.createInvite("org_1", "u1", "new@acme.com", Role.AGENT),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("should reject invite if user is already a member", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_1",
      role: "OWNER",
      userId: "u1",
    });
    prisma.membership.findFirst.mockResolvedValue({
      role: "AGENT",
      user: { passwordHash: "hashed" },
    });

    await expect(
      service.createInvite("org_1", "u1", "existing@acme.com", Role.AGENT),
    ).rejects.toEqual(
      new BadRequestException(
        "User is already a member of this organization",
      ),
    );
  });

  it("should reject duplicate pending invite", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_1",
      role: "OWNER",
      userId: "u1",
    });
    prisma.membership.findFirst.mockResolvedValue(null);
    prisma.invitation.findFirst.mockResolvedValue({ id: "inv_existing" });

    await expect(
      service.createInvite("org_1", "u1", "dup@acme.com", Role.AGENT),
    ).rejects.toEqual(
      new BadRequestException(
        "A pending invitation already exists for this email",
      ),
    );
  });

  it("should create invite and return inviteLink", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_1",
      role: "OWNER",
      userId: "u1",
    });
    prisma.membership.findFirst.mockResolvedValue(null);
    prisma.invitation.findFirst.mockResolvedValue(null);
    prisma.invitation.create.mockResolvedValue({ id: "inv_1" });
    prisma.auditLog.create.mockResolvedValue({});

    const result = await service.createInvite(
      "org_1",
      "u1",
      "new@acme.com",
      Role.AGENT,
    );

    expect(result.inviteId).toBe("inv_1");
    expect(result.inviteLink).toContain("/invite?token=");
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("should allow activation invite for an existing member without a password hash", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_1",
      role: "OWNER",
      userId: "u1",
    });
    prisma.membership.findFirst.mockResolvedValue({
      role: "OWNER",
      user: { passwordHash: null },
    });
    prisma.invitation.findFirst.mockResolvedValue(null);
    prisma.invitation.create.mockResolvedValue({ id: "inv_legacy" });
    prisma.auditLog.create.mockResolvedValue({});

    await service.createInvite("org_1", "u1", "legacy@acme.com", Role.AGENT);

    expect(prisma.invitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "legacy@acme.com",
          role: Role.OWNER,
        }),
      }),
    );
  });

  // ── acceptInvite ────────────────────────────────────────

  it("should reject invalid invitation token", async () => {
    prisma.invitation.findUnique.mockResolvedValue(null);

    await expect(
      service.acceptInvite("a".repeat(64)),
    ).rejects.toEqual(new BadRequestException("Invalid invitation token"));
  });

  it("should reject already accepted invitation", async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: "inv_1",
      email: "new@acme.com",
      role: "AGENT",
      expiresAt: new Date("2099-01-01"),
      acceptedAt: new Date(),
      revokedAt: null,
      organizationId: "org_1",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });

    await expect(
      service.acceptInvite("a".repeat(64)),
    ).rejects.toEqual(
      new BadRequestException("Invitation has already been accepted"),
    );
  });

  it("should reject revoked invitation token", async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: "inv_1",
      email: "new@acme.com",
      role: "AGENT",
      expiresAt: new Date("2099-01-01"),
      acceptedAt: null,
      revokedAt: new Date(),
      organizationId: "org_1",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });

    await expect(
      service.acceptInvite("a".repeat(64)),
    ).rejects.toEqual(
      new BadRequestException("Invitation has been revoked"),
    );
  });

  it("should reject expired invitation token", async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: "inv_1",
      email: "new@acme.com",
      role: "AGENT",
      expiresAt: new Date("2020-01-01"),
      acceptedAt: null,
      revokedAt: null,
      organizationId: "org_1",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });

    await expect(
      service.acceptInvite("a".repeat(64)),
    ).rejects.toEqual(new BadRequestException("Invitation has expired"));
  });

  it("should require name and password for new users", async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: "inv_1",
      email: "new@acme.com",
      role: "AGENT",
      expiresAt: new Date("2099-01-01"),
      acceptedAt: null,
      revokedAt: null,
      organizationId: "org_1",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.acceptInvite("a".repeat(64)),
    ).rejects.toMatchObject({
      response: {
        message: "name and password are required for new users",
        code: "INVITE_NEW_USER_REQUIRED",
      },
    });
  });

  it("should create new user and membership on accept", async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: "inv_1",
      email: "new@acme.com",
      role: "AGENT",
      expiresAt: new Date("2099-01-01"),
      acceptedAt: null,
      revokedAt: null,
      organizationId: "org_1",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: "new_user_1",
      name: "New User",
      email: "new@acme.com",
    });
    prisma.auditLog.create.mockResolvedValue({});
    sessionService.createSessionCookie.mockReturnValue("ui_session=...");

    const result = await service.acceptInvite(
      "a".repeat(64),
      {
        name: "New User",
        password: "securePassword123",
      },
    );

    expect(result.user.email).toBe("new@acme.com");
    expect(result.user.name).toBe("New User");
    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.user.create.mock.calls[0][0].data.passwordHash).not.toBe(
      "securePassword123",
    );
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(sessionService.createSessionCookie).toHaveBeenCalled();
    expect(result.sessionCookie).toBe("ui_session=...");
  });

  it("should require password verification before accepting an invite for an existing user", async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: "inv_1",
      email: "existing@acme.com",
      role: "AGENT",
      expiresAt: new Date("2099-01-01"),
      acceptedAt: null,
      revokedAt: null,
      organizationId: "org_1",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "usr_1",
      name: "Existing User",
      email: "existing@acme.com",
      passwordHash: "hashed-password",
    });

    await expect(service.acceptInvite("b".repeat(64))).rejects.toMatchObject({
      response: {
        code: "INVITE_EXISTING_USER_PASSWORD_REQUIRED",
        message: "Enter your password to accept this invitation",
      },
    });
  });

  it("should require activation before accepting an invite for a legacy null-password user", async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: "inv_1",
      email: "legacy@acme.com",
      role: "AGENT",
      expiresAt: new Date("2099-01-01"),
      acceptedAt: null,
      revokedAt: null,
      organizationId: "org_1",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "usr_legacy",
      name: "Legacy User",
      email: "legacy@acme.com",
      passwordHash: null,
    });

    await expect(service.acceptInvite("e".repeat(64))).rejects.toMatchObject({
      response: {
        code: "INVITE_ACCOUNT_ACTIVATION_REQUIRED",
        message: "Set a password to activate this invited account",
      },
    });
  });

  it("should activate a legacy null-password user while accepting invite", async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: "inv_1",
      email: "legacy@acme.com",
      role: "AGENT",
      expiresAt: new Date("2099-01-01"),
      acceptedAt: null,
      revokedAt: null,
      organizationId: "org_1",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "usr_legacy",
      name: "Legacy User",
      email: "legacy@acme.com",
      passwordHash: null,
    });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.auditLog.create.mockResolvedValue({});
    sessionService.createSessionCookie.mockReturnValue("ui_session=...");

    const result = await service.acceptInvite("f".repeat(64), {
      password: "LegacyPass123!",
    });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "usr_legacy",
        passwordHash: null,
      },
      data: {
        passwordHash: expect.any(String),
      },
    });
    expect(prisma.user.updateMany.mock.calls[0][0].data.passwordHash).not.toBe(
      "LegacyPass123!",
    );
    expect(result.user.email).toBe("legacy@acme.com");
    expect(prisma.membership.upsert).toHaveBeenCalled();
  });

  it("should accept invite for an authenticated user with the same email", async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: "inv_1",
      email: "existing@acme.com",
      role: "AGENT",
      expiresAt: new Date("2099-01-01"),
      acceptedAt: null,
      revokedAt: null,
      organizationId: "org_1",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });
    prisma.membership.findUnique.mockResolvedValue({
      user: {
        id: "usr_1",
        name: "Existing User",
        email: "existing@acme.com",
      },
    });
    prisma.auditLog.create.mockResolvedValue({});
    sessionService.createSessionCookie.mockReturnValue("ui_session=...");

    const result = await service.acceptInvite("b".repeat(64), {
      currentSession: {
        userId: "usr_1",
        organizationId: "org_current",
        iat: 1,
        exp: 2,
      },
    });

    expect(result.user.email).toBe("existing@acme.com");
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("should accept invite for an existing zero-membership user after password verification", async () => {
    const passwordHash = await bcrypt.hash("ExistingPass123!", 4);
    prisma.invitation.findUnique.mockResolvedValue({
      id: "inv_1",
      email: "existing@acme.com",
      role: "AGENT",
      expiresAt: new Date("2099-01-01"),
      acceptedAt: null,
      revokedAt: null,
      organizationId: "org_2",
      organization: { id: "org_2", name: "Beta", slug: "beta" },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "usr_1",
      name: "Existing User",
      email: "existing@acme.com",
      passwordHash,
    });
    prisma.auditLog.create.mockResolvedValue({});
    sessionService.createSessionCookie.mockReturnValue("ui_session=beta");

    const result = await service.acceptInvite("g".repeat(64), {
      password: "ExistingPass123!",
    });

    expect(result.organization.id).toBe("org_2");
    expect(result.user.email).toBe("existing@acme.com");
    expect(prisma.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_userId: {
            organizationId: "org_2",
            userId: "usr_1",
          },
        },
      }),
    );
  });

  it("should reject invite acceptance when the authenticated email does not match", async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: "inv_1",
      email: "existing@acme.com",
      role: "AGENT",
      expiresAt: new Date("2099-01-01"),
      acceptedAt: null,
      revokedAt: null,
      organizationId: "org_1",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });
    prisma.membership.findUnique.mockResolvedValue({
      user: {
        id: "usr_2",
        name: "Other User",
        email: "other@acme.com",
      },
    });

    await expect(
      service.acceptInvite("c".repeat(64), {
        currentSession: {
          userId: "usr_2",
          organizationId: "org_current",
          iat: 1,
          exp: 2,
        },
      }),
    ).rejects.toMatchObject({
      response: {
        code: "INVITE_EMAIL_MISMATCH",
        message: "The authenticated user does not match this invitation email",
      },
    });
  });

  it("should reject invite acceptance when the supplied session is no longer valid", async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: "inv_1",
      email: "existing@acme.com",
      role: "AGENT",
      expiresAt: new Date("2099-01-01"),
      acceptedAt: null,
      revokedAt: null,
      organizationId: "org_1",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });
    prisma.membership.findUnique.mockResolvedValue(null);

    await expect(
      service.acceptInvite("d".repeat(64), {
        currentSession: {
          userId: "usr_1",
          organizationId: "org_current",
          iat: 1,
          exp: 2,
        },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // ── revokeInvite ────────────────────────────────────────

  it("should revoke a pending invitation", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_1",
      role: "OWNER",
      userId: "u1",
    });
    prisma.invitation.findFirst.mockResolvedValue({
      id: "inv_1",
      email: "pending@acme.com",
    });
    prisma.invitation.update.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});

    await service.revokeInvite("org_1", "u1", "inv_1");

    expect(prisma.invitation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv_1" },
        data: { revokedAt: expect.any(Date) },
      }),
    );
  });

  it("should return 404 for non-existent invitation", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_1",
      role: "OWNER",
      userId: "u1",
    });
    prisma.invitation.findFirst.mockResolvedValue(null);

    await expect(
      service.revokeInvite("org_1", "u1", "inv_nonexistent"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── updateMemberRole ────────────────────────────────────

  it("should reject role change by non-owner", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_1",
      role: "AGENT",
      userId: "u1",
    });

    await expect(
      service.updateMemberRole("org_1", "u1", "mem_2", Role.OWNER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("should reject downgrading the last owner", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_1",
      role: "OWNER",
      userId: "u1",
    });
    prisma.membership.findFirst.mockResolvedValue({
      id: "mem_target",
      role: "OWNER",
      userId: "u_target",
    });
    prisma.membership.count.mockResolvedValue(1);

    await expect(
      service.updateMemberRole("org_1", "u1", "mem_target", Role.AGENT),
    ).rejects.toEqual(
      new BadRequestException("Cannot downgrade the last owner"),
    );
  });

  it("should update member role successfully", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_1",
      role: "OWNER",
      userId: "u1",
    });
    prisma.membership.findFirst.mockResolvedValue({
      id: "mem_target",
      role: "AGENT",
      userId: "u_target",
    });
    prisma.membership.update.mockResolvedValue({
      id: "mem_target",
      role: "OWNER",
      user: { id: "u_target", name: "Target", email: "target@acme.com" },
    });
    prisma.auditLog.create.mockResolvedValue({});

    const result = await service.updateMemberRole(
      "org_1",
      "u1",
      "mem_target",
      Role.OWNER,
    );

    expect(result.role).toBe("OWNER");
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  // ── removeMember ────────────────────────────────────────

  it("should reject self-removal", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_1",
      role: "OWNER",
      userId: "u1",
    });
    prisma.membership.findFirst.mockResolvedValue({
      id: "mem_1",
      role: "OWNER",
      userId: "u1",
    });

    await expect(
      service.removeMember("org_1", "u1", "mem_1"),
    ).rejects.toEqual(new BadRequestException("Cannot remove yourself"));
  });

  it("should reject removing the last owner", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_actor",
      role: "OWNER",
      userId: "u_actor",
    });
    prisma.membership.findFirst.mockResolvedValue({
      id: "mem_target",
      role: "OWNER",
      userId: "u_target",
    });
    prisma.membership.count.mockResolvedValue(1);

    await expect(
      service.removeMember("org_1", "u_actor", "mem_target"),
    ).rejects.toEqual(
      new BadRequestException("Cannot remove the last owner"),
    );
  });

  it("should unassign conversations and remove member", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_actor",
      role: "OWNER",
      userId: "u_actor",
    });
    prisma.membership.findFirst.mockResolvedValue({
      id: "mem_target",
      role: "AGENT",
      userId: "u_target",
    });
    prisma.conversation.updateMany.mockResolvedValue({ count: 2 });
    prisma.membership.delete.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});

    await service.removeMember("org_1", "u_actor", "mem_target");

    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org_1",
        assignedMembershipId: "mem_target",
      },
      data: { assignedMembershipId: null },
    });
    expect(prisma.membership.delete).toHaveBeenCalledWith({
      where: { id: "mem_target" },
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});
