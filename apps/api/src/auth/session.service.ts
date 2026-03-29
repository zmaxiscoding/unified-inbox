import { Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SessionPayload } from "./auth.types";
import { SESSION_TTL_SECONDS } from "./session.constants";

export const SESSION_COOKIE_NAME = "ui_session";

@Injectable()
export class SessionService {
  private readonly sessionSecret: string;

  constructor() {
    const secret = process.env.SESSION_SECRET?.trim();
    if (!secret) {
      throw new Error("SESSION_SECRET is required");
    }

    this.sessionSecret = secret;
  }

  createSessionCookie(payload: SessionPayload) {
    const value = this.signPayload(payload);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

    return `${SESSION_COOKIE_NAME}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
  }

  clearSessionCookie() {
    return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
  }

  parseCookie(cookieHeader?: string): SessionPayload | null {
    if (!cookieHeader) return null;

    const rawValue = cookieHeader
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`))
      ?.slice(`${SESSION_COOKIE_NAME}=`.length);

    if (!rawValue) return null;

    return this.verifyPayload(rawValue);
  }

  private signPayload(payload: SessionPayload) {
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url",
    );
    const signature = createHmac("sha256", this.sessionSecret)
      .update(encoded)
      .digest("base64url");

    return `${encoded}.${signature}`;
  }

  private verifyPayload(value: string): SessionPayload | null {
    const parts = value.split(".");
    if (parts.length !== 2) return null;

    const [encoded, signature] = parts;
    const expectedSignature = createHmac("sha256", this.sessionSecret)
      .update(encoded)
      .digest("base64url");

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) return null;
    if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

    try {
      const parsed = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8"),
      ) as Partial<SessionPayload>;

      if (!parsed.userId || !parsed.organizationId) return null;
      if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) {
        return null;
      }
      if (typeof parsed.iat !== "number" || !Number.isFinite(parsed.iat)) {
        return null;
      }

      const sessionVersion =
        parsed.sessionVersion === undefined ? 0 : parsed.sessionVersion;
      if (
        typeof sessionVersion !== "number" ||
        !Number.isInteger(sessionVersion) ||
        sessionVersion < 0
      ) {
        return null;
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      if (parsed.exp < nowSeconds) return null;

      return {
        userId: parsed.userId,
        organizationId: parsed.organizationId,
        sessionVersion,
        role: parsed.role,
        iat: parsed.iat,
        exp: parsed.exp,
      };
    } catch {
      return null;
    }
  }
}
