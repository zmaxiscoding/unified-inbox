import { Injectable } from "@nestjs/common";
import { WebhooksWorkerService } from "./webhooks.worker.service";

@Injectable()
export class WebhooksQueueService {
  constructor(private readonly worker: WebhooksWorkerService) {}

  async enqueue(rawWebhookEventId: string) {
    if (process.env.WEBHOOK_INLINE_WORKER !== "true") {
      return;
    }

    setImmediate(() => {
      void this.worker.processRawEvent(rawWebhookEventId);
    });
  }
}
