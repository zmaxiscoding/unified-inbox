import { WebhooksQueueService } from "./webhooks.queue.service";
import { WebhooksWorkerService } from "./webhooks.worker.service";

const queueAddMock = jest.fn();
const queueCloseMock = jest.fn();
const workerCloseMock = jest.fn();
const workerOnMock = jest.fn();

let capturedProcessor:
  | ((job: {
      data: { rawWebhookEventId: string };
      attemptsMade: number;
      opts: { attempts?: number };
    }) => Promise<void>)
  | null = null;

jest.mock("bullmq", () => {
  class MockQueue {
    add = queueAddMock;
    close = queueCloseMock;

    constructor(_queueName: string, _options: unknown) {
      void _queueName;
      void _options;
    }
  }

  class MockWorker {
    on = workerOnMock;
    close = workerCloseMock;

    constructor(
      _queueName: string,
      processor: (job: {
        data: { rawWebhookEventId: string };
        attemptsMade: number;
        opts: { attempts?: number };
      }) => Promise<void>,
      _options: unknown,
    ) {
      void _queueName;
      void _options;
      capturedProcessor = processor;
    }
  }

  return {
    Queue: MockQueue,
    Worker: MockWorker,
  };
});

describe("WebhooksQueueService", () => {
  const previousEnv = process.env;

  let service: WebhooksQueueService;
  let worker: {
    processRawEvent: jest.Mock;
  };

  beforeEach(() => {
    process.env = { ...previousEnv };
    delete process.env.REDIS_URL;
    delete process.env.ENABLE_DEV_ENDPOINTS;
    process.env.NODE_ENV = "test";

    queueAddMock.mockReset().mockResolvedValue(undefined);
    queueCloseMock.mockReset().mockResolvedValue(undefined);
    workerCloseMock.mockReset().mockResolvedValue(undefined);
    workerOnMock.mockReset();
    capturedProcessor = null;

    worker = {
      processRawEvent: jest.fn().mockResolvedValue(undefined),
    };

    service = new WebhooksQueueService(worker as unknown as WebhooksWorkerService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    process.env = previousEnv;
  });

  it("should enqueue BullMQ job when REDIS_URL is present", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";

    service.onModuleInit();
    await service.enqueue("rwe_1");

    expect(queueAddMock).toHaveBeenCalledWith(
      "process-raw-webhook-event",
      { rawWebhookEventId: "rwe_1" },
      expect.objectContaining({
        attempts: 5,
        jobId: "raw-webhook-event:rwe_1",
      }),
    );

    expect(capturedProcessor).not.toBeNull();
    await capturedProcessor?.({
      data: { rawWebhookEventId: "rwe_1" },
      attemptsMade: 0,
      opts: { attempts: 5 },
    });
    expect(worker.processRawEvent).toHaveBeenCalledWith("rwe_1", { finalAttempt: false });
  });

  it("should fail fast when REDIS_URL is missing in production", () => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = "production";

    expect(() => service.onModuleInit()).toThrow(
      "REDIS_URL is required in production for durable webhook processing",
    );
  });

  it("should allow inline fallback only in non-production with ENABLE_DEV_ENDPOINTS=true", async () => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = "development";
    process.env.ENABLE_DEV_ENDPOINTS = "true";

    service.onModuleInit();
    await service.enqueue("rwe_2");
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(worker.processRawEvent).toHaveBeenCalledWith("rwe_2", { finalAttempt: true });
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it("should mark BullMQ final attempts when handing off to the worker", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";

    service.onModuleInit();

    expect(capturedProcessor).not.toBeNull();
    await capturedProcessor?.({
      data: { rawWebhookEventId: "rwe_final" },
      attemptsMade: 4,
      opts: { attempts: 5 },
    });

    expect(worker.processRawEvent).toHaveBeenCalledWith("rwe_final", { finalAttempt: true });
  });
});
