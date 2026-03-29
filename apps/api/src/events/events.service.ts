import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Subject, Observable, finalize } from "rxjs";
import { SseEvent } from "./event.types";

// NOTE: This service is process-local. SSE subscribers only receive events
// emitted within the same Node process. If BullMQ workers or additional API
// instances run in separate processes, events from those processes will not
// reach SSE clients connected here. To scale beyond a single process, replace
// the in-memory Subject map with a Redis Pub/Sub transport.
@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private readonly subjects = new Map<string, Subject<SseEvent>>();
  private readonly refCounts = new Map<string, number>();

  onModuleDestroy() {
    for (const [orgId, subject] of this.subjects) {
      subject.complete();
      this.subjects.delete(orgId);
      this.refCounts.delete(orgId);
    }
  }

  subscribe(organizationId: string): Observable<SseEvent> {
    if (!this.subjects.has(organizationId)) {
      this.subjects.set(organizationId, new Subject<SseEvent>());
      this.refCounts.set(organizationId, 0);
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
        } else {
          this.refCounts.set(organizationId, count);
        }
      }),
    );
  }

  emit(organizationId: string, event: SseEvent) {
    const subject = this.subjects.get(organizationId);
    if (!subject) {
      return;
    }

    try {
      subject.next(event);
    } catch (error) {
      this.logger.error(
        `Failed to emit event for org ${organizationId}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
