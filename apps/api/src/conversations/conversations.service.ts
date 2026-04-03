import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import {
  ConversationStatus,
  MessageDirection,
  OutboundMessageDeliveryStatus,
  Prisma,
} from "@prisma/client";
import { EventsService } from "../events/events.service";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
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
  status: ConversationStatus;
  contactName: string;
  lastMessageAt: Date | null;
  isUnread: boolean;
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

type ConversationAssignmentRecord = {
  id: string;
  assignedMembershipId: string | null;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboundQueue: OutboundQueueService,
    private readonly eventsService: EventsService,
  ) {}

  async listConversations(
    organizationId: string,
    filters?: ListConversationsQueryDto,
  ) {
    const where: Prisma.ConversationWhereInput = { organizationId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.channel) {
      where.channel = { type: filters.channel };
    }

    if (filters?.assigneeId) {
      where.assignedMembershipId = filters.assigneeId;
    }

    if (filters?.tagId) {
      where.tags = { some: { tagId: filters.tagId } };
    }

    if (filters?.search) {
      const term = filters.search.trim();
      if (term) {
        where.OR = [
          { contactName: { contains: term, mode: "insensitive" } },
          { lastMessageText: { contains: term, mode: "insensitive" } },
          {
            messages: {
              some: {
                body: { contains: term, mode: "insensitive" },
              },
            },
          },
        ];
      }
    }

    const conversations = await this.prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        contactName: true,
        lastMessageAt: true,
        isUnread: true,
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
      status: conversation.status,
      customerDisplay: conversation.contactName,
      lastMessageAt: conversation.lastMessageAt,
      isUnread: conversation.isUnread,
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
    const { conversation, messages, markedAsRead } = await this.prisma.$transaction(
      async (tx) => {
        const conversation = await tx.conversation.findFirst({
          where: { id: conversationId, organizationId },
          select: {
            id: true,
            isUnread: true,
            updatedAt: true,
          },
        });

        if (!conversation) {
          throw new NotFoundException("Conversation not found");
        }

        const messages = await tx.message.findMany({
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

        const readResetResult = conversation.isUnread
          ? await tx.conversation.updateMany({
              where: {
                id: conversation.id,
                organizationId,
                isUnread: true,
                updatedAt: conversation.updatedAt,
              },
              data: { isUnread: false },
            })
          : { count: 0 };

        return {
          conversation,
          messages,
          markedAsRead: readResetResult.count > 0,
        };
      },
    );

    if (markedAsRead) {
      this.eventsService.emit(organizationId, {
        type: "conversation.updated",
        conversationId,
        payload: { action: "markedRead", id: conversation.id, isUnread: false },
      });
    }

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
        select: {
          id: true,
          status: true,
        },
      });

      if (!conversation) {
        throw new NotFoundException("Conversation not found");
      }

      if (conversation.status === ConversationStatus.RESOLVED) {
        throw new ConflictException(
          "Resolved conversations cannot send outbound messages",
        );
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

    const response = this.toMessageResponse(message);
    this.eventsService.emit(organizationId, {
      type: "message.created",
      conversationId,
      payload: response as unknown as Record<string, unknown>,
    });
    return response;
  }

  async assignConversation(
    organizationId: string,
    actorUserId: string,
    conversationId: string,
    membershipId: string | null,
  ) {
    const assignment = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, organizationId },
        select: {
          id: true,
          assignedMembershipId: true,
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

      if (!conversation) {
        throw new NotFoundException("Conversation not found");
      }

      let targetUserId: string | null = null;
      if (membershipId !== null) {
        const targetMembership = await tx.membership.findFirst({
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

      if (conversation.assignedMembershipId === membershipId) {
        return {
          changed: false,
          action: membershipId === null ? "unassigned" : "assigned",
          result: this.toAssignmentResponse(conversation),
        };
      }

      const updateResult = await tx.conversation.updateMany({
        where: {
          id: conversation.id,
          organizationId,
          assignedMembershipId: conversation.assignedMembershipId,
        },
        data: {
          assignedMembershipId: membershipId,
        },
      });

      const currentConversation = await tx.conversation.findFirst({
        where: { id: conversation.id, organizationId },
        select: {
          id: true,
          assignedMembershipId: true,
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

      if (!currentConversation) {
        throw new NotFoundException("Conversation not found");
      }

      if (updateResult.count === 0) {
        if (currentConversation.assignedMembershipId === membershipId) {
          return {
            changed: false,
            action: membershipId === null ? "unassigned" : "assigned",
            result: this.toAssignmentResponse(currentConversation),
          };
        }

        throw new ConflictException("Conversation assignment changed, please retry");
      }

      await tx.auditLog.create({
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
        changed: true,
        action: membershipId === null ? "unassigned" : "assigned",
        result: this.toAssignmentResponse(currentConversation),
      };
    });

    if (assignment.changed) {
      this.eventsService.emit(organizationId, {
        type: "conversation.updated",
        conversationId,
        payload: { action: assignment.action, ...assignment.result },
      });
    }

    return assignment.result;
  }

  async updateConversationStatus(
    organizationId: string,
    actorUserId: string,
    conversationId: string,
    status: "OPEN" | "RESOLVED",
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: {
          id: conversationId,
          organizationId,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!conversation) {
        throw new NotFoundException("Conversation not found");
      }

      if (conversation.status === status) {
        return {
          id: conversation.id,
          status: conversation.status,
        };
      }

      const updatedConversation = await tx.conversation.update({
        where: { id: conversation.id },
        data: { status },
        select: {
          id: true,
          status: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action:
            updatedConversation.status === "RESOLVED"
              ? "conversation.resolved"
              : "conversation.reopened",
          targetId: updatedConversation.id,
          metadata: {
            fromStatus: conversation.status,
            toStatus: updatedConversation.status,
          },
          organizationId,
          actorId: actorUserId,
        },
      });

      return {
        id: updatedConversation.id,
        status: updatedConversation.status,
      };
    });

    this.eventsService.emit(organizationId, {
      type: "conversation.updated",
      conversationId,
      payload: { action: "statusChanged", id: result.id, status: result.status },
    });
    return result;
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

    const noteResponse = {
      id: note.id,
      body: note.body,
      createdAt: note.createdAt,
      author: {
        id: note.author.id,
        name: note.author.name,
        email: note.author.email,
      },
    };
    this.eventsService.emit(organizationId, {
      type: "note.created",
      conversationId,
      payload: noteResponse as unknown as Record<string, unknown>,
    });
    return noteResponse;
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
    actorUserId: string,
    conversationId: string,
    rawName: string,
  ) {
    const name = rawName.trim().toLowerCase();

    const { tag } = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, organizationId },
        select: { id: true },
      });

      if (!conversation) {
        throw new NotFoundException("Conversation not found");
      }

      const tag = await tx.tag.upsert({
        where: {
          organizationId_name: { organizationId, name },
        },
        update: {},
        create: { name, organizationId },
      });

      const existingLink = await tx.conversationTag.findUnique({
        where: {
          conversationId_tagId: {
            conversationId: conversation.id,
            tagId: tag.id,
          },
        },
      });

      if (!existingLink) {
        await tx.conversationTag.upsert({
          where: {
            conversationId_tagId: {
              conversationId: conversation.id,
              tagId: tag.id,
            },
          },
          update: {},
          create: { conversationId: conversation.id, tagId: tag.id },
        });

        await tx.auditLog.create({
          data: {
            action: "conversation.tag_added",
            targetId: conversation.id,
            metadata: {
              tagId: tag.id,
              tagName: tag.name,
            },
            organizationId,
            actorId: actorUserId,
          },
        });
      }

      return { tag };
    });

    this.eventsService.emit(organizationId, {
      type: "conversation.updated",
      conversationId,
      payload: { action: "tagAdded", tagId: tag.id, tagName: tag.name },
    });
    return { id: tag.id, name: tag.name };
  }

  async removeTagFromConversation(
    organizationId: string,
    actorUserId: string,
    conversationId: string,
    tagId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, organizationId },
        select: { id: true },
      });

      if (!conversation) {
        throw new NotFoundException("Conversation not found");
      }

      const link = await tx.conversationTag.findUnique({
        where: {
          conversationId_tagId: {
            conversationId: conversation.id,
            tagId,
          },
        },
        select: {
          tag: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!link) {
        throw new NotFoundException("Tag not found on this conversation");
      }

      await tx.conversationTag.delete({
        where: {
          conversationId_tagId: {
            conversationId: conversation.id,
            tagId,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          action: "conversation.tag_removed",
          targetId: conversation.id,
          metadata: {
            tagId: link.tag.id,
            tagName: link.tag.name,
          },
          organizationId,
          actorId: actorUserId,
        },
      });
    });

    this.eventsService.emit(organizationId, {
      type: "conversation.updated",
      conversationId,
      payload: { action: "tagRemoved", tagId },
    });
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

  private toAssignmentResponse(conversation: ConversationAssignmentRecord) {
    return {
      id: conversation.id,
      assignedMembership: conversation.assignedMembership
        ? {
            id: conversation.assignedMembership.id,
            user: {
              id: conversation.assignedMembership.user.id,
              name: conversation.assignedMembership.user.name,
              email: conversation.assignedMembership.user.email,
            },
          }
        : null,
    };
  }
}
