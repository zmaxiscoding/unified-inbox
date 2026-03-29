import { EventEmitter } from "node:events";

const mockRedisClients: MockRedis[] = [];

class MockRedis extends EventEmitter {
  status = "ready";
  publish = jest.fn(async () => 1);
  subscribe = jest.fn(async () => 1);
  unsubscribe = jest.fn(async () => 1);
  quit = jest.fn(async () => "OK");
  disconnect = jest.fn();
}

jest.mock("ioredis", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => {
    const client = new MockRedis();
    mockRedisClients.push(client);
    return client;
  }),
}));

import { RedisPubSubEventsTransport } from "./redis-pubsub-events.transport";

describe("RedisPubSubEventsTransport", () => {
  let transport: RedisPubSubEventsTransport;
  let publisher: MockRedis;
  let subscriber: MockRedis;

  beforeEach(() => {
    mockRedisClients.length = 0;
    transport = new RedisPubSubEventsTransport("redis://localhost:6379");
    [publisher, subscriber] = mockRedisClients;
  });

  afterEach(async () => {
    await transport.destroy();
  });

  it("should publish to deterministic org-scoped Redis channels", async () => {
    await transport.publish("org_1", {
      type: "message.created",
      conversationId: "conv_1",
      payload: { text: "hello" },
    });

    expect(publisher.publish).toHaveBeenCalledTimes(1);

    const [channel, serializedEnvelope] = publisher.publish.mock.calls[0] as unknown as [
      string,
      string,
    ];
    expect(channel).toBe("unified-inbox:events:org:org_1");
    expect(JSON.parse(serializedEnvelope)).toEqual({
      version: 1,
      organizationId: "org_1",
      sourceId: expect.any(String),
      event: {
        type: "message.created",
        conversationId: "conv_1",
        payload: { text: "hello" },
      },
    });
  });

  it("should fan out external Redis messages to matching organization handlers", async () => {
    const handler = jest.fn();
    await transport.subscribe("org_1", handler);

    subscriber.emit(
      "message",
      "unified-inbox:events:org:org_1",
      JSON.stringify({
        version: 1,
        organizationId: "org_1",
        sourceId: "remote-instance",
        event: {
          type: "conversation.updated",
          conversationId: "conv_1",
          payload: { action: "statusChanged" },
        },
      }),
    );

    expect(subscriber.subscribe).toHaveBeenCalledWith(
      "unified-inbox:events:org:org_1",
    );
    expect(handler).toHaveBeenCalledWith({
      type: "conversation.updated",
      conversationId: "conv_1",
      payload: { action: "statusChanged" },
    });
  });

  it("should ignore malformed, cross-org, and self-originated messages", async () => {
    const handler = jest.fn();
    await transport.subscribe("org_1", handler);

    await transport.publish("org_1", {
      type: "message.created",
      conversationId: "conv_self",
      payload: { text: "self" },
    });

    const [, serializedEnvelope] = publisher.publish.mock.calls[0] as unknown as [
      string,
      string,
    ];
    const selfEnvelope = JSON.parse(serializedEnvelope) as { sourceId: string };

    subscriber.emit("message", "unified-inbox:events:org:org_2", "{}");
    subscriber.emit(
      "message",
      "unified-inbox:events:org:org_1",
      JSON.stringify({
        version: 1,
        organizationId: "org_2",
        sourceId: "remote-instance",
        event: {
          type: "message.created",
          conversationId: "conv_wrong_org",
          payload: { text: "nope" },
        },
      }),
    );
    subscriber.emit("message", "unified-inbox:events:org:org_1", "not-json");
    subscriber.emit(
      "message",
      "unified-inbox:events:org:org_1",
      JSON.stringify({
        version: 1,
        organizationId: "org_1",
        sourceId: selfEnvelope.sourceId,
        event: {
          type: "message.created",
          conversationId: "conv_self",
          payload: { text: "self" },
        },
      }),
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it("should keep handlers active across reconnect signals and unsubscribe cleanly", async () => {
    const handler = jest.fn();
    await transport.subscribe("org_1", handler);

    subscriber.emit("reconnecting");
    subscriber.emit(
      "message",
      "unified-inbox:events:org:org_1",
      JSON.stringify({
        version: 1,
        organizationId: "org_1",
        sourceId: "remote-instance",
        event: {
          type: "note.created",
          conversationId: "conv_1",
          payload: { body: "still works" },
        },
      }),
    );

    expect(handler).toHaveBeenCalledTimes(1);

    await transport.unsubscribe("org_1");

    expect(subscriber.unsubscribe).toHaveBeenCalledWith(
      "unified-inbox:events:org:org_1",
    );

    subscriber.emit(
      "message",
      "unified-inbox:events:org:org_1",
      JSON.stringify({
        version: 1,
        organizationId: "org_1",
        sourceId: "remote-instance",
        event: {
          type: "note.created",
          conversationId: "conv_1",
          payload: { body: "ignored" },
        },
      }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
