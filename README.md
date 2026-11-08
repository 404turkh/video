# 焱 SubStudio — v0.6 Beta

Bu sürüm, iPad Safari'de proje kaybı ve kullanımı zor, sıkışık editör şikayetleri üzerine yeniden düzenlendi.

## 1. Artık ayrı çalışma sayfaları var

- **Proje:** Video yükle/değiştir, proje adı, görüntü oranı, otomatik kayıt ve JSON yedek.
- **AI Altyazı:** Türkçe varsayılan transkripsiyon; kelime zamanlı bölme, kısa/dengeli/uzun altyazı, split/merge, ±0,1 saniye düzeltmeler, SRT içe/dışa aktarma.
- **Yazı Stili:** Altyazı fontu, boyut, kontur, renk, gölge, animasyon, yatay genişlik (%65–155), eğim ve döndürme.
- **Ekstra Metin:** Altyazılardan **bağımsız** çoklu metin katmanı; içerik, başlangıç/bitiş zamanı, X/Y konumu, font, renk, arka plan ve animasyon. Önizlemede parmakla taşıma.
- **Dışa Aktar:** Kayıt durumunu, iptal düğmesini, kalite seçeneklerini ve kaydetme/paylaşma eylemlerini ayrı bölümde gösterir.

## 2. Otomatik taslak kaydı ve kurtarma

- Metin, stil, altyazı ve katman düzenlemeleri **IndexedDB + localStorage yedeği** ile otomatik kaydedilir.
- Video dosyası da depolama kotası izin verirse IndexedDB'ye alınır (bu sürümde en fazla 180 MB). Tarayıcı depolama sınırı veya gizli mod nedeniyle bu işlem başarısız olursa açık uyarı gösterilir.
- Sayfayı yenileyince projeyi ve varsa saklanan videoyu geri yükler.
- **Yedek indir:** .substudio.json olarak altyazıları, katmanları, stili ve proje bilgilerini indirir. **Video dosyasını içermez**; yeniden eklemek gerekir.
- **Yedekten aç:** JSON dosyasından editör durumunu geri yükler.
- **Yeni proje:** Kullanıcı onayı almadan mevcut taslağı silmez.

**Önemli:** Tarayıcı verileri silinir, depolama kotası aşılır veya özel gezinme kapanırsa yerel taslak kaybolabilir. Önemli projeler için her zaman JSON yedeğini ayrıca sakla. v0.5 ve öncesinde kaydedilmeden kaybolmuş düzenlemeler otomatik kurtarılamaz.

## 3. Video dışa aktarma: durum ve sınır

v0.6 export motoru, önceki modal yerine ayrı sayfa kullanır. Kayıt başlarken video oynatılır ve Canvas + MediaRecorder ile yeniden kaydedilmeye çalışılır. Gerçek kareleri kullanır, ilerleme bilgisi verir, yetersiz kare/format durumunda hatayı gösterir; iptal ve bekleme sınırları vardır. Kalite varsayılan olarak iPad'i daha az zorlayan **720p**'dir. Ayrıca **1080p** ve deneysel kaynak seçenekleri bulunur.

**Bu hâlâ güvenilir bir iPad MP4 render sistemi değildir.** Safari'nin Canvas/MediaRecorder ve bellek sınırları nedeniyle kayıt donabilir, ses kaydı başarısız olabilir veya istenen biçim oluşmayabilir. Kodun bir bölümünü mocklarla test ettik, ancak gerçek iPad cihazında tam video export testimiz yoktur. Garantili MP4 çıktısı için FFmpeg tabanlı bir render sunucusu gereklidir.

## 4. Nasıl kullanılır?

1. **Proje** → video yükle. Video depolama durumunu kontrol et.
2. **AI Altyazı** → otomatik altyazı oluştur, gerektiğinde satırları düzenle veya SRT içe aktar.
3. **Yazı Stili** → font, animasyon ve yatay yazı dönüşümlerini ayarla.
4. **Ekstra Metin** → kendi başlığını, ayet etiketini veya açıklamanı ekle; süresini ve konumunu belirle.
5. **Yedek indir** ile projenin bir kopyasını sakla.
6. **Dışa Aktar** → kısa videolarda 720p ile dene. Tarayıcı video üretemezse SRT'yi ve proje yedeğini kaydet.

## Teknik dosyalar

- index.html — beş ayrı çalışma bölümünün arayüzü
- studio-v06.css — yeni responsive iPad/desktop düzeni
- studio-v06.js — proje, altyazılar, stil, bağımsız metin katmanları
- studio-v06-storage.js — otomatik kayıt, geri yükleme, IndexedDB
- studio-v06-export.js — ayrı, iptal edilebilir tarayıcı dışa aktarımı
- subtitle-timing.js — kelime zamanlı akıllı bölme
- local-transcriber.js — cihazda Whisper Base / Tiny transkripsiyonu

Diğer eski dosyalar Git geçmişinde korunmaktadır. Statik GitHub Pages veya Vercel üzerinde derleme olmadan çalışır.
