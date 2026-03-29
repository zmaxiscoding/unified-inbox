import type { EventsTransport } from "./events.transport";

export class LocalOnlyEventsTransport implements EventsTransport {
  readonly mode = "local" as const;

  async publish() {}

  async subscribe() {}

  async unsubscribe() {}

  async destroy() {}
}
