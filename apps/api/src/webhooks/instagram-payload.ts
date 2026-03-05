type PlainObject = Record<string, unknown>;

export type NormalizedInstagramTextMessage = {
  providerMessageId: string;
  from: string;
  text: string;
  externalThreadId: string;
  customerDisplay: string;
};

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getMessagingEntries(payload: unknown): PlainObject[] {
  if (!isPlainObject(payload)) {
    return [];
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const messagingItems: PlainObject[] = [];

  for (const entry of entries) {
    if (!isPlainObject(entry)) {
      continue;
    }

    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const item of messaging) {
      if (isPlainObject(item)) {
        messagingItems.push(item);
      }
    }
  }

  return messagingItems;
}

export function extractInstagramAccountId(payload: unknown): string | null {
  if (!isPlainObject(payload)) {
    return null;
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    if (!isPlainObject(entry)) {
      continue;
    }

    const entryId = readNonEmptyString(entry.id);
    if (entryId) {
      return entryId;
    }
  }

  return null;
}

export function extractInstagramTextMessage(
  payload: unknown,
): NormalizedInstagramTextMessage | null {
  const messagingItems = getMessagingEntries(payload);

  for (const item of messagingItems) {
    const message = isPlainObject(item.message) ? item.message : null;
    if (!message) {
      continue;
    }

    const text = readNonEmptyString(message.text);
    if (!text) {
      continue;
    }

    const mid = readNonEmptyString(message.mid);
    if (!mid) {
      continue;
    }

    const sender = isPlainObject(item.sender) ? item.sender : null;
    const senderId = sender ? readNonEmptyString(sender.id) : null;
    if (!senderId) {
      continue;
    }

    return {
      providerMessageId: mid,
      from: senderId,
      text,
      externalThreadId: `ig:${senderId}`,
      customerDisplay: senderId,
    };
  }

  return null;
}

export function extractInstagramProviderMessageId(
  payload: unknown,
): string | null {
  const messagingItems = getMessagingEntries(payload);

  for (const item of messagingItems) {
    const message = isPlainObject(item.message) ? item.message : null;
    if (message) {
      const mid = readNonEmptyString(message.mid);
      if (mid) {
        return mid;
      }
    }
  }

  return null;
}

export function isInstagramNonTextMessage(payload: unknown): boolean {
  const messagingItems = getMessagingEntries(payload);

  for (const item of messagingItems) {
    const message = isPlainObject(item.message) ? item.message : null;
    if (!message) {
      continue;
    }

    const text = readNonEmptyString(message.text);
    if (!text) {
      return true;
    }
  }

  return false;
}
