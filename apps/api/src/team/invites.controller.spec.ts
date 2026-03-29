import {
  ArgumentMetadata,
  UnauthorizedException,
  ValidationPipe,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Role } from "@prisma/client";
import { Request, Response } from "express";
import { AuthService } from "../auth/auth.service";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { SessionService } from "../auth/session.service";
import { InvitesController } from "./invites.controller";
import { TeamService } from "./team.service";
import { CreateInviteDto } from "./dto/create-invite.dto";
import { AcceptInviteDto } from "./dto/accept-invite.dto";

describe("InvitesController", () => {
  let controller: InvitesController;
  let service: {
    createInvite: jest.Mock;
    acceptInvite: jest.Mock;
    revokeInvite: jest.Mock;
    getTeam: jest.Mock;
    updateMemberRole: jest.Mock;
    removeMember: jest.Mock;
  };
  let authService: { getSessionDetails: jest.Mock };
  let sessionService: {
    parseCookie: jest.Mock;
    clearSessionCookie: jest.Mock;
  };
  const session: SessionPayload = {
    userId: "user_1",
    organizationId: "org_1",
    iat: 1,
    exp: 2,
  };

  beforeEach(async () => {
    service = {
      createInvite: jest.fn(),
      acceptInvite: jest.fn(),
      revokeInvite: jest.fn(),
      getTeam: jest.fn(),
      updateMemberRole: jest.fn(),
      removeMember: jest.fn(),
    };
    authService = {
      getSessionDetails: jest.fn(),
    };
    sessionService = {
      parseCookie: jest.fn(),
      clearSessionCookie: jest.fn(() => "ui_session=; Max-Age=0"),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvitesController],
      providers: [
        { provide: TeamService, useValue: service },
        { provide: AuthService, useValue: authService },
        { provide: SessionService, useValue: sessionService },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InvitesController>(InvitesController);
  });

  it("should create invite via service", async () => {
    service.createInvite.mockResolvedValue({
      inviteId: "inv_1",
      inviteLink: "http://localhost:3000/invite?token=abc",
    });

    const result = await controller.createInvite(
      { email: "new@acme.com", role: Role.AGENT },
      session,
    );

    expect(result.inviteId).toBe("inv_1");
    expect(service.createInvite).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      "new@acme.com",
      "AGENT",
    );
  });

  it("should accept invite and set cookie", async () => {
    service.acceptInvite.mockResolvedValue({
      user: { id: "u1", name: "New", email: "new@acme.com" },
      organization: { id: "org_1", name: "Acme", slug: "acme" },
      sessionPayload: { userId: "u1", organizationId: "org_1", iat: 1, exp: 2 },
      sessionCookie: "ui_session=signed_value",
    });
    sessionService.parseCookie.mockReturnValue(null);

    const res = { setHeader: jest.fn() } as unknown as Response;
    const req = { headers: {} } as Request;
    const result = await controller.acceptInvite(
      { token: "a".repeat(64) },
      req,
      res,
    );

    expect(service.acceptInvite).toHaveBeenCalledWith("a".repeat(64), {
      currentSession: undefined,
      name: undefined,
      password: undefined,
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      "ui_session=signed_value",
    );
    expect(result.user.email).toBe("new@acme.com");
  });

  it("should pass the authenticated session to invite acceptance", async () => {
    service.acceptInvite.mockResolvedValue({
      user: { id: "u1", name: "Existing", email: "existing@acme.com" },
      organization: { id: "org_2", name: "Beta", slug: "beta" },
      sessionPayload: { userId: "u1", organizationId: "org_2", iat: 1, exp: 2 },
      sessionCookie: "ui_session=beta",
    });
    sessionService.parseCookie.mockReturnValue(session);
    authService.getSessionDetails.mockResolvedValue({
      user: { id: "u1", email: "existing@acme.com", name: "Existing" },
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    });

    const res = { setHeader: jest.fn() } as unknown as Response;
    const req = {
      headers: { cookie: "ui_session=signed" },
    } as unknown as Request;

    await controller.acceptInvite({ token: "b".repeat(64) }, req, res);

    expect(service.acceptInvite).toHaveBeenCalledWith("b".repeat(64), {
      currentSession: session,
      name: undefined,
      password: undefined,
    });
  });

  it("should clear stale cookies before handling invite acceptance", async () => {
    service.acceptInvite.mockResolvedValue({
      user: { id: "u1", name: "New", email: "new@acme.com" },
      organization: { id: "org_1", name: "Acme", slug: "acme" },
      sessionPayload: { userId: "u1", organizationId: "org_1", iat: 1, exp: 2 },
      sessionCookie: "ui_session=new_value",
    });
    sessionService.parseCookie.mockReturnValue(session);
    authService.getSessionDetails.mockRejectedValue(
      new UnauthorizedException("stale"),
    );

    const res = { setHeader: jest.fn() } as unknown as Response;
    const req = {
      headers: { cookie: "ui_session=stale" },
    } as unknown as Request;

    await controller.acceptInvite({ token: "c".repeat(64) }, req, res);

    expect(res.setHeader).toHaveBeenNthCalledWith(
      1,
      "Set-Cookie",
      "ui_session=; Max-Age=0",
    );
    expect(service.acceptInvite).toHaveBeenCalledWith("c".repeat(64), {
      currentSession: undefined,
      name: undefined,
      password: undefined,
    });
  });

  it("should revoke invite via service", async () => {
    service.revokeInvite.mockResolvedValue(undefined);

    await controller.revokeInvite("inv_1", session);

    expect(service.revokeInvite).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      "inv_1",
    );
  });

  // ── DTO validation tests ─────────────────────────────

  it("should reject invite with invalid email", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: CreateInviteDto,
      data: "",
    };

    await expect(
      pipe.transform({ email: "not-an-email", role: "AGENT" }, metadata),
    ).rejects.toThrow();
  });

  it("should reject invite with invalid role", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: CreateInviteDto,
      data: "",
    };

    await expect(
      pipe.transform({ email: "ok@acme.com", role: "INVALID" }, metadata),
    ).rejects.toThrow();
  });

  it("should reject accept with missing token", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: AcceptInviteDto,
      data: "",
    };

    await expect(pipe.transform({}, metadata)).rejects.toThrow();
  });

  it("should reject accept with unknown fields", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: AcceptInviteDto,
      data: "",
    };

    await expect(
      pipe.transform({ token: "abc", extra: "nope" }, metadata),
    ).rejects.toThrow();
  });

  it("should reject password shorter than 8 characters", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: AcceptInviteDto,
      data: "",
    };

    await expect(
      pipe.transform(
        { token: "abc", name: "Test", password: "short" },
        metadata,
      ),
    ).rejects.toThrow();
  });

  it("should accept valid invite payload", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: CreateInviteDto,
      data: "",
    };

    await expect(
      pipe.transform({ email: "ok@acme.com", role: "AGENT" }, metadata),
    ).resolves.toEqual({ email: "ok@acme.com", role: "AGENT" });
  });
});
