# Unified Inbox

WhatsApp + Instagram mesajlarını tek ekrandan yöneten e-ticaret SaaS uygulaması.

## Gereksinimler

- [Node.js](https://nodejs.org/) 20.x
- [pnpm](https://pnpm.io/) 9.x
- [Docker](https://www.docker.com/) + Docker Compose

Runtime pinning:
- `.nvmrc`: `20`
- `package.json#volta`: Node `20.11.1`, pnpm `9.15.0`

## Hızlı Başlangıç (Tek Komut)

```bash
# 1. Repo'yu klonla
git clone <repo-url>
cd unified-inbox

# 2. Tek komutla install + local stack + migrate + seed + dev server
pnpm demo:local
```

`pnpm demo:local` şunları otomatik yapar:
1. `pnpm install`
2. `apps/api/.env` ve `apps/web/.env` dosyalarını örnekten oluşturur (dosya yoksa)
3. `docker compose up -d` ile PostgreSQL + Redis'i başlatır
4. `pnpm db:migrate` + `pnpm db:seed` çalıştırır
5. `pnpm dev` ile web + api sunucularını başlatır

Uygulama adresleri:
| Servis | URL |
|--------|-----|
| Web (Next.js) | http://localhost:3000 |
| API (NestJS) | http://localhost:3001 |
| Health check | http://localhost:3001/health |

## Komutlar

```bash
pnpm demo:local       # install + setup + web/api dev (ilk kurulum)
pnpm setup:local      # docker compose + env + migrate + seed
pnpm dev:local        # setup:local + web/api dev (tekrar çalıştırma)
pnpm dev              # web + api paralel başlatır
pnpm build            # web + api production build
pnpm lint             # tüm workspace'lerde lint çalıştırır
pnpm test             # tüm workspace'lerde test çalıştırır
pnpm prisma:generate  # Prisma Client üretir
pnpm db:migrate       # Migration oluşturur ve uygular (dev)
pnpm db:seed          # Seed verisini yükler
pnpm db:reset         # DB'yi sıfırlar ve migration'ları yeniden uygular
pnpm smoke:local      # API health + login + session + conversations smoke testi
```

## Auth Recovery Baseline

- `POST /auth/password-reset/request|confirm`, `POST /auth/email-verification/request|confirm` ve authenticated `POST /auth/email-verification/resend` endpoint'leri eklidir.
- Public request endpoint'leri account-enumeration safe davranır; mevcut / olmayan e-posta için aynı generic başarılı cevap döner.
- Token'lar DB'de plaintext tutulmaz; `sha256` digest + expiry + single-use consume kullanılır.
- Legacy `passwordHash = null` hesaplar password reset ile aktive edilmez; bu hesaplar fresh invite veya `POST /auth/recover-owner` ile devam eder.
- E-posta delivery provider-agnostic transport ile çalışır:
  - `AUTH_EMAIL_TRANSPORT=disabled`: güvenli no-op, public endpoint'ler generic kalır
  - `AUTH_EMAIL_TRANSPORT=outbox`: local preview dosyaları üretir
  - `AUTH_EMAIL_TRANSPORT=resend`: gerçek delivery için Resend adapter'ı kullanır
- `AUTH_EMAIL_FROM` etkin transport'larda gönderici adresidir. `RESEND_API_KEY` yalnızca `resend` modunda gereklidir.
- Verification rollout gate'i explicit config ile kontrol edilir:
  - `AUTH_EMAIL_VERIFICATION_MODE=soft` varsayılan ve düşük-risk davranıştır
  - `AUTH_EMAIL_VERIFICATION_MODE=login` yeni login'lerde doğrulanmamış hesapları bloklar
- Guard: `AUTH_EMAIL_VERIFICATION_MODE=login` ile `AUTH_EMAIL_TRANSPORT=disabled` birlikte açılamaz; app startup'ta fail-fast olur.
- Legacy password-backed kullanıcılar migration sırasında verified backfill aldığı için `login` gate rollout'unda yanlışlıkla brick edilmez.

## Auth Email Config

```bash
# apps/api/.env
AUTH_EMAIL_TRANSPORT=outbox   # disabled | outbox | resend
AUTH_EMAIL_FROM="Unified Inbox <no-reply@example.test>"
AUTH_EMAIL_OUTBOX_DIR=.auth-email-outbox
AUTH_EMAIL_VERIFICATION_MODE=soft   # soft | login
RESEND_API_KEY=
```

Notes:
- `outbox` development için en düşük riskli default'tur; preview dosyaları çalışma dizinine göre çoğunlukla `apps/api/.auth-email-outbox/` altında oluşur.
- Public password reset / verification request sayfaları teslim sonucunu özellikle generic gösterir; inbox banner'daki authenticated resend ise gerçek outcome'u daha net yansıtır.

## API Örnekleri

```bash
# Empty system bootstrap (yalnızca ilk owner henüz oluşturulmadıysa)
curl -i -c cookie.txt -X POST http://localhost:3001/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"name":"Ali Yilmaz","email":"owner@acme.com","password":"OwnerPass123!","organizationName":"Acme Store"}'

# Login (cookie oluşturur)
curl -i -c cookie.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@acme.com","password":"AgentPass123!"}'

# Legacy tenant cold-start owner recovery
# Sadece organization'da password-backed OWNER yoksa ve AUTH_RECOVERY_SECRET tanımlıysa çalışır.
curl -i -c cookie.txt -X POST http://localhost:3001/auth/recover-owner \
  -H "Content-Type: application/json" \
  -d '{"organizationSlug":"acme-store","email":"owner@acme.com","password":"OwnerPass123!","recoverySecret":"<AUTH_RECOVERY_SECRET>"}'

# Password reset request (her zaman generic/accepted cevap döner)
curl -i -X POST http://localhost:3001/auth/password-reset/request \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@acme.com"}'

# Password reset confirm
curl -i -X POST http://localhost:3001/auth/password-reset/confirm \
  -H "Content-Type: application/json" \
  -d '{"token":"<reset_token>","password":"NewAgentPass123!"}'

# Email verification request (her zaman generic/accepted cevap döner)
curl -i -X POST http://localhost:3001/auth/email-verification/request \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@acme.com"}'

# Email verification confirm
curl -i -X POST http://localhost:3001/auth/email-verification/confirm \
  -H "Content-Type: application/json" \
  -d '{"token":"<verification_token>"}'

# Oturum bilgisi
curl -b cookie.txt http://localhost:3001/auth/session

# Authenticated email verification resend (gercek delivery sonucu doner)
curl -b cookie.txt -X POST http://localhost:3001/auth/email-verification/resend

# Konuşmaları listele (auth gerekli)
curl -b cookie.txt http://localhost:3001/conversations

# Konuşmaları filtrele (status, channel, assigneeId, tagId, search)
curl -b cookie.txt "http://localhost:3001/conversations?status=OPEN&channel=WHATSAPP"
curl -b cookie.txt "http://localhost:3001/conversations?search=kargo"
curl -b cookie.txt "http://localhost:3001/conversations?assigneeId=<membershipId>&tagId=<tagId>"

# Assign dropdown için organization member listesi
curl -b cookie.txt http://localhost:3001/conversations/members

# Konuşma mesajlarını listele
curl -b cookie.txt http://localhost:3001/conversations/<conversationId>/messages

# Konuşmaya outbound mesaj ekle
curl -b cookie.txt -X POST http://localhost:3001/conversations/<conversationId>/messages \
  -H "Content-Type: application/json" \
  -d '{"text":"Merhaba, siparişiniz bugün kargoya veriliyor."}'

# Konuşmayı bir member'a ata
curl -b cookie.txt -X PATCH http://localhost:3001/conversations/<conversationId>/assign \
  -H "Content-Type: application/json" \
  -d '{"membershipId":"<membershipId>"}'

# Konuşma atamasını kaldır
curl -b cookie.txt -X PATCH http://localhost:3001/conversations/<conversationId>/assign \
  -H "Content-Type: application/json" \
  -d '{"membershipId":null}'

# Konuşmayı resolve et
curl -b cookie.txt -X PATCH http://localhost:3001/conversations/<conversationId>/status \
  -H "Content-Type: application/json" \
  -d '{"status":"RESOLVED"}'

# Konuşmayı reopen et
curl -b cookie.txt -X PATCH http://localhost:3001/conversations/<conversationId>/status \
  -H "Content-Type: application/json" \
  -d '{"status":"OPEN"}'

# Konuşma etiketlerini listele
curl -b cookie.txt http://localhost:3001/conversations/<conversationId>/tags

# Konuşmaya etiket ekle (yoksa oluşturur, varsa reuse eder)
curl -b cookie.txt -X POST http://localhost:3001/conversations/<conversationId>/tags \
  -H "Content-Type: application/json" \
  -d '{"name":"VIP"}'

# Konuşmadan etiket kaldır
curl -b cookie.txt -X DELETE http://localhost:3001/conversations/<conversationId>/tags/<tagId>

# Konuşma notlarını listele
curl -b cookie.txt http://localhost:3001/conversations/<conversationId>/notes

# Konuşmaya not ekle
curl -b cookie.txt -X POST http://localhost:3001/conversations/<conversationId>/notes \
  -H "Content-Type: application/json" \
  -d '{"body":"Müşteri VIP, öncelikli destek."}'

# Team & invites listele
curl -b cookie.txt http://localhost:3001/team

# Yeni davet oluştur (OWNER yetkisi gerekli)
curl -b cookie.txt -X POST http://localhost:3001/invites \
  -H "Content-Type: application/json" \
  -d '{"email":"newagent@acme.com","role":"AGENT"}'

# Daveti kabul et (yeni kullanıcı)
curl -i -c cookie.txt -X POST http://localhost:3001/invites/accept \
  -H "Content-Type: application/json" \
  -d '{"token":"<hex_token>","name":"Yeni Ajan","password":"guclu-sifre-123"}'

# Daveti kabul et (mevcut kullanıcı, mevcut şifreyi doğrula)
curl -i -c cookie.txt -X POST http://localhost:3001/invites/accept \
  -H "Content-Type: application/json" \
  -d '{"token":"<hex_token>","password":"ExistingPass123!"}'

# Daveti kabul et (legacy null-password kullanıcıyı aktive et)
curl -i -c cookie.txt -X POST http://localhost:3001/invites/accept \
  -H "Content-Type: application/json" \
  -d '{"token":"<hex_token>","password":"LegacyPass123!"}'

# Not: Mevcut bir üyelikte `passwordHash = null` kaldıysa OWNER aynı e-posta için
# yeni bir invite üretebilir; invite kabulü mevcut üyeliği koruyup hesabın şifresini set eder.

# Daveti iptal et (OWNER yetkisi gerekli)
curl -b cookie.txt -X DELETE http://localhost:3001/invites/<inviteId>

# Üye rolünü değiştir (OWNER yetkisi gerekli)
curl -b cookie.txt -X PATCH http://localhost:3001/memberships/<membershipId>/role \
  -H "Content-Type: application/json" \
  -d '{"role":"OWNER"}'

# Üyeyi kaldır (OWNER yetkisi gerekli)
curl -b cookie.txt -X DELETE http://localhost:3001/memberships/<membershipId>

# Audit logları listele (OWNER yetkisi gerekli, varsayılan son 90 gün)
curl -b cookie.txt "http://localhost:3001/audit-logs?action=conversation.assigned&actorId=<userId>&from=2026-01-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z&limit=20"

# Sonraki sayfayı cursor ile çek
curl -b cookie.txt "http://localhost:3001/audit-logs?cursor=<nextCursor>&limit=20"

# Bağlı kanalları listele (token dönmez)
curl -b cookie.txt http://localhost:3001/channels

# WhatsApp kanalını bağla
curl -b cookie.txt -X POST http://localhost:3001/channels/whatsapp/connect \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumberId":"123456789012345",
    "accessToken":"EAAG....",
    "displayPhoneNumber":"+90 555 111 22 33",
    "wabaId":"1029384756"
  }'

# Instagram kanalını bağla
curl -b cookie.txt -X POST http://localhost:3001/channels/instagram/connect \
  -H "Content-Type: application/json" \
  -d '{
    "instagramAccountId":"17841400123456789",
    "accessToken":"EAAG....",
    "displayName":"@myshop"
  }'

# WhatsApp webhook verify endpoint (Meta setup)
curl -G "http://localhost:3001/webhooks/whatsapp" \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=${WHATSAPP_VERIFY_TOKEN}" \
  --data-urlencode "hub.challenge=123456"

# WhatsApp webhook payload + signature (prod/staging'de zorunlu)
PAYLOAD='{
  "entry":[
    {
      "changes":[
        {
          "value":{
            "metadata":{"phone_number_id":"123456789012345"},
            "messages":[
              {
                "id":"wamid.HBgMNTU1MTIzNDU2",
                "from":"905551234567",
                "type":"text",
                "text":{"body":"Merhaba, kargo durumum nedir?"}
              }
            ]
          }
        }
      ]
    }
  ]
}'
SIGNATURE="sha256=$(printf '%s' \"$PAYLOAD\" | openssl dgst -sha256 -hmac \"$WHATSAPP_APP_SECRET\" | sed 's/^.* //')"

# WhatsApp webhook (mapped phone_number_id -> 200 OK)
curl -i -X POST http://localhost:3001/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: ${SIGNATURE}" \
  -d "$PAYLOAD"

# Unmapped phone_number_id -> 400 (queue'ya alınmaz)
UNMAPPED_PAYLOAD='{
  "entry":[
    {
      "changes":[
        {
          "value":{
            "metadata":{"phone_number_id":"unmapped-phone-id"},
            "messages":[
              {
                "id":"wamid.unmapped",
                "from":"905551234567",
                "type":"text",
                "text":{"body":"Test"}
              }
            ]
          }
        }
      ]
    }
  ]
}'
UNMAPPED_SIGNATURE="sha256=$(printf '%s' \"$UNMAPPED_PAYLOAD\" | openssl dgst -sha256 -hmac \"$WHATSAPP_APP_SECRET\" | sed 's/^.* //')"
curl -i -X POST http://localhost:3001/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: ${UNMAPPED_SIGNATURE}" \
  -d "$UNMAPPED_PAYLOAD"
```

## UI Nasıl Çalıştırılır

```bash
cp apps/web/.env.example apps/web/.env
pnpm dev
```

- Login: `http://localhost:3000/login`
- Seed login: `agent@acme.com / AgentPass123!`, `owner@acme.com / OwnerPass123!`
- UI: `http://localhost:3000/inbox`
- Channel settings: `http://localhost:3000/settings/channels`
- API proxy: web tarafı `/api/*` isteklerini `NEXT_PUBLIC_API_URL` (varsayılan `http://localhost:3001`) adresine yönlendirir.
- Demo simulate inbound kutusunu açmak için `apps/web/.env` içine `NEXT_PUBLIC_ENABLE_DEV_ENDPOINTS=true` ekleyin.
- `/webhooks/whatsapp` için signature bypass yalnızca `ENABLE_DEV_ENDPOINTS=true` ve `NODE_ENV!=production` iken aktiftir.
- API tarafında `/webhooks/whatsapp` için `X-ORG-ID` fallback yalnızca `ENABLE_DEV_ENDPOINTS=true` ve `NODE_ENV!=production` iken aktiftir.
- `POST /dev/simulate-inbound` endpoint'i `ENABLE_DEV_ENDPOINTS=true` ve `NODE_ENV!=production` iken aktiftir; auth gerektirir. Web UI'daki "Simulate Inbound" kutusu bu endpoint'i kullanır. Örnek:
  ```bash
  curl -b cookie.txt -X POST http://localhost:3001/dev/simulate-inbound \
    -H "Content-Type: application/json" \
    -d '{"text":"Merhaba, kargo nerede?","customerDisplay":"905551112233"}'
  ```
- Webhook event'leri varsayılan olarak BullMQ ile işlenir; Redis yoksa yalnızca dev modunda inline fallback devreye girer.
- `NEXT_PUBLIC_*` değişkenleri build-time inline edilir; bu flag build sırasında set edilmelidir.
- Prod build'lerde `NEXT_PUBLIC_ENABLE_DEV_ENDPOINTS` set etmeyin (veya `false` bırakın), UI görünmez.
- Tek organization üyeliğinde login sonrası otomatik org seçilir; çoklu üyelikte UI org seçimi ister.
- DB tamamen boşsa login sayfası ilk owner + workspace bootstrap formunu gösterir.
- Invite kabulünde mevcut kullanıcı önce giriş yapmalı; davet edilen e-posta ile açık oturum eşleşmiyorsa kabul edilmez.
- Inbox sağ panel header'ında assign dropdown ile konuşma atama/atama kaldırma yapılır.

## Proje Yapısı

```
/
├── apps/
│   ├── web/          # Next.js 15 (App Router) + Tailwind CSS
│   └── api/          # NestJS + Prisma + PostgreSQL
├── docker-compose.yml
├── pnpm-workspace.yaml
├── docs/             # Status, roadmap, architecture, setup
├── AGENTS.md         # AI agent kuralları
└── PRD.md            # Ürün gereksinimleri
```

## Dokümantasyon

- [docs/STATUS.md](docs/STATUS.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DEVSETUP.md](docs/DEVSETUP.md)

## CI

Her PR'da GitHub Actions otomatik çalışır: `install → lint → test → build`.
**CI yeşil olmadan merge yapılmaz.**

## Altyapı

- **PostgreSQL 16** — `localhost:5432`, db: `unified_inbox`
- **Redis 7** — `localhost:6379`
- Tüm servisler `docker compose up -d` ile ayağa kalkar.
