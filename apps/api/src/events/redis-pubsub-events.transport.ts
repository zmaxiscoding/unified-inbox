import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import Redis from "ioredis";
import { SseEvent } from "./event.types";
import {
  getEventsRedisChannel,
  getOrganizationIdFromEventsRedisChannel,
  isEventsFanoutEnvelope,
} from "./events.transport";
import type {
  EventsFanoutEnvelope,
  EventsTransport,
  EventsTransportHandler,
} from "./events.transport";

export class RedisPubSubEventsTransport implements EventsTransport {
  readonly mode = "redis" as const;

  private readonly logger = new Logger(RedisPubSubEventsTransport.name);
  private readonly sourceId = randomUUID();
  private readonly handlers = new Map<string, EventsTransportHandler>();
  private readonly publisher: Redis;
  private readonly subscriber: Redis;

  constructor(redisUrl: string) {
    const connectionOptions = {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    };

    this.publisher = new Redis(redisUrl, connectionOptions);
    this.subscriber = new Redis(redisUrl, connectionOptions);

    this.publisher.on("error", (error) => {
      this.logger.warn(
        `Realtime publisher connection error: ${this.toErrorMessage(error)}`,
      );
    });

    this.publisher.on("reconnecting", () => {
      this.logger.warn("Realtime publisher reconnecting");
    });

    this.subscriber.on("error", (error) => {
      this.logger.warn(
        `Realtime subscriber connection error: ${this.toErrorMessage(error)}`,
      );
    });

    this.subscriber.on("reconnecting", () => {
      this.logger.warn("Realtime subscriber reconnecting");
    });

    this.subscriber.on("message", (channel, payload) => {
      this.handleMessage(channel, payload);
    });
  }

  async publish(organizationId: string, event: SseEvent) {
    const envelope: EventsFanoutEnvelope = {
      version: 1,
      organizationId,
      sourceId: this.sourceId,
      event,
    };

    await this.publisher.publish(
      getEventsRedisChannel(organizationId),
      JSON.stringify(envelope),
    );
  }

  async subscribe(
    organizationId: string,
    onEvent: EventsTransportHandler,
  ) {
    if (this.handlers.has(organizationId)) {
      this.handlers.set(organizationId, onEvent);
      return;
    }

    this.handlers.set(organizationId, onEvent);

    try {
      await this.subscriber.subscribe(getEventsRedisChannel(organizationId));
    } catch (error) {
      this.handlers.delete(organizationId);
      throw error;
    }
  }

  async unsubscribe(organizationId: string) {
    if (!this.handlers.has(organizationId)) {
      return;
    }

    this.handlers.delete(organizationId);

    if (this.subscriber.status === "wait") {
      return;
    }

    await this.subscriber.unsubscribe(getEventsRedisChannel(organizationId));
  }

  async destroy() {
    this.handlers.clear();

    await Promise.all([
      this.closeClient(this.subscriber),
      this.closeClient(this.publisher),
    ]);
  }

  private handleMessage(channel: string, payload: string) {
    const organizationId = getOrganizationIdFromEventsRedisChannel(channel);
    if (!organizationId) {
      return;
    }

    const onEvent = this.handlers.get(organizationId);
    if (!onEvent) {
      return;
    }

    const envelope = this.parseEnvelope(payload);
    if (!envelope) {
      return;
    }

    if (envelope.organizationId !== organizationId) {
      this.logger.warn(
        `Ignoring realtime fanout payload with mismatched organization for channel ${channel}`,
      );
      return;
    }

    if (envelope.sourceId === this.sourceId) {
      return;
    }

    try {
      onEvent(envelope.event);
    } catch (error) {
      this.logger.error(
        `Failed to dispatch realtime event for org ${organizationId}`,
        this.toErrorMessage(error),
      );
    }
  }

  private parseEnvelope(payload: string) {
    try {
      const parsed = JSON.parse(payload) as unknown;
      if (!isEventsFanoutEnvelope(parsed)) {
        this.logger.warn("Ignoring malformed realtime fanout payload");
        return null;
      }

      return parsed;
    } catch (error) {
      this.logger.warn(
        `Ignoring unreadable realtime fanout payload: ${this.toErrorMessage(error)}`,
      );
      return null;
    }
  }

  private async closeClient(client: Redis) {
    if (client.status === "end") {
      return;
    }

    if (client.status === "wait") {
      client.disconnect();
      return;
    }

    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }

  private toErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
