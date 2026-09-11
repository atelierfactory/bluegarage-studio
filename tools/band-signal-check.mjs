// Actual FFT and SynthCore measurements; native Web Audio connections/lifetime
// are checked with a graph recorder. Browser is still needed for native FX output.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {measureSamples,tracePath,SignalHistory,shotSignals,shotSignalStats,clearShotSignalCache} from '../public/band/signal.js';
import {RecordedOfflineContext} from './band-offline-fixture.mjs';
import {SynthCore} from '../public/js/synthcore.js';
import {createSynth2,createSynth2Output,knobDefaults} from '../public/js/synth2.js';
let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;};
const rate=24000,sine=Float32Array.from({length:rate},(_,i)=>.2*Math.sin(2*Math.PI*440*i/rate)),signal=measureSamples(sine,rate);
const peak=signal.spectrum.indexOf(Math.max(...signal.spectrum)),hz=40*400**((peak+.5)/96);
check(Math.abs(hz-440)<60,'Measured spectrum locates a 440 Hz tone');check(Math.max(...signal.wave)>.19,'Waveform contains actual sample amplitude');
check(measureSamples(new Float32Array(rate),rate).spectrum.every(v=>v===0),'Silence has no invented trace');check(!tracePath(signal.spectrum).includes('NaN'),'Finite measured trace');
const history=new SignalHistory(),raw={serial:1,rate,wave:sine.subarray(0,2048),db:new Float32Array(1024).fill(-60)};
history.update(raw,[]);const e={id:'test',param:'cutoff'},first=history.update({...raw,serial:2},[e]),baseline=first.traces.test.before;
const later=history.update({...raw,serial:3,db:new Float32Array(1024).fill(-25)},[e]);check(later.traces.test.before===baseline,'Before snapshot is retained while current sound changes');check(later.traces.test.current.spectrum[40]>baseline.spectrum[40],'Current trace follows measured frequency data');history.update(raw,[]);check(history.before.size===0,'Finished gestures release snapshots');history.reset();check(history.last===null&&history.audible===null,'Song change clears old sound');
const {song}=JSON.parse(fs.readFileSync(new URL('../public/band/repertoire/glass-current.band.json',import.meta.url)));
function coreSamples(cutoff){const core=new SynthCore(rate);core.setPatch(song.tracks[0].synth2);core.setKnob('cutoff',cutoff);core.noteOn(60,110);const out=new Float32Array(rate),l=new Float32Array(128),r=new Float32Array(128);for(let p=0;p<rate;p+=128){core.process(l,r,128);out.set(l.subarray(0,Math.min(128,rate-p)),p);}return measureSamples(out,rate);}
const dark=coreSamples(.23),bright=coreSamples(.94),upper=s=>s.spectrum.slice(55).reduce((a,b)=>a+b,0);
check(upper(bright)>upper(dark)+4,'Opening actual SynthCore filter increases measured high frequencies');
await assert.rejects(shotSignals(song,10,[]),/測定できません/);checks++;
class Param{constructor(){this.value=0;this.events=[];}setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);}cancelScheduledValues(t){this.events.push(['cancel',t]);}linearRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t]);}}
class Node{constructor(ctx,kind){this.kind=kind;this.edges=[];this.disconnected=false;this.gain=new Param();this.frequency=new Param();this.delayTime=new Param();this.Q=new Param();ctx.nodes.push(this);}connect(n){this.edges.push(n);}disconnect(){this.disconnected=true;this.edges=[];}start(){this.started=true;}stop(){this.stopped=true;}getFloatTimeDomainData(a){a.set(sine.subarray(0,a.length));}getFloatFrequencyData(a){a.fill(-38);}}
class Context{constructor(){this.nodes=[];this.sampleRate=rate;this.currentTime=0;this.audioWorklet={addModule:async()=>{}};}createBuffer(ch,n,sr){const data=Array.from({length:ch},()=>new Float32Array(n));return{getChannelData:i=>data[i],sampleRate:sr};}}
for(const type of ['Gain','ChannelSplitter','ChannelMerger','Delay','Oscillator','BiquadFilter','Convolver','Analyser'])Context.prototype[`create${type}`]=function(){return new Node(this,type);};
globalThis.AudioWorkletNode=class extends Node{constructor(ctx){super(ctx,'worklet');this.parameters=new Map(['cutoff','resonance','envAmount','lfoRate','lfoDepth','drive'].map(k=>[k,new Param()]));this.messages=[];this.port={postMessage:m=>this.messages.push(m),close:()=>{this.closed=true;}};}};
const context=new Context(),inst=await createSynth2(song.tracks[0].synth2,{context,tempo:132});
check(!context.nodes.some(n=>n.kind==='Analyser'),'No analyser allocation for ordinary synth/piano use');
const firstRead=inst.sampleSignal(),analyser=context.nodes.find(n=>n.kind==='Analyser'),nodes=context.nodes.length;
check(inst.outs[0].edges.includes(analyser),'Analyser taps output after effects/level');check(firstRead.wave[10]===sine[10],'Read actual AnalyserNode time samples');inst.sampleSignal();check(context.nodes.length===nodes,'Analyser is reused');
inst.setKnob('delay',.7,1,2,.2);check(context.nodes.filter(n=>n.kind==='Gain').some(n=>n.gain.events.some(e=>e[0]==='ramp'&&e[2]===3)),'Native wet mix follows scheduled knob ramp');inst.panic(4);check(inst.node.messages.some(m=>m.type==='allOff'),'Panic reaches worklet');inst.dispose();check(context.nodes.every(n=>n.disconnected),'All graph nodes including analyser are disconnected');
const bad=new Context(),source=new Node(bad,'source');bad.createConvolver=()=>{throw Error('injected construction failure');};try{createSynth2Output(source,song.tracks[0].synth2,{context:bad});assert.fail('Expected failure');}catch(e){check(e.message==='injected construction failure','Native graph errors propagate');}check(bad.nodes.filter(n=>n!==source).every(n=>n.disconnected),'Partly built effect graph is cleaned up');
// Exercise real PCM synthesis and FFT across the asynchronous native boundary.
// Effects are graph-recorded, not acoustically emulated by this Node fixture.
globalThis.OfflineAudioContext=RecordedOfflineContext;clearShotSignalCache();
const event={id:'15:reverb',param:'reverb',from:.64},started=performance.now();
const measured=await shotSignals(song,196,[event]),firstMs=performance.now()-started;
check(measured.signal.wave.some(v=>Math.abs(v)>.0001),'Stopped full shot contains actual audible samples');
check(measured.traces[event.id].before.spectrum.length===96&&measured.traces[event.id].current.spectrum.length===96,'Stopped comparison has both traces');
check(shotSignalStats.renders===2&&shotSignalStats.frames===80000,'Two short 32 kHz probes replace 201600 frames');
check(RecordedOfflineContext.instances.every(c=>c.nodes.every(n=>n.disconnected)),'Silent measurement frees every source and effect node');
const renders=shotSignalStats.renders,cacheStart=performance.now(),again=await shotSignals(song,196,[event]);
check(again.signal===measured.signal&&shotSignalStats.renders===renders,'Another camera reuses the exact measurement');
const cacheMs=performance.now()-cacheStart;
const firstWave=Float32Array.from(measured.signal.wave);clearShotSignalCache();
check((await shotSignals(song,196,[event])).signal.wave.every((v,i)=>v===firstWave[i]),'Uncached probes use reproducible oscillator/noise phases');
clearShotSignalCache();RecordedOfflineContext.fail=true;
await assert.rejects(shotSignals(song,196,[event]),/injected offline failure/);checks++;
check(RecordedOfflineContext.instances.every(c=>c.nodes.every(n=>n.disconnected)),'Failed native rendering also frees all graph nodes');
RecordedOfflineContext.fail=false;check((await shotSignals(song,196,[event])).signal!==null,'Failed cached promise can be retried');
console.log(JSON.stringify({firstProbePairMs:Math.round(firstMs),cachedPairMs:+cacheMs.toFixed(2),nativeEffects:'recorded, not rendered in Node'}));
console.log(`PASS: ${checks} measured audio / graph lifecycle assertions; native browser effects remain to be checked.`);
