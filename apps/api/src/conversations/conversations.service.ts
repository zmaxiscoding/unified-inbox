import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
  assignedMembership: {
    id: string;
    user: {
      id: string;
      name: string;
      email: string;
    };
  } | null;
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
        assignedMembership: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return conversations.map((conversation: ConversationListItem) => ({
      id: conversation.id,
      customerDisplay: conversation.contactName,
      lastMessageAt: conversation.lastMessageAt,
      channelProvider: conversation.channel.type,
      assignedMembership: conversation.assignedMembership
        ? {
            id: conversation.assignedMembership.id,
            user: {
              id: conversation.assignedMembership.user.id,
              name: conversation.assignedMembership.user.name,
            },
          }
        : null,
    }));
  }

  async listOrganizationMembers(organizationId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
      select: {
        id: true,
        role: true,
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    return memberships.map((membership) => ({
      membershipId: membership.id,
      name: membership.user.name,
      role: membership.role,
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

  async assignConversation(
    organizationId: string,
    actorUserId: string,
    conversationId: string,
    membershipId: string | null,
  ) {
    const conversation = await this.getConversationInOrganization(
      organizationId,
      conversationId,
    );

    let targetUserId: string | null = null;
    if (membershipId !== null) {
      const targetMembership = await this.prisma.membership.findFirst({
        where: {
          id: membershipId,
          organizationId,
        },
        select: {
          id: true,
          user: {
            select: { id: true },
          },
        },
      });

      if (!targetMembership) {
        throw new BadRequestException(
          "Membership not found in this organization",
        );
      }

      targetUserId = targetMembership.user.id;
    }

    const updatedConversation = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        assignedMembershipId: membershipId,
      },
      select: {
        id: true,
        assignedMembership: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action:
          membershipId === null
            ? "conversation.unassigned"
            : "conversation.assigned",
        targetId: conversation.id,
        metadata: {
          assignedTo: targetUserId,
        },
        organizationId,
        actorId: actorUserId,
      },
    });

    return {
      id: updatedConversation.id,
      assignedMembership: updatedConversation.assignedMembership
        ? {
            id: updatedConversation.assignedMembership.id,
            user: {
              id: updatedConversation.assignedMembership.user.id,
              name: updatedConversation.assignedMembership.user.name,
              email: updatedConversation.assignedMembership.user.email,
            },
          }
        : null,
    };
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
