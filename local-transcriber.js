/* 焱 SubStudio 0.6.1 — iPad Safari düşük bellek güvenlik modu.
   Dosya sunucuya yüklenmez; AI modeli ilk kullanımda CDN + Hugging Face'ten indirilir. */
(() => {
  'use strict';

  const MODELS = { accurate: 'Xenova/whisper-base', fast: 'Xenova/whisper-tiny' };
  const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
  const MAX_SECONDS = 90;
  const MAX_FILE_BYTES = 120 * 1024 * 1024;
  const IPAD_MAX_SECONDS = 40;
  const IPAD_MAX_FILE_BYTES = 60 * 1024 * 1024;
  function isAppleTouch() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
      ((/Macintosh/.test(ua) || navigator.platform === 'MacIntel') && navigator.maxTouchPoints > 1);
  }
  function limits(){
    return isAppleTouch() ? {seconds:IPAD_MAX_SECONDS,bytes:IPAD_MAX_FILE_BYTES,mobile:true}
                          : {seconds:MAX_SECONDS,bytes:MAX_FILE_BYTES,mobile:false};
  }
  function checkRequest(file,video,model){
    const bound=limits();
    if(bound.mobile && model==='accurate')throw new Error(
      'Whisper Base iPad Safari belleğini taşırabiliyor. Cihazın kapanmaması için Base kapalı; Hızlı / iPad Güvenli modunu kullan.'
    );
    if(!file||file.size>bound.bytes)throw new Error(
      'Bu cihazdaki güvenli AI denemesinde en fazla '+Math.round(bound.bytes/1048576)+' MB video kullanılabilir.'
    );
    if(video?.duration&&Number.isFinite(video.duration)&&video.duration>bound.seconds)
      throw new Error('Bu cihazda AI için en fazla '+bound.seconds+' saniyelik video kullan. Daha uzun video için başka bir işleme yöntemi gerekir.');
    return bound;
  }
  const modelCache = new Map();
  let graph = null;

  function getAudioGraph(element) {
    if (graph && graph.element === element) return graph;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error('Safari Web Audio özelliğini desteklemiyor.');
    const ctx = new AudioCtx();
    let source;
    try {
      source = ctx.createMediaElementSource(element);
      source.connect(ctx.destination);
    } catch (error) {
      ctx.close().catch(() => {});
      throw new Error('Video sesine erişilemedi: ' + String(error?.message || error));
    }
    graph = { element, ctx, source };
    return graph;
  }

  function downsample(chunks, samples, sampleRate) {
    const input = new Float32Array(samples);
    let offset = 0;
    for (const chunk of chunks) {
      input.set(chunk, offset);
      offset += chunk.length;
    }
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('Ses örnekleme hızı bilinmiyor.');
    const ratio = sampleRate / 16000;
    const length = Math.max(1, Math.floor(samples / ratio));
    const result = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const sourcePosition = i * ratio;
      const left = Math.min(Math.floor(sourcePosition), samples - 1);
      const right = Math.min(left + 1, samples - 1);
      const alpha = sourcePosition - left;
      result[i] = input[left] * (1 - alpha) + input[right] * alpha;
    }
    return result;
  }

  // The *visible main video* is essential: Safari may pause hidden/off-screen media.
  function captureAudio(file, video, report) {
    const guard = limits();
    if (!file || file.size > guard.bytes) {
      return Promise.reject(new Error('Güvenli AI sınırı: en fazla '+Math.round(guard.bytes/1048576)+' MB video kullan.'));
    }
    if (!video || video.readyState < 1) {
      return Promise.reject(new Error('Video henüz hazır değil. Bir kez oynatıp tekrar dene.'));
    }
    if (Number.isFinite(video.duration) && video.duration > guard.seconds) {
      return Promise.reject(new Error('Bu cihazda AI '+guard.seconds+' saniyeyle sınırlı. Daha kısa video yükle.'));
    }
    let audio;
    try {
      audio = getAudioGraph(video);
    } catch (error) {
      return Promise.reject(error);
    }
    const { ctx, source } = audio;
    let processor;
    try {
      processor = ctx.createScriptProcessor(4096, 2, 1);
      source.connect(processor);
      processor.connect(ctx.destination);
    } catch (error) {
      processor?.disconnect();
      return Promise.reject(new Error('Safari ses yakalamayı başlatamadı: ' + String(error?.message || error)));
    }

    const oldTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const wasPlaying = !video.paused;
    const oldMuted = video.muted;
    let settled = false, timeout;
    const chunks = [];
    let sampleCount = 0, absSum = 0, lastReported = -1;
    const onEnded = () => finish();
    const onError = () => finish(new Error('Video oynatılamadı. MP4/H.264 ve AAC ses biçimini dene.'));
    const onAbort = () => finish(new Error('Video değiştirildi; işlem iptal edildi.'));
    let resolveCapture, rejectCapture;
    const result = new Promise((resolve, reject) => {
      resolveCapture = resolve;
      rejectCapture = reject;
    });

    const cleanup = () => {
      clearTimeout(timeout);
      processor.onaudioprocess = null;
      try { source.disconnect(processor); } catch (_) {}
      try { processor.disconnect(); } catch (_) {}
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      video.removeEventListener('abort', onAbort);
      video.pause();
      try { if (video.readyState >= 1) video.currentTime = oldTime; } catch (_) {}
      video.muted = oldMuted;
      // Keep the graph alive (a MediaElementAudioSourceNode cannot be recreated for the same video).
      if (wasPlaying && video.isConnected) {
        video.play().catch(() => {});
      }
    };

    function finish(error) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) { rejectCapture(error); return; }
      if (sampleCount < 16000 || absSum / sampleCount < 0.00003) {
        rejectCapture(new Error('Video sesi yakalanamadı veya çok sessiz. Sesli bir MP4 yükle ve yeniden dene.'));
        return;
      }
      try { resolveCapture(downsample(chunks, sampleCount, ctx.sampleRate)); }
      catch (err) { rejectCapture(err); }
    }

    processor.onaudioprocess = event => {
      if (settled) return;
      const buffer = event.inputBuffer;
      const left = buffer.getChannelData(0);
      const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
      const out = new Float32Array(left.length);
      for (let i = 0; i < left.length; i++) {
        const v = right ? (left[i] + right[i]) * .5 : left[i];
        out[i] = v;
        absSum += Math.abs(v);
      }
      chunks.push(out);
      sampleCount += out.length;
      event.outputBuffer.getChannelData(0).fill(0); // processor remains active without double audio
      if (sampleCount / ctx.sampleRate > guard.seconds + 1) finish();
    };

    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    video.addEventListener('abort', onAbort);
    video.addEventListener('timeupdate', function progress() {
      if (settled) {
        video.removeEventListener('timeupdate', progress);
        return;
      }
      const seconds = Math.floor(video.currentTime);
      if (seconds !== lastReported) {
        lastReported = seconds;
        report('1/3 · Video sesi okunuyor: ' + seconds + ' sn');
      }
      if (seconds > guard.seconds) finish(new Error(guard.seconds+' saniyelik güvenli süre sınırı aşıldı.'));
    });

    report('1/3 · Video sesi ekrandaki oynatıcıdan okunuyor…');
    try {
      video.pause();
      video.currentTime = 0;
      video.muted = false;
      // Both are called within the original user tap, before awaiting anything.
      const resumePromise = ctx.resume();
      const playPromise = video.play();
      Promise.all([resumePromise, playPromise]).catch(err => finish(
        new Error('Safari videoyu/ses sistemini başlatamadı: ' + String(err?.message || err))
      ));
      timeout = setTimeout(() => finish(new Error(
        'Ses okuma zaman aşımı. Safari ses yakalamayı durdurmuş olabilir; 10–20 saniyelik MP4 dene.'
      )), 108000);
    } catch (error) {
      finish(error);
    }
    return result;
  }

  async function loadModel(report, modelChoice = 'accurate') {
    const selected = Object.prototype.hasOwnProperty.call(MODELS, modelChoice) ? modelChoice : (isAppleTouch()?'fast':'accurate');
    if (isAppleTouch() && selected==='accurate') {
      throw new Error('iPad üzerinde Whisper Base engellendi; sayfanın çökmesini önlemek için Whisper Tiny seç.');
    }
    if (!modelCache.has(selected)) {
      const pending = (async () => {
        report('2/3 · ' + (selected === 'accurate' ? 'Daha doğru Whisper Base' : 'Hızlı Whisper Tiny') + ' modeli indiriliyor. İlk kullanımda internet ve boş bellek gerekir…');
        let lib;
        try { lib = await import(TRANSFORMERS_URL); }
        catch (err) {
          throw new Error('AI kütüphanesi indirilemedi: ' + String(err?.message || err));
        }
        const { pipeline, env } = lib;
        env.allowLocalModels = false;
        if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;
        try {
          return await pipeline('automatic-speech-recognition', MODELS[selected], {
            device: 'wasm', dtype: 'q8',
            progress_callback: evt => {
              if (evt?.status === 'progress' && Number.isFinite(evt.progress)) {
                report('2/3 · Model dosyası indiriliyor: %' + Math.round(evt.progress));
              }
            }
          });
        } catch (err) {
          throw new Error('Model açılamadı. iPad belleği yetersizse Ayarlar > Hızlı / düşük bellek modelini dene. Ayrıntı: ' + String(err?.message || err));
        }
      })();
      modelCache.set(selected, pending);
      pending.catch(() => { if (modelCache.get(selected) === pending) modelCache.delete(selected); });
    }
    return modelCache.get(selected);
  }

  async function disposeModels(){
    const loaded=[...modelCache.values()];
    modelCache.clear();
    for(const pending of loaded){
      try{
        const pipe=await pending;
        if(pipe&&typeof pipe.dispose==='function')await pipe.dispose();
      }catch(_){}
    }
  }
  function normalizeResult(response) {
    const chunks = Array.isArray(response?.chunks) ? response.chunks : [];
    return chunks.map(chunk => ({
      word: String(chunk.text || '').trim(),
      start: Number(chunk.timestamp?.[0]),
      end: Number(chunk.timestamp?.[1])
    })).filter(word => word.word && Number.isFinite(word.start) &&
      Number.isFinite(word.end) && word.end > word.start);
  }

  async function transcribe(file, options = {}) {
    const report = typeof options.onStatus === 'function' ? options.onStatus : () => {};
    const model = options.model || (isAppleTouch()?'fast':'accurate');
    const limit = checkRequest(file,options.videoElement,model);
    if(limit.mobile) report('iPad güvenli mod: Tiny / '+limit.seconds+' saniye sınırı. Model Safari belleğinde çalışacağı için sonuç garanti değildir.');
    const audio = await captureAudio(file, options.videoElement, report);
    const pipe = await loadModel(report, model);
    try {
      report('3/3 · Konuşma cihazında tanınıyor. Safari sekmesini açık tut…');
      const language = options.language && options.language !== 'auto' ? options.language : 'turkish';
      const config = { task: 'transcribe', language,
        return_timestamps: 'word', chunk_length_s: limit.mobile?15:30, stride_length_s: limit.mobile?2:5 };
      let response;
      try {
        response = await pipe(audio, config);
      } catch (err) {
        throw new Error('Konuşma tanıma başarısız: ' + String(err?.message || err));
      }
      let words = normalizeResult(response);
      if (!words.length) {
        report('3/3 · Kelime zamanları boş; cümle zamanları deneniyor…');
        const fallback = { ...config, return_timestamps: true };
        try { words = normalizeResult(await pipe(audio, fallback)); }
        catch (err) { throw new Error('Altyazı zamanları alınamadı: ' + String(err?.message || err)); }
      }
      if (!words.length) {
        throw new Error('Ses işlendi ama zamanlı konuşma bulunamadı. Ses net olmayabilir.');
      }
      return words;
    } finally {
      if(limit.mobile){
        report('AI belleği temizleniyor…');
        await disposeModels();
      }
    }
  }

  window.SubStudioLocalAI = { getAudioGraph, transcribe, isAppleTouch, limits, checkRequest, disposeModels };
})();
