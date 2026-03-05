import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { WebhookProcessingStatus } from "@prisma/client";
import { createHmac } from "node:crypto";
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

const WHATSAPP_STATUS_PAYLOAD = {
  entry: [
    {
      changes: [
        {
          value: {
            metadata: {
              phone_number_id: "12345",
            },
            statuses: [
              {
                id: "wamid.status001",
                status: "delivered",
              },
            ],
          },
        },
      ],
    },
  ],
};

function createSignedWebhookOptions(
  payload: unknown,
  overrides: {
    secret?: string;
    signatureHeader?: string;
    xOrgIdHeader?: string;
    rawBody?: Buffer;
  } = {},
) {
  const rawBody = overrides.rawBody ?? Buffer.from(JSON.stringify(payload));
  const secret = overrides.secret ?? process.env.WHATSAPP_APP_SECRET ?? "";
  const signatureHeader =
    overrides.signatureHeader ??
    `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

  return {
    xOrgIdHeader: overrides.xOrgIdHeader,
    signatureHeader,
    rawBody,
  };
}

describe("WebhooksService", () => {
  const previousEnv = process.env;

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
      findUnique: jest.Mock;
    };
  };
  let queue: {
    enqueue: jest.Mock;
  };

  beforeEach(() => {
    process.env = { ...previousEnv };
    process.env.NODE_ENV = "test";
    process.env.WHATSAPP_APP_SECRET = "test-whatsapp-secret";
    process.env.WHATSAPP_VERIFY_TOKEN = "test-verify-token";
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
        findUnique: jest.fn(),
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
    process.env = previousEnv;
  });

  it("should return challenge for valid verify token", () => {
    const result = service.verifyWhatsAppWebhook(
      "subscribe",
      "test-verify-token",
      "challenge-123",
    );

    expect(result).toBe("challenge-123");
  });

  it("should return 403 for invalid verify token", () => {
    expect(() =>
      service.verifyWhatsAppWebhook("subscribe", "wrong-token", "challenge-123"),
    ).toThrow(ForbiddenException);
  });

  it("should return 403 for missing signature", async () => {
    await expect(
      service.handleWhatsAppWebhook(WHATSAPP_TEXT_PAYLOAD, {
        rawBody: Buffer.from(JSON.stringify(WHATSAPP_TEXT_PAYLOAD)),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.channelAccount.findFirst).not.toHaveBeenCalled();
    expect(prisma.rawWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("should return 403 for invalid signature", async () => {
    await expect(
      service.handleWhatsAppWebhook(WHATSAPP_TEXT_PAYLOAD, {
        rawBody: Buffer.from(JSON.stringify(WHATSAPP_TEXT_PAYLOAD)),
        signatureHeader: `sha256=${"0".repeat(64)}`,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.channelAccount.findFirst).not.toHaveBeenCalled();
    expect(prisma.rawWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("should return 400 for unmapped phone_number_id", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue(null);

    await expect(
      service.handleWhatsAppWebhook(
        WHATSAPP_TEXT_PAYLOAD,
        createSignedWebhookOptions(WHATSAPP_TEXT_PAYLOAD),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.rawWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("should create raw webhook event for mapped phone_number_id with valid signature", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue({ organizationId: "org_1" });
    prisma.rawWebhookEvent.create.mockResolvedValue({ id: "rwe_1" });

    const result = await service.handleWhatsAppWebhook(
      WHATSAPP_TEXT_PAYLOAD,
      createSignedWebhookOptions(WHATSAPP_TEXT_PAYLOAD),
    );

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

  it("should allow X-ORG-ID fallback only when ENABLE_DEV_ENDPOINTS=true in non-production", async () => {
    process.env.ENABLE_DEV_ENDPOINTS = "true";
    prisma.channelAccount.findFirst.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue({ id: "org_dev" });
    prisma.rawWebhookEvent.create.mockResolvedValue({ id: "rwe_2" });

    const result = await service.handleWhatsAppWebhook(WHATSAPP_TEXT_PAYLOAD, {
      xOrgIdHeader: "org_dev",
    });

    expect(result).toEqual({ ok: true });
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: "org_dev" },
      select: { id: true },
    });
  });

  it("should block X-ORG-ID fallback in production even when ENABLE_DEV_ENDPOINTS=true", async () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_DEV_ENDPOINTS = "true";
    prisma.channelAccount.findFirst.mockResolvedValue(null);

    await expect(
      service.handleWhatsAppWebhook(WHATSAPP_TEXT_PAYLOAD, {
        ...createSignedWebhookOptions(WHATSAPP_TEXT_PAYLOAD),
        xOrgIdHeader: "org_dev",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it("should no-op duplicate providerMessageId", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue({ organizationId: "org_1" });
    prisma.rawWebhookEvent.create.mockRejectedValue({ code: "P2002" });
    prisma.rawWebhookEvent.findUnique.mockResolvedValue({
      id: "rwe_1",
      processingStatus: WebhookProcessingStatus.PROCESSED,
    });

    const result = await service.handleWhatsAppWebhook(
      WHATSAPP_TEXT_PAYLOAD,
      createSignedWebhookOptions(WHATSAPP_TEXT_PAYLOAD),
    );

    expect(result).toEqual({ ok: true, duplicate: true });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("should re-enqueue pending duplicate when first enqueue failed", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue({ organizationId: "org_1" });
    prisma.rawWebhookEvent.create
      .mockResolvedValueOnce({ id: "rwe_pending" })
      .mockRejectedValueOnce({ code: "P2002" });
    prisma.rawWebhookEvent.findUnique.mockResolvedValue({
      id: "rwe_pending",
      processingStatus: WebhookProcessingStatus.PENDING,
    });
    queue.enqueue.mockRejectedValueOnce(new Error("redis unavailable"));
    queue.enqueue.mockResolvedValueOnce(undefined);

    await expect(
      service.handleWhatsAppWebhook(
        WHATSAPP_TEXT_PAYLOAD,
        createSignedWebhookOptions(WHATSAPP_TEXT_PAYLOAD),
      ),
    ).rejects.toThrow("redis unavailable");

    const retryResult = await service.handleWhatsAppWebhook(
      WHATSAPP_TEXT_PAYLOAD,
      createSignedWebhookOptions(WHATSAPP_TEXT_PAYLOAD),
    );

    expect(retryResult).toEqual({ ok: true, duplicate: true });
    expect(prisma.rawWebhookEvent.findUnique).toHaveBeenCalledWith({
      where: {
        provider_providerMessageId: {
          provider: "WHATSAPP",
          providerMessageId: "wamid.abc123",
        },
      },
      select: {
        id: true,
        processingStatus: true,
      },
    });
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
    expect(queue.enqueue).toHaveBeenNthCalledWith(1, "rwe_pending");
    expect(queue.enqueue).toHaveBeenNthCalledWith(2, "rwe_pending");
  });

  it("should accept mapped non-text updates and enqueue", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue({ organizationId: "org_1" });
    prisma.rawWebhookEvent.create.mockResolvedValue({ id: "rwe_3" });

    const result = await service.handleWhatsAppWebhook(
      WHATSAPP_STATUS_PAYLOAD,
      createSignedWebhookOptions(WHATSAPP_STATUS_PAYLOAD),
    );

    expect(result).toEqual({ ok: true });
    expect(prisma.rawWebhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerMessageId: "wamid.status001",
          externalAccountId: "12345",
          organizationId: "org_1",
        }),
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith("rwe_3");
  });
});
