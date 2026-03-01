import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { SessionAuthGuard } from "./session-auth.guard";
import { SessionService } from "./session.service";

describe("SessionAuthGuard", () => {
  let guard: SessionAuthGuard;
  let sessionService: {
    parseCookie: jest.Mock;
    clearSessionCookie: jest.Mock;
  };
  let authService: {
    getSessionDetails: jest.Mock;
  };

  beforeEach(() => {
    sessionService = {
      parseCookie: jest.fn(),
      clearSessionCookie: jest.fn(() => "ui_session=; Max-Age=0"),
    };
    authService = {
      getSessionDetails: jest.fn(),
    };
    guard = new SessionAuthGuard(
      sessionService as unknown as SessionService,
      authService as unknown as AuthService,
    );
  });

  it("should reject and clear cookie when membership is invalid", async () => {
    const request = { headers: { cookie: "ui_session=abc" } };
    const response = { setHeader: jest.fn() };

    sessionService.parseCookie.mockReturnValue({
      userId: "u1",
      organizationId: "org_1",
      iat: 1,
      exp: 2,
    });
    authService.getSessionDetails.mockRejectedValue(
      new UnauthorizedException("Invalid session"),
    );

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      "ui_session=; Max-Age=0",
    );
  });

  it("should reject and clear cookie when session is expired or invalid", async () => {
    const request = { headers: { cookie: "ui_session=abc" } };
    const response = { setHeader: jest.fn() };
    sessionService.parseCookie.mockReturnValue(null);

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      "ui_session=; Max-Age=0",
    );
  });

  it("should pass when cookie and membership are valid", async () => {
    const request: { headers: { cookie: string }; session?: unknown } = {
      headers: { cookie: "ui_session=abc" },
    };
    const response = { setHeader: jest.fn() };
    const parsedSession = {
      userId: "u1",
      organizationId: "org_1",
      iat: 1,
      exp: 2,
    };

    sessionService.parseCookie.mockReturnValue(parsedSession);
    authService.getSessionDetails.mockResolvedValue({
      role: "OWNER",
      user: { id: "u1" },
      organization: { id: "org_1" },
    });

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.session).toEqual({
      ...parsedSession,
      role: "OWNER",
    });
    expect(authService.getSessionDetails).toHaveBeenCalledWith(parsedSession);
  });
});
