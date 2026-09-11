// Measured sound only: live post-effect AnalyserNode data, or a silent audition
// rendered by the actual SynthCore and the same native SYNTH2 effect chain.
import {SynthCore} from '../js/synthcore.js';
import {createSynth2Output,knobDefaults} from '../js/synth2.js';
import {knobStateAt} from '../js/synth-automation.js';
import {beatToSec,tempoAt} from '../js/state.js';
const clamp=v=>Math.max(0,Math.min(1,v));
export function spectrumFromDb(db,rate){
 const result=new Float32Array(96),binHz=rate/(db.length*2);
 for(let i=0;i<96;i++){const lo=40*Math.pow(400,i/96),hi=40*Math.pow(400,(i+1)/96);let peak=-100;
  for(let k=Math.max(1,Math.floor(lo/binHz));k<=Math.min(db.length-1,Math.ceil(hi/binHz));k++)if(Number.isFinite(db[k]))peak=Math.max(peak,db[k]);
  result[i]=clamp((peak+90)/78);
 }return result;
}
export function tracePath(values){if(!values?.length)return '';return Array.from(values,(v,i)=>`${i?'L':'M'}${(i*216/(values.length-1)).toFixed(1)},${(31-clamp(v)*30).toFixed(1)}`).join(' ');}
export function measuredSignal(raw){if(!raw)return null;return {serial:raw.serial,wave:Float32Array.from(raw.wave),spectrum:spectrumFromDb(raw.db,raw.rate),source:'live'};}
export class SignalHistory{
 constructor(){this.reset();}
 reset(){this.before=new Map();this.last=null;this.audible=null;this.lastSerial=-1;}
 update(raw,events){
  const signal=raw&&raw.serial!==this.lastSerial?measuredSignal(raw):this.last;
  if(raw)this.lastSerial=raw.serial;
  const activeIds=new Set(events.map(e=>e.id));for(const id of this.before.keys())if(!activeIds.has(id))this.before.delete(id);
  for(const e of events)if(!this.before.has(e.id))this.before.set(e.id,this.audible??this.last??signal);
  if(signal){this.last=signal;if(signal.wave.some(v=>Math.abs(v)>.0001))this.audible=signal;}
  return {signal:this.last,traces:Object.fromEntries(events.map(e=>[e.id,{before:this.before.get(e.id),current:this.last,caption:'実音の周波数 · 点線は回す前'}]))};
 }
}
// Fourier magnitudes of rendered samples; no parameter-dependent drawn shape.
export function measureSamples(samples,rate,serial=1){
 const N=2048,db=new Float32Array(N/2).fill(-100),wave=new Float32Array(N);let best=0,bestPower=-1;
 // Pick the most audible recent waveform, and average six windows for the spectrum.
 const windows=[];for(let j=0;j<6;j++){const pos=Math.max(0,Math.floor(samples.length*.40+j*(samples.length*.58-N)/5));windows.push(pos);let power=0;for(let i=0;i<N;i++)power+=(samples[pos+i]??0)**2;if(power>bestPower){best=pos;bestPower=power;}}
 wave.set(samples.subarray(best,best+N));
 const power=new Float64Array(N/2),window=Float64Array.from({length:N},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(N-1)));
 for(const pos of windows){
  const re=Float64Array.from(window,(w,i)=>(samples[pos+i]??0)*w),im=new Float64Array(N);
  for(let i=1,j=0;i<N;i++){let bit=N>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];}}
  for(let size=2;size<=N;size*=2){const angle=-2*Math.PI/size,wr=Math.cos(angle),wi=Math.sin(angle);
   for(let start=0;start<N;start+=size){let r=1,q=0;for(let j=0;j<size/2;j++){const a=start+j,b=a+size/2,tr=re[b]*r-im[b]*q,ti=re[b]*q+im[b]*r;re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const nr=r*wr-q*wi;q=r*wi+q*wr;r=nr;}}
  }
  for(let k=1;k<N/2;k++)power[k]+=(re[k]*re[k]+im[k]*im[k])*16/(N*N);
 }
 for(let k=1;k<N/2;k++)db[k]=10*Math.log10(Math.max(1e-12,power[k]/windows.length));

 return {serial,wave,spectrum:spectrumFromDb(db,rate),source:'audition'};
}
let serial=10000;
// Keep only the small measured traces, never AudioContexts, buffers or FX nodes.
// Shared promises also coalesce repeated camera shots while a probe is rendering.
const auditions=new Map(),MAX_AUDITIONS=32;
export const shotSignalStats={renders:0,hits:0,frames:0};
export function clearShotSignalCache(){auditions.clear();for(const k of Object.keys(shotSignalStats))shotSignalStats[k]=0;}
function cachedAudition(patch,values,pitches,tempo){
 const key=JSON.stringify([patch,values,pitches,tempo]);
 if(auditions.has(key)){const result=auditions.get(key);auditions.delete(key);auditions.set(key,result);shotSignalStats.hits++;return result;}
 const result=audition(patch,values,pitches,tempo).catch(error=>{if(auditions.get(key)===result)auditions.delete(key);throw error;});
 auditions.set(key,result);while(auditions.size>MAX_AUDITIONS)auditions.delete(auditions.keys().next().value);
 return result;
}
async function audition(patch,values,pitches,tempo){
 const Offline=globalThis.OfflineAudioContext??globalThis.webkitOfflineAudioContext;if(!Offline)throw new Error("この環境では撮影用の音を測定できません");
 // 32 kHz covers the display's 16 kHz range; two attacks suffice. Leave
 // enough tail for at least the first echo, including unusually long delays.
 const rate=32000,seconds=Math.max(1.25,Math.min(5.5,patch.fx.delay.time*60/Math.max(20,tempo)+.35)),length=Math.ceil(rate*seconds),ctx=new Offline(2,length,rate),core=new SynthCore(rate);
 shotSignalStats.renders++;shotSignalStats.frames+=length;
 // Identical initial oscillator/noise phases isolate the changed control.
 core.voices.forEach((v,i)=>{v.rng=0x761501+i*7919;});core.setPatch(patch);core.setTempo(tempo);for(const[id,v]of Object.entries(values))core.setKnob(id,v);
 const buffer=ctx.createBuffer(2,length,rate),left=buffer.getChannelData(0),right=buffer.getChannelData(1),L=new Float32Array(128),R=new Float32Array(128);
 const events=[0,.32].flatMap(t=>pitches.flatMap(p=>[{t,on:true,p},{t:t+.24,on:false,p}])).sort((a,b)=>a.t-b.t||Number(a.on)-Number(b.on));let ei=0;
 for(let pos=0;pos<length;pos+=128){while(ei<events.length&&events[ei].t*rate<pos+128){const e=events[ei++],offset=Math.max(0,Math.round(e.t*rate)-pos);if(e.on)core.noteOn(e.p,104,offset);else core.noteOff(e.p,offset);}core.process(L,R,128);const n=Math.min(128,length-pos);left.set(L.subarray(0,n),pos);right.set(R.subarray(0,n),pos);}
 const source=ctx.createBufferSource();source.buffer=buffer;let fx;
 try{fx=createSynth2Output(source,patch,{context:ctx,tempo,knobs:values});fx.out.connect(ctx.destination);source.start();const rendered=await ctx.startRendering(),mono=new Float32Array(length),a=rendered.getChannelData(0),b=rendered.getChannelData(1);for(let i=0;i<length;i++)mono[i]=(a[i]+b[i])*.5;return measureSamples(mono,rate,++serial);}
 finally{source.disconnect();for(const n of fx?.nodes??[]){try{n.stop?.();}catch{}n.disconnect();}}
}
export async function shotSignals(song,beat,changes){
 const track=song.tracks.find(t=>t.role==='keys'),toSec=b=>beatToSec(b,song),defaults=knobDefaults(track.synth2),values=knobStateAt(defaults,track.knobs??[],beat,toSec);
 // The last right-hand attack supplies the notes. Both traces use the same notes,
 // velocity and rhythm, isolating the changed knob instead of comparing melodies.
 const previous=track.notes.filter(n=>n.s<=beat),at=previous.at(-1)?.s??track.notes[0]?.s??0;
 const pitches=track.notes.filter(n=>Math.abs(n.s-at)<.001).map(n=>n.p).slice(0,5);if(!pitches.length)pitches.push(60);
 const tempo=tempoAt(beat,song),current=await cachedAudition(track.synth2,values,pitches,tempo),traces={};
 for(const e of changes){const before=await cachedAudition(track.synth2,{...values,[e.param]:e.from},pitches,tempo);traces[e.id]={before,current,caption:'同じ音で実測 · 点線は変更前'};}
 return {signal:current,traces};
}
