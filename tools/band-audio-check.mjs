// Full-length synth dry-signal render; no browser, no FX/drum substitute.
import fs from 'node:fs';
import { SynthCore } from '../public/js/synthcore.js';
import { knobDefaults } from '../public/js/synth2.js';
import { knobStateAt } from '../public/js/synth-automation.js';
import { beatToSec, secToBeat } from '../public/js/state.js';
const dir=new URL('../public/band/repertoire/',import.meta.url);
const index=JSON.parse(fs.readFileSync(new URL('index.json',dir),'utf8'));
const rows=[]; const rate=48000,block=128;let failed=false;
for(const item of index) {
  const {song}=JSON.parse(fs.readFileSync(new URL(item.file,dir),'utf8'));
  for(const track of song.tracks.filter(t=>t.synth2)) {
    const core=new SynthCore(rate);core.setPatch(track.synth2);core.setTempo(song.tempo);
    const defaults=knobDefaults(track.synth2), toSec=b=>beatToSec(b,song);
    const duration=toSec(item.bars*song.timeSig)+track.synth2.ampEnv.r*3+1;
    const events=track.notes.flatMap(n=>[{at:Math.round(toSec(n.s)*rate),on:true,n},{at:Math.round(toSec(n.s+n.d)*rate),on:false,n}]).sort((a,b)=>a.at-b.at||Number(a.on)-Number(b.on));
    const L=new Float32Array(block),R=new Float32Array(block);let ei=0,bad=0,peak=0,sum=0,samples=0,maxVoices=0,nonSilent=0;
    const start=performance.now();
    for(let pos=0;pos<duration*rate;pos+=block) {
      const beat=secToBeat(pos/rate,song);
      for(const [id,v] of Object.entries(knobStateAt(defaults,track.knobs??[],beat,toSec)))core.setKnob(id,v);
      while(ei<events.length&&events[ei].at<pos+block){const e=events[ei++],off=Math.max(0,e.at-pos);if(e.on)core.noteOn(e.n.p,e.n.v,off);else core.noteOff(e.n.p,off);}
      core.process(L,R,block);maxVoices=Math.max(maxVoices,core.activeCount());
      for(let i=0;i<block;i++){if(!Number.isFinite(L[i])||!Number.isFinite(R[i]))bad++;peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));sum+=L[i]*L[i]+R[i]*R[i];if(Math.abs(L[i])+Math.abs(R[i])>1e-6)nonSilent++;}samples+=block;
    }
    const held=core.voices.filter(v=>v.state!==0).length;
    const ok=!bad&&peak<.99&&nonSilent>0&&held===0;
    if(!ok)failed=true;
    rows.push({song:item.title,part:track.role,notes:track.notes.length,peakDb:+(20*Math.log10(peak)).toFixed(1),rmsDb:+(10*Math.log10(sum/(samples*2))).toFixed(1),beforeFxDb:+(10*Math.log10(sum/(samples*2))+track.synth2.level+track.volume).toFixed(1),bad,voicesAtEnd:held,maxVoices,seconds:+duration.toFixed(1),cpuMs:Math.round(performance.now()-start),ok});
  }
}
for(const item of index){const pair=rows.filter(r=>r.song===item.title);if(Math.abs(pair[0].beforeFxDb-pair[1].beforeFxDb)>6)failed=true;}
const drums=JSON.parse(fs.readFileSync(new URL('../public/samples/drums/index.json',import.meta.url),'utf8'));
const usedKeys=new Set([36,38,54,48,45,41,49]);const usedSamples=new Set(drums.regions.filter(r=>r.s>=0&&[...usedKeys].some(k=>k>=r.k[0]&&k<=r.k[1])).map(r=>r.s));
for(const i of usedSamples)if(!fs.existsSync(new URL(`../public/samples/drums/${drums.samples[i].f}`,import.meta.url)))failed=true;
console.log(`Drum assets present: ${usedSamples.size}`);
console.table(rows);console.log(`${failed?'FAIL':'PASS'}: ${rows.length} full synth parts, dry signal only; browser must verify drums/FX/mix and listening quality`);process.exitCode=failed?1:0;
