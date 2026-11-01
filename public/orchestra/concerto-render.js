// 遠景は同じ骨の低分割の形、寄りは元の形。画面外の体だけを描画から外す。
import * as THREE from 'three';
import{RobotCrowd}from'./concerto-crowd.js';
export function initRenderDetail(stage){
 // 同じ骨・同じ左右変換の材質違いは、行列の配列も同じ物を使う。
 const groups=new Map(),unique=[];
 for(const p of stage.crowd.parts){const key=p.bone+'/'+p.side+'/'+JSON.stringify(p.cols),prior=groups.get(key);if(prior)p.mesh.instanceMatrix=prior.mesh.instanceMatrix;else{groups.set(key,p);unique.push(p);}}
 const update=stage.crowd.update;stage.crowd.update=()=>update.call({parts:unique,rigs:stage.rigs});stage.crowd.matrixGroups={before:stage.crowd.parts.length,after:unique.length};
 const low=new RobotCrowd(new THREE.Scene(),stage.rigs);
 stage.renderParts=stage.crowd.parts.map((p,i)=>({p,full:p.mesh.geometry,low:low.parts[i].geo,saved:new Float32Array(p.mesh.instanceMatrix.array.length),count:p.mesh.count}));
 stage.renderFrustum=new THREE.Frustum();stage.renderMatrix=new THREE.Matrix4();stage.renderSphere=new THREE.Sphere();stage.renderCentre=new THREE.Vector3();
}
export function renderDetail(st,mode){
 if(!st.renderParts)return;
 const close=mode==='close',restore=mode==='restore',cam=close?st.camClose:st.camMain;
 if(!restore){cam.updateMatrixWorld(true);st.renderFrustum.setFromProjectionMatrix(st.renderMatrix.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse));}
 const frame=st.closeFrame??[],box=new THREE.Box3().setFromPoints(frame),large=box.getSize(st.renderCentre).length()>6,piano=st.closeShot?.includes('piano');
 const low=!restore,visible=[];
 for(let i=0;i<st.rigs.length;i++){
  if(!close||large||restore){visible.push(i);continue;}
  st.renderCentre.setFromMatrixPosition(st.rigs[i].bones.Spine1.matrixWorld);st.renderSphere.set(st.renderCentre,2.1);
  if(st.renderFrustum.intersectsSphere(st.renderSphere))visible.push(i);
 }
 for(const row of st.renderParts){
  const m=row.p.mesh,a=m.instanceMatrix.array,per=row.p.per;
  if(mode==='main')row.saved.set(a);
  if(close){let at=0;for(const i of visible){const begin=i*per*16,end=begin+per*16;a.set(row.saved.subarray(begin,end),at);at+=per*16;}m.count=visible.length*per;}
  else{a.set(row.saved);m.count=row.count;}
  const face=close&&!large&&!piano&&visible.length<30&&row.p.key.startsWith('head.');
  m.visible=m.count>0;m.geometry=low&&!face?row.low:row.full;m.instanceMatrix.needsUpdate=true;
 }
 if(st.pianist){
  const b=new THREE.Box3(new THREE.Vector3(-1.4,-.05,-4.1),new THREE.Vector3(2.2,2.15,-.7)),show=restore||!close||st.renderFrustum.intersectsBox(b);
  for(const row of st.pianist.batches)row.mesh.visible=show;
 }
}
export function detailStats(st,base){
 renderDetail(st,'main');const a=base();renderDetail(st,'close');const b=base();renderDetail(st,'restore');
 const both=st.shotMode!=='main'&&st.shotMode!=='close',first=st.shotMode==='close'?b:a;
 const shadow=a.triangles-a.perView.triangles*(both?2:1);
 return{...first,calls:(both?a.perView.calls+b.perView.calls:first.perView.calls)+a.shadowCasters*a.shadowLights,triangles:(both?a.perView.triangles+b.perView.triangles:first.perView.triangles)+shadow,detail:{main:a.perView,close:b.perView,shadowTriangles:shadow},measured:st._info??null};
}
export function renderConcerto(st){
 if(st.headless)return;const r=st.renderer;st.needsRender=false;r.shadowMap.needsUpdate=true;r.info.autoReset=false;r.info.reset();renderDetail(st,'main');
 try{
  if(st.shotMode==='main'||st.shotMode==='close'){
   if(st.shotMode==='close')renderDetail(st,'close');r.setScissorTest(false);r.setViewport(0,0,st.w,st.h);const exposure=r.toneMappingExposure;try{if(st.shotMode==='close'&&st.closeShot==='conductor')r.toneMappingExposure=exposure*.55;r.render(st.scene,st.shotMode==='main'?st.camMain:st.camClose);}finally{r.toneMappingExposure=exposure;}
  }else{
   r.setScissorTest(true);r.setViewport(...st.rects.main);r.setScissor(...st.rects.main);r.render(st.scene,st.camMain);renderDetail(st,'close');r.setViewport(...st.rects.close);r.setScissor(...st.rects.close);
   const exposure=r.toneMappingExposure;try{if(st.closeShot==='conductor')r.toneMappingExposure=exposure*.55;else if(st._shortClose())r.toneMappingExposure=exposure*1.25;r.render(st.scene,st.camClose);}finally{r.toneMappingExposure=exposure;}r.setScissorTest(false);
  }
  st._info={calls:r.info.render.calls,triangles:r.info.render.triangles};
 }finally{renderDetail(st,'restore');}
}
