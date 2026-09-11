// Procedural hardware shared by VESPER BAND and PIANO. No pose or audio state.
import * as THREE from 'three';
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
export function roundedSlab(w,l,h,r=.01,bevel=.001){
 const s=new THREE.Shape(),x=-w/2,y=-l/2;
 s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+l-r);s.quadraticCurveTo(x+w,y+l,x+w-r,y+l);s.lineTo(x+r,y+l);s.quadraticCurveTo(x,y+l,x,y+l-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
 const g=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,curveSegments:5});g.translate(0,0,-h/2);g.rotateX(-Math.PI/2);return g;
}
export const HARDWARE={
 black:new THREE.MeshPhysicalMaterial({color:0x101114,metalness:.65,roughness:.36,clearcoat:.15}),
 silver:new THREE.MeshPhysicalMaterial({color:0xaab0b8,metalness:1,roughness:.27}),
 edge:new THREE.MeshPhysicalMaterial({color:0xd5d9df,metalness:1,roughness:.18}),
 grip:new THREE.MeshStandardMaterial({color:0x24262b,roughness:.6,metalness:.15}),
 white:new THREE.MeshPhysicalMaterial({color:0xcfd4da,roughness:.29,metalness:.5,clearcoat:.4}),
 gold:new THREE.MeshBasicMaterial({color:0xe0b95a,toneMapped:false}),
 unlit:new THREE.MeshStandardMaterial({color:0x333437,roughness:.6,metalness:.35}),
};
// 軽さ優先: 小さな部品は影を落とさない (影の描画は部品の数だけ増える)。大きな部品だけ第 7 引数 true で影を付ける
export function meshAt(parent,geometry,material,x=0,y=0,z=0,shadow=false){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=shadow;parent.add(m);return m;}
export function metalRod(parent,a,b,r=.008,mat=HARDWARE.silver){const m=meshAt(parent,new THREE.CylinderGeometry(r,r,a.distanceTo(b),10),mat);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V(0,1,0),b.clone().sub(a).normalize());return m;}
// Thin armour over a dark load-bearing link. The exposed bearing at each end
// belongs to the real animated joint; no decorative floating finger sections.
function fingerLink(parent,length,sgn,distal){
 const start=distal?.145:.17,end=length-(distal?.105:.15),span=end-start;
 const centre=sgn*(start+end)/2,r=distal?.073:.091;
 const body=meshAt(parent,new THREE.CylinderGeometry(r*.86,r,span,10),HARDWARE.grip,centre);
 body.rotation.z=Math.PI/2;body.name='finger-link';
 // Two separate milled covers expose a narrow transverse service seam.
 for(const [a,b]of[[start+.018,start+span*.52],[start+span*.52+.048,end-.018]]){
  const plate=meshAt(parent,roundedSlab(b-a,distal?.126:.160,.030,.033,.008),HARDWARE.white,sgn*(a+b)/2,distal?.061:.078);
  plate.name='finger-armour';
 }
 for(const x of[start+.02,end-.02]){
  const collar=meshAt(parent,new THREE.CylinderGeometry(r+.009,r+.009,.028,10),HARDWARE.silver,sgn*x);
  collar.rotation.z=Math.PI/2;collar.name='finger-collar';
 }
 if(distal){
  metalRod(parent,V(sgn*(end-.02),0,0),V(sgn*length,-.10,0),.068,HARDWARE.grip).name='finger-tip-link';
 }else{
  // Narrow fork cheeks frame the joint without filling its articulation gap.
  for(const z of[-.079,.079])metalRod(parent,V(sgn*(end-.08),0,z),V(sgn*length,0,z),.027,HARDWARE.silver);
 }
}
export function refineHands(hands,scale,tipRadius,{knuckleArch=true}={}){
 for(const h of Object.values(hands)){
  // Replace the two rectangular palm meshes only; every finger bone and tip stays intact.
  for(const child of [...h.bone.children])if(child.isMesh&&child.geometry?.type==='BoxGeometry'){h.bone.remove(child);child.geometry.dispose();}
  // The right-hand knuckles form a shallow arch, as separate mechanical joints.
  // BAND retains its existing arch. PIANO disables it to preserve every IK coordinate.
  if(knuckleArch&&h.sgn<0)for(const [i,y]of[[2,.10],[3,.07],[4,.035]])h.fingers[i].root.position.y=y;
  // A tapered wrist and exposed metacarpal bridge. Small fitted covers leave
  // the rails and fastenings visible instead of four broad white back plates.
  // Finger bones/tip coordinates remain those of the shared piano hand.
  const wrist=meshAt(h.bone,new THREE.SphereGeometry(.51,14,10),HARDWARE.black,h.sgn*.39,0,0,true);wrist.scale.set(1,.48,1.47);h.palm=wrist;
  metalRod(h.bone,V(h.sgn*.67,.045,-.79),V(h.sgn*.67,.045,.48),.066,HARDWARE.silver);
  for(let i=1;i<5;i++){
   const z=h.fingers[i].root.position.z,y=h.fingers[i].root.position.y;
   metalRod(h.bone,V(h.sgn*.39,-.035,z*.66),V(h.sgn*1.70,y,z),.092,HARDWARE.grip);
   for(const side of[-1,1])metalRod(h.bone,V(h.sgn*.62,.06,z*.80+side*.075),V(h.sgn*1.51,y+.055,z+side*.075),.027,HARDWARE.silver);
   for(const [x,length,width]of[[.69,.34,.17],[1.24,.26,.14]]){
    const plate=meshAt(h.bone,roundedSlab(length,width,.034,.041,.008),HARDWARE.white,h.sgn*x,y*.5+.12,z*(x<1?.82:.97));plate.rotation.y=(i-2.5)*h.sgn*.045;plate.name='metacarpal-cover';
   }
   const bearing=meshAt(h.bone,new THREE.CylinderGeometry(.106,.106,.105,10),HARDWARE.black,h.sgn*1.53,y,z);bearing.rotation.z=Math.PI/2;
   for(const side of[-1,1]){const screw=meshAt(h.bone,new THREE.CylinderGeometry(.026,.026,.023,8),HARDWARE.silver,h.sgn*.70,.105,z*.82+side*.115);screw.name='metacarpal-fastener';}
   meshAt(h.bone,new THREE.SphereGeometry(.19,10,8),HARDWARE.silver,h.sgn*1.69,y,z);
  }
  const thumbBase=meshAt(h.bone,new THREE.SphereGeometry(.29,10,8),HARDWARE.silver,h.sgn*.96,-.10,.72);thumbBase.scale.set(1.35,.65,1);
  metalRod(h.bone,V(h.sgn*.90,-.12,.70),h.fingers[0].root.position,.16,HARDWARE.black);
  for(const f of h.fingers){
   // Remove the original continuous, thick capsules from this BAND instance.
   // Keep root, joint and tip transforms, lengths, and all IK contact points.
   for(const bone of[f.root,f.joint])for(const child of[...bone.children]){
    if(child.children.length===1&&child.children[0].geometry?.type==='CapsuleGeometry'){
     child.children[0].geometry.dispose();bone.remove(child);
    }
   }
   fingerLink(f.root,f.len*.55,h.sgn,false);fingerLink(f.joint,f.len*.45,h.sgn,true);
   meshAt(f.root,new THREE.SphereGeometry(.16,10,8),HARDWARE.grip);
   meshAt(f.joint,new THREE.SphereGeometry(.135,10,8),HARDWARE.silver);
   const axle=meshAt(f.joint,new THREE.CylinderGeometry(.063,.063,.29,10),HARDWARE.grip);axle.rotation.x=Math.PI/2;
   // A visible fingertip pad at the exact point used by IK, not a hidden proxy below a capsule.
   const pad=meshAt(f.tip,new THREE.SphereGeometry(tipRadius/scale,10,8),HARDWARE.grip);f.contactPad=pad;
  }
 }
}

