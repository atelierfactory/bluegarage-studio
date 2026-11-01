// 伴奏では拍子の図形、独奏では手を休め、最後の息で楽団へ合図する。
import * as THREE from 'three';
import {createPlayers as original} from './conductor.js';
import {rig as R,V,smooth} from './base.js';
const patterns={2:[0,-.22],3:[0,-.24,.24],4:[0,-.24,.24,.12],6:[0,-.18,-.3,.3,.18,.1]};
export function createPlayers(stage,spec,seats){
 const base=original(stage,spec,seats),seat=seats[0],g=seat.rig,baton=seat.baton;
 const gripLocal=baton.spec.points.grip.clone();let bars=[],entries=[],lastLook=V(0,1.4,4);
 return {plan(ns){base.plan(ns);bars=stage.bars;entries=stage.players.filter(p=>p.id!=='piano').flatMap(p=>p.notes.map(n=>n.t0)).sort((a,b)=>a-b);const last=stage.players.filter(p=>p.id!=='piano').flatMap(p=>p.notes.map(n=>({t:n.t1,seat:p.seats[0]}))).sort((a,b)=>b.t-a.t)[0];if(last?.seat)lastLook=last.seat.pos.clone().add(V(0,1.4,0));},pose(sec,dt){
  base.pose(sec,dt);
  const end=stage.song.ending?stage.toSec(stage.song.ending.cutoffBeat):Infinity;
  if(sec>=end-.6){
   const u=smooth(Math.max(0,Math.min(1,(sec-end+.6)/.6))),rest=smooth(Math.max(0,Math.min(1,(sec-end-1)/1.3)));
   const target=seat.pos.clone().add(V(-.28+.12*Math.sin(u*Math.PI),1.2-.12*u-.27*rest,.2+.12*Math.sin(u*Math.PI)));
   R.reachWith(g,'Right',g.points.gripRight,target,V(0,1,0),V(0,0,1));R.lookAt(g,lastLook,.7,0);R.updateRig(g);
   const q=new THREE.Quaternion();baton.root.getWorldQuaternion(q);baton.root.position.copy(R.wpos(g.points.gripRight)).sub(gripLocal.clone().applyQuaternion(q));baton.root.updateMatrixWorld(true);return;
  }
  const b=bars.find(b=>sec>=b.t0&&sec<b.t1);if(!b)return;
  let target=R.wpos(g.points.gripRight);
  if(b.conduct===0){const re=entries.find(t=>t>sec+.01)??Infinity,cue=smooth((sec-re+1)/.8);target=seat.pos.clone().add(V(-.29,.87+.43*cue,.17+.2*cue));R.lookAt(g,V(1,1.2,-2.3),1,0);baton.root.quaternion.setFromEuler(new THREE.Euler(0,0,Math.PI*.87-.9*cue));}
  else{const count=b.conduct??b.num,u=(stage.beat-b.s)/Math.max(.001,b.len)*count,i=Math.floor(u),f=u-i,pat=patterns[count]??patterns[4],x=(pat[i%pat.length]*(1-smooth(f))+pat[(i+1)%pat.length]*smooth(f));target.x+=x;}
  R.reachWith(g,'Right',g.points.gripRight,target,V(0,1,0),V(0,0,1));R.updateRig(g);
  const q=new THREE.Quaternion();baton.root.getWorldQuaternion(q);baton.root.position.copy(R.wpos(g.points.gripRight)).sub(gripLocal.clone().applyQuaternion(q));baton.root.updateMatrixWorld(true);
 }};
}
