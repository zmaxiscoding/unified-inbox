import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuthEmailDeliveryError,
  AuthEmailDeliveryService,
  OutboxAuthEmailTransportAdapter,
  ResendAuthEmailTransportAdapter,
} from "./auth-email-delivery.service";

describe("AuthEmailDeliveryService", () => {
  const previousEnv = process.env;
  const createdDirs: string[] = [];

  beforeEach(() => {
    process.env = { ...previousEnv };
    delete process.env.AUTH_EMAIL_TRANSPORT;
    delete process.env.AUTH_EMAIL_FROM;
    delete process.env.AUTH_EMAIL_OUTBOX_DIR;
    delete process.env.RESEND_API_KEY;
    process.env.NODE_ENV = "development";
  });

  afterEach(async () => {
    process.env = previousEnv;

    await Promise.all(
      createdDirs.splice(0, createdDirs.length).map((dir) =>
        rm(dir, { recursive: true, force: true }),
      ),
    );
  });

  it("should default to outbox mode in development", () => {
    const service = new AuthEmailDeliveryService();

    expect(service.getMode()).toBe("outbox");
    expect(service.isEnabled()).toBe(true);
  });

  it("should default to disabled mode in test", () => {
    process.env.NODE_ENV = "test";

    const service = new AuthEmailDeliveryService();

    expect(service.getMode()).toBe("disabled");
    expect(service.isEnabled()).toBe(false);
  });

  it("should write rendered previews to the configured outbox directory", async () => {
    const outboxDir = join(tmpdir(), `auth-email-outbox-${Date.now()}`);
    createdDirs.push(outboxDir);
    process.env.AUTH_EMAIL_TRANSPORT = "outbox";
    process.env.AUTH_EMAIL_OUTBOX_DIR = outboxDir;

    const service = new AuthEmailDeliveryService();
    const result = await service.send({
      kind: "password-reset",
      to: "agent@acme.com",
      subject: "Reset your Unified Inbox password",
      actionUrl: "http://localhost:3000/password-reset?token=abc",
      expiresAt: new Date("2026-03-29T12:00:00.000Z"),
      deliveryId: "prt_1",
    });

    expect(result).toMatchObject({
      mode: "outbox",
      filePath: expect.stringContaining(outboxDir),
    });

    if (result.mode !== "outbox") {
      throw new Error("Expected an outbox result");
    }

    const preview = JSON.parse(await readFile(result.filePath, "utf8")) as {
      from: string;
      deliveryId: string;
      text: string;
      html: string;
    };

    expect(preview.from).toBe("Unified Inbox <no-reply@localhost.test>");
    expect(preview.deliveryId).toBe("prt_1");
    expect(preview.text).toContain("Reset password");
    expect(preview.html).toContain("Reset your Unified Inbox password");
  });

  it("should fail fast when resend is enabled without required env vars", () => {
    process.env.AUTH_EMAIL_TRANSPORT = "resend";
    process.env.AUTH_EMAIL_FROM = "Unified Inbox <auth@example.com>";

    expect(() => new AuthEmailDeliveryService()).toThrow(
      "RESEND_API_KEY is required when AUTH_EMAIL_TRANSPORT=resend",
    );
  });

  it("should fail fast when login verification is enabled with disabled delivery", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_EMAIL_TRANSPORT = "disabled";
    process.env.AUTH_EMAIL_VERIFICATION_MODE = "login";

    expect(() => new AuthEmailDeliveryService()).toThrow(
      "AUTH_EMAIL_VERIFICATION_MODE=login requires AUTH_EMAIL_TRANSPORT=outbox or resend",
    );
  });
});

