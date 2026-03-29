import { SseEvent, SseEventType } from "./event.types";

export const EVENTS_TRANSPORT = Symbol("EVENTS_TRANSPORT");
export const EVENTS_REDIS_CHANNEL_PREFIX = "unified-inbox:events:org:";

const VALID_EVENT_TYPES = new Set<SseEventType>([
  "message.created",
  "conversation.updated",
  "conversation.created",
  "note.created",
]);

export type EventsTransportHandler = (event: SseEvent) => void;

export type EventsTransportMode = "local" | "redis";

export type EventsFanoutEnvelope = {
  version: 1;
  organizationId: string;
  sourceId: string;
  event: SseEvent;
};

export interface EventsTransport {
  readonly mode: EventsTransportMode;
  publish(organizationId: string, event: SseEvent): Promise<void>;
  subscribe(
    organizationId: string,
    onEvent: EventsTransportHandler,
  ): Promise<void>;
  unsubscribe(organizationId: string): Promise<void>;
  destroy(): Promise<void>;
}

export function getEventsRedisChannel(organizationId: string) {
  return `${EVENTS_REDIS_CHANNEL_PREFIX}${organizationId}`;
}

export function getOrganizationIdFromEventsRedisChannel(channel: string) {
  if (!channel.startsWith(EVENTS_REDIS_CHANNEL_PREFIX)) {
    return null;
  }

  return channel.slice(EVENTS_REDIS_CHANNEL_PREFIX.length);
}

export function isEventsFanoutEnvelope(
  value: unknown,
): value is EventsFanoutEnvelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const envelope = value as Partial<EventsFanoutEnvelope>;

  return (
    envelope.version === 1 &&
    typeof envelope.organizationId === "string" &&
    typeof envelope.sourceId === "string" &&
    isSseEvent(envelope.event)
  );
}

function isSseEvent(value: unknown): value is SseEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const event = value as Partial<SseEvent>;

  return (
    typeof event.type === "string" &&
    VALID_EVENT_TYPES.has(event.type as SseEventType) &&
    typeof event.conversationId === "string" &&
    typeof event.payload === "object" &&
    event.payload !== null &&
    !Array.isArray(event.payload)
  );
}
