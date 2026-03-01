-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "externalThreadId" TEXT;

-- CreateTable
CREATE TABLE "channel_accounts" (
    "id" TEXT NOT NULL,
    "provider" "ChannelType" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "displayPhoneNumber" TEXT,
    "wabaId" TEXT,
    "accessToken" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" "ChannelType" NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processingStatus" "WebhookProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_organizationId_channelId_externalThreadId_key" ON "conversations"("organizationId", "channelId", "externalThreadId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_accounts_organizationId_provider_externalAccountId_key" ON "channel_accounts"("organizationId", "provider", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_accounts_provider_externalAccountId_key" ON "channel_accounts"("provider", "externalAccountId");

-- CreateIndex
CREATE INDEX "channel_accounts_provider_externalAccountId_idx" ON "channel_accounts"("provider", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "raw_webhook_events_provider_providerMessageId_key" ON "raw_webhook_events"("provider", "providerMessageId");

-- CreateIndex
CREATE INDEX "raw_webhook_events_organizationId_createdAt_idx" ON "raw_webhook_events"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "raw_webhook_events_provider_externalAccountId_createdAt_idx" ON "raw_webhook_events"("provider", "externalAccountId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_webhook_events" ADD CONSTRAINT "raw_webhook_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
