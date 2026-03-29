# STATUS

Updated: 2026-03-29 (UTC)
Scope: Unified Inbox MVP (WhatsApp + Instagram unified support inbox)

## Current Snapshot

- Git publish state intentionally omitted here; use `git status -sb` / `git log -1 --oneline` for live branch + commit info
- Runtime: Node `20.x` enforced via `.nvmrc` + `package.json#volta`; use `nvm use 20` if your shell default differs
- Monorepo shape: `apps/api` (NestJS + Prisma), `apps/web` (Next.js), `docker-compose.yml` (Postgres + Redis)

## What Works (Command-Verified on 2026-03-29)

- Docker compose config is valid: `docker compose config`
- Local infra comes up: `docker compose up -d` (`postgres` + `redis` running)
- DB schema is up to date: `pnpm db:migrate`
- Seed runs and provides password-backed demo data: `pnpm db:seed` (1 org, 2 users, conversations, tags, notes, invites, audit logs)
- Lint passes: `pnpm lint`
- Tests pass: `pnpm test`
- Build passes: `pnpm build` (web + api)
- One-command bootstrap: `pnpm demo:local` reaches `install -> setup -> migrate -> seed -> dev`
- Smoke script: `scripts/smoke-local.sh` covers health -> password login -> session -> conversations, with optional SSE fanout validation
- Webhook pipeline: `persist -> queue -> worker` (WhatsApp + Instagram inbound)
- Conversation resolve/reopen: API + UI + audit logging complete
- Audit log web UI route is present in app: `/settings/audit-log`
- SSE realtime updates: `GET /events/stream` pushes org-scoped events to inbox UI via Redis Pub/Sub fanout when `REDIS_URL` is configured
- Instagram outbound: send parity with WhatsApp via account-scoped Instagram Graph API adapter
- Token encryption: channel access tokens encrypted at rest; `CHANNEL_TOKEN_SECRET` required in production (fail-fast)
- Auth: bcrypt-backed email/password login, one-time owner bootstrap, secure invite onboarding, legacy null-password activation via fresh invite, cold-start owner recovery via `AUTH_RECOVERY_SECRET`, password reset request/confirm, email verification request/resend/confirm, explicit `soft|login` verification gate, logout + session validation
- Auth email delivery: provider-agnostic `disabled|outbox|resend` transport with development outbox preview files and Resend production baseline
- Realtime fallback: when `REDIS_URL` is absent in non-production, SSE safely falls back to same-process delivery only

## What Is Broken or Missing

1. Real provider end-to-end verification:
   - WhatsApp/Instagram live send-receive requires real provider credentials.
2. Account recovery follow-up:
   - MFA is not implemented yet.
3. Operational visibility:
   - Explicit dead-letter visibility and queue metrics are still limited in docs/product surface.

## MVP Checklist

| # | Capability | Status | Notes |
|---|------------|--------|-------|
| 1 | Multi-tenant org/workspace isolation | Done | Session scoped by `organizationId`, DB queries tenant-scoped |
| 2 | Role model (Owner/Agent) + authz | Done | Password login + session auth + owner gates + invite onboarding aligned, including legacy activation / re-invite compat, owner cold-start recovery, password reset, Resend/outbox auth email delivery baseline, and explicit soft/login verification gate |
| 3 | Team workflows (invites, role update, remove member) | Done | Transaction + lock + last-owner protections |
| 4 | Assignment / tags / internal notes | Done | API + UI present, audit for assignment exists |
| 5 | Inbox list + conversation messages + outbound reply | Done | Endpoints + web inbox UI functional |
| 6 | Conversation resolve/reopen | Done | API + UI + audit logging + optimistic rollback |
| 7 | Webhook ingestion (`persist -> queue -> worker`) | Done | WhatsApp + Instagram inbound normalization |
| 8 | Outbound queue + delivery status tracking | Done | WhatsApp + Instagram send via adapters, status webhook reconciliation |
| 9 | Channel connect settings | Done | WhatsApp + Instagram connect UI/API complete |
|10 | Auditability (audit log API) | Done | Cursor pagination + filters + owner-only access |
|11 | Audit log web UI | Done | Web route/page present with filters + cursor pagination |
|12 | Inbox filters + search | Done | Status/channel/assignee/tag + text search |
|13 | Realtime updates (SSE) | Done | SSE stream at `/events/stream`, org-scoped, auto-reconnect client, Redis Pub/Sub fanout across processes |
|14 | Reproducible local demo | Done | `pnpm demo:local` + `pnpm smoke:local` + Node20 enforcement |
|15 | Token encryption at rest | Done | AES-256-GCM via `CHANNEL_TOKEN_SECRET`; graceful degradation if unset |

