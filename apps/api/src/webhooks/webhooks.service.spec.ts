import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WebhooksQueueService } from "./webhooks.queue.service";
import { WebhooksService } from "./webhooks.service";

const WHATSAPP_TEXT_PAYLOAD = {
  entry: [
    {
      changes: [
        {
          value: {
            metadata: {
              phone_number_id: "12345",
            },
            messages: [
              {
                id: "wamid.abc123",
                from: "905551112233",
                type: "text",
                text: {
                  body: "Merhaba",
                },
              },
            ],
          },
        },
      ],
    },
  ],
};

describe("WebhooksService", () => {
  let service: WebhooksService;
  let prisma: {
    channelAccount: {
      findFirst: jest.Mock;
    };
    organization: {
      findUnique: jest.Mock;
    };
    rawWebhookEvent: {
      create: jest.Mock;
    };
  };
  let queue: {
    enqueue: jest.Mock;
  };

  beforeEach(() => {
    delete process.env.ENABLE_DEV_ENDPOINTS;

    prisma = {
      channelAccount: {
        findFirst: jest.fn(),
      },
      organization: {
        findUnique: jest.fn(),
      },
      rawWebhookEvent: {
        create: jest.fn(),
      },
    };

    queue = {
      enqueue: jest.fn(),
    };

    service = new WebhooksService(
      prisma as unknown as PrismaService,
      queue as unknown as WebhooksQueueService,
    );
  });

  afterEach(() => {
    delete process.env.ENABLE_DEV_ENDPOINTS;
  });

  it("should return 400 for unmapped phone_number_id", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue(null);

    await expect(
      service.handleWhatsAppWebhook(WHATSAPP_TEXT_PAYLOAD),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.rawWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("should create raw webhook event for mapped phone_number_id", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue({ organizationId: "org_1" });
    prisma.rawWebhookEvent.create.mockResolvedValue({ id: "rwe_1" });

    const result = await service.handleWhatsAppWebhook(WHATSAPP_TEXT_PAYLOAD);

    expect(result).toEqual({ ok: true });
    expect(prisma.rawWebhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_1",
          externalAccountId: "12345",
          providerMessageId: "wamid.abc123",
        }),
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith("rwe_1");
  });

  it("should allow X-ORG-ID fallback only when ENABLE_DEV_ENDPOINTS=true", async () => {
    process.env.ENABLE_DEV_ENDPOINTS = "true";
    prisma.channelAccount.findFirst.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue({ id: "org_dev" });
    prisma.rawWebhookEvent.create.mockResolvedValue({ id: "rwe_2" });

    const result = await service.handleWhatsAppWebhook(
      WHATSAPP_TEXT_PAYLOAD,
      "org_dev",
    );

    expect(result).toEqual({ ok: true });
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: "org_dev" },
      select: { id: true },
    });
  });

  it("should no-op duplicate providerMessageId", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue({ organizationId: "org_1" });
    prisma.rawWebhookEvent.create.mockRejectedValue({ code: "P2002" });

    const result = await service.handleWhatsAppWebhook(WHATSAPP_TEXT_PAYLOAD);

    expect(result).toEqual({ ok: true, duplicate: true });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
