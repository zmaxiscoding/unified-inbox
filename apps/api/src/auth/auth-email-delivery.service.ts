import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Resend } from "resend";

export type AuthEmailTransportMode = "disabled" | "outbox" | "resend";
export type AuthEmailKind = "password-reset" | "email-verification";

export type AuthEmailMessage = {
  kind: AuthEmailKind;
  to: string;
  subject: string;
  actionUrl: string;
  expiresAt: Date;
  deliveryId: string;
};

type RenderedAuthEmailMessage = AuthEmailMessage & {
  from: string;
  html: string;
  text: string;
};

export type AuthEmailSendResult =
  | {
      mode: "disabled";
    }
  | {
      mode: "outbox";
      filePath: string;
    }
  | {
      mode: "resend";
      emailId: string;
    };

interface AuthEmailTransportAdapter {
  readonly mode: AuthEmailTransportMode;
  send(message: RenderedAuthEmailMessage): Promise<AuthEmailSendResult>;
}

const DEFAULT_DEV_AUTH_EMAIL_FROM = "Unified Inbox <no-reply@localhost.test>";
const RESEND_FLOW_TAG_PREFIX = "auth_";

export class AuthEmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly mode: Exclude<AuthEmailTransportMode, "disabled">,
  ) {
    super(message);
    this.name = "AuthEmailDeliveryError";
  }
}

class DisabledAuthEmailTransportAdapter implements AuthEmailTransportAdapter {
  readonly mode = "disabled" as const;

  async send() {
    return { mode: "disabled" as const };
  }
}

export class OutboxAuthEmailTransportAdapter implements AuthEmailTransportAdapter {
  readonly mode = "outbox" as const;

  constructor(private readonly outboxDir: string) {}

