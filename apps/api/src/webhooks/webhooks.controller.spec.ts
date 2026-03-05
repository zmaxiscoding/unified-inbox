import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";

describe("WebhooksController", () => {
  let controller: WebhooksController;
  let service: {
    verifyWhatsAppWebhook: jest.Mock;
    handleWhatsAppWebhook: jest.Mock;
    verifyInstagramWebhook: jest.Mock;
    handleInstagramWebhook: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      verifyWhatsAppWebhook: jest.fn(),
      handleWhatsAppWebhook: jest.fn(),
      verifyInstagramWebhook: jest.fn(),
      handleInstagramWebhook: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [{ provide: WebhooksService, useValue: service }],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  it("should verify whatsapp webhook via service", () => {
    service.verifyWhatsAppWebhook.mockReturnValue("challenge-123");

    const result = controller.verifyWhatsAppWebhook({
      "hub.mode": "subscribe",
      "hub.verify_token": "token-1",
      "hub.challenge": "challenge-123",
    });

    expect(result).toBe("challenge-123");
    expect(service.verifyWhatsAppWebhook).toHaveBeenCalledWith(
      "subscribe",
      "token-1",
      "challenge-123",
    );
  });

  it("should support nested hub query object format", () => {
    service.verifyWhatsAppWebhook.mockReturnValue("challenge-xyz");

    const result = controller.verifyWhatsAppWebhook({
      hub: {
        mode: "subscribe",
        verify_token: "token-2",
        challenge: "challenge-xyz",
      },
    });

    expect(result).toBe("challenge-xyz");
    expect(service.verifyWhatsAppWebhook).toHaveBeenCalledWith(
      "subscribe",
      "token-2",
      "challenge-xyz",
    );
  });

  it("should pass x-org-id, signature and rawBody to service", async () => {
    service.handleWhatsAppWebhook.mockResolvedValue({ ok: true });
    const payload = { entry: [] };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const request = { rawBody } as Request & { rawBody: Buffer };

    const result = await controller.handleWhatsAppWebhook(
      payload,
      "org_1",
      "sha256=abc",
      request,
    );

    expect(result).toEqual({ ok: true });
    expect(service.handleWhatsAppWebhook).toHaveBeenCalledWith(payload, {
      xOrgIdHeader: "org_1",
      signatureHeader: "sha256=abc",
      rawBody,
    });
  });

  it("should verify instagram webhook via service", () => {
    service.verifyInstagramWebhook.mockReturnValue("ig-challenge-123");

    const result = controller.verifyInstagramWebhook({
      "hub.mode": "subscribe",
      "hub.verify_token": "ig-token-1",
      "hub.challenge": "ig-challenge-123",
    });

    expect(result).toBe("ig-challenge-123");
    expect(service.verifyInstagramWebhook).toHaveBeenCalledWith(
      "subscribe",
      "ig-token-1",
      "ig-challenge-123",
    );
  });

  it("should pass x-org-id, signature and rawBody to instagram handler", async () => {
    service.handleInstagramWebhook.mockResolvedValue({ ok: true });
    const payload = { entry: [] };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const request = { rawBody } as Request & { rawBody: Buffer };

    const result = await controller.handleInstagramWebhook(
      payload,
      "org_1",
      "sha256=abc",
      request,
    );

    expect(result).toEqual({ ok: true });
    expect(service.handleInstagramWebhook).toHaveBeenCalledWith(payload, {
      xOrgIdHeader: "org_1",
      signatureHeader: "sha256=abc",
      rawBody,
    });
  });
});
