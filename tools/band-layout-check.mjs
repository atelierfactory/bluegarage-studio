// 配置 (椅子・シンセ・足鍵盤・ドラム) の確かめ。配置の画面の「確かめる」で、手元のサーバーが BAND_LAYOUT (JSON) つきで呼ぶ。
// 全部の曲を通して、手足が楽器に届かなかった数 (叩きの検査と同じ測り方) と、ひじが肩よりどれだけ後ろへ出るかを JSON で出す。
// node --experimental-loader ./tools/band-node-loader.mjs tools/band-layout-check.mjs
import fs from 'node:fs';
import * as THREE from 'three';
import { beatToSec } from '../public/js/state.js';
import { partsFromSong } from '../public/band/model.js';
import { knobDefaults } from '../public/js/synth2.js';
const ctx={fillRect(){},strokeRect(){},fillText(){},measureText(s){return {width:s.length*22};}};
globalThis.document={createElement(){return {getContext(){return ctx;}};}};
const { BandStage }=await import('../public/band/scene.js');
const LAYOUT=(await import('../public/band/layout.js')).default;
const stage=new BandStage(null,{headless:true});
const dir=new URL('../public/band/repertoire/',import.meta.url);
const list=JSON.parse(fs.readFileSync(new URL('index.json',dir),'utf8'));
const W=(n)=>stage.bones[n].getWorldPosition(new THREE.Vector3());
const misses={synth:0,drum:0,pedal:0,kick:0,knob:0}, songs=[], back={Left:[],Right:[]};
// ONLY=曲のファイル名の一部 で曲をしぼる・NOELBOW=1 でひじの測りを省く (配置をさがすとき用)
for(const item of list.filter(i=>!process.env.ONLY||i.file.includes(process.env.ONLY))){
  const {song}=JSON.parse(fs.readFileSync(new URL(item.file,dir),'utf8'));
  stage.setSong(partsFromSong(song),knobDefaults(song.tracks[0].synth2));
  const b2s=b=>beatToSec(b,song);
  const r=stage.rehearse(b2s); const c={}; for(const m of r.misses){c[m.kind]=(c[m.kind]??0)+1; misses[m.kind]=(misses[m.kind]??0)+1;}
  songs.push({title:item.title,misses:c});
  if(process.env.NOELBOW)continue;
  // ひじ: 曲を 1/15 秒ごとに通して、ひじが肩より後ろ (チンパンジーの背中側) へ出た長さ
  const s2b=(sec)=>{let lo=0,hi=4096;for(let i=0;i<50;i++){const m=(lo+hi)/2;if(b2s(m)<sec)lo=m;else hi=m;}return lo;};
  const end=b2s(song.sections.reduce((a,s)=>a+s.bars,0)*song.timeSig);
  stage._initPose(); const fwd=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),LAYOUT.seat.yaw);
  for(let i=0;i/15<end;i++){stage.update(s2b(i/15),b2s,1/15,true); for(const sd of ['Left','Right']) back[sd].push(-W(sd+'ForeArm').sub(W(sd+'Arm')).dot(fwd)*100);}
}
const stat=(a)=>{if(!a.length)return {mean:0,p95:0};a.sort((x,y)=>x-y);return {mean:+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1),p95:+a[Math.floor(a.length*.95)].toFixed(1)};};
console.log(JSON.stringify({layout:LAYOUT,misses,songs,elbowBackCm:{left:stat(back.Left),right:stat(back.Right)}}));
