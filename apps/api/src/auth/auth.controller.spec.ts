import { ArgumentMetadata, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Response } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionPayload } from "./auth.types";
import { BootstrapOwnerDto } from "./dto/bootstrap-owner.dto";
import { EmailVerificationConfirmDto } from "./dto/email-verification-confirm.dto";
import { EmailVerificationRequestDto } from "./dto/email-verification-request.dto";
import { LoginDto } from "./dto/login.dto";
import { PasswordResetConfirmDto } from "./dto/password-reset-confirm.dto";
import { PasswordResetRequestDto } from "./dto/password-reset-request.dto";
import { RecoverOwnerDto } from "./dto/recover-owner.dto";
import { SessionAuthGuard } from "./session-auth.guard";
import { SessionService } from "./session.service";

describe("AuthController", () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    getBootstrapStatus: jest.Mock;
    bootstrapOwner: jest.Mock;
    recoverOwnerAccess: jest.Mock;
    requestPasswordReset: jest.Mock;
    confirmPasswordReset: jest.Mock;
    requestEmailVerification: jest.Mock;
    confirmEmailVerification: jest.Mock;
    getSessionDetails: jest.Mock;
  };
  let sessionService: {
    createSessionCookie: jest.Mock;
    clearSessionCookie: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      getBootstrapStatus: jest.fn(),
      bootstrapOwner: jest.fn(),
      recoverOwnerAccess: jest.fn(),
      requestPasswordReset: jest.fn(),
      confirmPasswordReset: jest.fn(),
      requestEmailVerification: jest.fn(),
      confirmEmailVerification: jest.fn(),
      getSessionDetails: jest.fn(),
    };
    sessionService = {
      createSessionCookie: jest.fn(),
      clearSessionCookie: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: SessionService, useValue: sessionService },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it("should set the session cookie after a successful login", async () => {
    authService.login.mockResolvedValue({
      requiresOrganizationSelection: false,
      user: { id: "u1", email: "agent@acme.com", name: "Agent" },
      organization: { id: "org_1", name: "Acme", slug: "acme" },
      session: {
        userId: "u1",
        organizationId: "org_1",
        sessionVersion: 0,
        iat: 1,
        exp: 2,
      },
    });
    sessionService.createSessionCookie.mockReturnValue("ui_session=signed");

    const res = { setHeader: jest.fn() } as unknown as Response;
    const result = await controller.login(
      { email: "agent@acme.com", password: "AgentPass123!" },
      res,
    );

    expect(res.setHeader).toHaveBeenCalledWith("Set-Cookie", "ui_session=signed");
    expect(result).toEqual({
      requiresOrganizationSelection: false,
      user: { id: "u1", email: "agent@acme.com", name: "Agent" },
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });
  });

  it("should not set a cookie when organization selection is required", async () => {
    authService.login.mockResolvedValue({
      requiresOrganizationSelection: true,
      user: { id: "u1", email: "agent@acme.com", name: "Agent" },
      organizations: [{ id: "org_1", name: "Acme", slug: "acme" }],
    });

    const res = { setHeader: jest.fn() } as unknown as Response;
    const result = await controller.login(
      { email: "agent@acme.com", password: "AgentPass123!" },
      res,
    );

    expect(res.setHeader).not.toHaveBeenCalled();
    expect(result.requiresOrganizationSelection).toBe(true);
  });

  it("should expose bootstrap status", async () => {
    authService.getBootstrapStatus.mockResolvedValue({ bootstrapEnabled: true });

    await expect(controller.getBootstrapStatus()).resolves.toEqual({
      bootstrapEnabled: true,
    });
  });

  it("should set the session cookie after bootstrap", async () => {
    authService.bootstrapOwner.mockResolvedValue({
      user: { id: "u1", email: "owner@acme.com", name: "Owner" },
      organization: { id: "org_1", name: "Acme", slug: "acme" },
      session: {
        userId: "u1",
        organizationId: "org_1",
        sessionVersion: 0,
        iat: 1,
        exp: 2,
      },
    });
    sessionService.createSessionCookie.mockReturnValue("ui_session=bootstrap");

    const res = { setHeader: jest.fn() } as unknown as Response;
    const result = await controller.bootstrap(
      {
        name: "Owner",
        email: "owner@acme.com",
        password: "OwnerPass123!",
        organizationName: "Acme",
      },
      res,
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      "ui_session=bootstrap",
    );
    expect(result.organization.slug).toBe("acme");
  });

  it("should clear the session cookie on logout", () => {
    sessionService.clearSessionCookie.mockReturnValue("ui_session=; Max-Age=0");

    const res = { setHeader: jest.fn() } as unknown as Response;
    const result = controller.logout(res);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      "ui_session=; Max-Age=0",
    );
    expect(result).toEqual({ ok: true });
  });

  it("should set the session cookie after owner recovery", async () => {
    authService.recoverOwnerAccess.mockResolvedValue({
      user: { id: "u1", email: "owner@acme.com", name: "Owner" },
      organization: { id: "org_1", name: "Acme", slug: "acme" },
      session: {
        userId: "u1",
        organizationId: "org_1",
        sessionVersion: 0,
        iat: 1,
        exp: 2,
      },
    });
    sessionService.createSessionCookie.mockReturnValue("ui_session=recovered");

    const res = { setHeader: jest.fn() } as unknown as Response;
    const result = await controller.recoverOwner(
      {
        organizationSlug: "acme",
        email: "owner@acme.com",
        password: "OwnerPass123!",
        recoverySecret: "top-secret",
      },
      res,
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      "ui_session=recovered",
    );
    expect(result.organization.slug).toBe("acme");
  });

  it("should return current session details", async () => {
    const session: SessionPayload = {
      userId: "u1",
      organizationId: "org_1",
      sessionVersion: 0,
      iat: 1,
      exp: 2,
    };
    authService.getSessionDetails.mockResolvedValue({
      user: {
        id: "u1",
        email: "agent@acme.com",
        name: "Agent",
        emailVerifiedAt: null,
      },
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });

    await expect(controller.session(session)).resolves.toEqual({
      user: {
        id: "u1",
        email: "agent@acme.com",
        name: "Agent",
        emailVerifiedAt: null,
      },
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });
  });

  it("should proxy password reset request to the service", async () => {
    authService.requestPasswordReset.mockResolvedValue({
      ok: true,
      deliveryMode: "outbox",
    });

    await expect(
      controller.requestPasswordReset({ email: "agent@acme.com" }),
    ).resolves.toEqual({ ok: true, deliveryMode: "outbox" });
    expect(authService.requestPasswordReset).toHaveBeenCalledWith({
      email: "agent@acme.com",
    });
  });

  it("should proxy password reset confirm to the service", async () => {
    authService.confirmPasswordReset.mockResolvedValue({ ok: true });

    await expect(
      controller.confirmPasswordReset({
        token: "reset-token",
        password: "NewPass123!",
      }),
    ).resolves.toEqual({ ok: true });
    expect(authService.confirmPasswordReset).toHaveBeenCalledWith({
      token: "reset-token",
      password: "NewPass123!",
    });
  });

  it("should proxy email verification request to the service", async () => {
    authService.requestEmailVerification.mockResolvedValue({
      ok: true,
      deliveryMode: "outbox",
    });

    await expect(
      controller.requestEmailVerification({ email: "agent@acme.com" }),
    ).resolves.toEqual({ ok: true, deliveryMode: "outbox" });
    expect(authService.requestEmailVerification).toHaveBeenCalledWith({
      email: "agent@acme.com",
    });
  });

  it("should proxy email verification confirm to the service", async () => {
    authService.confirmEmailVerification.mockResolvedValue({ ok: true });

    await expect(
      controller.confirmEmailVerification({ token: "verify-token" }),
    ).resolves.toEqual({ ok: true });
    expect(authService.confirmEmailVerification).toHaveBeenCalledWith({
      token: "verify-token",
    });
  });

  it("should reject login payloads without a password", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: LoginDto,
      data: "",
    };

    await expect(
      pipe.transform({ email: "agent@acme.com" }, metadata),
    ).rejects.toThrow();
  });

  it("should validate bootstrap payloads", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: BootstrapOwnerDto,
      data: "",
    };

    await expect(
      pipe.transform(
        {
          name: "Owner",
          email: "owner@acme.com",
          password: "OwnerPass123!",
          organizationName: "Acme Store",
        },
        metadata,
      ),
    ).resolves.toEqual({
      name: "Owner",
      email: "owner@acme.com",
      password: "OwnerPass123!",
      organizationName: "Acme Store",
    });
  });

  it("should validate owner recovery payloads", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: RecoverOwnerDto,
      data: "",
    };

    await expect(
      pipe.transform(
        {
          organizationSlug: "acme",
          email: "owner@acme.com",
          password: "OwnerPass123!",
          recoverySecret: "top-secret",
        },
        metadata,
      ),
    ).resolves.toEqual({
      organizationSlug: "acme",
      email: "owner@acme.com",
      password: "OwnerPass123!",
      recoverySecret: "top-secret",
    });
  });

  it("should validate password reset request payloads", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: PasswordResetRequestDto,
      data: "",
    };

    await expect(
      pipe.transform({ email: "agent@acme.com" }, metadata),
    ).resolves.toEqual({
      email: "agent@acme.com",
    });
  });

  it("should validate password reset confirm payloads", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: PasswordResetConfirmDto,
      data: "",
    };

    await expect(
      pipe.transform(
        {
          token: "reset-token",
          password: "NewPass123!",
        },
        metadata,
      ),
    ).resolves.toEqual({
      token: "reset-token",
      password: "NewPass123!",
    });
  });

  it("should validate email verification request payloads", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: EmailVerificationRequestDto,
      data: "",
    };

    await expect(
      pipe.transform({ email: "agent@acme.com" }, metadata),
    ).resolves.toEqual({
      email: "agent@acme.com",
    });
  });

  it("should validate email verification confirm payloads", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: EmailVerificationConfirmDto,
      data: "",
    };

    await expect(
      pipe.transform({ token: "verify-token" }, metadata),
    ).resolves.toEqual({
      token: "verify-token",
    });
  });
});