describe("OutboxAuthEmailTransportAdapter", () => {
  const createdDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      createdDirs.splice(0, createdDirs.length).map((dir) =>
        rm(dir, { recursive: true, force: true }),
      ),
    );
  });

  it("should persist the email payload for local preview", async () => {
    const outboxDir = join(tmpdir(), `auth-email-outbox-adapter-${Date.now()}`);
    createdDirs.push(outboxDir);
    const adapter = new OutboxAuthEmailTransportAdapter(outboxDir);

    const result = await adapter.send({
      kind: "email-verification",
      from: "Unified Inbox <auth@example.com>",
      to: "agent@acme.com",
      subject: "Verify your Unified Inbox email",
      actionUrl: "http://localhost:3000/email-verification?token=abc",
      expiresAt: new Date("2026-03-29T12:00:00.000Z"),
      deliveryId: "evt_1",
      text: "Verify email",
      html: "<p>Verify email</p>",
    });

    expect(result.mode).toBe("outbox");
    if (result.mode !== "outbox") {
      throw new Error("Expected an outbox result");
    }

    const preview = JSON.parse(await readFile(result.filePath, "utf8")) as {
      kind: string;
      from: string;
      text: string;
    };

    expect(preview.kind).toBe("email-verification");
    expect(preview.from).toBe("Unified Inbox <auth@example.com>");
    expect(preview.text).toBe("Verify email");
  });
});

describe("ResendAuthEmailTransportAdapter", () => {
  it("should send email through Resend with an idempotency key", async () => {
    const send = jest.fn().mockResolvedValue({
      data: { id: "email_123" },
      error: null,
      headers: null,
    });
    const adapter = new ResendAuthEmailTransportAdapter(
      {
        emails: { send },
      } as unknown as ConstructorParameters<typeof ResendAuthEmailTransportAdapter>[0],
    );

    const result = await adapter.send({
      kind: "password-reset",
      from: "Unified Inbox <auth@example.com>",
      to: "agent@acme.com",
      subject: "Reset your Unified Inbox password",
      actionUrl: "http://localhost:3000/password-reset?token=abc",
      expiresAt: new Date("2026-03-29T12:00:00.000Z"),
      deliveryId: "prt_1",
      text: "Reset password",
      html: "<p>Reset password</p>",
    });

    expect(send).toHaveBeenCalledWith(
      {
        from: "Unified Inbox <auth@example.com>",
        to: ["agent@acme.com"],
        subject: "Reset your Unified Inbox password",
        html: "<p>Reset password</p>",
        text: "Reset password",
        tags: [{ name: "flow", value: "auth_password_reset" }],
      },
      {
        idempotencyKey: "password-reset/prt_1",
      },
    );
    expect(result).toEqual({ mode: "resend", emailId: "email_123" });
  });

  it("should throw a delivery error when Resend returns an error response", async () => {
    const send = jest.fn().mockResolvedValue({
      data: null,
      error: {
        message: "validation failed",
        statusCode: 422,
        name: "validation_error",
      },
      headers: null,
    });
    const adapter = new ResendAuthEmailTransportAdapter(
      {
        emails: { send },
      } as unknown as ConstructorParameters<typeof ResendAuthEmailTransportAdapter>[0],
    );

    await expect(
      adapter.send({
        kind: "email-verification",
        from: "Unified Inbox <auth@example.com>",
        to: "agent@acme.com",
        subject: "Verify your Unified Inbox email",
        actionUrl: "http://localhost:3000/email-verification?token=abc",
        expiresAt: new Date("2026-03-29T12:00:00.000Z"),
        deliveryId: "evt_1",
        text: "Verify email",
        html: "<p>Verify email</p>",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "AuthEmailDeliveryError",
        mode: "resend",
      }),
    );
  });

  it("should throw a delivery error when Resend succeeds without an email id", async () => {
    const send = jest.fn().mockResolvedValue({
      data: {},
      error: null,
      headers: null,
    });
    const adapter = new ResendAuthEmailTransportAdapter(
      {
        emails: { send },
      } as unknown as ConstructorParameters<typeof ResendAuthEmailTransportAdapter>[0],
    );

    await expect(
      adapter.send({
        kind: "email-verification",
        from: "Unified Inbox <auth@example.com>",
        to: "agent@acme.com",
        subject: "Verify your Unified Inbox email",
        actionUrl: "http://localhost:3000/email-verification?token=abc",
        expiresAt: new Date("2026-03-29T12:00:00.000Z"),
        deliveryId: "evt_1",
        text: "Verify email",
        html: "<p>Verify email</p>",
      }),
    ).rejects.toBeInstanceOf(AuthEmailDeliveryError);
  });
});
