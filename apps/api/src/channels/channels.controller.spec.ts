import { ArgumentMetadata, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ChannelsController } from "./channels.controller";
import { ChannelsService } from "./channels.service";
import { ConnectInstagramChannelDto } from "./dto/connect-instagram-channel.dto";
import { ConnectWhatsAppChannelDto } from "./dto/connect-whatsapp-channel.dto";

describe("ChannelsController", () => {
  let controller: ChannelsController;
  let service: {
    listChannels: jest.Mock;
    connectWhatsAppChannel: jest.Mock;
    connectInstagramChannel: jest.Mock;
    disconnectChannel: jest.Mock;
  };

  const session: SessionPayload = {
    userId: "user_1",
    organizationId: "org_1",
    sessionVersion: 0,
    role: "OWNER",
    iat: 1,
    exp: 2,
  };

  beforeEach(async () => {
    service = {
      listChannels: jest.fn(),
      connectWhatsAppChannel: jest.fn(),
      connectInstagramChannel: jest.fn(),
      disconnectChannel: jest.fn(),
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

  it("should reject channel settings reads for AGENT role", () => {
    expect(() =>
      controller.listChannels({
        ...session,
        role: "AGENT",
      }),
    ).toThrow("Only owners can view channel settings");

    expect(service.listChannels).not.toHaveBeenCalled();
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

  it("should reject whatsapp connect for AGENT role", async () => {
    const payload: ConnectWhatsAppChannelDto = {
      phoneNumberId: "12345",
      accessToken: "token",
    };

    expect(() =>
      controller.connectWhatsAppChannel(payload, {
        ...session,
        role: "AGENT",
      }),
    ).toThrow("Only owners can manage channels");

    expect(service.connectWhatsAppChannel).not.toHaveBeenCalled();
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

  it("should connect instagram via service", async () => {
    service.connectInstagramChannel.mockResolvedValue({ id: "ca_2" });

    const payload: ConnectInstagramChannelDto = {
      instagramAccountId: "ig_12345",
      accessToken: "token",
      displayName: "My Brand",
    };

    const result = await controller.connectInstagramChannel(payload, session);

    expect(result).toEqual({ id: "ca_2" });
    expect(service.connectInstagramChannel).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      payload,
    );
  });

  it("should reject instagram connect for AGENT role", async () => {
    const payload: ConnectInstagramChannelDto = {
      instagramAccountId: "ig_12345",
      accessToken: "token",
    };

    expect(() =>
      controller.connectInstagramChannel(payload, {
        ...session,
        role: "AGENT",
      }),
    ).toThrow("Only owners can manage channels");

    expect(service.connectInstagramChannel).not.toHaveBeenCalled();
  });

  it("should reject blank instagramAccountId payload", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: ConnectInstagramChannelDto,
      data: "",
    };

    await expect(
      pipe.transform({ instagramAccountId: "   ", accessToken: "token" }, metadata),
    ).rejects.toThrow();
  });

  it("should disconnect channel via service", async () => {
    service.disconnectChannel.mockResolvedValue(undefined);

    await controller.disconnectChannel("ca_1", session);

    expect(service.disconnectChannel).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      "ca_1",
    );
  });

  it("should reject channel disconnect for AGENT role", () => {
    expect(() =>
      controller.disconnectChannel("ca_1", {
        ...session,
        role: "AGENT",
      }),
    ).toThrow("Only owners can manage channels");

    expect(service.disconnectChannel).not.toHaveBeenCalled();
  });
});
