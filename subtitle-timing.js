/* 焱 SubStudio 0.5 — konuşma zamanlı altyazı düzenleyicisi.
   Kelime zamanlarını korur, sessizlik/cümle sınırlarında böler.
   Transkripsiyon doğruluğunu iddia etmez; segment içi zamanlar tahminidir. */
(() => {
  'use strict';

  const PROFILES = Object.freeze({
    short:    { maxChars: 25, maxDuration: 2.1, maxWords: 5, lines: 1, lineChars: 25, pause: .32 },
    balanced: { maxChars: 40, maxDuration: 3.1, maxWords: 7, lines: 2, lineChars: 24, pause: .37 },
    long:     { maxChars: 58, maxDuration: 4.3, maxWords: 10, lines: 2, lineChars: 32, pause: .45 }
  });

  function newId() {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'cue-' + Math.random().toString(36).slice(2);
  }
  function round(n) { return Math.round(n * 1000) / 1000; }

  function sanitizeWords(input) {
    if (!Array.isArray(input)) return [];
    const result = [];
    for (const source of input) {
      const start = Number(source?.start), end = Number(source?.end);
      const text = String(source?.word ?? source?.text ?? '').trim();
      if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const units = text.match(/\S+/gu) || [];
      if (!units.length) continue;
      const estimated = Boolean(source.estimated) || units.length > 1;
      const totalWeight = units.reduce((sum, unit) => sum + Math.max(1, unit.length), 0);
      let used = 0;
      for (const unit of units) {
        const weight = Math.max(1, unit.length);
        const unitStart = Math.max(0, start + (end - start) * (used / totalWeight));
        used += weight;
        const unitEnd = Math.max(unitStart + .001, start + (end - start) * (used / totalWeight));
        result.push({word: unit, start: round(unitStart), end: round(unitEnd), estimated});
      }
    }
    return result.sort((a,b) => a.start - b.start || a.end - b.end);
  }

  function joinWords(words) {
    return words.map((w,i) => {
      const token = w.word;
      if (!i || /^[,.!?;:%)\]}»”’؟،…]/u.test(token)) return token;
      return ' ' + token;
    }).join('').replace(/\s+([,.!?;:%؟،…])/gu, '$1').trim();
  }

  function twoLines(text, profile) {
    if (profile.lines < 2 || text.length <= profile.lineChars) return text;
    const spaces = [...text.matchAll(/ /g)].map(match => match.index);
    let best = null, score = Infinity;
    for (const index of spaces) {
      const a = text.slice(0,index), b = text.slice(index+1);
      if (a.length > profile.lineChars || b.length > profile.lineChars) continue;
      const cost = Math.abs(a.length - b.length);
      if (cost < score) { score=cost; best=index; }
    }
    return best===null ? text : text.slice(0,best) + '\n' + text.slice(best+1);
  }

  function profileFor(mode) { return PROFILES[mode] || PROFILES.balanced; }

  function createCues(raw, options={}) {
    const mode = typeof options === 'string' ? options : options.mode;
    const profile = profileFor(mode);
    const words = sanitizeWords(raw);
    if (!words.length) return [];
    const groups = [];
    let current = [];
    const flush=()=>{if(current.length){groups.push(current);current=[];}};

    for (const word of words) {
      if (current.length) {
        const last = current[current.length-1];
        const gap = word.start - last.end;
        const candidate = joinWords([...current, word]);
        const fullStop = /[.!?…؟][”’"']?$/u.test(last.word);
        const tooLong = candidate.length > profile.maxChars ||
          word.end-current[0].start > profile.maxDuration ||
          current.length >= profile.maxWords;
        const pause = gap >= profile.pause && (current.length >= 2 || joinWords(current).length >= 11);
        if (tooLong || pause || fullStop) flush();
      }
      current.push(word);
    }
    flush();

    // Tiny fragments can be joined into a neighboring phrase only when both
    // its duration and text fit. This never shifts the actual spoken words.
    let changed=true;
    while(changed) {
      changed=false;
      for(let i=0;i<groups.length-1;i++) {
        const left=groups[i], right=groups[i+1];
        const leftText=joinWords(left), rightText=joinWords(right);
        const leftDuration=left[left.length-1].end-left[0].start;
        const rightDuration=right[right.length-1].end-right[0].start;
        const gap=right[0].start-left[left.length-1].end;
        const combined=[...left,...right];
        if((leftText.length<9 || leftDuration<.55 || rightText.length<8 || rightDuration<.45) &&
           gap<=.23 && gap>=-.08 &&
           joinWords(combined).length<=profile.maxChars &&
           combined.length<=profile.maxWords &&
           combined[combined.length-1].end-combined[0].start<=profile.maxDuration &&
           !/[.!?…؟]$/u.test(leftText)) {
          groups.splice(i,2,combined);
          changed=true;break;
        }
      }
    }

    let previousEnd = 0;
    return groups.map((group,i) => {
      const first=group[0],last=group[group.length-1];
      const next=groups[i+1]?.[0];
      let start=Math.max(0,first.start-.045);
      if(i>0) start=Math.max(start,previousEnd+.025);
      let end=last.end+.095;
      if(next) end=Math.min(end,next.start-.025);
      if(end<=start+.08) end=Math.max(start+.09,last.end);
      previousEnd=end;
      return {
        id:newId(), start:round(start),end:round(end),
        text:twoLines(joinWords(group),profile),
        words:group.map(w=>({...w})),
        estimated:group.some(w=>w.estimated),
        source:'ai'
      };
    });
  }

  function splitCue(cue) {
    const source=Array.isArray(cue.words)&&cue.words.length>=2 && !cue.edited
      ? cue.words
      : sanitizeWords([{word:String(cue.text).replace(/\s+/g,' '),start:cue.start,end:cue.end,estimated:true}]);
    if(source.length<2) return null;
    let split=1, best=Infinity;
    for(let k=1;k<source.length;k++){
      const a=joinWords(source.slice(0,k));
      const b=joinWords(source.slice(k));
      const score=Math.abs(a.length-b.length);
      if(score<best){best=score;split=k}
    }
    const lhs=source.slice(0,split),rhs=source.slice(split);
    const boundary=Math.min(cue.end-.08,Math.max(cue.start+.08,
      (lhs[lhs.length-1].end+rhs[0].start)/2));
    if(boundary<=cue.start+.06||boundary>=cue.end-.06)return null;
    return [
      {id:newId(),start:cue.start,end:round(boundary),text:joinWords(lhs),words:lhs,
       estimated:lhs.some(w=>w.estimated),source:cue.source||'manual'},
      {id:newId(),start:round(boundary+.015),end:cue.end,text:joinWords(rhs),words:rhs,
       estimated:rhs.some(w=>w.estimated),source:cue.source||'manual'}
    ];
  }

  function mergeCues(a,b) {
    return {id:newId(),start:Math.min(a.start,b.start),end:Math.max(a.end,b.end),
      text:String(a.text).trim()+' '+String(b.text).trim(),
      words:Array.isArray(a.words)&&Array.isArray(b.words)&&!a.edited&&!b.edited
        ? [...a.words,...b.words]:undefined,
      edited:Boolean(a.edited||b.edited),estimated:Boolean(a.estimated||b.estimated),
      source:a.source||b.source||'manual'};
  }

  function approximateWordsFromCues(cues) {
    return cues.flatMap(cue=>sanitizeWords([{
      word:String(cue.text||'').replace(/\s+/g,' '),start:cue.start,end:cue.end,estimated:true
    }]));
  }

  window.SubStudioTiming = { createCues, splitCue, mergeCues, approximateWordsFromCues, joinWords, profiles:PROFILES };
})();
