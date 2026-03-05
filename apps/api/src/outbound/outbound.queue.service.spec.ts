import { OutboundQueueService } from "./outbound.queue.service";
import { OutboundWorkerService } from "./outbound.worker.service";

const queueAddMock = jest.fn();
const queueCloseMock = jest.fn();
const workerCloseMock = jest.fn();
const workerOnMock = jest.fn();

let capturedProcessor:
  | ((job: { data: { messageId: string } }) => Promise<void>)
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
      processor: (job: { data: { messageId: string } }) => Promise<void>,
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

describe("OutboundQueueService", () => {
  const previousEnv = process.env;

  let service: OutboundQueueService;
  let worker: {
    processOutboundMessage: jest.Mock;
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
      processOutboundMessage: jest.fn().mockResolvedValue(undefined),
    };

    service = new OutboundQueueService(worker as unknown as OutboundWorkerService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    process.env = previousEnv;
  });

  it("should enqueue BullMQ job with retry + backoff settings", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";

    service.onModuleInit();
    await service.enqueue("msg_1");

    expect(queueAddMock).toHaveBeenCalledWith(
      "process-outbound-message",
      { messageId: "msg_1" },
      expect.objectContaining({
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        jobId: "outbound-message:msg_1",
      }),
    );

    expect(capturedProcessor).not.toBeNull();
    await capturedProcessor?.({ data: { messageId: "msg_1" } });
    expect(worker.processOutboundMessage).toHaveBeenCalledWith("msg_1");
  });

  it("should fail fast when REDIS_URL is missing in production", () => {
    process.env.NODE_ENV = "production";

    expect(() => service.onModuleInit()).toThrow(
      "REDIS_URL is required in production for durable outbound processing",
    );
  });

  it("should allow inline fallback in non-production with ENABLE_DEV_ENDPOINTS=true", async () => {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_DEV_ENDPOINTS = "true";

    service.onModuleInit();
    await service.enqueue("msg_2");
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(worker.processOutboundMessage).toHaveBeenCalledWith("msg_2");
    expect(queueAddMock).not.toHaveBeenCalled();
  });
});
