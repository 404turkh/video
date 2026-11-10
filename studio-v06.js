/* 焱 SubStudio 0.6.1 — Safari low-memory AI guard, recovery & independent text layers */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
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
 function freshState(){return {version:6,name:'Yeni video projesi',aspect:'original',density:'balanced',cues:[],rawWords:[],captionStyle:{...defaultStyle},layers:[],fileName:'',fileSize:0,savedAt:0}}
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
  const ipad=!!ai?.isAppleTouch?.();
  const model=$('aiModel');
  const heavy=model.querySelector('option[value="accurate"]');
  if(heavy)heavy.disabled=ipad;
  if(ipad)model.value='fast';
  const safety=$('aiSafetyNote');
  if(safety)safety.textContent=ipad
    ?'iPad güvenli mod: Whisper Tiny, en fazla 30 saniye / 60 MB. Whisper Base bu cihazda bellek çökmesini önlemek için kapalıdır. Tiny de düşük bellekli cihazlarda kapanabilir.'
    :'Masaüstünde daha doğru Whisper Base seçilebilir. Bu işlem yüksek bellek kullanır. Düzenlemelerini önce yedekle.';
  let pending=null;
  try{pending=JSON.parse(localStorage.getItem(AI_JOB_KEY)||'null')}catch(_){}
  if(pending){
   finishAI();
   if(Date.now()-Number(pending.time||0)<24*3600*1000){
    say('⚠ Önceki AI işlemi '+String(pending.stage||'')+' aşamasında tamamlanmamış. Safari bellek nedeniyle yeniden yüklemiş olabilir. Proje taslağını kontrol et; iPad için Tiny / 30 sn sınırı etkin.');
   }
  }
 }
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number(v)||0));
 const round=n=>Math.round(n*100)/100;
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
  if(name==='style')updateStyleForm();
  try{window.scrollTo({top:0,behavior:'auto'})}catch(_){}
 }
 function onVideoMetadata(){
  state.fileName=state.fileName||mediaBlob?.name||'';
  const duration=Number(vid.duration)||0;
  const width=vid.videoWidth,height=vid.videoHeight;
  const ratio=state.aspect==='original'&&width&&height?width+'/'+height:state.aspect==='original'?'9/16':state.aspect.replace(':','/');
  preview.style.aspectRatio=ratio;
  vid.style.objectFit=state.aspect==='original'?'contain':'cover';
  $('previewInfo').textContent=width&&height?width+'×'+height:'Video';
  $('timeDur').textContent=time(duration);
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
  $('timeCur').textContent=time(t);
  $('seek').value=Number.isFinite(t)?t:0;
  $('playPause').textContent=vid.paused?'▶':'Ⅱ';
 }
 function updateCues(){
  $('cueCount').textContent=state.cues.length+' SATIR';
  const list=$('cueList');list.replaceChildren();
  if(!state.cues.length){list.appendChild(node('div','empty-list','Henüz altyazı yok.'));updatePreview(true);return}
  for(let i=0;i<state.cues.length;i++){
   const c=state.cues[i],row=node('article','cue-card');
   const top=node('div','cue-head'),left=node('span','',('SATIR '+String(i+1).padStart(2,'0'))+(c.estimated?' · TAHMİNİ ZAMAN':''));
   top.append(left,button('× Sil',()=>{state.cues.splice(i,1);editCues=true;updateCues();queueSave()},'ghost'));
   row.appendChild(top);
   const input=node('textarea');input.value=c.text;input.rows=2;input.setAttribute('aria-label','Altyazı '+(i+1));
   input.addEventListener('input',()=>{c.text=input.value;c.edited=true;editCues=true;updatePreview(true);queueSave()});
   row.appendChild(input);
   const times=node('div','cue-times');
   for(const key of ['start','end']){
    const label=node('label','',key==='start'?'BAŞLANGIÇ (sn)':'BİTİŞ (sn)');
    const number=node('input');number.type='number';number.min='0';number.step='.01';number.value=c[key].toFixed(2);
    number.addEventListener('change',()=>{
     const n=Number(number.value),prev=state.cues[i-1],next=state.cues[i+1];
     const lo=key==='start'?(prev?prev.end+.02:0):c.start+.08;
     const hi=key==='start'?c.end-.08:(next?next.start-.02:Infinity);
     if(!Number.isFinite(n)||n<lo-.001||n>hi+.001){number.value=c[key].toFixed(2);say('Geçersiz zaman: altyazılar çakışmamalı.','timingStatus');return}
     c[key]=round(n);c.edited=true;editCues=true;updateCues();queueSave();
    });
    label.appendChild(number);times.appendChild(label);
   }
   row.appendChild(times);
   const actions=node('div','cue-tools');
   const ctl=[
    ['◀ 0,1 sn','back'],['0,1 sn ▶','forward'],['✂ Böl','split'],
    ['⇄ Birleştir','merge'],['Baş −0,1','startEarlier'],['Bitiş +0,1','endLater']
   ];
   for(const [label,action] of ctl){
    const el=button(label,()=>{adjustCue(c.id,action)},'');
    if(action==='merge'&&i===state.cues.length-1)el.disabled=true;
    actions.appendChild(el);
   }
   row.appendChild(actions);
   row.addEventListener('click',e=>{
    if(e.target.closest('input,textarea,button'))return;
    if(mediaBlob){vid.currentTime=c.start;updatePreview(true)}
   });
   list.appendChild(row);
  }
  updatePreview(true);
 }
 function adjustCue(itemId,action){
  const i=state.cues.findIndex(c=>c.id===itemId);if(i<0)return;
  const c=state.cues[i],prev=state.cues[i-1],next=state.cues[i+1];
  const lo=prev?prev.end+.025:0,hi=next?next.start-.025:(Number.isFinite(vid.duration)?Math.max(vid.duration,c.end):c.end+10);
  if(action==='split'){
   const pieces=Timing.splitCue(c);
   if(!pieces){say('Satır bölünemedi: en az iki kelime gerekli.','timingStatus');return}
   state.cues.splice(i,1,...pieces);
  }else if(action==='merge'){
   if(!next)return;
   state.cues.splice(i,2,Timing.mergeCues(c,next));
  }else if(action==='back'||action==='forward'){
   const shift=action==='back'?-0.1:0.1,delta=Math.max(lo-c.start,Math.min(shift,hi-c.end));
   if(Math.abs(delta)<.005)return;
   c.start=round(c.start+delta);c.end=round(c.end+delta);c.edited=true;
  }else if(action==='startEarlier'){c.start=round(Math.max(lo,c.start-.1));c.edited=true}
  else if(action==='endLater'){c.end=round(Math.min(hi,c.end+.1));c.edited=true}
  editCues=true;state.cues.sort((x,y)=>x.start-y.start);
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
 async function transcribe(){
  if(!mediaBlob){say('Önce Proje bölümünden sesli video yükle.');setPage('project');return}
  const ai=window.SubStudioLocalAI;
  if(!ai){say('AI modülü yüklenemedi, sayfayı yenile.');return}
  if(vid.readyState<1){say('Video henüz açılmadı, bir kez oynatıp dene.');return}
  const source=mediaBlob, selectedModel=$('aiModel').value;
  try{ai.checkRequest(source,vid,selectedModel)}
  catch(err){say('⚠ '+String(err?.message||err));return}
  const b=$('autoCaption');
  if(b.disabled)return;
  b.disabled=true;b.textContent='⌛ Ses analiz ediliyor…';
  try{
   // Call the localStorage-backed draft save SYNCHRONOUSLY on tap, before any await.
   // Awaiting IndexedDB here could lose the Safari user activation required for video.play().
   const savePromise=Store.saveDraft(snapshot());
   savePromise.then(result=>{
    if(!result?.ok) setStatus('AI başlamadan önce taslak kaydedilemedi; Yedek indir kullan.','warn');
   }).catch(()=>{setStatus('Taslak kaydı başarısız; Yedek indir kullan.','warn')});
   markAI('1/3');
   const words=await ai.transcribe(source,{
    videoElement:vid,
    language:$('aiLanguage').value,
    model:selectedModel,
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
   if(source!==mediaBlob)throw Error('Video değiştirildi. AI sonucunu uygulamadım.');
   const result=Timing.createCues(words,{mode:state.density});
   if(!result.length)throw Error('Zamanlı konuşma bulunamadı.');
   if(state.cues.length&&!confirm('Yeni AI altyazıları eski altyazıların yerini alacak. Onaylıyor musun?'))return;
   state.rawWords=words.map(w=>({...w}));state.cues=result;editCues=false;undoCues=null;
   updateCues();queueSave();await saveNow();setPage('captions');
   say('✓ '+result.length+' altyazı oluşturuldu. Proje taslağı kaydedildi; önemli projelerde Yedek indir kullan.');
  }catch(err){
   say('AI işlemi durdu: '+String(err?.message||err)+' Düzenlemelerin saklıdır.');
  }finally{
   finishAI();
   b.disabled=false;b.textContent='✦ Otomatik altyazı oluştur';
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
    $('projectName').value=state.name;$('captionDensity').value=state.density;$('aspectSelect').value=state.aspect;
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
   $('captionDensity').value=state.density;$('aspectSelect').value=state.aspect;syncStyleForm();updateCues();renderLayers();setMediaStatus('Yeni proje oluşturuldu.');
   queueSave();setPage('project');
  });
  $('autoCaption').addEventListener('click',()=>{void transcribe()});
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
  $('addCue').addEventListener('click',()=>{
   const t=round(vid.currentTime||0);
   let start=t;for(const c of state.cues){if(c.start<=start&&c.end>start)start=round(c.end+.04)}
   const end=round(Math.max(start+.4,Math.min(Number(vid.duration)||start+2,start+2)));
   state.cues.push({id:id(),text:'Yeni altyazı',start,end,edited:true});
   state.cues.sort((a,b)=>a.start-b.start);editCues=true;updateCues();queueSave();
  });
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
