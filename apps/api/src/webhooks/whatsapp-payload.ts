import { OutboundMessageDeliveryStatus } from "@prisma/client";

type PlainObject = Record<string, unknown>;

export type NormalizedWhatsAppTextMessage = {
  providerMessageId: string;
  from: string;
  text: string;
  externalThreadId: string;
  customerDisplay: string;
};

export type NormalizedWhatsAppStatusUpdate = {
  providerMessageId: string;
  deliveryStatus: OutboundMessageDeliveryStatus;
  failedReason: string | null;
  occurredAt: Date | null;
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

export function extractWhatsAppProviderMessageId(payload: unknown): string | null {
  const values = getChangeValues(payload);

  for (const value of values) {
    const messages = Array.isArray(value.messages) ? value.messages : [];
    for (const message of messages) {
      if (!isPlainObject(message)) {
        continue;
      }

      const providerMessageId = readNonEmptyString(message.id);
      if (providerMessageId) {
        return providerMessageId;
      }
    }

    const statuses = Array.isArray(value.statuses) ? value.statuses : [];
    for (const status of statuses) {
      if (!isPlainObject(status)) {
        continue;
      }

      const providerMessageId = readNonEmptyString(status.id);
      if (!providerMessageId) {
        continue;
      }

      const statusValue = readNonEmptyString(status.status);
      if (!statusValue) {
        return `status:${providerMessageId}`;
      }

      return `status:${providerMessageId}:${statusValue.toLowerCase()}`;
    }
  }

  return null;
}

export function extractWhatsAppStatusUpdates(
  payload: unknown,
): NormalizedWhatsAppStatusUpdate[] {
  const values = getChangeValues(payload);
  const statusUpdates: NormalizedWhatsAppStatusUpdate[] = [];

  for (const value of values) {
    const statuses = Array.isArray(value.statuses) ? value.statuses : [];
    for (const status of statuses) {
      if (!isPlainObject(status)) {
        continue;
      }

      const providerMessageId = readNonEmptyString(status.id);
      const deliveryStatus = toOutboundDeliveryStatus(status.status);
      if (!providerMessageId || !deliveryStatus) {
        continue;
      }

      statusUpdates.push({
        providerMessageId,
        deliveryStatus,
        failedReason:
          deliveryStatus === OutboundMessageDeliveryStatus.FAILED
            ? extractFailedReason(status)
            : null,
        occurredAt: parseStatusTimestamp(status.timestamp),
      });
    }
  }

  return statusUpdates;
}

function toOutboundDeliveryStatus(
  status: unknown,
): OutboundMessageDeliveryStatus | null {
  const normalizedStatus = readNonEmptyString(status)?.toLowerCase();
  switch (normalizedStatus) {
    case "sent":
      return OutboundMessageDeliveryStatus.SENT;
    case "delivered":
      return OutboundMessageDeliveryStatus.DELIVERED;
    case "read":
      return OutboundMessageDeliveryStatus.READ;
    case "failed":
      return OutboundMessageDeliveryStatus.FAILED;
    default:
      return null;
  }
}

function extractFailedReason(status: PlainObject): string | null {
  const errors = Array.isArray(status.errors) ? status.errors : [];
  for (const error of errors) {
    if (!isPlainObject(error)) {
      continue;
    }

    const providerMessage = readNonEmptyString(error.message);
    if (providerMessage) {
      return providerMessage;
    }
  }

  return null;
}

function parseStatusTimestamp(value: unknown): Date | null {
  const rawValue = readNonEmptyString(value);
  if (!rawValue) {
    return null;
  }

  const seconds = Number(rawValue);
  if (!Number.isFinite(seconds)) {
    return null;
  }

  const date = new Date(Math.trunc(seconds) * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}
