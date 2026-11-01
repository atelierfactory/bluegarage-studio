// 独奏はピアノの舞台の骨・指・鍵盤をそのまま使う。演奏の計算は鍵盤の座標、配置だけを世界へ写す。
import * as THREE from 'three';
import {PianoStage,keyX,isBlack,TIP_R,fingerOffsetX,M} from '../../piano/scene.js';
import {buildMotion,motionAt} from '../piano-motion.js';
import {autoFinger} from '../../js/fingering.js';
import {planKey,unpackMotion} from '../piano-plan.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
export class PianoPlayer{
 constructor(stage,song){
  this.stage=stage;this.song=song;this.local=new PianoStage(null,{headless:true});
  this.local.robotParts.core.material=this.local.robotParts.core.material.clone();
  const p=song.players.find(p=>p.id===song.solo.player);
  const cached=song.solo.motionPlan?.key===planKey(song)?song.solo.motionPlan:null;
  this.notes=cached?cached.notes:autoFinger(p.notes.map((n,i)=>({...n,h:n.hand??n.h,sourceNote:i})),{tempo:song.tempo});
  this.local.setSong([],song.ped??[]);this.local.update(0,stage.toSec,0,true);
  this.local.setSong(this.notes,song.ped??[]);
  this.local.motion=cached?unpackMotion(cached):buildMotion(this.notes,stage.toSec,{keyX,fingerOffsetX,palmFor:(h,ns)=>this.local._palmFor(h,ns),fitPalm:(h,g)=>this.local._fitPalm(h,g),canHold:(h,n,p)=>this.local._canHold(h,n,p)});
  this.local._motionTempo=[stage.toSec(1),stage.toSec(this.local.notesRef.at(-1)?.s??0)].join(':');
  // 高音側の両手の跳躍では、腰を滑らせず胴の傾きで腕の届く範囲を広げる。
  const arm=this.local._solveArm.bind(this.local);
  this.local._solveArm=(side,target,dt)=>{
   if(this._performing&&!this._leanDone){this._leanDone=true;let sum=0,w=0;
    for(let i=-3;i<=3;i++){const weight=4-Math.abs(i),sec=this._poseSec+i*.08,L=motionAt(this.local.motion,'L',sec),R=motionAt(this.local.motion,'R',sec);sum+=weight*((L?.palm.x??0)+(R?.palm.x??0))*.5;w+=weight;}
    const goal=Math.max(-.55,Math.min(.55,sum/w*1.6)),names=['LowerBack','Spine','Spine1'],weights=[.5,.3,.2],old=names.reduce((a,name)=>a+this.local.bones[name].rotation.z,0);
    for(let i=0;i<3;i++)this.local.bones[names[i]].rotation.z+=(goal-old)*weights[i];this.local.robot.updateMatrixWorld(true);}
   return arm(side,target,dt);
  };
  this.local._updateCameras=()=>{};
  this.local.update(0,stage.toSec,0,true);
  this.group=new THREE.Group();this.group.name='concert-grand';
  this.group.add(this.local.piano.group,this.local.robot);
  this.group.rotation.y=Math.PI/2;this.group.position.set(.35,0,-2.3);stage.scene.add(this.group);
  this._lengthenGrand();
  this.group.updateMatrixWorld(true);
  this._batch();
  this._dynamicBatches();
  this._cacheFingers();
  const light=new THREE.SpotLight(0xfff1dc,190,10,.65,.6,1.5);light.position.set(2.5,4,-4);light.target.position.set(.3,.8,-2.3);stage.scene.add(light,light.target);this.light=light;
  this.pose(0,0,true);
 }
 _dynamicBatches(){
  const pivots=new Set([...Object.values(this.local.piano.keys).map(k=>k.pivot),...this.local.piano.pedals]);
  for(const b of this.batches){b.dynamic=[];for(let i=0;i<b.list.length;i++){const m=b.list[i];b.mesh.setMatrixAt(b.ids[i],m.matrixWorld);let dynamic=m.name==='key-press-indicator';for(let o=m;o&&o!==this.group;o=o.parent)if(o===this.local.robot||pivots.has(o))dynamic=true;if(dynamic)b.dynamic.push(i);}}
  // 骨や鍵の親は動くが、その中の外装のローカル変換は変わらない。
  this.group.traverse(o=>{if(o.isMesh&&!pivots.has(o)&&o.name!=='key-press-indicator'){o.updateMatrix();o.matrixAutoUpdate=false;}});
 }
 _cacheFingers(){
  const solve=this.local._placeFinger.bind(this.local);this.fingerCache={hit:0,miss:0};
  this.local._placeFinger=(hand,f,p,press,hover)=>{
   if(!this._performing)return solve(hand,f,p,press,hover);
   hand.bone.updateWorldMatrix(true,false);const a=hand.bone.matrixWorld.elements,c=f.concertoCache;
   if(c&&c.p===p&&Math.abs(c.press-press)<1e-10&&c.hover===hover&&a.every((v,i)=>Math.abs(v-c.matrix[i])<1e-9)){
    this.fingerCache.hit++;f.root.rotation.set(0,c.pose[0],c.pose[1]);f.joint.rotation.z=c.pose[2];f.root.updateMatrixWorld(true);f.exactPose=c.pose;return c.residual.clone();
   }
   this.fingerCache.miss++;const residual=solve(hand,f,p,press,hover);f.concertoCache={p,press,hover,matrix:a.slice(),pose:f.exactPose.slice(),residual:residual.clone()};return residual;
  };
 }
 _lengthenGrand(){
  // 鍵盤と奏者を動かさず、響板・側板・弦の奥だけを2.75mの長さへ広げる。
  const g=this.local.piano.group;g.updateMatrixWorld(true);
  const inv=new THREE.Matrix4().copy(g.matrixWorld).invert(),p=V(),q=V();let tail=0,front=-Infinity;
  g.traverse(m=>{if(!m.isMesh||m.isInstancedMesh)return;const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld).applyMatrix4(inv);tail=Math.min(tail,p.z);if(p.z<.35&&p.y>.55)front=Math.max(front,p.z);}});
  const targetTail=front-2.75,pivot=-.38,factor=(targetTail-pivot)/(tail-pivot);
  g.traverse(m=>{
   if(!m.isMesh)return;
   if(m.isInstancedMesh){
    const mat=new THREE.Matrix4(),params=m.geometry.parameters??{},isString=params.radiusTop===1&&params.radiusBottom===1&&params.height===1;
    for(let i=0;i<m.count;i++){
     m.getMatrixAt(i,mat);
     if(isString){
      const a=V(0,0,-.5).applyMatrix4(mat),b=V(0,0,.5).applyMatrix4(mat),radial=Math.hypot(mat.elements[0],mat.elements[1],mat.elements[2]);
      if(a.z<pivot)a.z=pivot+(a.z-pivot)*factor;if(b.z<pivot)b.z=pivot+(b.z-pivot)*factor;
      const d=b.clone().sub(a);mat.compose(a.add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(V(0,0,1),d.clone().normalize()),V(radial,radial,d.length()));
     }else if(mat.elements[14]<pivot){mat.elements[14]=pivot+(mat.elements[14]-pivot)*factor;for(const j of [2,6,10])mat.elements[j]*=factor;}
     m.setMatrixAt(i,mat);
    }
    m.instanceMatrix.needsUpdate=true;return;
   }
   m.geometry=m.geometry.clone();const a=m.geometry.attributes.position,back=new THREE.Matrix4().copy(m.matrixWorld).invert();
   for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld).applyMatrix4(inv);if(p.z<pivot){p.z=pivot+(p.z-pivot)*factor;q.copy(p).applyMatrix4(g.matrixWorld).applyMatrix4(back);a.setXYZ(i,q.x,q.y,q.z);}}
   a.needsUpdate=true;m.geometry.computeVertexNormals();m.geometry.computeBoundingSphere();
  });
  for(const field of ['HAMMER_Z','DAMPER_Z']){const z=this.local.piano[field];if(z<pivot)this.local.piano[field]=pivot+(z-pivot)*factor;}
  this.bodyLength=front-targetTail;
 }
 _batch(){
  // 材質ごとに異なる形もまとめる。指・鍵の行列と表示は元の実物から写す。
  const keys=Object.values(this.local.piano.keys),materials={};
  for(const k of keys){const id=k.black?'black':'white';materials[id]??=k.mesh.material;k.mesh.material=materials[id];}
  const shadowMaterials=new Set([M.shell,M.carbon,...this.local.piano.lidPivot.children.filter(m=>m.isMesh).map(m=>m.material)]);
  const groups=new Map();this.batches=[];
  this.group.traverse(m=>{if(m.isMesh&&!m.isInstancedMesh&&!Array.isArray(m.material))(groups.get(m.material.uuid)??groups.set(m.material.uuid,[]).get(m.material.uuid)).push(m);});
  for(const list of groups.values()){
   const geos=list.map(m=>{
    const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone(),count=g.attributes.position.count;
    for(const name of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(name))g.deleteAttribute(name);
    if(!g.attributes.normal)g.computeVertexNormals();
    if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(count*2),2));
    if(!g.attributes.color)g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(count*3).fill(1),3));
    return g;
   });
   const vertices=geos.reduce((a,g)=>a+g.attributes.position.count,0),mesh=new THREE.BatchedMesh(list.length,vertices,0,list[0].material);
   mesh.name='grand.parts';mesh.frustumCulled=false;mesh.perObjectFrustumCulled=false;mesh.sortObjects=false;mesh.castShadow=shadowMaterials.has(list[0].material);mesh.receiveShadow=true;
   const ids=geos.map(g=>mesh.addInstance(mesh.addGeometry(g)));this.stage.scene.add(mesh);
   for(const m of list){m.userData.batchOriginalVisible=m.visible;m.visible=false;}
   this.batches.push({mesh,list,ids});
  }
 }
 pose(sec,dt,playing=true){
  // 既存IKは親が単位行列の前提。計算中だけ配置を外し、そのあと実物全体を同じ剛体変換で置く。
  this.group.position.set(0,0,0);this.group.rotation.y=0;this.group.updateMatrix();this.group.matrixWorld.copy(this.group.matrix);this.local.robot.updateMatrixWorld(true);
  this._poseSec=sec;this._performing=true;this._leanDone=false;this.local.update(this.stage.toBeat(Math.max(0,sec)),this.stage.toSec,dt,playing);this._performing=false;
  this.group.position.set(.35,0,-2.3);this.group.rotation.y=Math.PI/2;this.group.updateMatrixWorld(true);
  for(const b of this.batches)for(const i of b.dynamic??b.list.keys()){const m=b.list[i];b.mesh.setMatrixAt(b.ids[i],m.matrixWorld);b.mesh.setVisibleAt(b.ids[i],m.name==="key-press-indicator"?m.visible:m.userData.batchOriginalVisible);}
 }
 world(p){return this.group.localToWorld(p.clone());}
 framePoints(mode='hands'){
  if(mode==='profile')return [V(-.9,.03,-.25),V(.9,1.7,.9),V(-.9,1.7,.9),V(.9,.03,-.25)].map(p=>this.world(p));
  // 動く手だけへ追従すると跳躍でカメラが跳ぶ。88鍵全幅の固定枠を使う。
  return [-.69,.69].flatMap(x=>[.69,1.05].flatMap(y=>[-.23,.32].map(z=>this.world(V(x,y,z)))));
 }
 contacts(indices=null){
  const out=[],plan=this.local.motion;
  for(const n of plan.notes){if(indices?!indices.has(n._i):Math.abs(n._s-this.stage.sec)>1e-7)continue;
   const side=n.h==='L'?'Left':'Right',f=this.local.hands[side].fingers[n._f],tip=f.tip.getWorldPosition(V());
   const localTip=this.group.worldToLocal(tip.clone()),k=this.local.piano.keys[n.p],black=isBlack(n.p),zLo=black?-.145:-.12,zHi=black?-.06:-.004,z=Math.max(zLo,Math.min(zHi,localTip.z));
   const dip=(k?.press??0)*(.010/(black?.095:.150))*(z+.170),target=V(keyX(n.p),(black?.7514:.735)-dip+TIP_R,z);
   out.push({i:n._i,sourceNote:n.sourceNote,bar:n.bar,p:n.p,h:n.h,f:n._f+1,gap:tip.distanceTo(this.world(target)),press:k?.press??0,tip:tip.toArray(),target:this.world(target).toArray(),released:!!n._visualRelease});
  }return out;
 }
}
