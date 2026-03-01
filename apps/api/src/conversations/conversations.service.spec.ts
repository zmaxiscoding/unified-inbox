import {
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
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
  };

  beforeEach(() => {
    prisma = {
      conversation: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
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
    };

    service = new ConversationsService(prisma as unknown as PrismaService);
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

  it("should include assignedMembership in conversations list", async () => {
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv_1",
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
});
