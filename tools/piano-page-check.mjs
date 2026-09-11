// node --experimental-vm-modules --experimental-loader ./tools/band-node-loader.mjs tools/piano-page-check.mjs
// Runs the real page/controller and THREE pose; only DOM painting and audio IO
// are stubs. Browser framing and sound remain a separate visual/listening check.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {PianoStage} from './piano-headless.mjs';
import * as S from '../public/js/state.js';
import * as fingering from '../public/js/fingering.js';
import * as midi from '../public/js/midiread.js';
import * as balance from '../public/piano/loudness.js';
import {repertoire} from './piano-data.mjs';
const paint=new Proxy({measureText:s=>({width:String(s).length*6}),createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]??(()=>{})});
class Element {
  constructor(){this.children=[];this.events=new Map();this.dataset={};this.style={};this.value='';this.textContent='';const classes=new Set();this.classList={add:(...a)=>a.forEach(c=>classes.add(c)),remove:(...a)=>a.forEach(c=>classes.delete(c)),contains:c=>classes.has(c),toggle(c,v){const yes=v??!classes.has(c);if(yes)classes.add(c);else classes.delete(c);return yes;}};}
  addEventListener(name,cb){this.events.set(name,cb);}appendChild(child){this.children.push(child);}querySelector(){return this._child??=new Element();}showModal(){this.open=true;}close(){this.open=false;}
  getBoundingClientRect(){return {width:1000,height:800};}click(){return this.events.get('click')?.({currentTarget:this,target:this});}
  getContext(){return paint;}get parentElement(){return this;}matches(){return false;}
}
const els=new Map(),el=s=>{if(!els.has(s))els.set(s,new Element());return els.get(s);};
const close=['auto','left','right','both'].map(mode=>{const e=new Element();e.dataset.close=mode;return e;});
const doc={body:new Element(),fonts:{ready:Promise.resolve()},createElement:()=>new Element(),querySelector:el,querySelectorAll:s=>s.includes('data-close')?close:[]};
class Stage extends PianoStage {constructor(){super(null,{headless:true});this.canvas={clientWidth:1000,clientHeight:800};}render(){this.renders=(this.renders??0)+1;this.needsRender=false;}}
const storage=new Map();const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};globalThis.localStorage=localStorage;
const audio={previewNote(){},currentBeat:()=>S.state.playheadBeat,seek:b=>{S.state.playheadBeat=b;S.emit('playhead');},stop(reset=false){S.state.playing=false;if(reset)S.state.playheadBeat=0;S.emit('transport');},releaseSongEngines(){this.stop(true);},async play(b){S.state.playing=true;S.state.playheadBeat=b??S.state.playheadBeat;S.emit('transport');},setMasterVolume(db){S.state.song.master.volume=db;}};
const deps={
  '../js/state.js':S,'../js/audio.js':audio,'./scene.js':{PianoStage:Stage},'./loudness.js':balance,
  '../js/fingering.js':fingering,'../js/midiread.js':midi,
  '../js/pianoroll.js':{THEME:{},PianoRoll:class{selection=new Set();resetFollow(){}followPlayhead(){}draw(){}}},
  '../js/midi.js':{downloadMidi(){}},'../js/critic.js':{analyzePiano:()=>({stats:{fixes:[]}}),describeAnalysis:()=>''},
  '../js/claude.js':{settings:{get:()=>({lang:'ja'})},MODELS:[{id:'test',label:'test'}],generateStructured(){},resolveTransport:async()=>'none',relaySeat:async()=>null},
  '../js/prompts.js':{buildBlueprintRequest(){},buildPianoRequest(){},buildInterpretRequest(){}},
  '../js/i18n.js':{t:s=>s,setLang(){},detectLang:()=> 'ja',applyDom(){}},
  '../js/settings.js':{initSettings:()=>({openIfNoKey:async()=>{}})},
  '../js/library.js':{configureLibrary(){},newId:()=> 'test-id',listSongs:async()=>[],saveSong:async()=>{}},
  './jam.js':{DEFAULT_BANK:[],Improviser:class{},buildJamBankRequest(){}},
};
const windowEvents=new Map(),win={addEventListener(k,fn){const handlers=windowEvents.get(k)??[];handlers.push(fn);windowEvents.set(k,handlers);}};let nextFrame,fetchGate=null;
const context=vm.createContext({document:doc,window:win,location:{search:'?song=fur_Elise_WoO59.mid&shot=right&beat=8'},performance,requestAnimationFrame(cb){nextFrame=cb;},structuredClone,URLSearchParams,URL,Blob,console,localStorage,setTimeout,clearTimeout,setInterval,clearInterval,ResizeObserver:class{observe(){}},
  fetch:async path=>{if(fetchGate&&String(path).includes(fetchGate.file)){fetchGate.started=true;await fetchGate.promise;}const file=new URL('../public/piano/'+String(path).split('?')[0],import.meta.url),b=fs.readFileSync(file);return {ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};}});
