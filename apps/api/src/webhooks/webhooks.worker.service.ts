import { Injectable } from "@nestjs/common";
import {
  ChannelType,
  MessageDirection,
  OutboundMessageDeliveryStatus,
  Prisma,
  WebhookProcessingStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  extractWhatsAppStatusUpdates,
  extractWhatsAppTextMessage,
  NormalizedWhatsAppStatusUpdate,
} from "./whatsapp-payload";

type RawWebhookEventRecord = {
  id: string;
  provider: ChannelType;
  payload: Prisma.JsonValue;
  externalAccountId: string;
  organizationId: string;
  processingStatus: WebhookProcessingStatus;
};

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
      const statusUpdates = extractWhatsAppStatusUpdates(rawEvent.payload);

      if (!normalizedMessage && statusUpdates.length === 0) {
        await this.markRawEventAsProcessed(rawEvent.id);
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        if (normalizedMessage) {
          await this.persistInboundMessage(tx, rawEvent, normalizedMessage);
        }

        for (const statusUpdate of statusUpdates) {
          await this.applyOutboundStatusUpdate(
            tx,
            rawEvent.organizationId,
            statusUpdate,
          );
        }

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

  private async persistInboundMessage(
    tx: Prisma.TransactionClient,
    rawEvent: RawWebhookEventRecord,
    normalizedMessage: {
      providerMessageId: string;
      from: string;
      text: string;
      externalThreadId: string;
      customerDisplay: string;
    },
  ) {
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
  }

  private async applyOutboundStatusUpdate(
    tx: Prisma.TransactionClient,
    organizationId: string,
    statusUpdate: NormalizedWhatsAppStatusUpdate,
  ) {
    const outboundMessage = await tx.message.findFirst({
      where: {
        providerMessageId: statusUpdate.providerMessageId,
        direction: MessageDirection.OUTBOUND,
        conversation: {
          organizationId,
        },
      },
      select: {
        id: true,
        deliveryStatus: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
      },
    });

    if (!outboundMessage) {
      return;
    }

    if (
      !this.shouldApplyStatusTransition(
        outboundMessage.deliveryStatus,
        statusUpdate.deliveryStatus,
      )
    ) {
      return;
    }

    const occurredAt = statusUpdate.occurredAt ?? new Date();
    const updateData: Prisma.MessageUpdateInput = {
      deliveryStatus: statusUpdate.deliveryStatus,
      deliveryStatusUpdatedAt: occurredAt,
    };

    if (statusUpdate.deliveryStatus === OutboundMessageDeliveryStatus.FAILED) {
      updateData.failedAt = occurredAt;
      updateData.providerError =
        statusUpdate.failedReason ?? "WhatsApp delivery failed";
    } else {
      updateData.failedAt = null;
      updateData.providerError = null;
    }

    if (
      statusUpdate.deliveryStatus === OutboundMessageDeliveryStatus.SENT &&
      !outboundMessage.sentAt
    ) {
      updateData.sentAt = occurredAt;
    }

    if (statusUpdate.deliveryStatus === OutboundMessageDeliveryStatus.DELIVERED) {
      if (!outboundMessage.sentAt) {
        updateData.sentAt = occurredAt;
      }
      if (!outboundMessage.deliveredAt) {
        updateData.deliveredAt = occurredAt;
      }
    }

    if (statusUpdate.deliveryStatus === OutboundMessageDeliveryStatus.READ) {
      if (!outboundMessage.sentAt) {
        updateData.sentAt = occurredAt;
      }
      if (!outboundMessage.deliveredAt) {
        updateData.deliveredAt = occurredAt;
      }
      if (!outboundMessage.readAt) {
        updateData.readAt = occurredAt;
      }
    }

    await tx.message.update({
      where: { id: outboundMessage.id },
      data: updateData,
    });
  }

  private shouldApplyStatusTransition(
    current: OutboundMessageDeliveryStatus | null,
    incoming: OutboundMessageDeliveryStatus,
  ) {
    if (incoming === OutboundMessageDeliveryStatus.FAILED) {
      return (
        current !== OutboundMessageDeliveryStatus.FAILED &&
        current !== OutboundMessageDeliveryStatus.DELIVERED &&
        current !== OutboundMessageDeliveryStatus.READ
      );
    }

    if (current === OutboundMessageDeliveryStatus.READ) {
      return false;
    }

    return this.statusRank(incoming) > this.statusRank(current);
  }

  private statusRank(status: OutboundMessageDeliveryStatus | null) {
    switch (status) {
      case OutboundMessageDeliveryStatus.QUEUED:
        return 0;
      case OutboundMessageDeliveryStatus.SENDING:
      case OutboundMessageDeliveryStatus.FAILED:
        return 1;
      case OutboundMessageDeliveryStatus.SENT:
        return 2;
      case OutboundMessageDeliveryStatus.DELIVERED:
        return 3;
      case OutboundMessageDeliveryStatus.READ:
        return 4;
      default:
        return -1;
    }
  }

  private async markRawEventAsProcessed(rawWebhookEventId: string) {
    await this.prisma.rawWebhookEvent.update({
      where: { id: rawWebhookEventId },
      data: {
        processingStatus: WebhookProcessingStatus.PROCESSED,
        processedAt: new Date(),
        error: null,
      },
    });
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
