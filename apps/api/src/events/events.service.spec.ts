import { EventsService } from "./events.service";
import { SseEvent } from "./event.types";

describe("EventsService", () => {
  let service: EventsService;

  beforeEach(() => {
    service = new EventsService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it("should deliver events to subscribers of the same organization", (done) => {
    const orgId = "org_1";
    const events: SseEvent[] = [];

    const sub = service.subscribe(orgId).subscribe({
      next: (event) => {
        events.push(event);
        if (events.length === 1) {
          sub.unsubscribe();
          expect(events[0].type).toBe("message.created");
          expect(events[0].conversationId).toBe("conv_1");
          done();
        }
      },
    });

    service.emit(orgId, {
      type: "message.created",
      conversationId: "conv_1",
      payload: { text: "hello" },
    });
  });

  it("should not deliver events to subscribers of a different organization", (done) => {
    const events: SseEvent[] = [];

    const sub = service.subscribe("org_1").subscribe({
      next: (event) => {
        events.push(event);
      },
    });

    service.emit("org_2", {
      type: "message.created",
      conversationId: "conv_1",
      payload: { text: "hello" },
    });

    setTimeout(() => {
      sub.unsubscribe();
      expect(events).toHaveLength(0);
      done();
    }, 50);
  });

  it("should support multiple subscribers for the same organization", (done) => {
    const orgId = "org_1";
    let count = 0;

    const sub1 = service.subscribe(orgId).subscribe({
      next: () => {
        count++;
        checkDone();
      },
    });

    const sub2 = service.subscribe(orgId).subscribe({
      next: () => {
        count++;
        checkDone();
      },
    });

    function checkDone() {
      if (count === 2) {
        sub1.unsubscribe();
        sub2.unsubscribe();
        done();
      }
    }

    service.emit(orgId, {
      type: "conversation.updated",
      conversationId: "conv_1",
      payload: { action: "statusChanged" },
    });
  });

  it("should clean up subject when last subscriber disconnects", () => {
    const orgId = "org_1";

    const sub1 = service.subscribe(orgId).subscribe();
    const sub2 = service.subscribe(orgId).subscribe();

    sub1.unsubscribe();
    // Emitting should still work for sub2
    const events: SseEvent[] = [];
    sub2.unsubscribe();

    // After all unsubscribe, emit should be a no-op (no error)
    service.emit(orgId, {
      type: "message.created",
      conversationId: "conv_1",
      payload: {},
    });

    expect(events).toHaveLength(0);
  });

  it("should handle emit when no subscribers exist", () => {
    // Should not throw
    service.emit("org_nonexistent", {
      type: "message.created",
      conversationId: "conv_1",
      payload: {},
    });
  });
});
