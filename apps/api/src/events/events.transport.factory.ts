import { Logger } from "@nestjs/common";
import { LocalOnlyEventsTransport } from "./local-only-events.transport";
import { RedisPubSubEventsTransport } from "./redis-pubsub-events.transport";
import { EventsTransport } from "./events.transport";

export function createDefaultEventsTransport(): EventsTransport {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (redisUrl) {
    return new RedisPubSubEventsTransport(redisUrl);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("REDIS_URL is required in production for realtime fanout");
  }

  if (process.env.NODE_ENV !== "test") {
    new Logger("EventsTransportFactory").warn(
      "REDIS_URL is missing; realtime fanout is running in local-only mode.",
    );
  }

  return new LocalOnlyEventsTransport();
}
