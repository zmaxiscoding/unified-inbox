export type SseEventType =
  | "message.created"
  | "conversation.updated"
  | "conversation.created"
  | "note.created";

export type SseEvent = {
  type: SseEventType;
  conversationId: string;
  payload: Record<string, unknown>;
};
