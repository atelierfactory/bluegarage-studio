// Real bones and stick, all bundled attacks plus continuous 60 Hz motion.
// node --experimental-loader ./tools/band-node-loader.mjs tools/band-grip-check.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {beatToSec, secToBeat} from '../public/js/state.js';
import {partsFromSong} from '../public/band/model.js';
import {knobDefaults} from '../public/js/synth2.js';
import './piano-headless.mjs';
// 手 (とスティック) は模型の大きさに HAND_S 倍に縮めてある
const {BandStage, DRUMS, HAND_S, TIP} = await import('../public/band/scene.js');
const stage = new BandStage(null, {headless:true}), V = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const dir = new URL('../public/band/repertoire/', import.meta.url);
const list = JSON.parse(fs.readFileSync(new URL('index.json', dir))), rows=[], failures=[];
const degrees = r=>r*180/Math.PI;
function measure() {
  const h=stage.hands.Left.bone, q=h.getWorldQuaternion(new THREE.Quaternion());
  const wrist=h.getWorldPosition(V()), elbow=stage.bones.LeftForeArm.getWorldPosition(V());
  const shoulder=stage.bones.LeftArm.getWorldPosition(V());
  const fore=wrist.clone().sub(elbow).normalize(), dorsal=V(0,1,0).applyQuaternion(q), forward=V(1,0,0).applyQuaternion(q);
  const tip=stage.stick.tip.getWorldPosition(V()), axis=tip.clone().sub(stage.stick.pivot.getWorldPosition(V())).normalize();
  const boneError=Math.max(Math.abs(shoulder.distanceTo(elbow)-stage.armLen.upper),Math.abs(elbow.distanceTo(wrist)-stage.armLen.fore));
  return {dorsalY:dorsal.y, bend:degrees(forward.angleTo(fore)), stickAngle:degrees(axis.angleTo(fore)), tipError:tip.distanceTo(stage.stickState.tip), reachError:stage.drumGrip.reachError, boneError, tip, axis};
}
// 2026-11-03: 手首の曲がり 15 → 55 度・スティックと前腕 80 → 85 度。ひじを下げて前腕と手首で叩き、構えの手首を曲げた形
// (scene.js WRIST_COCK) で、手首が最大 50.7 度 (上下の返し 50・横 21)・スティックと前腕が最大 83.2 度になった。
// 人やチンパンジーの手首は上下に 60〜80 度・横に 20〜30 度曲がる。15 度はロボットの手首のときの値。折れた手首 (117 度) は下で今も落ちる
function valid(m) {return m.dorsalY>.5 && m.bend<55 && m.stickAngle>45 && m.stickAngle<85 && m.tipError<.000001 && m.reachError<.000001 && m.boneError<1e-9;}
for(const item of list.filter(x=>!process.env.ONLY||x.file.includes(process.env.ONLY))) {   // ONLY=曲のファイル名の一部 で曲をしぼる
  const {song}=JSON.parse(fs.readFileSync(new URL(item.file, dir))), toSec=b=>beatToSec(b,song);
  stage.setSong(partsFromSong(song), knobDefaults(song.tracks[0].synth2));
  const r={file:item.file,attacks:0,frames:0,minDorsalY:1,maxWristBend:0,minStickAngle:180,maxStickAngle:0,maxTipErrorMm:0,maxPadGapMm:0,maxGripGapMm:0,minDownwardAngle:90,byDrum:{}};
  const sample=(beat,hit=null)=>{
    const m=measure();r.minDorsalY=Math.min(r.minDorsalY,m.dorsalY);r.maxWristBend=Math.max(r.maxWristBend,m.bend);r.minStickAngle=Math.min(r.minStickAngle,m.stickAngle);r.maxStickAngle=Math.max(r.maxStickAngle,m.stickAngle);r.maxTipErrorMm=Math.max(r.maxTipErrorMm,m.tipError*1000);
    if(!valid(m))failures.push({file:item.file,beat,hit:hit?.k,...m,tip:undefined});
    if(hit){
      r.attacks++;r.byDrum[hit.k]=(r.byDrum[hit.k]??0)+1;
      const d=DRUMS[hit.k],local=m.tip.clone().sub(d.pos).applyAxisAngle(V(1,0,0),-d.tilt);
      const approach=m.axis.dot(V(0,1,0).applyAxisAngle(V(1,0,0),d.tilt));
      r.minDownwardAngle=Math.min(r.minDownwardAngle,-degrees(Math.asin(approach)));
      if(approach>-.02)failures.push({file:item.file,beat,reason:'stick approaches underside',approach});
      r.maxPadGapMm=Math.max(r.maxPadGapMm,Math.abs(local.y)*1000);
      if(Math.abs(local.y)>.015||Math.hypot(local.x,local.z)>d.r*.95)failures.push({file:item.file,beat,reason:'drum contact',local:local.toArray()});
      for(const f of stage.hands.Left.fingers){
        const point=stage.stick.pivot.worldToLocal(f.tip.getWorldPosition(V()));
        const gap=(Math.hypot(point.x,point.z)-.12)*.061*HAND_S-TIP;
        r.maxGripGapMm=Math.max(r.maxGripGapMm,Math.abs(gap)*1000);
        if(Math.abs(gap)>.005)failures.push({file:item.file,beat,reason:'finger grip',gap});
      }
    }else r.frames++;
  };
  let sec=0;
  for(const hit of stage.song.drums){
    const at=toSec(hit.s);
    while(sec+1/60<at-1e-8){sec+=1/60;const beat=secToBeat(sec,song);stage.update(beat,toSec,1/60,true);sample(beat);}
    // The same pose entry used by bandShot, exactly on every scored attack.
    stage.poseAt(hit.s,toSec);sample(hit.s,hit);sec=at;
  }
  for(const k of ['minDorsalY','maxWristBend','minStickAngle','maxStickAngle','maxTipErrorMm','maxPadGapMm','maxGripGapMm','minDownwardAngle'])r[k]=+r[k].toFixed(4);
  rows.push(r);
}
// A deliberately inverted hand and a folded wrist must fail the same criteria.
const original=stage.hands.Left.bone.quaternion.clone();stage.hands.Left.bone.rotateX(Math.PI);stage.robot.updateMatrixWorld(true);assert.ok(!valid(measure()),'Detect upside-down palm');stage.hands.Left.bone.quaternion.copy(original);stage.hands.Left.bone.rotateY(Math.PI*.65);stage.robot.updateMatrixWorld(true);assert.ok(!valid(measure()),'Detect folded wrist');stage.hands.Left.bone.quaternion.copy(original);
// Refinement only replaces visible shells; no fat capsule or large wrist ball remains.
for(const side of ['Left','Right']){
  const fore=stage.bones[side+'ForeArm'],hand=stage.hands[side];
  assert.ok(fore.children.some(c=>c.name==='forearm-shell'));
  assert.ok(!fore.children.some(c=>c.children.some(m=>m.geometry?.type==='CapsuleGeometry')));
  assert.ok(!hand.bone.children.some(c=>c.geometry?.type==='SphereGeometry'&&c.position.length()<1e-9));
}
// 落ちた理由ごとの数 (どの決まりで落ちたか)
const why=f=>f.reason??[f.dorsalY<=.5&&'dorsal',f.bend>=55&&'bend',f.stickAngle<=45&&'stickLow',f.stickAngle>=85&&'stickHigh',f.tipError>=1e-6&&'tip',f.reachError>=1e-6&&'reach',f.boneError>=1e-9&&'bone'].filter(Boolean).join('+');
const reasons={};for(const f of failures){const k=why(f);reasons[k]=(reasons[k]??0)+1;}
console.log(JSON.stringify({rows,failures:failures.length,reasons,examples:failures.slice(0,12)},null,2));
assert.equal(failures.length,0,'Dorsal hemisphere, wrist bend, stick direction and contact preservation');
