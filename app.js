/* 焱 SubStudio 0.4 — gelişmiş yazı tasarımı */
'use strict';
const $ = (id) => document.getElementById(id);
const video = $('video');
const frame = $('previewWindow');
const subtitle = $('subtitlePreview');
const captionText = $('subtitleText');
const defaults = {font:"'DM Sans',Arial,sans-serif",size:58,stroke:4,color:'#ffffff',strokeColor:'#17131b',bottom:18,shadow:true,background:false,animation:'pop',ratio:'original',weight:800,spacing:0,align:'center',uppercase:false,animationSpeed:0.4,backgroundOpacity:62};
const presets = {
  ember:{font:"'DM Sans',Arial,sans-serif",size:58,stroke:4,color:'#ffffff',strokeColor:'#17131b',shadow:true,background:false,animation:'pop'},
  clean:{font:"'DM Sans',Arial,sans-serif",size:54,stroke:0,color:'#ffffff',strokeColor:'#000000',shadow:true,background:false,animation:'fade'},
  neon:{font:"'Space Grotesk',Arial,sans-serif",size:60,stroke:2,color:'#9afff3',strokeColor:'#00675c',shadow:true,background:false,animation:'glow'},
  cinema:{font:'Georgia,serif',size:49,stroke:2,color:'#fff2d3',strokeColor:'#242020',shadow:true,background:true,animation:'fade'},
  pop:{font:"Impact,'Arial Black',sans-serif",size:72,stroke:5,color:'#ffde48',strokeColor:'#ae2358',shadow:true,background:false,animation:'pop'},
  verse:{font:"'Amiri',Georgia,serif",size:66,stroke:1,color:'#ffe2aa',strokeColor:'#392514',shadow:true,background:true,animation:'fade'}
};
let file = null, objectURL = null, cues = [], activeCueId = null, selectedPreset='ember';
let style={...defaults};
try{const stored=JSON.parse(localStorage.getItem('substudio-caption-style')||'null');if(stored&&typeof stored==='object'){for(const key of Object.keys(defaults))if(Object.hasOwn(stored,key)&&typeof stored[key]===typeof defaults[key])style[key]=stored[key]}}catch{}
const styledText=s=>style.uppercase?String(s).toLocaleUpperCase('tr-TR'):String(s);
function persistStyle(){try{localStorage.setItem('substudio-caption-style',JSON.stringify(style))}catch{}}
let previewTimeout=null;
let renderedExportFile=null, exportStopByUser=false;
let exporting=false, recording=null, drawFrameId=null, currentAudioContext=null, audioSource=null, exportStream=null;
const safeNumber = (n,fallback=0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
const escapeHtml = (s) => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const timeString = (n) => {n=Math.max(0,Math.floor(n||0));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`};
const downloadBlob=(blob,name)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)};
let toastTimeout;
function notify(message){const toast=$('toast');toast.textContent=message;toast.hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toast.hidden=true,4600)}
function hasVideo(){return Boolean(file && video.readyState>=1)}
function updateSteps(){ $('stepVideo').textContent=file?'✓':'○';$('stepCues').textContent=cues.length?'✓':'○';$('cueCount').textContent=`${cues.length} SATIR`; }
function updateRatio(){
 const r=style.ratio;
 frame.style.aspectRatio=r==='original'&&video.videoWidth&&video.videoHeight?`${video.videoWidth}/${video.videoHeight}`:r==='original'?'9/16':r.replace(':','/');
 video.style.objectFit=r==='original'?'contain':'cover';
}
function updateSettings(){
 $('fontSelect').value=style.font;$('fontSize').value=style.size;$('fontSizeValue').textContent=style.size+' px';
 $('strokeSize').value=style.stroke;$('strokeValue').textContent=style.stroke+' px';
 $('textColor').value=style.color;$('strokeColor').value=style.strokeColor;
 $('fontWeight').value=style.weight;$('letterSpacing').value=style.spacing;
 $('letterSpacingValue').textContent=style.spacing+' px';
 $('animationSpeed').value=style.animationSpeed;$('animationSpeedValue').textContent=Number(style.animationSpeed).toFixed(2)+' sn';
 $('textAlignSelect').value=style.align;$('uppercaseToggle').checked=style.uppercase;
 $('backgroundOpacity').value=style.backgroundOpacity;$('backgroundOpacityValue').textContent='%'+style.backgroundOpacity;
 $('position').value=style.bottom;$('positionValue').textContent='Alt · %'+style.bottom;
 $('shadowToggle').checked=style.shadow;$('backgroundToggle').checked=style.background;$('ratioSelect').value=style.ratio;
 document.querySelectorAll('[data-animation]').forEach(b=>b.classList.toggle('selected',b.dataset.animation===style.animation));
 document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('selected',b.dataset.preset===selectedPreset));
 document.querySelectorAll('[data-text-color]').forEach(b=>b.classList.toggle('selected',b.dataset.textColor.toLowerCase()===style.color.toLowerCase()));
 updateRatio();showCue(true);persistStyle();
}
function applyFontToPreview(){
 const factor=(frame.clientWidth||320)/720;
 captionText.style.fontFamily=style.font;captionText.style.fontSize=(style.size*factor)+'px';
 captionText.style.fontWeight=style.weight;captionText.style.letterSpacing=(style.spacing*factor)+'px';
 captionText.style.webkitTextStroke=(style.stroke*factor)+'px '+style.strokeColor;
 captionText.style.paintOrder='stroke fill';captionText.style.color=style.color;
 captionText.style.textShadow=style.shadow?'0 3px 10px rgba(0,0,0,.9),0 0 18px rgba(0,0,0,.3)':'none';
 captionText.style.background=style.background?'rgba(0,0,0,'+(style.backgroundOpacity/100)+')':'transparent';
 captionText.style.borderRadius='6px';
 subtitle.style.bottom=style.bottom+'%';
 subtitle.style.textAlign=style.align;
 subtitle.style.justifyContent=style.align==='left'?'flex-start':style.align==='right'?'flex-end':'center';
 subtitle.style.animationDuration=style.animationSpeed+'s';
}
function getCueAt(t){return cues.find(c=>c.start<=t && t<c.end)}
function showCue(force=false){
 const cue=getCueAt(video.currentTime||0);
 applyFontToPreview();
 if(!cue){subtitle.style.display='none';activeCueId=null;return}
 if(force||activeCueId!==cue.id){
   activeCueId=cue.id;captionText.textContent=styledText(cue.text);
   subtitle.className=`subtitle-preview ${style.animation==='none'?'':style.animation}`;
   void subtitle.offsetWidth;
   subtitle.style.animation='none';void subtitle.offsetHeight;subtitle.style.animation='';
 }
 subtitle.style.display='flex';
}
function syncTimeline(){
 $('timeCurrent').textContent=timeString(video.currentTime);
 $('timeTotal').textContent=timeString(video.duration);
 $('seek').max=Math.max(.1,video.duration||1);
 $('seek').value=clamp(video.currentTime||0,0,video.duration||1);
 $('playPause').textContent=video.paused?'▶':'Ⅱ';
 showCue();
}
function renderCues(){
 updateSteps();$('designCaptions').hidden=!cues.length;const box=$('cueList');
 if(!cues.length){box.innerHTML='<div class="cue-empty">Henüz altyazı yok.<br>Cihazında AI ile oluştur veya elle ilk satırı ekle.</div>';showCue(true);return}
 box.innerHTML=cues.map((cue,i)=>`<div class="cue-card" data-cue-id="${cue.id}">
 <div class="cue-card-top"><span>● SATIR ${String(i+1).padStart(2,'0')}</span><button class="remove-cue" data-delete="${cue.id}" title="Satırı sil" aria-label="Satırı sil">× SİL</button></div>
 <textarea class="cue-text" data-text="${cue.id}" rows="2" aria-label="Altyazı metni">${escapeHtml(cue.text)}</textarea>
 <div class="cue-times"><label>BAŞLANGIÇ (sn)<input type="number" min="0" step="0.1" data-start="${cue.id}" value="${cue.start.toFixed(2)}" /></label><label>BİTİŞ (sn)<input type="number" min="0" step="0.1" data-end="${cue.id}" value="${cue.end.toFixed(2)}" /></label></div></div>`).join('');
 box.querySelectorAll('[data-cue-id]').forEach(el=>el.addEventListener('click',e=>{
   if(e.target.matches('input,textarea,button'))return;
   const cue=cues.find(c=>c.id===el.dataset.cueId);if(cue&&hasVideo()){video.currentTime=cue.start;syncTimeline()}
 }));
 box.querySelectorAll('[data-text]').forEach(el=>el.addEventListener('input',()=>{const c=cues.find(c=>c.id===el.dataset.text);if(c){c.text=el.value;showCue(true)}}));
 for(const prop of ['start','end'])box.querySelectorAll(`[data-${prop}]`).forEach(el=>el.addEventListener('change',()=>{
    const c=cues.find(c=>c.id===el.dataset[prop]);if(!c)return;
    const n=Math.max(0,safeNumber(el.value,c[prop]));
    if(prop==='start'&&n>=c.end){notify('Başlangıç, bitişten önce olmalı.');el.value=c.start.toFixed(2);return}
    if(prop==='end'&&n<=c.start){notify('Bitiş, başlangıçtan sonra olmalı.');el.value=c.end.toFixed(2);return}
    c[prop]=n;showCue(true);
 }));
 box.querySelectorAll('[data-delete]').forEach(el=>el.addEventListener('click',()=>{cues=cues.filter(c=>c.id!==el.dataset.delete);renderCues()}));
 showCue(true);
}
function addCue(start,end,text){cues.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),start:Math.max(0,start),end:Math.max(start+.1,end),text});cues.sort((a,b)=>a.start-b.start);renderCues()}
function fileUpload(f){
 if(!f)return;
 if(!f.type.startsWith('video/')&&!/\.(mp4|mov|webm|m4v)$/i.test(f.name)){notify('Lütfen geçerli bir video yükle.');return}
 if(objectURL)URL.revokeObjectURL(objectURL);
 resetExportSave();file=f;objectURL=URL.createObjectURL(f);video.src=objectURL;video.load();cues=[];activeCueId=null;renderCues();
 $('emptyState').style.display='none';$('previewBadge').style.display='block';$('aiStatus').textContent='Video hazır. API anahtarı olmadan cihazında otomatik altyazı deneyebilirsin.';
 $('videoMeta').textContent=`${f.name.length>22?f.name.slice(0,19)+'…':f.name} · ${(f.size/1024/1024).toFixed(1)} MB`;
 updateRatio();updateSteps();notify('Video yüklendi. Şimdi altyazı oluşturabilirsin.');
}
function groupWords(words){
 const result=[];let group=[];
 const flush=()=>{if(!group.length)return;result.push({id:crypto.randomUUID?crypto.randomUUID():String(Math.random()),start:group[0].start,end:Math.max(group.at(-1).end,group[0].start+.2),text:group.map(w=>w.word).join(' ').replace(/\s+([,.!?;:])/g,'$1').trim()});group=[]};
 for(const raw of words){
   const w={word:String(raw.word||'').trim(),start:safeNumber(raw.start),end:safeNumber(raw.end)};if(!w.word||w.end<=w.start)continue;
   const prospective=[...group,w],combined=prospective.map(x=>x.word).join(' ');
   if(group.length&&(w.start-group.at(-1).end>.55 || group.length>=5||combined.length>34||w.end-group[0].start>2.8))flush();
   group.push(w);
   if(/[.!?؟]$/.test(w.word)&&group.length>=2)flush();
 }
 flush();return result;
}
function guessName(){return(file?.name||'altyazi').replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]+/gu,'_').slice(0,60)||'altyazi'}
function makeSrtTime(n){let ms=Math.max(0,Math.round(n*1000));const h=Math.floor(ms/3600000);ms%=3600000;const m=Math.floor(ms/60000);ms%=60000;const s=Math.floor(ms/1000);ms%=1000;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`}
function downloadSRT(){if(!cues.length){notify('Önce altyazı ekle.');return}
 const content=cues.slice().sort((a,b)=>a.start-b.start).map((c,i)=>`${i+1}\n${makeSrtTime(c.start)} --> ${makeSrtTime(c.end)}\n${c.text}\n`).join('\n');
 downloadBlob(new Blob(['\ufeff'+content],{type:'text/plain;charset=utf-8'}),`${guessName()}.srt`);notify('SRT dosyası indirildi.')}
function parseSRT(raw){const chunks=raw.replace(/^\ufeff/,'').replace(/\r/g,'').trim().split(/\n\s*\n/);let parsed=[];
 for(const block of chunks){const lines=block.split('\n');const ix=lines.findIndex(x=>x.includes('-->'));if(ix<0)continue;
 const match=lines[ix].match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);if(!match)continue;
 const toSeconds=(h,m,s,ms)=>Number(h)*3600+Number(m)*60+Number(s)+Number(ms.padEnd(3,'0'))/1000;
 const start=toSeconds(...match.slice(1,5)),end=toSeconds(...match.slice(5,9));const text=lines.slice(ix+1).join('\n').trim();
 if(text&&end>start)parsed.push({id:crypto.randomUUID?crypto.randomUUID():String(Math.random()),start,end,text});
 }return parsed.sort((a,b)=>a.start-b.start)}
