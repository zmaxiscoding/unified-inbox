# STATUS

Updated: 2026-03-07 (UTC)
Scope: Unified Inbox MVP (WhatsApp + Instagram unified support inbox)

## Current Snapshot

- Monorepo shape: `apps/api` (NestJS + Prisma), `apps/web` (Next.js), `docker-compose.yml` (Postgres + Redis)
- Runtime: Node `20.x` enforced via `.nvmrc` + `package.json#volta`; `engine-strict=true`

## What Works (Command-Verified)

- Docker compose config is valid: `docker compose config`
- Local infra comes up: `docker compose up -d` (`postgres` + `redis` running)
- DB schema is up to date: `pnpm db:migrate`
- Seed runs and provides demo data: `pnpm db:seed` (1 org, 2 users, conversations, tags, notes, invites, audit logs)
- Lint passes: `pnpm lint`
- Tests pass: `pnpm test` -> 23 suites, 157 tests passed
- Build passes: `pnpm build` (web + api)
- One-command bootstrap: `pnpm demo:local` reaches `install -> setup -> migrate -> seed -> dev` successfully
- API health endpoint: `GET /health` returns `{"status":"ok",...}` from built output
- Webhook pipeline implemented as `persist -> queue -> worker`:
  - `RawWebhookEvent` persisted in DB
  - BullMQ queue enqueue
  - Worker writes conversation/message and updates statuses

## What Is Broken or Missing

1. MVP feature gaps remain:
   - Realtime push (WS/SSE) yok; UI manual refresh patterninde.
   - Inbox filtre/search/snooze/resolved-reopen akışları henüz yok.
   - Instagram outbound gönderim yok (WhatsApp outbound var).
2. Real provider end-to-end verification (WhatsApp/Instagram live send/receive) requires paid/external credentials.

## MVP Checklist

| # | Capability | Status | Notes |
|---|------------|--------|-------|
| 1 | Multi-tenant org/workspace isolation | Done | Session scoped by `organizationId`, DB relations/queries tenant-scoped |
| 2 | Role model (Owner/Agent) + authz | Partial | Owner gates on channels/audit/team ops var; auth email-only demo login |
| 3 | Team workflows (invites, role update, remove member) | Done | Transaction + lock + last-owner protections implemented |
| 4 | Assignment / tags / internal notes | Done | API + UI present, audit for assignment exists |
| 5 | Inbox list + conversation messages + outbound reply | Done | Endpoints + web inbox UI functional |
| 6 | Webhook ingestion (`persist -> queue -> worker`) | Done | WhatsApp + Instagram inbound normalization mevcut |
| 7 | Outbound queue + delivery status tracking | Partial | WhatsApp send + status webhook var, Instagram outbound yok |
| 8 | Channel connect settings | Partial | WhatsApp connect UI/API complete, Instagram connect UI eksik |
| 9 | Auditability (audit log API + owner UI) | Done | Cursor pagination + filters + owner-only access var |
|10 | Reproducible local demo | Done | `pnpm demo:local` + Node 20 enforcement; API start entrypoint fixed |

## MVP Progress

Estimated MVP progress: **75%**

Rationale:
- Core backend domain and ingestion pipeline are in place.
- Team ops and auditability foundations are strong.
- Bootstrap reproducibility is now solid (runtime checks, correct start entrypoint, one-command demo).
- Biggest remaining value gaps are inbox UX depth (filter/search/status flow) and realtime updates.

## Single Roadmap + Todo System

Use this as the single source of truth, with milestones in [ROADMAP.md](./ROADMAP.md).

### Now (P0)

- [ ] Implement conversation status actions (`resolve` / `reopen`) in API + UI + audit
- [ ] Add inbox filters (channel/status/assignee/tag) and basic search
- [ ] Add Instagram connect form in settings UI
- [ ] Add end-to-end smoke script covering seed -> login -> inbound -> reply

### Next (P1)

- [ ] Add realtime delivery path (SSE or WebSocket) for new inbound/outbound updates
- [ ] Improve auth model beyond email-only demo login
- [ ] Add provider secret/token encryption for channel credentials

### Later (P2)

- [ ] Performance pass for inbox list on larger datasets
- [ ] Reporting/analytics baseline
- [ ] Production deployment guide and runbooks
