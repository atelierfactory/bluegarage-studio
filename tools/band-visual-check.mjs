// Real THREE geometry: pinching actual visible pads, crash visibility and AR timing/layout.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {beatToSec} from '../public/js/state.js';
import {knobDefaults} from '../public/js/synth2.js';
import {knobStateAt} from '../public/js/synth-automation.js';
import {partsFromSong} from '../public/band/model.js';
import {KnobAR,knobChangesAt,arLayout,arProtectedRegions} from '../public/band/ar.js';
const ctx={fillRect(){},strokeRect(){},fillText(){},measureText:s=>({width:s.length*22})};
globalThis.document={createElement:()=>({getContext:()=>ctx})};
const{BandStage,DRUMS}=await import('../public/band/scene.js');
const stage=new BandStage(null,{headless:true}),dir=new URL('../public/band/repertoire/',import.meta.url),list=JSON.parse(fs.readFileSync(new URL('index.json',dir)));
let count=0,maxGap=0;const check=(v,m)=>{assert.ok(v,m);count++;};
// Contacts have a dedicated exhaustive check; this flag reruns layout after a cosmetic edit.
for(const item of process.argv.includes("--layout-only")?[]:list){
 const{song}=JSON.parse(fs.readFileSync(new URL(item.file,dir))),defaults=knobDefaults(song.tracks[0].synth2),toSec=b=>beatToSec(b,song),part=partsFromSong(song);
 stage.setSong(part,defaults,song.tracks[0].synth2.name);
 for(const e of part.knobs)for(const u of[0,.5,.98]){
  const beat=e.s+e.d*u;stage.poseAt(beat,toSec);const knob=stage.synth.knobs.find(k=>k.id===e.param),centres=[];
  for(const f of stage.hands.Right.fingers.slice(0,2)){
   const c=knob.holder.worldToLocal(f.contactPad.getWorldPosition(new THREE.Vector3())),r=Math.hypot(c.x,c.z),radius=.0125+(.011-.0125)*(c.y+.0065)/.017,gap=r-radius-.0055;maxGap=Math.max(maxGap,Math.abs(gap));centres.push(c);
   check(Math.abs(gap)<.002&&c.y>-.0065&&c.y<.0105,`Visible fingertip off knob: ${item.file} ${e.param}@${beat} gap=${gap} y=${c.y}`);
  }
  check(centres[0].x*centres[1].x+centres[0].z*centres[1].z<0,'Thumb and index oppose');
  const ar=knobChangesAt(defaults,part.knobs,beat,toSec).find(x=>x.param===e.param&&x.s===e.s);
  check(ar&&Math.abs(ar.current-knobStateAt(defaults,part.knobs,beat,toSec)[e.param])<1e-9,'AR value equals audible score');
  check(stage.synth.knobs.filter(k=>k.chase.visible).length===1,'One active control light');
 }
}
// Whole and drum views: sample 32 locations on the actual crash bow, ray-test occlusion.
const{song}=JSON.parse(fs.readFileSync(new URL(list[0].file,dir)));stage.setSong(partsFromSong(song),knobDefaults(song.tracks[0].synth2));stage.poseAt(song.shots.crash,b=>beatToSec(b,song));
const visibility=[];stage.w=1600;stage.h=900;
for(const view of['full','drums','crash']){
 let camera;
 if(view==='drums'){stage.setView('drums');stage.update(song.shots.crash,b=>beatToSec(b,song),1/60,false);camera=stage.camWide;camera.aspect=1600/900;camera.updateProjectionMatrix();}
 else{stage.setShot(view);camera=stage.shotCamera;}
 camera.updateMatrixWorld();stage.scene.updateMatrixWorld(true);
 const holder=stage.drums.pads.cr.holder,ray=new THREE.Raycaster();let visible=0;const screen=[];
 for(let i=0;i<32;i++){const a=i*Math.PI/16,p=holder.localToWorld(new THREE.Vector3(Math.cos(a)*DRUMS.cr.r*.68,.012,Math.sin(a)*DRUMS.cr.r*.68));const v=p.clone().project(camera);screen.push(v);
  ray.set(camera.position,p.clone().sub(camera.position).normalize());ray.far=camera.position.distanceTo(p)+.02;
  const first=ray.intersectObjects(stage.scene.children,true)[0];let obj=first?.object;while(obj&&obj!==holder)obj=obj.parent;
  if(obj===holder&&Math.abs(v.x)<1&&Math.abs(v.y)<1)visible++;
 }
 const width=(Math.max(...screen.map(v=>v.x))-Math.min(...screen.map(v=>v.x)))*800,height=(Math.max(...screen.map(v=>v.y))-Math.min(...screen.map(v=>v.y)))*450;
 visibility.push({view,visible:`${visible}/32`,width:Math.round(width),height:Math.round(height)});
 check(visible>=24&&width>45&&height>20,`Crash hidden in ${view}`);
}
// Actual display surface must face the camera and stand above its metal housing.
stage.poseAt(song.shots.synth,b=>beatToSec(b,song));stage.setShot('synth');stage.scene.updateMatrixWorld(true);
const screen=stage.synth.display.surface;
for(const x of[-.08,0,.08])for(const y of[-.014,.014]){const target=screen.localToWorld(new THREE.Vector3(x,y,0)),ray=new THREE.Raycaster();ray.set(stage.shotCamera.position,target.clone().sub(stage.shotCamera.position).normalize());const first=ray.intersectObjects(stage.synth.group.children,true)[0];check(first?.object===screen,'Display is visible, not buried inside housing');}
for(const k of Object.values(stage.synth.keys).filter(k=>k.black))check(k.mat.color.r<.01&&k.mat.color.g<.01&&k.mat.color.b<.01,'Black keys have neutral black material');
const events=[{param:'cutoff',s:1,d:1,to:.9},{param:'drive',s:3,d:1,to:.7}],defaults={cutoff:.3,drive:.1};
check(knobChangesAt(defaults,events,3.5,b=>b).length===2,'Consecutive changes remain together');
check(knobChangesAt(defaults,events,9,b=>b).length===0,'Finished AR disappears');
check(knobChangesAt(defaults,events,0,b=>b).length===0,'Rewind clears AR');
for(const [w,h]of[[1600,900],[640,900],[390,450],[340,200],[220,190]]){const boxes=arLayout([0,0,w,h],2);check(boxes.length>0,'AR exists at small size');for(const b of boxes)check(b.x>=0&&b.y>=0&&b.x+b.width<=w&&b.y+b.height<=h,'AR inside viewport');}
// Real projected knob positions from normal desktop/mobile split views must stay clear.
for(const[w,h,px,py]of[[600,429,344,219],[600,311,328,149],[390,284,224,146],[390,206,213,99]])for(const n of[1,2]){
 const b=arLayout([0,0,w,h],n,{x:px,y:py});
 check(b.length>0&&b.every(r=>!(px>r.x&&px<r.x+r.width&&py>r.y&&py<r.y+r.height)),"AR does not cover the control");
 check(b.every(r=>r.x>=0&&r.y>=0&&r.x+r.width<=w&&r.y+r.height<=h),"Adaptive AR stays inside viewport");
}
const nearby=arLayout([0,0,1600,900],1,{x:900,y:450})[0];check(Math.hypot(900-Math.max(nearby.x,Math.min(900,nearby.x+nearby.width)),450-Math.max(nearby.y,Math.min(450,nearby.y+nearby.height)))<60,'Large viewport card stays near its control');
// Protect whole projected hands, knobs and the display, not just anchor points.
const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
let placementChecks=0;const placements=[];
function checkPlacement(camera,w,h,label){
 camera.aspect=w/h;camera.updateProjectionMatrix();if(label.startsWith("close"))camera=stage.cameraForClose(w,h);camera.updateMatrixWorld();
 const e=stage.arChanges.at(-1),v=stage.synth.knobs.find(k=>k.id===e.param).holder.getWorldPosition(new THREE.Vector3()).project(camera);
 const regions=arProtectedRegions(stage,camera,w,h),boxes=arLayout([0,0,w,h],stage.arChanges.length,{x:(v.x*.5+.5)*w,y:(-v.y*.5+.5)*h},regions);
 check(boxes.length>0,`Visible AR in ${label}`);
 check(boxes.at(-1).height>=82,`Current measured plot remains visible in ${label}`);
 for(const box of boxes){check(!regions.some(r=>intersects(r,box)),`AR covers hand/knob/display in ${label}`);check(box.x>=0&&box.y>=0&&box.x+box.width<=w&&box.y+box.height<=h,`AR outside ${label}`);placementChecks++;}
 if(w===1600){check(boxes.length===stage.arChanges.length&&boxes.every(b=>b.height>=144),`Both readable comparison plots in ${label}`);}
 placements.push({label,cards:boxes.length,heights:boxes.map(b=>b.height)});
}
for(const beat of[185.94,189.94,196]){
 stage.poseAt(beat,b=>beatToSec(b,song));
 for(const view of['full','knob','synth','ar']){stage.w=1600;stage.h=900;stage.setShot(view);checkPlacement(stage.shotCamera,1600,900,`${view}@${beat}`);}
 stage.shotCamera=null;stage.setView('wide');stage.update(beat,b=>beatToSec(b,song),0,false);
 for(const[w,h]of[[960,900],[600,429],[390,284]])checkPlacement(stage.camWide,w,h,`main ${w}x${h}@${beat}`);
 for(const[w,h]of[[640,900],[600,311],[390,206]])checkPlacement(stage.camClose,w,h,`close ${w}x${h}@${beat}`);
}
// The original continuous white capsules must be absent in BOTH BAND hands.
for(const hand of Object.values(stage.hands))for(const f of hand.fingers){let capsules=0,plates=0;f.root.traverse(o=>{if(o.geometry?.type==='CapsuleGeometry')capsules++;if(o.name==='finger-armour')plates++;});check(capsules===0&&plates===4,'Each finger has separate covers and exposed joints');}
console.log(JSON.stringify({placementChecks,placements}));
// Exercise the real DOM overlay's update/disposal code with small DOM stand-ins.
let domNodes=0;
class Node {constructor(){domNodes++;this.children=[];this.style={};this.attrs={};this.named=new Map();const c=new Set();this.classList={add:x=>c.add(x),toggle:(x,on)=>on?c.add(x):c.delete(x)};}appendChild(n){this.children.push(n);n.parent=this;}setAttribute(k,v){this.attrs[k]=String(v);}querySelector(k){if(!this.named.has(k))this.named.set(k,new Node());return this.named.get(k);}remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}}
globalThis.document={createElement:()=>new Node(),createElementNS:()=>new Node()};
const parent=new Node(),overlay=new KnobAR(parent),allocated=domNodes;
stage.poseAt(song.shots.ar,b=>beatToSec(b,song));stage.setShot('ar');stage.shotCamera.updateMatrixWorld();
for(let i=0;i<100;i++)overlay.render(stage);
check(domNodes===allocated,'AR reuses its DOM nodes on every frame');
const card=overlay.layers[0].cards[0];check(!card.card.hidden&&card.title.textContent==='CUTOFF','AR DOM contains selected control');
check(!card.line.attrs.d.includes('NaN'),'Projected connector is finite');
check(overlay.layers[1].layer.hidden,'Shot has one AR viewport');
stage.arChanges=[];overlay.render(stage);check(card.card.hidden,'No stale card after clearing song');overlay.dispose();check(parent.children.length===0,'AR overlay disposes');
console.table(visibility);console.log(`PASS: ${count} geometry/AR checks; ${process.argv.includes("--layout-only")?"contact sweep checked separately":`maximum actual fingertip surface gap ${(maxGap*1000).toFixed(2)} mm`}. Rendering/font aesthetics require browser review.`);
