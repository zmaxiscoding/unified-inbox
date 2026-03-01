# AGENTS.md

Bu dosya, bu repoda çalışan AI agent'lar (ve insan geliştiriciler) için kuralları ve mimari kararları tanımlar.

## Genel Kurallar

- **Secrets asla commit edilmez.** Tüm hassas değerler `.env` dosyasında tutulur; repoya yalnızca `.env.example` eklenir.
- **Her iş yeni bir branch üzerinde yapılır.** `main`'e direkt commit atılmaz; değişiklikler Pull Request (PR) aracılığıyla birleştirilir.
- **Her PR şunları içermeli:**
  - Değişikliğin özeti (ne yapıldı, neden yapıldı)
  - Nasıl çalıştırılır (kurulum adımları, komutlar)
  - Linter ve test sonuçları (çıktı veya "geçti" notu)

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Dil | TypeScript (strict mod) |
| Paket yöneticisi | pnpm workspace (monorepo) |
| Frontend | Next.js (App Router) + Tailwind CSS |
| Backend | NestJS + Prisma ORM |
| Veritabanı | PostgreSQL |
| Cache / Queue | Redis |
| Job queue | BullMQ (Redis üzerinde) |
| Altyapı (geliştirme) | docker-compose |

## Monorepo Yapısı

```
/
├── apps/
│   ├── web/          # Next.js (App Router) + Tailwind
│   └── api/          # NestJS + Prisma + PostgreSQL
├── packages/         # Paylaşılan kütüphaneler (types, utils vb.)
├── docker-compose.yml
├── .env.example
└── pnpm-workspace.yaml
```

## Mimari Kararlar

### Webhook İşleme
Gelen webhook'lar **asla senkron olarak işlenmez**. Akış şu şekildedir:

1. API endpoint webhook'u alır ve bir **BullMQ job**'ı kuyruğa ekler.
2. Kuyruk worker'ı işi asenkron olarak işler.
3. Bu sayede timeout riski ortadan kalkar ve yeniden deneme (retry) mekanizması sağlanır.

### Geliştirme Ortamı
`docker-compose` aşağıdaki servisleri ayağa kaldırır:
- `postgres` — uygulama veritabanı
- `redis` — cache ve BullMQ queue backend'i

## Branch Adlandırma

```
feat/<kısa-açıklama>
fix/<kısa-açıklama>
chore/<kısa-açıklama>
```

## PR Şablonu

```
## Özet
<!-- Ne değişti ve neden? -->

## Nasıl Çalıştırılır
<!-- Kurulum ve test adımları -->
pnpm install
pnpm --filter api prisma migrate dev
pnpm dev

## Test / Linter Sonuçları
<!-- pnpm lint ve pnpm test çıktısı -->
```
