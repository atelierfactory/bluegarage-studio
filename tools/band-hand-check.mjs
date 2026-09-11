// Check entire fingers, joints and the real diagonal fingertip link, not only contact points.
// The two main links use conservative envelopes wider than their armour. Units are metres.
import fs from 'node:fs';
import * as THREE from 'three';
import {beatToSec} from '../public/js/state.js';
import {knobDefaults} from '../public/js/synth2.js';
import {partsFromSong} from '../public/band/model.js';
const ctx={fillRect(){},strokeRect(){},fillText(){},measureText:s=>({width:s.length*22})};
globalThis.document={createElement:()=>({getContext:()=>ctx})};
const {BandStage}=await import('../public/band/scene.js');
const stage=new BandStage(null,{headless:true}),dir=new URL('../public/band/repertoire/',import.meta.url),list=JSON.parse(fs.readFileSync(new URL('index.json',dir)));
// Closest points on two finite line segments, including parallel segments.
function distance(a,b,c,d){const u=b.clone().sub(a),v=d.clone().sub(c),w=a.clone().sub(c),A=u.dot(u),B=u.dot(v),C=v.dot(v),D=u.dot(w),E=v.dot(w),den=A*C-B*B;let s=den>1e-15?Math.max(0,Math.min(1,(B*E-C*D)/den)):0,t=(B*s+E)/C;if(t<0){t=0;s=Math.max(0,Math.min(1,-D/A));}else if(t>1){t=1;s=Math.max(0,Math.min(1,(B-D)/A));}return w.addScaledVector(u,s).addScaledVector(v,-t).length();}
let checked=0,min=1,maxError=0,frames=0,elapsed=0;const failures=[];
for(const item of list.filter(x=>!process.argv[2]||x.file.includes(process.argv[2]))){const {song}=JSON.parse(fs.readFileSync(new URL(item.file,dir)));stage.setSong(partsFromSong(song),knobDefaults(song.tracks[0].synth2));
 for(const e of stage.song.knobs){stage.poseAt(e.s,b=>beatToSec(b,song));
 for(let step=0;step<=40;step++){const phase=step/40,beat=e.s+e.d*phase,start=performance.now();stage.update(beat,b=>beatToSec(b,song),beatToSec(e.d,song)/40,true);elapsed+=performance.now()-start;frames++;const fingers=stage.hands.Right.fingers;
 const segments=fingers.map(f=>{const a=f.root.getWorldPosition(new THREE.Vector3()),b=f.joint.getWorldPosition(new THREE.Vector3()),c=f.joint.localToWorld(new THREE.Vector3(stage.hands.Right.sgn*f.len*.45,0,0));const tipLink=f.joint.children.find(o=>o.name==='finger-tip-link'),hh=tipLink.geometry.parameters.height/2,ta=tipLink.localToWorld(new THREE.Vector3(0,-hh,0)),tb=tipLink.localToWorld(new THREE.Vector3(0,hh,0));return [[a,b,.00854],[b,c,.0071],[ta,tb,tipLink.geometry.parameters.radiusTop*.061]];});
 for(let i=0;i<5;i++)for(let j=i+1;j<5;j++)for(const [a,b,r]of segments[i])for(const[c,d,t]of segments[j]){const gap=distance(a,b,c,d)-r-t;checked++;min=Math.min(min,gap);if(gap<0)failures.push({file:item.file,beat,pair:[i,j],gap});}
 const spheres=fingers.map(f=>[[f.root.getWorldPosition(new THREE.Vector3()),.16*.061],[f.joint.getWorldPosition(new THREE.Vector3()),.135*.061],[f.tip.getWorldPosition(new THREE.Vector3()),.0055]]);
 const pointDistance=(p,a,b)=>{const v=b.clone().sub(a),t=Math.max(0,Math.min(1,p.clone().sub(a).dot(v)/v.lengthSq()));return p.distanceTo(a.clone().addScaledVector(v,t));};
 for(let i=0;i<5;i++)for(let j=0;j<5;j++)if(i!==j)for(const [p,r]of spheres[i])for(const [a,b,t]of segments[j]){const gap=pointDistance(p,a,b)-r-t;checked++;min=Math.min(min,gap);if(gap<0)failures.push({file:item.file,beat,pair:[i,j],jointGap:gap});}
 for(let i=0;i<2;i++){const error=fingers[i].tip.getWorldPosition(new THREE.Vector3()).distanceTo(stage.knobContacts[i]);maxError=Math.max(maxError,error);if(error>.002)failures.push({file:item.file,beat,finger:i,error,q:fingers[i].contactPose});}
 }}}
console.log(JSON.stringify({checks:checked,frames,meanAnimationMs:elapsed/frames,minimumFingerClearanceMm:min*1000,maximumContactErrorMm:maxError*1000,failures:failures.length,examples:failures.slice(0,12)},null,2));if(failures.length)process.exitCode=1;
