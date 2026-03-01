type PlainObject = Record<string, unknown>;

export type NormalizedWhatsAppTextMessage = {
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

function getChangeValues(payload: unknown): PlainObject[] {
  if (!isPlainObject(payload)) {
    return [];
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const values: PlainObject[] = [];

  for (const entry of entries) {
    if (!isPlainObject(entry)) {
      continue;
    }

    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      if (!isPlainObject(change)) {
        continue;
      }

      if (isPlainObject(change.value)) {
        values.push(change.value);
      }
    }
  }

  return values;
}

export function extractWhatsAppPhoneNumberId(payload: unknown): string | null {
  const values = getChangeValues(payload);

  for (const value of values) {
    if (!isPlainObject(value.metadata)) {
      continue;
    }

    const phoneNumberId = readNonEmptyString(value.metadata.phone_number_id);
    if (phoneNumberId) {
      return phoneNumberId;
    }
  }

  return null;
}

export function extractWhatsAppTextMessage(
  payload: unknown,
): NormalizedWhatsAppTextMessage | null {
  const values = getChangeValues(payload);

  for (const value of values) {
    const messages = Array.isArray(value.messages) ? value.messages : [];

    for (const message of messages) {
      if (!isPlainObject(message)) {
        continue;
      }

      const messageType = readNonEmptyString(message.type);
      if (messageType !== "text") {
        continue;
      }

      const providerMessageId = readNonEmptyString(message.id);
      const from = readNonEmptyString(message.from);
      const textBody =
        isPlainObject(message.text) && readNonEmptyString(message.text.body);

      if (!providerMessageId || !from || !textBody) {
        continue;
      }

      return {
        providerMessageId,
        from,
        text: textBody,
        externalThreadId: `wa:${from}`,
        customerDisplay: from,
      };
    }
  }

  return null;
}
