// チンパンジーの皮が楽器にめり込んでいないかを測る (2026-11-03 さとるん「キーボードに体がめり込んでる」)。
// 演奏ページと同じ皮 (chimp.js の loadChimp) を同じ骨に着せ、曲を 0.2 秒ごとに動かして、皮の点が楽器の形の中に入った深さを測る。
//   体 = 手と指以外の点。手 = 手と指の点 (鍵盤を押すので鍵の上面は数えない)
//   シンセ: 鍵より手前は鍵の上面 (y=0) まで、鍵より奥はパネルの上まで、を箱とみなす。太鼓は胴の円柱、シンバルは薄い円盤、バスドラは横向きの円柱
//   ほかに、楽器どうしの重なり (外形の箱どうし) も出す
// node --experimental-loader ./tools/band-node-loader.mjs tools/band-body-check.mjs   (ONLY=曲のファイル名の一部・STEP=秒・BAND_LAYOUT で配置)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { beatToSec, secToBeat } from '../public/js/state.js';
import { partsFromSong } from '../public/band/model.js';
import { knobDefaults } from '../public/js/synth2.js';
const ctx={fillRect(){},strokeRect(){},fillText(){},measureText(s){return {width:s.length*22};}};
globalThis.document={createElement(){return {getContext(){return ctx;}};}};
globalThis.fetch=async(url)=>{const b=fs.readFileSync(fileURLToPath(url));return {json:async()=>JSON.parse(b.toString('utf8')),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
THREE.TextureLoader.prototype.load=function(){return new THREE.Texture();};
const S=await import('../public/band/scene.js');
const { snapshotRest, loadChimp }=await import('../public/band/chimp.js');
const stage=new S.BandStage(null,{headless:true});
const mesh=await loadChimp(snapshotRest(stage.bones,stage.hands));
const sk=mesh.skeleton,g=mesh.geometry,pos=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,N=pos.count;
const boneNames=mesh.skeleton.bones.map((b,i)=>(JSON.parse(fs.readFileSync(new URL('../public/band/chimp/chimp.json',import.meta.url))).bones)[i]);
const isHand=n=>/Hand$|F\d[abc]$/.test(n);
const STEP_V=+(process.env.VSTEP??3),verts=[];
for(let i=0;i<N;i+=STEP_V){let best=0,bi=0;for(let k=0;k<4;k++){const w=sw.getComponent(i,k);if(w>best){best=w;bi=si.getComponent(i,k);}}verts.push({i,bone:boneNames[bi],hand:isHand(boneNames[bi])});}

// ── 楽器の形 (描く前は位置の行列が更新されていないので、先に場面全体を更新する)
stage.scene.updateMatrixWorld(true);
const kb=stage.synth.group;kb.updateMatrixWorld(true);
const inv=new THREE.Matrix4().copy(kb.matrixWorld).invert(),box=new THREE.Box3(),tmp=new THREE.Box3();
kb.traverse(o=>{if(!o.isMesh)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();tmp.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld));if((tmp.min.y+tmp.max.y)/2<-.08)return;box.union(tmp);});
const zs=S.KEY_PIVOT_Z,front={min:new THREE.Vector3(box.min.x,box.min.y,zs),max:new THREE.Vector3(box.max.x,0,box.max.z)},back={min:box.min.clone(),max:new THREE.Vector3(box.max.x,box.max.y,zs)};
const shapes=[];
shapes.push({name:'シンセ(鍵の手前)',test:p=>{const l=p.clone().applyMatrix4(inv);return insideBox(l,front)*S.KB_SCALE;},handsToo:false});
// 手は、つまみを回すので鍵の奥 (パネルの上のつまみ) とは比べない
shapes.push({name:'シンセ(鍵の奥)',test:p=>{const l=p.clone().applyMatrix4(inv);return insideBox(l,back)*S.KB_SCALE;},handsToo:false});
for(const [k,d] of Object.entries(stage.drums.pads)){
  const hInv=new THREE.Matrix4().copy(d.holder.matrixWorld).invert();
  if(d.kind==='drum')shapes.push({name:`太鼓 ${k}`,test:p=>{const l=p.clone().applyMatrix4(hInv);return Math.min(d.r-Math.hypot(l.x,l.z),-l.y,l.y+d.depth);},handsToo:true});
  else shapes.push({name:`シンバル ${k}`,test:p=>{const l=p.clone().applyMatrix4(hInv);return Math.min(d.r-Math.hypot(l.x,l.z),l.y+.012,.04-l.y);},handsToo:true});
}
const kick=stage.drums.kick,kInv=new THREE.Matrix4().copy(kick.matrixWorld).invert();
shapes.push({name:'バスドラ',test:p=>{const l=p.clone().applyMatrix4(kInv);return Math.min(S.KICK_R-Math.hypot(l.x,l.y),S.KICK_DEPTH/2-Math.abs(l.z));},handsToo:true});
function insideBox(l,b){return Math.min(l.x-b.min.x,b.max.x-l.x,l.y-b.min.y,b.max.y-l.y,l.z-b.min.z,b.max.z-l.z);}

