/* 焱 SubStudio 0.8 — millisecond-accurate timeline and safe cue insertion.
   All values are seconds rounded to three decimal places (milliseconds).
   No media is read; this helper can be tested without the editor. */
(function(global){
  'use strict';
  const ms=n=>Math.round(n*1000)/1000;
  const fmtPart=n=>String(n).padStart(2,'0');
  function formatClock(value){
    if(!Number.isFinite(Number(value))) return '00:00.000';
    let millis=Math.max(0,Math.round(Number(value)*1000));
    const hours=Math.floor(millis/3600000);millis%=3600000;
    const minutes=Math.floor(millis/60000);millis%=60000;
    const seconds=Math.floor(millis/1000);millis%=1000;
    return (hours?fmtPart(hours)+':':'')+fmtPart(minutes)+':'+fmtPart(seconds)+'.'+String(millis).padStart(3,'0');
  }
  function parseClock(raw){
    const s=String(raw??'').trim().replace(/\s/g,'');
    if(!s || !/^\d+(?::\d{1,2}){0,2}(?:[.,]\d{1,3})?$/.test(s))return null;
    const parts=s.replace(',','.').split(':');
    const secPart=Number(parts[parts.length-1]);
    if(!Number.isFinite(secPart))return null;
    if(parts.length>=2 && secPart>=60)return null;
    const minPart=parts.length>=2?Number(parts[parts.length-2]):0;
    if(parts.length===3 && minPart>=60)return null;
    const hours=parts.length===3?Number(parts[0]):0;
    const seconds=hours*3600+minPart*60+secPart;
    return Number.isFinite(seconds)&&seconds>=0?ms(seconds):null;
  }
  function validDuration(duration){
    return Number.isFinite(duration)&&duration>.001?duration:null;
  }
  function validateTimes(cues,index,start,end,duration){
    const c=cues[index],previous=cues[index-1],next=cues[index+1];
    const s=ms(Number(start)),e=ms(Number(end));
    if(!Number.isFinite(s)||!Number.isFinite(e)||s<0)return 'Geçersiz zaman: 00:00.158 biçimini kullan.';
    if(e-s<.001)return 'Bitiş başlangıçtan sonra olmalı.';
    if(previous && s < ms(previous.end)-.00001)return 'Başlangıç önceki altyazıyla çakışıyor ('+formatClock(previous.end)+').';
    if(next && e > ms(next.start)+.00001)return 'Bitiş sonraki altyazıyla çakışıyor ('+formatClock(next.start)+').';
    const max=validDuration(duration);
    if(max!==null && e>max+.02)return 'Bitiş video süresini aşıyor ('+formatClock(max)+').';
    if(!c)return 'Altyazı bulunamadı.';
    return null;
  }
  function insertion(cues,mode,playhead,duration){
    const sorted=[...cues].sort((a,b)=>a.start-b.start);
    const max=validDuration(duration);
    if(mode!=='playhead'){
      const last=sorted.at(-1);
      let start=last?ms(last.end+.02):0;
      if(max!==null && start>=max-.05)return {error:'Videonun sonunda yeni altyazı için boş zaman kalmadı. Mevcut satırı düzenle veya videonun daha erken boş bölümüne git.'};
      let end=ms(start+1.8);
      if(max!==null)end=ms(Math.min(end,max));
      if(end-start<.05)return {error:'Yeni satır için yeterli boş zaman yok.'};
      return {start,end,mode:'append'};
    }
    const start=ms(Math.max(0,Number(playhead)||0));
    if(max!==null && start>=max-.05)return {error:'Oynatma konumu videonun sonunda.'};
    const inside=sorted.find(c=>start>=c.start-.00001&&start<c.end-.00001);
    if(inside)return {error:'Bu konumda zaten altyazı var ('+formatClock(inside.start)+' – '+formatClock(inside.end)+'). Başka bir boşluğa git veya ilgili satırı Böl.'};
    const next=sorted.find(c=>c.start>=start-.00001);
    let end=ms(start+1.8);
    if(next)end=Math.min(end,ms(next.start));
    if(max!==null)end=Math.min(end,ms(max));
    if(end-start<.05)return {error:'Burada yeni satır için yeterli boşluk yok. Var olan altyazıların arasındaki boşluğu seç.'};
    return {start,end,mode:'playhead'};
  }
  const timePattern='(\\d{1,3}(?::\\d{1,2}){0,2}[.,]\\d{1,3}|\\d{1,3}:\\d{1,2}(?::\\d{1,2})?)';
  const cueHeader=new RegExp('^\\s*'+timePattern+'\\s*(?:–|—|-->|-)\\s*'+timePattern+'(?:\\s*\\|\\s*(.+))?\\s*$','u');
  function parseTimeline(input, duration){
    const lines=String(input||'').replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n');
    const entries=[],problems=[];
    let active=null;
    function finish(){
      if(!active)return;
      const body=active.lines.join('\n').trim();
      if(!body)problems.push('Satır '+active.line+': Altyazı metni boş.');
      else if(active.end<=active.start)problems.push('Satır '+active.line+': Bitiş başlangıçtan sonra olmalı.');
      else entries.push({start:active.start,end:active.end,text:body});
      active=null;
    }
    for(let i=0;i<lines.length;i++){
      const line=lines[i].trim();
      const match=line.match(cueHeader);
      if(match){
        finish();
        const start=parseClock(match[1]),end=parseClock(match[2]);
        if(start===null||end===null){problems.push('Satır '+(i+1)+': Geçersiz saat.');continue}
        active={start,end,lines:match[3]?[match[3].trim()]:[],line:i+1};
      }else if(active && line){
        // Allow intentional multiple lines within a subtitle.
        active.lines.push(line);
      }else if(!active && line && !/^(Süre|Altyazı metni|Altyazı|Metin|\||-|\d+\.)$/iu.test(line)){
        // Bare text without a timestamp is ignored, but explain it to user.
        if(!/^#+\s*/.test(line))problems.push('Satır '+(i+1)+': Zaman aralığı bulunamadı: '+line.slice(0,45));
      }
    }
    finish();
    const ordered=[...entries].sort((a,b)=>a.start-b.start);
    const max=validDuration(duration);
    for(let i=0;i<ordered.length;i++){
      const cue=ordered[i];
      if(i&&cue.start<ordered[i-1].end-.00001)problems.push(
        'Çakışma: '+formatClock(ordered[i-1].start)+' – '+formatClock(ordered[i-1].end)+
        ' ile '+formatClock(cue.start)+' – '+formatClock(cue.end));
      if(max!==null&&cue.end>max+.02)problems.push(formatClock(cue.end)+' video süresini aşıyor ('+formatClock(max)+').');
    }
    return {cues:ordered,errors:problems};
  }
  global.SubStudioPreciseTime={formatClock,parseClock,validateTimes,insertion,parseTimeline,roundMs:ms};
})(window);
