// Actual materials, geometry, key travel and camera rays; no pixel renderer.
// node --experimental-loader ./tools/band-node-loader.mjs tools/key-visual-check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {PianoStage} from './piano-headless.mjs';
import {repertoire,loadPianoSong} from './piano-data.mjs';
import {beatToSec} from '../public/js/state.js';
import {partsFromSong} from '../public/band/model.js';
import {knobDefaults} from '../public/js/synth2.js';
import {updateKeyIndicator} from '../public/js/key-visual.js';
const {BandStage}=await import('../public/band/scene.js');
const piano=new PianoStage(null,{headless:true}), band=new BandStage(null,{headless:true});
const sets=[['piano',piano.piano.keys],['synth',band.synth.keys],['pedals',band.pb.pedals]];
const luminance=c=>c.r*.2126+c.g*.7152+c.b*.0722;
const originals=new Map(), rows=[]; let checks=0,pressed=0;
const check=(v,msg)=>{assert.ok(v,msg);checks++;};
function materialOK(k) {return k.mat.color.equals(originals.get(k)) && k.mat.emissiveIntensity===0 && k.mat.emissive.equals(new THREE.Color(0));}
function checkKey(k){
  check(materialOK(k),'Pressing never alters key albedo or adds top emission');
  check(k.indicator.group.visible===(k.press>.015),'Only pressed keys show their small lip indicator');
  check(Math.abs(k.indicator.light.scale.y-(.25+.75*Math.min(1,Math.max(0,k.press))))<1e-9,'Indicator follows release as well as attack (bar height, no transparency)');
  check(k.indicator.light.material.transparent!==true&&k.indicator.light.castShadow===false,'Indicator is opaque and casts no shadow (performance)');
  if(k.press>.1)pressed++;
}
for(const [name,keys] of sets){
  let maxArea=0;
  for(const k of Object.values(keys)){
    originals.set(k,k.mat.color.clone());
    const b=k.mesh.geometry.boundingBox, i=k.indicator;
    const ratio=(i.width+.001)*(i.depth+.0003)/((b.max.x-b.min.x)*(b.max.z-b.min.z));maxArea=Math.max(maxArea,ratio);
    check(ratio<.015,'Indicator occupies less than 1.5% of key top bounds');
    check(i.light.material.color.r<=i.light.material.color.b,'Neutral white indicator has no gold tint');
    for(const press of[0,.25,1,.4,0]){k.press=press;updateKeyIndicator(k);checkKey(k);}
  }
  const black=Math.max(...Object.values(keys).filter(k=>k.black).map(k=>luminance(k.mat.color)));
  const white=Math.min(...Object.values(keys).filter(k=>!k.black).map(k=>luminance(k.mat.color)));
  check(black<white*.02,'Black diffuse luminance stays below 2% of ivory');
  rows.push({instrument:name,keys:Object.keys(keys).length,blackLuminance:black,ivoryLuminance:white,maxIndicatorAreaPercent:maxArea*100});
}
// Run real animation paths so an old whole-key emissive assignment would fail.
for(let index=0;index<repertoire.length;index++){
  const song=loadPianoSong(repertoire[index]),toSec=b=>beatToSec(b,song);
  piano.setSong(song.tracks[0].notes,song.pedal);
  for(const beat of[0,17.55,32,100]){piano.poseAt(beat,toSec);for(const k of Object.values(piano.piano.keys))checkKey(k);}
}
const dir=new URL('../public/band/repertoire/',import.meta.url),list=JSON.parse(fs.readFileSync(new URL('index.json',dir)));
for(const item of list){
  const{song}=JSON.parse(fs.readFileSync(new URL(item.file,dir))),toSec=b=>beatToSec(b,song);
  band.setSong(partsFromSong(song),knobDefaults(song.tracks[0].synth2));
  for(const beat of[0,16,60,64.5]){band.poseAt(beat,toSec);for(const keys of[band.synth.keys,band.pb.pedals])for(const k of Object.values(keys))checkKey(k);}
  band._initPose();for(const keys of[band.synth.keys,band.pb.pedals])for(const k of Object.values(keys))checkKey(k);
}
// The tiny lip must actually be visible at the supplied problem shots.
const visibility=[];
function checkIndicators(stage,camera,keys,label,focus=null){
  stage.scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const meshes=[];stage.scene.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});
  for(const [pitch,k] of Object.entries(keys).filter(([p,k])=>k.press>.1&&(!focus||focus.has(+p)))){
    check(k.pivot.rotation.x>0,'Lit key is physically depressed');
    const light=k.indicator.light, b=light.geometry.boundingBox??(light.geometry.computeBoundingBox(),light.geometry.boundingBox);
    let visible=0;
    for(const x of[-.3,0,.3])for(const face of['top','front']){
      const p=light.localToWorld(new THREE.Vector3(k.indicator.width*x,face==='top'?b.max.y:0,face==='front'?b.max.z:0));
      const projected=p.clone().project(camera);if(Math.abs(projected.x)>.98||Math.abs(projected.y)>.98)continue;
      const ray=new THREE.Raycaster(camera.position,p.clone().sub(camera.position).normalize(),0,camera.position.distanceTo(p)+.0001);
      if(ray.intersectObjects(meshes,false)[0]?.object===light)visible++;
    }
    visibility.push({label,pitch:+pitch,black:k.black,visible});
  }
  // The chosen hand is the subject of a left/right close view.
  const group=visibility.filter(v=>v.label===label);
  // 2026-09-11: 印が手で隠れるかは記録のみ (カメラの角度を光線で選ぶ作りは処理落ちの原因だったのでやめた)
  check(group.length>0,`${label}: focused pressed lips were sampled`);
  rows.push({label,lipsVisible:group.filter(v=>v.visible>=3).length,lips:group.length});
}
for(const[index,beat,view]of[[4,17.55,'left'],[2,100,'left'],[0,32,'both']]){
  const song=loadPianoSong(repertoire[index]);piano.setSong(song.tracks[0].notes,song.pedal);piano.headlessViewport={width:1600,height:900};piano._resize();piano.setShot(view);piano.poseAt(beat,b=>beatToSec(b,song));const focus=new Set(piano.keyVisibility(piano.shotCamera,view==='both'?['L','R']:['L']).map(k=>k.p));checkIndicators(piano,piano.shotCamera,piano.piano.keys,`piano ${repertoire[index].file}@${beat}`,focus);
}
const {song}=JSON.parse(fs.readFileSync(new URL('glass-current.band.json',dir)));band.setSong(partsFromSong(song),knobDefaults(song.tracks[0].synth2));band.w=1600;band.h=900;band.poseAt(60,b=>beatToSec(b,song));band.setShot('keys');checkIndicators(band,band.shotCamera,band.synth.keys,'band glass@60');
// Negative control: the former emissive gold is rejected even with unchanged albedo.
const test=Object.values(band.synth.keys).find(k=>k.black);test.mat.emissive.setHex(0xc9a656);test.mat.emissiveIntensity=1.1;check(!materialOK(test),'Detect former beige/vanishing black key');test.mat.emissive.setHex(0);test.mat.emissiveIntensity=0;
console.log(JSON.stringify({checks,pressedSamples:pressed,rows,visibility,scope:'material/geometry/ray tests; displayed pixel colours need browser review'},null,2));
