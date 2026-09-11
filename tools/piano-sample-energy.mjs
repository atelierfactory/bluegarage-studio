// Offline, existing local Salamander assets only. Regenerate the small energy
// table used for a fixed song-load trim; this does not normalize any sample.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import {estimatePiano} from '../public/piano/loudness.js';
import {repertoire,loadPianoSong} from './piano-data.mjs';
const dir=new URL('../public/samples/piano/',import.meta.url);
const index=JSON.parse(fs.readFileSync(new URL('index.json',dir),'utf8'));
const cache=new Map(),regions=[];
for(const r of index.regions.filter(r=>!r.rel&&r.s>=0)) {
  if(!cache.has(r.s)) {
    const path=new URL(index.samples[r.s].f,dir);
    const result=spawnSync(ffmpeg,['-v','error','-i',path.pathname,'-t','2','-f','f32le','-ac','1','-ar','8000','pipe:1'],{maxBuffer:2e6});
    if(result.status!==0)throw new Error(result.stderr.toString());
    const b=result.stdout, powers=[];
    for(let start=0;start<b.length;start+=1600){let sum=0,count=0;for(let j=start;j<Math.min(start+1600,b.length);j+=4){const x=b.readFloatLE(j);sum+=x*x;count++;}powers.push(Number((sum/count).toPrecision(5)));}
    cache.set(r.s,powers);
  }
  regions.push({k:r.k,kc:r.kc,v:r.v,g:r.g,vt:r.vt,release:r.env.r,power:cache.get(r.s)});
}
const output={description:'50 ms mean-square mono sample energy, first 2 s; local Salamander. Not LUFS.',step:.05,regions};
output.calibration={reference:'The Entertainer, original playback, master -4 dB, measured by Claude',medianDb:-30.5,modelOffsetDb:-30.5-estimatePiano(loadPianoSong(repertoire[0]),output).medianDb};
fs.writeFileSync(new URL('../public/piano/sample-energy.json',import.meta.url),JSON.stringify(output)+'\n');
console.log(`${cache.size} existing recordings measured; ${regions.length} regions`);
