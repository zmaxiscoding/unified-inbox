import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from "@nestjs/common";
import { Subject, Observable, finalize } from "rxjs";
import { SseEvent } from "./event.types";
import {
  EVENTS_TRANSPORT,
  EventsTransport,
} from "./events.transport";
import { LocalOnlyEventsTransport } from "./local-only-events.transport";

@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private readonly subjects = new Map<string, Subject<SseEvent>>();
  private readonly refCounts = new Map<string, number>();

  constructor(
    @Optional()
    @Inject(EVENTS_TRANSPORT)
    private readonly transport: EventsTransport = new LocalOnlyEventsTransport(),
  ) {}

  async onModuleDestroy() {
    const activeOrganizations = [...this.subjects.keys()];

    for (const [orgId, subject] of this.subjects) {
      subject.complete();
      this.subjects.delete(orgId);
      this.refCounts.delete(orgId);
    }

    await Promise.all(
      activeOrganizations.map(async (organizationId) => {
        try {
          await this.transport.unsubscribe(organizationId);
        } catch (error) {
          this.logger.warn(
            `Failed to unsubscribe realtime fanout for org ${organizationId}: ${this.toErrorMessage(error)}`,
          );
        }
      }),
    );

    await this.transport.destroy();
  }

  subscribe(organizationId: string): Observable<SseEvent> {
    if (!this.subjects.has(organizationId)) {
      this.subjects.set(organizationId, new Subject<SseEvent>());
      this.refCounts.set(organizationId, 0);
      this.ensureTransportSubscription(organizationId);
    }

    this.refCounts.set(
      organizationId,
      (this.refCounts.get(organizationId) ?? 0) + 1,
    );

    return this.subjects.get(organizationId)!.asObservable().pipe(
      finalize(() => {
        const count = (this.refCounts.get(organizationId) ?? 1) - 1;
        if (count <= 0) {
          this.subjects.get(organizationId)?.complete();
          this.subjects.delete(organizationId);
          this.refCounts.delete(organizationId);

          void this.transport.unsubscribe(organizationId).catch((error) => {
            this.logger.warn(
              `Failed to clean up realtime fanout for org ${organizationId}: ${this.toErrorMessage(error)}`,
            );
          });
        } else {
          this.refCounts.set(organizationId, count);
        }
      }),
    );
  }

  emit(organizationId: string, event: SseEvent) {
    this.publishLocally(organizationId, event);

    void this.transport.publish(organizationId, event).catch((error) => {
      this.logger.warn(
        `Failed to publish realtime fanout for org ${organizationId}: ${this.toErrorMessage(error)}`,
      );
    });
  }

  private ensureTransportSubscription(organizationId: string) {
    void this.transport
      .subscribe(organizationId, (event) => {
        this.publishLocally(organizationId, event);
      })
      .catch((error) => {
        this.logger.warn(
          `Failed to subscribe realtime fanout for org ${organizationId}: ${this.toErrorMessage(error)}`,
        );
      });
  }

  private publishLocally(organizationId: string, event: SseEvent) {
    const subject = this.subjects.get(organizationId);
    if (!subject) {
      return;
    }

    try {
      subject.next(event);
    } catch (error) {
      this.logger.error(
        `Failed to emit event for org ${organizationId}`,
        this.toErrorMessage(error),
      );
    }
  }

  private toErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
