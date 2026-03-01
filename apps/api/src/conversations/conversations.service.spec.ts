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
      },
      {
        id: "conv_2",
        contactName: "Ayşe Çelik",
        lastMessageAt: null,
        channel: { type: "INSTAGRAM" },
        assignedMembership: null,
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
});