## MVP Progress

Estimated MVP progress: **100%**

Rationale:
- All core backend domain, ingestion pipeline, conversation lifecycle, filters/search, audit log UI, realtime SSE with Redis fanout, Instagram outbound, token encryption, and password-backed auth are complete.
- Bootstrap reproducibility is solid with runtime checks, smoke script, CI smoke, one-command local demo, and optional realtime smoke coverage.
- Remaining gaps are now operational/provider follow-ups such as live credentials, richer observability, and MFA.

## Single Roadmap + Todo System

Use this as the single source of truth, with milestones in [ROADMAP.md](./ROADMAP.md).

### Done

- [x] Implement conversation status actions (`resolve` / `reopen`) in API + UI + audit
- [x] Integrate `scripts/smoke-local.sh` into package.json + CI
- [x] Add inbox filters (channel/status/assignee/tag) and basic search
- [x] Add Instagram connect form in settings UI
- [x] Add audit log web UI
- [x] Add SSE-based realtime update mechanism for inbox
- [x] Add Instagram outbound sending + delivery parity
- [x] Encrypt provider access tokens at rest (AES-256-GCM)
- [x] Replace email-only demo login with password auth + owner bootstrap + secure invite onboarding
- [x] Add invite-based compatibility path for legacy `passwordHash = null` users and zero-membership re-invites

### Next (P1)

- [x] Add password reset and email verification flow
- [x] Replace auth email outbox transport with a real provider and decide enforcement gate
- [x] Move SSE fanout from in-memory subjects to Redis Pub/Sub

### Later (P2)

- [ ] Performance pass for inbox list on larger datasets
- [ ] Reporting/analytics baseline
- [ ] Production deployment guide and runbooks

---

<details>
<summary>PR-02 Execution Log (2026-03-07) — archived</summary>

### Step 1 - Conversation lifecycle API
- Done:
  - `PATCH /conversations/:id/status` endpoint eklendi.
  - DTO validation yalnızca `OPEN | RESOLVED` kabul edecek şekilde bağlandı.
  - Service tarafında org-scope `404`, same-status no-op success, audit event tamamlandı.
  - `listConversations` response'ına `status` alanı eklendi.

### Step 2 - Web Inbox UI status flow
- Done:
  - Conversation tipine `status` alanı eklendi.
  - Sol liste ve header'a status badge eklendi.
  - Header'a `Resolve/Reopen` aksiyon butonu eklendi.
  - Optimistic status update + rollback (hata/401) uygulandı.

### Step 3 - Test coverage (PR-02)
- Done:
  - Controller + service test dosyaları tamamlandı (status, validation, audit, cross-tenant).
  - Node 20 altında doğrulandı.

### Step 4 - Documentation updates
- Done:
  - README API örneklerine resolve/reopen curl komutları eklendi.

### Step 5 - Runtime & live proof
- Done:
  - `docker compose up -d`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm lint`, `pnpm test`, `pnpm build` başarıyla geçti.
  - Canlı curl akışı: password login -> session -> OPEN -> RESOLVED -> OPEN doğrulandı.

</details>
