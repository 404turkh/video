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

## v0.6.1 — iPad Safari'nin AI aşamasında kapanmasını azaltma

**Sorun:** iPad Safari'de yerel Whisper Base yüklenirken (2/3) bellek taşması, sayfanın kendiliğinden yeniden açılması veya uygulamanın kapanması olabilir. Aynı hata Transformers.js'in Whisper Base ile iPad Safari üzerindeki GitHub hata kayıtlarında da rapor edilmiştir (huggingface/transformers.js #1241). WebKit süreçleri sistemin bellek baskısı nedeniyle sonlandırılabilir.

**Bu sürümdeki değişiklikler:**

- iPad/iPhone cihazlarda **Whisper Base seçeneği devre dışı**: yalnızca çok dilli Whisper Tiny / q8 WASM denenir. Masaüstünde Base seçilebilir.
- iPad güvenli modunda **40 saniye** ve **60 MB** sınırı vardır. Daha büyük videolar AI işlemi başlamadan reddedilir, kaydedilmiş proje etkilenmez.
- AI modeli kullanıldıktan sonra iPad'de modelin temizlenmesi denenir, bir sonraki işlemde biriken bellek azaltılır.
- AI başlatılmadan önce taslak, senkron yerel kayıt adımıyla korunmaya çalışılır; ayrıca IndexedDB kaydı devam eder.
- Model yükleme aşaması kaydedilir; sayfa beklenmedik biçimde yeniden açılırsa önceki işlemin tamamlanmadığı bildirilir.
- Stil, altyazı, bağımsız metin ve dışa aktarma sistemleri korunmuştur.

**Sınırlar:** Bu bir güvenlik/kararlılık iyileştirmesidir, iPad üzerinde kesin AI transkripsiyonu veya çökmesiz çalışma garantisi değildir. Whisper Tiny'ın doğruluğu Base'den düşük olabilir. Daha yüksek doğruluk ve uzun videolar için cihazdan bağımsız bir sunucu transkripsiyon seçeneği gerekecektir. Sunucu kullanımı kullanıcı dosyasının aktarılmasını ve barındırma maliyetini gerektirir; şu anda eklenmemiştir.

Kaynaklar: https://github.com/huggingface/transformers.js/issues/1241 ve https://bugs.webkit.org/show_bug.cgi?id=277848 .


## v0.7 — 1–10 dakikalık videolar için kendi sunucunda altyazı

iPad Safari'nin yerel Whisper Base/Tiny modelini yüklerken yeniden yüklenmesi veya kapanması, video dosyasının MB boyutundan bağımsız bellek sınırları nedeniyle olabilir. Süre sınırını artırmak tek başına çözüm değildir.

### AI Altyazı bölümündeki seçenekler

- **iPad'de / Kısa video:** Whisper Tiny cihazda çalışır. iPad'de 40 saniye ve 60 MB sınırı hâlâ vardır. Kapanma riski tamamen giderilemez.
- **Sunucuda / Uzun video:** Konuşma tanıma işlemi iPad belleği yerine kendi sunucundaki faster-whisper modeliyle yapılır. 1–2 dakikalık videolar hedeflenir; sunucu örneği 10 dakika ve 120 MB sınırıyla yapılandırılmıştır.
- Sunucu henüz kurulmadıysa uygulama açıkça bağlantı hatası gösterir. **Sunucu kurulmadan uzun video AI'si çalışmaz.**
- OpenAI API anahtarı gerekmez. Ancak ayrı bir sunucu barındırmak, belirli maliyet ve RAM/CPU gerektirir.

### Render kurulumu (sunucu ayrıca yayınlanmalı)

1. Render'da New → Blueprint seçip bu GitHub reposunu bağla. Kökteki render.yaml dosyasını kullan.
2. Oluşturulacak substudio-whisper Docker web servisi için en az **2 GB RAM** tavsiye edilir. Render'ın 512 MB ücretsiz web planı model için yetersiz kalabilir. Plan maliyetini yayına almadan kontrol et.
3. Render, STUDIO_ACCESS_KEY adlı gizli erişim kodunu otomatik üretecek. Kodu GitHub'a veya herkese açık dosyalara yazma.
4. Oluşan HTTPS sunucu adresini sitenin AI Altyazı → Sunucuda bölümündeki sunucu adresi alanına gir. Gizli kodu da Sunucu erişim kodu alanına gir.
5. **Sunucu bağlantısını kontrol et** düğmesini kullan. Çalışırsa 1–2 dakikalık video yükleyip otomatik altyazı oluştur.

Bu sunucu OpenAI'dan ücretli model çağırmaz. Videolar kendi sunucuna HTTPS ile gönderilir; işlem sonunda geçici dosya silinir. Sunucu modeli ilk kullanımda indirilebilir. Aynı anda tek transkripsiyon görevi yapılır. Erişim kodu yalnızca aktif tarayıcı oturumunda, sunucu URL'si ise cihazda saklanır.

Sunucu kodu backend/transcription_server.py içindedir. Dockerfile ve requirements.txt backend klasöründedir; render.yaml kökte yer alır. Sağlık kontrolü /health, transkripsiyon /transcribe. Türkçe seçiliyken çeviri yerine Türkçe konuşmayı Türkçe metne dökme hedeflenir. AI transkripsiyon hata yapabilir.

### Site eski sürümdeyse

GitHub Pages'in son yayın kayıtları başarılı görünse de Safari HTML'yi önbellekten gösterebilir. Sitenin bulunduğun URL'sini yeni bir sekmede sonuna ?v=07 ekleyerek aç; üstte **BETA 0.7** görmelisin. **Safari site verilerini silme**, yerel kayıtların kaybolabilir.

GitHub'da Settings → Pages → Build and deployment ve Actions → pages build and deployment bölümleriyle yayınlanan kaynağı kontrol edebilirsin. Repo bir statik GitHub Pages sitesidir; bu ortam Python AI sunucusunu tek başına çalıştıramaz.
