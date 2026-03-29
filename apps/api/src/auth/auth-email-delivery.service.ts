import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type AuthEmailTransport = "outbox" | "disabled";

export type AuthEmailMessage = {
  kind: "password-reset" | "email-verification";
  to: string;
  subject: string;
  actionUrl: string;
  expiresAt: Date;
};

@Injectable()
export class AuthEmailDeliveryService {
  private readonly transport: AuthEmailTransport;
  private readonly outboxDir: string;

  constructor() {
    const configuredTransport = process.env.AUTH_EMAIL_TRANSPORT?.trim().toLowerCase();

    if (configuredTransport === "outbox" || configuredTransport === "disabled") {
      this.transport = configuredTransport;
    } else if (
      process.env.NODE_ENV === "production" ||
      process.env.NODE_ENV === "test"
    ) {
      this.transport = "disabled";
    } else {
      this.transport = "outbox";
    }

    const configuredOutboxDir = process.env.AUTH_EMAIL_OUTBOX_DIR?.trim();
    this.outboxDir = resolve(process.cwd(), configuredOutboxDir || ".auth-email-outbox");
  }

  isEnabled() {
    return this.transport === "outbox";
  }

  getMode() {
    return this.transport;
  }

  async send(message: AuthEmailMessage) {
    if (this.transport !== "outbox") {
      return { mode: "disabled" as const };
    }

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
          to: message.to,
          subject: message.subject,
          actionUrl: message.actionUrl,
          expiresAt: message.expiresAt.toISOString(),
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
