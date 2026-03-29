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
- `AUTH_EMAIL_VERIFICATION_MODE=login` blocks new login attempts for users whose `emailVerifiedAt` is still null; default `soft` mode keeps login permissive
- Legacy users with `passwordHash = null` cannot use passwordless fallback; login returns an activation-required error and they must complete a fresh invite-based activation
- `POST /auth/bootstrap` creates the first workspace, first user, and OWNER membership only when the DB is empty
- Bootstrap is serialized with a DB advisory lock so only one first-owner transaction can win
- `POST /auth/recover-owner` is an explicit cold-start recovery path guarded by `AUTH_RECOVERY_SECRET`; it only works when the target org currently has zero password-backed OWNER users
- `POST /auth/password-reset/request` is account-enumeration safe; for password-backed users it creates a hashed, expiring, single-use token and dispatches via the configured auth email transport
- `POST /auth/password-reset/confirm` consumes the token atomically and writes a fresh bcrypt password hash
- `POST /auth/email-verification/request` is account-enumeration safe; for unverified users it creates a hashed, expiring, single-use token and dispatches via the configured auth email transport
- `POST /auth/email-verification/resend` is session-authenticated and can surface the real delivery outcome because enumeration is not a concern there
- `POST /auth/email-verification/confirm` consumes the token atomically and persists `users.emailVerifiedAt`
- Current rollout keeps email verification soft by default to avoid bricking existing tenants; legacy password-backed users are backfilled as verified during migration, while new accounts can verify asynchronously and later move under the explicit `login` gate
- Auth email delivery stays provider-agnostic with `disabled`, `outbox`, and `resend` transports. `outbox` writes preview JSON in development, while `resend` delivers real email with provider idempotency keys derived from the token record id
- Safety guard: `AUTH_EMAIL_VERIFICATION_MODE=login` is incompatible with `AUTH_EMAIL_TRANSPORT=disabled`; the app fails fast on startup instead of allowing a lockout configuration
- If delivery fails after token creation, the fresh password reset / verification token is immediately invalidated so no unusable active token remains behind
- Invite onboarding:
  - new email: invite token + `name + password` creates the user, links membership, consumes the invite, and issues a session
  - existing email with a password: invite token + current password verifies the account, links membership, consumes the invite, and issues a session even if the user currently has zero memberships
  - existing email with `passwordHash = null`: a fresh invite acts as activation; the invite flow sets the password, preserves any existing membership, consumes the invite, and issues a session
  - if the invited legacy user already has a valid session, the invite is not consumed until the password has also been set successfully
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
- Backend: `EventsService` keeps an in-memory rxjs `Subject` per org for local SSE clients, but fanout transport is abstraction-based
- Default transport: Redis Pub/Sub using deterministic org channels: `unified-inbox:events:org:<organizationId>`
- Publish path: conversation service + webhook worker still call `eventsService.emit(...)`; service immediately notifies same-process clients and also publishes the event envelope to Redis
- Subscribe path: API instances subscribe to Redis only while they have at least one SSE client for that org; last client disconnect triggers unsubscribe/cleanup
- Fanout safety:
  - channel naming is org-scoped
  - payload also carries `organizationId`
  - self-originated Redis messages are ignored via per-instance `sourceId`
- Reconnect behavior: Redis client auto-retries and preserves registered org handlers; Nest shutdown hooks close Redis clients on shutdown
- Degradation policy: if `REDIS_URL` is missing in non-production, realtime falls back to same-process delivery only; production requires `REDIS_URL`
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
- Password reset single active token per user: partial unique index on `password_reset_tokens(userId)` where token is active
- Email verification single active token per user: partial unique index on `email_verification_tokens(userId)` where token is active
- Password reset / email verification consume: conditional `updateMany` guard on `usedAt/invalidatedAt/expiresAt`
- First-owner bootstrap serialization: advisory lock + empty-system check inside one transaction

## Test Infrastructure

- 28 test suites, 218 tests (all in `apps/api`)
- `apps/web` has typecheck only (no unit/integration tests)
- CI: `.github/workflows/ci.yml` — lint + test + build on push/PR to main
- Local smoke: `scripts/smoke-local.sh` — health → login → session → conversations, plus optional SSE fanout validation

## Current Gaps

- Real email provider transport and optional hard enforcement of verified email are not implemented yet
- MFA is not implemented yet
