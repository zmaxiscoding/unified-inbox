import { EventsService } from "./events.service";
import { SseEvent } from "./event.types";
import { EventsTransport } from "./events.transport";

describe("EventsService", () => {
  let service: EventsService;
  let transport: EventsTransport;

  beforeEach(() => {
    jest.useRealTimers();

    transport = {
      mode: "local",
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
    };

    service = new EventsService(transport);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
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

    expect(transport.publish).toHaveBeenCalledWith(orgId, {
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

    expect(transport.subscribe).toHaveBeenCalledTimes(1);
  });

  it("should bridge external fanout events back into local subscribers", async () => {
    let fanoutHandler: ((event: SseEvent) => void) | undefined;
    (transport.subscribe as jest.Mock).mockImplementation(
      async (_organizationId: string, onEvent: (event: SseEvent) => void) => {
        fanoutHandler = onEvent;
      },
    );

    service = new EventsService(transport);

    const received: SseEvent[] = [];
    const sub = service.subscribe("org_1").subscribe({
      next: (event) => {
        received.push(event);
      },
    });

    fanoutHandler?.({
      type: "note.created",
      conversationId: "conv_external",
      payload: { body: "from another process" },
    });

    sub.unsubscribe();

    expect(received).toEqual([
      {
        type: "note.created",
        conversationId: "conv_external",
        payload: { body: "from another process" },
      },
    ]);
  });

  it("should retry transport subscription while local subscribers are still connected", async () => {
    jest.useFakeTimers();

    let fanoutHandler: ((event: SseEvent) => void) | undefined;
    let subscribeAttempts = 0;
    transport.subscribe = jest.fn().mockImplementation(
      async (_organizationId: string, onEvent: (event: SseEvent) => void) => {
        subscribeAttempts += 1;
        if (subscribeAttempts === 1) {
          throw new Error("transient subscribe failure");
        }

        fanoutHandler = onEvent;
      },
    );

    service = new EventsService(transport);

    const received: SseEvent[] = [];
    const sub = service.subscribe("org_1").subscribe({
      next: (event) => {
        received.push(event);
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(transport.subscribe).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(transport.subscribe).toHaveBeenCalledTimes(2);

    fanoutHandler?.({
      type: "message.created",
      conversationId: "conv_retry",
      payload: { text: "after retry" },
    });

    sub.unsubscribe();
    jest.useRealTimers();

    expect(received).toEqual([
      {
        type: "message.created",
        conversationId: "conv_retry",
        payload: { text: "after retry" },
      },
    ]);
  });

  it("should stop retrying transport subscription after the last subscriber disconnects", async () => {
    jest.useFakeTimers();

    transport.subscribe = jest.fn().mockRejectedValue(
      new Error("transient subscribe failure"),
    );
    service = new EventsService(transport);

    const sub = service.subscribe("org_1").subscribe();

    await Promise.resolve();
    await Promise.resolve();

    sub.unsubscribe();
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(transport.subscribe).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("should ignore stale subscribe failures after a disconnect and reconnect", async () => {
    jest.useFakeTimers();

    const firstAttempt = createDeferred<void>();
    const secondAttempt = createDeferred<void>();
    let subscribeAttempts = 0;
    let secondFanoutHandler: ((event: SseEvent) => void) | undefined;

    transport.subscribe = jest.fn().mockImplementation(
      async (_organizationId: string, onEvent: (event: SseEvent) => void) => {
        subscribeAttempts += 1;

        if (subscribeAttempts === 1) {
          return firstAttempt.promise;
        }

        secondFanoutHandler = onEvent;
        return secondAttempt.promise;
      },
    );

    service = new EventsService(transport);

    const firstSubscriber = service.subscribe("org_1").subscribe();
    firstSubscriber.unsubscribe();

    const received: SseEvent[] = [];
    const secondSubscriber = service.subscribe("org_1").subscribe({
      next: (event) => {
        received.push(event);
      },
    });

    secondAttempt.resolve();
    await Promise.resolve();
    await Promise.resolve();

    firstAttempt.reject(new Error("stale failure"));
    await Promise.resolve();
    await Promise.resolve();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(transport.subscribe).toHaveBeenCalledTimes(2);

    secondFanoutHandler?.({
      type: "conversation.updated",
      conversationId: "conv_reconnect",
      payload: { action: "statusChanged" },
    });

    secondSubscriber.unsubscribe();
    jest.useRealTimers();

    expect(received).toEqual([
      {
        type: "conversation.updated",
        conversationId: "conv_reconnect",
        payload: { action: "statusChanged" },
      },
    ]);
  });

  it("should clean up transport subscription when last subscriber disconnects", () => {
    const orgId = "org_1";

    const sub1 = service.subscribe(orgId).subscribe();
    const sub2 = service.subscribe(orgId).subscribe();

    sub1.unsubscribe();
    sub2.unsubscribe();

    expect(transport.unsubscribe).toHaveBeenCalledWith(orgId);
  });

  it("should handle emit when no subscribers exist", () => {
    // Should not throw
    service.emit("org_nonexistent", {
      type: "message.created",
      conversationId: "conv_1",
      payload: {},
    });

    expect(transport.publish).toHaveBeenCalledWith("org_nonexistent", {
      type: "message.created",
      conversationId: "conv_1",
      payload: {},
    });
  });
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}