const rollModule=new vm.SourceTextModule(fs.readFileSync(new URL('../public/js/pianoroll.js',import.meta.url),'utf8'),{context});
await rollModule.link(async name=>{const obj=name==='./state.js'?S:audio;return new vm.SyntheticModule(Object.keys(obj),function(){for(const[k,v]of Object.entries(obj))this.setExport(k,v);},{context});});await rollModule.evaluate();deps['../js/pianoroll.js']=rollModule.namespace;
const module=new vm.SourceTextModule(fs.readFileSync(new URL('../public/piano/piano.js',import.meta.url),'utf8'),{context});
await module.link(async name=>{const obj=deps[name];assert.ok(obj,name);return new vm.SyntheticModule(Object.keys(obj),function(){for(const[k,v]of Object.entries(obj))this.setExport(k,v);},{context});});await module.evaluate();await win.pianoReady;
let count=0;const check=(x,msg)=>{assert.ok(x,msg);count++;};
check(win.pianoShotStatus.state==='ready','URL capture ready');check(S.state.song.title.startsWith('Für Elise'),'URL MIDI selected');check(!S.state.playing,'Silent capture');check(win.vesperStage.renders===1,'Exactly one completed frozen frame');
let frameClock=performance.now();const pump=n=>{frameClock=Math.max(frameClock,performance.now());for(let i=0;i<n;i++)nextFrame?.(frameClock+=1000/60);};pump(120);check(win.vesperStage.renders===1,'Frozen image remains frozen');
const a=await win.pianoShot({view:'left',beat:12});await win.pianoShot({view:'pedal',beat:42});const b=await win.pianoShot({view:'left',beat:12});check(JSON.stringify(a.hands)===JSON.stringify(b.hands),'Repeatable shot pose');
await win.pianoShot({view:'keys',beat:12});const cameraA=[...win.vesperStage.camHands.position.toArray(),...win.vesperStage.camHands.quaternion.toArray()];
await win.pianoShot({view:'left',beat:42});await win.pianoShot({view:'keys',beat:12});
check(JSON.stringify(cameraA)===JSON.stringify([...win.vesperStage.camHands.position.toArray(),...win.vesperStage.camHands.quaternion.toArray()]),'Automatic shot is independent of previous camera');
for(const view of ['full','top','eye','both','keys'])check((await win.pianoShot({view,beat:16})).state==='ready',`Capture ${view}`);
for(const item of repertoire){await win.pianoLoad(item.perf??item.file);check(S.state.song.tracks[0].notes.length>0,`Load ${item.file}`);check(win.pianoLoudness&&S.state.song.master.pianoGainDb>=0,'Fixed piano gain installed');}
win.pianoShotEnd();const renders=win.vesperStage.renders;pump(1);check(win.vesperStage.renders===renders+1,'Animation resumes');
win.vesperStage.setFrameRate(12);const limited=win.vesperStage.renders;pump(60);check(win.vesperStage.renders-limited<=13,'12 Hz throttles displayed frames');win.vesperStage.setFrameRate(0);
await assert.rejects(win.pianoLoad('../private.json'));await assert.rejects(win.pianoShot({view:'invalid'}));
check(typeof win.vesperInterpret==='function'&&win.vesperRoll,'Existing inspection hooks');
// Snapshot restores the user's camera and layout before resuming playback.
const stage=win.vesperStage;stage.setView('side');stage.setClose('left');stage.orbit.radius=1.9;
const fixedGain=S.state.song.master.pianoGainDb;
await win.pianoShot({view:'right',beat:32});await el('#btn-play').click();pump(1);
check(S.state.playing&&win.pianoShotStatus.state==='idle','Shot to playback');
check(stage.view==='side'&&stage.closeMode==='left'&&stage.orbit.radius===1.9,'Restore camera selections');
check(!doc.body.classList.contains('stage-full'),'Restore prior layout');
check(S.state.song.master.pianoGainDb===fixedGain,'Capture/playback preserves fixed gain');
audio.seek(20);pump(1);check(stage._lastBeat===20,'Seek during playback');
await el('#btn-play').click();check(!S.state.playing&&S.state.playheadBeat===20,'Pause at current position');
await el('#btn-play').click();check(S.state.playing&&S.state.playheadBeat===20,'Resume at current position');
await el('#btn-stop').click();pump(1);check(!S.state.playing&&stage._lastBeat===0,'Stop resets to beginning');
await el('#btn-fullscreen').click();check(doc.body.classList.contains('stage-full'),'Fullscreen on');
stage.headlessViewport={width:390,height:844};stage.canvas.clientWidth=390;stage.canvas.clientHeight=844;stage._resize();pump(1);
check(stage.rects.hands[2]===390&&stage.rects.main[2]===390,'Portrait fullscreen stacks views');
await win.pianoShot({view:'both',beat:32});win.pianoShotEnd();check(doc.body.classList.contains('stage-full'),'Restore fullscreen when it was already enabled');
await el('#btn-fullscreen').click();check(!doc.body.classList.contains('stage-full'),'Fullscreen off');
stage.headlessViewport={width:1000,height:800};stage.canvas.clientWidth=1000;stage.canvas.clientHeight=800;stage._resize();
// A late response from an earlier song selection cannot replace the newest song.
let release;fetchGate={file:'entertainer.vesper.json',promise:new Promise(r=>release=r)};
const slow=win.pianoLoad('entertainer.mid');await new Promise(r=>setTimeout(r,0));check(fetchGate.started,'Earlier request reached fetch');
await win.pianoLoad('gymnopedie_1.mid');const newest=JSON.stringify(S.state.song);release();check((await slow).cancelled,'Earlier load cancelled');fetchGate=null;
check(JSON.stringify(S.state.song)===newest,'Newest song and gain retained');
// Changing song while a capture awaits fonts cancels that capture.
let fontsReady;doc.fonts.ready=new Promise(r=>fontsReady=r);const pending=win.pianoShot({view:'both',beat:12});
await win.pianoLoad('fur_Elise_WoO59.mid');fontsReady();check((await pending).cancelled,'Pending capture cancelled on song change');doc.fonts.ready=Promise.resolve();
check(win.pianoShotStatus.state==='idle'&&!stage.shotCamera,'Cancelled capture restores ordinary rendering');
// Real PianoRoll event handlers: clicking, dragging, deleting and pasting cannot edit.
check(!win.vesperRoll.canEdit(),'Piano roll is read-only');
const beforeNotes=JSON.stringify(S.state.song.tracks[0].notes),roll=win.vesperRoll,canvas=el('#proll');
canvas.events.get('mousedown')({clientX:200,clientY:500,button:0});canvas.events.get('mousedown')({clientX:200,clientY:500,button:2,altKey:true});
roll.selection.add(S.state.song.tracks[0].notes[0].id);
for(const key of ['Delete','ArrowUp','v','x','z','1','l','r','p'])for(const fn of windowEvents.get('keydown')??[])fn({key,code:'',metaKey:['v','x','z'].includes(key),target:canvas,preventDefault(){}});
for(const fn of windowEvents.get('mousemove')??[])fn({clientX:350,clientY:450});for(const fn of windowEvents.get('mouseup')??[])fn({});
check(JSON.stringify(S.state.song.tracks[0].notes)===beforeNotes,'Read-only mouse and keyboard leave notes unchanged');
console.log(`PASS: ${count} piano page assertions (mock DOM/audio; real controller, PianoRoll and THREE pose)`);
