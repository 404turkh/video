/**
 * 焱 SubStudio — Cloudflare Worker transcription API
 * Configure OPENAI_API_KEY as a secret and ALLOWED_ORIGIN as the exact frontend origin.
 * IMPORTANT: CORS is not authentication. Add rate limits and abuse protection before public use.
 */
const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {
  status,
  headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}
});
export default {
  async fetch(request, env) {
    const origin=request.headers.get('Origin')||'';
    const allowed=(env.ALLOWED_ORIGIN||'').split(',').map(x=>x.trim()).filter(Boolean);
    const cors={
      'Access-Control-Allow-Origin':allowed.includes(origin)?origin:'null',
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type',
      'Vary':'Origin'
    };
    if(!origin||!allowed.includes(origin)) return json({error:'Bu site için erişim izni yok.'},403,cors);
    const url=new URL(request.url);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(url.pathname!=='/transcribe'||request.method!=='POST') return json({error:'Bulunamadı.'},404,cors);
    if(!env.OPENAI_API_KEY) return json({error:'Sunucuda OPENAI_API_KEY ayarlı değil.'},500,cors);
    const length=Number(request.headers.get('Content-Length')||0);
    if(length>25*1024*1024+8192) return json({error:'Dosya 25 MB sınırını aşıyor.'},413,cors);
    try {
      const form=await request.formData();
      const file=form.get('file');
      if(!file||typeof file.arrayBuffer!=='function'||typeof file.name!=='string') return json({error:'Video dosyası eksik.'},400,cors);
      if(file.size>25*1024*1024) return json({error:'Dosya en fazla 25 MB olabilir.'},413,cors);
      if(file.size===0) return json({error:'Dosya boş.'},400,cors);
      if(!/\.(mp4|webm|mp3|m4a|wav|mpeg|mpga)$/i.test(file.name.toLowerCase())) return json({error:'MP4 veya WebM video kullan.'},415,cors);
      const payload=new FormData();
      payload.append('file',file,file.name);
      payload.append('model','whisper-1');
      payload.append('response_format','verbose_json');
      payload.append('timestamp_granularities[]','word');
      const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{
        method:'POST',
        headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},
        body:payload
      });
      const body=await response.json().catch(()=>({error:{message:'Servisten yanıt okunamadı.'}}));
      if(!response.ok) return json({error:body.error?.message||'Konuşma tanıma başarısız.'},response.status,cors);
      const words=Array.isArray(body.words)?body.words.filter(w=>typeof w.word==='string'&&Number.isFinite(w.start)&&Number.isFinite(w.end)).map(w=>({word:w.word,start:w.start,end:w.end})):[];
      return json({words,language:body.language||null,transcript:body.text||''},200,cors);
    }catch(err){
      return json({error:'Sunucu hatası: '+String(err.message||'Bilinmiyor')},500,cors);
    }
  }
};
