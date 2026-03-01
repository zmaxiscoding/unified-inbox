import { ArgumentMetadata, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { AddTagDto } from "./dto/add-tag.dto";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { CreateMessageDto } from "./dto/create-message.dto";

const VALID_CUID_MEMBERSHIP_ID = "cjfne4n3f0000qzrmn831i7rn";

describe("ConversationsController", () => {
  let controller: ConversationsController;
  let service: {
    listConversations: jest.Mock;
    listOrganizationMembers: jest.Mock;
    listConversationMessages: jest.Mock;
    createOutboundMessage: jest.Mock;
    assignConversation: jest.Mock;
    listConversationTags: jest.Mock;
    addTagToConversation: jest.Mock;
    removeTagFromConversation: jest.Mock;
  };
  const session: SessionPayload = {
    userId: "user_1",
    organizationId: "org_1",
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
      listConversationTags: jest.fn(),
      addTagToConversation: jest.fn(),
      removeTagFromConversation: jest.fn(),
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
    expect(service.addTagToConversation).toHaveBeenCalledWith("org_1", "c1", "VIP");
  });

  it("should remove tag via service", async () => {
    service.removeTagFromConversation.mockResolvedValue(undefined);

    await controller.removeTag("c1", "t1", session);

    expect(service.removeTagFromConversation).toHaveBeenCalledWith("org_1", "c1", "t1");
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
});
