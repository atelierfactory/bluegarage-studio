// Scheduling/stop/race regressions. Actual audio.js, synthetic Tone clock/engines.
// node --experimental-vm-modules tools/band-regression.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as S from '../public/js/state.js';
import * as automation from '../public/js/synth-automation.js';
import * as synth2 from '../public/js/synth2.js';
import * as drumBalance from '../public/js/drum-balance.js';
import { validateBandSong, partsFromSong } from '../public/band/model.js';
import { analyzeBand } from '../public/band/critic.js';
let checks=0; const check=(value,msg)=>{assert.ok(value,msg);checks++;};
const close=(a,b,msg)=>check(Math.abs(a-b)<1e-7,`${msg}: ${a} vs ${b}`);
const songs=JSON.parse(fs.readFileSync(new URL('../public/band/repertoire/index.json',import.meta.url),'utf8')).map(item=>JSON.parse(fs.readFileSync(new URL(`../public/band/repertoire/${item.file}`,import.meta.url),'utf8')).song);
for(const bad of [null,{}, {sections:3}, {...songs[0],tracks:[null,null,null]}, {...songs[0],tempo:NaN}, {...songs[0],tempoMap:[null]}])check(validateBandSong(bad).length>0,'Malformed input rejected');
for(const song of songs) {
  const p=partsFromSong(song),k=p.knobs[0],defaults=synth2.knobDefaults(song.tracks[0].synth2),toSec=b=>S.beatToSec(b,song);
  close(automation.knobStateAt(defaults,p.knobs,k.s+k.d/2,toSec)[k.param],(defaults[k.param]+k.to)/2,'Midpoint');
  close(automation.knobStateAt(defaults,p.knobs,0,toSec)[k.param],defaults[k.param],'Rewind defaults');
}
const tooFast=structuredClone(songs[0]);tooFast.tempo=300;
check(analyzeBand(partsFromSong(tooFast),{song:tooFast,range:{bars:64}}).stats.fixes.length>0,'Excess tempo caught');
// Actual processor bundle: stop must discard ALL previously scheduled notes/offs.
let Processor;
const workletContext=vm.createContext({sampleRate:48000,currentTime:0,AudioWorkletProcessor:class{constructor(){this.port={};}},registerProcessor(name,C){Processor=C;}});
vm.runInContext(fs.readFileSync(new URL('../public/js/worklet/synth2-processor.bundle.js',import.meta.url),'utf8'),workletContext);
const processor=new Processor();processor.onMessage({type:'noteOn',p:60,t:.1,dur:2});processor.onMessage({type:'allOff',t:0});
check(processor.queue.length===1&&processor.queue[0].kind===2,'Panic clears future note and release');
processor.onMessage({type:'noteOn',p:64,t:0,dur:.02});
processor.process([],[[new Float32Array(128),new Float32Array(128)]],{});
check(processor.core.activeCount()===1,'Replay after panic remains audible');
processor.onMessage({type:'dispose'});
check(processor.process([],[[new Float32Array(128)]],{})===false,'Disposed worklet terminates');

