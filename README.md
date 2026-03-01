# Unified Inbox

WhatsApp + Instagram mesajlarını tek ekrandan yöneten e-ticaret SaaS uygulaması.

## Gereksinimler

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9
- [Docker](https://www.docker.com/) + Docker Compose

## Hızlı Başlangıç

```bash
# 1. Repo'yu klonla
git clone <repo-url>
cd unified-inbox

# 2. Altyapıyı başlat (PostgreSQL + Redis)
docker compose up -d

# 3. Bağımlılıkları yükle
pnpm install

# 4. Ortam değişkenlerini ayarla
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 5. Veritabanı migration + seed
pnpm db:migrate
pnpm db:seed

# 6. Geliştirme sunucularını başlat (web + api paralel)
pnpm dev
```

Uygulama adresleri:
| Servis | URL |
|--------|-----|
| Web (Next.js) | http://localhost:3000 |
| API (NestJS) | http://localhost:3001 |
| Health check | http://localhost:3001/health |

## Komutlar

```bash
pnpm dev              # web + api paralel başlatır
pnpm build            # web + api production build
pnpm lint             # tüm workspace'lerde lint çalıştırır
pnpm test             # tüm workspace'lerde test çalıştırır
pnpm prisma:generate  # Prisma Client üretir
pnpm db:migrate       # Migration oluşturur ve uygular (dev)
pnpm db:seed          # Seed verisini yükler
pnpm db:reset         # DB'yi sıfırlar ve migration'ları yeniden uygular
```

## API Örnekleri

```bash
# Login (cookie oluşturur)
curl -i -c cookie.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@acme.com"}'

# Oturum bilgisi
curl -b cookie.txt http://localhost:3001/auth/session

# Konuşmaları listele (auth gerekli)
curl -b cookie.txt http://localhost:3001/conversations

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

# Daveti kabul et (mevcut kullanıcı)
curl -i -c cookie.txt -X POST http://localhost:3001/invites/accept \
  -H "Content-Type: application/json" \
  -d '{"token":"<hex_token>"}'

# Daveti iptal et (OWNER yetkisi gerekli)
curl -b cookie.txt -X DELETE http://localhost:3001/invites/<inviteId>

# Üye rolünü değiştir (OWNER yetkisi gerekli)
curl -b cookie.txt -X PATCH http://localhost:3001/memberships/<membershipId>/role \
  -H "Content-Type: application/json" \
  -d '{"role":"OWNER"}'

# Üyeyi kaldır (OWNER yetkisi gerekli)
curl -b cookie.txt -X DELETE http://localhost:3001/memberships/<membershipId>

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

# WhatsApp webhook (mapped phone_number_id -> 200 OK)
curl -i -X POST http://localhost:3001/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
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

# Unmapped phone_number_id -> 400 (queue'ya alınmaz)
curl -i -X POST http://localhost:3001/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
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
```

## UI Nasıl Çalıştırılır

```bash
cp apps/web/.env.example apps/web/.env
pnpm dev
```

- Login: `http://localhost:3000/login`
- UI: `http://localhost:3000/inbox`
- Channel settings: `http://localhost:3000/settings/channels`
- API proxy: web tarafı `/api/*` isteklerini `NEXT_PUBLIC_API_URL` (varsayılan `http://localhost:3001`) adresine yönlendirir.
- Demo simulate inbound kutusunu açmak için `apps/web/.env` içine `NEXT_PUBLIC_ENABLE_DEV_ENDPOINTS=true` ekleyin.
- API tarafında `/webhooks/whatsapp` için `X-ORG-ID` fallback yalnızca `apps/api/.env` içinde `ENABLE_DEV_ENDPOINTS=true` iken aktiftir.
- `WEBHOOK_INLINE_WORKER=true` yaparsanız webhook alındığında worker aynı process içinde asenkron normalize eder (MVP kolay test modu).
- `NEXT_PUBLIC_*` değişkenleri build-time inline edilir; bu flag build sırasında set edilmelidir.
- Prod build'lerde `NEXT_PUBLIC_ENABLE_DEV_ENDPOINTS` set etmeyin (veya `false` bırakın), UI görünmez.
- Tek organization üyeliğinde login sonrası otomatik org seçilir; çoklu üyelikte UI org seçimi ister.
- Inbox sağ panel header'ında assign dropdown ile konuşma atama/atama kaldırma yapılır.

## Proje Yapısı

```
/
├── apps/
│   ├── web/          # Next.js 15 (App Router) + Tailwind CSS
│   └── api/          # NestJS + Prisma + PostgreSQL
├── packages/         # Paylaşılan tipler ve yardımcı kütüphaneler
├── docker-compose.yml
├── pnpm-workspace.yaml
├── AGENTS.md         # AI agent kuralları
└── PRD.md            # Ürün gereksinimleri
```

## CI

Her PR'da GitHub Actions otomatik çalışır: `install → lint → test → build`.
**CI yeşil olmadan merge yapılmaz.**

## Altyapı

- **PostgreSQL 16** — `localhost:5432`, db: `unified_inbox`
- **Redis 7** — `localhost:6379`
- Tüm servisler `docker compose up -d` ile ayağa kalkar.
