import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsController } from "./events.controller";
import { createDefaultEventsTransport } from "./events.transport.factory";
import {
  EVENTS_TRANSPORT,
} from "./events.transport";
import { EventsService } from "./events.service";

@Module({
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [
    {
      provide: EVENTS_TRANSPORT,
      useFactory: createDefaultEventsTransport,
    },
    EventsService,
  ],
  exports: [EventsService],
})
export class EventsModule {}
