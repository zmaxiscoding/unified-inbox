-- CreateEnum
CREATE TYPE "OutboundMessageDeliveryStatus" AS ENUM (
    'QUEUED',
    'SENDING',
    'SENT',
    'DELIVERED',
    'READ',
    'FAILED'
);

-- AlterTable
ALTER TABLE "messages"
ADD COLUMN "deliveryStatus" "OutboundMessageDeliveryStatus",
ADD COLUMN "deliveryStatusUpdatedAt" TIMESTAMP(3),
ADD COLUMN "providerError" TEXT,
ADD COLUMN "sentAt" TIMESTAMP(3),
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "readAt" TIMESTAMP(3),
ADD COLUMN "failedAt" TIMESTAMP(3);

-- Backfill existing outbound records.
UPDATE "messages"
SET
  "deliveryStatus" = 'SENT',
  "deliveryStatusUpdatedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "sentAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)
WHERE "direction" = 'OUTBOUND';

-- Add index
CREATE INDEX "messages_direction_deliveryStatus_createdAt_idx"
ON "messages"("direction", "deliveryStatus", "createdAt" DESC);

-- Add constraint
ALTER TABLE "messages"
ADD CONSTRAINT "messages_outbound_delivery_status_check"
CHECK (
  (
    "direction" = 'INBOUND'
    AND "deliveryStatus" IS NULL
  )
  OR (
    "direction" = 'OUTBOUND'
    AND "deliveryStatus" IS NOT NULL
  )
);
