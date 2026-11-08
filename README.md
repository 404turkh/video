# 焱 SubStudio — v0.2 Beta (API anahtarsız)

Türkçe arayüzlü, animasyonlu altyazı editörü. Web sitesi saf HTML/CSS/JS ile çalışır.

## Yerel AI otomatik altyazı

- Cloudflare Worker, OpenAI API anahtarı veya abonelik **gerekmez**.
- `local-transcriber.js` tarayıcıda çok dilli Whisper Tiny modelini çalıştırır (Transformers.js / WebAssembly).
- Model ilk kullanımda Hugging Face üzerinden indirilir; ses ve video dosyaları transkripsiyon için dışarı yüklenmez.
- Ses, videodan Web Audio ile gerçek zamanlı yakalandığı için işlem video süresi kadar sürebilir. Model indirme ve tanıma için ek süre gerekir.
- Özellikle iPad/Safari için 10–30 saniyelik MP4/H.264 + AAC sesli videolarla dene. Beta sürümde **90 saniye** ve **120 MB** sınırları vardır.
- İngilizce, Türkçe ve Arapça dil seçilebilir veya otomatik tanıma kullanılabilir.
- Kelime zamanları üretilerek editörün normal altyazı satırlarına çevrilir; doğruluk garanti değildir.
- Kur'an ayetleri ve mealler gibi hassas metinlerde çıktıyı kaynakla kontrol et; otomatik tanıma hatalı olabilir.
- İPad'de bellek sınırları, tarayıcıların ses yakalama kısıtları, CDN veya model indirme engelleri nedeniyle başarısız olabilir; bu hali gerçek cihazda doğrulanmış değildir.

## Sunumu yayınlamak

1. GitHub reposunu GitHub Pages veya Vercel'e bağla.
2. Sadece statik dosyaları yayınla; derleme komutu yok.
3. Videoyu yükle → **API olmadan altyazı oluştur** → dili seç → sonucu düzenle → SRT indir veya deneysel dışa aktar seçeneğini kullan.

## Desteklenen diğer araçlar

- MP4/WebM video yükleme, canlı önizleme, zamanları elle düzeltme.
- Altı hazır yazı stili, animasyonlar, yazı tipleri, renk ve gölge.
- SRT dosyası içe/dışa aktarma.
- Deneysel tarayıcı tabanlı video kaydı; Safari'de sesli MP4 dışa aktarma garantili değil.

## Dosyalar

- `index.html` — web arayüzü.
- `styles.css` — tasarım.
- `app.js` — editör ve yerel AI düğmesinin bağlantısı.
- `local-transcriber.js` — cihazdaki Whisper transkripsiyonu.
- `vercel.json` — Vercel statik barındırma.
- `worker.js` ve `wrangler.toml` — v0.1'den kalan **isteğe bağlı eski API örneği**, mevcut arayüz bunları **kullanmıyor**.

API anahtarı GitHub'a veya tarayıcıya eklenmemelidir.
