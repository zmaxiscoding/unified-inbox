import { Module } from "@nestjs/common";
import { EventsModule } from "../events/events.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksQueueService } from "./webhooks.queue.service";
import { WebhooksService } from "./webhooks.service";
import { WebhooksWorkerService } from "./webhooks.worker.service";

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksQueueService, WebhooksWorkerService],
  exports: [WebhooksWorkerService, WebhooksQueueService],
})
export class WebhooksModule {}