// 楽器どうしの重なり: それぞれの楽器の表面に点を並べ、ほかの楽器の形の中に 1 cm より深く入った点を数える
const seatTop=.51+S.SEAT_Y;
shapes.push({name:'椅子',test:p=>Math.min(.17-Math.hypot(p.x-S.SEAT_X,p.z-S.SEAT_Z),seatTop-p.y,p.y-(seatTop-.05)),handsToo:true,body:false});
const pbBox=new THREE.Box3();{stage.pb.group.updateMatrixWorld(true);stage.pb.group.traverse(m=>{if(!m.isMesh)return;if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();pbBox.union(tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));});}
shapes.push({name:'足鍵盤',test:p=>Math.min(p.x-pbBox.min.x,pbBox.max.x-p.x,p.y-pbBox.min.y,pbBox.max.y-p.y,p.z-pbBox.min.z,pbBox.max.z-p.z),handsToo:true,body:false});
const ring=(m,r,y,n=20,axis='y')=>Array.from({length:n},(_,i)=>{const a=i*Math.PI*2/n;const v=axis==='y'?new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r):new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r,y);return v.applyMatrix4(m);});
const surf={};
for(const [k,d] of Object.entries(stage.drums.pads)){const m=d.holder.matrixWorld;surf[d.kind==='drum'?`太鼓 ${k}`:`シンバル ${k}`]=d.kind==='drum'?[0,.5,1].flatMap(f=>ring(m,d.r*.98,-d.depth*f*.98-.002)).concat(ring(m,d.r*.5,-.002,8)):[.35,.7,.97].flatMap(f=>ring(m,d.r*f,.005,16));}
surf['バスドラ']=[-.48,0,.48].flatMap(f=>ring(kick.matrixWorld,S.KICK_R*.98,S.KICK_DEPTH*f,20,'z'));
{const pts=[];for(const b of [front,back])for(let i=0;i<=6;i++)for(let j=0;j<=3;j++)for(let k=0;k<=3;k++){if(i%6&&j%3&&k%3)continue;pts.push(new THREE.Vector3(b.min.x+(b.max.x-b.min.x)*i/6,b.min.y+(b.max.y-b.min.y)*j/3,b.min.z+(b.max.z-b.min.z)*k/3).applyMatrix4(kb.matrixWorld));}surf['シンセ(鍵の手前)']=pts;}
surf['椅子']=ring(new THREE.Matrix4().makeTranslation(S.SEAT_X,seatTop-.005,S.SEAT_Z),.165,0,20);
surf['足鍵盤']=[];for(let i=0;i<=8;i++)for(let k=0;k<=3;k++)surf['足鍵盤'].push(new THREE.Vector3(pbBox.min.x+(pbBox.max.x-pbBox.min.x)*i/8,pbBox.max.y-.003,pbBox.min.z+(pbBox.max.z-pbBox.min.z)*k/3));
const overlaps=[];
for(const [an,pts] of Object.entries(surf))for(const sh of shapes){const same=sh.name===an||(an.startsWith('シンセ')&&sh.name.startsWith('シンセ'));if(same)continue;let n=0,dmax=0;for(const p of pts){const d=sh.test(p);if(d>.01){n++;dmax=Math.max(dmax,d);}}if(n)overlaps.push(`${an} が ${sh.name} に ${n} 点・最大 ${(dmax*100).toFixed(1)} cm`);}

