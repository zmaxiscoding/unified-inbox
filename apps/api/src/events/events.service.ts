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
  private readonly transportRetryBaseDelayMs = 1000;
  private readonly transportRetryMaxDelayMs = 5000;
  private readonly logger = new Logger(EventsService.name);
  private readonly subjects = new Map<string, Subject<SseEvent>>();
  private readonly refCounts = new Map<string, number>();
  private readonly transportGenerations = new Map<string, number>();
  private readonly transportStates = new Map<
    string,
    {
      attempt: number;
      status: "idle" | "subscribing" | "subscribed";
      retryTimeout: ReturnType<typeof setTimeout> | null;
      generation: number;
    }
  >();

  constructor(
    @Optional()
    @Inject(EVENTS_TRANSPORT)
    private readonly transport: EventsTransport = new LocalOnlyEventsTransport(),
  ) {}

  async onModuleDestroy() {
    const activeOrganizations = [...this.subjects.keys()];

    for (const state of this.transportStates.values()) {
      if (state.retryTimeout) {
        clearTimeout(state.retryTimeout);
      }
    }

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
          this.teardownTransportSubscription(organizationId);
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
    const state = this.getOrCreateTransportState(organizationId);
    if (state.status === "subscribed" || state.status === "subscribing") {
      return;
    }

    if (state.retryTimeout) {
      clearTimeout(state.retryTimeout);
      state.retryTimeout = null;
    }

    state.status = "subscribing";
    state.attempt += 1;
    const generation = state.generation;

    void this.transport
      .subscribe(organizationId, (event) => {
        this.publishLocally(organizationId, event);
      })
      .then(() => {
        const currentState = this.transportStates.get(organizationId);
        if (!currentState) {
          void this.transport.unsubscribe(organizationId).catch((error) => {
            this.logger.warn(
              `Failed to clean up stale realtime fanout for org ${organizationId}: ${this.toErrorMessage(error)}`,
            );
          });
          return;
        }

        if (currentState.generation !== generation) {
          return;
        }
        currentState.status = "subscribed";
        currentState.attempt = 0;
      })
      .catch((error) => {
        const currentState = this.transportStates.get(organizationId);
        if (!currentState || currentState.generation !== generation) {
          return;
        }

        currentState.status = "idle";
        this.logger.warn(
          `Failed to subscribe realtime fanout for org ${organizationId}: ${this.toErrorMessage(error)}`,
        );
        this.scheduleTransportSubscriptionRetry(organizationId, currentState);
      });
  }

  private teardownTransportSubscription(organizationId: string) {
    const state = this.transportStates.get(organizationId);
    if (state?.retryTimeout) {
      clearTimeout(state.retryTimeout);
    }

    if (state) {
      state.retryTimeout = null;
      state.status = "idle";
      state.attempt = 0;
      this.transportStates.delete(organizationId);
    }

    void this.transport.unsubscribe(organizationId).catch((error) => {
      this.logger.warn(
        `Failed to clean up realtime fanout for org ${organizationId}: ${this.toErrorMessage(error)}`,
      );
    });
  }

  private scheduleTransportSubscriptionRetry(
    organizationId: string,
    state: {
      attempt: number;
      status: "idle" | "subscribing" | "subscribed";
      retryTimeout: ReturnType<typeof setTimeout> | null;
      generation: number;
    },
  ) {
    if (!this.subjects.has(organizationId) || !this.hasActiveSubscribers(organizationId)) {
      return;
    }

    const retryDelayMs = Math.min(
      this.transportRetryBaseDelayMs * 2 ** Math.max(state.attempt - 1, 0),
      this.transportRetryMaxDelayMs,
    );

    state.retryTimeout = setTimeout(() => {
      const currentState = this.transportStates.get(organizationId);
      if (!currentState) {
        return;
      }

      currentState.retryTimeout = null;
      this.ensureTransportSubscription(organizationId);
    }, retryDelayMs);
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

  private hasActiveSubscribers(organizationId: string) {
    return (this.refCounts.get(organizationId) ?? 0) > 0;
  }

  private getOrCreateTransportState(organizationId: string) {
    if (!this.transportStates.has(organizationId)) {
      this.transportStates.set(organizationId, {
        attempt: 0,
        status: "idle",
        retryTimeout: null,
        generation: this.nextTransportGeneration(organizationId),
      });
    }

    return this.transportStates.get(organizationId)!;
  }

  private nextTransportGeneration(organizationId: string) {
    const nextGeneration = (this.transportGenerations.get(organizationId) ?? 0) + 1;
    this.transportGenerations.set(organizationId, nextGeneration);
    return nextGeneration;
  }
}
