import { Injectable } from "@nestjs/common";
import { ChannelType } from "@prisma/client";
import { CryptoService } from "../crypto/crypto.service";
import { PrismaService } from "../prisma/prisma.service";

type SendInstagramTextInput = {
  organizationId: string;
  instagramAccountId: string;
  recipientId: string;
  text: string;
};

type SendInstagramTextResult = {
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
export class InstagramGraphApiAdapter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async sendTextMessage(input: SendInstagramTextInput): Promise<SendInstagramTextResult> {
    const channelAccount = await this.prisma.channelAccount.findFirst({
      where: {
        organizationId: input.organizationId,
        provider: ChannelType.INSTAGRAM,
        externalAccountId: input.instagramAccountId,
      },
      select: {
        accessToken: true,
      },
    });

    if (!channelAccount) {
      throw new Error("Instagram channel account not found for conversation");
    }

    const apiVersion = process.env.INSTAGRAM_GRAPH_API_VERSION?.trim() || "v21.0";
    const endpoint = `https://graph.instagram.com/${apiVersion}/${input.instagramAccountId}/messages`;

    const decryptedToken = this.crypto.decrypt(channelAccount.accessToken);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${decryptedToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: {
          id: input.recipientId,
        },
        message: {
          text: input.text,
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
      throw new Error("Instagram send response is missing message_id");
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

    // Instagram Send API returns { message_id: "..." }
    const messageId = readNonEmptyString(payload.message_id);
    if (messageId) {
      return messageId;
    }

    return null;
  }

  private toProviderError(statusCode: number, payload: unknown) {
    if (isPlainObject(payload) && isPlainObject(payload.error)) {
      const providerMessage = readNonEmptyString(payload.error.message);
      if (providerMessage) {
        return `Instagram API error (${statusCode}): ${providerMessage}`.slice(0, 500);
      }
    }

    return `Instagram API error (${statusCode})`;
  }
}
