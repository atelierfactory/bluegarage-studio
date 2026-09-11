// Usage: node tools/band-check.mjs [--json]
import fs from 'node:fs';
import { analyzeBand } from '../public/band/critic.js';
import { validateBandSong, partsFromSong } from '../public/band/model.js';
import { beatToSec } from '../public/js/state.js';
const dir=new URL('../public/band/repertoire/',import.meta.url);
const list=JSON.parse(fs.readFileSync(new URL('index.json',dir),'utf8'));
const reports=[]; let failed=list.length<3;
const files=new Set();
for(const item of list) {
  const report={file:item.file,title:item.title,composer:item.composer,candidate:item.candidate===true,errors:[],advisories:[]};
  const target=message=>(report.candidate?report.advisories:report.errors).push(message);
  try {
    if(!/^[a-z0-9-]+\.band\.json$/.test(item.file)||files.has(item.file)) throw Error('Invalid/duplicate filename'); files.add(item.file);
    if(!['GPT-6 Astra','Claude Fable 5.1'].includes(item.composer)||!item.license?.includes('オリジナル')) report.errors.push('Composer/license metadata');
    if(item.candidate!==undefined&&typeof item.candidate!=='boolean')report.errors.push('candidate must be boolean');
    const data=JSON.parse(fs.readFileSync(new URL(item.file,dir),'utf8'));
    report.errors.push(...validateBandSong(data.song));
    if(!report.errors.length) {
      const song=data.song, bars=song.sections.reduce((n,s)=>n+s.bars,0), parts=partsFromSong(song);
      const a=analyzeBand(parts,{song,range:{startBar:0,bars}});
      Object.assign(report,{bars,seconds:+beatToSec(bars*song.timeSig,song).toFixed(3),notes:a.stats.count,synth:a.stats.synth,pedal:a.stats.pedal,drums:a.stats.drums,kick:a.stats.kick,knobs:a.stats.knobs,fixes:a.stats.fixes,issues:a.issues});
      // Catch even normalization changes that the critic might not report.
      const fields={synth:['p','s','d','v','f'],pedal:['p','s','d','v'],drums:['k','s','v'],kick:['s','v'],knobs:['param','s','d','to']};
      report.changed=0;
      for(const [part,keys] of Object.entries(fields)) {
        const canon=arr=>arr.map(n=>JSON.stringify(keys.map(k=>n[k]))).sort();
        const input=canon(parts[part]),output=canon(a[part]);
        report.changed+=Math.max(input.length,output.length)-input.filter((x,i)=>x===output[i]).length;
      }
      if(report.seconds<90||report.seconds>180) target('Duration outside 90–180 seconds');
      const pitches=parts.synth.map(n=>n.p),onsets=[...new Set(parts.synth.map(n=>n.s))].sort((a,b)=>a-b);
      report.timeSig=song.timeSig;report.shortestOnset=Math.min(...onsets.slice(1).map((t,i)=>+(t-onsets[i]).toFixed(4)));report.peakKeysPerBar=Math.max(...Array.from({length:bars},(_,b)=>parts.synth.filter(n=>Math.floor(n.s/song.timeSig)===b).length));
      Object.assign(report,{keysPerBar:+(parts.synth.length/bars).toFixed(2),keyRange:[Math.min(...pitches),Math.max(...pitches)],shortest:Math.min(...parts.synth.map(n=>n.d)),crashes:parts.drums.filter(n=>n.k==='cr').length,pedalKickCoincidence:+(100*parts.pedal.filter(p=>parts.kick.some(k=>Math.abs(k.s-p.s)<1e-4)).length/parts.pedal.length).toFixed(1)});
      const patch=song.tracks.find(t=>t.role==='keys').synth2;
      if(parts.knobs.some(e=>e.param==='lfoDepth'||e.param==='lfoRate')&&patch.lfo1.target==='none')report.errors.push('LFO gesture has no audible destination');
      if(report.knobs<10) target('Fewer than 10 knob gestures');
      if(report.crashes<30) target('Fewer than 30 crash accents');
      if(report.keyRange[1]-report.keyRange[0]<24) target('Right hand uses less than two octaves');
      if(report.keysPerBar<12) target('Right hand average below 12 notes per bar');
      if(report.shortest>.25) target('No sixteenth-note passage');
      if(report.pedalKickCoincidence>40) target('Bass duplicates kick more than 40%');
      if(item.title!==song.title||item.bars!==bars||item.tempo!==song.tempo) report.errors.push('Index mismatch');
      if(report.changed||a.stats.fixes.length||a.issues.length) failed=true;
    }
  } catch(e) { report.errors.push(e.message); }
  if(report.errors.length) failed=true;
  reports.push(report);
}
if(process.argv.includes('--json')) console.log(JSON.stringify(reports,null,2));
else {
  console.table(reports.map(r=>({file:r.file,candidate:r.candidate,meter:r.timeSig,seconds:r.seconds,notes:r.notes,keys:r.synth,pedal:r.pedal,drums:r.drums,kick:r.kick,knobs:r.knobs,crashes:r.crashes,keysPerBar:r.keysPerBar,range:r.keyRange?.join("–"),shortest:r.shortest,bassKickPct:r.pedalKickCoincidence,changed:r.changed,fixes:r.fixes?.length,issues:r.issues?.length,errors:r.errors.length,advisories:r.advisories.length})));
  for(const r of reports) for(const message of [...r.errors,...r.fixes??[],...r.issues??[]]) console.log(`${r.file}: ${message}`);
  for(const r of reports)for(const message of r.advisories)console.log(`${r.file}: candidate / ${message}`);
  console.log(`${failed?'FAIL':'PASS'}: ${reports.length} scores; ${reports.reduce((n,r)=>n+(r.notes??0),0)} notes; ${reports.reduce((n,r)=>n+(r.knobs??0),0)} gestures`);
}
process.exitCode=failed?1:0;
