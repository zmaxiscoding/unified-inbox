# ROADMAP (M0-M3)

Updated: 2026-03-05 (UTC)

## Milestone M0 — Setup & Reproducibility

Goal: New developer can run local demo reliably with minimal commands.

Status: **Partial**

Exit Criteria:
- `pnpm demo:local` boots install + docker + db + seed + app
- README and DEVSETUP are aligned with actual commands
- Node `20.x` + pnpm `9.x` requirement is explicit

Remaining Tasks:
- [ ] Add CI smoke step for `pnpm setup:local` equivalent
- [ ] Add quick health/smoke command bundle for local verification

## Milestone M1 — Ingestion Backbone

Goal: Provider events are durable, idempotent, and asynchronously processed.

Status: **Mostly Done**

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

Status: **Partial**

Delivered:
- Conversation list, message thread, outbound send
- Assignment dropdown
- Tags and internal notes
- Dev inbound simulation widget

Remaining Tasks:
- [ ] Channel/status/assignee/tag filters
- [ ] Search by customer/message content
- [ ] Conversation status actions (`OPEN/RESOLVED`) from UI
- [ ] Realtime update mechanism (SSE/WS)

## Milestone M3 — Team Operations & Governance

Goal: Owner-controlled team ops with auditability.

Status: **Partial to Done**

Delivered:
- Invites create/accept/revoke
- Role update and member removal
- Last owner invariants with transaction + DB safety
- Owner-only audit log page with cursor pagination/filter

Remaining Tasks:
- [ ] Expand audit event coverage for all critical mutations
- [ ] Strengthen auth from demo mode to production-grade flow
- [ ] Encrypt provider credentials at rest (`TODO(encrypt)` follow-up)

## Release Gate for MVP

MVP is ready for external demo when all are true:

1. `pnpm lint`, `pnpm test`, `pnpm build` green on Node 20
2. Inbound webhook to inbox path demoable for WhatsApp + Instagram
3. Team owner flows (invite/role/remove) and audit logs verified
4. Inbox supports assignment/tags/notes + basic filtering + resolve/reopen
