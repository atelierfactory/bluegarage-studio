// 協奏曲は専用の舞台。既存の交響曲の席・動き・カメラを変更しない。
import * as THREE from 'three';
import {OrchestraStage,tempoTable} from './stage.js';
import {addConcertoSeats} from './concerto-layout.js';
import {createRig,updateRig} from './rig.js';
import {RobotCrowd} from './robot-lite.js';
import {notesInSec,hash01} from './players/base.js';
import * as strings from './players/concerto-strings.js';
import * as winds from './players/winds.js';
import * as timpani from './players/timpani.js';
import * as conductor from './players/concerto-conductor.js';
import * as trombone from './players/trombone.js';
import {PianoPlayer} from './players/piano.js';
import{initRenderDetail,detailStats,renderConcerto}from'./concerto-render.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
export class ConcertoStage extends OrchestraStage{
 constructor(canvas,options={}){
  super(canvas,options);this.isConcerto=true;
  const before=this.seats.length;addConcertoSeats(this.layout);
  for(const s of this.seats.slice(before)){
   s.rig=createRig(s.robot);s.hash=k=>hash01(s.robot+1,k);s.forward=V(Math.sin(s.yaw),0,Math.cos(s.yaw));this.rigs.push(s.rig);this.scene.add(s.rig.root);
   if(s.instrumentKind==='horn'){s.instrument=this.instruments.add('horn',s);this.scene.add(s.instrument.root);}else s.instrument=trombone.createTrombone(this.scene,{bass:s.player==='tb3'});
  }
  for(const mesh of this.crowd.meshes)this.scene.remove(mesh);
  this.crowd=new RobotCrowd(this.scene,this.rigs);
  for(const mesh of this.instruments.meshes)this.scene.remove(mesh);this.instruments.meshes=[];this.instruments.build();
  for(const obj of this.scene.children.filter(o=>o.name.startsWith('static.')))this.scene.remove(obj);
  this._buildStatic();this._basePose();
  const floor=new THREE.Mesh(new THREE.BoxGeometry(17.6,.12,2),new THREE.MeshStandardMaterial({color:0x0a0908,roughness:.55}));floor.position.set(0,-.06,-2.75);floor.receiveShadow=true;this.scene.add(floor);
  this.scene.getObjectByName('shell')?.scale.set(1.1,1,1.1);
  this._mainFrame.push(...[-3,1.6].flatMap(x=>[0,2].flatMap(y=>[-3.5,-1.4].map(z=>V(x,y,z)))),...[-4.5,1.5].flatMap(x=>[.9,2.8].map(y=>V(x,y,8.2))));
  this.scene.updateMatrixWorld(true);
  initRenderDetail(this);
 }
 setSong(song){
  if(this.pianist){this.scene.remove(this.pianist.light,this.pianist.light.target);this.scene.remove(this.pianist.group);for(const b of this.pianist.batches)this.scene.remove(b.mesh);}
  this.song=song;const fast=tempoTable(song);this.toSec=fast.toSec;this.toBeat=fast.toBeat;const T=this.toSec;
  this.bars=song.bars.map(b=>({...b,t0:T(b.s),t1:T(b.s+b.len)}));this.fermatas=(song.fermatas??[]).map(f=>({...f,t0:T(f.s),t1:T(f.s+f.d)}));this.focus=song.focus.map(f=>({...f,t0:T(f.s),t1:T(f.e)}));
  this.checks=[];this.errors=[];this._basePose();this.players=song.players.map(spec=>({id:spec.id,spec,notes:notesInSec(spec.notes,T),seats:this.layout.byPlayer[spec.id]??[]}));this.endSec=T(song.bars.at(-1).s+song.bars.at(-1).len);
  this.controllers=[];
  for(const p of this.players.filter(p=>p.id!==song.solo.player)){
   const family=p.spec.instrument==='trombone'?trombone:p.spec.family==='strings'?strings:p.spec.family==='percussion'?timpani:winds;
   try{const c=family.createPlayers(this,p.spec,p.seats);c.id=p.id;c.plan(p.notes);this.controllers.push(c);}catch(e){this.errors.push({where:p.id,error:String(e.stack)});}
  }
  try{const c=conductor.createPlayers(this,{id:'conductor'},[this.conductor]);c.id='conductor';c.plan([]);this.controllers.push(c);}catch(e){this.errors.push({where:'conductor',error:String(e.stack)});}
  this.pianist=new PianoPlayer(this,song);this.controllers.push({id:'piano',pose:(sec,dt)=>this.pianist.pose(sec,dt,this.playing||this._shotFrozen)});
  this._planCuts();this._planBrass();this.update(0,T,0,false);
 }
 _planCuts(){
  if(!this.isConcerto)return super._planCuts();
  const cuts=this.focus.map(f=>({sec:f.t0,shot:f.group,pri:1}));
  const list=(this.song.cutList??[]).map(c=>({...c,sec:this.toSec(c.s)-.04,pri:10,list:true})).sort((a,b)=>a.sec-b.sec);
  this.cuts=list.length?[...cuts.filter(c=>c.sec<list[0].sec-6),...list]:cuts;
  if(!this.cuts.length)this.cuts=[{sec:0,shot:'conductor',pri:1}];this.cuts[0].sec=-Infinity;
 }
 setClose(name){if(name.startsWith('piano')||name==='trombones'||name==='conductor-piano')this.closeMode=name;else super.setClose(name);}
 _updateCameras(sec,dt){
  this.camClose.up.set(0,1,0);super._updateCameras(sec,dt);if(!this.pianist)return;
  const cut=this.closeMode==='auto'?this.cutAt(sec):null;let name=cut?.shot??this.closeMode;
  const piano=name.startsWith('piano')||name==='conductor-piano';
  if(piano){
   const p=this.pianist,mode=name==='piano-profile'?'profile':'hands',points=p.framePoints(mode);let look=p.world(V(0,.85,0)),position;
   if(name==='piano-top'){
    // 実測した全コマの手の包絡と88鍵だけを固定枠へ入れ、ふたの側からではなく奏者の上から見る。
    points.splice(0,points.length,...[-.69,.69].flatMap(x=>[.70,.86].flatMap(y=>[-.23,.18].map(z=>p.world(V(x,y,z))))));
    look=p.world(V(0,.78,-.025));position=p.world(V(0,2.4,.8));
   }
   else if(name==='piano-profile')position=p.world(V(2.7,1.45,.7));
   else if(name==='piano-strings'){position=V(3.6,2.3,-4.2);points.push(...[this.layout.byPlayer.vn1[0],this.layout.byPlayer.vc[0]].flatMap(s=>[s.pos.clone(),s.pos.clone().add(V(0,1.7,0))]));look=V(0,1,-.5);}
   else if(name==='conductor-piano'){position=V(3.2,2.4,-3.4);points.push(V(-.7,.3,0),V(.7,2.4,.6));look=V(.3,1,-1);}
   else position=p.world(V(1.6,1.8,.8));
   this.camClose.fov=38;this.camClose.updateProjectionMatrix();this.camClose.position.copy(position);this.camClose.up.set(0,1,0);if(name==='piano-top')this.camClose.up.set(1,0,0);this.camClose.lookAt(look);this._fitCamera(this.camClose,points,.86,look);this._closePos.copy(this.camClose.position);this._closeLook.copy(look);this.closeFrame=points;this.closeSubjects=['piano'];this.closeShot=name;this.closeDriftMax=0;
  }else if(name==='conductor'&&this._shortClose()){
   // 短い指揮者の画は少し上から。奥のふたの裏を大きく映さず、合図の両腕を固定枠へ入れる。
   const points=this.shortShots.conductor.frame,look=new THREE.Box3().setFromPoints(points).getCenter(V());
   this.camClose.fov=35;this.camClose.updateProjectionMatrix();this.camClose.up.set(0,1,0);this.camClose.position.copy(look).add(V(.7,2.3,2.7));this.camClose.lookAt(look);this._fitCamera(this.camClose,points,.88,look);
   this._closePos.copy(this.camClose.position);this._closeLook.copy(look);this.closeFrame=points;this.closeSubjects=['conductor'];this.closeShot='conductor';this.closeDriftMax=0;
  }else if(name==='horns'){
   const list=this.seats.filter(s=>/^hn[1-4]$/.test(s.player)),look=list.reduce((a,s)=>a.add(s.pos),V()).divideScalar(4).add(V(0,1,0)),points=list.flatMap(s=>[-.5,.5].flatMap(x=>[.1,2].flatMap(y=>[-.5,.6].map(z=>s.pos.clone().add(V(x,y,z))))));
   this.camClose.up.set(0,1,0);this.camClose.position.copy(look).add(V(1.8,1.8,-3.6));this.camClose.lookAt(look);this._fitCamera(this.camClose,points,.88,look);this.closeFrame=points;this.closeSubjects=list.map(s=>s.id);this.closeShot=name;
  }else if(name==='trombones'){
   const list=this.seats.filter(s=>s.player.startsWith('tb')),look=list.reduce((a,s)=>a.add(s.pos),V()).divideScalar(3).add(V(0,1,0)),points=list.flatMap(s=>[-.4,.4].flatMap(x=>[.1,1.9].flatMap(y=>[-.4,1.7].map(z=>s.pos.clone().add(V(x,y,z).applyAxisAngle(V(0,1,0),s.yaw))))));
   this.camClose.up.set(0,1,0);this.camClose.position.copy(look).add(V(-2,2,-4));this.camClose.lookAt(look);this._fitCamera(this.camClose,points,.88,look);this.closeFrame=points;this.closeSubjects=list.map(s=>s.id);this.closeShot=name;
  }
 }
 stats(){const s=this.renderParts?detailStats(this,()=>super.stats()):super.stats();if(this.isConcerto){s.robots=this.rigs.length+(this.pianist?1:0);s.pianoBatches=this.pianist?.batches.length??0;}return s;}
 render(){return renderConcerto(this);}
}
