// B管の開管倍音と半音下げる管長からスライドを決める。第7倍音は避ける。
import * as THREE from 'three';
import {rig as R,V,phrases,smooth} from './base.js';
export function slideFor(p,bass=false){
 const partials=[1,2,3,4,5,6,8,9,10,12],choices=[];
 for(const [fundamental,length,attachment]of [[34,2.95,false],...(bass?[[29,3.94,true]]:[])])for(const partial of partials){
  const open=fundamental+Math.round(12*Math.log2(partial)),drop=open-p;
  if(drop>=0&&drop<=6)choices.push({position:drop+1,extension:length*(2**(drop/12)-1)/2,partial,attachment});
 }
 choices.sort((a,b)=>a.extension-b.extension||+a.attachment-+b.attachment||a.partial-b.partial);
 return choices[0]??{position:null,extension:0,partial:null};
}
export function createTrombone(scene,{bass=false}={}){
 const root=new THREE.Group(),slide=new THREE.Group();root.add(slide);
 const metal=new THREE.MeshStandardMaterial({color:0xb58c40,metalness:.82,roughness:.27}),inside=new THREE.MeshStandardMaterial({color:0x292016,metalness:.6,roughness:.5});
 const tube=(parent,a,b,r=.009)=>{const d=b.clone().sub(a),m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),10),metal);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());parent.add(m);};
 // ローカル+zは前、口が原点。ベルは左側、外管は右手側。
 tube(root,V(),V(-.04,-.025,.22),.006);tube(root,V(-.04,-.025,.22),V(-.14,-.04,.22),.011);tube(root,V(-.14,-.04,.22),V(-.14,-.04,.58),.012);
 const bell=new THREE.Mesh(new THREE.CylinderGeometry(.1,.014,.25,24,1,true),metal);bell.rotation.x=Math.PI/2;bell.position.set(-.14,-.04,.68);root.add(bell);
 const dark=new THREE.Mesh(new THREE.CircleGeometry(.087,24),inside);dark.position.set(-.14,-.04,.807);root.add(dark);
 for(const x of [.025,.1]){tube(root,V(x,-.13,.1),V(x,-.13,.63));tube(slide,V(x,-.13,.13),V(x,-.13,.98),.011);}
 const bend=new THREE.Mesh(new THREE.TorusGeometry(.0375,.011,8,16,Math.PI),metal);bend.rotation.x=Math.PI/2;bend.rotation.z=Math.PI/2;bend.position.set(.0625,-.13,.98);slide.add(bend);tube(slide,V(.025,-.13,.15),V(.1,-.13,.15),.007);
 const mouth=new THREE.Mesh(new THREE.CylinderGeometry(.012,.005,.03,12),metal);mouth.rotation.x=Math.PI/2;mouth.position.z=.012;root.add(mouth);
 if(bass){for(const z of [.06,.09]){const coil=new THREE.Mesh(new THREE.TorusGeometry(.085,.009,8,24),metal);coil.position.set(-.14,-.04,z);root.add(coil);}}
 scene.add(root);return{root,slide,bass,point:(name,out=V())=>root.localToWorld(out.copy(name==='mouth'?V():name==='left'?V(-.04,-.08,.18):V(.063,-.13,.15+slide.position.z)))};
}
export function createPlayers(stage,spec,seats){
 const seat=seats[0],g=seat.rig,inst=seat.instrument;let notes=[],ph=[],slides=[];
 function pose(sec){
  R.sit(g,seat);R.setSpine(g,.03,0,0);R.lookAt(g,V(0,1,0),.7,0);R.updateRig(g);
  const next=ph.find(p=>p.t1+.7>sec),inside=next&&sec>=next.t0-.9&&sec<next.t1+.7;
  let up=inside?Math.min(1,smooth((sec-next.t0+.9)/.65),smooth((next.t1+.7-sec)/.5)):0;
  let extension=slides[0]?.extension??0;
  for(const s of slides){if(sec<s.start)break;const u=Math.max(0,Math.min(1,(sec-s.start)/Math.max(.001,s.t0-s.start)));extension=s.from+(s.extension-s.from)*smooth(u);if(sec<s.t0)break;}
  inst.slide.position.z=extension*up*up;
  const mouth=R.wpos(g.points.mouth),rest=seat.pos.clone().add(V(0,.97,0));
  inst.root.position.copy(rest).lerp(mouth,up);inst.root.quaternion.setFromEuler(new THREE.Euler((1-up)*.65,seat.yaw,0));inst.root.updateMatrixWorld(true);
  for(const side of ['Left','Right']){const target=inst.point(side==='Left'?'left':'right');R.reachWith(g,side,g.points['grip'+side],target,V(0,-1,0),V(0,0,1));R.setFingers(g,side,[.6,.85,.85,.85,.8]);}
  R.updateRig(g);
 }
 return {seats,plan(ns){notes=ns;ph=phrases(ns);this.notes=ns;let previous=null;
  slides=ns.map(n=>{const slide=slideFor(n.p,inst.bass),from=previous?.extension??slide.extension,duration=Math.max(.08,Math.abs(slide.extension-from)/1.5),row={...slide,t0:n.t0,start:Math.max(previous?previous.t0+.025:n.t0-1,n.t0-duration),from};previous=row;return row;});this.slides=slides;stage.addCheck({id:spec.id+'.mouth',player:spec.id,times:ns.map(n=>n.t0),measure(){const d=inst.point('mouth').distanceTo(R.wpos(g.points.mouth));return{ok:d<.01,value:d};}});},pose,slideFor};
}
