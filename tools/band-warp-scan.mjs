// 手の「ワープ」の場所を全部出す: 60 コマ/秒で曲を流し、手首・指先・スティックの先が 1 コマで LIMIT mm より動いた所を、続いたコマをまとめて 1 件にして並べる。
// 1 件ごとに、拍・秒・その時の右手の状態 (鍵 key / つまみ knob) と、いちばん大きい 1 コマの動き (mm) を出す。
// node --experimental-loader ./tools/band-node-loader.mjs tools/band-warp-scan.mjs <曲名の一部> [LIMIT=25]
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
const LIMIT=+(process.argv[3]??25);
const item=list.find(x=>x.file.includes(process.argv[2]??'classic-medley'));
const {song}=JSON.parse(fs.readFileSync(new URL(item.file,dir),'utf8'));
stage.setSong(partsFromSong(song),knobDefaults(song.tracks[0].synth2));
const b2s=b=>beatToSec(b,song), end=b2s(song.sections.reduce((a,s)=>a+s.bars,0)*song.timeSig);
const s2b=(sec)=>{let lo=0,hi=4096;for(let i=0;i<50;i++){const m=(lo+hi)/2;if(b2s(m)<sec)lo=m;else hi=m;}return lo;};
const parts=['RightHand','RightF1t','RightF2t','LeftHand','RightFoot','LeftFoot'].filter(p=>stage.bones[p]);
const dt=1/60, prev={}, ev=[]; let open={};
for(let i=0;i*dt<end;i++){
  const sec=i*dt, beat=s2b(sec); stage.update(beat,b2s,dt,true);
  for(const p of parts){const w=stage.bones[p].getWorldPosition(new THREE.Vector3());
    if(prev[p]){const mm=w.distanceTo(prev[p])*1000;
      if(mm>LIMIT){ if(open[p]&&i-open[p].last<=2){open[p].last=i;open[p].n++;if(mm>open[p].max){open[p].max=mm;open[p].at=sec;}}
        else{open[p]={part:p,first:i,last:i,n:1,max:mm,at:sec,beat:+beat.toFixed(2),mode:stage.handR.mode};ev.push(open[p]);} } }
    prev[p]=w;}
}
for(const e of ev) console.log(`${e.part.padEnd(10)} 拍 ${String(e.beat).padStart(7)}  ${(e.first/60).toFixed(2)}〜${(e.last/60).toFixed(2)} 秒  ${e.n} コマ  最大 ${e.max.toFixed(0)} mm (${e.at.toFixed(2)} 秒)  右手 ${e.mode}`);
console.log(`合計 ${ev.length} 件 (1 コマ ${LIMIT} mm を超えた所)`);
