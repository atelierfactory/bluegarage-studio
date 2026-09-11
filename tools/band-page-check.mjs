// Actual band.js + actual headless THREE stage; minimal DOM and network/audio doubles.
// node --experimental-vm-modules --experimental-loader ./tools/band-node-loader.mjs tools/band-page-check.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as S from '../public/js/state.js';
import * as prompts from '../public/band/prompts.js';
import * as critic from '../public/band/critic.js';
import * as synth2 from '../public/js/synth2.js';
import * as drumBalance from '../public/js/drum-balance.js';
import * as model from '../public/band/model.js';
import * as signal from '../public/band/signal.js';
import {RecordedOfflineContext} from './band-offline-fixture.mjs';
globalThis.OfflineAudioContext=RecordedOfflineContext;
const ctx2d={fillRect(){},strokeRect(){},fillText(){},measureText(s){return {width:s.length*22};}};
globalThis.document={createElement(){return {getContext:()=>ctx2d};}};
const {BandStage}=await import('../public/band/scene.js');
class Stage extends BandStage {constructor(){super(null,{headless:true});this.canvas={clientWidth:1000,clientHeight:800};}render(){this.renders=(this.renders??0)+1;this.needsRender=false;}}
class Element {
  constructor(){this.children=[];this.events=new Map();this.dataset={};this.value='';this.style={};const classes=new Set();this.classList={add:(...a)=>a.forEach(c=>classes.add(c)),remove:(...a)=>a.forEach(c=>classes.delete(c)),contains:c=>classes.has(c),toggle(c,v){const yes=v??!classes.has(c);if(yes)classes.add(c);else classes.delete(c);return yes;}};}
  addEventListener(name,cb){this.events.set(name,cb);}appendChild(child){this.children.push(child);}querySelector(){return this._child??=new Element();}showModal(){this.open=true;}close(){this.open=false;}getBoundingClientRect(){return {width:1000,height:800};}click(){return this.events.get('click')?.({currentTarget:this,target:this});}
}
const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
const tabs=['play','compose'].map(mode=>{const e=new Element();e.dataset.mode=mode;return e;});
const doc={body:new Element(),fonts:{ready:Promise.resolve()},createElement:()=>new Element(),querySelector:q=>q==='dialog[open]'?null:element(q),querySelectorAll:q=>q.includes(',')?q.split(',').flatMap(s=>doc.querySelectorAll(s.trim())):q==='.mtab'?tabs:q.startsWith('#')?[element(q)]:[]};
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
const dir=new URL('../public/band/repertoire/',import.meta.url),index=JSON.parse(fs.readFileSync(new URL('index.json',dir),'utf8'));
const songs=index.map(it=>JSON.parse(fs.readFileSync(new URL(it.file,dir),'utf8')).song);
let seq=0;const saved=new Map();
const library={configureLibrary(){},newId:()=>`saved-${++seq}`,saveSong:async(id,song)=>saved.set(id,structuredClone(song)),loadSong:async id=>saved.get(id),listSongs:async()=>[],deleteSong:async id=>saved.delete(id)};
let playCalls=0;
const audio={sampleSynthSignal:()=>null,currentBeat:()=>S.state.playheadBeat,seek:b=>{S.state.playheadBeat=b;S.emit('playhead');},stop(reset=false){S.state.playing=false;if(reset)S.state.playheadBeat=0;S.emit('transport');},releaseSongEngines(){this.stop(true);},async play(b){playCalls++;S.state.playheadBeat=b??S.state.playheadBeat;S.state.playing=true;S.emit('transport');},setMasterVolume(db){S.state.song.master.volume=db;}};
let generation='fail',chunks=0,waiting=false;
const generateStructured=async({label,signal,schema})=>{
  if(generation==='fail')throw new Error('injected blueprint failure');
  if(label==='blueprint')return {data:{...songs[0],sections:[{name:'A',bars:generation==='success'?8:generation==='seam-issues'?40:16}],trackPlan:[]}};
  if(!schema)return {data:{keys:songs[0].tracks[0].synth2,pedal:songs[0].tracks[1].synth2,knobPlan:'opening'}};
  chunks++;
  if(chunks===2&&generation==='partial')throw new Error('injected second chunk failure');
  if(chunks===2&&generation==='cancel'){waiting=true;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));}
  if(generation==='seam-fix'||generation==='seam-issues')return {data:{
    performanceNotes:'Boundary fixture: each chunk is playable on its own.',
    synth:[{p:60,s:1,d:.3,v:100,f:1}],drums:[{k:'hh',s:0,v:80},{k:'sn',s:1,v:100}],kick:[{s:0,v:100}],knobs:[],
    pedal:[...(chunks>1?[{p:36,s:.1,d:.2,v:100}]:[]),{p:24,s:31.95,d:.05,v:100}],
  }};
  const p=model.partsFromSong(songs[0]),out={performanceNotes:'test'};
  for(const key of ['synth','pedal','drums','kick','knobs'])out[key]=p[key].filter(n=>n.s<32);
  return {data:out};
};
const deps={
 '../js/state.js':S,'../js/audio.js':audio,'../js/drum-balance.js':drumBalance,
 '../js/pianoroll.js':{THEME:{},PianoRoll:class{resetFollow(){}followPlayhead(){}}},
 '../js/midi.js':{downloadMidi(){}},
 '../js/claude.js':{generateStructured,settings:{get:()=>({lang:'ja'})},resolveTransport:async()=>'proxy',relaySeat:async()=>null,MODELS:[]},
 '../js/i18n.js':{t:s=>s,setLang(){},detectLang:()=> 'ja',applyDom(){}},
 '../js/settings.js':{initSettings:()=>({openIfNoKey:async()=>{}})},
 '../js/library.js':library,'./scene.js':{BandStage:Stage},'./lanes.js':{Lanes:class{draw(){}}},
 './signal.js':signal,'./prompts.js':prompts,'./critic.js':critic,'../js/synth2.js':synth2,'./model.js':model,
};
const win={addEventListener(){}};let nextFrame;
const pump=(n=1800)=>{for(let i=0;i<n;i++){const cb=nextFrame;nextFrame=null;cb?.(performance.now()+i*1000/60);}};
const context=vm.createContext({document:doc,window:win,location:{search:'?song=glass-current.band.json&shot=full&beat=196'},innerWidth:1000,performance,requestAnimationFrame(cb){nextFrame=cb;},structuredClone,URLSearchParams,URL,Blob,console,localStorage:globalThis.localStorage,setTimeout,clearTimeout,AbortController,fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL(url.replace(/^repertoire\//,''),dir),'utf8'))})});
const module=new vm.SourceTextModule(fs.readFileSync(new URL('../public/band/band.js',import.meta.url),'utf8'),{context});
await module.link(async name=>{const obj=deps[name];assert.ok(obj,name);return new vm.SyntheticModule(Object.keys(obj),function(){for(const[k,v]of Object.entries(obj))this.setExport(k,v);},{context});});await module.evaluate();await win.bandReady;
let count=0;const check=(x,msg)=>{assert.ok(x,msg);count++;};
check(S.state.song.title===songs[0].title,'URL song boot');
check(typeof win.bandReady.then === "function",'Readiness promise');
check(win.vesperStage.renders===1,'URL shot publishes only one completed frame');
check(win.bandShotStatus.state==='ready'&&doc.body.dataset.bandShot==='ready','Capture has an explicit readiness marker');
const hasTraces=()=>win.vesperStage.arChanges.length>0&&win.vesperStage.arChanges.every(e=>{const t=win.vesperStage.signalTraces[e.id];return t?.before?.spectrum.length===96&&t?.current?.spectrum.length===96;});
check(hasTraces(),'Full@196 has both measured traces before ready');
pump();check(win.vesperStage.renders===1,'30 seconds of virtual frames do not redraw a frozen shot');
win.vesperStage._resize();pump(1);check(win.vesperStage.renders===1,'Unchanged ResizeObserver delivery preserves the frozen bitmap');
for(const item of index){await win.bandLoad(item.file);check(S.state.song.title===item.title,'Song switch');}
await win.bandLoad(index[0].file);
const shot=await win.bandShot({view:'knob',beat:index[0].shots.knob});
check(!S.state.playing&&shot.handR.mode==='knob','Frozen knob shot');
check(shot.ar.some(e=>e.param==='cutoff'&&e.progress>.49&&e.progress<.51),'Frozen shot includes halfway AR value');
for(const view of ['full','crash','synth','ar']){const r=await win.bandShot({view,beat:index[0].shots[view]});check(r.view===view&&!S.state.playing,`New ${view} shot`);check(hasTraces(),`Both traces exist in ${view}`);}
await win.bandShot({view:'stick',beat:1});
const same=await win.bandShot({view:'knob',beat:index[0].shots.knob});
check(JSON.stringify(shot.fingerR)===JSON.stringify(same.fingerR)&&JSON.stringify(shot.wristL)===JSON.stringify(same.wristL),'Repeatable pose after another shot');win.bandShotEnd();
const lastRenders=win.vesperStage.renders;pump(1);check(win.vesperStage.renders===lastRenders+1,'Animation resumes after leaving shot');
signal.clearShotSignalCache();let release;RecordedOfflineContext.wait=new Promise(r=>{release=r;});
const pending=win.bandShot({view:'full',beat:196}),beforeRender=win.vesperStage.renders;
pump();check(win.vesperStage.renders===beforeRender&&win.bandShotStatus.state==='measuring','No incomplete frame while offline audio is pending');
win.bandShotEnd();release();RecordedOfflineContext.wait=null;const cancelled=await pending;
check(cancelled.cancelled&&win.vesperStage.renders===beforeRender,'Cancelled measurement never overwrites the live stage');
signal.clearShotSignalCache();RecordedOfflineContext.fail=true;
await assert.rejects(win.bandShot({view:'full',beat:196}),/injected offline failure/);check(win.bandShotStatus.state==='error'&&doc.body.dataset.bandShot==='error','Failed measurement is not published as a completed photo');
RecordedOfflineContext.fail=false;await win.bandShot({view:'full',beat:196});check(hasTraces()&&win.bandShotStatus.state==='ready','Retry publishes complete traces');win.bandShotEnd();
const before=S.state.song.title;element('#inp-theme').value='test';
await element('#btn-go').click();check(S.state.song.title===before&&!S.state.generating,'Blueprint failure restores current song');
generation='partial';chunks=0;await element('#btn-go').click();check(S.state.song.title===before,'Partial failure restores previous song');
check([...saved.values()].some(s=>s.kind==='draft'&&s.tracks[0].notes.length),'Completed chunk preserved as draft');
generation='cancel';chunks=0;const cancelTask=element('#btn-go').click();
for(let i=0;i<30&&!waiting;i++)await new Promise(r=>setImmediate(r));check(waiting,'Request awaiting cancellation');
await element('#btn-cancel').click();await cancelTask;
check(!S.state.generating&&S.state.song.title===before,'Abort exits and restores');
generation='success';chunks=0;await element('#btn-go').click();check(S.state.song.kind==='composed'&&playCalls===1,'Successful composition saved and played');
check(!element('#btn-go').disabled,'Compose controls recovered');
// Real critic + real compose: a repairable chunk boundary is committed and
// rechecked; four too-fast boundaries produce issues and preserve the old song.
generation='seam-fix';chunks=0;const playsBeforeSeam=playCalls;
await element('#btn-go').click();
check(S.state.song.kind==='composed'&&playCalls===playsBeforeSeam+1,'Seam fixes alone complete and play the song');
check(S.state.song.tracks.find(t=>t.role==='pedal').notes.length===2,'Corrected pedal notes are written back (3 to 2)');
let complete=critic.analyzeBand(model.partsFromSong(S.state.song),{song:S.state.song,range:{startBar:0,bars:16}});
check(complete.stats.fixes.length===0&&complete.issues.length===0,'Completed seam repair passes a second real analysis');
check(element('#status-text').innerHTML.includes('つなぎ目で'),'Completion explains the seam repair');
const cleanBackup=structuredClone(S.state.song),playsBeforeIssues=playCalls;
generation='seam-issues';chunks=0;await element('#btn-go').click();
check(playCalls===playsBeforeIssues,'Seam issues do not start playback');
check(JSON.stringify(S.state.song)===JSON.stringify(cleanBackup),'Seam issues restore the previous complete song');
check(element('#status-text').innerHTML.includes('つなぎ目に問題'),'Unresolved seam issues are reported');
// A malformed import must leave the active song and audio untouched.
element('#inp-import-json').files=[{size:10,text:async()=>JSON.stringify({song:{tracks:[]}})}];
const current=S.state.song;await element('#inp-import-json').events.get('change')({target:element('#inp-import-json')});check(S.state.song===current,'Invalid import is transactional');
win.bandDemo();check(S.state.song.title.startsWith('DEMO'),'Demo remains available');
console.log(`PASS: ${count} page assertions (actual band.js / THREE geometry; DOM, audio and AI mocked)`);