// Piano's dorsal view exposes the wrist and forearm. These shells, bearings
// and tendons are attached to existing joints; they never move a bone or tip.
export function refinePianoArms(bones,hands) {
 for(const [side,h] of Object.entries(hands)) {
  const s=h.sgn,fore=bones[side+'ForeArm'],length=h.restPos.length();
  for(const child of [...h.bone.children])if(child.isMesh&&child.geometry.type==='SphereGeometry'&&child.position.length()<1e-9){h.bone.remove(child);child.geometry.dispose();}
  for(const child of [...fore.children])if(child.isMesh&&child.geometry.type==='BoxGeometry'||child.children.some(c=>c.isMesh&&c.geometry.type==='CapsuleGeometry')){
   fore.remove(child);child.traverse(c=>{if(c.isMesh)c.geometry.dispose();});
  }
  // Hollow turned cuff, smaller than the previous reflective ball.
  for(const [x,r,w,mat]of[[0,.30,.27,HARDWARE.grip],[.12,.32,.055,HARDWARE.silver],[-.12,.32,.055,HARDWARE.silver]]){
   const ring=meshAt(h.bone,new THREE.TorusGeometry(r,w/2,12,12),mat,s*x);ring.rotation.y=Math.PI/2;ring.name='wrist-bearing';
  }
  for(const z of[-.27,.27]){
   metalRod(h.bone,V(-s*.08,0,z),V(s*.52,-.025,z),.065,HARDWARE.silver).name='wrist-yoke';
   const hub=meshAt(h.bone,new THREE.CylinderGeometry(.102,.102,.04,10),HARDWARE.black,s*.14,0,z);hub.rotation.x=Math.PI/2;
   const cap=meshAt(hub,new THREE.CylinderGeometry(.054,.054,.044,8),HARDWARE.silver);cap.name='wrist-axle';
  }
  // Dorsal tendon channels and countersunk hex fasteners on each metacarpal.
  for(let i=1;i<5;i++){
   const z=h.fingers[i].root.position.z;
   metalRod(h.bone,V(s*.44,.15,z*.69),V(s*1.51,.13,z),.032,HARDWARE.black).name='dorsal-tendon';
   for(const x of[.82,1.25]){
    const screw=meshAt(h.bone,new THREE.CylinderGeometry(.040,.040,.018,10),HARDWARE.silver,s*x,.151,z*(x<1?.82:.97));screw.name='dorsal-screw';
    meshAt(screw,new THREE.CylinderGeometry(.017,.017,.003,6),HARDWARE.grip,0,.010,0);
   }
  }
  metalRod(fore,V(s*.43,0,0),V(s*(length-.27),0,0),.255,HARDWARE.grip).name='forearm-core';
  // Revolved, open-sided ceramic-metal shells: curved surfaces and real seams.
  for(const [a,b,r0,r1]of[[.60,2.38,.46,.42],[2.60,length-.43,.40,.32]]) {
   for(const angle of[0,Math.PI]){
    const profile=[new THREE.Vector2(r0-.04,a),new THREE.Vector2(r0,a+.06),new THREE.Vector2(r1,b-.07),new THREE.Vector2(r1-.04,b),new THREE.Vector2(r1-.067,b-.025),new THREE.Vector2(r0-.067,a+.025)];profile.push(profile[0].clone());
    const shell=meshAt(fore,new THREE.LatheGeometry(profile,14,angle+.18,Math.PI-.36),HARDWARE.white,0,0,0,true);shell.rotation.z=-s*Math.PI/2;shell.name='forearm-shell';
   }
  }
  for(const x of[.53,2.44,2.54,length-.36]){
   const radius=.46-(x/length)*.13;
   const ring=meshAt(fore,new THREE.CylinderGeometry(radius,radius,.07,12),HARDWARE.silver,s*x);ring.rotation.z=Math.PI/2;ring.name='forearm-collar';
  }
  for(const z of[-.34,.34]) {
   metalRod(fore,V(s*.68,0,z),V(s*(length-.52),0,z*.81),.049,HARDWARE.silver).name='forearm-actuator';
   for(const x of[.82,length-.67]){const bolt=meshAt(fore,new THREE.CylinderGeometry(.06,.06,.065,10),HARDWARE.black,s*x,.07,z);bolt.name='forearm-fastener';}
  }
 }
}

// Batch only decorative meshes sharing one animated parent and material.
// Fingertip objects and all joint transforms remain separate and untouched.
export function batchHardware(root) {
 const parents=[];root.traverse(o=>parents.push(o));
 for(const parent of parents) {
  const groups=new Map();
  for(const child of parent.children)if(child.isMesh&&!child.children.length&&!Array.isArray(child.material)){
   const list=groups.get(child.material)??[];list.push(child);groups.set(child.material,list);
  }
  for(const [material,list]of groups)if(list.length>1){
   const positions=[],normals=[];
   for(const child of list){child.updateMatrix();const geo=(child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone()).applyMatrix4(child.matrix);positions.push(...geo.attributes.position.array);normals.push(...geo.attributes.normal.array);geo.dispose();}
   const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
   const mesh=meshAt(parent,geo,material);mesh.name='machined-hardware';mesh.userData.parts=list.map(c=>c.name);
   for(const child of list){parent.remove(child);child.geometry.dispose();}
  }
 }
}
