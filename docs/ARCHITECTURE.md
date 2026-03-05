# ARCHITECTURE (MVP)

Updated: 2026-03-05 (UTC)

## Components

- `apps/web`: Next.js App Router UI
  - Login, Inbox, Team Settings, Channel Settings, Audit Log
  - `/api/*` requests are proxied to API via Next rewrites
- `apps/api`: NestJS backend
  - Auth/session, team ops, conversations, channels, webhooks, audit logs
- PostgreSQL 16
  - System of record for tenants, users, memberships, channels, conversations/messages, tags/notes, invites, audit logs, raw webhooks
- Redis 7 + BullMQ
  - Durable job queues for webhook processing and outbound sending

## Multi-Tenant & Authorization Model

- Tenant boundary: `organizationId`
- Session payload carries `userId + organizationId (+ role)`
- API queries are scoped by `organizationId` (no cross-tenant reads/writes)
- Owner-only endpoints:
  - Channel connect
  - Team invite/role/remove operations
  - Audit log viewing

## Inbound Data Flow (Webhook)

1. Provider sends webhook to `/webhooks/:provider`
2. API verifies signature/token (dev bypass only with feature flag)
3. API resolves tenant via `ChannelAccount` mapping
4. API persists `RawWebhookEvent` (`PENDING`)
5. API enqueues event id to BullMQ
6. Worker processes event:
   - normalizes payload
   - creates/updates `Channel`, `Conversation`, `Message`
   - marks event `PROCESSED` or `FAILED`

Idempotency:
- `RawWebhookEvent` unique key `(provider, providerMessageId)`
- duplicate events are no-op/re-enqueue-safe

## Outbound Data Flow

1. Agent posts message to `/conversations/:id/messages`
2. API creates outbound `Message` with `deliveryStatus=QUEUED`
3. API enqueues message id to outbound queue
4. Worker claims message (`SENDING`) atomically
5. Worker calls WhatsApp Cloud API adapter
6. Message updates to `SENT` / `FAILED`
7. Provider status webhooks update `DELIVERED` / `READ` / `FAILED`

## Key DB-Level Guarantees

- Membership uniqueness: `(organizationId, userId)`
- Assignment tenant safety: composite FK `(assignedMembershipId, organizationId) -> memberships(id, organizationId)`
- Invite pending uniqueness: partial unique index on `(organizationId, email)` where invite is pending
- Webhook idempotency: unique `(provider, providerMessageId)` on raw events
- Invite accept single-use: conditional `updateMany` guard on `acceptedAt/revokedAt/expiresAt`

## Current Gaps

- Realtime push channel for UI updates is not implemented yet
- Inbox filter/search/status workflow is incomplete for full operator experience
- Instagram outbound adapter not implemented (inbound parity exists)
