import { Controller, MessageEvent, Req, Sse, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { Observable, map, finalize } from "rxjs";
import { SessionPayload } from "../auth/auth.types";
import { Session } from "../auth/session.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { EventsService } from "./events.service";

@Controller("events")
@UseGuards(SessionAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Sse("stream")
  stream(
    @Session() session: SessionPayload,
    @Req() req: Request,
  ): Observable<MessageEvent> {
    const organizationId = session.organizationId;

    const events$ = this.eventsService.subscribe(organizationId).pipe(
      map(
        (event) =>
          ({
            type: event.type,
            data: JSON.stringify(event),
          }) as MessageEvent,
      ),
      finalize(() => {
        // Connection closed by client or server
      }),
    );

    // Handle client disconnect
    req.on("close", () => {
      // rxjs will handle cleanup via finalize
    });

    return events$;
  }
}
