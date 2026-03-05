import { PrismaService } from "../prisma/prisma.service";
import { WebhooksQueueService } from "../webhooks/webhooks.queue.service";
import { DevService } from "./dev.service";

describe("DevService", () => {
  let service: DevService;
  let prisma: {
    rawWebhookEvent: { create: jest.Mock };
  };
  let queue: { enqueue: jest.Mock };

  beforeEach(() => {
    prisma = {
      rawWebhookEvent: {
        create: jest.fn(),
      },
    };

    queue = {
      enqueue: jest.fn(),
    };

    service = new DevService(
      prisma as unknown as PrismaService,
      queue as unknown as WebhooksQueueService,
    );
  });

  it("should create RawWebhookEvent and enqueue it", async () => {
    prisma.rawWebhookEvent.create.mockResolvedValue({ id: "rwe_sim_1" });
    queue.enqueue.mockResolvedValue(undefined);

    const result = await service.simulateInbound("org_1", "Hello");

    expect(result).toEqual({ ok: true, rawWebhookEventId: "rwe_sim_1" });
    expect(prisma.rawWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: "WHATSAPP",
        organizationId: "org_1",
        externalAccountId: "sim-dev-phone",
      }),
      select: { id: true },
    });
    expect(queue.enqueue).toHaveBeenCalledWith("rwe_sim_1");
  });

  it("should use customerDisplay as from field when provided", async () => {
    prisma.rawWebhookEvent.create.mockResolvedValue({ id: "rwe_sim_2" });
    queue.enqueue.mockResolvedValue(undefined);

    await service.simulateInbound("org_1", "Test", "905551112233");

    const createCall = prisma.rawWebhookEvent.create.mock.calls[0][0];
    const payload = createCall.data.payload;

    expect(payload.entry[0].changes[0].value.messages[0].from).toBe("905551112233");
    expect(payload.entry[0].changes[0].value.messages[0].text.body).toBe("Test");
  });

  it("should use default phone number when customerDisplay is empty", async () => {
    prisma.rawWebhookEvent.create.mockResolvedValue({ id: "rwe_sim_3" });
    queue.enqueue.mockResolvedValue(undefined);

    await service.simulateInbound("org_1", "Test", "  ");

    const createCall = prisma.rawWebhookEvent.create.mock.calls[0][0];
    const payload = createCall.data.payload;

    expect(payload.entry[0].changes[0].value.messages[0].from).toBe("905551234567");
  });

  it("should generate unique providerMessageId with sim: prefix", async () => {
    prisma.rawWebhookEvent.create.mockResolvedValue({ id: "rwe_sim_4" });
    queue.enqueue.mockResolvedValue(undefined);

    await service.simulateInbound("org_1", "Test");

    const createCall = prisma.rawWebhookEvent.create.mock.calls[0][0];
    expect(createCall.data.providerMessageId).toMatch(/^sim:[0-9a-f-]{36}$/);
  });

  it("should build valid WhatsApp payload structure", async () => {
    prisma.rawWebhookEvent.create.mockResolvedValue({ id: "rwe_sim_5" });
    queue.enqueue.mockResolvedValue(undefined);

    await service.simulateInbound("org_1", "Hello World", "905550001122");

    const createCall = prisma.rawWebhookEvent.create.mock.calls[0][0];
    const payload = createCall.data.payload;

    expect(payload).toEqual({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "sim-dev-phone" },
                messages: [
                  {
                    id: expect.stringMatching(/^sim:/),
                    from: "905550001122",
                    type: "text",
                    text: { body: "Hello World" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
  });
});
