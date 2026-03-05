# DEVSETUP

Updated: 2026-03-05 (UTC)

## Prerequisites

- Node.js `20.x`
- pnpm `9.x`
- Docker + Docker Compose

Check versions:

```bash
node -v
pnpm -v
docker --version
docker compose version
```

Runtime pinning files:
- `.nvmrc` -> `20`
- `package.json#volta` -> Node `20.11.1`, pnpm `9.15.0`

## Fast Path (Recommended)

```bash
git clone <repo-url>
cd unified-inbox
pnpm demo:local
```

`pnpm demo:local` does:
- `pnpm install`
- create missing `.env` files from examples
- `docker compose up -d`
- `pnpm db:migrate`
- `pnpm db:seed`
- `pnpm dev`

URLs:
- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Health: `http://localhost:3001/health`

## Manual Path

```bash
docker compose up -d
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Smoke Checks

```bash
# Health
curl http://localhost:3001/health

# Login
curl -i -c cookie.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@acme.com"}'

# Session
curl -b cookie.txt http://localhost:3001/auth/session

# Conversations
curl -b cookie.txt http://localhost:3001/conversations
```

## Troubleshooting

### Unsupported Node version

Symptom:
- `ERR_PNPM_UNSUPPORTED_ENGINE`

Fix:
- switch to Node `20.x` (for example with `nvm use 20`)

### `docker compose build base` fails

Symptom:
- `no such service: base`

Reason:
- this repo has no `base` compose service and no Dockerfile build stack
- use `docker compose up -d` only

### API cannot connect to DB

Checks:

```bash
docker compose ps
docker compose exec -T postgres psql -U postgres -d unified_inbox -c "select 1;"
```

If needed, restart stack:

```bash
docker compose down
docker compose up -d
```

### Dev endpoints not visible

- Set in `apps/api/.env`: `ENABLE_DEV_ENDPOINTS=true`
- Set in `apps/web/.env`: `NEXT_PUBLIC_ENABLE_DEV_ENDPOINTS=true`
- Ensure `NODE_ENV!=production`
