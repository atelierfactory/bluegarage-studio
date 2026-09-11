// Procedural machined hardware. Geometry and materials are private to BAND.
import * as THREE from 'three';
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
export function roundedSlab(w,l,h,r=.01,bevel=.001){
 const s=new THREE.Shape(),x=-w/2,y=-l/2;
 s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+l-r);s.quadraticCurveTo(x+w,y+l,x+w-r,y+l);s.lineTo(x+r,y+l);s.quadraticCurveTo(x,y+l,x,y+l-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
 const g=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:4,curveSegments:20});g.translate(0,0,-h/2);g.rotateX(-Math.PI/2);return g;
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
export function meshAt(parent,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function metalRod(parent,a,b,r=.008,mat=HARDWARE.silver){const m=meshAt(parent,new THREE.CylinderGeometry(r,r,a.distanceTo(b),32),mat);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V(0,1,0),b.clone().sub(a).normalize());return m;}
export function valueArc(radius,thickness,angle=2.35){
 const pos=[],idx=[];
 for(let i=0;i<=96;i++){const a=(i/96-.5)*angle*2;for(const r of[radius-thickness/2,radius+thickness/2])pos.push(Math.sin(a)*r,0,-Math.cos(a)*r);if(i<96){const j=i*2;idx.push(j,j+2,j+1,j+1,j+2,j+3);}}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();return geo;
}
export function buildSynthCase(g,width,panelZ,panelY,tilt,textPlate){
 const body=meshAt(g,roundedSlab(width+.125,.415,.070,.018,.003),HARDWARE.black,width/2,-.044,-.176);
 // Continuous bright chamfer and a separate black top sheet; no wooden end blocks.
 meshAt(g,roundedSlab(width+.131,.421,.006,.018,.001),HARDWARE.silver,width/2,-.014,-.176);
 meshAt(g,roundedSlab(width+.123,.411,.008,.016,.001),HARDWARE.black,width/2,-.008,-.176);
 for(const x of[-.042,width+.042]){
  meshAt(g,roundedSlab(.025,.402,.025,.011,.002),HARDWARE.silver,x,.012,-.170);
  meshAt(g,roundedSlab(.009,.376,.003,.004,.0006),HARDWARE.edge,x,.027,-.172);
 }
 const panel=meshAt(g,roundedSlab(width+.045,.118,.009,.006,.001),HARDWARE.black,width/2,panelY,panelZ);panel.rotation.x=tilt;
 // Solid side-profile extrusion joins the raised controls to the chassis.
 // The top follows both inclined plates; there is no air gap under either edge.
 const profile=new THREE.Shape();profile.moveTo(-.375,-.016);profile.lineTo(-.159,-.016);profile.lineTo(-.159,.010);profile.lineTo(-.278,.047);profile.lineTo(-.278,.056);profile.lineTo(-.375,.087);profile.closePath();
 const shell=new THREE.ExtrudeGeometry(profile,{depth:width+.044,bevelEnabled:true,bevelSize:.001,bevelThickness:.001,bevelSegments:3,curveSegments:16});
 // Shape x is instrument z, extrusion z is instrument x.
 shell.applyMatrix4(new THREE.Matrix4().set(0,0,1,-.022, 0,1,0,0, 1,0,0,0, 0,0,0,1));
 // Reflection reverses triangle winding: restore outward normals.
 const a=shell.attributes.position;for(let i=0;i<a.count;i+=3){const v=new THREE.Vector3().fromBufferAttribute(a,i);a.setXYZ(i,a.getX(i+2),a.getY(i+2),a.getZ(i+2));a.setXYZ(i+2,v.x,v.y,v.z);}shell.computeVertexNormals();meshAt(g,shell,HARDWARE.black);
 // Rear display deck rises with the controls; its enclosure has real depth.
 const deck=meshAt(g,roundedSlab(width+.045,.099,.018,.007,.001),HARDWARE.black,width/2,.063,-.326);deck.rotation.x=tilt;
 for(const x of[-.012,width+.012])for(const z of[-.182,-.352]){const y=z<-.3?.088:.025;const screw=meshAt(g,new THREE.CylinderGeometry(.0024,.0024,.0015,24),HARDWARE.silver,x,y,z);meshAt(screw,new THREE.BoxGeometry(.0028,.0004,.0005),HARDWARE.black,0,.001,0);}
 const mark=textPlate('VESPER  /  SYNTH2',.168,.019,{bg:'#101114',fg:'#d7dce2',line:'#101114',size:105,weight:'400'});mark.position.set(.094,.0702,-.320);mark.rotation.x=-Math.PI/2+tilt;g.add(mark);
 const sub=textPlate('37   /   POLYPHONIC',.160,.012,{bg:'#101114',fg:'#989da4',line:'#101114',size:92,weight:'400'});sub.position.set(.094,.0632,-.296);sub.rotation.x=-Math.PI/2+tilt;g.add(sub);
 // Pitch / modulation wheels, recessed in the left cheek (surface, axle and ribs).
 for(const [i,label]of ['PITCH','MOD'].entries()){
  const z=-.061-i*.068;meshAt(g,roundedSlab(.027,.052,.003,.009),HARDWARE.grip,-.040,.011,z);
  const wheel=meshAt(g,new THREE.CylinderGeometry(.022,.022,.009,64),HARDWARE.black,-.040,.010,z);wheel.rotation.z=Math.PI/2;
  for(let j=0;j<24;j++){const a=j*Math.PI/12;const rib=meshAt(wheel,new THREE.BoxGeometry(.002,.010,.0015),HARDWARE.silver,Math.sin(a)*.022,0,Math.cos(a)*.022);rib.rotation.y=a;}
  const l=textPlate(label,.025,.006,{bg:'#101114',fg:'#d0d0d0',line:'#101114',size:145});l.position.set(-.040,.014,z+.032);l.rotation.x=-Math.PI/2;g.add(l);
 }
 // Instrument stand with feet and a central brace, all the way down to the floor.
 for(const x of[.075,width-.075]){metalRod(g,V(x,-.09,-.17),V(x,-.775,-.15),.010);meshAt(g,roundedSlab(.065,.32,.018,.022),HARDWARE.black,x,-.79,-.15);}
 metalRod(g,V(.075,-.10,-.17),V(width-.075,-.10,-.17),.009);
 return body;
}
export function buildDisplay(g){
 const cv=document.createElement('canvas');cv.width=1024;cv.height=256;const ctx=cv.getContext('2d'),tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
 const housing=meshAt(g,roundedSlab(.241,.059,.007,.005),HARDWARE.silver,.358,.074,-.321);housing.rotation.x=.30;
 const display=meshAt(housing,new THREE.PlaneGeometry(.231,.049),new THREE.MeshBasicMaterial({map:tex,toneMapped:false}),0,.006,0);display.rotation.x=-Math.PI/2;
 let last='';return{surface:display,set(name,values,active,signal){const id=active?.param??'cutoff',pct=Math.round((values[id]??.5)*100),key=`${name}|${id}|${pct}|${signal?.serial??0}`;if(key===last)return;last=key;ctx.fillStyle='#07090b';ctx.fillRect(0,0,1024,256);ctx.fillStyle='#c9a656';ctx.textAlign='left';ctx.font="40px 'IBM Plex Mono', monospace";ctx.fillText(String(name||'VESPER SYNTH2').slice(0,32),32,60);ctx.fillStyle='#eef0ed';ctx.font="64px 'IBM Plex Mono', monospace";ctx.fillText(`${(active?.label??id).toUpperCase()}   ${pct} / 100`,32,150);ctx.fillStyle='#34312a';ctx.fillRect(32,198,960,9);ctx.fillStyle='#e0b95a';ctx.fillRect(32,198,960*pct/100,9);
 if(signal?.wave?.length){ctx.fillStyle='#e0b95a';const w=signal.wave;for(let i=0;i<240;i++){const y=230-Math.max(-1,Math.min(1,w[Math.floor(i*w.length/240)]*2))*16;ctx.fillRect(32+i*4,y,3,2);}}
 tex.needsUpdate=true;},texture:tex};
}
export function cymbalGeometry(radius){
 const pts=[],height=t=>.008+.012*Math.pow(1-t,1.7)+.037*(1-smooth(.13,.30,t))+.00018*Math.sin(t*radius*2*Math.PI/.0016)*smooth(.24,.35,t);
 for(let i=0;i<=220;i++){const t=.016+.984*i/220;pts.push(new THREE.Vector2(t*radius,height(t)));}
 for(let i=220;i>=0;i--){const t=.016+.984*i/220;pts.push(new THREE.Vector2(t*radius,height(t)-.0012));}
 pts.push(pts[0].clone());return new THREE.LatheGeometry(pts,128);
}
function smooth(a,b,x){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
// Thin armour over a dark load-bearing link. The exposed bearing at each end
// belongs to the real animated joint; no decorative floating finger sections.
function fingerLink(parent,length,sgn,distal){
 const start=distal?.145:.17,end=length-(distal?.105:.15),span=end-start;
 const centre=sgn*(start+end)/2,r=distal?.073:.091;
 const body=meshAt(parent,new THREE.CylinderGeometry(r*.86,r,span,32),HARDWARE.grip,centre);
 body.rotation.z=Math.PI/2;body.name='finger-link';
 // Two separate milled covers expose a narrow transverse service seam.
 for(const [a,b]of[[start+.018,start+span*.52],[start+span*.52+.048,end-.018]]){
  const plate=meshAt(parent,roundedSlab(b-a,distal?.126:.160,.030,.033,.008),HARDWARE.white,sgn*(a+b)/2,distal?.061:.078);
  plate.name='finger-armour';
 }
 for(const x of[start+.02,end-.02]){
  const collar=meshAt(parent,new THREE.CylinderGeometry(r+.009,r+.009,.028,32),HARDWARE.silver,sgn*x);
  collar.rotation.z=Math.PI/2;collar.name='finger-collar';
 }
 if(distal){
  metalRod(parent,V(sgn*(end-.02),0,0),V(sgn*length,-.10,0),.068,HARDWARE.grip).name='finger-tip-link';
 }else{
  // Narrow fork cheeks frame the joint without filling its articulation gap.
  for(const z of[-.079,.079])metalRod(parent,V(sgn*(end-.08),0,z),V(sgn*length,0,z),.027,HARDWARE.silver);
 }
}
export function refineHands(hands,scale,tipRadius){
 for(const h of Object.values(hands)){
  // Replace the two rectangular palm meshes only; every finger bone and tip stays intact.
  for(const child of [...h.bone.children])if(child.isMesh&&child.geometry?.type==='BoxGeometry'){h.bone.remove(child);child.geometry.dispose();}
  // The right-hand knuckles form a shallow arch, as separate mechanical joints.
  // Only this BAND instance changes; keyboard IK still targets its real fingertips.
  if(h.sgn<0)for(const [i,y]of[[2,.10],[3,.07],[4,.035]])h.fingers[i].root.position.y=y;
  // A tapered wrist and exposed metacarpal bridge. Small fitted covers leave
  // the rails and fastenings visible instead of four broad white back plates.
  // Finger bones/tip coordinates remain those of the shared piano hand.
  const wrist=meshAt(h.bone,new THREE.SphereGeometry(.51,40,28),HARDWARE.black,h.sgn*.39,0,0);wrist.scale.set(1,.48,1.47);h.palm=wrist;
  metalRod(h.bone,V(h.sgn*.67,.045,-.79),V(h.sgn*.67,.045,.48),.066,HARDWARE.silver);
  for(let i=1;i<5;i++){
   const z=h.fingers[i].root.position.z,y=h.fingers[i].root.position.y;
   metalRod(h.bone,V(h.sgn*.39,-.035,z*.66),V(h.sgn*1.70,y,z),.092,HARDWARE.grip);
   for(const side of[-1,1])metalRod(h.bone,V(h.sgn*.62,.06,z*.80+side*.075),V(h.sgn*1.51,y+.055,z+side*.075),.027,HARDWARE.silver);
   for(const [x,length,width]of[[.69,.34,.17],[1.24,.26,.14]]){
    const plate=meshAt(h.bone,roundedSlab(length,width,.034,.041,.008),HARDWARE.white,h.sgn*x,y*.5+.12,z*(x<1?.82:.97));plate.rotation.y=(i-2.5)*h.sgn*.045;plate.name='metacarpal-cover';
   }
   const bearing=meshAt(h.bone,new THREE.CylinderGeometry(.106,.106,.105,32),HARDWARE.black,h.sgn*1.53,y,z);bearing.rotation.z=Math.PI/2;
   for(const side of[-1,1]){const screw=meshAt(h.bone,new THREE.CylinderGeometry(.026,.026,.023,24),HARDWARE.silver,h.sgn*.70,.105,z*.82+side*.115);screw.name='metacarpal-fastener';}
   meshAt(h.bone,new THREE.SphereGeometry(.19,32,24),HARDWARE.silver,h.sgn*1.69,y,z);
  }
  const thumbBase=meshAt(h.bone,new THREE.SphereGeometry(.29,32,24),HARDWARE.silver,h.sgn*.96,-.10,.72);thumbBase.scale.set(1.35,.65,1);
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
   meshAt(f.root,new THREE.SphereGeometry(.16,32,24),HARDWARE.grip);
   meshAt(f.joint,new THREE.SphereGeometry(.135,32,24),HARDWARE.silver);
   const axle=meshAt(f.joint,new THREE.CylinderGeometry(.063,.063,.29,32),HARDWARE.grip);axle.rotation.x=Math.PI/2;
   // A visible fingertip pad at the exact point used by IK, not a hidden proxy below a capsule.
   const pad=meshAt(f.tip,new THREE.SphereGeometry(tipRadius/scale,32,24),HARDWARE.grip);f.contactPad=pad;
  }
 }
}
