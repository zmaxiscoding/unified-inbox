import { EventsService } from "../events/events.service";
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
  let eventsService: {
    emit: jest.Mock;
  };
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

    eventsService = { emit: jest.fn() };
    service = new WebhooksWorkerService(
      prisma as unknown as PrismaService,
      eventsService as unknown as EventsService,
    );
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

  // ─── Duplicate Inbound Idempotency ──────────────────────

  it("should skip conversation update and SSE events on duplicate inbound message", async () => {
    prisma.rawWebhookEvent.findUnique.mockResolvedValue({
      ...BASE_RAW_EVENT,
      payload: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "12345" },
                  contacts: [{ wa_id: "905551112233", profile: { name: "Ali" } }],
                  messages: [
                    {
                      id: "wamid.dup_1",
                      from: "905551112233",
                      type: "text",
                      text: { body: "duplicate msg" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });
    prisma.channel.upsert.mockResolvedValue({ id: "ch_1" });
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    // message.create throws P2002 — duplicate providerMessageId
    prisma.message.create.mockRejectedValue({ code: "P2002" });
    prisma.rawWebhookEvent.update.mockResolvedValue({});

    await service.processRawEvent("rwe_1");

    // Conversation must NOT be updated on duplicate
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    // SSE events must NOT be emitted on duplicate
    expect(eventsService.emit).not.toHaveBeenCalled();
    // Raw event should still be marked as processed
    expect(prisma.rawWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: "rwe_1" },
      data: {
        processingStatus: "PROCESSED",
        processedAt: expect.any(Date),
        error: null,
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
    expect(eventsService.emit).toHaveBeenNthCalledWith(1, "org_1", {
      type: "message.created",
      conversationId: "conv_ig_1",
      payload: {
        direction: "INBOUND",
        text: "Hello from Instagram",
        senderDisplay: "ig_sender_456",
      },
    });
    expect(eventsService.emit).toHaveBeenNthCalledWith(2, "org_1", {
      type: "conversation.updated",
      conversationId: "conv_ig_1",
      payload: {
        action: "newInboundMessage",
        lastMessageText: "Hello from Instagram",
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

  it("should rethrow transient processing errors before the final attempt", async () => {
    prisma.rawWebhookEvent.findUnique.mockResolvedValue({
      ...BASE_RAW_EVENT,
      payload: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "12345" },
                  contacts: [{ wa_id: "905551112233", profile: { name: "Ali" } }],
                  messages: [
                    {
                      id: "wamid.retry_1",
                      from: "905551112233",
                      type: "text",
                      text: { body: "retry me" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });
    prisma.channel.upsert.mockResolvedValue({ id: "ch_1" });
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    prisma.message.create.mockRejectedValue(new Error("temporary db outage"));

    await expect(service.processRawEvent("rwe_1")).rejects.toThrow("temporary db outage");

    expect(prisma.rawWebhookEvent.update).not.toHaveBeenCalled();
  });

  it("should mark transient errors as failed on the final attempt and rethrow", async () => {
    prisma.rawWebhookEvent.findUnique.mockResolvedValue({
      ...BASE_RAW_EVENT,
      payload: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "12345" },
                  contacts: [{ wa_id: "905551112233", profile: { name: "Ali" } }],
                  messages: [
                    {
                      id: "wamid.retry_2",
                      from: "905551112233",
                      type: "text",
                      text: { body: "last try" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });
    prisma.channel.upsert.mockResolvedValue({ id: "ch_1" });
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    prisma.message.create.mockRejectedValue(new Error("database still unavailable"));
    prisma.rawWebhookEvent.update.mockResolvedValue({});

    await expect(
      service.processRawEvent("rwe_1", { finalAttempt: true }),
    ).rejects.toThrow("database still unavailable");

    expect(prisma.rawWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: "rwe_1" },
      data: {
        processingStatus: "FAILED",
        processedAt: expect.any(Date),
        error: "database still unavailable",
      },
    });
  });

  it("should mark unsupported providers as failed without retrying", async () => {
    prisma.rawWebhookEvent.findUnique.mockResolvedValue({
      ...BASE_RAW_EVENT,
      provider: "EMAIL",
      payload: {},
    });
    prisma.rawWebhookEvent.update.mockResolvedValue({});

    await expect(service.processRawEvent("rwe_1")).resolves.toBeUndefined();

    expect(prisma.rawWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: "rwe_1" },
      data: {
        processingStatus: "FAILED",
        processedAt: expect.any(Date),
        error: "Unsupported webhook provider: EMAIL",
      },
    });
  });
});
