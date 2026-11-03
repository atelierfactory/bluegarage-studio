// 腕の「瞬間移動」を数える: 60 コマ/秒で曲を最後まで流し、ひじと手首が 1 コマで動いた距離を測る。
// チンパンジーの皮では、ロボットでは気にならなかった 1 コマの大きな飛びが目立つ (2026-11-02 さとるん)。
// node --experimental-loader ./tools/band-node-loader.mjs tools/band-smooth-check.mjs [曲名の一部]
import fs from 'node:fs';
import { beatToSec } from '../public/js/state.js';
import { partsFromSong } from '../public/band/model.js';
import { knobDefaults } from '../public/js/synth2.js';
const ctx={fillRect(){},strokeRect(){},fillText(){},measureText(s){return {width:s.length*22};}};
globalThis.document={createElement(){return {getContext(){return ctx;}};}};
const THREE=await import('three');
const { BandStage }=await import('../public/band/scene.js');
const stage=new BandStage(null,{headless:true});
const dir=new URL('../public/band/repertoire/',import.meta.url);
const list=JSON.parse(fs.readFileSync(new URL('index.json',dir),'utf8'));
const LIMIT=30;   // mm/コマ (= 1.8 m/秒)。速い動き
const JERK=40;    // mm/コマ: 1 コマの動きが前のコマの動きから急に変わった量。瞬間移動はここに出る (速くても続いた動きは出ない)
const parts=['LeftForeArm','LeftHand','RightForeArm','RightHand'];
const all=[];
for(const item of list) {
  if(process.argv[2]&&!item.file.includes(process.argv[2])) continue;
  const {song}=JSON.parse(fs.readFileSync(new URL(item.file,dir),'utf8'));
  stage.setSong(partsFromSong(song),knobDefaults(song.tracks[0].synth2));
  const b2s=b=>beatToSec(b,song), end=b2s(song.sections.reduce((a,s)=>a+s.bars,0)*song.timeSig);
  // 秒→拍は二分探索で
  const s2b=(sec)=>{let lo=0,hi=4096;for(let i=0;i<50;i++){const m=(lo+hi)/2;if(b2s(m)<sec)lo=m;else hi=m;}return lo;};
  const dt=1/60, prev={}, step={}, d={}, j={}; for(const p of parts){d[p]=[];j[p]=[];}
  const worst=[];
  for(let i=0;i*dt<end;i++){
    const sec=i*dt; stage.update(s2b(sec),b2s,dt,true);
    for(const p of parts){const w=stage.bones[p].getWorldPosition(new THREE.Vector3());
      if(prev[p]){const s=w.clone().sub(prev[p]);const mm=s.length()*1000;d[p].push(mm);
        if(step[p]){const jm=s.distanceTo(step[p])*1000;j[p].push(jm);if(jm>JERK)worst.push([+sec.toFixed(2),p,+mm.toFixed(0),+jm.toFixed(0)]);}
        step[p]=s;}
      prev[p]=w;}
  }
  const stat=Object.fromEntries(parts.map(p=>{const a=d[p].slice().sort((x,y)=>x-y);const b=j[p].slice().sort((x,y)=>x-y);return [p,{max:+a.at(-1).toFixed(1),over:a.filter(x=>x>LIMIT).length,jerkMax:+b.at(-1).toFixed(1),jerkOver:b.filter(x=>x>JERK).length}];}));
  worst.sort((a,b)=>b[3]-a[3]);
  const r={file:item.file,frames:d[parts[0]].length,stat,worst:worst.slice(0,6)};
  all.push(r); console.log(JSON.stringify(r));
}
const over=all.reduce((a,r)=>a+Object.values(r.stat).reduce((b,s)=>b+s.over,0),0), jo=all.reduce((a,r)=>a+Object.values(r.stat).reduce((b,s)=>b+s.jerkOver,0),0);
console.log(`合計: 1 コマ ${LIMIT} mm を超えた回数 ${over}・動きが 1 コマで ${JERK} mm 以上急に変わった回数 ${jo}`);
