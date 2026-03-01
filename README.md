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

# 5. Veritabanı migration'ını çalıştır
pnpm --filter api prisma migrate dev --name init

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
pnpm dev      # web + api paralel başlatır
pnpm build    # web + api production build
pnpm lint     # tüm workspace'lerde lint çalıştırır
pnpm test     # tüm workspace'lerde test çalıştırır
```

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

## Altyapı

- **PostgreSQL 16** — `localhost:5432`, db: `unified_inbox`
- **Redis 7** — `localhost:6379`
- Tüm servisler `docker compose up -d` ile ayağa kalkar.
