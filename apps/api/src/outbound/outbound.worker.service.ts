import { Injectable } from "@nestjs/common";
import {
  ChannelType,
  MessageDirection,
  OutboundMessageDeliveryStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { InstagramGraphApiAdapter } from "./instagram-graph-api.adapter";
import { WhatsAppCloudApiAdapter } from "./whatsapp-cloud-api.adapter";

type OutboundMessageRecord = {
  id: string;
  body: string;
  direction: MessageDirection;
  conversation: {
    organizationId: string;
    contactPhone: string | null;
    channel: {
      type: ChannelType;
      externalId: string | null;
    };
  };
};

@Injectable()
export class OutboundWorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappCloudApiAdapter: WhatsAppCloudApiAdapter,
    private readonly instagramGraphApiAdapter: InstagramGraphApiAdapter,
  ) {}

  async processOutboundMessage(messageId: string) {
    const claimedAt = new Date();
    const claimResult = await this.prisma.message.updateMany({
      where: {
        id: messageId,
        direction: MessageDirection.OUTBOUND,
        deliveryStatus: {
          in: [
            OutboundMessageDeliveryStatus.QUEUED,
            OutboundMessageDeliveryStatus.FAILED,
          ],
        },
      },
      data: {
        deliveryStatus: OutboundMessageDeliveryStatus.SENDING,
        deliveryStatusUpdatedAt: claimedAt,
        providerError: null,
        failedAt: null,
      },
    });

    if (claimResult.count === 0) {
      return;
    }

    const outboundMessage = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        body: true,
        direction: true,
        conversation: {
          select: {
            organizationId: true,
            contactPhone: true,
            channel: {
              select: {
                type: true,
                externalId: true,
              },
            },
          },
        },
      },
    });

    if (!outboundMessage || outboundMessage.direction !== MessageDirection.OUTBOUND) {
      return;
    }

    try {
      await this.sendViaProvider(outboundMessage);
    } catch (error) {
      await this.markMessageAsFailed(messageId, this.toErrorMessage(error));
      throw error;
    }
  }

  private async sendViaProvider(outboundMessage: OutboundMessageRecord) {
    const channelType = outboundMessage.conversation.channel.type;
    const externalId = outboundMessage.conversation.channel.externalId?.trim() || "";

    if (!externalId) {
      throw new Error("Channel external id is missing");
    }

    let sendResult: { providerMessageId: string };

    if (channelType === ChannelType.WHATSAPP) {
      const to = outboundMessage.conversation.contactPhone?.trim() || "";
      if (!to) {
        throw new Error("Conversation contact phone is missing");
      }

      sendResult = await this.whatsappCloudApiAdapter.sendTextMessage({
        organizationId: outboundMessage.conversation.organizationId,
        phoneNumberId: externalId,
        to,
        text: outboundMessage.body,
      });
    } else if (channelType === ChannelType.INSTAGRAM) {
      const recipientId = outboundMessage.conversation.contactPhone?.trim() || "";
      if (!recipientId) {
        throw new Error("Conversation contact (Instagram recipient) is missing");
      }

      sendResult = await this.instagramGraphApiAdapter.sendTextMessage({
        organizationId: outboundMessage.conversation.organizationId,
        instagramAccountId: externalId,
        recipientId,
        text: outboundMessage.body,
      });
    } else {
      throw new Error(`Unsupported outbound channel provider: ${channelType}`);
    }

    const sentAt = new Date();
    await this.prisma.message.update({
      where: { id: outboundMessage.id },
      data: {
        providerMessageId: sendResult.providerMessageId,
        deliveryStatus: OutboundMessageDeliveryStatus.SENT,
        deliveryStatusUpdatedAt: sentAt,
        sentAt,
        providerError: null,
        failedAt: null,
      },
    });
  }

  private async markMessageAsFailed(messageId: string, errorMessage: string) {
    const failedAt = new Date();
    await this.prisma.message.updateMany({
      where: {
        id: messageId,
        direction: MessageDirection.OUTBOUND,
      },
      data: {
        deliveryStatus: OutboundMessageDeliveryStatus.FAILED,
        deliveryStatusUpdatedAt: failedAt,
        providerError: errorMessage,
        failedAt,
      },
    });
  }

  private toErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message.slice(0, 500);
    }

    return "Unknown outbound processing error";
  }
}
