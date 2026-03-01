# AGENTS.md

Bu dosya, bu repoda çalışan AI agent'lar ve geliştiriciler için kesin kuralları tanımlar.

## Kesin Kurallar

1. **Secrets asla commit edilmez.** Hassas değerler `.env` dosyasında tutulur; repoya yalnızca `.env.example` eklenir. `.env`, `.env.local`, `.env.*.local` dosyaları `.gitignore`'da listelenir.
2. **Her iş yeni bir branch üzerinde yapılır.** `main`'e direkt commit atılmaz. Tüm değişiklikler Pull Request (PR) ile birleştirilir.
3. **Her PR şunları içermelidir:**
   - Değişikliğin özeti (ne yapıldı, neden yapıldı)
   - Nasıl çalıştırılır (kurulum adımları, komutlar)
   - `pnpm lint` ve `pnpm test` sonuçları
4. **Webhook idempotency:** Her webhook event'i `providerMessageId` ile unique'dir. Aynı `providerMessageId` ile gelen tekrar event'ler no-op olarak işlenir (duplicate event = skip).
5. **Webhook endpoint'leri senkron iş yapmaz.** Gelen payload'ı doğrula → BullMQ kuyruğuna at → hemen `200 OK` dön. Ağır iş worker'da yapılır.
6. **pnpm workspace düzenini bozma.** `pnpm-workspace.yaml` tanımına (`apps/*`, `packages/*`) uy. Workspace dışına paket ekleme, hoist konfigürasyonunu değiştirme.

## ID Validation Rule

- Prisma schema'daki `id` generator ile DTO validation uyumlu olmalıdır.
- Bu repoda Prisma `@default(cuid())` kullanır; DTO'da `@IsUUID()` kullanılmaz.
- ID doğrulaması gerekiyorsa:
  - CUID için `@Matches(/^c[a-z0-9]{24}$/i)` kullan.
  - Alternatif olarak yalnızca `@IsString()` + service-level existence check yap.
- Prensip: "Gerçek sistemde DB lookup zaten doğrular." DTO validation temel type/shape doğrulaması yapmalıdır.

## PR Checklist

- Yeni endpoint eklendiyse: request body validation + testler zorunludur.
- Unassign gibi `null` flow varsa: `null` ve missing-field testleri zorunludur.
- Seed'den dönen ID'ler ile endpoint çağrısı için E2E smoke doğrulaması zorunludur:
  - En az 1 test veya README example doğrulaması.

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Dil | TypeScript (strict) |
| Paket yöneticisi | pnpm workspace (monorepo) |
| Frontend | Next.js (App Router) + Tailwind CSS |
| Backend | NestJS + Prisma ORM |
| Veritabanı | PostgreSQL |
| Cache / Queue | Redis |
| Job queue | BullMQ (Redis üzerinde) |
| Altyapı (dev) | docker-compose (postgres + redis) |

## Monorepo Yapısı

```
/
├── apps/
│   ├── web/          # Next.js (App Router) + Tailwind
│   └── api/          # NestJS + Prisma + PostgreSQL
├── packages/         # Paylaşılan kütüphaneler (types, utils vb.)
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json      # root scripts: dev, lint, test, build
```

## Webhook Akışı

```
Provider (WhatsApp/Instagram)
  → POST /webhooks/:provider
    → Signature doğrula
    → providerMessageId duplicate kontrolü
    → BullMQ queue'ya job ekle
    → 200 OK dön (< 500ms)
      → Worker job'ı asenkron işler
        → Retry + dead-letter queue
```

## Branch Adlandırma

```
feat/<kısa-açıklama>
fix/<kısa-açıklama>
chore/<kısa-açıklama>
```

## PR Şablonu

```markdown
## Özet
<!-- Ne değişti ve neden? -->

## Nasıl Çalıştırılır
docker compose up -d
pnpm install
pnpm --filter api prisma migrate dev
pnpm dev

## Test / Linter Sonuçları
pnpm lint   # ✅ hatasız
pnpm test   # ✅ tüm testler geçti
```
