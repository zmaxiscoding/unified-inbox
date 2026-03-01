import { Injectable, NotFoundException } from "@nestjs/common";
import { MessageDirection } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type MessageWithRelations = {
  id: string;
  direction: MessageDirection;
  body: string;
  createdAt: Date;
  sender: { name: string } | null;
  conversation: { contactName: string };
};

type ConversationListItem = {
  id: string;
  contactName: string;
  lastMessageAt: Date | null;
  channel: { type: string };
};

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listConversations(organizationId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { organizationId },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        contactName: true,
        lastMessageAt: true,
        channel: { select: { type: true } },
      },
    });

    return conversations.map((conversation: ConversationListItem) => ({
      id: conversation.id,
      customerDisplay: conversation.contactName,
      lastMessageAt: conversation.lastMessageAt,
      channelProvider: conversation.channel.type,
    }));
  }

  async listConversationMessages(organizationId: string, conversationId: string) {
    const conversation = await this.getConversationInOrganization(
      organizationId,
      conversationId,
    );
    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        direction: true,
        body: true,
        createdAt: true,
        sender: { select: { name: true } },
        conversation: { select: { contactName: true } },
      },
    });

    return messages.map((message: MessageWithRelations) =>
      this.toMessageResponse(message),
    );
  }

  async createOutboundMessage(
    organizationId: string,
    userId: string,
    conversationId: string,
    text: string,
  ) {
    const conversation = await this.getConversationInOrganization(
      organizationId,
      conversationId,
    );
    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.OUTBOUND,
        body: text,
        senderId: userId,
      },
      select: {
        id: true,
        direction: true,
        body: true,
        createdAt: true,
        sender: { select: { name: true } },
        conversation: { select: { contactName: true } },
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: message.createdAt,
        lastMessageText: text,
        isUnread: false,
      },
    });

    return this.toMessageResponse(message);
  }

  private async getConversationInOrganization(
    organizationId: string,
    conversationId: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    return conversation;
  }

  private toMessageResponse(message: MessageWithRelations) {
    return {
      id: message.id,
      direction: message.direction,
      text: message.body,
      createdAt: message.createdAt,
      senderDisplay:
        message.direction === MessageDirection.INBOUND
          ? message.conversation.contactName
          : message.sender?.name ?? null,
    };
  }
}
