import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { OutboundModule } from "../outbound/outbound.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";

@Module({
  imports: [PrismaModule, AuthModule, OutboundModule, EventsModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
