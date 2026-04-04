import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { WebhooksWorkerService } from "./webhooks.worker.service";

type QueueJobData = { rawWebhookEventId: string };

@Injectable()
export class WebhooksQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhooksQueueService.name);
  private readonly queueName = "raw-webhook-events";
  private queue: Queue<QueueJobData> | null = null;
  private queueWorker: Worker<QueueJobData> | null = null;
  private inlineFallbackEnabled = false;

  constructor(private readonly worker: WebhooksWorkerService) {}

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL?.trim();
    const isProduction = process.env.NODE_ENV === "production";
    const devFallbackEnabled = process.env.ENABLE_DEV_ENDPOINTS === "true";

    if (redisUrl) {
      this.initializeBullMq(redisUrl);
      return;
    }

    if (isProduction) {
      throw new Error(
        "REDIS_URL is required in production for durable webhook processing",
      );
    }

    if (!devFallbackEnabled) {
      throw new Error(
        "REDIS_URL is required unless ENABLE_DEV_ENDPOINTS=true in non-production",
      );
    }

    this.inlineFallbackEnabled = true;
    this.logger.warn(
      "REDIS_URL is missing; inline fallback is enabled because ENABLE_DEV_ENDPOINTS=true.",
    );
  }

  async onModuleDestroy() {
    if (this.queueWorker) {
      await this.queueWorker.close();
      this.queueWorker = null;
    }

    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }

  async enqueue(rawWebhookEventId: string) {
    if (this.queue) {
      await this.queue.add("process-raw-webhook-event", { rawWebhookEventId }, {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        jobId: `raw-webhook-event:${rawWebhookEventId}`,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
      return;
    }

    if (!this.inlineFallbackEnabled) {
      throw new Error("Webhook queue is not initialized");
    }

    setImmediate(() => {
      void this.worker
        .processRawEvent(rawWebhookEventId, { finalAttempt: true })
        .catch((error: unknown) => {
          this.logger.error(
            `Inline webhook processing failed for ${rawWebhookEventId}`,
            this.toErrorMessage(error),
          );
        });
    });
  }

  private initializeBullMq(redisUrl: string) {
    const connection = {
      url: redisUrl,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    };

    this.queue = new Queue<QueueJobData>(this.queueName, { connection });

    this.queueWorker = new Worker<QueueJobData>(
      this.queueName,
      async (job) => {
        const configuredAttempts = job.opts.attempts ?? 1;
        await this.worker.processRawEvent(job.data.rawWebhookEventId, {
          finalAttempt: job.attemptsMade + 1 >= configuredAttempts,
        });
      },
      { connection, concurrency: 5 },
    );

    this.queueWorker.on("error", (error) => {
      this.logger.error("BullMQ worker error", this.toErrorMessage(error));
    });

    this.queueWorker.on("failed", (job, error) => {
      this.logger.error(
        `BullMQ job failed: ${job?.id ?? "unknown"}`,
        this.toErrorMessage(error),
      );
    });

    this.inlineFallbackEnabled = false;
  }

  private toErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
