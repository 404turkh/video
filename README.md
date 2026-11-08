# 焱 SubStudio — v0.5 Beta

API anahtarı istemeden tarayıcıda çalışan video ve altyazı editörü.

## Yeni: Cümleleri konuşmaya göre ayarlama

Önce video yükle, **API olmadan altyazı oluştur** düğmesine bas. AI'nın verdiği kelime zamanları üzerinden yeni **Akıllı Altyazı** motoru, duraklamalara ve noktalama işaretlerine göre daha kısa ve okunabilir satırlar oluşturmaya çalışır. Otomatik işlem `subtitle-timing.js` dosyasındadır.

**Altyazılar** sekmesinde:
- **Kısa (tek satır)**, **Dengeli (1–2 satır)** ve **Geniş (2 satır)** yoğunluk seçenekleri
- **Akıllı böl ve zamanla**: Son AI kelime zamanlarıyla altyazıları yeniden oluşturur
- **Geri al**: Son akıllı yeniden bölme işleminden önceki satırları geri yükler
- Her satır için **Böl**, **Birleştir**, **0,1 saniye ileri/geri**, **Başlangıç −0,1**, **Bitiş +0,1**
- Her satırda manuel metin ve başlangıç/bitiş zamanı düzenleme

Önceden el ile değiştirilen metinler, AI kelimelerinden yeniden oluşturma sırasında kaybolabileceği için kullanıcıya onay sorulur.

### Zamanlama doğruluğunun sınırları
Bu yeni özellik **sesi yeniden tanıyıp kelimeleri kesin biçimde hizalamaz**: Whisper'ın sağladığı kelime zamanlarını kullanır. Whisper bazen kelimeleri yanlış algılayabilir ya da zamanını kaydırabilir. Yalnızca cümle düzeyinde zaman alınırsa, parça içindeki kelime süreleri yazı uzunluğuna göre **tahmini** hesaplanır ve satırda işaretlenir. Dışa aktarmadan önce video sesini dinleyerek kontrol etmek gerekir. Otomatik %100 doğruluk garantisi yoktur.

## Yeni: Yatay yazı biçimi

**Stil → Yatay yazı şekli**:
- **Yatay genişlik**: %70–150
- **Yatay eğim**: −20° / +20°
- **Döndürme**: −15° / +15°

Önizlemede CSS transform, videoya kayıt sırasında Canvas dönüşümü uygulanır. Stil kontrolleri ve önceki hazır font/animasyonlar korunur; ayarlar cihazda saklanır.

## Önceki özellikler

- iPad Safari üzerinde cihazda Whisper Base/Tiny ile Türkçe konuşma tanıma; API anahtarı kullanılmaz. İlk kullanımda model indirilir.
- AI metni tek başına yüksek doğruluk garantisi vermez.
- MP4/WebM yükleme, SRT içe/dışa aktarma, canlı önizleme, yazı rengi/font/efekt ve animasyonlar.
- 720p / 1080p / deneysel kaynağa yakın video kaydı seçeneği. Tarayıcıda gerçek zamanlı MediaRecorder çıktısı Safari'de **deneyseldir**; kayıt sesinde donma veya biçim uyumsuzluğu hâlâ mümkün olabilir. Kesin MP4 çıktısı için FFmpeg tabanlı sunucu işleme gerekir.

## Yayınlama

Statik site olarak Vercel veya GitHub Pages'te yayınlanır; derleme gerekmiyor. `index.html`, `app.js`, `subtitle-timing.js`, `styles.css` ve `local-transcriber.js` birlikte olmalıdır. Önceden kalan `worker.js` ve `wrangler.toml`, bu sürümde otomatik altyazı için kullanılmaz.

## Kontrol notu

Altyazı oluşturma algoritması Türkçe, noktalama, duraksama, metni kayıpsız taşıma, çeşitli satır uzunlukları, bölme/birleştirme ve örtüşmeyen zamanlar için örnek verilerle kontrol edilmiştir. iPad'de uçtan uca gerçek video testi bu oturumda yapılmamıştır.
