// BAND instrument enclosures; hand hardware is shared with PIANO.
import * as THREE from 'three';
import { HARDWARE, roundedSlab, meshAt, metalRod } from '../js/robot-hardware.js';
export { HARDWARE, roundedSlab, meshAt, metalRod, refineHands } from '../js/robot-hardware.js';
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
export function valueArc(radius,thickness,angle=2.35){
 const pos=[],idx=[];
 for(let i=0;i<=96;i++){const a=(i/96-.5)*angle*2;for(const r of[radius-thickness/2,radius+thickness/2])pos.push(Math.sin(a)*r,0,-Math.cos(a)*r);if(i<96){const j=i*2;idx.push(j,j+2,j+1,j+1,j+2,j+3);}}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();return geo;
}
// D: 奥行きを詰める長さ (m)。つまみの板を短くし、うしろの台・画面・文字を D だけ手前へ、DY だけ下へ (傾きは同じ)。
// 2026-11-03: 模型の大きさのチンパンジーの腕では、つまみが鍵の手前の縁から 25.5 cm 奥にあると届かなかった
export function buildSynthCase(g,width,panelZ,panelY,tilt,textPlate,floorY=-.80,D=0){
 const DY=D*Math.tan(tilt);
 // The keybed must stay below the white keys even at their full 8 mm travel.
 // Its former top sheet intersected a depressed key and hid the front lip.
 const body=meshAt(g,roundedSlab(width+.125,.415-D,.070,.018,.003),HARDWARE.black,width/2,-.056,-.176+D/2);
 // Continuous bright chamfer and a separate black top sheet; no wooden end blocks.
 meshAt(g,roundedSlab(width+.131,.421-D,.006,.018,.001),HARDWARE.silver,width/2,-.026,-.176+D/2);
 meshAt(g,roundedSlab(width+.123,.411-D,.008,.016,.001),HARDWARE.black,width/2,-.020,-.176+D/2);
 for(const x of[-.042,width+.042]){
  meshAt(g,roundedSlab(.025,.402-D,.025,.011,.002),HARDWARE.silver,x,.012,-.170+D/2);
  meshAt(g,roundedSlab(.009,.376-D,.003,.004,.0006),HARDWARE.edge,x,.027,-.172+D/2);
 }
 const panel=meshAt(g,roundedSlab(width+.045,.118-D,.009,.006,.001),HARDWARE.black,width/2,panelY,panelZ);panel.rotation.x=tilt;
 // Solid side-profile extrusion joins the raised controls to the chassis.
 // The top follows both inclined plates; there is no air gap under either edge.
 const profile=new THREE.Shape();profile.moveTo(-.375+D,-.016);profile.lineTo(-.159,-.016);profile.lineTo(-.159,.010);profile.lineTo(-.278+D,.047-DY);profile.lineTo(-.278+D,.056-DY);profile.lineTo(-.375+D,.087-DY);profile.closePath();
 const shell=new THREE.ExtrudeGeometry(profile,{depth:width+.044,bevelEnabled:true,bevelSize:.001,bevelThickness:.001,bevelSegments:3,curveSegments:16});
 // Shape x is instrument z, extrusion z is instrument x.
 shell.applyMatrix4(new THREE.Matrix4().set(0,0,1,-.022, 0,1,0,0, 1,0,0,0, 0,0,0,1));
 // Reflection reverses triangle winding: restore outward normals.
 const a=shell.attributes.position;for(let i=0;i<a.count;i+=3){const v=new THREE.Vector3().fromBufferAttribute(a,i);a.setXYZ(i,a.getX(i+2),a.getY(i+2),a.getZ(i+2));a.setXYZ(i+2,v.x,v.y,v.z);}shell.computeVertexNormals();meshAt(g,shell,HARDWARE.black);
 // Rear display deck rises with the controls; its enclosure has real depth.
 const deck=meshAt(g,roundedSlab(width+.045,.099,.018,.007,.001),HARDWARE.black,width/2,.063-DY,-.326+D);deck.rotation.x=tilt;
 for(const x of[-.012,width+.012])for(const z of[-.182+D/2,-.352+D]){const y=z<-.3+D?.088-DY:.025;const screw=meshAt(g,new THREE.CylinderGeometry(.0024,.0024,.0015,8),HARDWARE.silver,x,y,z);meshAt(screw,new THREE.BoxGeometry(.0028,.0004,.0005),HARDWARE.black,0,.001,0);}
 const mark=textPlate('VESPER  /  SYNTH2',.168,.019,{bg:'#101114',fg:'#d7dce2',line:'#101114',size:105,weight:'400'});mark.position.set(.094,.0702-DY,-.320+D);mark.rotation.x=-Math.PI/2+tilt;g.add(mark);
 const sub=textPlate('37   /   POLYPHONIC',.160,.012,{bg:'#101114',fg:'#989da4',line:'#101114',size:92,weight:'400'});sub.position.set(.094,.0632-DY,-.296+D);sub.rotation.x=-Math.PI/2+tilt;g.add(sub);
 // Pitch / modulation wheels, recessed in the left cheek (surface, axle and ribs).
 for(const [i,label]of ['PITCH','MOD'].entries()){
  const z=-.061-i*.068;meshAt(g,roundedSlab(.027,.052,.003,.009),HARDWARE.grip,-.040,.011,z);
  const wheel=meshAt(g,new THREE.CylinderGeometry(.022,.022,.009,64),HARDWARE.black,-.040,.010,z);wheel.rotation.z=Math.PI/2;
  for(let j=0;j<24;j++){const a=j*Math.PI/12;const rib=meshAt(wheel,new THREE.BoxGeometry(.002,.010,.0015),HARDWARE.silver,Math.sin(a)*.022,0,Math.cos(a)*.022);rib.rotation.y=a;}
  const l=textPlate(label,.025,.006,{bg:'#101114',fg:'#d0d0d0',line:'#101114',size:145});l.position.set(-.040,.014,z+.032);l.rotation.x=-Math.PI/2;g.add(l);
 }
 // Instrument stand with feet and a central brace, all the way down to the floor.
 // floorY: 床の高さ (シンセの中の座標)。配置の画面で高さを変えても、脚が床に届くように
 for(const x of[.075,width-.075]){metalRod(g,V(x,-.09,-.17),V(x,floorY+.025,-.15),.010);meshAt(g,roundedSlab(.065,.32,.018,.022),HARDWARE.black,x,floorY+.01,-.15);}
 metalRod(g,V(.075,-.10,-.17),V(width-.075,-.10,-.17),.009);
 return body;
}
export function buildDisplay(g,x=.358,D=0,DY=0){
 const cv=document.createElement('canvas');cv.width=1024;cv.height=256;const ctx=cv.getContext('2d'),tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
 const housing=meshAt(g,roundedSlab(.241,.059,.007,.005),HARDWARE.silver,x,.074-DY,-.321+D);housing.rotation.x=.30;
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
