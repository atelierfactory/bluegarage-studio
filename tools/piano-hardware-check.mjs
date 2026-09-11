// node --experimental-loader ./tools/band-node-loader.mjs tools/piano-hardware-check.mjs
import assert from 'node:assert/strict';
import './piano-headless.mjs';
import {buildSkeleton,buildRobot,ROBOT_SCALE,TIP_R,V} from '../public/piano/scene.js';
import {refineHands,refinePianoArms,batchHardware} from '../public/js/robot-hardware.js';
const bones=buildSkeleton(),hands={};buildRobot(bones,hands);
const joints=Object.values(hands).flatMap(h=>[h.bone,...h.fingers.flatMap(f=>[f.root,f.joint,f.tip])]);
const before=joints.map(o=>({p:o.position.toArray(),q:o.quaternion.toArray(),s:o.scale.toArray()}));
bones.Hips.updateMatrixWorld(true);
const tips=Object.values(hands).flatMap(h=>h.fingers.map(f=>f.tip.getWorldPosition(V(0,0,0))));
refineHands(hands,ROBOT_SCALE,TIP_R,{knuckleArch:false});refinePianoArms(bones,hands);
let beforeBatch=0;bones.Hips.traverse(o=>{if(o.isMesh)beforeBatch++;});
for(const side of ['Left','Right'])batchHardware(bones[side+'ForeArm']);
bones.Hips.updateMatrixWorld(true);
assert.deepEqual(joints.map(o=>({p:o.position.toArray(),q:o.quaternion.toArray(),s:o.scale.toArray()})),before,'Every bone/joint/tip transform is identical');
const after=Object.values(hands).flatMap(h=>h.fingers.map(f=>f.tip.getWorldPosition(V(0,0,0))));
const maxTipDelta=Math.max(...tips.map((p,i)=>p.distanceTo(after[i])*ROBOT_SCALE));assert.equal(maxTipDelta,0);
const names=[];let afterBatch=0;bones.Hips.traverse(o=>{if(o.isMesh){afterBatch++;names.push(o.name,...(o.userData.parts??[]));}});
for(const name of ['dorsal-tendon','dorsal-screw','wrist-bearing','forearm-shell','forearm-actuator','finger-armour'])assert.ok(names.includes(name),name);
for(const h of Object.values(hands)){assert.ok(!h.bone.children.some(o=>o.geometry?.type==='BoxGeometry'));for(const f of h.fingers)assert.equal(f.contactPad.geometry.parameters.radius,TIP_R/ROBOT_SCALE);}
assert.ok(afterBatch<beforeBatch*.65,'Static hardware is batched');
console.log(JSON.stringify({pass:true,tipDeltaMm:maxTipDelta*1000,unchangedTransforms:joints.length,meshesBeforeBatch:beforeBatch,meshesAfterBatch:afterBatch},null,2));
