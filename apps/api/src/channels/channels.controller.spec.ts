import { ArgumentMetadata, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ChannelsController } from "./channels.controller";
import { ChannelsService } from "./channels.service";
import { ConnectWhatsAppChannelDto } from "./dto/connect-whatsapp-channel.dto";

describe("ChannelsController", () => {
  let controller: ChannelsController;
  let service: {
    listChannels: jest.Mock;
    connectWhatsAppChannel: jest.Mock;
  };

  const session: SessionPayload = {
    userId: "user_1",
    organizationId: "org_1",
    iat: 1,
    exp: 2,
  };

  beforeEach(async () => {
    service = {
      listChannels: jest.fn(),
      connectWhatsAppChannel: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChannelsController],
      providers: [{ provide: ChannelsService, useValue: service }],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChannelsController>(ChannelsController);
  });

  it("should list channels via service", async () => {
    service.listChannels.mockResolvedValue([{ id: "ca_1" }]);

    const result = await controller.listChannels(session);

    expect(result).toEqual([{ id: "ca_1" }]);
    expect(service.listChannels).toHaveBeenCalledWith("org_1");
  });

  it("should connect whatsapp via service", async () => {
    service.connectWhatsAppChannel.mockResolvedValue({ id: "ca_1" });

    const payload: ConnectWhatsAppChannelDto = {
      phoneNumberId: "12345",
      accessToken: "token",
      displayPhoneNumber: "+90 555 111 22 33",
      wabaId: "waba_1",
    };

    const result = await controller.connectWhatsAppChannel(payload, session);

    expect(result).toEqual({ id: "ca_1" });
    expect(service.connectWhatsAppChannel).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      payload,
    );
  });

  it("should reject blank phoneNumberId payload", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: ConnectWhatsAppChannelDto,
      data: "",
    };

    await expect(
      pipe.transform({ phoneNumberId: "   ", accessToken: "token" }, metadata),
    ).rejects.toThrow();
  });

  it("should reject blank accessToken payload", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: ConnectWhatsAppChannelDto,
      data: "",
    };

    await expect(
      pipe.transform({ phoneNumberId: "12345", accessToken: "   " }, metadata),
    ).rejects.toThrow();
  });
});