function openVideoPicker(){$('videoInput').click()}
function fillDemo(){const d=Number.isFinite(video.duration)?video.duration:16;
 cues=[{id:'demo-1',start:Math.min(.5,d*.05),end:Math.min(2.9,d*.28),text:'KENDİ HİKÂYENİ'},{id:'demo-2',start:Math.min(3,d*.29),end:Math.min(5.6,d*.58),text:'KENDİ TARZINLA ANLAT ✦'},{id:'demo-3',start:Math.min(5.8,d*.59),end:Math.min(8.2,Math.max(d,8.2)),text:'焱 SUBSTUDIO'}];
 renderCues();notify('Örnek altyazılar eklendi. Dilersen düzenleyebilirsin.')}
function switchTab(name){document.querySelectorAll('.tab').forEach(el=>{el.classList.toggle('active',el.dataset.tab===name);el.setAttribute('aria-selected',String(el.dataset.tab===name))});document.querySelectorAll('.tab-panel').forEach(el=>el.classList.toggle('active',el.dataset.panel===name))}
async function transcribe(){
 if(!file){notify('Önce bir video seç.');return}
 if(!window.SubStudioLocalAI){notify('Yerel AI modülü yüklenemedi. Sayfayı yenile.');return}
 if(!hasVideo()){notify('Video henüz hazır değil, oynatılabildiğinden emin ol.');return}
 if(Number.isFinite(video.duration)&&video.duration>90){notify('iPad denemesi için 90 saniyeden kısa bir video kullan.');return}
 if(exporting){notify('Önce video dışa aktarımını bitir.');return}
 const selectedFile=file;
 const b=$('autoCaption');
 b.disabled=true;
 b.textContent='⌛ Cihazda analiz ediliyor…';
 $('aiStatus').textContent='Ses videodan okunuyor. iPad’de bu işlem video süresi kadar sürebilir.';
 try{
  const words=await window.SubStudioLocalAI.transcribe(selectedFile,{
   videoElement:video,
   language:$('localLanguage').value,
   model:$('localModel').value,
   onStatus:message=>{if(file===selectedFile)$('aiStatus').textContent=message}
  });
  if(file!==selectedFile)throw Error('Video değişti, işlem iptal edildi. Yeni video için yeniden başlat.');
  const made=groupWords(words);
  if(!made.length)throw Error('Zamanlanmış altyazı oluşturulamadı.');
  cues=made;renderCues();switchTab('style');
  $('aiStatus').textContent='✓ '+cues.length+' altyazı cihazında oluşturuldu. Metinleri kontrol edip düzenleyebilirsin.';
  notify(cues.length+' altyazı oluşturuldu! API anahtarı kullanılmadı.');
 }catch(err){
  const message=String(err && err.message || 'Bilinmeyen hata');
  $('aiStatus').textContent='Yerel AI hatası: '+message;
  notify('Altyazı oluşturulamadı: '+message);
 }finally{
  b.disabled=false;
  b.textContent='✦ API olmadan altyazı oluştur';
 }
}
function fitCanvasSize(maxLong=1920,maxShort=1080){
 const sourceW=video.videoWidth,sourceH=video.videoHeight;
 let w=sourceW,h=sourceH;
 if(style.ratio!=='original'){
  const [a,b]=style.ratio.split(':').map(Number);const target=a/b;
  if(sourceW/sourceH>target)w=Math.round(sourceH*target);
  else h=Math.round(sourceW/target);
 }
 const scale=Math.min(1,maxLong/Math.max(w,h),maxShort/Math.min(w,h));
 return {w:Math.max(2,Math.round(w*scale/2)*2),h:Math.max(2,Math.round(h*scale/2)*2)};
}
function drawImageCover(ctx,cw,ch){const sw=video.videoWidth,sh=video.videoHeight;if(!sw||!sh)return;
 if(style.ratio==='original'){ctx.drawImage(video,0,0,cw,ch);return}
 const scale=Math.max(cw/sw,ch/sh),dw=sw*scale,dh=sh*scale;ctx.drawImage(video,(cw-dw)/2,(ch-dh)/2,dw,dh)}
