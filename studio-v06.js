/* 焱 SubStudio 0.8 — millisecond timing, safe insertion and pasted subtitle timelines */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const Precise=window.SubStudioPreciseTime;
 const vid=$('video'),preview=$('previewFrame'),captionBox=$('captionStage'),captionText=$('captionText'),layerStage=$('layersStage');
 const Store=window.SubStudioStore, Timing=window.SubStudioTiming;
 const FONT_LIST=['DM Sans','Poppins','Montserrat','Anton','Bebas Neue','Oswald','Impact','Georgia','Amiri','Noto Sans Arabic'];
 const FX_LIST=['none','pop','fade','rise','glow'];
 const defaultStyle={font:'DM Sans',size:58,weight:800,color:'#ffffff',outline:4,outlineColor:'#17131b',bottom:16,stretch:100,skew:0,rotate:0,animation:'pop',animationSpeed:.4,shadow:true,background:false,bgAlpha:62,uppercase:false};
 const presets={
  ember:{font:'DM Sans',size:58,weight:800,color:'#ffffff',outline:4,outlineColor:'#17131b',animation:'pop',background:false},
  minimal:{font:'Poppins',size:52,weight:600,color:'#ffffff',outline:0,outlineColor:'#121212',animation:'fade',background:false},
  neon:{font:'Montserrat',size:61,weight:800,color:'#93fff1',outline:2,outlineColor:'#004c4f',animation:'glow',background:false},
  cinema:{font:'Georgia',size:49,weight:700,color:'#ffe5c1',outline:2,outlineColor:'#1c1718',animation:'fade',background:true},
  pop:{font:'Anton',size:68,weight:900,color:'#ffdf54',outline:4,outlineColor:'#a22b67',animation:'pop',background:false},
  verse:{font:'Amiri',size:67,weight:700,color:'#fbe1af',outline:1,outlineColor:'#332319',animation:'fade',background:true}
 };
 const defaultLayer=()=>({id:id(),text:'Yeni metin',start:0,end:3,x:50,y:16,font:'DM Sans',size:46,color:'#ffffff',outline:2,rotate:0,stretch:100,skew:0,animation:'fade',background:false});
 function id(){return typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'item-'+Date.now()+'-'+Math.random().toString(36).slice(2)}
 function freshState(){return {version:6,name:'Yeni video projesi',aspect:'original',density:'balanced',aiMode:'local',insertMode:'append',cues:[],rawWords:[],captionStyle:{...defaultStyle},layers:[],fileName:'',fileSize:0,savedAt:0}}
 let state=freshState(),mediaBlob=null,mediaURL=null,selectedLayerId=null,editCues=false,undoCues=null;
 let page='project',lastCueId='',lastLayerIds='',previewSampleUntil=0,saveTimer=0,saveSerial=Promise.resolve(),saveEpoch=0;
 let restored=false,notices=[];
 const AI_JOB_KEY='substudio-ai-progress-v061';
 function markAI(stage){
  try{localStorage.setItem(AI_JOB_KEY,JSON.stringify({stage,time:Date.now(),file:state.fileName||''}))}catch(_){}
 }
 function finishAI(){
  try{localStorage.removeItem(AI_JOB_KEY)}catch(_){}
 }
 function configureAI(){
  const ai=window.SubStudioLocalAI;
  try{$('transcriptionServerUrl').value=localStorage.getItem('substudio-server-url-v07')||''}catch(_){}
  try{$('transcriptionServerKey').value=sessionStorage.getItem('substudio-server-key-v07')||''}catch(_){}
  $('resumeServerJob').hidden=!loadPendingJob();
  const ipad=!!ai?.isAppleTouch?.();
  const model=$('aiModel');
  const heavy=model.querySelector('option[value="accurate"]');
  if(heavy)heavy.disabled=ipad;
  if(ipad)model.value='fast';
  if(ipad&&Number(vid.duration)>40){state.aiMode='server';$('aiMode').value='server';updateAIMode()}
  const safety=$('aiSafetyNote');
  if(safety)safety.textContent=ipad
    ?'iPad güvenli mod: Whisper Tiny, en fazla 40 saniye / 60 MB. Whisper Base bu cihazda bellek çökmesini önlemek için kapalıdır. Tiny de düşük bellekli cihazlarda kapanabilir.'
    :'Masaüstünde daha doğru Whisper Base seçilebilir. Bu işlem yüksek bellek kullanır. Düzenlemelerini önce yedekle.';
  let pending=null;
  try{pending=JSON.parse(localStorage.getItem(AI_JOB_KEY)||'null')}catch(_){}
  if(pending){
   finishAI();
   if(Date.now()-Number(pending.time||0)<24*3600*1000){
    say('⚠ Önceki AI işlemi '+String(pending.stage||'')+' aşamasında tamamlanmamış. Safari bellek nedeniyle yeniden yüklemiş olabilir. Proje taslağını kontrol et; iPad için Tiny / 40 sn sınırı etkin.');
   }
  }
 }
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number(v)||0));
 const round=n=>Math.round(n*1000)/1000;
 const time=n=>{n=Math.max(0,Math.floor(Number(n)||0));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
 const setStatus=(message,kind='')=>{const el=$('saveStatus');el.textContent=message;el.className='save-status '+kind};
 const setMediaStatus=msg=>{$('mediaSaveStatus').textContent=msg};
 const say=(message,element='autoStatus')=>{const el=$(element);if(el)el.textContent=message};
 function node(tag,cls,label){const el=document.createElement(tag);if(cls)el.className=cls;if(label!==undefined)el.textContent=label;return el}
 function button(text,action,cls){const el=node('button',cls||'outline',text);el.type='button';el.addEventListener('click',action);return el}
 function safeText(s){return String(s||'').slice(0,30000)}
 function safeStyle(data){
  const out={...defaultStyle};
  if(!data||typeof data!=='object')return out;
  if(FONT_LIST.includes(data.font))out.font=data.font;
  for(const [key,lo,hi] of [['size',20,110],['weight',400,900],['outline',0,12],['bottom',5,75],['stretch',65,155],['skew',-30,30],['rotate',-25,25],['animationSpeed',.15,1.5],['bgAlpha',0,95]])if(Number.isFinite(Number(data[key])))out[key]=clamp(data[key],lo,hi);
  for(const key of ['shadow','background','uppercase'])if(typeof data[key]==='boolean')out[key]=data[key];
  for(const key of ['color','outlineColor'])if(/^#[0-9a-f]{6}$/i.test(data[key]||''))out[key]=data[key];
  if(FX_LIST.includes(data.animation))out.animation=data.animation;
  return out;
 }
 function safeCue(c){
  if(!c||typeof c!=='object')return null;
  const start=Number(c.start),end=Number(c.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)return null;
  return {id:String(c.id||id()),text:safeText(c.text),start:round(start),end:round(end),edited:!!c.edited,estimated:!!c.estimated,
   words:Array.isArray(c.words)?c.words.filter(w=>w&&Number.isFinite(Number(w.start))&&Number.isFinite(Number(w.end))&&typeof w.word==='string').slice(0,400).map(w=>({word:w.word,start:Number(w.start),end:Number(w.end),estimated:!!w.estimated})):undefined};
 }
 function safeLayer(l){
  if(!l||typeof l!=='object')return null;
  const d=defaultLayer();
  for(const key of ['id','text'])if(typeof l[key]==='string')d[key]=l[key].slice(0,key==='id'?200:1200);
  if(FONT_LIST.includes(l.font))d.font=l.font;
  if(FX_LIST.includes(l.animation))d.animation=l.animation;
  if(/^#[0-9a-f]{6}$/i.test(l.color||''))d.color=l.color;
  if(typeof l.background==='boolean')d.background=l.background;
  for(const [key,lo,hi] of [['start',0,999999],['end',0,999999],['x',6,94],['y',6,94],['size',16,110],['outline',0,12],['rotate',-30,30],['stretch',65,155],['skew',-30,30]])if(Number.isFinite(Number(l[key])))d[key]=clamp(l[key],lo,hi);
  d.end=Math.max(d.start+.1,d.end);
  return d;
 }
 function normalize(raw){
  const p=freshState();if(!raw||typeof raw!=='object')return p;
  if(typeof raw.name==='string')p.name=raw.name.slice(0,80);
  if(['original','9:16','1:1','16:9'].includes(raw.aspect))p.aspect=raw.aspect;
  if(['short','balanced','long'].includes(raw.density))p.density=raw.density;
  if(['local','server'].includes(raw.aiMode))p.aiMode=raw.aiMode;
  if(['append','playhead'].includes(raw.insertMode))p.insertMode=raw.insertMode;
  p.cues=Array.isArray(raw.cues)?raw.cues.slice(0,2000).map(safeCue).filter(Boolean).sort((a,b)=>a.start-b.start):[];
  p.rawWords=Array.isArray(raw.rawWords)?raw.rawWords.slice(0,20000).filter(w=>w&&typeof w.word==='string'&&Number.isFinite(Number(w.start))&&Number.isFinite(Number(w.end))).map(w=>({word:w.word,start:Number(w.start),end:Number(w.end),estimated:!!w.estimated})):[];
  p.captionStyle=safeStyle(raw.captionStyle);
  p.layers=Array.isArray(raw.layers)?raw.layers.slice(0,100).map(safeLayer).filter(Boolean):[];
  p.fileName=typeof raw.fileName==='string'?raw.fileName.slice(0,255):'';
  p.fileSize=Number(raw.fileSize)||0;
  p.savedAt=Number(raw.savedAt)||0;
  return p;
 }
 const snapshot=()=>JSON.parse(JSON.stringify({...state,version:6,savedAt:Date.now()}));
 function queueSave(){
  if(!restored)return;
  window.SubStudioExporter?.invalidate?.();
  saveEpoch++;setStatus('Kaydediliyor…','warn');clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{void saveNow()},330);
 }
 function saveNow(){
  clearTimeout(saveTimer);if(!restored)return Promise.resolve(false);
  const epoch=saveEpoch,data=snapshot();
  saveSerial=saveSerial.catch(()=>{}).then(async()=>{
   const result=await Store.saveDraft(data);
   if(epoch===saveEpoch)setStatus(result.ok?'Taslak kaydedildi':'Taslak kaydedilemedi!',result.ok?'ok':'warn');
   return result.ok;
  });
  return saveSerial;
 }
 function download(blob,name){
  const url=URL.createObjectURL(blob),a=node('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 function saveBackup(){
  const backup=snapshot();
  const filename=(state.name||'SubStudio').replace(/[^\p{L}\p{N}_-]+/gu,'_').slice(0,50)||'SubStudio';
  download(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),filename+'.substudio.json');
  setStatus('Proje yedeği indirildi','ok');
 }
 function setPage(name){
  if(!['project','captions','style','layers','export'].includes(name))return;
  page=name;
  document.querySelectorAll('[data-page]').forEach(el=>{
   const active=el.dataset.page===name;
   if(el.classList.contains('page'))el.classList.toggle('active',active);
   if(el.tagName==='BUTTON'){el.classList.toggle('active',active);el.setAttribute('aria-current',active?'page':'false')}
  });
  try{history.replaceState(null,'','#'+name)}catch(_){}
  if(name==='export')refreshExportInfo();
  if(name==='layers')renderLayers();
  if(name==='style')syncStyleForm();
  try{window.scrollTo({top:0,behavior:'auto'})}catch(_){}
 }
 function onVideoMetadata(){
  state.fileName=state.fileName||mediaBlob?.name||'';
  const duration=Number(vid.duration)||0;
  if(window.SubStudioLocalAI?.isAppleTouch?.() && duration>40 && state.aiMode==='local'){
   state.aiMode='server';$('aiMode').value='server';updateAIMode();queueSave();
  }
  const width=vid.videoWidth,height=vid.videoHeight;
  const ratio=state.aspect==='original'&&width&&height?width+'/'+height:state.aspect==='original'?'9/16':state.aspect.replace(':','/');
  preview.style.aspectRatio=ratio;
  vid.style.objectFit=state.aspect==='original'?'contain':'cover';
  $('previewInfo').textContent=width&&height?width+'×'+height:'Video';
  $('timeDur').textContent=Precise.formatClock(duration);
  $('seek').max=duration||1;
  refreshExportInfo();
 }
 function setMedia(blob,name){
  if(mediaURL)URL.revokeObjectURL(mediaURL);
  mediaBlob=blob||null;
  if(!blob){vid.pause();vid.removeAttribute('src');vid.load();$('previewEmpty').hidden=false;$('mediaInfo').textContent='Henüz video yok.';return}
  mediaURL=URL.createObjectURL(blob);
  state.fileName=name||blob.name||'video';
  state.fileSize=blob.size||0;
  vid.src=mediaURL;vid.load();
  $('previewEmpty').hidden=true;
  $('mediaInfo').textContent=state.fileName+' · '+((state.fileSize||0)/1048576).toFixed(1)+' MB';
  $('previewInfo').textContent=state.fileName;
  setTimeout(()=>{updatePreview(true)},100);
 }
 async function videoUpload(file){
  if(!file)return;
  if(!file.type.startsWith('video/')&&!/\.(mp4|mov|webm|m4v)$/i.test(file.name)){setMediaStatus('Lütfen geçerli bir video dosyası seç.');return}
  if((state.cues.length||state.layers.length)&&mediaBlob&&!confirm('Videoyu değiştireceksin. Altyazı ve ekstra metinlerin korunacak fakat zamanlar yeni videoya uymayabilir. Devam?'))return;
  setMedia(file,file.name);
  setMediaStatus('Video cihazdaki taslağa kaydediliyor…');
  queueSave();
  const saved=await Store.saveMedia(file);
  setMediaStatus(saved.ok?'✓ Video dosyası iPad üzerinde taslağa kaydedildi. Sayfayı yenileyerek geri yüklemeyi deneyebilirsin.':'⚠ Video dosyası saklanamadı: '+saved.reason+' Metin düzenlemelerin saklanmaya devam eder.');
  await saveNow();
 }
 function showCue(t,force=false){
  const c=state.cues.find(c=>c.start<=t&&t<c.end);
  const key=c?.id||'';
  const st=state.captionStyle;
  if(key!==lastCueId||force){
   lastCueId=key;
   captionBox.hidden=!c && Date.now()>previewSampleUntil;
   if(c||Date.now()<=previewSampleUntil){
    const text=c?c.text:'ÖRNEK ALTYAZI · 焱';
    captionText.textContent=st.uppercase?text.toLocaleUpperCase('tr-TR'):text;
    const unit=(preview.clientWidth||320)/720;
    captionBox.style.bottom=st.bottom+'%';
    captionText.style.fontFamily='"'+st.font+'",sans-serif';
    captionText.style.fontWeight=String(st.weight);
    captionText.style.fontSize=(st.size*unit)+'px';
    captionText.style.color=st.color;
    captionText.style.webkitTextStroke=(st.outline*unit)+'px '+st.outlineColor;
    captionText.style.paintOrder='stroke fill';
    captionText.style.textShadow=st.shadow?'0 3px 8px #000a, 0 0 15px #0005':'none';
    captionText.style.background=st.background?'rgba(0,0,0,'+(st.bgAlpha/100)+')':'transparent';
    captionText.style.borderRadius='5px';
    captionText.style.transform='scaleX('+(st.stretch/100)+') skewX('+st.skew+'deg) rotate('+st.rotate+'deg)';
    captionText.style.setProperty('--fx-duration',st.animationSpeed+'s');
    captionText.className='';
    void captionText.offsetWidth;
    if(st.animation!=='none')captionText.classList.add('fx-'+st.animation);
   }
  }
 }
 function activeLayers(t){return state.layers.filter(l=>l.start<=t&&t<l.end)}
 function showLayers(t,force=false){
  const active=activeLayers(t);
  const key=active.map(l=>l.id).join(',');
  if(!force&&key===lastLayerIds)return;
  lastLayerIds=key;layerStage.replaceChildren();
  const unit=(preview.clientWidth||320)/720;
  for(const l of active){
   const el=node('div','overlay-text'+(l.animation==='none'?'':' fx-'+l.animation),l.text);
   el.dataset.layerId=l.id;
   el.style.left=l.x+'%';el.style.top=l.y+'%';
   el.style.fontFamily='"'+l.font+'",sans-serif';el.style.fontSize=(l.size*unit)+'px';
   el.style.fontWeight='800';el.style.color=l.color;
   el.style.webkitTextStroke=(l.outline*unit)+'px #17131b';el.style.paintOrder='stroke fill';
   el.style.textShadow='0 3px 9px #000b';
   el.style.background=l.background?'rgba(0,0,0,.60)':'transparent';
   el.style.borderRadius='5px';
   el.style.transform='translate(-50%,-50%) scaleX('+(l.stretch/100)+') skewX('+l.skew+'deg) rotate('+l.rotate+'deg)';
   el.style.setProperty('--fx-duration','.45s');
   el.style.outline=selectedLayerId===l.id&&page==='layers'?'1px dashed #ffa477':'none';
   el.addEventListener('pointerdown',event=>{
    if(page!=='layers')return;
    event.preventDefault();
    selectedLayerId=l.id;
    $('layerEditor').hidden=false;
    syncLayerForm();
    el.style.outline='1px dashed #ffa477';
    const dragEl=el;
    const startX=event.clientX,startY=event.clientY;
    const sx=l.x,sy=l.y;
    dragEl.setPointerCapture?.(event.pointerId);
    const move=evt=>{
     const rect=preview.getBoundingClientRect();
     l.x=round(clamp(sx+(evt.clientX-startX)/rect.width*100,6,94));
     l.y=round(clamp(sy+(evt.clientY-startY)/rect.height*100,6,94));
     dragEl.style.left=l.x+'%';dragEl.style.top=l.y+'%';
     $('layerX').value=l.x;$('layerY').value=l.y;
     $('layerXOut').textContent='%'+l.x;$('layerYOut').textContent='%'+l.y;
    };
    const finish=()=>{dragEl.removeEventListener('pointermove',move);dragEl.removeEventListener('pointerup',finish);dragEl.removeEventListener('pointercancel',finish);queueSave();renderLayers();showLayers(vid.currentTime,true)};
    dragEl.addEventListener('pointermove',move);
    dragEl.addEventListener('pointerup',finish,{once:true});
    dragEl.addEventListener('pointercancel',finish,{once:true});
   });
   layerStage.appendChild(el);
  }
 }
 function updatePreview(force=false){
  const t=vid.currentTime||0;
  showCue(t,force);showLayers(t,force);
  $('timeCur').textContent=Precise.formatClock(t);
  if(document.activeElement!==$('playheadClock'))$('playheadClock').value=Precise.formatClock(t);
  $('seek').value=Number.isFinite(t)?t:0;
  $('playPause').textContent=vid.paused?'▶':'Ⅱ';
 }

 function cueMessage(message){
  const target=$('timingStatus');
  if(target)target.textContent=message;
 }
 function setCueTime(cueId,which,value){
  const i=state.cues.findIndex(c=>c.id===cueId);
  if(i<0)return false;
  const c=state.cues[i];
  const newStart=which==='start'?value:c.start, newEnd=which==='end'?value:c.end;
  const error=Precise.validateTimes(state.cues,i,newStart,newEnd,vid.duration);
  if(error){cueMessage('⚠ '+error);return false}
  c[which]=Precise.roundMs(value);c.edited=true;editCues=true;
  updateCues();queueSave();
  cueMessage('✓ Zaman güncellendi: '+Precise.formatClock(c.start)+' – '+Precise.formatClock(c.end));
  return true;
 }
 function insertCue(mode='append'){
  const result=Precise.insertion(state.cues,mode,vid.currentTime||0,vid.duration);
  if(result.error){cueMessage('⚠ '+result.error);return false}
  const cue={id:id(),text:'Yeni altyazı',start:result.start,end:result.end,edited:true};
  state.cues.push(cue);state.cues.sort((a,b)=>a.start-b.start);
  editCues=true;updateCues();queueSave();
  cueMessage('✓ Yeni satır eklendi: '+Precise.formatClock(cue.start)+' – '+Precise.formatClock(cue.end));
  if(mediaBlob){vid.pause();vid.currentTime=cue.start;updatePreview(true)}
  const card=[...$('cueList').children].find(x=>x.dataset?.cueId===cue.id);
  if(card){
   card.scrollIntoView?.({block:'nearest',behavior:'auto'});
   card.querySelector('textarea')?.focus?.();
  }
  return true;
 }
 function insertCueAfter(cueId){
  const i=state.cues.findIndex(c=>c.id===cueId);
  if(i<0)return;
  const current=state.cues[i],next=state.cues[i+1];
  const start=Precise.roundMs(current.end);
  const max=Number.isFinite(vid.duration)&&vid.duration>0?vid.duration:Infinity;
  const end=Precise.roundMs(Math.min(start+1.5,next?next.start:Infinity,max));
  if(end-start<.05){
   cueMessage('⚠ Bu satırın sonrasında boş zaman yok. Altyazıların zamanını değiştirmek için satırı Böl veya başlangıç/bitiş kutularını kullan.');
   return;
  }
  const fresh={id:id(),text:'Yeni altyazı',start,end,edited:true};
  state.cues.splice(i+1,0,fresh);editCues=true;
  updateCues();queueSave();
  cueMessage('✓ '+Precise.formatClock(start)+' – '+Precise.formatClock(end)+' aralığına yeni satır eklendi.');
  if(mediaBlob){vid.pause();vid.currentTime=start;updatePreview(true)}
 }
 function updateCues(){
  $('cueCount').textContent=state.cues.length+' SATIR';
  const list=$('cueList');list.replaceChildren();
  if(!state.cues.length){
   list.appendChild(node('div','empty-list','Henüz altyazı yok. En sona ekle veya saatli metin listesini yapıştır.'));
   updatePreview(true);return
  }
  for(let i=0;i<state.cues.length;i++){
   const c=state.cues[i],row=node('article','cue-card');
   row.dataset.cueId=c.id;
   const top=node('div','cue-head');
   const head=node('span','',('SATIR '+String(i+1).padStart(2,'0'))+
    ' · '+Precise.formatClock(c.start)+' – '+Precise.formatClock(c.end)+(c.estimated?' · TAHMİNİ':''));
   const remove=button('× Sil',()=>{
    state.cues.splice(i,1);editCues=true;updateCues();queueSave()
   },'ghost');
   top.append(head,remove);row.appendChild(top);
   const input=node('textarea');input.value=c.text;input.rows=2;
   input.setAttribute('aria-label','Altyazı metni '+(i+1));
   input.addEventListener('input',()=>{
    c.text=input.value;c.edited=true;editCues=true;updatePreview(true);queueSave()
   });
   row.appendChild(input);
   const times=node('div','cue-times');
   for(const key of ['start','end']){
    const field=node('div','cue-time-field');
    const label=node('label','cue-time-label',key==='start'?'BAŞLANGIÇ':'BİTİŞ');
    const timeInput=node('input','cue-clock-input');
    timeInput.id='cue-'+key+'-'+c.id;
    timeInput.type='text';timeInput.inputMode='decimal';
    timeInput.autocomplete='off';timeInput.spellcheck=false;
    timeInput.value=Precise.formatClock(c[key]);
    timeInput.setAttribute('aria-label','Satır '+(i+1)+' '+(key==='start'?'başlangıç':'bitiş')+' zamanı');
    timeInput.setAttribute('placeholder','00:00.000');
    label.htmlFor=timeInput.id;
    const commit=()=>{
      const parsed=Precise.parseClock(timeInput.value);
      if(parsed===null){cueMessage('⚠ Saat biçimi hatalı. Örnek: 00:02.518');timeInput.value=Precise.formatClock(c[key]);return}
      if(!setCueTime(c.id,key,parsed))timeInput.value=Precise.formatClock(c[key]);
    };
    timeInput.addEventListener('change',commit);
    timeInput.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();timeInput.blur()}
    });
    const grab=button('◉ Videodan al',()=>{
      if(!mediaBlob){cueMessage('⚠ Önce video yükle.');return}
      setCueTime(c.id,key,Precise.roundMs(vid.currentTime||0))
    },'outline');
    grab.title='Video oynatıcısındaki tam zamanı '+(key==='start'?'başlangıca':'bitişe')+' yaz';
    const minus=button('−10 ms',()=>setCueTime(c.id,key,Precise.roundMs(c[key]-.01)),'outline');
    const plus=button('+10 ms',()=>setCueTime(c.id,key,Precise.roundMs(c[key]+.01)),'outline');
    field.append(label,timeInput);
    const fine=node('div','cue-time-controls');fine.append(grab,minus,plus);
    field.appendChild(fine);times.appendChild(field);
   }
   row.appendChild(times);
   const actions=node('div','cue-tools');
   const ctl=[
    ['◀ 0,1 sn','back'],['0,1 sn ▶','forward'],['− 0,01 sn','backFine'],
    ['+ 0,01 sn','forwardFine'],['✂ Böl','split'],['⇄ Birleştir','merge'],
    ['+ Sonrasına','insertAfter']
   ];
   for(const [label,action] of ctl){
    const control=button(label,()=>{
      if(action==='insertAfter')insertCueAfter(c.id);
      else adjustCue(c.id,action)
    },'');
    if(action==='merge'&&i===state.cues.length-1)control.disabled=true;
    actions.appendChild(control);
   }
   row.appendChild(actions);
   row.addEventListener('click',event=>{
    if(event.target.closest('input,textarea,button'))return;
    if(mediaBlob){vid.currentTime=c.start;updatePreview(true)}
   });
   list.appendChild(row);
  }
  updatePreview(true);
 }
 function adjustCue(itemId,action){
  const i=state.cues.findIndex(c=>c.id===itemId);if(i<0)return;
  const c=state.cues[i],prev=state.cues[i-1],next=state.cues[i+1];
  const lower=prev?prev.end:0,upper=next?next.start:(Number.isFinite(vid.duration)&&vid.duration>0?vid.duration:Infinity);
  if(action==='split'){
   const pieces=Timing.splitCue(c);
   if(!pieces){cueMessage('⚠ Satır bölünemedi. En az iki kelime gerekli.');return}
   state.cues.splice(i,1,...pieces);
  }else if(action==='merge'){
   if(!next)return;
   state.cues.splice(i,2,Timing.mergeCues(c,next));
  }else if(['back','forward','backFine','forwardFine'].includes(action)){
   const wanted=action==='back'?-.1:action==='forward'?.1:action==='backFine'?-.01:.01;
   const actual=Math.max(lower-c.start,Math.min(wanted,upper-c.end));
   if(Math.abs(actual)<.0005){cueMessage('⚠ Bu yönde boş zaman kalmadı.');return}
   c.start=Precise.roundMs(c.start+actual);
   c.end=Precise.roundMs(c.end+actual);
   c.edited=true;
  }else return;
  editCues=true;state.cues.sort((a,b)=>a.start-b.start);
  updateCues();queueSave();
 }
 function reflow(){
  if(!state.cues.length){say('Önce altyazı oluştur.','timingStatus');return}
  if(state.rawWords.length&&editCues&&!confirm('Düzelttiğin metin ilk AI sonucuyla değişebilir. Yeniden bölünsün mü?'))return;
  undoCues=structuredClone(state.cues);$('undoReflow').disabled=false;
  const words=state.rawWords.length?state.rawWords:Timing.approximateWordsFromCues(state.cues);
  const result=Timing.createCues(words,{mode:state.density});
  if(!result.length)return;
  state.cues=result;editCues=false;updateCues();queueSave();
  say(result.length+' satır yeniden düzenlendi. '+(state.rawWords.length?'Kelime süreleri kullanıldı.':'Kelime zamanları tahmini hesaplandı.'),'timingStatus');
 }
 function toSRT(n){let ms=Math.round(Math.max(0,n)*1000),h=Math.floor(ms/3600000);ms%=3600000;let m=Math.floor(ms/60000);ms%=60000;let s=Math.floor(ms/1000);ms%=1000;return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':')+','+String(ms).padStart(3,'0')}
 function downloadSRT(){
  if(!state.cues.length){say('İndirilecek altyazı yok.','timingStatus');return}
  const s=state.cues.map((c,i)=>(i+1)+'\n'+toSRT(c.start)+' --> '+toSRT(c.end)+'\n'+c.text+'\n').join('\n');
  download(new Blob(['\ufeff',s],{type:'text/plain;charset=utf-8'}),(state.name||'altyazi')+'.srt');
 }
 function parseSRT(raw){
  const chunks=String(raw||'').replace(/^\uFEFF/,'').replace(/\r/g,'').trim().split(/\n\s*\n/);
  const cues=[];
  for(const chunk of chunks){
   const lines=chunk.split('\n');
   const idx=lines.findIndex(l=>l.includes('-->'));if(idx<0)continue;
   const m=lines[idx].match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
   if(!m)continue;
   const toSeconds=(h,min,s,ms)=>Number(h)*3600+Number(min)*60+Number(s)+Number(ms.padEnd(3,'0'))/1000;
   const start=toSeconds(...m.slice(1,5)),end=toSeconds(...m.slice(5,9));
   const text=lines.slice(idx+1).join('\n').trim();
   if(text&&end>start)cues.push({id:id(),text,start,end,edited:true});
  }
  return cues.sort((a,b)=>a.start-b.start);
 }
 function syncStyleForm(){
  const p=state.captionStyle;
  for(const [key,id] of [['font','captionFont'],['size','captionSize'],['weight','captionWeight'],['color','captionColor'],['outline','captionOutline'],['outlineColor','outlineColor'],['bottom','captionBottom'],['stretch','captionStretch'],['skew','captionSkew'],['rotate','captionRotate'],['animationSpeed','captionAnimSpeed'],['shadow','captionShadow'],['background','captionBackground'],['bgAlpha','bgAlpha'],['uppercase','captionUppercase']]){
   const el=$(id);if(!el)continue;
   if(el.type==='checkbox')el.checked=!!p[key];else el.value=p[key];
  }
  for(const [key,id,suffix] of [['size','captionSizeOut',' px'],['outline','captionOutlineOut',' px'],['bottom','captionBottomOut','%'],['stretch','captionStretchOut','%'],['skew','captionSkewOut','°'],['rotate','captionRotateOut','°'],['animationSpeed','captionAnimSpeedOut',' sn'],['bgAlpha','bgAlphaOut','%']]){
   $(id).textContent=String(p[key])+suffix;
  }
  document.querySelectorAll('[data-animation]').forEach(el=>el.classList.toggle('active',el.dataset.animation===p.animation));
 }
 function setStyle(key,value){
  state.captionStyle[key]=value;
  updatePreview(true);queueSave();syncStyleForm();
 }
 function selectLayer(idValue){
  selectedLayerId=idValue;renderLayers();
 }
 function activeLayer(){return state.layers.find(l=>l.id===selectedLayerId)}
 function renderLayers(){
  const list=$('layerList');list.replaceChildren();
  if(!state.layers.length){list.appendChild(node('div','empty-list','Henüz ekstra metin yok. + Metin ekle düğmesine bas.'))}
  for(const l of state.layers){
   const card=node('div','layer-card'+(l.id===selectedLayerId?' selected':''));
   card.appendChild(node('div','layer-name',l.text.slice(0,95)||'Boş metin'));
   card.appendChild(node('div','layer-meta',time(l.start)+' – '+time(l.end)+' · X %'+l.x+' / Y %'+l.y));
   const controls=node('div','two-buttons');
   controls.append(button('✎ Düzenle',()=>{selectedLayerId=l.id;renderLayers();if(mediaBlob){vid.currentTime=l.start+.05;updatePreview(true)}},'outline'),
    button('▶ Göster',()=>{if(mediaBlob){vid.currentTime=l.start+.05;updatePreview(true)}},'outline'));
   card.appendChild(controls);list.appendChild(card);
  }
  const edit=$('layerEditor'),l=activeLayer();
  edit.hidden=!l;
  if(l)syncLayerForm();
  updatePreview(true);
 }
 function syncLayerForm(){
  const l=activeLayer();if(!l)return;
  for(const [key,id] of [['text','layerText'],['start','layerStart'],['end','layerEnd'],['font','layerFont'],['size','layerSize'],['color','layerColor'],['outline','layerOutline'],['rotate','layerRotate'],['stretch','layerStretch'],['skew','layerSkew'],['x','layerX'],['y','layerY'],['animation','layerAnimation'],['background','layerBackground']]){
   const el=$(id);if(el.type==='checkbox')el.checked=!!l[key];else el.value=l[key];
  }
  for(const [key,id,suffix] of [['x','layerXOut','%'],['y','layerYOut','%'],['size','layerSizeOut',' px'],['outline','layerOutlineOut',' px'],['rotate','layerRotateOut','°'],['stretch','layerStretchOut','%'],['skew','layerSkewOut','°']]){
   $(id).textContent=l[key]+suffix;
  }
 }
 function changeLayer(key,value){
  const l=activeLayer();if(!l)return;
  if(key==='start'||key==='end'){
   if(!Number.isFinite(value)||value<0)return;
   if(key==='start'&&value>=l.end-.08)return;
   if(key==='end'&&value<=l.start+.08)return;
  }
  l[key]=value;lastLayerIds='';showLayers(vid.currentTime,true);queueSave();
 }
 function addLayer(){
  const l=defaultLayer(),t=vid.currentTime||0;
  l.start=round(t);l.end=round(t+3);
  if(Number.isFinite(vid.duration)&&vid.duration>0)l.end=Math.max(l.start+.2,Math.min(vid.duration,l.end));
  state.layers.push(l);selectedLayerId=l.id;setPage('layers');renderLayers();queueSave();
 }

 function serverURL(){
  const value=$('transcriptionServerUrl').value.trim().replace(/\/+$/,'');
  if(!value)throw new Error('Uzun videolar için transkripsiyon sunucusu henüz bağlı değil. Önce sunucuyu yayınlayıp HTTPS adresini gir.');
  let url;
  try{url=new URL(value)}catch(_){throw new Error('Sunucu adresi geçerli bir HTTPS adresi olmalı.')}
  const localDev=/^(localhost|127\.0\.0\.1)$/i.test(url.hostname);
  if(url.protocol!=='https:'&&!(localDev&&url.protocol==='http:'))
   throw new Error('Güvenlik için HTTPS kullanan sunucu adresi gir.');
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'&&url.pathname!=='')
   throw new Error('Sunucunun sadece ana adresini gir (örnek: https://substudio.example.com).');
  return url.origin;
 }
 function updateAIMode(){
  const remote=$('aiMode').value==='server';
  $('remoteSetup').hidden=!remote;
  $('aiModel').disabled=remote;
  $('aiSafetyNote').hidden=remote;
  if(remote){
   say('Sunucu modu: 1–10 dakikalık video için hazırlandı. Çalışması için önce sunucu kurulmalı ve bağlantı adresi girilmeli.');
  }else{
   say('Cihaz modu: iPad için 40 saniyelik güvenli sınır geçerlidir. Uzun videoda sunucu modunu seç.');
  }
 }
 async function testServerConnection(){
  try{
   const url=serverURL();
   $('serverConnectionStatus').textContent='Sunucu bağlantısı kontrol ediliyor…';
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),12000);
   try{
    const res=await fetch(url+'/health',{signal:controller.signal,cache:'no-store'});
    const data=await res.json();
    if(!res.ok||data.service!=='substudio-transcription'||!data.ok)
     throw new Error('Sunucu yanıtı beklenen SubStudio sunucusu değil.');
    $('serverConnectionStatus').textContent='✓ Sunucu erişilebilir. '+Math.floor((Number(data.max_seconds)||600)/60)+' dakikaya kadar işleme yapılandırılmış. Erişim kodunu girerek altyazıyı başlat.';
   }finally{clearTimeout(timer)}
  }catch(err){
   $('serverConnectionStatus').textContent='Bağlantı sağlanamadı: '+String(err?.message||err)+' · CORS veya sunucu ayarlarını kontrol et.';
  }
 }
 const PENDING_JOB='substudio-server-job-v07';
 function loadPendingJob(){
  try{
   const data=JSON.parse(sessionStorage.getItem(PENDING_JOB)||'null');
   return data&&data.job&&data.url&&data.file?data:null;
  }catch(_){return null}
 }
 function rememberPendingJob(data){
  try{sessionStorage.setItem(PENDING_JOB,JSON.stringify(data))}catch(_){}
  $('resumeServerJob').hidden=false;
 }
 function forgetPendingJob(){
  try{sessionStorage.removeItem(PENDING_JOB)}catch(_){}
  $('resumeServerJob').hidden=true;
 }
 async function pollServerJob(job,url,accessCode){
  const deadline=Date.now()+12*60*1000;
  while(Date.now()<deadline){
   const res=await fetch(url+'/jobs/'+encodeURIComponent(job),{
    headers:{'X-Studio-Key':accessCode},cache:'no-store'
   });
   const data=await res.json().catch(()=>({}));
   if(!res.ok){
    if(res.status===404)forgetPendingJob();
    throw new Error(typeof data.detail==='string'?data.detail:'Sunucu görev durumu alınamadı: '+res.status);
   }
   if(data.status==='done'){
    if(!Array.isArray(data.result?.words)||!data.result.words.length)
     throw new Error('Sunucu kelime zamanları döndürmedi.');
    const words=data.result.words;
    forgetPendingJob();
    say('✓ Sunucudaki işlem tamamlandı. '+words.length+' kelime/parça geldi.');
    return words;
   }
   if(data.status==='error'){
    forgetPendingJob();
    throw new Error(data.error||'Sunucu AI işlemi başarısız.');
   }
   say('Sunucu işliyor: '+(data.status==='queued'?'Sırada bekliyor':'Konuşma tanınıyor')+'. iPad model çalıştırmıyor.');
   await new Promise(resolve=>setTimeout(resolve,2500));
  }
  throw new Error('Sunucu görevi çok uzadı. İşlem sürüyorsa Sunucudaki altyazı işlemini sürdür düğmesini kullan.');
 }
 async function remoteTranscription(source){
  const url=serverURL();
  const accessCode=$('transcriptionServerKey').value.trim();
  if(accessCode.length<16)throw new Error('Sunucu erişim kodu eksik. Bu bir OpenAI API anahtarı değildir.');
  if(source.size>120*1048576)throw new Error('Bu sunucuda en fazla 120 MB dosya destekleniyor.');
  if(Number.isFinite(vid.duration)&&vid.duration>600)throw new Error('Bu sunucuda en fazla 10 dakikalık video destekleniyor.');
  const form=new FormData();
  form.append('file',source,state.fileName||source.name||'video.mp4');
  form.append('language',$('aiLanguage').value);
  say('Video kendi sunucuna yükleniyor; model iPad belleğinde çalışmayacak…');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),180000);
  let response,data;
  try{
   response=await fetch(url+'/jobs',{
    method:'POST',body:form,signal:controller.signal,headers:{'X-Studio-Key':accessCode}
   });
   data=await response.json().catch(()=>({}));
  }catch(err){
   if(err?.name==='AbortError')throw new Error('Video yükleme zaman aşımı. İnternet veya sunucu bağlantısını kontrol et.');
   throw err;
  }finally{clearTimeout(timeout)}
  if(!response.ok||!data.job_id)
   throw new Error(typeof data.detail==='string'?data.detail:'Sunucu görevi oluşturulamadı: '+response.status);
  rememberPendingJob({job:data.job_id,url,file:state.fileName,created:Date.now()});
  return pollServerJob(data.job_id,url,accessCode);
 }
 async function resumeServerJob(){
  const job=loadPendingJob();
  if(!job){say('Sürdürülecek sunucu görevi bulunamadı.');return}
  const key=$('transcriptionServerKey').value.trim();
  if(key.length<16){say('Önce sunucu erişim kodunu gir.');return}
  if(state.fileName && state.fileName!==job.file){
   say('Bu görev '+job.file+' videosuna ait. Önce doğru projeyi aç.');return;
  }
  const b=$('resumeServerJob');b.disabled=true;
  try{
   const words=await pollServerJob(job.job,job.url,key);
   const result=Timing.createCues(words,{mode:state.density});
   if(!result.length)throw new Error('Zamanlı altyazı bulunamadı.');
   if(state.cues.length&&!confirm('Sunucudan gelen altyazılar mevcut satırların yerini alacak. Devam?'))return;
   state.rawWords=words.map(w=>({...w}));state.cues=result;editCues=false;undoCues=null;
   updateCues();queueSave();await saveNow();setPage('captions');
   say('✓ Sunucu görevi geri alındı, '+result.length+' altyazı kaydedildi.');
  }catch(err){say('Sunucu görevi sürdürülemedi: '+String(err?.message||err))}
  finally{b.disabled=false}
 }
 async function transcribe(){
  if(!mediaBlob){say('Önce Proje bölümünden sesli video yükle.');setPage('project');return}
  if(vid.readyState<1){say('Video henüz hazır değil. Bir kez oynatıp dene.');return}
  const mode=$('aiMode').value;
  const ai=window.SubStudioLocalAI;
  if(mode==='local'){
   if(!ai){say('Cihazdaki AI modülü yüklenemedi, sayfayı yenile.');return}
   try{ai.checkRequest(mediaBlob,vid,$('aiModel').value)}
   catch(err){say('⚠ '+String(err?.message||err)+' 1–2 dakikalık video için Sunucuda seçeneğini kullan.');return}
  }else{
   try{serverURL()}catch(err){say('⚠ '+String(err?.message||err));return}
  }
  const source=mediaBlob,b=$('autoCaption');
  if(b.disabled)return;
  b.disabled=true;b.textContent=mode==='server'?'⌛ Sunucu işliyor…':'⌛ Cihazda analiz ediliyor…';
  try{
   // Saved before starting. Browser crashes cannot be caught by JavaScript.
   const savePromise=Store.saveDraft(snapshot());
   savePromise.then(v=>{if(!v?.ok)setStatus('AI öncesi taslak kaydedilemedi; Yedek indir kullan.','warn')}).catch(()=>{});
   markAI(mode==='server'?'sunucu':'1/3');
   const words=mode==='server'?
    await remoteTranscription(source):
    await ai.transcribe(source,{
     videoElement:vid,
     language:$('aiLanguage').value,
     model:$('aiModel').value,
     onStatus:msg=>{
      say(msg);
      const stage=String(msg).match(/^[123]\/3/)?.[0];
      if(stage){
       let last='';
       try{last=JSON.parse(localStorage.getItem(AI_JOB_KEY)||'null')?.stage}catch(_){}
       if(last!==stage)markAI(stage);
      }
     }
    });
   if(source!==mediaBlob)throw Error('Video değiştirilmiş, AI sonucunu uygulamadım.');
   const result=Timing.createCues(words,{mode:state.density});
   if(!result.length)throw Error('Zamanlı konuşma bulunamadı.');
   if(state.cues.length&&!confirm('Yeni AI altyazıları eski altyazıların yerini alacak. Onaylıyor musun?'))return;
   state.rawWords=words.map(w=>({...w}));state.cues=result;editCues=false;undoCues=null;
   updateCues();queueSave();await saveNow();setPage('captions');
   say('✓ '+result.length+' altyazı oluşturuldu ve kaydedildi. Metni dinleyerek kontrol et.');
  }catch(err){
   say('AI işlemi başarısız: '+String(err?.message||err)+'. Önceki altyazıların korunuyor.');
  }finally{
   finishAI();b.disabled=false;b.textContent='✦ Otomatik altyazı oluştur';
  }
 }
 function refreshExportInfo(){
  const label=state.fileName||'Video yok',duration=Number(vid.duration)||0;
  $('exportDetails').textContent=label+' · '+time(duration)+' · '+state.cues.length+' altyazı · '+state.layers.length+' metin katmanı';
 }
 async function loadSaved(){
  setStatus('Taslak kontrol ediliyor…');
  let saved=null;
  try{saved=await Store.loadDraft()}catch(_){}
  if(saved)state=normalize(saved);
  $('projectName').value=state.name;
  $('captionDensity').value=state.density;
  $('aspectSelect').value=state.aspect;
  $('cueInsertMode').value=state.insertMode;
  $('aiMode').value=state.aiMode;
  updateAIMode();
  syncStyleForm();updateCues();renderLayers();
  let media=null;try{media=await Store.loadMedia()}catch(_){}
  if(media?.blob&&(!state.fileName||media.name===state.fileName)){
   setMedia(media.blob,media.name);
   setMediaStatus('✓ Önceki video cihazdan geri yüklendi.');
  }else if(state.fileName){
   setMediaStatus('⚠ Altyazılar geri yüklendi fakat '+state.fileName+' videosu cihazda bulunamadı. Aynı dosyayı tekrar seç; metinler korunur.');
   $('mediaInfo').textContent='Yeniden yükle: '+state.fileName;
  }else setMediaStatus('Henüz video yüklenmedi.');
  restored=true;
  setStatus(saved?'Önceki taslak geri yüklendi':'Yeni proje hazır','ok');
  if(saved)await saveNow();
  configureAI();
  setPage(location.hash.replace('#','')||'project');
  updatePreview(true);
 }
 function bind(){
  document.querySelectorAll('button[data-page]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));
  $('chooseVideo').addEventListener('click',()=>$('videoInput').click());
  $('videoInput').addEventListener('change',e=>{const f=e.target.files?.[0];e.target.value='';void videoUpload(f)});
  $('projectName').addEventListener('input',e=>{state.name=e.target.value;queueSave()});
  $('aspectSelect').addEventListener('change',e=>{state.aspect=e.target.value;onVideoMetadata();updatePreview(true);queueSave()});
  $('saveProject').addEventListener('click',async()=>{await saveNow();setStatus('Şimdi kaydedildi','ok')});
  $('backupProject').addEventListener('click',saveBackup);
  $('exportProject').addEventListener('click',saveBackup);
  $('importBackup').addEventListener('click',()=>$('backupInput').click());
  $('backupInput').addEventListener('change',async e=>{
   const f=e.target.files?.[0];e.target.value='';if(!f)return;
   try{
    const raw=JSON.parse(await f.text());
    if(raw.version!==6 && !(Array.isArray(raw.cues)&&raw.captionStyle))throw Error('Geçersiz veya desteklenmeyen proje yedeği');
    if(!confirm('Yedek açılacak. Mevcut taslaktaki altyazı/metinler değişecek. Devam?'))return;
    const previousName=state.fileName;
    state=normalize(raw);selectedLayerId=null;undoCues=null;editCues=false;
    $('projectName').value=state.name;$('captionDensity').value=state.density;$('aspectSelect').value=state.aspect;$('cueInsertMode').value=state.insertMode;$('aiMode').value=state.aiMode;updateAIMode();
    if(mediaBlob&&previousName!==state.fileName){setMedia(null);await Store.clearMedia();setMediaStatus('Yedekteki videoyu tekrar yüklemelisin.')}
    syncStyleForm();updateCues();renderLayers();onVideoMetadata();queueSave();await saveNow();
    setStatus('Proje yedeği açıldı','ok');
   }catch(err){setStatus('Yedek açılamadı: '+String(err?.message||err),'warn')}
  });
  $('deleteProject').addEventListener('click',async()=>{
   if(!confirm('Yeni boş proje oluşturulsun mu? Eski yerel taslak silinir. Önce Yedek indir kullan.'))return;
   vid.pause();state=freshState();mediaBlob=null;selectedLayerId=null;undoCues=null;editCues=false;
   if(mediaURL)URL.revokeObjectURL(mediaURL);mediaURL=null;
   await Store.clearAll();setMedia(null);$('projectName').value=state.name;
   $('captionDensity').value=state.density;$('aspectSelect').value=state.aspect;$('cueInsertMode').value=state.insertMode;$('aiMode').value=state.aiMode;updateAIMode();syncStyleForm();updateCues();renderLayers();setMediaStatus('Yeni proje oluşturuldu.');
   queueSave();setPage('project');
  });
  $('autoCaption').addEventListener('click',()=>{void transcribe()});
  $('aiMode').addEventListener('change',e=>{state.aiMode=e.target.value;updateAIMode();queueSave()});
  $('transcriptionServerUrl').addEventListener('change',e=>{
   try{localStorage.setItem('substudio-server-url-v07',e.target.value.trim())}catch(_){}
  });
  $('transcriptionServerKey').addEventListener('change',e=>{
   try{sessionStorage.setItem('substudio-server-key-v07',e.target.value)}catch(_){}
  });
  $('testTranscriptionServer').addEventListener('click',()=>{void testServerConnection()});
  $('resumeServerJob').addEventListener('click',()=>{void resumeServerJob()});
  $('aiModel').addEventListener('change',()=>{
   if(window.SubStudioLocalAI?.isAppleTouch?.() && $('aiModel').value==='accurate'){
    $('aiModel').value='fast';
    say('iPad Safari üzerinde Whisper Base bellek riski nedeniyle kapalı. Güvenli mod (Whisper Tiny) seçildi.');
   }
  });
  $('captionDensity').addEventListener('change',e=>{state.density=e.target.value;queueSave()});
  $('reflowCues').addEventListener('click',reflow);
  $('importSRT').addEventListener('click',()=>$('srtFile').click());
  $('exportSRTCaptions').addEventListener('click',downloadSRT);
  $('srtFile').addEventListener('change',async event=>{
   const file=event.target.files?.[0];event.target.value='';if(!file)return;
   const imported=parseSRT(await file.text());
   if(!imported.length){say('SRT dosyasında geçerli zamanlı satır bulunamadı.','timingStatus');return}
   if(state.cues.length&&!confirm('SRT dosyası mevcut altyazıların yerini alacak. Devam?'))return;
   state.cues=imported;state.rawWords=[];editCues=true;undoCues=null;
   updateCues();queueSave();say('✓ '+imported.length+' SRT satırı içe aktarıldı.','timingStatus');
  });
  $('undoReflow').addEventListener('click',()=>{if(!undoCues)return;state.cues=undoCues;undoCues=null;editCues=true;$('undoReflow').disabled=true;updateCues();queueSave()});
  $('addCue').addEventListener('click',()=>insertCue($('cueInsertMode').value));
  $('cueInsertMode').addEventListener('change',e=>{
   state.insertMode=e.target.value;queueSave();
   $('cueInsertHelp').textContent=e.target.value==='append'
    ?'Yeni satır en son altyazının BİTİŞ zamanından sonra eklenir. Eski satırların arasına girmez.'
    :'Yeni satır oynatma konumundaki boş aralığa eklenir. Mevcut altyazının içine veya başka satırın üstüne girmez.';
  });
  $('toggleTimelinePaste').addEventListener('click',()=>{
   $('timelinePastePanel').hidden=!$('timelinePastePanel').hidden;
  });
  $('cancelTimelinePaste').addEventListener('click',()=>{
   $('timelinePastePanel').hidden=true;
  });
  $('applyTimelinePaste').addEventListener('click',()=>{
   const parsed=Precise.parseTimeline($('timelinePasteText').value,vid.duration);
   if(parsed.errors.length){
    $('timelinePasteStatus').textContent='⚠ '+parsed.errors.slice(0,4).join(' · ');
    return;
   }
   if(!parsed.cues.length){
    $('timelinePasteStatus').textContent='⚠ Saatli metin bulunamadı. Örnek: 00:00.158 – 00:02.518 (alt satırda metin)';
    return;
   }
   if(state.cues.length&&!confirm('Yapıştırdığın liste mevcut altyazıların yerini alacak. Önce Yedek indir ile saklayabilirsin. Devam?'))return;
   state.cues=parsed.cues.map(c=>({id:id(),start:c.start,end:c.end,text:c.text,edited:true}));
   state.rawWords=[];editCues=true;undoCues=null;
   $('undoReflow').disabled=true;
   updateCues();queueSave();
   $('timelinePasteStatus').textContent='✓ '+state.cues.length+' altyazı milisaniyeleri korunarak aktarıldı.';
   $('timelinePastePanel').hidden=true;
   cueMessage('✓ '+state.cues.length+' zamanlı satır eklendi. Saatler 0,001 saniye hassasiyetindedir.');
  });
  function setPlayheadFromInput(){
   if(!mediaBlob){cueMessage('⚠ Önce video yükle.');return}
   const value=Precise.parseClock($('playheadClock').value);
   const duration=Number.isFinite(vid.duration)?vid.duration:Infinity;
   if(value===null||value>duration+.0005){
    cueMessage('⚠ Video zamanı geçersiz. Örnek: 00:05.720');
    $('playheadClock').value=Precise.formatClock(vid.currentTime);
    return;
   }
   vid.pause();vid.currentTime=value;
   $('playheadClock').blur();updatePreview(true);
  }
  $('seekGoTime').addEventListener('click',setPlayheadFromInput);
  $('playheadClock').addEventListener('keydown',event=>{
   if(event.key==='Enter'){event.preventDefault();setPlayheadFromInput()}
  });
  for(const [idName,delta] of [['seekBackFine',-.01],['seekForwardFine',.01]]){
   $(idName).addEventListener('click',()=>{
    if(!mediaBlob){cueMessage('⚠ Önce video yükle.');return}
    const max=Number.isFinite(vid.duration)?vid.duration:Infinity;
    vid.pause();
    vid.currentTime=Precise.roundMs(Math.max(0,Math.min(max,(vid.currentTime||0)+delta)));
    updatePreview(true);
   });
  }
  for(const [key,inputId,kind] of [['font','captionFont','str'],['size','captionSize','num'],['weight','captionWeight','num'],['color','captionColor','str'],['outline','captionOutline','num'],['outlineColor','outlineColor','str'],['bottom','captionBottom','num'],['stretch','captionStretch','num'],['skew','captionSkew','num'],['rotate','captionRotate','num'],['animationSpeed','captionAnimSpeed','num'],['shadow','captionShadow','bool'],['background','captionBackground','bool'],['bgAlpha','bgAlpha','num'],['uppercase','captionUppercase','bool']]){
   $(inputId).addEventListener('input',e=>setStyle(key,kind==='bool'?e.target.checked:kind==='num'?Number(e.target.value):e.target.value));
  }
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{
   state.captionStyle={...state.captionStyle,...presets[b.dataset.preset]};
   syncStyleForm();updatePreview(true);queueSave();
   document.querySelectorAll('[data-preset]').forEach(x=>x.classList.toggle('active',x===b));
  }));
  document.querySelectorAll('[data-animation]').forEach(b=>b.addEventListener('click',()=>setStyle('animation',b.dataset.animation)));
  $('resetStyle').addEventListener('click',()=>{state.captionStyle={...defaultStyle};syncStyleForm();updatePreview(true);queueSave()});
  $('stylePreview').addEventListener('click',()=>{
   if(state.cues.length&&mediaBlob){vid.pause();vid.currentTime=state.cues[0].start+.05;updatePreview(true)}
   else{previewSampleUntil=Date.now()+3000;updatePreview(true);setTimeout(()=>{previewSampleUntil=0;updatePreview(true)},3000)}
  });
  $('addLayer').addEventListener('click',addLayer);
  for(const [key,inputId,kind] of [['text','layerText','str'],['start','layerStart','num'],['end','layerEnd','num'],['font','layerFont','str'],['size','layerSize','num'],['color','layerColor','str'],['outline','layerOutline','num'],['rotate','layerRotate','num'],['stretch','layerStretch','num'],['skew','layerSkew','num'],['x','layerX','num'],['y','layerY','num'],['animation','layerAnimation','str'],['background','layerBackground','bool']]){
   $(inputId).addEventListener('input',e=>{
    changeLayer(key,kind==='bool'?e.target.checked:kind==='num'?Number(e.target.value):e.target.value);
    if(key==='text')renderLayerTitle();
    if(key==='x'||key==='y'||key==='size'||key==='outline'||key==='rotate'||key==='stretch'||key==='skew')$(inputId+'Out').textContent=String(activeLayer()?.[key]||0)+(key==='x'||key==='y'||key==='stretch'?'%':key==='size'||key==='outline'?' px':'°');
   });
  }
  $('duplicateLayer').addEventListener('click',()=>{const l=activeLayer();if(!l)return;const copy={...l,id:id(),x:clamp(l.x+5,6,94),y:clamp(l.y+5,6,94)};state.layers.push(copy);selectedLayerId=copy.id;renderLayers();queueSave()});
  $('deleteLayer').addEventListener('click',()=>{if(!activeLayer())return;state.layers=state.layers.filter(l=>l.id!==selectedLayerId);selectedLayerId=state.layers[0]?.id||null;renderLayers();queueSave()});
  $('playPause').addEventListener('click',()=>{if(!mediaBlob){setPage('project');return}vid.paused?vid.play().catch(err=>say(String(err?.message||err),'mediaSaveStatus')):vid.pause()});
  $('seek').addEventListener('input',e=>{if(mediaBlob){vid.currentTime=Number(e.target.value);updatePreview(true)}});
  $('mute').addEventListener('click',()=>{vid.muted=!vid.muted;$('mute').textContent=vid.muted?'♪̸':'♫'});
  vid.addEventListener('loadedmetadata',onVideoMetadata);
  vid.addEventListener('timeupdate',()=>updatePreview());
  vid.addEventListener('play',()=>updatePreview());
  vid.addEventListener('pause',()=>updatePreview());
  vid.addEventListener('ended',()=>updatePreview(true));
  vid.addEventListener('error',()=>setMediaStatus('Video açılmadı. Safari için MP4/H.264 + AAC kullan.'));
  window.addEventListener('resize',()=>updatePreview(true));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void saveNow()});
  window.addEventListener('pagehide',()=>{void saveNow()});
 }
 function renderLayerTitle(){const el=activeLayer();const card=[...$('layerList').children].find((_,i)=>state.layers[i]?.id===el?.id);if(card)card.querySelector('.layer-name').textContent=el.text.slice(0,95)||'Boş metin'}
 const app={getState:()=>state,getVideo:()=>vid,hasVideo:()=>!!mediaBlob,getFile:()=>mediaBlob,download:download,saveNow:saveNow,downloadSRT:downloadSRT,
   activeLayers:activeLayers, getCueAt:t=>state.cues.find(c=>c.start<=t&&t<c.end),formatTime:time,
   setStatus:(message)=>say(message,'exportStatus'),refreshExportInfo:refreshExportInfo,
   onExportEnd:()=>{updatePreview(true)}};
 window.SubStudioApp=app;
 bind();
 void loadSaved().then(()=>{if(window.SubStudioExporter?.init)window.SubStudioExporter.init(app)}).catch(err=>{
  restored=true;setStatus('Açılış hatası: '+String(err?.message||err),'warn');
  if(window.SubStudioExporter?.init)window.SubStudioExporter.init(app);
 });
})();
