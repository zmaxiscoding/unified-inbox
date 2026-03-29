import {
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { EventsService } from "../events/events.service";
import { OutboundQueueService } from "../outbound/outbound.queue.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConversationsService } from "./conversations.service";

describe("ConversationsService", () => {
  let service: ConversationsService;
  let prisma: {
    conversation: {
      findFirst: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    message: {
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    membership: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
    };
    tag: {
      upsert: jest.Mock;
    };
    conversationTag: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
    note: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let outboundQueue: {
    enqueue: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      conversation: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      message: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      membership: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      tag: {
        upsert: jest.fn(),
      },
      conversationTag: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      note: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (arg: unknown) => {
        if (typeof arg === "function") {
          return (arg as (tx: unknown) => unknown)(prisma);
        }

        return arg;
      }),
    };

    outboundQueue = {
      enqueue: jest.fn(),
    };

    const eventsService = { emit: jest.fn() } as unknown as EventsService;
    service = new ConversationsService(
      prisma as unknown as PrismaService,
      outboundQueue as unknown as OutboundQueueService,
      eventsService,
    );
  });

  it("should create outbound message as QUEUED and enqueue a send job", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    prisma.message.create.mockResolvedValue({
      id: "msg_1",
      direction: "OUTBOUND",
      body: "Merhaba",
      deliveryStatus: "QUEUED",
      createdAt: new Date("2026-03-05T10:00:00.000Z"),
      sender: { name: "Agent" },
      conversation: { contactName: "Ahmet Kaya" },
    });
    prisma.conversation.update.mockResolvedValue({});
    outboundQueue.enqueue.mockResolvedValue(undefined);

    const result = await service.createOutboundMessage(
      "org_1",
      "usr_1",
      "conv_1",
      "  Merhaba  ",
    );

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: "conv_1",
        direction: "OUTBOUND",
        body: "Merhaba",
        senderId: "usr_1",
        deliveryStatus: "QUEUED",
        deliveryStatusUpdatedAt: expect.any(Date),
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
    expect(outboundQueue.enqueue).toHaveBeenCalledWith("msg_1");
    expect(result).toEqual({
      id: "msg_1",
      direction: "OUTBOUND",
      text: "Merhaba",
      deliveryStatus: "QUEUED",
      createdAt: new Date("2026-03-05T10:00:00.000Z"),
      senderDisplay: "Agent",
    });
  });

  it("should mark outbound message as FAILED when enqueue fails", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    prisma.message.create.mockResolvedValue({
      id: "msg_2",
      direction: "OUTBOUND",
      body: "Merhaba",
      deliveryStatus: "QUEUED",
      createdAt: new Date("2026-03-05T10:00:00.000Z"),
      sender: { name: "Agent" },
      conversation: { contactName: "Ahmet Kaya" },
    });
    prisma.conversation.update.mockResolvedValue({});
    outboundQueue.enqueue.mockRejectedValue(new Error("redis unavailable"));

    await expect(
      service.createOutboundMessage("org_1", "usr_1", "conv_1", "Merhaba"),
    ).rejects.toThrow("Outbound message enqueue failed");

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "msg_2" },
      data: {
        deliveryStatus: "FAILED",
        deliveryStatusUpdatedAt: expect.any(Date),
        providerError: "Outbound queue enqueue failed",
        failedAt: expect.any(Date),
      },
    });
  });

  it("should assign conversation to a valid membership", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    prisma.membership.findFirst.mockResolvedValue({
      id: "mem_1",
      user: { id: "usr_1" },
    });
    prisma.conversation.update.mockResolvedValue({
      id: "conv_1",
      assignedMembership: {
        id: "mem_1",
        user: { id: "usr_1", name: "Zeynep Demir", email: "agent@acme.com" },
      },
    });

    const result = await service.assignConversation(
      "org_1",
      "actor_1",
      "conv_1",
      "mem_1",
    );

    expect(result).toEqual({
      id: "conv_1",
      assignedMembership: {
        id: "mem_1",
        user: { id: "usr_1", name: "Zeynep Demir", email: "agent@acme.com" },
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: "conversation.assigned",
        targetId: "conv_1",
        metadata: { assignedTo: "usr_1" },
        organizationId: "org_1",
        actorId: "actor_1",
      },
    });
  });

  it("should unassign conversation when membershipId is null", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    prisma.conversation.update.mockResolvedValue({
      id: "conv_1",
      assignedMembership: null,
    });

    const result = await service.assignConversation(
      "org_1",
      "actor_1",
      "conv_1",
      null,
    );

    expect(result).toEqual({
      id: "conv_1",
      assignedMembership: null,
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: "conversation.unassigned",
        targetId: "conv_1",
        metadata: { assignedTo: null },
        organizationId: "org_1",
        actorId: "actor_1",
      },
    });
  });

  it("should reject assign when target membership is outside organization", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    prisma.membership.findFirst.mockResolvedValue(null);

    await expect(
      service.assignConversation("org_1", "actor_1", "conv_1", "mem_x"),
    ).rejects.toEqual(
      new BadRequestException("Membership not found in this organization"),
    );
  });

  it("should return 404 when conversation does not exist in organization", async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);

    await expect(
      service.assignConversation("org_1", "actor_1", "conv_404", "mem_1"),
    ).rejects.toEqual(new NotFoundException("Conversation not found"));
  });

  it("should support self-assignment", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    prisma.membership.findFirst.mockResolvedValue({
      id: "mem_self",
      user: { id: "actor_1" },
    });
    prisma.conversation.update.mockResolvedValue({
      id: "conv_1",
      assignedMembership: {
        id: "mem_self",
        user: {
          id: "actor_1",
          name: "Ali Yılmaz",
          email: "owner@acme.com",
        },
      },
    });

    const result = await service.assignConversation(
      "org_1",
      "actor_1",
      "conv_1",
      "mem_self",
    );

    expect(result.assignedMembership?.user.id).toBe("actor_1");
  });

  it("should resolve conversation and write audit event", async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conv_1",
      status: "OPEN",
    });
    prisma.conversation.update.mockResolvedValue({
      id: "conv_1",
      status: "RESOLVED",
    });

    const result = await service.updateConversationStatus(
      "org_1",
      "actor_1",
      "conv_1",
      "RESOLVED",
    );

    expect(result).toEqual({
      id: "conv_1",
      status: "RESOLVED",
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: "conversation.resolved",
        targetId: "conv_1",
        metadata: {
          fromStatus: "OPEN",
          toStatus: "RESOLVED",
        },
        organizationId: "org_1",
        actorId: "actor_1",
      },
    });
  });

  it("should reopen conversation and write audit event", async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conv_1",
      status: "RESOLVED",
    });
    prisma.conversation.update.mockResolvedValue({
      id: "conv_1",
      status: "OPEN",
    });

    const result = await service.updateConversationStatus(
      "org_1",
      "actor_1",
      "conv_1",
      "OPEN",
    );

    expect(result).toEqual({
      id: "conv_1",
      status: "OPEN",
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: "conversation.reopened",
        targetId: "conv_1",
        metadata: {
          fromStatus: "RESOLVED",
          toStatus: "OPEN",
        },
        organizationId: "org_1",
        actorId: "actor_1",
      },
    });
  });

  it("should no-op when status is unchanged", async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conv_1",
      status: "OPEN",
    });

    const result = await service.updateConversationStatus(
      "org_1",
      "actor_1",
      "conv_1",
      "OPEN",
    );

    expect(result).toEqual({
      id: "conv_1",
      status: "OPEN",
    });
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("should return 404 for updateConversationStatus on cross-tenant conversation", async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);

    await expect(
      service.updateConversationStatus("org_other", "actor_1", "conv_1", "RESOLVED"),
    ).rejects.toEqual(new NotFoundException("Conversation not found"));
  });

  it("should include assignedMembership in conversations list", async () => {
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv_1",
        status: "OPEN",
        contactName: "Ahmet Kaya",
        lastMessageAt: new Date("2026-03-01T10:00:00.000Z"),
        channel: { type: "WHATSAPP" },
        assignedMembership: {
          id: "mem_1",
          user: {
            id: "usr_1",
            name: "Zeynep Demir",
            email: "agent@acme.com",
          },
        },
        tags: [],
      },
      {
        id: "conv_2",
        status: "RESOLVED",
        contactName: "Ayşe Çelik",
        lastMessageAt: null,
        channel: { type: "INSTAGRAM" },
        assignedMembership: null,
        tags: [],
      },
    ]);

    const result = await service.listConversations("org_1");

    expect(result[0].assignedMembership).toEqual({
      id: "mem_1",
      user: { id: "usr_1", name: "Zeynep Demir" },
    });
    expect(result[1].assignedMembership).toBeNull();
    expect(result[0].status).toBe("OPEN");
    expect(result[1].status).toBe("RESOLVED");
  });

  it("should list organization members for assign dropdown", async () => {
    prisma.membership.findMany.mockResolvedValue([
      {
        id: "mem_1",
        role: "OWNER",
        user: { name: "Ali Yılmaz" },
      },
      {
        id: "mem_2",
        role: "AGENT",
        user: { name: "Zeynep Demir" },
      },
    ]);

    const result = await service.listOrganizationMembers("org_1");

    expect(result).toEqual([
      { membershipId: "mem_1", name: "Ali Yılmaz", role: "OWNER" },
      { membershipId: "mem_2", name: "Zeynep Demir", role: "AGENT" },
    ]);
  });

  // ── Tag service tests ───────────────────────────────────

  it("should list conversation tags", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    prisma.conversationTag.findMany.mockResolvedValue([
      { tag: { id: "t1", name: "vip" } },
      { tag: { id: "t2", name: "iade" } },
    ]);

    const result = await service.listConversationTags("org_1", "conv_1");

    expect(result).toEqual([
      { id: "t1", name: "vip" },
      { id: "t2", name: "iade" },
    ]);
  });

  it("should add tag: create-or-reuse tag + attach to conversation", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    prisma.tag.upsert.mockResolvedValue({ id: "t1", name: "vip" });
    prisma.conversationTag.upsert.mockResolvedValue({});

    const result = await service.addTagToConversation("org_1", "conv_1", " VIP ");

    expect(result).toEqual({ id: "t1", name: "vip" });
    expect(prisma.tag.upsert).toHaveBeenCalledWith({
      where: { organizationId_name: { organizationId: "org_1", name: "vip" } },
      update: {},
      create: { name: "vip", organizationId: "org_1" },
    });
    expect(prisma.conversationTag.upsert).toHaveBeenCalledWith({
      where: { conversationId_tagId: { conversationId: "conv_1", tagId: "t1" } },
      update: {},
      create: { conversationId: "conv_1", tagId: "t1" },
    });
  });

  it("should return 404 when adding tag to cross-tenant conversation", async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);

    await expect(
      service.addTagToConversation("org_other", "conv_1", "vip"),
    ).rejects.toEqual(new NotFoundException("Conversation not found"));
  });

  it("should remove tag from conversation", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    prisma.conversationTag.findUnique.mockResolvedValue({
      conversationId: "conv_1",
      tagId: "t1",
    });
    prisma.conversationTag.delete.mockResolvedValue({});

    await service.removeTagFromConversation("org_1", "conv_1", "t1");

    expect(prisma.conversationTag.delete).toHaveBeenCalledWith({
      where: { conversationId_tagId: { conversationId: "conv_1", tagId: "t1" } },
    });
  });

  it("should return 404 when removing tag that is not on conversation", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    prisma.conversationTag.findUnique.mockResolvedValue(null);

    await expect(
      service.removeTagFromConversation("org_1", "conv_1", "t_nonexistent"),
    ).rejects.toEqual(
      new NotFoundException("Tag not found on this conversation"),
    );
  });

  it("should include tags in conversations list", async () => {
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv_1",
        status: "OPEN",
        contactName: "Ahmet Kaya",
        lastMessageAt: new Date("2026-03-01T10:00:00.000Z"),
        channel: { type: "WHATSAPP" },
        assignedMembership: null,
        tags: [
          { tag: { id: "t1", name: "vip" } },
          { tag: { id: "t2", name: "iade" } },
        ],
      },
    ]);

    const result = await service.listConversations("org_1");

    expect(result[0].tags).toEqual([
      { id: "t1", name: "vip" },
      { id: "t2", name: "iade" },
    ]);
  });

  // ── Note service tests ──────────────────────────────────

  it("should list conversation notes", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    prisma.note.findMany.mockResolvedValue([
      {
        id: "n1",
        body: "Müşteri VIP",
        createdAt: new Date("2026-03-01T10:00:00.000Z"),
        author: { id: "usr_1", name: "Zeynep Demir", email: "agent@acme.com" },
      },
    ]);

    const result = await service.listConversationNotes("org_1", "conv_1");

    expect(result).toEqual([
      {
        id: "n1",
        body: "Müşteri VIP",
        createdAt: new Date("2026-03-01T10:00:00.000Z"),
        author: { id: "usr_1", name: "Zeynep Demir", email: "agent@acme.com" },
      },
    ]);
  });

  it("should create a conversation note with trimmed body", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    prisma.note.create.mockResolvedValue({
      id: "n1",
      body: "İade talebi var",
      createdAt: new Date("2026-03-01T11:00:00.000Z"),
      author: { id: "usr_1", name: "Zeynep Demir", email: "agent@acme.com" },
    });

    const result = await service.createConversationNote(
      "org_1",
      "usr_1",
      "conv_1",
      "  İade talebi var  ",
    );

    expect(result).toEqual({
      id: "n1",
      body: "İade talebi var",
      createdAt: new Date("2026-03-01T11:00:00.000Z"),
      author: { id: "usr_1", name: "Zeynep Demir", email: "agent@acme.com" },
    });
    expect(prisma.note.create).toHaveBeenCalledWith({
      data: {
        body: "İade talebi var",
        conversationId: "conv_1",
        authorId: "usr_1",
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
  });

  it("should return 404 when listing notes for cross-tenant conversation", async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);

    await expect(
      service.listConversationNotes("org_other", "conv_1"),
    ).rejects.toEqual(new NotFoundException("Conversation not found"));
  });

  it("should return 404 when creating note for cross-tenant conversation", async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);

    await expect(
      service.createConversationNote("org_other", "usr_1", "conv_1", "test"),
    ).rejects.toEqual(new NotFoundException("Conversation not found"));
  });

  // ── Filter tests ──────────────────────────────────────────

  it("should pass status filter to prisma where clause", async () => {
    prisma.conversation.findMany.mockResolvedValue([]);

    await service.listConversations("org_1", { status: "OPEN" });

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org_1", status: "OPEN" },
      }),
    );
  });

  it("should pass channel filter to prisma where clause", async () => {
    prisma.conversation.findMany.mockResolvedValue([]);

    await service.listConversations("org_1", { channel: "INSTAGRAM" });

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org_1", channel: { type: "INSTAGRAM" } },
      }),
    );
  });

  it("should pass assigneeId filter to prisma where clause", async () => {
    prisma.conversation.findMany.mockResolvedValue([]);

    await service.listConversations("org_1", { assigneeId: "mem_1" });

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org_1", assignedMembershipId: "mem_1" },
      }),
    );
  });

  it("should pass tagId filter to prisma where clause", async () => {
    prisma.conversation.findMany.mockResolvedValue([]);

    await service.listConversations("org_1", { tagId: "t1" });

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org_1", tags: { some: { tagId: "t1" } } },
      }),
    );
  });

  it("should pass search filter with OR clause for contactName and lastMessageText", async () => {
    prisma.conversation.findMany.mockResolvedValue([]);

    await service.listConversations("org_1", { search: "kargo" });

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org_1",
          OR: [
            { contactName: { contains: "kargo", mode: "insensitive" } },
            { lastMessageText: { contains: "kargo", mode: "insensitive" } },
          ],
        },
      }),
    );
  });

  it("should combine multiple filters", async () => {
    prisma.conversation.findMany.mockResolvedValue([]);

    await service.listConversations("org_1", {
      status: "OPEN",
      channel: "WHATSAPP",
      search: "test",
    });

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org_1",
          status: "OPEN",
          channel: { type: "WHATSAPP" },
          OR: [
            { contactName: { contains: "test", mode: "insensitive" } },
            { lastMessageText: { contains: "test", mode: "insensitive" } },
          ],
        },
      }),
    );
  });

  it("should ignore empty search string", async () => {
    prisma.conversation.findMany.mockResolvedValue([]);

    await service.listConversations("org_1", { search: "   " });

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org_1" },
      }),
    );
  });
});
