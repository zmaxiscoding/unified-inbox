# STATUS

Updated: 2026-03-29 (UTC)
Scope: Unified Inbox MVP (WhatsApp + Instagram unified support inbox)

## Current Snapshot

- Git publish state intentionally omitted here; use `git status -sb` / `git log -1 --oneline` for live branch + commit info
- Verification runtime: Node `20.20.1` (`nvm use 20` if your shell default differs)
- Monorepo shape: `apps/api` (NestJS + Prisma), `apps/web` (Next.js), `docker-compose.yml` (Postgres + Redis)

## What Works (Command-Verified on 2026-03-29)

- Docker compose config is valid: `docker compose config`
- Local infra comes up: `docker compose up -d` (`postgres` + `redis` running)
- DB schema is up to date: `pnpm db:migrate`
- Seed runs and provides demo data: `pnpm db:seed` (1 org, 2 users, conversations, tags, notes, invites)
- Lint passes: `pnpm lint`
- Tests pass: `pnpm test` -> **23 suites, 178 tests passed**
- Build passes: `pnpm build` (web + api)
- Webhook pipeline: `persist -> queue -> worker` (WhatsApp + Instagram inbound)
- Conversation resolve/reopen: API + UI + audit logging complete
- Smoke script: `scripts/smoke-local.sh` covers health → login → session → conversations

## What Is Broken or Missing

1. Runtime mismatch on dev machines:
   - Repo requires Node `20.x`, machines may have newer versions.
   - `engine-strict=true` blocks plain `pnpm` commands without Node 20.
   - Mitigation: `.nvmrc` (`20`), `volta` config (`20.11.1`), `nvm use 20`.
2. MVP feature gaps:
   - Realtime push (WS/SSE) yok; UI manual refresh patterninde.
   - Instagram outbound gönderim yok (WhatsApp outbound var).
   - Audit log web UI yok (API hazır, cursor pagination + filters + owner-only).
3. Security gaps:
   - Channel access tokens plaintext saklanıyor (`TODO(encrypt)` — 3 yerde).
   - Auth email-only demo login; production-grade auth yok.

## MVP Checklist

| # | Capability | Status | Notes |
|---|------------|--------|-------|
| 1 | Multi-tenant org/workspace isolation | Done | Session scoped by `organizationId`, DB queries tenant-scoped |
| 2 | Role model (Owner/Agent) + authz | Partial | Owner gates on channels/audit/team ops; auth email-only demo login |
| 3 | Team workflows (invites, role update, remove member) | Done | Transaction + lock + last-owner protections |
| 4 | Assignment / tags / internal notes | Done | API + UI present, audit for assignment exists |
| 5 | Inbox list + conversation messages + outbound reply | Done | Endpoints + web inbox UI functional |
| 6 | Conversation resolve/reopen | Done | API + UI + audit logging + optimistic rollback |
| 7 | Webhook ingestion (`persist -> queue -> worker`) | Done | WhatsApp + Instagram inbound normalization |
| 8 | Outbound queue + delivery status tracking | Partial | WhatsApp send + status webhook var, Instagram outbound yok |
| 9 | Channel connect settings | Done | WhatsApp + Instagram connect UI/API complete |
|10 | Auditability (audit log API) | Done | Cursor pagination + filters + owner-only access |
|11 | Audit log web UI | Missing | API var ama web route/page yok |
|12 | Inbox filters + search | Done | Status/channel/assignee/tag + text search |
|13 | Realtime updates (SSE/WS) | Missing | Polling only |
|14 | Reproducible local demo | Partial | `pnpm demo:local` + `scripts/smoke-local.sh`; Node20 zorunlu |

## MVP Progress

Estimated MVP progress: **82%**

Rationale:
- Core backend domain, ingestion pipeline, and conversation lifecycle are complete.
- Inbox filters/search and Instagram connect UI are now implemented.
- Team ops and auditability API foundations are strong.
- Remaining value gaps: realtime updates, Instagram outbound, audit log web UI, and token encryption.

## Single Roadmap + Todo System

Use this as the single source of truth, with milestones in [ROADMAP.md](./ROADMAP.md).

### Now (P0)

- [x] Implement conversation status actions (`resolve` / `reopen`) in API + UI + audit
- [x] Integrate `scripts/smoke-local.sh` into package.json + CI
- [x] Add inbox filters (channel/status/assignee/tag) and basic search
- [x] Add Instagram connect form in settings UI

### Next (P1)

- [ ] Add realtime delivery path (SSE or WebSocket) for new inbound/outbound updates
- [ ] Add Instagram outbound sending + delivery parity
- [ ] Add audit log web UI (API ready)
- [ ] Add provider secret/token encryption for channel credentials

### Later (P2)

- [ ] Improve auth model beyond email-only demo login
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
  - Canlı curl akışı: login → OPEN → RESOLVED → OPEN doğrulandı.

</details>
