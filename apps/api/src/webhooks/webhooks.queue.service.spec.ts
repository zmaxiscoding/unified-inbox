import { PrismaService } from "../prisma/prisma.service";
import { WebhooksQueueService } from "./webhooks.queue.service";
import { WebhooksWorkerService } from "./webhooks.worker.service";

describe("WebhooksQueueService", () => {
  let service: WebhooksQueueService;
  let worker: {
    processRawEvent: jest.Mock;
  };
  let prisma: {
    rawWebhookEvent: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.WEBHOOK_POLL_INTERVAL_MS;

    worker = {
      processRawEvent: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      rawWebhookEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    service = new WebhooksQueueService(
      worker as unknown as WebhooksWorkerService,
      prisma as unknown as PrismaService,
    );
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it("should process inline when durable queue is unavailable", async () => {
    await service.enqueue("rwe_1");
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(worker.processRawEvent).toHaveBeenCalledWith("rwe_1");
  });

  it("should process pending raw events on module init", async () => {
    prisma.rawWebhookEvent.findMany.mockResolvedValueOnce([{ id: "rwe_2" }]);

    service.onModuleInit();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(worker.processRawEvent).toHaveBeenCalledWith("rwe_2");
  });
});
