import { Injectable, NotFoundException } from "@nestjs/common";
import { MessageDirection } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const SEED_ORG_SLUG = "acme-store";

type MessageWithRelations = {
  id: string;
  direction: MessageDirection;
  body: string;
  createdAt: Date;
  sender: { name: string } | null;
  conversation: { contactName: string };
};

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listConversations() {
    const organizationId = await this.getSeedOrganizationId();

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

    return conversations.map((conversation) => ({
      id: conversation.id,
      customerDisplay: conversation.contactName,
      lastMessageAt: conversation.lastMessageAt,
      channelProvider: conversation.channel.type,
    }));
  }

  async listConversationMessages(conversationId: string) {
    const conversation = await this.getConversationInSeedOrg(conversationId);
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

    return messages.map((message) => this.toMessageResponse(message));
  }

  async createOutboundMessage(conversationId: string, text: string) {
    const conversation = await this.getConversationInSeedOrg(conversationId);
    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.OUTBOUND,
        body: text,
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

  private async getSeedOrganizationId() {
    const organization = await this.prisma.organization.findUnique({
      where: { slug: SEED_ORG_SLUG },
      select: { id: true },
    });

    if (!organization) {
      throw new NotFoundException("Seed organization not found");
    }

    return organization.id;
  }

  private async getConversationInSeedOrg(conversationId: string) {
    const organizationId = await this.getSeedOrganizationId();
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
