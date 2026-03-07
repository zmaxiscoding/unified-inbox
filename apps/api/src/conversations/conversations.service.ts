import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { ConversationStatus, MessageDirection, OutboundMessageDeliveryStatus, Prisma } from "@prisma/client";
import { OutboundQueueService } from "../outbound/outbound.queue.service";
import { PrismaService } from "../prisma/prisma.service";

type MessageWithRelations = {
  id: string;
  direction: MessageDirection;
  body: string;
  deliveryStatus: OutboundMessageDeliveryStatus | null;
  createdAt: Date;
  sender: { name: string } | null;
  conversation: { contactName: string };
};

type ConversationListItem = {
  id: string;
  contactName: string;
  status: ConversationStatus;
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
  tags: { tag: { id: string; name: string } }[];
};

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboundQueue: OutboundQueueService,
  ) {}

  async listConversations(
    organizationId: string,
    filters?: { status?: ConversationStatus; search?: string; assignedTo?: string },
  ) {
    const where: Prisma.ConversationWhereInput = { organizationId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.search) {
      const term = filters.search.trim();
      if (term) {
        where.OR = [
          { contactName: { contains: term, mode: "insensitive" } },
          { contactPhone: { contains: term, mode: "insensitive" } },
          { lastMessageText: { contains: term, mode: "insensitive" } },
        ];
      }
    }

    if (filters?.assignedTo === "unassigned") {
      where.assignedMembershipId = null;
    } else if (filters?.assignedTo) {
      where.assignedMembershipId = filters.assignedTo;
    }

    const conversations = await this.prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        contactName: true,
        status: true,
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
        tags: {
          orderBy: { createdAt: "asc" as const },
          select: {
            tag: { select: { id: true, name: true } },
          },
        },
      },
    });

    return conversations.map((conversation: ConversationListItem) => ({
      id: conversation.id,
      customerDisplay: conversation.contactName,
      status: conversation.status,
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
      tags: conversation.tags.map((ct) => ct.tag),
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
        deliveryStatus: true,
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
    const normalizedText = text.trim();

    const message = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: {
          id: conversationId,
          organizationId,
        },
        select: { id: true },
      });

      if (!conversation) {
        throw new NotFoundException("Conversation not found");
      }

      const createdMessage = await tx.message.create({
        data: {
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          body: normalizedText,
          senderId: userId,
          deliveryStatus: OutboundMessageDeliveryStatus.QUEUED,
          deliveryStatusUpdatedAt: new Date(),
        },
        select: {
          id: true,
          direction: true,
          body: true,
          deliveryStatus: true,
          createdAt: true,
          sender: { select: { name: true } },
          conversation: { select: { contactName: true } },
        },
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: createdMessage.createdAt,
          lastMessageText: normalizedText,
          isUnread: false,
        },
      });

      return createdMessage;
    });

    try {
      await this.outboundQueue.enqueue(message.id);
    } catch {
      const failedAt = new Date();
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          deliveryStatus: OutboundMessageDeliveryStatus.FAILED,
          deliveryStatusUpdatedAt: failedAt,
          providerError: "Outbound queue enqueue failed",
          failedAt,
        },
      });

      throw new InternalServerErrorException("Outbound message enqueue failed");
    }

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

  async listConversationNotes(
    organizationId: string,
    conversationId: string,
  ) {
    const conversation = await this.getConversationInOrganization(
      organizationId,
      conversationId,
    );

    const notes = await this.prisma.note.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return notes.map((note) => ({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt,
      author: {
        id: note.author.id,
        name: note.author.name,
        email: note.author.email,
      },
    }));
  }

  async createConversationNote(
    organizationId: string,
    userId: string,
    conversationId: string,
    rawBody: string,
  ) {
    const conversation = await this.getConversationInOrganization(
      organizationId,
      conversationId,
    );

    const note = await this.prisma.note.create({
      data: {
        body: rawBody.trim(),
        conversationId: conversation.id,
        authorId: userId,
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return {
      id: note.id,
      body: note.body,
      createdAt: note.createdAt,
      author: {
        id: note.author.id,
        name: note.author.name,
        email: note.author.email,
      },
    };
  }

  async listConversationTags(
    organizationId: string,
    conversationId: string,
  ) {
    const conversation = await this.getConversationInOrganization(
      organizationId,
      conversationId,
    );

    const conversationTags = await this.prisma.conversationTag.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      select: {
        tag: { select: { id: true, name: true } },
      },
    });

    return conversationTags.map((ct) => ct.tag);
  }

  async addTagToConversation(
    organizationId: string,
    conversationId: string,
    rawName: string,
  ) {
    const conversation = await this.getConversationInOrganization(
      organizationId,
      conversationId,
    );

    const name = rawName.trim().toLowerCase();

    const tag = await this.prisma.tag.upsert({
      where: {
        organizationId_name: { organizationId, name },
      },
      update: {},
      create: { name, organizationId },
    });

    await this.prisma.conversationTag.upsert({
      where: {
        conversationId_tagId: {
          conversationId: conversation.id,
          tagId: tag.id,
        },
      },
      update: {},
      create: { conversationId: conversation.id, tagId: tag.id },
    });

    return { id: tag.id, name: tag.name };
  }

  async removeTagFromConversation(
    organizationId: string,
    conversationId: string,
    tagId: string,
  ) {
    const conversation = await this.getConversationInOrganization(
      organizationId,
      conversationId,
    );

    const link = await this.prisma.conversationTag.findUnique({
      where: {
        conversationId_tagId: {
          conversationId: conversation.id,
          tagId,
        },
      },
    });

    if (!link) {
      throw new NotFoundException("Tag not found on this conversation");
    }

    await this.prisma.conversationTag.delete({
      where: {
        conversationId_tagId: {
          conversationId: conversation.id,
          tagId,
        },
      },
    });
  }

  async updateConversationStatus(
    organizationId: string,
    actorUserId: string,
    conversationId: string,
    newStatus: ConversationStatus,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { id: true, status: true },
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    if (conversation.status === newStatus) {
      return { id: conversation.id, status: newStatus };
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: newStatus },
      select: { id: true, status: true },
    });

    await this.prisma.auditLog.create({
      data: {
        action: `conversation.status_changed`,
        targetId: conversation.id,
        metadata: {
          from: conversation.status,
          to: newStatus,
        },
        organizationId,
        actorId: actorUserId,
      },
    });

    return { id: updated.id, status: updated.status };
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
      deliveryStatus: message.deliveryStatus,
      createdAt: message.createdAt,
      senderDisplay:
        message.direction === MessageDirection.INBOUND
          ? message.conversation.contactName
          : message.sender?.name ?? null,
    };
  }
}
