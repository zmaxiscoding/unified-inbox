import { ArgumentMetadata, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { AddTagDto } from "./dto/add-tag.dto";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { CreateMessageDto } from "./dto/create-message.dto";
import { CreateNoteDto } from "./dto/create-note.dto";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import { UpdateConversationStatusDto } from "./dto/update-conversation-status.dto";

const VALID_CUID_MEMBERSHIP_ID = "cjfne4n3f0000qzrmn831i7rn";

describe("ConversationsController", () => {
  let controller: ConversationsController;
  let service: {
    listConversations: jest.Mock;
    listOrganizationMembers: jest.Mock;
    listConversationMessages: jest.Mock;
    createOutboundMessage: jest.Mock;
    assignConversation: jest.Mock;
    updateConversationStatus: jest.Mock;
    listConversationTags: jest.Mock;
    addTagToConversation: jest.Mock;
    removeTagFromConversation: jest.Mock;
    listConversationNotes: jest.Mock;
    createConversationNote: jest.Mock;
  };
  const session: SessionPayload = {
    userId: "user_1",
    organizationId: "org_1",
    sessionVersion: 0,
    iat: 1,
    exp: 2,
  };

  beforeEach(async () => {
    service = {
      listConversations: jest.fn(),
      listOrganizationMembers: jest.fn(),
      listConversationMessages: jest.fn(),
      createOutboundMessage: jest.fn(),
      assignConversation: jest.fn(),
      updateConversationStatus: jest.fn(),
      listConversationTags: jest.fn(),
      addTagToConversation: jest.fn(),
      removeTagFromConversation: jest.fn(),
      listConversationNotes: jest.fn(),
      createConversationNote: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        {
          provide: ConversationsService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ConversationsController>(ConversationsController);
  });

  it("should reject blank text payload", async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: CreateMessageDto,
      data: "",
    };

    await expect(pipe.transform({ text: "   " }, metadata)).rejects.toThrow();
  });

  it("should create outbound message via service", async () => {
    service.createOutboundMessage.mockResolvedValue({ id: "m1" });

    const result = await controller.createMessage("c1", { text: "hello" }, session);

    expect(result).toEqual({ id: "m1" });
    expect(service.createOutboundMessage).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      "c1",
      "hello",
    );
  });

  it("should list members via service", async () => {
    service.listOrganizationMembers.mockResolvedValue([{ membershipId: "m1" }]);

    const result = await controller.getOrganizationMembers(session);

    expect(result).toEqual([{ membershipId: "m1" }]);
    expect(service.listOrganizationMembers).toHaveBeenCalledWith("org_1");
  });

  it("should assign conversation via service", async () => {
    service.assignConversation.mockResolvedValue({ id: "c1" });

    const result = await controller.assignConversation(
      "c1",
      { membershipId: VALID_CUID_MEMBERSHIP_ID },
      session,
    );

    expect(result).toEqual({ id: "c1" });
    expect(service.assignConversation).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      "c1",
      VALID_CUID_MEMBERSHIP_ID,
    );
  });

  it("should allow null membershipId for unassign path", async () => {
    service.assignConversation.mockResolvedValue({ id: "c1", assignedMembership: null });

    const result = await controller.assignConversation(
      "c1",
      { membershipId: null },
      session,
    );

    expect(result).toEqual({ id: "c1", assignedMembership: null });
    expect(service.assignConversation).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      "c1",
      null,
    );
  });

  it("should update conversation status via service", async () => {
    service.updateConversationStatus.mockResolvedValue({
      id: "c1",
      status: "RESOLVED",
    });

    const result = await controller.updateConversationStatus(
      "c1",
      { status: "RESOLVED" },
      session,
    );

    expect(result).toEqual({
      id: "c1",
      status: "RESOLVED",
    });
    expect(service.updateConversationStatus).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      "c1",
      "RESOLVED",
    );
  });

  it("should reject assign payload when membershipId is missing", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: AssignConversationDto,
      data: "",
    };

    await expect(pipe.transform({}, metadata)).rejects.toThrow();
  });

  it("should allow assign payload when membershipId is null", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: AssignConversationDto,
      data: "",
    };

    await expect(pipe.transform({ membershipId: null }, metadata)).resolves.toEqual({
      membershipId: null,
    });
  });

  it("should reject assign payload when unknown field exists", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: AssignConversationDto,
      data: "",
    };

    await expect(
      pipe.transform(
        { membershipId: VALID_CUID_MEMBERSHIP_ID, extra: "nope" },
        metadata,
      ),
    ).rejects.toThrow();
  });

  it("should allow assign payload when membershipId is a CUID", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: AssignConversationDto,
      data: "",
    };

    await expect(
      pipe.transform(
        { membershipId: VALID_CUID_MEMBERSHIP_ID },
        metadata,
      ),
    ).resolves.toEqual({ membershipId: VALID_CUID_MEMBERSHIP_ID });
  });

  it("should reject assign payload when membershipId is not a CUID", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: AssignConversationDto,
      data: "",
    };

    await expect(
      pipe.transform(
        { membershipId: "not-a-cuid" },
        metadata,
      ),
    ).rejects.toThrow();
  });

  it("should accept status payload OPEN", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: UpdateConversationStatusDto,
      data: "",
    };

    await expect(pipe.transform({ status: "OPEN" }, metadata)).resolves.toEqual({
      status: "OPEN",
    });
  });

  it("should accept status payload RESOLVED", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: UpdateConversationStatusDto,
      data: "",
    };

    await expect(pipe.transform({ status: "RESOLVED" }, metadata)).resolves.toEqual({
      status: "RESOLVED",
    });
  });

  it("should reject status payload outside OPEN and RESOLVED", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: UpdateConversationStatusDto,
      data: "",
    };

    await expect(
      pipe.transform({ status: "SNOOZED" }, metadata),
    ).rejects.toThrow();
  });

  // ── Tag endpoint tests ──────────────────────────────────

  it("should list tags via service", async () => {
    service.listConversationTags.mockResolvedValue([{ id: "t1", name: "vip" }]);

    const result = await controller.getConversationTags("c1", session);

    expect(result).toEqual([{ id: "t1", name: "vip" }]);
    expect(service.listConversationTags).toHaveBeenCalledWith("org_1", "c1");
  });

  it("should add tag via service", async () => {
    service.addTagToConversation.mockResolvedValue({ id: "t1", name: "vip" });

    const result = await controller.addTag("c1", { name: "VIP" }, session);

    expect(result).toEqual({ id: "t1", name: "vip" });
    expect(service.addTagToConversation).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      "c1",
      "VIP",
    );
  });

  it("should remove tag via service", async () => {
    service.removeTagFromConversation.mockResolvedValue(undefined);

    await controller.removeTag("c1", "t1", session);

    expect(service.removeTagFromConversation).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      "c1",
      "t1",
    );
  });

  it("should reject blank tag name", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: AddTagDto,
      data: "",
    };

    await expect(pipe.transform({ name: "   " }, metadata)).rejects.toThrow();
  });

  it("should reject tag payload with unknown fields", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: AddTagDto,
      data: "",
    };

    await expect(
      pipe.transform({ name: "vip", extra: "nope" }, metadata),
    ).rejects.toThrow();
  });

  it("should accept valid tag name", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: AddTagDto,
      data: "",
    };

    await expect(
      pipe.transform({ name: "VIP" }, metadata),
    ).resolves.toEqual({ name: "VIP" });
  });

  // ── Note endpoint tests ─────────────────────────────────

  it("should list notes via service", async () => {
    service.listConversationNotes.mockResolvedValue([
      {
        id: "n1",
        body: "Müşteri VIP",
        createdAt: "2026-03-01T10:00:00.000Z",
        author: { id: "usr_1", name: "Zeynep Demir", email: "agent@acme.com" },
      },
    ]);

    const result = await controller.getConversationNotes("c1", session);

    expect(result).toEqual([
      {
        id: "n1",
        body: "Müşteri VIP",
        createdAt: "2026-03-01T10:00:00.000Z",
        author: { id: "usr_1", name: "Zeynep Demir", email: "agent@acme.com" },
      },
    ]);
    expect(service.listConversationNotes).toHaveBeenCalledWith("org_1", "c1");
  });

  it("should create note via service", async () => {
    service.createConversationNote.mockResolvedValue({
      id: "n1",
      body: "İade talebi var",
      createdAt: "2026-03-01T11:00:00.000Z",
      author: { id: "user_1", name: "Ali Yılmaz", email: "owner@acme.com" },
    });

    const result = await controller.createNote(
      "c1",
      { body: "İade talebi var" },
      session,
    );

    expect(result).toEqual({
      id: "n1",
      body: "İade talebi var",
      createdAt: "2026-03-01T11:00:00.000Z",
      author: { id: "user_1", name: "Ali Yılmaz", email: "owner@acme.com" },
    });
    expect(service.createConversationNote).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      "c1",
      "İade talebi var",
    );
  });

  it("should reject blank note body", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: CreateNoteDto,
      data: "",
    };

    await expect(pipe.transform({ body: "   " }, metadata)).rejects.toThrow();
  });

  it("should reject note payload with unknown fields", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: CreateNoteDto,
      data: "",
    };

    await expect(
      pipe.transform({ body: "test", extra: "nope" }, metadata),
    ).rejects.toThrow();
  });

  it("should accept valid note body", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: CreateNoteDto,
      data: "",
    };

    await expect(
      pipe.transform({ body: "Bu bir not" }, metadata),
    ).resolves.toEqual({ body: "Bu bir not" });
  });

  // ── List conversations with filters ───────────────────────

  it("should list conversations with filters via service", async () => {
    service.listConversations.mockResolvedValue([]);

    const query: ListConversationsQueryDto = { status: "OPEN", channel: "WHATSAPP" };
    const result = await controller.getConversations(session, query);

    expect(result).toEqual([]);
    expect(service.listConversations).toHaveBeenCalledWith("org_1", query);
  });

  it("should list conversations without filters", async () => {
    service.listConversations.mockResolvedValue([]);

    const result = await controller.getConversations(session, {});

    expect(result).toEqual([]);
    expect(service.listConversations).toHaveBeenCalledWith("org_1", {});
  });

  // ── Filter DTO validation ─────────────────────────────────

  it("should accept valid filter query params", async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const metadata: ArgumentMetadata = {
      type: "query",
      metatype: ListConversationsQueryDto,
      data: "",
    };

    await expect(
      pipe.transform({ status: "OPEN", channel: "INSTAGRAM", search: "test" }, metadata),
    ).resolves.toEqual({ status: "OPEN", channel: "INSTAGRAM", search: "test" });
  });

  it("should reject invalid status filter", async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const metadata: ArgumentMetadata = {
      type: "query",
      metatype: ListConversationsQueryDto,
      data: "",
    };

    await expect(
      pipe.transform({ status: "SNOOZED" }, metadata),
    ).rejects.toThrow();
  });

  it("should reject invalid channel filter", async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const metadata: ArgumentMetadata = {
      type: "query",
      metatype: ListConversationsQueryDto,
      data: "",
    };

    await expect(
      pipe.transform({ channel: "EMAIL" }, metadata),
    ).rejects.toThrow();
  });

  it("should accept empty filter query", async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const metadata: ArgumentMetadata = {
      type: "query",
      metatype: ListConversationsQueryDto,
      data: "",
    };

    await expect(pipe.transform({}, metadata)).resolves.toEqual({});
  });
});
