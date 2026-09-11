// node tools/piano-level-check.mjs [--json]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {repertoire,loadPianoSong} from './piano-data.mjs';
import {pianoBalance,applyPianoBalance} from '../public/piano/loudness.js';
import {SfzInstrument} from '../public/js/sampler.js';
import {createMixGraph} from '../public/js/mix.js';
// Record the actual mix factory's connections and gains. These checks cover
// both its live and offline use; they do not claim a Web Audio sound measurement.
class Node {
  constructor(value){this.value=value;this.volume={value};this.width={value};}
  connect(to){this.destination=to;return this;}
  chain(...nodes){let from=this;for(const to of nodes){from.connect(to);from=to;}return this;}
  set(params){this.params=params;}dispose(){}
}
const context={sampleRate:8000,createBuffer(ch,n,sr){const data=Array.from({length:ch},()=>new Float32Array(n));return {sampleRate:sr,length:n,numberOfChannels:ch,getChannelData:i=>data[i]};}};
globalThis.Tone={getDestination:()=>({}),getContext:()=>({rawContext:context}),Limiter:Node,Volume:Node,Compressor:Node,StereoWidener:Node,Gain:Node,Meter:Node,Convolver:Node,ToneAudioBuffer:Node,Filter:Node};
const ordinary=createMixGraph({volume:-4}),piano=createMixGraph({volume:-4,pianoGainDb:6});
assert.equal(ordinary.volume.volume.value,-4,'Band and Studio default unchanged');
assert.equal(piano.volume.volume.value,2,'Piano makeup after compressor');
assert.equal(piano.glue.destination,piano.volume);assert.equal(piano.volume.destination,piano.limiter);
piano.setMasterVolume(-12);assert.equal(piano.volume.volume.value,-6,'Volume control keeps fixed makeup');
ordinary.dispose();piano.dispose();delete globalThis.Tone;
const table=JSON.parse(fs.readFileSync(new URL('../public/piano/sample-energy.json',import.meta.url),'utf8'));
const index=JSON.parse(fs.readFileSync(new URL('../public/samples/piano/index.json',import.meta.url),'utf8'));
const inst=new SfzInstrument('',index),region=inst.select(60,62)[0];
assert.equal(inst.velGain(region,62),1-region.vt+region.vt*(62/127)**2);
assert.equal(inst.velGain(region,62,.35),.65+.35*(62/127)**2);
assert.ok(inst.velGain(region,25,.35)<inst.velGain(region,100,.35));
const reports=repertoire.map(item=>{
  const song=loadPianoSong(item),score=JSON.stringify([song.tracks[0].notes,song.pedal]);
  const report=applyPianoBalance(song,table);
  assert.equal(JSON.stringify([song.tracks[0].notes,song.pedal]),score);
  const gain=song.master.pianoGainDb;song.master.volume=-20;
  assert.equal(pianoBalance(song,table).gainDb,gain,'Song balance never cancels the volume knob');
  assert.ok(report.gainDb>=0&&report.gainDb<=15);
  return {file:item.file,title:item.title,...report};
});
if(process.argv.includes('--json'))console.log(JSON.stringify({calibration:table.calibration,reports},null,2));
else console.table(reports.map(r=>({file:r.file,trim:r.gainDb,before:r.predictedBeforeDb.toFixed(1),after:r.predictedMedianDb.toFixed(1),top:r.predictedTopDb.toFixed(1)})));
