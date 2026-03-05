# Unified Inbox API

NestJS API server for the unified inbox platform.

## Prerequisites

- Node.js 20.x
- PostgreSQL 16
- Redis 7 (required in production; optional in dev with `ENABLE_DEV_ENDPOINTS=true`)

## Quick start

```bash
# Start Postgres + Redis
docker compose up -d

# Install deps & run migrations
pnpm install
pnpm --filter api prisma:generate
pnpm --filter api db:migrate

# Copy env and start dev server
cp apps/api/.env.example apps/api/.env
pnpm --filter api dev
```

> Runtime notu: workspace script'leri Node.js `20.x` ve pnpm `9.x` bekler.

## Prisma config

- Bu repoda Prisma seed komutu `apps/api/prisma.config.ts` içindeki `migrations.seed` alanından okunur.
- `package.json#prisma` kullanımı deprecated olduğu için kullanılmaz.

## Webhook queue (BullMQ)

Incoming webhooks are persisted to the database first, then enqueued to a BullMQ queue for durable, retryable processing.

### How it works

1. Webhook arrives → saved as `RawWebhookEvent` (status: `PENDING`)
2. Event ID is enqueued to the `raw-webhook-events` BullMQ queue
3. Worker picks up the job, processes the event, and updates its status

### Configuration

| Variable | Required | Description |
|---|---|---|
| `REDIS_URL` | **Yes** (prod) | Redis connection string for BullMQ |
| `ENABLE_DEV_ENDPOINTS` | No | When `true` and `REDIS_URL` is unset, webhooks are processed inline (dev only) |
| `WHATSAPP_VERIFY_TOKEN` | **Yes** (for verify endpoint) | Expected value for `GET /webhooks/whatsapp` (`hub.verify_token`) |
| `WHATSAPP_APP_SECRET` | **Yes** (prod/staging) | HMAC secret for `X-Hub-Signature-256` verification on `POST /webhooks/whatsapp` |

### WhatsApp webhook security

- `GET /webhooks/whatsapp` expects `hub.mode`, `hub.verify_token`, `hub.challenge`.
- Verification succeeds only when `hub.mode=subscribe` and `hub.verify_token === WHATSAPP_VERIFY_TOKEN`; otherwise API returns `403`.
- `POST /webhooks/whatsapp` verifies `X-Hub-Signature-256` against raw request body using HMAC SHA-256 and `WHATSAPP_APP_SECRET`.
- Signature bypass is allowed only when `ENABLE_DEV_ENDPOINTS=true` and `NODE_ENV!=production`.
- `X-ORG-ID` fallback for unmapped WhatsApp accounts is also allowed only when `ENABLE_DEV_ENDPOINTS=true` and `NODE_ENV!=production`.

### Worker

The worker runs **in-process** during `onModuleInit` — no separate worker process is needed for the MVP.

- Concurrency: 5
- Retries: 5 with exponential backoff (1s base)
- Jobs are deduplicated by `rawWebhookEventId`

### Environment behavior

| `NODE_ENV` | `REDIS_URL` set | `ENABLE_DEV_ENDPOINTS` | Behavior |
|---|---|---|---|
| `production` | Yes | — | BullMQ queue + worker |
| `production` | No | — | **Startup fails** |
| `development` | Yes | — | BullMQ queue + worker |
| `development` | No | `true` | Inline fallback (setImmediate) |
| `development` | No | `false` | **Startup fails** |

## Running tests

```bash
pnpm --filter api test                           # all tests
pnpm --filter api test -- --testPathPattern=queue # queue tests only
```