function splitLines(ctx,text,maxWidth){
 const lines=[];
 for(const rawLine of String(text).split('\n')){
   const words=rawLine.split(/\s+/);let current='';
   for(const word of words){const candidate=current?current+' '+word:word;
     if(current&&ctx.measureText(candidate).width>maxWidth){lines.push(current);current=word}else current=candidate;
   }
   lines.push(current);
 }
 return lines.slice(0,6);
}
function drawExportFrame(ctx,cw,ch,t){
 ctx.clearRect(0,0,cw,ch);ctx.fillStyle='#141419';ctx.fillRect(0,0,cw,ch);drawImageCover(ctx,cw,ch);
 const cue=getCueAt(t);if(!cue)return;
 const scale=cw/720,sz=style.size*scale,sw=style.stroke*scale;
 ctx.save();ctx.font=`${style.weight} ${sz}px ${style.font}`;ctx.textAlign=style.align;ctx.textBaseline='middle';ctx.lineJoin='round';if('letterSpacing' in ctx)ctx.letterSpacing=(style.spacing*scale)+'px';
 const lines=splitLines(ctx,styledText(cue.text),cw*.84);if(!lines.length){ctx.restore();return}
 const lineHeight=sz*1.2,blockHeight=lines.length*lineHeight;
 let centerY=ch*(1-style.bottom/100)-blockHeight/2;
 const p=clamp((t-cue.start)/Math.max(.15,style.animationSpeed),0,1);
 let alpha=1,animScale=1,dy=0;
 if(style.animation==='pop'){alpha=p;animScale=.65+.35*(1-Math.pow(1-p,3))}else if(style.animation==='fade'){alpha=p}else if(style.animation==='slide'){alpha=p;dy=(1-p)*sz*.75}else if(style.animation==='glow'){alpha=.35+.65*p}
 ctx.globalAlpha=alpha;ctx.translate(style.align==='left'?cw*.08:style.align==='right'?cw*.92:cw/2,centerY+dy);ctx.scale(animScale,animScale);
 if(style.background){const boxWidth=Math.min(cw*.86,Math.max(...lines.map(l=>ctx.measureText(l).width))+sz*.42);ctx.fillStyle='rgba(0,0,0,'+(style.backgroundOpacity/100)+')';ctx.fillRect(style.align==='left'?-sz*.18:style.align==='right'?-boxWidth+sz*.18:-boxWidth/2,-sz*.12,boxWidth,blockHeight+sz*.16)}
 lines.forEach((line,i)=>{
   const y=i*lineHeight+lineHeight/2;
   if(style.shadow){ctx.shadowColor='rgba(0,0,0,.85)';ctx.shadowBlur=sz*.3;ctx.shadowOffsetY=sz*.07}
   if(sw>0){ctx.strokeStyle=style.strokeColor;ctx.lineWidth=sw*2;ctx.strokeText(line,0,y)}
   ctx.fillStyle=style.color;ctx.fillText(line,0,y);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 });ctx.restore();
}
function chooseMime(){
 const candidates=[
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  'video/mp4',
  'video/webm;codecs="vp8,opus"',
  'video/webm'
 ];
 return candidates.find(type=>{try{return MediaRecorder.isTypeSupported(type)}catch{return false}})||'';
}
function resetExportSave(){
 renderedExportFile=null;
 $('saveRenderedVideo').hidden=true;
 $('shareRenderedVideo').hidden=true;
}
async function exportVideo(){
 if(!hasVideo()){notify('Önce video seç.');return}
 if(exporting)return;
 if(typeof MediaRecorder==='undefined'||typeof HTMLCanvasElement.prototype.captureStream!=='function'){
  $('exportStatus').textContent='Bu Safari sürümü videoyu tarayıcıda kaydedemiyor. Diğer tarayıcı veya SRT indirme seçeneğini dene.';
  notify('Video kaydı bu tarayıcıda desteklenmiyor.');
  return;
 }
 if(!Number.isFinite(video.duration)||video.duration<=0){notify('Video süresi okunamıyor; MP4 dosyasını kontrol et.');return}
 if(video.readyState<2){notify('Önce videoyu bir kez oynat, ardından dışa aktar.');return}
 resetExportSave();
 exportStopByUser=false;
 exporting=true;
 let audioDest=null, ctx=null, exportTimer=null, ended=null, wasMuted=video.muted, recorderError=null;
 let chunks=[], resumedAudio=Promise.resolve();
 $('startExport').hidden=true;
 $('stopExport').hidden=false;
 $('exportStatus').textContent='Kayıt başlatılıyor… iPad ekranını kapatma.';
 try{
  const dims=fitCanvasSize();
  // iPad Safari: reduce memory + encoder overload for large vertical videos.
  const touchMac=/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints>1;
  const mobileSafari=/iPad|iPhone|iPod/.test(navigator.userAgent)||touchMac;
  const shrink=mobileSafari?Math.min(1,1280/Math.max(dims.w,dims.h)):1;
  const width=Math.max(2,Math.floor(dims.w*shrink/2)*2);
  const height=Math.max(2,Math.floor(dims.h*shrink/2)*2);
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw Error('Canvas açılamadı.');
  video.pause();
  video.currentTime=0;
  video.muted=false;
  try { drawExportFrame(ctx,width,height,0) }
  catch { ctx.fillStyle='#121216';ctx.fillRect(0,0,width,height) }
  exportStream=canvas.captureStream(25);
  if(!exportStream?.getVideoTracks()?.length)throw Error('Canvas video kanalı oluşturulamadı.');

  const AC=window.AudioContext||window.webkitAudioContext;
  if(AC){
   if(!currentAudioContext){
    const graph=window.SubStudioLocalAI?.getAudioGraph?.(video);
    if(graph){currentAudioContext=graph.ctx;audioSource=graph.source}
    else{
     currentAudioContext=new AC();
     audioSource=currentAudioContext.createMediaElementSource(video);
     audioSource.connect(currentAudioContext.destination);
    }
   }
   audioDest=currentAudioContext.createMediaStreamDestination();
   audioSource.connect(audioDest);
   for(const track of audioDest.stream.getAudioTracks())exportStream.addTrack(track);
   // Request audio unlock during the user's tap; do not await yet.
   resumedAudio=currentAudioContext.resume();
  }

  const mime=chooseMime();
  const recorderOptions=mime?{mimeType:mime,videoBitsPerSecond:2500000}: {videoBitsPerSecond:2500000};
  recording=new MediaRecorder(exportStream,recorderOptions);
  const outputType=recording.mimeType||mime||'video/mp4';
  const completion=new Promise((resolve,reject)=>{
   recording.addEventListener('dataavailable',e=>{if(e.data?.size)chunks.push(e.data)});
   recording.addEventListener('stop',()=>recorderError?reject(recorderError):resolve(),{once:true});
   recording.addEventListener('error',e=>{
    recorderError=e.error||new Error('Safari kayıt işlemini durdurdu.');
    reject(recorderError);
   },{once:true});
  });
  let lastShown=-1;
  const tick=()=>{
   if(!exporting)return;
   try{
    if(video.readyState>=2)drawExportFrame(ctx,width,height,video.currentTime||0);
    const n=Math.floor(video.currentTime||0);
    if(n!==lastShown){
     lastShown=n;
     $('exportStatus').textContent='Video kaydediliyor: '+timeString(n)+' / '+timeString(video.duration)+' — işlem bitince Kaydet düğmesi çıkacak.';
    }
   }catch(err){
    recorderError=err;
    if(recording?.state==='recording')recording.stop();
    return;
   }
   if(video.ended&&recording?.state==='recording'){recording.stop();return}
   drawFrameId=requestAnimationFrame(tick);
  };
  ended=()=>{if(recording?.state==='recording')recording.stop()};
  video.addEventListener('ended',ended,{once:true});
  recording.start(1000);
  tick();
  // Crucial: play() executes in the tap's user activation (no awaited calls above).
  const playPromise=video.play();
  await Promise.all([resumedAudio,playPromise]);
  exportTimer=setTimeout(()=>{
   if(recording?.state==='recording'){
    recorderError=Error('Kayıt zaman aşımı. Daha kısa bir video dene.');
    recording.stop();
   }
  },Math.min(480000,(video.duration+35)*1000));

  await completion;
  const bytes=chunks.reduce((sum,item)=>sum+item.size,0);
  if(bytes<1024)throw Error('Safari video verisi üretmedi. MP4/H.264 ile yeniden dene.');
  const type=outputType.includes('webm')?'video/webm':'video/mp4';
  const ext=type==='video/webm'?'webm':'mp4';
  const blob=new Blob(chunks,{type});
  renderedExportFile=new File([blob],guessName()+'_SubStudio.'+ext,{type});
  $('saveRenderedVideo').hidden=false;
  $('shareRenderedVideo').hidden=typeof navigator.share!=='function';
  $('exportStatus').textContent='✓ '+(exportStopByUser?'Kısmi kayıt':'Kayıt')+' hazır ('+(bytes/1048576).toFixed(1)+' MB). iPad’de Dosyalara Kaydet / Paylaş düğmesine dokun; dosya otomatik kaydedilmiş sayılmaz.';
  notify('Video hazır! İndir veya Dosyalara Kaydet düğmesine bas.');
 }catch(err){
  const message=String(err?.message||err||'Bilinmeyen hata');
  $('exportStatus').textContent='Video kaydedilemedi: '+message;
  notify('Video dışa aktarılamadı: '+message);
 }finally{
  clearTimeout(exportTimer);
  exporting=false;
  cancelAnimationFrame(drawFrameId);
  if(ended)video.removeEventListener('ended',ended);
  if(audioSource&&audioDest)try{audioSource.disconnect(audioDest)}catch{}
  if(exportStream)exportStream.getTracks().forEach(track=>track.stop());
  exportStream=null;
  recording=null;
  video.pause();
  video.muted=wasMuted;
  $('startExport').hidden=false;
  $('stopExport').hidden=true;
  syncTimeline();
 }
}
function showExport(){if(!hasVideo()){notify('Önce video yükle.');return}
 $('exportStatus').textContent='';$('exportSummary').textContent=`${file.name} • ${timeString(video.duration)} • ${cues.length} altyazı • ${style.ratio==='original'?'Orijinal':style.ratio} oran`;
 $('exportDialog').showModal();}
