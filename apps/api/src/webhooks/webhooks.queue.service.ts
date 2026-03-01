import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { WebhookProcessingStatus } from "@prisma/client";
import { createRequire } from "node:module";
import { PrismaService } from "../prisma/prisma.service";
import { WebhooksWorkerService } from "./webhooks.worker.service";

type QueueJobData = { rawWebhookEventId: string };

type BullQueueLike = {
  add: (
    name: string,
    data: QueueJobData,
    options: {
      attempts: number;
      backoff: { type: "exponential"; delay: number };
      jobId: string;
      removeOnComplete: number;
      removeOnFail: number;
    },
  ) => Promise<unknown>;
  close: () => Promise<void>;
};

type BullWorkerLike = {
  on: (event: "error" | "failed", handler: (...args: unknown[]) => void) => void;
  close: () => Promise<void>;
};

type RedisConnectionLike = {
  quit: () => Promise<unknown>;
  disconnect: () => void;
};

type BullMqModule = {
  Queue: new (
    queueName: string,
    options: { connection: RedisConnectionLike },
  ) => BullQueueLike;
  Worker: new (
    queueName: string,
    processor: (job: { data: QueueJobData }) => Promise<void>,
    options: {
      connection: RedisConnectionLike;
      concurrency: number;
    },
  ) => BullWorkerLike;
};

type IoRedisCtor = new (
  redisUrl: string,
  options: { maxRetriesPerRequest: null; enableReadyCheck: true },
) => RedisConnectionLike;

const dynamicRequire = createRequire(__filename);

@Injectable()
export class WebhooksQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhooksQueueService.name);
  private readonly queueName = "raw-webhook-events";
  private queue: BullQueueLike | null = null;
  private workerInstance: BullWorkerLike | null = null;
  private redisConnection: RedisConnectionLike | null = null;
  private pollingTimer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    private readonly worker: WebhooksWorkerService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.initializeBullMqIfAvailable();
    this.startPollingFallback();
  }

  async onModuleDestroy() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    if (this.workerInstance) {
      await this.workerInstance.close();
      this.workerInstance = null;
    }

    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }

    if (this.redisConnection) {
      try {
        await this.redisConnection.quit();
      } catch {
        this.redisConnection.disconnect();
      }
      this.redisConnection = null;
    }
  }

  async enqueue(rawWebhookEventId: string) {
    if (this.queue) {
      try {
        await this.queue.add(
          "process-raw-webhook-event",
          { rawWebhookEventId },
          {
            attempts: 5,
            backoff: { type: "exponential", delay: 1000 },
            jobId: `raw-webhook-event:${rawWebhookEventId}`,
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        );
        return;
      } catch (error) {
        this.logger.error(
          "BullMQ enqueue failed, falling back to inline processing",
          this.toErrorMessage(error),
        );
      }
    }

    setImmediate(() => {
      void this.worker.processRawEvent(rawWebhookEventId);
    });
  }

  private initializeBullMqIfAvailable() {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      return;
    }

    const bullMqModule = this.loadBullMqModule();
    const ioRedisCtor = this.loadIoRedisCtor();
    if (!bullMqModule || !ioRedisCtor) {
      this.logger.warn(
        "REDIS_URL is set but BullMQ/ioredis modules are not installed; inline fallback is active.",
      );
      return;
    }

    try {
      this.redisConnection = new ioRedisCtor(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });

      this.queue = new bullMqModule.Queue(this.queueName, {
        connection: this.redisConnection,
      });

      this.workerInstance = new bullMqModule.Worker(
        this.queueName,
        async (job) => {
          await this.worker.processRawEvent(job.data.rawWebhookEventId);
        },
        {
          connection: this.redisConnection,
          concurrency: 5,
        },
      );

      this.workerInstance.on("error", (error) => {
        this.logger.error("BullMQ worker error", this.toErrorMessage(error));
      });
      this.workerInstance.on("failed", (_job, error) => {
        this.logger.error("BullMQ job failed", this.toErrorMessage(error));
      });
    } catch (error) {
      this.logger.error(
        "BullMQ initialization failed; inline fallback is active.",
        this.toErrorMessage(error),
      );
      this.queue = null;
      this.workerInstance = null;

      if (this.redisConnection) {
        this.redisConnection.disconnect();
        this.redisConnection = null;
      }
    }
  }

  private startPollingFallback() {
    const pollingIntervalMs = this.getPollingIntervalMs();
    this.pollingTimer = setInterval(() => {
      void this.drainPendingRawEvents();
    }, pollingIntervalMs);

    void this.drainPendingRawEvents();
  }

  private async drainPendingRawEvents() {
    if (this.isPolling) {
      return;
    }
    this.isPolling = true;

    try {
      const pendingEvents = await this.prisma.rawWebhookEvent.findMany({
        where: { processingStatus: WebhookProcessingStatus.PENDING },
        orderBy: { createdAt: "asc" },
        take: 25,
        select: { id: true },
      });

      for (const event of pendingEvents) {
        await this.worker.processRawEvent(event.id);
      }
    } finally {
      this.isPolling = false;
    }
  }

  private getPollingIntervalMs() {
    const raw = process.env.WEBHOOK_POLL_INTERVAL_MS?.trim();
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;

    if (Number.isFinite(parsed) && parsed >= 500) {
      return parsed;
    }

    return 3000;
  }

  private loadBullMqModule(): BullMqModule | null {
    try {
      return dynamicRequire("bullmq") as BullMqModule;
    } catch {
      return null;
    }
  }

  private loadIoRedisCtor(): IoRedisCtor | null {
    try {
      return dynamicRequire("ioredis") as IoRedisCtor;
    } catch {
      return null;
    }
  }

  private toErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
