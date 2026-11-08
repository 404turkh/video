# 焱 SubStudio — v0.1

Türkçe arayüzlü, animasyonlu altyazı editörü. Vercel'de yayınlanabilen HTML/CSS/JS tabanlı ilk sürüm.

## Özellikler

- MP4/WebM videolarını tarayıcıda yükleme ve önizleme
- Zamanlı altyazıları görüntüleme ve metin/zaman düzenleme
- 6 yazı stili, farklı fontlar (Arapça için Amiri), renk, kontur, gölge ve animasyon
- SRT altyazı dosyası içe ve dışa aktarma
- Cloudflare Worker üzerinden isteğe bağlı otomatik AI transkripsiyonu
- Deneysel video + ses dışa aktarma (özellikle Safari'de kısıtlı olabilir)

## Siteyi Vercel'de yayınlama

1. Bu GitHub deposunu Vercel'e import et.
2. **Framework Preset: Other** seç. Build command gerekmez.
3. Siteyi yayınla. Altyazı düzenleme ve SRT araçları API anahtarsız çalışır.

## AI otomatik altyazıyı etkinleştirme

1. `worker.js` dosyasını ayrı bir Cloudflare Worker olarak yayınla. İstersen `wrangler.toml` yapılandırmasını kullan.
2. `OPENAI_API_KEY` değerini Cloudflare'de **Secret** olarak ekle. Anahtarı GitHub koduna veya tarayıcı tarafına yazma.
3. `ALLOWED_ORIGIN` değişkenini sitenin tam adresine ayarla (örnek: `https://ornek.vercel.app`).
4. SubStudio içindeki Ayarlar bölümüne Worker URL'sini yaz.
5. 25 MB altındaki MP4/WebM dosyalarında otomatik altyazıyı dene.

**Güvenlik:** CORS kullanıcı doğrulaması değildir. Ücretli API anahtarınla hizmeti herkese açmadan önce oturum açma, hız kısıtlama, kullanıcı kotası, kötüye kullanım ve harcama limiti eklenmeli. AI transkripsiyonunda dosya üçüncü taraf sağlayıcıya aktarılır.

**Model durumu:** Bu MVP, kelime zamanlarını almak için `whisper-1` kullanır. Modelin 26 Şubat 2027'de kaldırılması planlandığı için uzun vadede yeni bir model ve hizalama çözümü gerekecek.

**Dışa aktarma:** Tarayıcı üzerinden videoya altyazı yakma deneyseldir; iPhone/iPad Safari'de her zaman çalışmayabilir. Güvenilir, sesli MP4 için ileride FFmpeg tabanlı sunucu render'ı eklenmeli.

## Dosyalar

- `index.html`: Sayfa
- `styles.css`: Tasarım
- `app.js`: Editör davranışları
- `worker.js`: Opsiyonel transkripsiyon API'si
- `wrangler.toml`: Cloudflare yapılandırması
- `vercel.json`: Vercel ayarları

Sıradaki fikirler: Arapça/Türkçe çift satır ayet modu, karaoke kelime vurgusu, şablon kaydetme, güvenilir MP4 çıktısı.
