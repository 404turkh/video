/* 焱 SubStudio v0.6 — separate non-blocking video export engine.
   Browser recording is best-effort, especially on iPad Safari. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
 let app=null,recording=null,exporting=false,cancelled=false,rendered=null;
 let stopResolver=null,abortResolver=null,mediaStream=null,context=null,source=null,destination=null;
 let timer=null,watchdog=null,frameId=null,cancelFrameId=null,frameCount=0,mediaLastTime=-1,lastFrameAt=0;
 const config={
  smooth:{label:'720p',long:1280,short:720,fps:24,bitrate:4200000},
  high:{label:'1080p',long:1920,short:1080,fps:30,bitrate:9000000},
  source:{label:'Kaynak',long:3840,short:2160,fps:30,bitrate:16000000}
 };
 function setStatus(s){$('exportStatus').textContent=s}
 function setProgress(n){$('exportProgress').style.width=Math.round(clamp(n,0,1)*100)+'%'}
 function uiBusy(b){
  $('startExport').disabled=b;
  $('cancelExport').hidden=!b;
  $('exportQuality').disabled=b;
 }
 function resetOutput(){
  rendered=null;$('downloadExport').hidden=true;$('shareExport').hidden=true;
 }
 function fail(message){
  setStatus('Video kaydı yapılamadı: '+message+' Proje ve altyazılar duruyor; SRT veya proje yedeğini indirebilirsin.');
 }
 function currentQuality(){return config[$('exportQuality').value]||config.smooth}
 function dimensions(vid,aspect,q){
  const vw=vid.videoWidth,vh=vid.videoHeight;
  if(!vw||!vh)throw Error('Videonun görüntü boyutu okunamadı.');
  let w=vw,h=vh;
  if(aspect!=='original'){
   const parts=aspect.split(':').map(Number);
   const target=parts[0]/parts[1];
   if(w/h>target)w=Math.round(h*target);else h=Math.round(w/target);
  }
  const maxLong=Math.max(w,h),maxShort=Math.min(w,h);
  const scale=Math.min(1,q.long/maxLong,q.short/maxShort);
  return {width:Math.max(2,Math.round(w*scale/2)*2),height:Math.max(2,Math.round(h*scale/2)*2)};
 }
 function drawCover(ctx,video,w,h,aspect){
  if(aspect==='original'){ctx.drawImage(video,0,0,w,h);return}
  const ratio=Math.max(w/video.videoWidth,h/video.videoHeight);
  const dw=video.videoWidth*ratio,dh=video.videoHeight*ratio;
  ctx.drawImage(video,(w-dw)/2,(h-dh)/2,dw,dh);
 }
 function animationState(kind,elapsed,duration,sz){
  const p=clamp(elapsed/Math.max(.15,duration||.4),0,1);
  if(kind==='pop')return {alpha:p,scale:.72+.28*(1-Math.pow(1-p,3)),y:0};
  if(kind==='fade')return {alpha:p,scale:1,y:0};
  if(kind==='rise')return {alpha:p,scale:1,y:(1-p)*sz*.65};
  if(kind==='glow')return {alpha:.35+.65*p,scale:1,y:0};
  return {alpha:1,scale:1,y:0};
 }
 function wrapLines(ctx,text,maxWidth,maxLines){
  const lines=[];
  for(const part of String(text||'').split('\n')){
   let working='';
   for(const word of part.split(/\s+/).filter(Boolean)){
    const candidate=working?working+' '+word:word;
    if(working&&ctx.measureText(candidate).width>maxWidth){lines.push(working);working=word}
    else working=candidate;
   }
   lines.push(working);
  }
  return lines.slice(0,maxLines||6);
 }
 function drawText(ctx,w,h,text,settings,time,start,isCaption){
  const unit=w/720,sz=(settings.size||54)*unit;
  const font=String(settings.font||'DM Sans').replace(/["]/g,'');
  const weight=settings.weight||800,outline=Number(settings.outline)||0;
  const x=isCaption?50:settings.x,y=isCaption?100-settings.bottom:settings.y;
  const anim=animationState(settings.animation,time-start,settings.animationSpeed||.45,sz);
  ctx.save();
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
  ctx.font=weight+' '+sz+'px "'+font+'",sans-serif';
  const textValue=isCaption&&settings.uppercase?String(text).toLocaleUpperCase('tr-TR'):String(text);
  const maxWidth=w*.82/Math.max(1,settings.stretch/100);
  const lines=wrapLines(ctx,textValue,maxWidth,7);
  if(!lines.length){ctx.restore();return}
  const lh=sz*1.22,block=lines.length*lh;
  ctx.translate(w*x/100,h*y/100+anim.y);
  ctx.scale(anim.scale,anim.scale);
  ctx.scale(settings.stretch/100,1);
  ctx.transform(1,0,Math.tan((settings.skew||0)*Math.PI/180),1,0,0);
  ctx.rotate((settings.rotate||0)*Math.PI/180);
  ctx.globalAlpha=anim.alpha;
  if(settings.background){
   const maxTextWidth=Math.max(1,...lines.map(line=>ctx.measureText(line).width));
   const boxWidth=Math.min(maxWidth+sz*.2,maxTextWidth+sz*.38);
   ctx.fillStyle='rgba(0,0,0,'+(isCaption?(settings.bgAlpha||62)/100:.62)+')';
   ctx.fillRect(-boxWidth/2,-block/2-sz*.15,boxWidth,block+sz*.28);
  }
  for(let i=0;i<lines.length;i++){
   const yy=-block/2+lh*(i+.5);
   if(settings.shadow!==false){ctx.shadowColor='rgba(0,0,0,.82)';ctx.shadowBlur=sz*.22;ctx.shadowOffsetY=sz*.05}
   if(outline){
    ctx.strokeStyle=isCaption?settings.outlineColor||'#17131b':'#17131b';
    ctx.lineWidth=outline*unit*2;
    ctx.strokeText(lines[i],0,yy,Math.max(2,maxWidth));
   }
   ctx.fillStyle=settings.color||'#ffffff';
   ctx.fillText(lines[i],0,yy,Math.max(2,maxWidth));
   ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  }
  ctx.restore();
 }
 function drawFrame(ctx,w,h,t){
  const state=app.getState(),video=app.getVideo();
  ctx.fillStyle='#101014';ctx.fillRect(0,0,w,h);
  if(video.readyState>=2)drawCover(ctx,video,w,h,state.aspect);
  const cue=app.getCueAt(t);
  if(cue)drawText(ctx,w,h,cue.text,state.captionStyle,t,cue.start,true);
  for(const item of app.activeLayers(t)){
   drawText(ctx,w,h,item.text,{...item,weight:800,animationSpeed:.45,shadow:true},t,item.start,false);
  }
 }
 function chooseRecorder(stream,q){
  const types=[
   'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
   'video/mp4',
   'video/webm;codecs="vp8,opus"',
   'video/webm'
  ];
  for(const mime of types){
   try{
    if(typeof MediaRecorder.isTypeSupported==='function'&&!MediaRecorder.isTypeSupported(mime))continue;
    return new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:q.bitrate,audioBitsPerSecond:192000});
   }catch(_){}
  }
  return new MediaRecorder(stream,{videoBitsPerSecond:q.bitrate,audioBitsPerSecond:192000});
 }
 function cleanup(video){
  clearInterval(watchdog);clearTimeout(timer);
  if(frameId!==null&&video?.cancelVideoFrameCallback)try{video.cancelVideoFrameCallback(frameId)}catch(_){}
  if(cancelFrameId!==null)cancelAnimationFrame(cancelFrameId);
  frameId=null;cancelFrameId=null;
  if(mediaStream){for(const track of mediaStream.getTracks())try{track.stop()}catch(_){}}
  if(source&&destination)try{source.disconnect(destination)}catch(_){}
  mediaStream=null;destination=null;recording=null;
  if(video){video.pause();app?.onExportEnd()}
  exporting=false;abortResolver=null;uiBusy(false);
 }
 async function begin(){
  if(!app||exporting)return;
  const video=app.getVideo(),state=app.getState();
  if(!app.hasVideo()){fail('Önce Proje bölümünden video yükle.');return}
  if(typeof MediaRecorder==='undefined'||typeof HTMLCanvasElement.prototype.captureStream!=='function'){
   fail('Safari bu cihazda Canvas/MediaRecorder kaydını desteklemiyor. SRT veya proje yedeği indirebilirsin.');
   return;
  }
  if(!video.videoWidth||!Number.isFinite(video.duration)||video.duration<=0){fail('Video henüz hazır değil. Önce oynat, sonra yeniden dene.');return}
  if(video.duration>180){fail('iPad için bu deneysel sürüm en fazla 3 dakikalık video kaydeder.');return}
  resetOutput();setProgress(0);cancelled=false;exporting=true;uiBusy(true);frameCount=0;mediaLastTime=-1;
  const cancelledPromise=new Promise((_,reject)=>{abortResolver=reject});
  const originalMuted=video.muted;
  let resumePromise=Promise.resolve(),playPromise=Promise.resolve(),mime='',endListener=null,recordingError=null;
  const q=currentQuality();
  try{
   const dims=dimensions(video,state.aspect,q),w=dims.width,h=dims.height;
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext('2d',{alpha:false});
   if(!ctx)throw Error('Video çizim yüzeyi oluşturulamadı.');
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   video.pause();video.currentTime=0;video.muted=false;
   drawFrame(ctx,w,h,0);
   mediaStream=canvas.captureStream(q.fps);
   if(!mediaStream||!mediaStream.getVideoTracks().length)throw Error('Canvas video akışı oluşturulamadı.');
   const AC=window.AudioContext||window.webkitAudioContext;
   if(AC){
    let graph=null;
    try{graph=window.SubStudioLocalAI?.getAudioGraph?.(video)}catch(_){}
    if(graph){context=graph.ctx;source=graph.source}
    else{
     context=new AC();
     source=context.createMediaElementSource(video);
     source.connect(context.destination);
    }
    destination=context.createMediaStreamDestination();
    source.connect(destination);
    for(const track of destination.stream.getAudioTracks())mediaStream.addTrack(track);
    resumePromise=context.resume();
   }
   recording=chooseRecorder(mediaStream,q);
   mime=recording.mimeType||'';
   const chunks=[];
   const stopped=new Promise((resolve,reject)=>{
    recording.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data)};
    recording.onstop=()=>resolve(true);
    recording.onerror=event=>reject(event.error||Error('Tarayıcı kaydı sırasında hata oluştu.'));
   });
   let lastStatusSecond=-1;
   const renderNewFrame=(t)=>{
    if(!exporting||cancelled)return;
    if(video.readyState>=2&&t>mediaLastTime+.002){
     drawFrame(ctx,w,h,t);
     mediaLastTime=t;
     frameCount++;
     lastFrameAt=performance.now();
    }
    const second=Math.floor(video.currentTime||0);
    if(second!==lastStatusSecond){
     lastStatusSecond=second;
     setProgress((video.currentTime||0)/video.duration);
     setStatus('Kayıt sürüyor · '+app.formatTime(video.currentTime)+' / '+app.formatTime(video.duration)+' · '+w+'×'+h+' · '+frameCount+' kare');
    }
   };
   lastFrameAt=performance.now();
   if(typeof video.requestVideoFrameCallback==='function'){
    const frameCallback=(now,meta)=>{
     if(!exporting||cancelled)return;
     try{renderNewFrame(Number(meta?.mediaTime)||video.currentTime)}catch(error){recordingError=error;try{recording?.stop()}catch(_){};return}
     frameId=video.requestVideoFrameCallback(frameCallback);
    };
    frameId=video.requestVideoFrameCallback(frameCallback);
   }else{
    const loop=()=>{
     if(!exporting||cancelled)return;
     try{renderNewFrame(video.currentTime||0)}catch(error){recordingError=error;try{recording?.stop()}catch(_){};return}
     cancelFrameId=requestAnimationFrame(loop);
    };
    cancelFrameId=requestAnimationFrame(loop);
   }
   endListener=()=>{setTimeout(()=>{if(recording?.state==='recording')recording.stop()},180)};
   video.addEventListener('ended',endListener,{once:true});
   // Required: called while handling the original button tap, before the first await.
   recording.start(800);
   playPromise=video.play();
   setStatus('Kaydediliyor… Sayfayı kapatma. İstersen iptal edebilirsin.');
   watchdog=setInterval(()=>{
    if(!exporting||cancelled)return;
    if(recording?.state==='recording'&&!video.ended&&!video.paused&&performance.now()-lastFrameAt>6500){
     recordingError=Error('Görüntü kareleri ilerlemedi. 720p seçeneğini ve kısa videoyu dene.');
     try{recording.stop()}catch(_){}
    }
   },1300);
   const hardLimit=Math.min(205000,Math.ceil(video.duration*1000)+16000);
   const hardStop=new Promise((_,reject)=>{
    timer=setTimeout(()=>{
     if(recording?.state==='recording')try{recording.stop()}catch(_){}
     reject(Error('Kayıt zaman aşımı: Safari yanıt vermedi. Projen kaydedilmiş durumda.'));
    },hardLimit);
   });
   const unlock=Promise.all([resumePromise,playPromise]);
   const startLimit=new Promise((_,reject)=>setTimeout(()=>reject(Error('Safari videoyu başlatmadı. Sayfa kayıt yapamıyor.')),8500));
   await Promise.race([unlock,startLimit,hardStop,cancelledPromise]);
   // Even if MediaRecorder never fires stop, the hard limit will exit this wait.
   await Promise.race([stopped,hardStop,cancelledPromise]);
   if(cancelled)throw Error('Kayıt iptal edildi.');
   if(recordingError)throw recordingError;
   const total=chunks.reduce((sum,item)=>sum+item.size,0);
   if(frameCount<Math.min(10,Math.ceil(video.duration*1.5))||total<2000)throw Error('Yetersiz kare üretildi. Donmuş video yerine hata gösterildi; daha düşük kalite dene.');
   const fileType=(mime||chunks.find(x=>x.type)?.type||'').includes('webm')?'video/webm':
    (mime||chunks.find(x=>x.type)?.type||'').includes('mp4')?'video/mp4':'';
   if(!fileType)throw Error('Safari dosya biçimini bildirmedi. Yanlış uzantılı dosya kaydedilmedi.');
   const ext=fileType==='video/mp4'?'mp4':'webm';
   const fileName=(state.name||'SubStudio').replace(/[^\p{L}\p{N}_-]+/gu,'_').slice(0,50)||'SubStudio';
   rendered=new File([new Blob(chunks,{type:fileType})],fileName+'.'+ext,{type:fileType});
   $('downloadExport').hidden=false;
   $('shareExport').hidden=typeof navigator.share!=='function';
   setProgress(1);
   setStatus('✓ Video oluşturuldu ('+(total/1048576).toFixed(1)+' MB). İndir veya iPad paylaşım menüsüne kaydet.');
  }catch(error){
   if(cancelled)setStatus('Kayıt iptal edildi. Düzenlemelerin taslakta duruyor.');
   else fail(String(error?.message||error));
  }finally{
   if(endListener)video.removeEventListener('ended',endListener);
   video.muted=originalMuted;
   cleanup(video);
  }
 }
 function cancel(){
  if(!exporting)return;
  cancelled=true;setStatus('Kayıt iptal edildi; düzenlemelerin korunuyor.');
  if(abortResolver)abortResolver(Error('Kayıt kullanıcı tarafından iptal edildi.'));
  if(recording?.state==='recording')try{recording.stop()}catch(_){}
  // Safari sometimes fails to deliver onstop; the primary hard-stop timer still applies.
 }
 function init(application){
  app=application;
  $('startExport').addEventListener('click',()=>{void begin()});
  $('cancelExport').addEventListener('click',cancel);
  $('exportQuality').addEventListener('change',()=>{resetOutput();setStatus('Kalite değişti. Video kaydını yeniden başlatabilirsin.')});
  $('downloadExport').addEventListener('click',()=>{
   if(!rendered)return;
   app.download(rendered,rendered.name);
   setStatus('İndirme başlatıldı. Safari > İndirilenler / Dosyalar bölümünü kontrol et.');
  });
  $('shareExport').addEventListener('click',()=>{
   if(!rendered||!navigator.share)return;
   if(typeof navigator.canShare==='function'&&!navigator.canShare({files:[rendered]})){
    setStatus('iPad bu dosyayı paylaşamıyor. Videoyu indir düğmesini kullan.');return;
   }
   navigator.share({files:[rendered],title:'焱 SubStudio'}).catch(err=>{
    if(err?.name!=='AbortError')setStatus('Paylaşım hatası: '+String(err?.message||err));
   });
  });
  $('downloadSRT').addEventListener('click',()=>{
   app.downloadSRT?.();
   setStatus('SRT altyazı indirmesi başlatıldı. Video çıkışından bağımsızdır.');
  });
 }
 function invalidate(){if(!exporting)resetOutput()}
 window.SubStudioExporter={init:init,invalidate:invalidate};
})();