// ── 曲を動かして測る
const dir=new URL('../public/band/repertoire/',import.meta.url),list=JSON.parse(fs.readFileSync(new URL('index.json',dir),'utf8'));
const STEP=+(process.env.STEP??0.2),M=sk.bones.map(()=>new THREE.Matrix4()),v=new THREE.Vector3(),o=new THREE.Vector3();
const res={};let frames=0,gripBad=0,cramp=0,elbowBack=0;const misses={},eb={};
const fwd=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),stage.robot.rotation.y-Math.PI);
for(const item of list.filter(x=>!process.env.ONLY||process.env.ONLY.split(',').some(o=>x.file.includes(o)))){
  const {song}=JSON.parse(fs.readFileSync(new URL(item.file,dir),'utf8'));stage.setSong(partsFromSong(song),knobDefaults(song.tracks[0].synth2));
  const b2s=b=>beatToSec(b,song),end=b2s(song.sections.reduce((a,s)=>a+s.bars,0)*song.timeSig);stage._initPose?.();
  for(let t=0;t<end;t+=STEP){
    stage.update(secToBeat(t,song),b2s,STEP,true);mesh.userData.updateFingers?.();stage.robot.updateMatrixWorld(true);frames++;
    if((stage.drumGrip?.reachError??0)>1e-6)gripBad++;   // スティックを握る形が腕の長さで作れない
    // 姿勢: 鍵盤を弾いている間は手のひらが肩より 5 cm 以上前 (体の前の向き)・ひじが肩より 8 cm 以上うしろへ出ない
    {const W=n=>stage.bones[n].getWorldPosition(new THREE.Vector3());
     if(stage.handR.mode==='keys'){const d=stage.hands.Right.bone.getWorldPosition(new THREE.Vector3()).sub(W('RightArm'));if(d.dot(fwd)<.05)cramp++;}
     for(const sd of ['Left','Right'])if(W(sd+'ForeArm').sub(W(sd+'Arm')).dot(fwd)<-.08){elbowBack++;eb[sd]=(eb[sd]??0)+1;}}
    sk.bones.forEach((b,i)=>M[i].multiplyMatrices(b.matrixWorld,sk.boneInverses[i]));
    const worst={};
    for(const vt of verts){
      v.fromBufferAttribute(pos,vt.i);o.set(0,0,0);
      for(let k=0;k<4;k++){const w=sw.getComponent(vt.i,k);if(w)o.addScaledVector(v.clone().applyMatrix4(M[si.getComponent(vt.i,k)]),w);}
      for(const sh of shapes){if(vt.hand&&!sh.handsToo)continue;if(sh.body===false&&!vt.hand)continue;const d=sh.test(o);if(d>.005){const key=`${sh.name} / ${vt.hand?'手':'体'}`;if(!worst[key]||d>worst[key].d)worst[key]={d,bone:vt.bone};}}
    }
    for(const [k,w] of Object.entries(worst)){const r=res[k]??={frames:0,maxCm:0,bones:{},first:null};r.frames++;r.maxCm=Math.max(r.maxCm,w.d*100);r.bones[w.bone]=(r.bones[w.bone]??0)+1;r.first??=`${item.title} ${t.toFixed(1)}秒`;}
  }
  if(process.env.FIT){const r=stage.rehearse(b2s);for(const m of r.misses)misses[m.kind]=(misses[m.kind]??0)+1;}
}
for(const r of Object.values(res)){r.maxCm=+r.maxCm.toFixed(1);r.bones=Object.entries(r.bones).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([b,n])=>`${b}:${n}`).join(' ');}
// FIT=1 のとき、配置をさがすための点数 (小さいほどよい): 届かなかった音 ×10 + 握れないコマ + めり込んだコマ (1 cm 超) + 楽器どうしの重なり ×20
const pen=Object.values(res).reduce((a,r)=>a+(r.maxCm>1?r.frames:0),0);
const score=Object.values(misses).reduce((a,b)=>a+b,0)*10+gripBad+pen+overlaps.length*20+cramp+elbowBack;
console.log(JSON.stringify({frames,step:STEP,vertices:verts.length,score,misses,gripBad,cramp,elbowBack,eb,penetration:res,overlaps},null,1));
