# ROADMAP (M0-M3)

Updated: 2026-03-29 (UTC)

## Milestone M0 — Setup & Reproducibility

Goal: New developer can run local demo reliably with minimal commands.

Status: **Done**

Exit Criteria:
- `pnpm demo:local` boots install + docker + db + seed + app
- README and DEVSETUP are aligned with actual commands
- Node `20.x` + pnpm `9.x` requirement is explicit

Delivered:
- `pnpm demo:local` one-command bootstrap
- `.nvmrc` (`20`), `volta` config (`20.11.1` / `9.15.0`), `engine-strict=true`
- `pnpm smoke:local` wired in `package.json`
- `scripts/smoke-local.sh` covers health → login → session → conversations
- CI pipeline (`.github/workflows/ci.yml`) with Postgres + Redis services
- CI smoke step seeds the DB, boots the built API, and runs `scripts/smoke-local.sh`

Remaining Tasks:
- None for current MVP gate

## Milestone M1 — Ingestion Backbone

Goal: Provider events are durable, idempotent, and asynchronously processed.

Status: **Done**

Delivered:
- WhatsApp + Instagram webhook verify + signature checks
- `RawWebhookEvent` persistence with unique `(provider, providerMessageId)`
- BullMQ queueing + worker processing
- Conversation/message creation from normalized inbound payload
- Outbound WhatsApp delivery status reconciliation

Remaining Tasks:
- [ ] Add explicit dead-letter strategy/visibility in docs
- [ ] Add operational metrics (queue depth, failed jobs)

## Milestone M2 — Inbox UI Core

Goal: Agents can work conversations end-to-end in one screen.

Status: **Done**

Delivered:
- Conversation list, message thread, outbound send
- Assignment dropdown
- Tags and internal notes
- Dev inbound simulation widget
- Conversation status actions (`OPEN ↔ RESOLVED`) from UI with optimistic update + rollback
- Status badge in conversation list and header
- SSE-based realtime updates (new messages, status changes, assignment, tags, notes)
- Connection status indicator in inbox header (green/amber/grey dot)

Remaining Tasks:
- None for current MVP gate

## Milestone M3 — Team Operations & Governance

Goal: Owner-controlled team ops with auditability.

Status: **Done**

Delivered:
- Invites create/accept/revoke
- Role update and member removal
- Last owner invariants with transaction + DB safety
- Owner-only audit log API with cursor pagination/filter
- Audit log web UI with filters + cursor pagination + owner-only access
- Conversation resolve/reopen audit events
- Instagram outbound sending via Instagram Graph API adapter
- Channel access token encryption at rest (AES-256-GCM, env-based key)

Remaining Tasks:
- [ ] Expand audit event coverage for all critical mutations
- [ ] Strengthen auth from demo mode to production-grade flow

## Release Gate for MVP

MVP is ready for external demo when all are true:

1. `pnpm lint`, `pnpm test`, `pnpm build` green on Node 20
2. Inbound webhook to inbox path demoable for WhatsApp + Instagram
3. Team owner flows (invite/role/remove) and audit logs verified
4. Inbox supports assignment/tags/notes + basic filtering + resolve/reopen
5. Smoke test script passes in CI
6. Realtime SSE updates work for new messages and conversation state changes
7. Instagram outbound sending is functional
8. Channel tokens are encrypted at rest when `CHANNEL_TOKEN_SECRET` is set
