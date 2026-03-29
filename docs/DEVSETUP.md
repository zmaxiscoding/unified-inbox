# DEVSETUP

Updated: 2026-03-29 (UTC)

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

# Empty DB bootstrap (opsiyonel, seed yerine ilk owner kurmak için)
curl -i -c cookie.txt -X POST http://localhost:3001/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"name":"Ali Yilmaz","email":"owner@acme.com","password":"OwnerPass123!","organizationName":"Acme Store"}'

# Login
curl -i -c cookie.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@acme.com","password":"AgentPass123!"}'

# Session
curl -b cookie.txt http://localhost:3001/auth/session

# Conversations
curl -b cookie.txt http://localhost:3001/conversations
```

Seed credentials:
- `agent@acme.com / AgentPass123!`
- `owner@acme.com / OwnerPass123!`

Invite onboarding notes:
- Yeni kullanıcı invite kabulünde `name + password` gönderir.
- Mevcut kullanıcı fresh invite ile doğrudan `password` doğrulayıp katılabilir; aktif membership sayısı `0` olsa da desteklenir.
- Legacy `passwordHash = null` hesaplar passwordless login ile açılmaz; owner aynı e-posta için fresh invite üretir, kullanıcı invite akışında yeni şifre belirleyerek hesabı aktive eder.
- Eğer org’daki tüm OWNER hesapları legacy/null-password durumda ve aktif session yoksa, `AUTH_RECOVERY_SECRET` tanımlayıp `POST /auth/recover-owner` ile ilk OWNER hesabını güvenli biçimde aktive edin.

Password reset + email verification notes:
- Development varsayılan transport `AUTH_EMAIL_TRANSPORT=outbox` olup preview dosyaları workspace script'lerinde çoğunlukla `apps/api/.auth-email-outbox/` altında oluşur.
- Production için gerçek provider henüz yoktur; `AUTH_EMAIL_TRANSPORT=disabled` güvenli no-op davranışıdır.
- Bu nedenle email verification enforcement bilerek soft bırakılmıştır; tracking + request/confirm + resend baseline aktiftir.
- Password reset yalnızca password-backed hesaplar içindir; legacy `passwordHash = null` kullanıcılar fresh invite / owner recovery ile devam eder.

Quick preview check:

```bash
find apps/api/.auth-email-outbox -type f | sort | tail -n 3
cat apps/api/.auth-email-outbox/<preview-file>.json
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
