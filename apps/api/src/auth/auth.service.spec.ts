import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  AuthEmailDeliveryError,
  AuthEmailDeliveryService,
} from "./auth-email-delivery.service";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    passwordResetToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    emailVerificationToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    membership: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
    };
    organization: { create: jest.Mock; count: jest.Mock };
    auditLog: { create: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let emailDelivery: {
    getMode: jest.Mock;
    send: jest.Mock;
  };

  beforeEach(() => {
    delete process.env.AUTH_EMAIL_VERIFICATION_MODE;

    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      passwordResetToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      emailVerificationToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      membership: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
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

    emailDelivery = {
      getMode: jest.fn().mockReturnValue("outbox"),
      send: jest.fn().mockResolvedValue({ mode: "outbox", filePath: "/tmp/email.json" }),
    };

    prisma.$queryRaw.mockResolvedValue([]);
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.passwordResetToken.create.mockResolvedValue({ id: "prt_1" });
    prisma.emailVerificationToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.emailVerificationToken.create.mockResolvedValue({ id: "evt_1" });
    prisma.user.update.mockResolvedValue({});
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    service = new AuthService(
      prisma as unknown as PrismaService,
      emailDelivery as unknown as AuthEmailDeliveryService,
    );
  });

  it("should log in with a valid password and single organization", async () => {
    const passwordHash = await bcrypt.hash("AgentPass123!", 4);
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      name: "Agent",
      passwordHash,
      sessionVersion: 0,
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
      expect(result.session.sessionVersion).toBe(0);
    }
  });

  it("should reject login when password is incorrect", async () => {
    const passwordHash = await bcrypt.hash("AgentPass123!", 4);
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      name: "Agent",
      passwordHash,
      sessionVersion: 0,
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
      sessionVersion: 0,
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
      sessionVersion: 0,
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
      sessionVersion: 0,
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

  it("should block login for unverified users when verification mode is login", async () => {
    const previousMode = process.env.AUTH_EMAIL_VERIFICATION_MODE;
    process.env.AUTH_EMAIL_VERIFICATION_MODE = "login";

    const passwordHash = await bcrypt.hash("AgentPass123!", 4);
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      name: "Agent",
      passwordHash,
      emailVerifiedAt: null,
      sessionVersion: 0,
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
        code: "AUTH_EMAIL_VERIFICATION_REQUIRED",
        message:
          "Email verification is required before you can sign in. Request a new verification link and try again.",
      },
    });

    process.env.AUTH_EMAIL_VERIFICATION_MODE = previousMode;
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
      sessionVersion: 0,
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
    expect(result.session.sessionVersion).toBe(0);
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

  it("should recover a legacy owner when no password-backed owner exists", async () => {
    const previousSecret = process.env.AUTH_RECOVERY_SECRET;
    process.env.AUTH_RECOVERY_SECRET = "top-secret";

    prisma.membership.findFirst.mockResolvedValue({
      organizationId: "org_1",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
      user: {
        id: "u1",
        email: "owner@acme.com",
        name: "Owner",
        passwordHash: null,
        sessionVersion: 0,
      },
    });
    prisma.membership.count.mockResolvedValue(0);
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "owner@acme.com",
      name: "Owner",
      passwordHash: "stored-hash",
      sessionVersion: 1,
    });
    prisma.auditLog.create.mockResolvedValue({});

    const result = await service.recoverOwnerAccess({
      organizationSlug: "acme",
      email: "owner@acme.com",
      password: "OwnerPass123!",
      recoverySecret: "top-secret",
    });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "u1",
        passwordHash: null,
      },
      data: {
        passwordHash: expect.any(String),
        sessionVersion: { increment: 1 },
      },
    });
    expect(result.organization.slug).toBe("acme");
    expect(result.session.organizationId).toBe("org_1");
    expect(result.session.sessionVersion).toBe(1);

    process.env.AUTH_RECOVERY_SECRET = previousSecret;
  });

  it("should reject owner recovery when the secret is invalid", async () => {
    const previousSecret = process.env.AUTH_RECOVERY_SECRET;
    process.env.AUTH_RECOVERY_SECRET = "top-secret";

    await expect(
      service.recoverOwnerAccess({
        organizationSlug: "acme",
        email: "owner@acme.com",
        password: "OwnerPass123!",
        recoverySecret: "wrong-secret",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    process.env.AUTH_RECOVERY_SECRET = previousSecret;
  });

  it("should reject owner recovery when a password-backed owner already exists", async () => {
    const previousSecret = process.env.AUTH_RECOVERY_SECRET;
    process.env.AUTH_RECOVERY_SECRET = "top-secret";

    prisma.membership.findFirst.mockResolvedValue({
      organizationId: "org_1",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
      user: {
        id: "u1",
        email: "owner@acme.com",
        name: "Owner",
        passwordHash: null,
        sessionVersion: 0,
      },
    });
    prisma.membership.count.mockResolvedValue(1);

    await expect(
      service.recoverOwnerAccess({
        organizationSlug: "acme",
        email: "owner@acme.com",
        password: "OwnerPass123!",
        recoverySecret: "top-secret",
      }),
    ).rejects.toMatchObject({
      response: {
        message:
          "Owner recovery is only available when the organization has no password-backed owners.",
      },
    });

    process.env.AUTH_RECOVERY_SECRET = previousSecret;
  });

  it("should reject owner recovery when the target legacy owner does not exist", async () => {
    const previousSecret = process.env.AUTH_RECOVERY_SECRET;
    process.env.AUTH_RECOVERY_SECRET = "top-secret";
    prisma.membership.findFirst.mockResolvedValue(null);

    await expect(
      service.recoverOwnerAccess({
        organizationSlug: "acme",
        email: "owner@acme.com",
        password: "OwnerPass123!",
        recoverySecret: "top-secret",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    process.env.AUTH_RECOVERY_SECRET = previousSecret;
  });

  it("should return the same generic response for missing password reset emails", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.requestPasswordReset({ email: "missing@acme.com" }),
    ).resolves.toEqual({
      ok: true,
      deliveryMode: "outbox",
      requestState: "accepted",
    });

    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(emailDelivery.send).not.toHaveBeenCalled();
  });

  it("should ignore password reset requests for legacy null-password users", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "legacy@acme.com",
      passwordHash: null,
    });

    await expect(
      service.requestPasswordReset({ email: "legacy@acme.com" }),
    ).resolves.toEqual({
      ok: true,
      deliveryMode: "outbox",
      requestState: "accepted",
    });

    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(emailDelivery.send).not.toHaveBeenCalled();
  });

  it("should create, hash, and deliver a password reset token", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      passwordHash: "hashed-password",
    });

    await expect(
      service.requestPasswordReset({ email: "agent@acme.com" }),
    ).resolves.toEqual({
      ok: true,
      deliveryMode: "outbox",
      requestState: "accepted",
    });

    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        usedAt: null,
        invalidatedAt: null,
      },
      data: {
        invalidatedAt: expect.any(Date),
      },
    });
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      },
      select: {
        id: true,
      },
    });
    expect(prisma.passwordResetToken.create.mock.calls[0][0].data.tokenHash).toHaveLength(
      64,
    );
    expect(emailDelivery.send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "password-reset",
        to: "agent@acme.com",
        subject: "Reset your Unified Inbox password",
        actionUrl: expect.stringContaining("/password-reset?token="),
        deliveryId: expect.any(String),
      }),
    );
  });

  it("should invalidate the fresh password reset token if delivery fails", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      passwordHash: "hashed-password",
    });
    emailDelivery.send.mockRejectedValue(new Error("outbox unavailable"));

    await expect(
      service.requestPasswordReset({ email: "agent@acme.com" }),
    ).resolves.toEqual({
      ok: true,
      deliveryMode: "outbox",
      requestState: "accepted",
    });

    expect(prisma.passwordResetToken.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          tokenHash: expect.any(String),
        }),
        data: {
          invalidatedAt: expect.any(Date),
        },
      }),
    );
  });

  it("should no-op password reset requests when delivery is disabled", async () => {
    emailDelivery.getMode.mockReturnValue("disabled");

    await expect(
      service.requestPasswordReset({ email: "agent@acme.com" }),
    ).resolves.toEqual({
      ok: true,
      deliveryMode: "disabled",
      requestState: "disabled",
    });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(emailDelivery.send).not.toHaveBeenCalled();
  });

  it("should reset the password and consume the token atomically", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "prt_1",
      userId: "u1",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      invalidatedAt: null,
    });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.confirmPasswordReset({
        token: "reset-token",
        password: "NewPass123!",
      }),
    ).resolves.toEqual({ ok: true });

    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: "prt_1",
        usedAt: null,
        invalidatedAt: null,
        expiresAt: {
          gt: expect.any(Date),
        },
      },
      data: {
        usedAt: expect.any(Date),
      },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: {
        passwordHash: expect.any(String),
        sessionVersion: { increment: 1 },
      },
    });
    expect(prisma.user.update.mock.calls[0][0].data.passwordHash).not.toBe(
      "NewPass123!",
    );
  });

  it("should reject invalid password reset tokens without hashing the password", async () => {
    const hashSpy = jest.spyOn(bcrypt, "hash");
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);

    try {
      await expect(
        service.confirmPasswordReset({
          token: "missing-token",
          password: "NewPass123!",
        }),
      ).rejects.toMatchObject({
        response: {
          message: "Invalid password reset token",
        },
      });

      expect(hashSpy).not.toHaveBeenCalled();
    } finally {
      hashSpy.mockRestore();
    }
  });

  it("should reject expired password reset tokens", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "prt_1",
      userId: "u1",
      expiresAt: new Date(Date.now() - 1_000),
      usedAt: null,
      invalidatedAt: null,
    });

    await expect(
      service.confirmPasswordReset({
        token: "reset-token",
        password: "NewPass123!",
      }),
    ).rejects.toMatchObject({
      response: {
        message: "Password reset link has expired",
      },
    });
  });

  it("should reject reused password reset tokens", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "prt_1",
      userId: "u1",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
      invalidatedAt: null,
    });

    await expect(
      service.confirmPasswordReset({
        token: "reset-token",
        password: "NewPass123!",
      }),
    ).rejects.toMatchObject({
      response: {
        message: "Password reset link has already been used",
      },
    });
  });

  it("should return the same generic response for missing email verification emails", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.requestEmailVerification({ email: "missing@acme.com" }),
    ).resolves.toEqual({
      ok: true,
      deliveryMode: "outbox",
      requestState: "accepted",
    });

    expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    expect(emailDelivery.send).not.toHaveBeenCalled();
  });

  it("should no-op email verification requests for already verified users", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      emailVerifiedAt: new Date(),
    });

    await expect(
      service.requestEmailVerification({ email: "agent@acme.com" }),
    ).resolves.toEqual({
      ok: true,
      deliveryMode: "outbox",
      requestState: "accepted",
    });

    expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    expect(emailDelivery.send).not.toHaveBeenCalled();
  });

  it("should create and deliver an email verification token", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      emailVerifiedAt: null,
    });

    await expect(
      service.requestEmailVerification({ email: "agent@acme.com" }),
    ).resolves.toEqual({
      ok: true,
      deliveryMode: "outbox",
      requestState: "accepted",
    });

    expect(prisma.emailVerificationToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        usedAt: null,
        invalidatedAt: null,
      },
      data: {
        invalidatedAt: expect.any(Date),
      },
    });
    expect(prisma.emailVerificationToken.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      },
      select: {
        id: true,
      },
    });
    expect(emailDelivery.send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "email-verification",
        to: "agent@acme.com",
        subject: "Verify your Unified Inbox email",
        actionUrl: expect.stringContaining("/email-verification?token="),
        deliveryId: expect.any(String),
      }),
    );
  });

  it("should invalidate the fresh email verification token if delivery fails", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "agent@acme.com",
      emailVerifiedAt: null,
    });
    emailDelivery.send.mockRejectedValue(new Error("resend unavailable"));

    await expect(
      service.requestEmailVerification({ email: "agent@acme.com" }),
    ).resolves.toEqual({
      ok: true,
      deliveryMode: "outbox",
      requestState: "accepted",
    });

    expect(prisma.emailVerificationToken.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          tokenHash: expect.any(String),
        }),
        data: {
          invalidatedAt: expect.any(Date),
        },
      }),
    );
  });

  it("should no-op email verification requests when delivery is disabled", async () => {
    emailDelivery.getMode.mockReturnValue("disabled");

    await expect(
      service.requestEmailVerification({ email: "agent@acme.com" }),
    ).resolves.toEqual({
      ok: true,
      deliveryMode: "disabled",
      requestState: "disabled",
    });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("should resend an email verification link for the authenticated user", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      role: Role.AGENT,
      user: {
        id: "u1",
        email: "agent@acme.com",
        name: "Agent",
        emailVerifiedAt: null,
        sessionVersion: 0,
      },
      organization: {
        id: "org_1",
        name: "Acme",
        slug: "acme",
      },
    });

    await expect(
      service.resendEmailVerification({
        userId: "u1",
        organizationId: "org_1",
        sessionVersion: 0,
        iat: 1,
        exp: 2,
      }),
    ).resolves.toEqual({
      ok: true,
      deliveryMode: "outbox",
      deliveryState: "sent",
    });

    expect(emailDelivery.send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "email-verification",
        to: "agent@acme.com",
      }),
    );
  });

  it("should report already verified when authenticated resend is unnecessary", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      role: Role.AGENT,
      user: {
        id: "u1",
        email: "agent@acme.com",
        name: "Agent",
        emailVerifiedAt: new Date(),
        sessionVersion: 0,
      },
      organization: {
        id: "org_1",
        name: "Acme",
        slug: "acme",
      },
    });

    await expect(
      service.resendEmailVerification({
        userId: "u1",
        organizationId: "org_1",
        sessionVersion: 0,
        iat: 1,
        exp: 2,
      }),
    ).resolves.toEqual({
      ok: true,
      deliveryMode: "outbox",
      deliveryState: "already-verified",
    });

    expect(emailDelivery.send).not.toHaveBeenCalled();
  });

  it("should fail authenticated resend when delivery fails", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      role: Role.AGENT,
      user: {
        id: "u1",
        email: "agent@acme.com",
        name: "Agent",
        emailVerifiedAt: null,
        sessionVersion: 0,
      },
      organization: {
        id: "org_1",
        name: "Acme",
        slug: "acme",
      },
    });
    emailDelivery.send.mockRejectedValue(new AuthEmailDeliveryError("failed", "outbox"));

    await expect(
      service.resendEmailVerification({
        userId: "u1",
        organizationId: "org_1",
        sessionVersion: 0,
        iat: 1,
        exp: 2,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("should keep authenticated resend as disabled when transport is disabled", async () => {
    emailDelivery.getMode.mockReturnValue("disabled");

    await expect(
      service.resendEmailVerification({
        userId: "u1",
        organizationId: "org_1",
        sessionVersion: 0,
        iat: 1,
        exp: 2,
      }),
    ).resolves.toEqual({
      ok: true,
      deliveryMode: "disabled",
      deliveryState: "disabled",
    });

    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it("should verify the email and consume the token atomically", async () => {
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: "evt_1",
      userId: "u1",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      invalidatedAt: null,
    });
    prisma.emailVerificationToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.confirmEmailVerification({ token: "verify-token" }),
    ).resolves.toEqual({ ok: true });

    expect(prisma.emailVerificationToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: "evt_1",
        usedAt: null,
        invalidatedAt: null,
        expiresAt: {
          gt: expect.any(Date),
        },
      },
      data: {
        usedAt: expect.any(Date),
      },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "u1",
        emailVerifiedAt: null,
      },
      data: {
        emailVerifiedAt: expect.any(Date),
      },
    });
  });

  it("should reject expired email verification tokens", async () => {
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: "evt_1",
      userId: "u1",
      expiresAt: new Date(Date.now() - 1_000),
      usedAt: null,
      invalidatedAt: null,
    });

    await expect(
      service.confirmEmailVerification({ token: "verify-token" }),
    ).rejects.toMatchObject({
      response: {
        message: "Email verification link has expired",
      },
    });
  });

  it("should reject reused email verification tokens", async () => {
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: "evt_1",
      userId: "u1",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
      invalidatedAt: null,
    });

    await expect(
      service.confirmEmailVerification({ token: "verify-token" }),
    ).rejects.toMatchObject({
      response: {
        message: "Email verification link has already been used",
      },
    });
  });

  it("should reject sessions when the session version no longer matches the user", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      role: Role.OWNER,
      user: {
        id: "u1",
        email: "agent@acme.com",
        name: "Agent",
        emailVerifiedAt: null,
        sessionVersion: 2,
      },
      organization: {
        id: "org_1",
        name: "Acme",
        slug: "acme",
      },
    });

    await expect(
      service.getSessionDetails({
        userId: "u1",
        organizationId: "org_1",
        sessionVersion: 1,
        iat: 1,
        exp: 2,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("should expose the current email verification mode in session details", async () => {
    const previousMode = process.env.AUTH_EMAIL_VERIFICATION_MODE;
    process.env.AUTH_EMAIL_VERIFICATION_MODE = "login";

    prisma.membership.findUnique.mockResolvedValue({
      role: Role.OWNER,
      user: {
        id: "u1",
        email: "agent@acme.com",
        name: "Agent",
        emailVerifiedAt: new Date(),
        sessionVersion: 1,
      },
      organization: {
        id: "org_1",
        name: "Acme",
        slug: "acme",
      },
    });

    await expect(
      service.getSessionDetails({
        userId: "u1",
        organizationId: "org_1",
        sessionVersion: 1,
        iat: 1,
        exp: 2,
      }),
    ).resolves.toEqual({
      role: Role.OWNER,
      emailVerificationMode: "login",
      user: {
        id: "u1",
        email: "agent@acme.com",
        name: "Agent",
        emailVerifiedAt: expect.any(Date),
      },
      organization: {
        id: "org_1",
        name: "Acme",
        slug: "acme",
      },
    });

    process.env.AUTH_EMAIL_VERIFICATION_MODE = previousMode;
  });
});
