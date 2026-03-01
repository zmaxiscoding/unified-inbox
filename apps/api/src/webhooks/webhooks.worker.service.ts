import { Injectable } from "@nestjs/common";
import {
  ChannelType,
  MessageDirection,
  Prisma,
  WebhookProcessingStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { extractWhatsAppTextMessage } from "./whatsapp-payload";

@Injectable()
export class WebhooksWorkerService {
  constructor(private readonly prisma: PrismaService) {}

  async processRawEvent(rawWebhookEventId: string) {
    const rawEvent = await this.prisma.rawWebhookEvent.findUnique({
      where: { id: rawWebhookEventId },
      select: {
        id: true,
        provider: true,
        payload: true,
        externalAccountId: true,
        organizationId: true,
        processingStatus: true,
      },
    });

    if (!rawEvent || rawEvent.processingStatus !== WebhookProcessingStatus.PENDING) {
      return;
    }

    try {
      if (rawEvent.provider !== ChannelType.WHATSAPP) {
        throw new Error(`Unsupported webhook provider: ${rawEvent.provider}`);
      }

      const normalizedMessage = extractWhatsAppTextMessage(rawEvent.payload);
      if (!normalizedMessage) {
        throw new Error("Only WhatsApp text messages are supported in MVP");
      }

      await this.prisma.$transaction(async (tx) => {
        const channel = await tx.channel.upsert({
          where: {
            organizationId_type_externalId: {
              organizationId: rawEvent.organizationId,
              type: ChannelType.WHATSAPP,
              externalId: rawEvent.externalAccountId,
            },
          },
          create: {
            type: ChannelType.WHATSAPP,
            name: "WhatsApp Business",
            externalId: rawEvent.externalAccountId,
            organizationId: rawEvent.organizationId,
          },
          update: {},
          select: { id: true },
        });

        const conversation = await this.getOrCreateConversation(
          tx,
          rawEvent.organizationId,
          channel.id,
          normalizedMessage.externalThreadId,
          normalizedMessage.from,
          normalizedMessage.customerDisplay,
        );

        let createdAt: Date | null = null;
        try {
          const createdMessage = await tx.message.create({
            data: {
              direction: MessageDirection.INBOUND,
              body: normalizedMessage.text,
              providerMessageId: normalizedMessage.providerMessageId,
              conversationId: conversation.id,
            },
            select: { createdAt: true },
          });

          createdAt = createdMessage.createdAt;
        } catch (error) {
          if (!this.isUniqueConstraintError(error)) {
            throw error;
          }
        }

        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            contactName: normalizedMessage.customerDisplay,
            contactPhone: normalizedMessage.from,
            lastMessageAt: createdAt ?? new Date(),
            lastMessageText: normalizedMessage.text,
            isUnread: true,
          },
        });

        await tx.rawWebhookEvent.update({
          where: { id: rawEvent.id },
          data: {
            processingStatus: WebhookProcessingStatus.PROCESSED,
            processedAt: new Date(),
            error: null,
          },
        });
      });
    } catch (error) {
      await this.prisma.rawWebhookEvent.update({
        where: { id: rawWebhookEventId },
        data: {
          processingStatus: WebhookProcessingStatus.FAILED,
          processedAt: new Date(),
          error: this.toErrorMessage(error),
        },
      });
    }
  }

  private async getOrCreateConversation(
    tx: Prisma.TransactionClient,
    organizationId: string,
    channelId: string,
    externalThreadId: string,
    from: string,
    customerDisplay: string,
  ) {
    const existingConversation = await tx.conversation.findFirst({
      where: {
        organizationId,
        channelId,
        externalThreadId,
      },
      select: { id: true },
    });

    if (existingConversation) {
      return existingConversation;
    }

    try {
      return await tx.conversation.create({
        data: {
          organizationId,
          channelId,
          externalThreadId,
          contactName: customerDisplay,
          contactPhone: from,
          isUnread: true,
        },
        select: { id: true },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const conversation = await tx.conversation.findFirst({
        where: {
          organizationId,
          channelId,
          externalThreadId,
        },
        select: { id: true },
      });

      if (!conversation) {
        throw error;
      }

      return conversation;
    }
  }

  private isUniqueConstraintError(error: unknown) {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return false;
    }

    return (error as { code?: string }).code === "P2002";
  }

  private toErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message.slice(0, 500);
    }

    return "Unknown webhook processing error";
  }
}
