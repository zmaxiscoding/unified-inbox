import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DevController } from "./dev.controller";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { DevEndpointsGuard } from "./dev-endpoints.guard";
import { DevService } from "./dev.service";
import { SimulateInboundDto } from "./simulate-inbound.dto";

describe("DevController", () => {
  let controller: DevController;
  let devService: { simulateInbound: jest.Mock };

  beforeEach(async () => {
    devService = {
      simulateInbound: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DevController],
      providers: [{ provide: DevService, useValue: devService }],
    })
      .overrideGuard(DevEndpointsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DevController>(DevController);
  });

  it("should call devService.simulateInbound with session orgId and dto", async () => {
    devService.simulateInbound.mockResolvedValue({ ok: true, rawWebhookEventId: "rwe_1" });

    const session = { userId: "u1", organizationId: "org_1", iat: 0, exp: 0 };
    const dto = { text: "Hello from customer" } as SimulateInboundDto;

    const result = await controller.simulateInbound(session, dto);

    expect(result).toEqual({ ok: true, rawWebhookEventId: "rwe_1" });
    expect(devService.simulateInbound).toHaveBeenCalledWith(
      "org_1",
      "Hello from customer",
      undefined,
    );
  });

  it("should pass customerDisplay when provided", async () => {
    devService.simulateInbound.mockResolvedValue({ ok: true, rawWebhookEventId: "rwe_2" });

    const session = { userId: "u1", organizationId: "org_1", iat: 0, exp: 0 };
    const dto = { text: "Test message", customerDisplay: "905551112233" } as SimulateInboundDto;

    await controller.simulateInbound(session, dto);

    expect(devService.simulateInbound).toHaveBeenCalledWith(
      "org_1",
      "Test message",
      "905551112233",
    );
  });
});

describe("DevEndpointsGuard", () => {
  const previousEnv = process.env;

  beforeEach(() => {
    process.env = { ...previousEnv };
  });

  afterEach(() => {
    process.env = previousEnv;
  });

  it("should allow when ENABLE_DEV_ENDPOINTS=true and not production", () => {
    process.env.ENABLE_DEV_ENDPOINTS = "true";
    process.env.NODE_ENV = "test";

    const guard = new DevEndpointsGuard();
    expect(guard.canActivate()).toBe(true);
  });

  it("should throw NotFoundException when ENABLE_DEV_ENDPOINTS is not set", () => {
    delete process.env.ENABLE_DEV_ENDPOINTS;
    process.env.NODE_ENV = "test";

    const guard = new DevEndpointsGuard();
    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });

  it("should throw NotFoundException when NODE_ENV=production", () => {
    process.env.ENABLE_DEV_ENDPOINTS = "true";
    process.env.NODE_ENV = "production";

    const guard = new DevEndpointsGuard();
    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });

  it("should throw NotFoundException when ENABLE_DEV_ENDPOINTS=false", () => {
    process.env.ENABLE_DEV_ENDPOINTS = "false";
    process.env.NODE_ENV = "test";

    const guard = new DevEndpointsGuard();
    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });
});
