import { BadRequestException, Injectable } from "@nestjs/common";
import { ChannelType, Prisma, WebhookProcessingStatus } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  extractWhatsAppPhoneNumberId,
  extractWhatsAppProviderMessageId,
} from "./whatsapp-payload";
import { WebhooksQueueService } from "./webhooks.queue.service";

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: WebhooksQueueService,
  ) {}

  async handleWhatsAppWebhook(payload: unknown, xOrgIdHeader?: string) {
    const phoneNumberId = extractWhatsAppPhoneNumberId(payload);
    if (!phoneNumberId) {
      throw new BadRequestException("phone_number_id is missing in payload");
    }

    const providerMessageId =
      extractWhatsAppProviderMessageId(payload) ??
      this.createFallbackProviderMessageId(payload);

    const organizationId = await this.resolveOrganizationId(
      phoneNumberId,
      xOrgIdHeader,
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

  private async resolveOrganizationId(
    phoneNumberId: string,
    xOrgIdHeader?: string,
  ) {
    const mappedAccount = await this.prisma.channelAccount.findFirst({
      where: {
        provider: ChannelType.WHATSAPP,
        externalAccountId: phoneNumberId,
      },
      select: { organizationId: true },
    });

    if (mappedAccount) {
      return mappedAccount.organizationId;
    }

    if (process.env.ENABLE_DEV_ENDPOINTS === "true" && xOrgIdHeader?.trim()) {
      const organization = await this.prisma.organization.findUnique({
        where: { id: xOrgIdHeader.trim() },
        select: { id: true },
      });

      if (!organization) {
        throw new BadRequestException("X-ORG-ID organization not found");
      }

      return organization.id;
    }

    throw new BadRequestException("Unmapped WhatsApp phone_number_id");
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
}
