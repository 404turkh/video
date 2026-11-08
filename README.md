# 焱 SubStudio — v0.3 Beta

Web tabanlı, cihazda çalışan AI altyazı ve video editörü.

## Türkçe altyazı (v0.3)

- Varsayılan dil **Türkçe**. Whisper çalıştırılırken `language='turkish'` ve `task='transcribe'` zorlanır. İngilizceye çeviri modu kullanılmaz.
- Önerilen model: `Xenova/whisper-base` (çok dilli). Eski `Xenova/whisper-tiny` seçeneği düşük bellek/hız için durur.
- İlk kullanımda model indirilmeli. Base, Tiny'den daha çok kaynak kullanır; iPad Safari'de bellek sorunu olabilir.
- Ses cihazda oynatılarak Web Audio ile kaydedilir. AI anahtarı gerekmez. Beta sınırları: 90 saniye / 120 MB.
- Model çıktıları bazen yanlış kelime üretebilir; özellikle Kur'an tilaveti veya özel isimleri yayımlamadan önce kullanıcı kontrol etmeli.

## Video dışa aktarma (v0.3)

- Canvas + WebAudio + MediaRecorder ile **gerçek zamanlı** sesli video kaydı denenir.
- Video oynatma isteği kullanıcının düğmeye bastığı anda yapılır; iOS Safari kullanıcı etkileşimi sınırlamalarını azaltır.
- Mobil Safari'de işleme çözünürlüğü performans için sınırlandırılır.
- Kayıt tamamlandığında **Videoyu indir** veya **Dosyalara Kaydet / Paylaş** düğmesine **ayrıca basılması gerekir**. iPad'de ikincisi Apple paylaşım sayfasını açabilir.
- Bu özellik hâlâ **deneysel**. iPad'de gerçek cihaz testi yapılmadı; bazı Safari/codec kombinasyonlarında video üretilemeyebilir. Kesin MP4 dışa aktarma için gelecekte sunucuda FFmpeg kullanılması gerekir.
- Sorun varsa editörde SRT'yi indirip mevcut videoyla farklı editörde birleştirebilirsin.

## Yayınlama

Statik dosyaları GitHub Pages veya Vercel'de yayınla. Build komutu gerekmiyor; ana dosya `index.html`.

## Dosyalar

- `index.html`: Arayüz, dil/model ve dışa aktarma seçenekleri
- `styles.css`: Tasarım
- `app.js`: Video, altyazı, SRT, MediaRecorder/Share
- `local-transcriber.js`: Yerel Whisper Base/Tiny konuşma tanıma
- `vercel.json`: Vercel yapılandırması
- `worker.js`, `wrangler.toml`: Önceki sürümden kalan isteğe bağlı API örneği; bu sürümün AI altyazısı bunları kullanmaz.