function wireEvents(){
 for(const id of ['changeVideo','emptyUpload'])$(id).addEventListener('click',openVideoPicker);
 $('videoInput').addEventListener('change',e=>{fileUpload(e.target.files?.[0]);e.target.value=''});
 $('playPause').addEventListener('click',()=>{if(!hasVideo()){openVideoPicker();return}video.paused?video.play().catch(e=>notify(e.message)):video.pause()});
 $('seek').addEventListener('input',e=>{if(hasVideo()){video.currentTime=Number(e.target.value);syncTimeline()}});
 $('muteButton').addEventListener('click',()=>{video.muted=!video.muted;$('muteButton').textContent=video.muted?'♪̸':'♫'});
 video.addEventListener('loadedmetadata',()=>{updateRatio();syncTimeline()});video.addEventListener('timeupdate',syncTimeline);video.addEventListener('play',syncTimeline);video.addEventListener('pause',syncTimeline);video.addEventListener('ended',syncTimeline);
 video.addEventListener('error',()=>{if(file)notify('Video bu tarayıcıda açılamıyor. MP4/H.264 dene.')});
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
 document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{selectedPreset=b.dataset.preset;style={...style,...presets[selectedPreset]};updateSettings()}));
 document.querySelectorAll('[data-animation]').forEach(b=>b.addEventListener('click',()=>{style.animation=b.dataset.animation;selectedPreset='';updateSettings()}));
 const attrs=[['fontSelect','font'],['fontSize','size'],['strokeSize','stroke'],['textColor','color'],['strokeColor','strokeColor'],['position','bottom'],['ratioSelect','ratio'],['backgroundToggle','background'],['shadowToggle','shadow'],['fontWeight','weight'],['letterSpacing','spacing'],['animationSpeed','animationSpeed'],['textAlignSelect','align'],['uppercaseToggle','uppercase'],['backgroundOpacity','backgroundOpacity']];
 attrs.forEach(([id,key])=>$(id).addEventListener('input',e=>{
  style[key]=e.target.type==='checkbox'?e.target.checked:e.target.type==='range'||id==='fontWeight'?Number(e.target.value):e.target.value;
  selectedPreset='';updateSettings()
 }));
 document.querySelectorAll('[data-text-color]').forEach(b=>b.addEventListener('click',()=>{style.color=b.dataset.textColor;selectedPreset='';updateSettings()}));
 $('resetCaptionStyle').addEventListener('click',()=>{style={...defaults,ratio:style.ratio};selectedPreset='ember';updateSettings();notify('Yazı tasarımı sıfırlandı.')});
 $('previewCaptionStyle').addEventListener('click',()=>{
  clearTimeout(previewTimeout);
  if(cues.length&&hasVideo()){
   video.pause();video.currentTime=cues[0].start+Math.min(.1,(cues[0].end-cues[0].start)/2);showCue(true);
  }else{
   captionText.textContent=styledText('ÖRNEK ALTYAZI · 焱');
   applyFontToPreview();
   subtitle.className='subtitle-preview '+(style.animation==='none'?'':style.animation);
   subtitle.style.display='flex';previewTimeout=setTimeout(()=>showCue(true),2600);
  }
 });
 $('designCaptions').addEventListener('click',()=>{switchTab('style');if(cues.length&&hasVideo()){video.pause();video.currentTime=cues[0].start+.05;showCue(true)}});
 $('autoCaption').addEventListener('click',transcribe);
 $('addCue').addEventListener('click',()=>{const start=video.currentTime||0;addCue(start,start+2,'Yeni altyazı');setTimeout(()=>{$('cueList').lastElementChild?.scrollIntoView({block:'nearest'})},50)});
 $('sampleCaptions').addEventListener('click',()=>{fillDemo();switchTab('captions')});
 $('downloadSRT').addEventListener('click',downloadSRT);$('quickSRT').addEventListener('click',downloadSRT);
 $('uploadSRTButton').addEventListener('click',()=>$('srtInput').click());
 $('srtInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;const c=parseSRT(await f.text());if(c.length){cues=c;renderCues();switchTab('captions');notify(`${c.length} SRT satırı içe aktarıldı.`)}else notify('Dosyadan geçerli SRT satırı okunamadı.');e.target.value=''});
 $('newProject').addEventListener('click',()=>{if(!confirm('Yeni proje başlatılsın mı? Geçerli altyazılar silinir.'))return;video.pause();video.removeAttribute('src');video.load();if(objectURL)URL.revokeObjectURL(objectURL);file=null;objectURL=null;resetExportSave();cues=[];activeCueId=null;renderCues();$('emptyState').style.display='flex';$('previewBadge').style.display='none';$('videoMeta').textContent='Henüz video yok';$('aiStatus').textContent='Video seçtikten sonra kullanabilirsin.';updateRatio();syncTimeline()});
 $('exportVideoTop').addEventListener('click',showExport);
 $('startExport').addEventListener('click',exportVideo);
 $('stopExport').addEventListener('click',()=>{if(recording?.state==='recording'){exportStopByUser=true;recording.stop()}});
 $('saveRenderedVideo').addEventListener('click',()=>{
  if(!renderedExportFile){notify('Önce videoyu dışa aktar.');return}
  downloadBlob(renderedExportFile,renderedExportFile.name);
  $('exportStatus').textContent='İndirme başlatıldı. Safari Dosyalar / İndirilenler bölümünü kontrol et. Çalışmazsa Paylaş > Dosyalara Kaydet seç.';
 });
 $('shareRenderedVideo').addEventListener('click',()=>{
  if(!renderedExportFile){notify('Önce videoyu dışa aktar.');return}
  if(!navigator.share){notify('Paylaşım desteklenmiyor; Videoyu indir düğmesini kullan.');return}
  const data={files:[renderedExportFile],title:'焱 SubStudio video'};
  if(typeof navigator.canShare==='function'&&!navigator.canShare({files:data.files})){
   notify('Safari bu dosyayı paylaşamıyor. Videoyu indir düğmesini kullan.');return;
  }
  navigator.share(data).catch(err=>{if(err?.name!=='AbortError')notify('Paylaşma hatası: '+String(err?.message||err))});
 });
 window.addEventListener('resize',()=>applyFontToPreview());
 updateSettings();renderCues();syncTimeline();
}
wireEvents();
