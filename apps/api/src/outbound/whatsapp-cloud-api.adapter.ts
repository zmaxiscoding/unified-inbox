import { Injectable } from "@nestjs/common";
import { ChannelType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type SendWhatsAppTextInput = {
  organizationId: string;
  phoneNumberId: string;
  to: string;
  text: string;
};

type SendWhatsAppTextResult = {
  providerMessageId: string;
};

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class WhatsAppCloudApiAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async sendTextMessage(input: SendWhatsAppTextInput): Promise<SendWhatsAppTextResult> {
    const channelAccount = await this.prisma.channelAccount.findFirst({
      where: {
        organizationId: input.organizationId,
        provider: ChannelType.WHATSAPP,
        externalAccountId: input.phoneNumberId,
      },
      select: {
        accessToken: true,
      },
    });

    if (!channelAccount) {
      throw new Error("WhatsApp channel account not found for conversation");
    }

    const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v21.0";
    const endpoint = `https://graph.facebook.com/${apiVersion}/${input.phoneNumberId}/messages`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${channelAccount.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: "text",
        text: {
          body: input.text,
        },
      }),
    });

    const responseText = await response.text();
    const responseBody = this.parseJson(responseText);

    if (!response.ok) {
      throw new Error(this.toProviderError(response.status, responseBody));
    }

    const providerMessageId = this.extractProviderMessageId(responseBody);
    if (!providerMessageId) {
      throw new Error("WhatsApp send response is missing messages[0].id");
    }

    return { providerMessageId };
  }

  private parseJson(value: string): unknown {
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  private extractProviderMessageId(payload: unknown): string | null {
    if (!isPlainObject(payload)) {
      return null;
    }

    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    for (const message of messages) {
      if (!isPlainObject(message)) {
        continue;
      }

      const providerMessageId = readNonEmptyString(message.id);
      if (providerMessageId) {
        return providerMessageId;
      }
    }

    return null;
  }

  private toProviderError(statusCode: number, payload: unknown) {
    if (isPlainObject(payload) && isPlainObject(payload.error)) {
      const providerMessage = readNonEmptyString(payload.error.message);
      if (providerMessage) {
        return `WhatsApp API error (${statusCode}): ${providerMessage}`.slice(0, 500);
      }
    }

    return `WhatsApp API error (${statusCode})`;
  }
}
