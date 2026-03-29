# PRD — Unified Inbox

**Versiyon:** 0.1 (MVP)
**Tarih:** 2026-03-01
**Durum:** Taslak

---

## 1. Ürün Özeti

Unified Inbox, e-ticaret markalarının WhatsApp ve Instagram mesajlarını tek bir ekrandan, ekip halinde yönetmesini sağlayan SaaS ürünüdür. Marka başına ayrı workspace, rol tabanlı erişim ve gerçek zamanlı güncelleme ile destek ekiplerinin kanal karmaşasını ortadan kaldırır.

---

## 2. Hedef Kitle

- Günde 50+ müşteri mesajı alan e-ticaret markaları
- 2–20 kişilik müşteri destek ekipleri
- WhatsApp Business API ve Instagram Messaging API kullanan veya kullanmaya hazır işletmeler

---

## 3. MVP Kapsamı

### 3.1 Multi-Tenant: Organization / Workspace

**Açıklama:** Her marka kendi izole workspace'inde çalışır. Veriler tenant'lar arasında sızmaz.

**Acceptance Criteria:**
- Kayıt sırasında bir Organization oluşturulur; her Organization'ın benzersiz bir `slug`'ı vardır.
- Bir kullanıcı birden fazla Organization'a üye olabilir.
- API katmanı her istekte `organizationId` doğrular; farklı tenant verisi dönmez.
- Organization sahibi (owner) workspace ayarlarını düzenleyebilir, diğer kullanıcılar düzenleyemez.

---

### 3.2 Users / Agents ve Roller

**Açıklama:** Owner ve Agent olmak üzere iki rol vardır. Owner tüm yetkiye sahipken Agent yalnızca konuşmaları yönetebilir.

**Roller ve Yetkiler:**

| Yetki | Owner | Agent |
|-------|-------|-------|
| Workspace ayarları | ✅ | ❌ |
| Üye davet et / çıkar | ✅ | ❌ |
| Konuşma görüntüle | ✅ | ✅ |
| Konuşmaya yanıt ver | ✅ | ✅ |
| Tag / not ekle | ✅ | ✅ |
| Konuşma ata | ✅ | ✅ |

**Acceptance Criteria:**
- Owner bir e-posta adresi ile agent davet edebilir; davet linki 48 saat geçerlidir.
- Agent yetkisiz bir endpoint'e istek atarsa `403 Forbidden` döner.
- Roller DB'de saklanır ve UI rol değişikliğini anında yansıtır.
- Owner kendi rolünü değiştiremez (en az bir owner zorunludur).

---

### 3.3 Channel Connect Ekranı

**Açıklama:** WhatsApp ve Instagram kanallarını workspace'e bağlamak için bir ayarlar ekranı. MVP'de gerçek OAuth/API entegrasyonu yoktur; placeholder UI yeterlidir.

**Acceptance Criteria:**
- Ayarlar > Kanallar ekranında WhatsApp ve Instagram için birer kart gösterilir.
- Her kart "Bağla" butonu içerir; tıklandığında "Yakında" modalı açılır.
- Bağlı kanal varsa kart üzerinde "Bağlı" badge'i gösterilir (mock veri ile test edilebilir).
- Kanal kartları responsive tasarıma sahiptir.

---

### 3.4 Unified Inbox — Conversations Listesi

**Açıklama:** Tüm kanallardan gelen konuşmalar tek bir listede gösterilir; filtrelenebilir ve aranabilir.

**Acceptance Criteria:**
- Liste; konuşmanın kaynağı (WhatsApp / Instagram), müşteri adı, son mesaj önizlemesi ve zaman damgasını gösterir.
- Konuşmalar son mesaj zamanına göre azalan sırada listelenir.
- Filtreler: Kanal, Durum (open / resolved / snoozed), Atanan agent, Tag.
- Arama, müşteri adı ve mesaj içeriğinde çalışır.
- Okunmamış konuşmalar görsel olarak ayırt edilir.
- Liste sayfalama veya infinite scroll ile en az 200 konuşmayı destekler.

---

### 3.5 Conversation View — Mesajlar ve Reply

**Açıklama:** Seçilen konuşmanın tüm mesaj geçmişi ve yanıt kutusu.

**Acceptance Criteria:**
- Mesajlar kronolojik sırada, gelen/giden ayrımı ile gösterilir.
- Her mesajda gönderen adı, içerik ve zaman damgası bulunur.
- Yanıt kutusu en az 1000 karakter destekler; gönderme Enter (Shift+Enter yeni satır) ile tetiklenir.
- Mesaj gönderildikten sonra liste en alta kayar ve yeni mesaj anında görünür.
- Görsel gönderilemez (MVP); kullanıcıya "medya henüz desteklenmiyor" uyarısı gösterilir.
- Konuşma "resolved" işaretlendiğinde yanıt kutusu kilitlenir ve "Yeniden Aç" butonu çıkar.