const parts=[],insts=[],raw={currentTime:10};
class Part { constructor(cb,events){this.cb=cb;this.events=events;this.disposed=false;parts.push(this);}start(){return this;}dispose(){this.disposed=true;} }
let startBlock=null;
const Transport={bpm:{value:120},seconds:0,start(){this.started=true;},stop(){this.started=false;this.seconds=0;},cancel(){}};
const Tone={Part,Transport,getContext:()=>({rawContext:raw}),start:async()=>{if(startBlock)await startBlock;},connect(){},now:()=>raw.currentTime};
let createBlock=null;
const makeInst=async(patch)=>{
  if(createBlock)await createBlock;
  const inst={patch,calls:[],outs:[{}],setKnob(...a){this.calls.push(['knob',...a]);},setTempo(...a){this.calls.push(['tempo',...a]);},trigger(...a){this.calls.push(['note',...a]);},panic(...a){this.calls.push(['panic',...a]);},dispose(){inst.disposed=true;}};
  insts.push(inst);return inst;
};
const sfz={label:'test piano',regions:[],createOutput(){return {};},noteOn(...a){this.calls.push(a);},calls:[],preload:async()=>{},resetCounters(){},allNotesOff(){},ensure:async()=>{}};
const deps={
  './state.js':S,'./drum-balance.js':drumBalance,
  './sampler.js':{SfzInstrument:{load:async()=>sfz},sampleCacheStats:()=>({files:0})},
  './synth.js':{createSynth(){throw Error('Unexpected synth1');},presetFor:()=>({}),normalizePatch:p=>p},
  './synth2.js':{createSynth2:makeInst,knobDefaults:synth2.knobDefaults},
  './synth-automation.js':automation,
  './mix.js':{createMixGraph:()=>({update(){},dispose(){}}),createTrackChain:()=>({input:{},update(){},dispose(){}})},
  './loudness.js':{normalizeLoudness(){},measureLoudness(){}},
  './midiio.js':{findOutput:()=>null},
};
const context=vm.createContext({Tone,console,URL,setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout});
const module=new vm.SourceTextModule(fs.readFileSync(new URL('../public/js/audio.js',import.meta.url),'utf8'),{context,initializeImportMeta(meta){meta.url=new URL('../public/js/audio.js',import.meta.url).href;}});
await module.link(async(specifier)=>{
  const exports=deps[specifier];assert.ok(exports,`Unexpected import ${specifier}`);
  return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});
});await module.evaluate();const A=module.namespace;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setSong(index=0){S.state.song=structuredClone(songs[index]);S.state.song.tracks=S.state.song.tracks.slice(0,1);S.state.playheadBeat=0;S.state.playing=false;}
setSong();
let unblock;startBlock=new Promise(resolve=>unblock=resolve);
const cancelled=A.play();await tick();A.stop();unblock();await cancelled;
check(!S.state.playing,'Stop during audio startup cancels play');startBlock=null;
const track=S.state.song.tracks[0],knob=track.knobs[0],mid=knob.s+knob.d/2;
await A.play(mid);check(S.state.playing,'Play starts');
let inst=insts.at(-1); const defaults=synth2.knobDefaults(track.synth2);
const value=inst.calls.find(c=>c[0]==='knob'&&c[1]===knob.param);
close(value[2],(defaults[knob.param]+knob.to)/2,'Mid-ramp seek restore');
const kp=parts.findLast(p=>!p.disposed&&p.events.some(([,k])=>k.reset));
check(kp.events.some(([at,k])=>k.param===knob.param&&at< S.beatToSec(mid)),'Earlier gestures retained for loop');
const resume=kp.events.find(([,k])=>k.resume)[1];kp.cb(12,resume);
close(inst.calls.at(-1)[4],S.beatToSec(knob.s+knob.d)-S.beatToSec(mid),'Remainder of ramp');
kp.cb(20,{reset:true});close(inst.calls.findLast(c=>c[0]==='knob'&&c[1]===knob.param)[2],defaults[knob.param],'Loop reset');
Transport.seconds=S.beatToSec(20);A.stop();close(S.state.playheadBeat,20,'Pause preserves precise position before Tone resets seconds');
track.knobs=[];await A.play(0);inst=insts.at(-1);check(insts.length===2&&insts[0].disposed,'Stopped synth rebuilt to clear old FX tails');
close(inst.calls.findLast(c=>c[0]==='knob'&&c[1]==='cutoff')[2],defaults.cutoff,'No-gesture song resets old values');
// Resume a held key only once, with remaining duration.
A.stop();track.notes=[{id:'held',p:64,s:0,d:4,v:90,f:2}];await A.play(2);inst=insts.at(-1);
const np=parts.findLast(p=>!p.disposed&&p.events.some(([,v])=>v.n));
const held=np.events.find(([,v])=>v.resume)[1];np.cb(25,held);close(inst.calls.at(-1)[3],S.beatToSec(4)-S.beatToSec(2),'Held note remaining duration');
const count=inst.calls.length;np.cb(30,held);check(inst.calls.length===count,'Seek-only held note does not duplicate on loops');
A.seek(1);await tick();await tick();check(S.state.playing&&Transport.seconds===S.beatToSec(1),'Live band seek rebuilds timing');
A.releaseSongEngines();check(insts.every(i=>i.disposed),'Song switch releases engines');
for(let i=0;i<16;i++){setSong(i%songs.length);await A.play();A.releaseSongEngines();}
check(insts.every(i=>i.disposed)&&parts.every(p=>p.disposed),'Sixteen song changes leave no live engines or Parts');
// A song replaced during asynchronous instrument creation cannot leave an orphan.
setSong();createBlock=new Promise(resolve=>unblock=resolve);const stale=A.play();await tick();A.releaseSongEngines();setSong(1);unblock();await stale;createBlock=null;
check(!S.state.playing&&insts.at(-1).disposed,'Stale async instrument disposed');
await A.play();A.releaseSongEngines();
// Shared piano retains its sustain and ordinary seek path.
S.state.song=S.defaultSong();S.state.song.tracks=[S.makeTrack({instrument:'piano',notes:[{p:60,s:0,d:1,v:90}]})];S.state.song.pedal=[{s:0,d:4}];
await A.play(0);const pianoPart=parts.findLast(p=>!p.disposed);pianoPart.cb(40,pianoPart.events[0][1]);
close(sfz.calls.at(-1)[4],S.beatToSec(4),'Piano sustain duration unchanged');
const oldParts=parts.length;A.seek(2);check(parts.length===oldParts&&Transport.seconds===S.beatToSec(2),'Piano seek stays on existing path');A.releaseSongEngines();
// Actual sampled drum branch: the optional trim routes only its note, and is released.
class PercNode {connect(){}dispose(){}triggerAttackRelease(){}}
Object.assign(Tone,{NoiseSynth:PercNode,MetalSynth:PercNode,Filter:PercNode});
const trimNodes=[];raw.createGain=()=>{const n={gain:{value:1},connect(to){this.target=to;},disconnect(){this.disconnected=true;}};trimNodes.push(n);return n;};
sfz.byKey=Array.from({length:128},()=>[0]);
S.state.song=S.defaultSong();const drum=S.makeTrack({instrument:'drums',notes:[{p:49,s:0,d:.25,v:120},{p:38,s:1,d:.25,v:115},{p:42,s:2,d:.25,v:76}]});drum.drumSampleGains={...drumBalance.BAND_DRUM_SAMPLE_GAINS};S.state.song.tracks=[drum];
await A.play();let drumPart=parts.findLast(p=>!p.disposed);drumPart.cb(50,drumPart.events[0][1]);
close(sfz.calls.at(-1)[1].gain.value,10**(5/20),'Crash uses +5 dB output without changing its velocity layer');
check(sfz.calls.at(-1)[5]===120,'Crash velocity retained');
drumPart.cb(51,drumPart.events[1][1]);check(!sfz.calls.at(-1)[1].gain,'Snare bypasses note trims');
drumPart.cb(52,drumPart.events[2][1]);close(sfz.calls.at(-1)[1].gain.value,10**(18/20),'Closed hat uses +18 dB output');
A.releaseSongEngines();check(trimNodes.every(n=>n.disconnected),'Per-drum outputs disconnected on song change');
drum.drumSampleGains=undefined;await A.play();drumPart=parts.findLast(p=>!p.disposed);drumPart.cb(53,drumPart.events[0][1]);check(!sfz.calls.at(-1)[1].gain,'Other drum projects have no trim');A.releaseSongEngines();
// Separate project saves, with the original piano/STUDIO key still available.
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
S.configureProjectStorage('bluegarage.project.v1');S.state.song.title='piano';S.saveLocal();
S.configureProjectStorage('vesper-band.project.v1');S.state.song.title='band';S.saveLocal();
S.configureProjectStorage('bluegarage.project.v1');S.loadLocal();check(S.state.song.title==='piano','Band saves do not overwrite piano');
console.log(`PASS: ${checks} regression assertions (mock audio clock; actual audio.js and processor bundle)`);
