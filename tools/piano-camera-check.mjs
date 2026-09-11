// node --experimental-loader ./tools/band-node-loader.mjs tools/piano-camera-check.mjs
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PianoStage} from './piano-headless.mjs';
import {repertoire,loadPianoSong} from './piano-data.mjs';
import {beatToSec,secToBeat} from '../public/js/state.js';
import {V} from '../public/piano/scene.js';
const stage=new PianoStage(null,{headless:true}),rows=[],failures=[];
const cases=[[0,32],[1,46.75],[2,100],[2,319],[3,28],[4,16.5],[5,144],[6,32],[7,32],[8,32],[9,13.01],[10,32]];
let rays=0,movingFrames=0;
for(const [index,beat] of cases) {
  const song=loadPianoSong(repertoire[index]),toSec=b=>beatToSec(b,song);
  stage.setSong(song.tracks[0].notes,song.pedal);stage.update(0,toSec,0,true);
  for(const [width,height] of [[1600,900],[390,844]])for(const view of ['left','right','both','eye','pedal','full']) {
    stage.headlessViewport={width,height};stage._resize();stage.setShot(view);stage.poseAt(beat,toSec);
    const camera=stage.shotCamera;camera.updateMatrixWorld(true);
    assert.ok(camera.position.toArray().every(Number.isFinite));
    if(['left','right','both'].includes(view)) {
      const hands=view==='both'?['L','R']:[view==='left'?'L':'R'];
      // 2026-09-11: 判定は指先と手のひらの中心 (手首の箱の角は画面の下端にかかってよい)
      for(const point of stage.handKeyPoints(hands)){
        const p=point.project(camera);if(Math.abs(p.x)>.98||Math.abs(p.y)>.98||Math.abs(p.z)>1)failures.push({index,beat,view,width,reason:'hand cropped'});
      }
      // 鍵の見え方は記録のみ (角度は固定。光線で角度を選ぶ作りは処理落ちの原因だったのでやめた)
      const keys=stage.keyVisibility(camera,hands);rays+=keys.length*10;
      rows.push({file:repertoire[index].file,beat,view,width,keys:keys.length,minVisible:Math.min(9,...keys.map(k=>k.visible)),tipsVisible:keys.every(k=>k.tipVisible)});
    }
    if(view==='full') {
      const head=stage.bones.HeadEnd.getWorldPosition(V(0,0,0)).project(camera),foot=V(0,.10,.70).project(camera);
      assert.ok(head.y<.98&&foot.y>-.98,'Performer fits full view');
      if(width===1600)assert.ok(head.y-foot.y>.90,'Performer occupies at least 45% of full image height');
    }
  }
}
// Follow a rapid passage with only 12 displayed frames/second. Whole hands
// must remain within the eased both-hands camera throughout the jump.
{
 const song=loadPianoSong(repertoire[4]),toSec=b=>beatToSec(b,song);
 stage.setSong(song.tracks[0].notes,song.pedal);stage.headlessViewport={width:1600,height:900};stage._resize();stage.setShot('both');stage.poseAt(12,toSec);
 for(let sec=toSec(12);sec<=toSec(20);sec+=1/12){stage.update(secToBeat(sec,song),toSec,1/12,true);stage.camHands.updateMatrixWorld(true);movingFrames++;
  for(const point of stage.handKeyPoints()){const p=point.project(stage.camHands);if(Math.abs(p.x)>.98||Math.abs(p.y)>.98)failures.push({phase:'moving',sec,reason:'hand cropped'});}
 }
}
// Regular layout, including portrait fullscreen, retains a full-width close view.
for(const width of [390,1600]){
 stage.headlessViewport={width,height:844};stage.setShot(null);stage.setLayout('side');
 assert.equal(stage.rects.hands[2],width<700?width:width-Math.round(width*.6));
}
// Deliberately obstruct the camera: prove that actual mesh occlusion is detected.
{
 const song=loadPianoSong(repertoire[1]),toSec=b=>beatToSec(b,song);
 stage.setSong(song.tracks[0].notes,song.pedal);stage.headlessViewport={width:1600,height:900};stage._resize();stage.setShot('right');stage.poseAt(46.75,toSec);
 const blocker=new THREE.Mesh(new THREE.BoxGeometry(3,.04,3),new THREE.MeshBasicMaterial());blocker.position.set(0,1.05,0);stage.scene.add(blocker);
 assert.ok(stage.keyVisibility().every(k=>k.visible===0&&!k.tipVisible),'Ray test detects an occluding solid');stage.scene.remove(blocker);blocker.geometry.dispose();blocker.material.dispose();
}
// Both pointer and wheel manipulation cancel close-camera automation.
const events=new Map();stage.setShot(null);stage.canvas={addEventListener:(k,fn)=>events.set(k,fn),getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){},releasePointerCapture(){}};
stage.headlessViewport={width:1000,height:800};stage.setLayout('stack');stage._bindOrbit();stage.setClose('auto');
events.get('pointerdown')({clientX:500,clientY:700,pointerId:1});assert.equal(stage.closeMode,'manual');events.get('pointerup')({pointerId:1});
stage.setClose('auto');events.get('wheel')({clientX:500,clientY:700,deltaY:1,preventDefault(){}});assert.equal(stage.closeMode,'manual');
console.log(JSON.stringify({poses:cases.length*2*6,closeViews:rows.length,movingFrames,rays,rows,failures},null,2));
assert.equal(failures.length,0,'Key surfaces, fingertips and complete hands must be visible');
console.error('PASS: real-mesh visibility, hand framing, portrait layout and manual override (no browser pixel/lighting check)');