  async send(message: RenderedAuthEmailMessage) {
    await mkdir(this.outboxDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = resolve(
      this.outboxDir,
      `${timestamp}-${message.kind}-${randomUUID()}.json`,
    );

    await writeFile(
      filePath,
      JSON.stringify(
        {
          kind: message.kind,
          from: message.from,
          to: message.to,
          subject: message.subject,
          actionUrl: message.actionUrl,
          expiresAt: message.expiresAt.toISOString(),
          deliveryId: message.deliveryId,
          text: message.text,
          html: message.html,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );

    return {
      mode: "outbox" as const,
      filePath,
    };
  }
}

type ResendClient = Pick<Resend, "emails">;

export class ResendAuthEmailTransportAdapter implements AuthEmailTransportAdapter {
  readonly mode = "resend" as const;

  constructor(private readonly resend: ResendClient) {}

  async send(message: RenderedAuthEmailMessage) {
    const { data, error } = await this.resend.emails.send(
      {
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: [
          {
            name: "flow",
            value: `${RESEND_FLOW_TAG_PREFIX}${message.kind.replace(/-/g, "_")}`,
          },
        ],
      },
      {
        idempotencyKey: `${message.kind}/${message.deliveryId}`,
      },
    );

    if (error) {
      throw new AuthEmailDeliveryError("Resend email delivery failed", this.mode);
    }

    if (!data?.id) {
      throw new AuthEmailDeliveryError(
        "Resend email delivery did not return an id",
        this.mode,
      );
    }

    return {
      mode: "resend" as const,
      emailId: data.id,
    };
  }
}

@Injectable()
export class AuthEmailDeliveryService {
  private readonly transport: AuthEmailTransportMode;
  private readonly from: string;
  private readonly adapter: AuthEmailTransportAdapter;

  constructor() {
    this.transport = this.resolveTransportMode();
    this.assertVerificationModeCompatibility(this.transport);
    this.from = this.resolveFromAddress(this.transport);
    this.adapter = this.createAdapter(this.transport);
  }

  isEnabled() {
    return this.transport !== "disabled";
  }

  getMode() {
    return this.transport;
  }

  async send(message: AuthEmailMessage) {
    if (this.transport === "disabled") {
      return { mode: "disabled" as const };
    }

    return this.adapter.send(this.renderMessage(message));
  }

  private resolveTransportMode(): AuthEmailTransportMode {
    const configuredTransport = process.env.AUTH_EMAIL_TRANSPORT?.trim().toLowerCase();

    if (
      configuredTransport === "disabled" ||
      configuredTransport === "outbox" ||
      configuredTransport === "resend"
    ) {
      return configuredTransport;
    }

    if (configuredTransport) {
      throw new Error(
        "AUTH_EMAIL_TRANSPORT must be one of: disabled, outbox, resend",
      );
    }

    if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") {
      return "disabled";
    }

    return "outbox";
  }

  private resolveFromAddress(transport: AuthEmailTransportMode) {
    const configuredFrom = process.env.AUTH_EMAIL_FROM?.trim();

    if (configuredFrom) {
      return configuredFrom;
    }

    if (transport === "disabled") {
      return DEFAULT_DEV_AUTH_EMAIL_FROM;
    }

    if (transport === "outbox" && process.env.NODE_ENV !== "production") {
      return DEFAULT_DEV_AUTH_EMAIL_FROM;
    }

    throw new Error("AUTH_EMAIL_FROM is required when auth email delivery is enabled");
  }

  private assertVerificationModeCompatibility(transport: AuthEmailTransportMode) {
    const verificationMode = process.env.AUTH_EMAIL_VERIFICATION_MODE?.trim().toLowerCase();

    if (verificationMode === "login" && transport === "disabled") {
      throw new Error(
        "AUTH_EMAIL_VERIFICATION_MODE=login requires AUTH_EMAIL_TRANSPORT=outbox or resend",
      );
    }
  }

  private createAdapter(transport: AuthEmailTransportMode): AuthEmailTransportAdapter {
    if (transport === "disabled") {
      return new DisabledAuthEmailTransportAdapter();
    }

    if (transport === "outbox") {
      const configuredOutboxDir = process.env.AUTH_EMAIL_OUTBOX_DIR?.trim();
      const outboxDir = resolve(process.cwd(), configuredOutboxDir || ".auth-email-outbox");
      return new OutboxAuthEmailTransportAdapter(outboxDir);
    }

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is required when AUTH_EMAIL_TRANSPORT=resend");
    }

    return new ResendAuthEmailTransportAdapter(new Resend(resendApiKey));
  }

  private renderMessage(message: AuthEmailMessage): RenderedAuthEmailMessage {
    const title =
      message.kind === "password-reset"
        ? "Reset your Unified Inbox password"
        : "Verify your Unified Inbox email";
    const intro =
      message.kind === "password-reset"
        ? "We received a request to reset your Unified Inbox password."
        : "Please verify your Unified Inbox email address to keep your account ready for future rollouts.";
    const actionLabel =
      message.kind === "password-reset" ? "Reset password" : "Verify email";
    const ignoreCopy =
      message.kind === "password-reset"
        ? "If you did not request a password reset, you can ignore this email."
        : "If you did not request this verification email, you can ignore it.";
    const expiresAt = message.expiresAt.toISOString();

    const html = [
      "<!doctype html>",
      "<html>",
      "  <body style=\"margin:0;padding:24px;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif;\">",
      "    <div style=\"max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;\">",
      `      <p style=\"margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;\">Unified Inbox</p>`,
      `      <h1 style=\"margin:0 0 12px;font-size:24px;line-height:1.3;color:#0f172a;\">${title}</h1>`,
      `      <p style=\"margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;\">${intro}</p>`,
      `      <p style=\"margin:0 0 16px;\"><a href=\"${message.actionUrl}\" style=\"display:inline-block;border-radius:10px;background:#0f172a;color:#ffffff;padding:12px 16px;text-decoration:none;font-size:14px;font-weight:600;\">${actionLabel}</a></p>`,
      `      <p style=\"margin:0 0 8px;font-size:13px;line-height:1.6;color:#475569;\">This link expires at <strong>${expiresAt}</strong>.</p>`,
      `      <p style=\"margin:0 0 16px;font-size:13px;line-height:1.6;color:#475569;\">If the button does not work, copy and paste this URL into your browser:</p>`,
      `      <p style=\"margin:0 0 16px;font-size:13px;line-height:1.6;word-break:break-all;color:#0f172a;\">${message.actionUrl}</p>`,
      `      <p style=\"margin:0;font-size:13px;line-height:1.6;color:#64748b;\">${ignoreCopy}</p>`,
      "    </div>",
      "  </body>",
      "</html>",
    ].join("");

    const text = [
      "Unified Inbox",
      "",
      title,
      "",
      intro,
      "",
      `${actionLabel}: ${message.actionUrl}`,
      `Expires at: ${expiresAt}`,
      "",
      ignoreCopy,
    ].join("\n");

    return {
      ...message,
      from: this.from,
      html,
      text,
    };
  }
}
