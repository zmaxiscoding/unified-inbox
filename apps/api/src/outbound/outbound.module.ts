import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { OutboundQueueService } from "./outbound.queue.service";
import { OutboundWorkerService } from "./outbound.worker.service";
import { WhatsAppCloudApiAdapter } from "./whatsapp-cloud-api.adapter";

@Module({
  imports: [PrismaModule],
  providers: [OutboundQueueService, OutboundWorkerService, WhatsAppCloudApiAdapter],
  exports: [OutboundQueueService],
})
export class OutboundModule {}
