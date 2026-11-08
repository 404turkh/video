/* 焱 SubStudio — deneysel, API anahtarsız tarayıcı transkripsiyonu.
 * Model Hugging Face üzerinden ilk kullanımda indirilir; medya sunucuya yüklenmez.
 * Safari/iPad bellek ve otomatik oynatma sınırları nedeniyle kısa videolar önerilir.
 */
(function () {
  'use strict';
  const MODEL_ID = 'Xenova/whisper-tiny'; // çok dilli: Türkçe, Arapça, İngilizce
  const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
  const MAX_SECONDS = 90;
  let modelPromise = null;

  function downsample(chunks, count, originalRate) {
    const combined = new Float32Array(count);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
    const sampleRate = 16000;
    const result = new Float32Array(Math.round(count * sampleRate / originalRate));
    const ratio = originalRate / sampleRate;
    for (let i = 0; i < result.length; i++) {
      const pos = i * ratio;
      const left = Math.floor(pos);
      const frac = pos - left;
      const a = combined[Math.min(left, count - 1)];
      const b = combined[Math.min(left + 1, count - 1)];
      result[i] = a * (1 - frac) + b * frac;
    }
    return result;
  }

  function captureAudio(file, report) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return Promise.reject(new Error('Bu tarayıcıda Web Audio desteği bulunamadı.'));
    if (file.size > 120 * 1024 * 1024) return Promise.reject(new Error('Yerel AI için video en fazla 120 MB olmalı.'));
    let ctx;
    try { ctx = new AudioCtx(); } catch (_) {
      return Promise.reject(new Error('Ses işleme başlatılamadı.'));
    }
    const v = document.createElement('video');
    v.setAttribute('playsinline', '');
    v.playsInline = true;
    v.preload = 'auto';
    v.style.cssText = 'position:fixed;inset:0;width:1px;height:1px;opacity:.01;pointer-events:none;z-index:-1';
    const url = URL.createObjectURL(file);
    v.src = url;
    document.body.appendChild(v);
    let source, processor;
    try {
      source = ctx.createMediaElementSource(v);
      processor = ctx.createScriptProcessor(4096, 2, 1);
      source.connect(processor);
      processor.connect(ctx.destination);
    } catch (_) {
      v.remove(); URL.revokeObjectURL(url); ctx.close().catch(() => {});
      return Promise.reject(new Error('Video sesi okunamadı. MP4/H.264 ve AAC ses biçimini dene.'));
    }

    const chunks = [];
    let sampleCount = 0, loudness = 0, settled = false, timeout;
    report('Video sesi cihazında okunuyor. Video süresi kadar beklenebilir…');

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        v.pause();
        processor.onaudioprocess = null;
        try { source.disconnect(); processor.disconnect(); } catch (_) {}
        v.removeAttribute('src'); v.load(); v.remove();
        URL.revokeObjectURL(url);
        ctx.close().catch(() => {});
      };
      const finish = (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (err) { reject(err); return; }
        if (sampleCount < 1600 || loudness < 0.00001) {
          reject(new Error('Videoda okunabilir ses bulunamadı. Sesin açık olduğundan emin ol.'));
          return;
        }
        resolve(downsample(chunks, sampleCount, ctx.sampleRate));
      };
      processor.onaudioprocess = (e) => {
        if (settled) return;
        const input = e.inputBuffer;
        const first = input.getChannelData(0);
        const second = input.numberOfChannels > 1 ? input.getChannelData(1) : null;
        const out = new Float32Array(first.length);
        for (let i = 0; i < first.length; i++) {
          const sample = second ? (first[i] + second[i]) * .5 : first[i];
          out[i] = sample;
          loudness += Math.abs(sample);
        }
        chunks.push(out);
        sampleCount += out.length;
        e.outputBuffer.getChannelData(0).fill(0); // sessiz kayıt
      };
      v.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(v.duration) && v.duration > MAX_SECONDS) {
          finish(new Error('iPad için bu denemede en fazla 90 saniyelik video kullan.'));
        }
      }, { once: true });
      v.addEventListener('timeupdate', () => {
        if (settled) return;
        if (v.currentTime > MAX_SECONDS) {
          finish(new Error('Yerel AI denemesi 90 saniyeyle sınırlı.'));
          return;
        }
        report('Video sesi okunuyor: ' + Math.floor(v.currentTime) + ' sn');
      });
      v.addEventListener('error', () => finish(new Error('Video oynatılamıyor. MP4/H.264 + AAC deneyebilirsin.')), { once: true });
      v.addEventListener('ended', () => finish(), { once: true });

      // Bu iki çağrı tıklama olayının içinde başlatılmalıdır (özellikle iPad Safari).
      const resumed = ctx.resume();
      const played = v.play();
      Promise.all([resumed, played]).catch(() => finish(new Error('Safari ses oynatımını engelledi. Videoya tekrar dokunarak dene.')));
      timeout = setTimeout(() => finish(new Error('Ses okuma zaman aşımına uğradı. Daha kısa bir video dene.')), 112000);
    });
  }

  async function loadModel(report) {
    if (!modelPromise) {
      modelPromise = (async () => {
        report('AI modeli indiriliyor. İlk kullanımda büyük bir indirme yapılır…');
        const { pipeline, env } = await import(TRANSFORMERS_URL);
        env.allowLocalModels = false;
        return pipeline('automatic-speech-recognition', MODEL_ID, {
          device: 'wasm',
          dtype: 'q8',
          progress_callback: event => {
            if (event && event.status === 'progress' && typeof event.progress === 'number') {
              report('AI modeli indiriliyor: %' + Math.round(event.progress));
            }
          }
        });
      })().catch(error => { modelPromise = null; throw error; });
    }
    return modelPromise;
  }

  async function transcribe(file, options = {}) {
    const report = typeof options.onStatus === 'function' ? options.onStatus : () => {};
    const audio = await captureAudio(file, report);
    const model = await loadModel(report);
    report('Konuşmalar cihazında yazıya çevriliyor. Sekmeyi açık tut…');
    const config = { task: 'transcribe', return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 };
    if (options.language && options.language !== 'auto') config.language = options.language;
    const result = await model(audio, config);
    const chunks = result && Array.isArray(result.chunks) ? result.chunks : [];
    const words = chunks.map(item => ({
      word: String(item.text || '').trim(),
      start: Number(item.timestamp && item.timestamp[0]),
      end: Number(item.timestamp && item.timestamp[1])
    })).filter(w => w.word && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start);
    if (!words.length) throw new Error('Konuşma zamanları alınamadı. Ses net olmayabilir veya dil modeli yetersiz kalmış olabilir.');
    return words;
  }

  window.SubStudioLocalAI = { transcribe };
})();
