# 焱 SubStudio — v0.4 Beta

Tarayıcıda video yükleme, AI destekli altyazı oluşturma ve animasyonlu yazı tasarımı.

## AI altyazıyı düzenleme

- **Stil** sekmesindeki font seçimi artık genişletildi: DM Sans, Poppins, Montserrat, Oswald, Anton, Bebas Neue, Space Grotesk, Impact, Georgia, Amiri, Noto Sans Arabic ve Arial.
- AI altyazısı oluşturulduğunda Stil sekmesi otomatik açılır. Sağdaki **Oluşturulan altyazıyı tasarla** düğmesi de aynı bölüme götürür.
- Kalınlık, harf aralığı, yazı rengi, kontur, gölge, konum, sağ/orta/sol hizalama, arka plan koyuluğu, animasyon tipi ve hızı ayarlanabilir.
- Türkçe büyük harf seçeneği (`i → İ`), örnek altyazı önizlemesi, stili sıfırlama ve aynı cihazda tercihleri hatırlama eklendi.
- Değişiklikler canlı önizlemede ve desteklenen tarayıcılarda video kayıt çiziminde kullanılır. Modelin ürettiği kelimeleri **Altyazılar** sekmesinden elle düzeltebilirsin.

## Video çıkış kalitesi

Eski sürümde iPad çıkışı 1280 piksel uzun kenara, 2.5 Mbps bit hızına ve 25 FPS'e kısıtlanıyordu. Bu yüzden çözünürlük/ayrıntı kaybı belirgin olabiliyordu.

- **1080p · Yüksek kalite (önerilen)** — 1920 uzun kenar/1080 kısa kenar sınırı, hedef 30 FPS, 9 Mbps video bit hızı.
- **720p · Akıcı / düşük yük** — 1280/720 sınırı, hedef 24 FPS, 4.2 Mbps.
- **Kaynağa yakın · Deneysel** — 3840/2160'a kadar, hedef 30 FPS, 16 Mbps (iPad'de bellek/işlemci yükü yüksek).
- Gerçek çıktı kalitesi ve kare hızı tarayıcının kaydedicisine bağlıdır; belirtilen bit hızları hedef değerdir, garanti değildir.
- Kare çiziminde `requestVideoFrameCallback` (desteklenirse), diğer tarayıcılarda `requestAnimationFrame` kullanılır.
- 7 saniyelik kare ilerleme durması algılanır; kare sayısı yetersizse donmuş videoyu başarılı kayıt diye sunmak yerine hata verilir.
- Oluşan video iPad'de **Dosyalara Kaydet / Paylaş** veya **Videoyu indir** düğmesiyle kaydedilir.

**Önemli:** Bu hâlâ tarayıcıda gerçek zamanlı kayıt yapan bir beta sürümdür. iPad Safari'de gerçek cihazla doğrulanmış değildir; video/ses donması tamamen ortadan kalkmış sayılmaz. Güvenilir ve kesintisiz yüksek kalite MP4 için ileride sunucuda FFmpeg tabanlı bir işleme kuyruğu planlanmalıdır. Bazı cihazlarda 720p seçmek daha iyi sonuç verir.

## Otomatik Türkçe transkripsiyon

Whisper Base (varsayılan) / Tiny (hafif) modeli tarayıcıda çalışır. `language=turkish` ve `task=transcribe` ile Türkçe konuşmayı Türkçe olarak yazdırma hedeflenir. Ses/video otomatik AI için sunucuya gönderilmez; model ilk kullanımda indirilir. Transkripsiyon hatalı olabilir.

## Barındırma

Vercel veya GitHub Pages'te statik olarak yayınlanabilir. Build komutu gerekmez. `worker.js` ve `wrangler.toml` önceki sürümden kalan, şu anki yerel AI akışında kullanılmayan isteğe bağlı örneklerdir.