---

### 3.6 Tags, Notes ve Assignment

**Tags:**
- Owner ve agent, konuşmaya serbest metin tag ekleyebilir.
- Aynı tag birden fazla konuşmaya uygulanabilir; tag'lar workspace genelinde paylaşılır.
- Tag ekleme ve kaldırma audit log'a düşer.

**Notes (Dahili Notlar):**
- Mesaj dizisinin içinde görünür ama müşteriye gönderilmez; farklı arka plan rengiyle ayırt edilir.
- Her not; yazar adı ve zaman damgasını gösterir.
- Not silinemez (MVP), yalnızca eklenir.

**Assignment (Atama):**
- Konuşma workspace üyelerinden birine atanabilir; atanan agent inbox'ta konuşmayı filtreli görebilir.
- Atama değiştiğinde eski ve yeni atanan agent'a in-app bildirim gönderilir (toast yeterli).
- Atanmamış konuşmalar "Atanmamış" filtresiyle listelenebilir.

**Acceptance Criteria (Ortak):**
- Tag, not ve atama işlemleri `200ms` içinde UI'a yansır.
- Tüm bu işlemler `organizationId` doğrulamasından geçer.

---

### 3.7 Realtime Update

**Açıklama:** Yeni mesaj geldiğinde agent ekranı yenilemeden güncellenir.

**Acceptance Criteria:**
- Yeni mesaj geldiğinde konuşma listesi ve açık konuşma view'ı otomatik güncellenir.
- Bağlantı kesilirse UI "Bağlantı yok" uyarısı gösterir ve yeniden bağlanmayı dener.
- MVP implementasyonu `GET /events/stream` üzerinden SSE kullanır; backend fanout için Redis Pub/Sub kullanılabilir ama client sözleşmesi SSE olarak sabit kalır.
- Realtime güncelleme yalnızca kullanıcının workspace'indeki konuşmaları kapsar.

---

### 3.8 Audit Log

**Açıklama:** Kritik işlemler kaydedilir; bu kayıtlar owner tarafından görüntülenebilir.

**Kaydedilen Olaylar (MVP):**
- Üye davet edildi / kaldırıldı
- Rol değiştirildi
- Konuşma atandı / atama kaldırıldı
- Konuşma resolved / reopened yapıldı
- Tag eklendi / kaldırıldı
- Kanal bağlantısı oluşturuldu / silindi

**Acceptance Criteria:**
- Her log satırı: `timestamp`, `actorId` (işlemi yapan), `action`, `targetId`, `metadata (JSON)` alanlarını içerir.
- Owner, Ayarlar > Audit Log ekranından son 90 günlük log'u görebilir.
- Log satırları silinemez ve düzenlenemez.
- Log listesi tarih ve action türüne göre filtrelenebilir.

---

## 4. MVP Dışı (Sonraki Fazlar)

Aşağıdaki özellikler bu versiyonda yer almaz:

- **AI Auto-Reply:** LLM tabanlı otomatik yanıt önerileri
- **CRM Pipeline:** Müşteri bazlı pipeline ve deal yönetimi
- **Shopify / IKAS Entegrasyonu:** Sipariş bilgilerini inbox içinde görüntüleme
- **Gelişmiş Raporlama:** Agent performans ve kanal bazlı analitik
- **SLA / Otomatik Yönlendirme:** Kural tabanlı konuşma atama
- **Mobil Uygulama**

---

## 5. Definition of Done

Bir özellik veya PR "tamamlandı" sayılabilmesi için aşağıdaki kriterlerin **tamamını** karşılaması gerekir:

1. **Kod kalitesi:** `pnpm lint` hatasız geçer; TypeScript strict mod ihlali yoktur.
2. **Testler:** İlgili birim ve/veya entegrasyon testleri yazılmıştır ve `pnpm test` hatasız geçer.
3. **Acceptance Criteria:** Bu PRD'de tanımlanan tüm AC maddelerini karşılar; manuel test edilmiştir.
4. **API sözleşmesi:** Yeni endpoint'ler için request/response tipleri tanımlanmış ve `apps/api` ile `apps/web` arasında paylaşılmıştır.
5. **Güvenlik:** Tüm endpoint'ler authentication + authorization kontrolünden geçer; tenant izolasyonu sağlanmıştır.
6. **Secrets:** `.env` dosyasına eklenen her değişken `.env.example`'a da eklenmiştir; hiçbir secret commit edilmemiştir.
7. **Migration:** Prisma migration dosyası commit'e dahildir ve `migrate deploy` çalıştırılabilir durumdadır.
8. **PR açıklaması:** Özet, nasıl çalıştırılır ve test sonuçları bölümleri doldurulmuştur.
9. **Review:** En az bir takım üyesi (veya owner) PR'ı approve etmiştir.
10. **No regressions:** Mevcut testler kırılmamıştır; önceden çalışan akışlar hâlâ çalışmaktadır.
