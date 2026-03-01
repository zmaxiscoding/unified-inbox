import { ArgumentMetadata, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { CreateMessageDto } from "./dto/create-message.dto";

describe("ConversationsController", () => {
  let controller: ConversationsController;
  let service: {
    listConversations: jest.Mock;
    listOrganizationMembers: jest.Mock;
    listConversationMessages: jest.Mock;
    createOutboundMessage: jest.Mock;
    assignConversation: jest.Mock;
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
      { membershipId: "mem_1" },
      session,
    );

    expect(result).toEqual({ id: "c1" });
    expect(service.assignConversation).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      "c1",
      "mem_1",
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
        { membershipId: "mem_1", extra: "nope" },
        metadata,
      ),
    ).rejects.toThrow();
  });
});
