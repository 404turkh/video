const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const win = {};
vm.runInNewContext(fs.readFileSync('studio-v08-timing.js','utf8'), {window:win});
const times = win.SubStudioPreciseTime;

const sample = [
'00:00.158 – 00:02.518','Bismillahirrahmânirrahîm.','',
'00:03.738 – 00:05.720','Hamd, âlemlerin Rabbi,','',
'00:05.720 – 00:08.100','Rahmân, Rahîm,','',
'00:08.100 – 00:10.450','hesap ve ceza gününün','',
'00:10.450 – 00:13.558','(ahiret gününün) mâliki Allah’a mahsustur.','',
'00:14.738 – 00:17.570','Allah’ım, yalnız sana ibadet ederiz','',
'00:17.570 – 00:20.578','ve yalnız senden yardım dileriz.','',
'00:21.398 – 00:23.450','Bizi doğru yola,','',
'00:23.450 – 00:25.758','kendilerine nimet verdiklerinin yoluna ilet;','',
'00:26.718 – 00:28.450','gazaba uğrayanlarınkine','',
'00:28.450 – 00:30.137','ve sapıklarınkine değil.'
].join('\n');

const converted = times.parseTimeline(sample,31);
assert.equal(converted.errors.length,0,converted.errors.join(' / '));
assert.equal(converted.cues.length,11);
assert.equal(converted.cues[0].start,0.158);
assert.equal(converted.cues[0].end,2.518);
assert.equal(converted.cues[10].start,28.45);
assert.equal(converted.cues[10].end,30.137);
assert.equal(converted.cues[0].text,'Bismillahirrahmânirrahîm.');
assert.equal(converted.cues[4].text,'(ahiret gününün) mâliki Allah’a mahsustur.');
assert.equal(times.formatClock(.158),'00:00.158');
assert.equal(times.formatClock(2.518),'00:02.518');
assert.equal(times.formatClock(3600.158),'01:00:00.158');
assert.equal(times.parseClock('00:02.518'),2.518);
assert.equal(times.parseClock('00:02,518'),2.518);
assert.equal(times.parseClock('02.518'),2.518);
assert.equal(times.parseClock('garbled'),null);
assert.equal(times.parseClock('00:99.000'),null);
assert.equal(times.validateTimes(converted.cues,2,5.720,8.100,31),null);
assert.match(times.validateTimes(converted.cues,2,5.719,8.100,31),/çakışıyor/);
assert.match(times.validateTimes(converted.cues,2,5.720,8.101,31),/çakışıyor/);
const append=times.insertion(converted.cues,'append',1,31);
assert.equal(append.start,30.157);
assert.ok(append.end<=31);
assert.match(times.insertion(converted.cues,'playhead',1,31).error,/altyazı var/);
const emptyGap=times.insertion(converted.cues,'playhead',2.55,31);
assert.equal(emptyGap.start,2.55);
assert.ok(emptyGap.end<=3.738);
const problematic=times.parseTimeline('00:00.158 – 00:02.518\nA\n\n00:02.500 – 00:03.000\nB',31);
assert.ok(problematic.errors.some(x=>x.includes('Çakışma')));
const invalid=times.parseTimeline('00:00.158 – 00:32.000\nA',31);
assert.ok(invalid.errors.some(x=>x.includes('süresini aşıyor')));
console.log('SubStudio precision regression tests PASS (11 captions, 1ms, insert, overlap, formatting).');
