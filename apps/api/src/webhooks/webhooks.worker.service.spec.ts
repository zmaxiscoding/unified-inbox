import { PrismaService } from "../prisma/prisma.service";
import { WebhooksWorkerService } from "./webhooks.worker.service";

const BASE_RAW_EVENT = {
  id: "rwe_1",
  provider: "WHATSAPP",
  externalAccountId: "12345",
  organizationId: "org_1",
  processingStatus: "PENDING",
};

describe("WebhooksWorkerService", () => {
  let service: WebhooksWorkerService;
  let prisma: {
    rawWebhookEvent: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    channel: {
      upsert: jest.Mock;
    };
    conversation: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    message: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      rawWebhookEvent: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      channel: {
        upsert: jest.fn(),
      },
      conversation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      message: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (arg: unknown) => {
        if (typeof arg === "function") {
          return (arg as (tx: unknown) => unknown)(prisma);
        }

        return arg;
      }),
    };

    service = new WebhooksWorkerService(prisma as unknown as PrismaService);
  });

  it("should update outbound message when delivered status webhook arrives", async () => {
    prisma.rawWebhookEvent.findUnique.mockResolvedValue({
      ...BASE_RAW_EVENT,
      payload: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "12345" },
                  statuses: [
                    {
                      id: "wamid.out_1",
                      status: "delivered",
                      timestamp: "1710000100",
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });
    prisma.message.findFirst.mockResolvedValue({
      id: "msg_1",
      deliveryStatus: "SENT",
      sentAt: new Date("2026-03-05T10:00:00.000Z"),
      deliveredAt: null,
      readAt: null,
    });
    prisma.message.update.mockResolvedValue({});
    prisma.rawWebhookEvent.update.mockResolvedValue({});

    await service.processRawEvent("rwe_1");

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "msg_1" },
      data: {
        deliveryStatus: "DELIVERED",
        deliveryStatusUpdatedAt: new Date("2024-03-09T16:01:40.000Z"),
        failedAt: null,
        providerError: null,
        deliveredAt: new Date("2024-03-09T16:01:40.000Z"),
      },
    });
    expect(prisma.rawWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: "rwe_1" },
      data: {
        processingStatus: "PROCESSED",
        processedAt: expect.any(Date),
        error: null,
      },
    });
    expect(prisma.channel.upsert).not.toHaveBeenCalled();
  });

  it("should keep webhook handling idempotent and avoid status regression", async () => {
    prisma.rawWebhookEvent.findUnique.mockResolvedValue({
      ...BASE_RAW_EVENT,
      payload: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "12345" },
                  statuses: [
                    {
                      id: "wamid.out_1",
                      status: "sent",
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });
    prisma.message.findFirst.mockResolvedValue({
      id: "msg_1",
      deliveryStatus: "READ",
      sentAt: new Date("2026-03-05T10:00:00.000Z"),
      deliveredAt: new Date("2026-03-05T10:01:00.000Z"),
      readAt: new Date("2026-03-05T10:02:00.000Z"),
    });
    prisma.rawWebhookEvent.update.mockResolvedValue({});

    await service.processRawEvent("rwe_1");

    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(prisma.rawWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: "rwe_1" },
      data: {
        processingStatus: "PROCESSED",
        processedAt: expect.any(Date),
        error: null,
      },
    });
  });

  it("should persist failed status with provider error detail", async () => {
    prisma.rawWebhookEvent.findUnique.mockResolvedValue({
      ...BASE_RAW_EVENT,
      payload: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "12345" },
                  statuses: [
                    {
                      id: "wamid.out_2",
                      status: "failed",
                      errors: [{ message: "Recipient is not on WhatsApp" }],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });
    prisma.message.findFirst.mockResolvedValue({
      id: "msg_2",
      deliveryStatus: "SENT",
      sentAt: new Date("2026-03-05T10:00:00.000Z"),
      deliveredAt: null,
      readAt: null,
    });
    prisma.message.update.mockResolvedValue({});
    prisma.rawWebhookEvent.update.mockResolvedValue({});

    await service.processRawEvent("rwe_1");

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "msg_2" },
      data: {
        deliveryStatus: "FAILED",
        deliveryStatusUpdatedAt: expect.any(Date),
        failedAt: expect.any(Date),
        providerError: "Recipient is not on WhatsApp",
      },
    });
  });

  // ─── Instagram Worker Tests ─────────────────────────────

  const BASE_IG_RAW_EVENT = {
    id: "rwe_ig_1",
    provider: "INSTAGRAM",
    externalAccountId: "ig_account_123",
    organizationId: "org_1",
    processingStatus: "PENDING",
  };

  it("should process instagram text message and persist inbound", async () => {
    prisma.rawWebhookEvent.findUnique.mockResolvedValue({
      ...BASE_IG_RAW_EVENT,
      payload: {
        entry: [
          {
            id: "ig_account_123",
            messaging: [
              {
                sender: { id: "ig_sender_456" },
                recipient: { id: "ig_account_123" },
                message: {
                  mid: "mid.instagram001",
                  text: "Hello from Instagram",
                },
              },
            ],
          },
        ],
      },
    });
    prisma.channel.upsert.mockResolvedValue({ id: "ch_ig_1" });
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({ id: "conv_ig_1" });
    prisma.message.create.mockResolvedValue({ createdAt: new Date("2026-03-05T12:00:00.000Z") });
    prisma.conversation.update.mockResolvedValue({});
    prisma.rawWebhookEvent.update.mockResolvedValue({});

    await service.processRawEvent("rwe_ig_1");

    expect(prisma.channel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_type_externalId: {
            organizationId: "org_1",
            type: "INSTAGRAM",
            externalId: "ig_account_123",
          },
        },
        create: expect.objectContaining({
          type: "INSTAGRAM",
          name: "Instagram Business",
        }),
      }),
    );
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: "INBOUND",
          body: "Hello from Instagram",
          providerMessageId: "mid.instagram001",
        }),
      }),
    );
    expect(prisma.rawWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: "rwe_ig_1" },
      data: {
        processingStatus: "PROCESSED",
        processedAt: expect.any(Date),
        error: null,
      },
    });
  });

  it("should mark instagram non-text message as processed (no-op)", async () => {
    prisma.rawWebhookEvent.findUnique.mockResolvedValue({
      ...BASE_IG_RAW_EVENT,
      payload: {
        entry: [
          {
            id: "ig_account_123",
            messaging: [
              {
                sender: { id: "ig_sender_456" },
                recipient: { id: "ig_account_123" },
                message: {
                  mid: "mid.instagram002",
                  attachments: [{ type: "image", payload: { url: "https://example.com/img.jpg" } }],
                },
              },
            ],
          },
        ],
      },
    });
    prisma.rawWebhookEvent.update.mockResolvedValue({});

    await service.processRawEvent("rwe_ig_1");

    expect(prisma.channel.upsert).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.rawWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: "rwe_ig_1" },
      data: {
        processingStatus: "PROCESSED",
        processedAt: expect.any(Date),
        error: null,
      },
    });
  });
});
