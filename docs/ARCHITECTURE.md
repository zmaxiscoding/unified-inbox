# ARCHITECTURE (MVP)

Updated: 2026-03-29 (UTC)

## Components

- `apps/web`: Next.js App Router UI
  - Login, initial owner bootstrap, invite activation, Inbox (with resolve/reopen), Team Settings, Channel Settings
  - `/api/*` requests are proxied to API via Next rewrites
- `apps/api`: NestJS backend
  - Auth/session, team ops, conversations (CRUD + status lifecycle), channels, webhooks, audit logs, SSE events, token encryption
- PostgreSQL 16
  - System of record for tenants, users, memberships, channels, conversations/messages, tags/notes, invites, audit logs, raw webhooks
- Redis 7 + BullMQ
  - Durable job queues for webhook processing and outbound sending

## Multi-Tenant & Authorization Model

- Tenant boundary: `organizationId`
- Session payload carries `userId + organizationId (+ role)` in an HMAC-signed `HttpOnly` cookie
- API queries are scoped by `organizationId` (no cross-tenant reads/writes)
- Owner-only endpoints:
  - Channel connect (WhatsApp + Instagram)
  - Team invite/role/remove operations
  - Audit log viewing

## Auth & Onboarding

- `POST /auth/login` validates `email + password` against `users.passwordHash` (bcrypt)
- Legacy users with `passwordHash = null` cannot use passwordless fallback; login returns an activation-required error and they must complete a fresh invite-based activation
- `POST /auth/bootstrap` creates the first workspace, first user, and OWNER membership only when the DB is empty
- Bootstrap is serialized with a DB advisory lock so only one first-owner transaction can win
- Invite onboarding:
  - new email: invite token + `name + password` creates the user, links membership, consumes the invite, and issues a session
  - existing email with a password: invite token + current password verifies the account, links membership, consumes the invite, and issues a session even if the user currently has zero memberships
  - existing email with `passwordHash = null`: a fresh invite acts as activation; the invite flow sets the password, preserves any existing membership, consumes the invite, and issues a session
  - existing authenticated session is still accepted, but the authenticated email must match the invite email
- `POST /auth/logout` clears the session cookie; protected routes use `SessionAuthGuard` and invalid cookies are cleared on rejection

## Conversation Lifecycle

- Statuses: `OPEN` (default on creation) → `RESOLVED` → `OPEN` (reopen)
- `PATCH /conversations/:id/status` with `{ status: "OPEN" | "RESOLVED" }`
- Status change creates audit event (`conversation.resolved` / `conversation.reopened`)
- Same-status transitions are no-op (idempotent)
- Web UI: optimistic status update with rollback on error

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
5. Worker routes to WhatsApp Cloud API adapter or Instagram Graph API adapter based on channel type; Instagram outbound uses the account-scoped `/{instagramAccountId}/messages` endpoint
6. Message updates to `SENT` / `FAILED`
7. Provider status webhooks update `DELIVERED` / `READ` / `FAILED`

## Realtime Updates (SSE)

- `GET /events/stream` — Server-Sent Events endpoint, session-authenticated
- Events are org-scoped: clients only receive events for their `organizationId`
- Event types: `message.created`, `conversation.updated`, `note.created`
- Backend: `EventsService` uses rxjs `Subject` per org, auto-cleans when no subscribers
- **Limitation**: process-local only — if BullMQ workers or additional API instances run in separate processes, their events won't reach SSE clients. Scale path: Redis Pub/Sub transport.
- Frontend: `EventSource` with auto-reconnect (3s delay), connection status indicator (green/amber/grey dot)
- Integration points: conversations service, webhook worker emit events after mutations

## Token Encryption

- Channel access tokens are encrypted at rest using AES-256-GCM
- Encryption key derived from `CHANNEL_TOKEN_SECRET` env var via scrypt
- Non-deterministic: each encryption produces different ciphertext (random IV)
- Legacy plaintext tokens are handled gracefully on decrypt (no `enc:` prefix = passthrough)
- If `CHANNEL_TOKEN_SECRET` is not set in production, the app fails fast on startup
- In non-production environments, encryption is disabled with a warning when the secret is absent

## Key DB-Level Guarantees

- Membership uniqueness: `(organizationId, userId)`
- Assignment tenant safety: composite FK `(assignedMembershipId, organizationId) -> memberships(id, organizationId)`
- Invite pending uniqueness: partial unique index on `(organizationId, email)` where invite is pending
- Webhook idempotency: unique `(provider, providerMessageId)` on raw events
- Invite accept single-use: conditional `updateMany` guard on `acceptedAt/revokedAt/expiresAt`
- First-owner bootstrap serialization: advisory lock + empty-system check inside one transaction

## Test Infrastructure

- 28 test suites, 218 tests (all in `apps/api`)
- `apps/web` has typecheck only (no unit/integration tests)
- CI: `.github/workflows/ci.yml` — lint + test + build on push/PR to main
- Local smoke: `scripts/smoke-local.sh` — health → login → session → conversations

## Current Gaps

- Password reset, email verification, and MFA are not implemented yet
