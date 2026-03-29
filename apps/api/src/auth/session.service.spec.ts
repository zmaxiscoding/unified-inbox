import { SessionService } from "./session.service";

describe("SessionService", () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService();
  });

  it("should reject expired session payload", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const cookie = service.createSessionCookie({
      userId: "u1",
      organizationId: "org_1",
      sessionVersion: 0,
      iat: nowSeconds - 20,
      exp: nowSeconds - 10,
    });

    expect(service.parseCookie(cookie)).toBeNull();
  });

  it("should accept valid session payload", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload = {
      userId: "u1",
      organizationId: "org_1",
      sessionVersion: 2,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    };
    const cookie = service.createSessionCookie(payload);

    expect(service.parseCookie(cookie)).toEqual(payload);
  });

  it("should default legacy cookies without sessionVersion to version 0", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const cookie = service.createSessionCookie({
      userId: "u1",
      organizationId: "org_1",
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    } as never);

    expect(service.parseCookie(cookie)).toEqual({
      userId: "u1",
      organizationId: "org_1",
      sessionVersion: 0,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    });
  });
});
