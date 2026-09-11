// node --experimental-loader ./tools/band-node-loader.mjs tools/piano-motion-check.mjs [song substring] [--json]
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {PianoStage} from './piano-headless.mjs';
import {repertoire,repertoireDir,loadPianoSong,fingerChanges} from './piano-data.mjs';
import {beatToSec,secToBeat} from '../public/js/state.js';
import {motionAt,MOTION_LIMITS} from '../public/piano/motion.js';
const baseline=JSON.parse(fs.readFileSync(new URL('../astra/piano-baseline.json',import.meta.url),'utf8'));
for(const [file,hash] of Object.entries(baseline.hashes)) {
  if(createHash('sha256').update(fs.readFileSync(new URL(file,repertoireDir))).digest('hex')!==hash)throw Error(`Protected score changed: ${file}`);
}
const sourceHashes=Object.fromEntries(['public/piano/scene.js','public/piano/motion.js','public/js/robot-hardware.js','public/js/fingering.js','public/js/state.js','tools/piano-motion-check.mjs'].map(file=>[file,createHash('sha256').update(fs.readFileSync(new URL('../'+file,import.meta.url))).digest('hex')]));
const filter=process.argv.slice(2).find(a=>!a.startsWith('--'));
const stage=new PianoStage(null,{headless:true}),reports=[];
for(const item of repertoire.filter(it=>!filter||(it.file+' '+it.title).includes(filter))) {
  const song=loadPianoSong(item),notes=song.tracks[0].notes,toSec=b=>beatToSec(b,song);
  const attacks=stage.rehearse(notes,song.pedal,toSec,{secToBeat:sec=>secToBeat(sec,song)});
  stage.setSong(notes,song.pedal);stage.update(0,toSec,0,true);
  const plan=stage.motion,end=Math.max(...plan.notes.map(n=>n._e)),fpsResults=[];
  const started=performance.now();
  const preparation={checked:0,misses:0,examples:[]},releaseChecks=[];
  for(const n of plan.notes) {
    if(n._visualRelease){for(const offset of[0,.012,.035]){stage.update(secToBeat(n._s+offset,song),toSec,0,true);releaseChecks.push({...stage.measureRelease(n),offset});}continue;}
    stage.update(secToBeat(Math.max(0,n._s-.001),song),toSec,0,true);
    const r=stage.measureContact(n),halfWidth=[1,3,6,8,10].includes(n.p%12)?.00575:.01075;
    preparation.checked++;
    if(Math.abs(r.dx)>halfWidth||r.dz!==0||r.dy<-.008||r.dy>.025){preparation.misses++;if(preparation.examples.length<5)preparation.examples.push(r);}
  }
  for(const fps of process.argv.includes('--onsets-only')?[]:[60,30,20,12]) {
    let checked=0,misses=0,maxSpeed=0,positionDrift=0,assignmentChanges=0,releasedChecks=0;
    const previous={},assignments=new Map(),seen=new Set(),examples=[];
    for(let frame=0;frame<=Math.ceil(end*fps);frame++) {
      const sec=frame/fps;stage.update(secToBeat(sec,song),toSec,1/fps,true);
      for(const n of plan.notes.filter(n=>n._visualRelease))if(sec>=n._s&&sec<n._s+.04){releasedChecks++;if(!stage.measureRelease(n).clear)misses++;}
      for(const h of ['L','R']) {
        const pose=motionAt(plan,h,sec);if(!pose)continue;
        const wrist=stage.hands[h==='L'?'Left':'Right'].bone.getWorldPosition(new stage.camWide.position.constructor());
        if(previous[h])maxSpeed=Math.max(maxSpeed,wrist.distanceTo(previous[h])*fps);
        previous[h]=wrist;
        positionDrift=Math.max(positionDrift,Math.abs(stage.handState[h].x-pose.palm.x),Math.abs(stage.handState[h].z-pose.palm.z));
        for(const n of pose.contacts) {
          seen.add(n._i);checked++;const r=stage.measureContact(n);
          if(r.miss){misses++;if(examples.length<4)examples.push({...r,sec});}
          if(assignments.has(n._i)&&assignments.get(n._i)!==n._f)assignmentChanges++;
          assignments.set(n._i,n._f);
        }
      }
    }
    // A sub-frame note can have no displayed frame. Report it, without pretending
    // to have shown every attack on a 12 Hz display. Exact probes above cover it.
    fpsResults.push({fps,checked,misses,maxSpeed,positionDrift,assignmentChanges,releasedChecks,betweenFrames:plan.notes.filter(n=>!n._visualRelease).length-seen.size,examples});
  }
  let pathMaxSpeed=0;
  for(const h of ['L','R'])for(let sec=1/240;sec<end;sec+=1/240){const a=motionAt(plan,h,sec-1/240),b=motionAt(plan,h,sec);if(a&&b)pathMaxSpeed=Math.max(pathMaxSpeed,Math.hypot(b.palm.x-a.palm.x,b.palm.y+b.lift-a.palm.y-a.lift,b.palm.z-a.palm.z)*240);}
  const before=baseline.rows.find(r=>r.file===item.file).fingerChanges,after=fingerChanges(notes);
  const failed=preparation.misses>0||attacks.misses.length>0||plan.issues.length>0||plan.releases.length>1||releaseChecks.some(r=>!r.clear)||plan.releases.some(r=>r.required<=MOTION_LIMITS.speed)||preparation.checked+plan.releases.length!==notes.length||fpsResults.some(r=>r.misses||r.assignmentChanges||r.positionDrift>1e-5||r.maxSpeed>MOTION_LIMITS.speed+.01)||pathMaxSpeed>MOTION_LIMITS.speed+.01||(!item.perf&&(after>before/4||fingerChanges(plan.notes,'_f')>before/4));
  const report={file:item.file,title:item.title,notes:notes.length,before,after,displayChanges:fingerChanges(plan.notes.filter(n=>!n._visualRelease),'_f'),preparation,onsets:{checked:attacks.checked,misses:attacks.misses.length,maxDx:attacks.maxDx,maxDy:attacks.maxDy,maxDz:attacks.maxDz,examples:attacks.misses.slice(0,12)},fps:fpsResults,pathMaxSpeed,issues:plan.issues,releases:plan.releases,releaseChecks,failed,ms:Math.round(performance.now()-started)};
  reports.push(report);
  if(process.argv.includes("--json"))console.error(`${item.file}: onset ${attacks.misses.length}, motion ${plan.issues.length}, prep ${preparation.misses}, fps ${fpsResults.map(r=>r.misses).join("/")}`);
  if(!process.argv.includes('--json'))console.log(JSON.stringify({...report,issues:report.issues.slice(0,5)}));
}
if(process.argv.includes('--json'))console.log(JSON.stringify({sourceHashes,limits:MOTION_LIMITS,reports},null,2));
if(!reports.length||reports.some(r=>r.failed))process.exitCode=1;
