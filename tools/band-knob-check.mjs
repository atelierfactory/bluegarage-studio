// Exercise the critic/animation contract beyond the six particular scores.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {KNOBS,knobDefaults} from '../public/js/synth2.js';
import {analyzeBand} from '../public/band/critic.js';
import {knobMotionAt} from '../public/band/knob-motion.js';
import {LIMITS} from '../public/band/prompts.js';
const ctx={fillRect(){},strokeRect(){},fillText(){},measureText:s=>({width:s.length*22})};globalThis.document={createElement:()=>({getContext:()=>ctx})};
const{BandStage}=await import('../public/band/scene.js');const stage=new BandStage(null,{headless:true});
const{song:base}=JSON.parse(fs.readFileSync(new URL('../public/band/repertoire/glass-current.band.json',import.meta.url)));
const song={...base,tempo:120,tempoMap:[],timeSig:4,sections:[{name:'Check',bars:8}]},toSec=b=>b*.5;
const empty={synth:[{p:60,s:0,d:.2,v:100,f:1}],pedal:[],drums:[],kick:[]};
let checks=0,cases=0,maxGap=0,maxError=0;const failures=[];
function install(knobs,defaults){const parts={...empty,knobs},a=analyzeBand(parts,{song,range:{startBar:0,bars:8}});assert.equal(a.stats.fixes.length,0);assert.equal(a.issues.length,0);stage.setSong(parts,defaults);cases++;}
function contact(e,beat){stage.update(beat,toSec,1/60,true);const k=stage.synth.knobs.find(k=>k.id===e.param);
 for(const f of stage.hands.Right.fingers.slice(0,2)){
  const p=k.holder.worldToLocal(f.contactPad.getWorldPosition(new THREE.Vector3())),r=.0125+(.011-.0125)*(p.y+.0065)/.017,gap=Math.hypot(p.x,p.z)-r-.0055;
  const error=f.tip.getWorldPosition(new THREE.Vector3()).distanceTo(stage.knobContacts[stage.hands.Right.fingers.indexOf(f)]);maxGap=Math.max(maxGap,Math.abs(gap));maxError=Math.max(maxError,error);checks++;
  if(Math.abs(gap)>.002||p.y<-.0065||p.y>.0105||error>.002)failures.push({param:e.param,beat,gap,y:p.y,error});
 }
}
const defaults=knobDefaults(base.tracks[0].synth2);
// Every knob, both directions, all values 0..1. No privileged composer/patch.
for(const k of KNOBS)for(const from of[0,1]){
 const e={param:k.id,s:4,d:2,to:1-from};install([e],{...defaults,[k.id]:from});stage.poseAt(e.s,toSec);
 for(let i=0;i<=40;i++)contact(e,e.s+e.d*i/40*.9999);
}
// Every ordered pair, including opposite ends, equal controls and zero gap.
// The current score contract permits back-to-back gestures; verify event
// ownership at the exact boundary and a rigid, non-collapsing transfer grip.
for(const a of KNOBS)for(const b of KNOBS)for(const gap of[0,.02,.15,.60]){
 const first={param:a.id,s:4,d:2*LIMITS.knobMin,to:.95},second={param:b.id,s:+(4+2*LIMITS.knobMin+gap*2).toFixed(4),d:2*LIMITS.knobMin,to:.05};
 install([first,second],Object.fromEntries(KNOBS.map(k=>[k.id,.25])));stage.poseAt(first.s,toSec);
 for(const u of[0,.5,.9999])contact(first,first.s+first.d*u);
 if(gap)for(const u of[.1,.5,.9]){
  const beat=first.s+first.d+(second.s-first.s-first.d)*u;stage.update(beat,toSec,1/60,true);
  const p=stage.hands.Right.fingers.slice(0,2).map(f=>f.tip.getWorldPosition(new THREE.Vector3()));checks++;
  if(p[0].distanceTo(p[1])<.011)failures.push({pair:[a.id,b.id],gap,beat,collapsedGrip:true});
 }
 assert.equal(knobMotionAt([first,second],toSec(second.s),toSec).event,second);
 for(const u of[0,.5,.9999])contact(second,second.s+second.d*u);
}
console.log(JSON.stringify({cases,checks,maximumSurfaceGapMm:maxGap*1000,maximumContactErrorMm:maxError*1000,failures:failures.length,examples:failures.slice(0,15)},null,2));if(failures.length)process.exitCode=1;
