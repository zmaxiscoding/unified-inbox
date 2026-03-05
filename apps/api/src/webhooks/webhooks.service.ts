import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { ChannelType, Prisma, WebhookProcessingStatus } from "@prisma/client";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  extractInstagramAccountId,
  extractInstagramProviderMessageId,
} from "./instagram-payload";
import {
  extractWhatsAppPhoneNumberId,
  extractWhatsAppProviderMessageId,
} from "./whatsapp-payload";
import { WebhooksQueueService } from "./webhooks.queue.service";

type HandleWebhookOptions = {
  xOrgIdHeader?: string;
  signatureHeader?: string;
  rawBody?: Buffer;
};

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: WebhooksQueueService,
  ) {}

  verifyWhatsAppWebhook(mode?: string, verifyToken?: string, challenge?: string) {
    const expectedVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

    if (
      mode !== "subscribe" ||
      !challenge ||
      !expectedVerifyToken ||
      verifyToken !== expectedVerifyToken
    ) {
      throw new ForbiddenException("WhatsApp webhook verification failed");
    }

    return challenge;
  }

  async handleWhatsAppWebhook(
    payload: unknown,
    options: HandleWebhookOptions = {},
  ) {
    this.assertValidSignature(options.signatureHeader, options.rawBody, "WHATSAPP_APP_SECRET", "WhatsApp");

    const phoneNumberId = extractWhatsAppPhoneNumberId(payload);
    if (!phoneNumberId) {
      throw new BadRequestException("phone_number_id is missing in payload");
    }

    const providerMessageId =
      extractWhatsAppProviderMessageId(payload) ??
      this.createFallbackProviderMessageId(payload);

    const organizationId = await this.resolveOrganizationId(
      ChannelType.WHATSAPP,
      phoneNumberId,
      options.xOrgIdHeader,
    );

    try {
      const rawWebhookEvent = await this.prisma.rawWebhookEvent.create({
        data: {
          provider: ChannelType.WHATSAPP,
          providerMessageId,
          externalAccountId: phoneNumberId,
          organizationId,
          payload: payload as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      await this.queue.enqueue(rawWebhookEvent.id);

      return { ok: true };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        await this.reenqueueIfPendingDuplicate(ChannelType.WHATSAPP, providerMessageId);
        return { ok: true, duplicate: true };
      }

      throw error;
    }
  }

  private async reenqueueIfPendingDuplicate(
    provider: ChannelType,
    providerMessageId: string,
  ) {
    const existingEvent = await this.prisma.rawWebhookEvent.findUnique({
      where: {
        provider_providerMessageId: {
          provider,
          providerMessageId,
        },
      },
      select: {
        id: true,
        processingStatus: true,
      },
    });

    if (!existingEvent || existingEvent.processingStatus !== WebhookProcessingStatus.PENDING) {
      return;
    }

    await this.queue.enqueue(existingEvent.id);
  }

  verifyInstagramWebhook(mode?: string, verifyToken?: string, challenge?: string) {
    const expectedVerifyToken = process.env.INSTAGRAM_VERIFY_TOKEN?.trim();

    if (
      mode !== "subscribe" ||
      !challenge ||
      !expectedVerifyToken ||
      verifyToken !== expectedVerifyToken
    ) {
      throw new ForbiddenException("Instagram webhook verification failed");
    }

    return challenge;
  }

  async handleInstagramWebhook(
    payload: unknown,
    options: HandleWebhookOptions = {},
  ) {
    this.assertValidSignature(options.signatureHeader, options.rawBody, "INSTAGRAM_APP_SECRET", "Instagram");

    const instagramAccountId = extractInstagramAccountId(payload);
    if (!instagramAccountId) {
      throw new BadRequestException("Instagram account ID is missing in payload");
    }

    const providerMessageId =
      extractInstagramProviderMessageId(payload) ??
      this.createFallbackProviderMessageId(payload);

    const organizationId = await this.resolveOrganizationId(
      ChannelType.INSTAGRAM,
      instagramAccountId,
      options.xOrgIdHeader,
    );

    try {
      const rawWebhookEvent = await this.prisma.rawWebhookEvent.create({
        data: {
          provider: ChannelType.INSTAGRAM,
          providerMessageId,
          externalAccountId: instagramAccountId,
          organizationId,
          payload: payload as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      await this.queue.enqueue(rawWebhookEvent.id);

      return { ok: true };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        await this.reenqueueIfPendingDuplicate(ChannelType.INSTAGRAM, providerMessageId);
        return { ok: true, duplicate: true };
      }

      throw error;
    }
  }

  private async resolveOrganizationId(
    provider: ChannelType,
    externalAccountId: string,
    xOrgIdHeader?: string,
  ) {
    const mappedAccount = await this.prisma.channelAccount.findFirst({
      where: {
        provider,
        externalAccountId,
      },
      select: { organizationId: true },
    });

    if (mappedAccount) {
      return mappedAccount.organizationId;
    }

    if (this.isDevEndpointsEnabled() && xOrgIdHeader?.trim()) {
      const organization = await this.prisma.organization.findUnique({
        where: { id: xOrgIdHeader.trim() },
        select: { id: true },
      });

      if (!organization) {
        throw new BadRequestException("X-ORG-ID organization not found");
      }

      return organization.id;
    }

    throw new BadRequestException(`Unmapped ${provider} account`);
  }

  private isUniqueConstraintError(error: unknown) {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return false;
    }

    return (error as { code?: string }).code === "P2002";
  }

  private createFallbackProviderMessageId(payload: unknown) {
    const payloadString = JSON.stringify(payload) ?? "undefined";
    const hash = createHash("sha256").update(payloadString).digest("hex");
    return `payload:${hash}`;
  }

  private assertValidSignature(
    signatureHeader: string | undefined,
    rawBody: Buffer | undefined,
    secretEnvKey: string,
    providerLabel: string,
  ) {
    if (this.isDevEndpointsEnabled()) {
      return;
    }

    if (!signatureHeader) {
      throw new ForbiddenException("Missing X-Hub-Signature-256 header");
    }

    if (!rawBody) {
      throw new ForbiddenException("Missing raw request body");
    }

    const expectedSecret = process.env[secretEnvKey]?.trim();
    if (!expectedSecret) {
      throw new ForbiddenException(`${providerLabel} app secret is not configured`);
    }

    const providedDigest = this.parseSignatureHeader(signatureHeader);
    if (!providedDigest) {
      throw new ForbiddenException("Invalid X-Hub-Signature-256 header");
    }

    const expectedDigest = createHmac("sha256", expectedSecret)
      .update(rawBody)
      .digest("hex");

    const providedBuffer = Buffer.from(providedDigest, "hex");
    const expectedBuffer = Buffer.from(expectedDigest, "hex");
    if (providedBuffer.length !== expectedBuffer.length) {
      throw new ForbiddenException("Invalid X-Hub-Signature-256 header");
    }

    if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
      throw new ForbiddenException("Invalid X-Hub-Signature-256 header");
    }
  }

  private parseSignatureHeader(signatureHeader: string): string | null {
    const match = /^sha256=([a-f0-9]{64})$/i.exec(signatureHeader.trim());
    return match?.[1].toLowerCase() ?? null;
  }

  private isDevEndpointsEnabled() {
    return process.env.ENABLE_DEV_ENDPOINTS === "true" && process.env.NODE_ENV !== "production";
  }
}
