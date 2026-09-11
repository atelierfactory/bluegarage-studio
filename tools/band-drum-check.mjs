// Decode the bundled samples locally, using the real sampler's region/velocity selection.
// A measurable onset-level check, not a claim of a listening test.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SfzInstrument} from '../public/js/sampler.js';
const base=new URL('../public/samples/drums/',import.meta.url),data=JSON.parse(fs.readFileSync(new URL('index.json',base))),sfz=new SfzInstrument('',data),decoded=new Map();
function samples(i){if(!decoded.has(i)){const buffer=execFileSync('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-i',fileURLToPath(new URL(data.samples[i].f,base)),'-f','f32le','-ac','1','-ar','48000','pipe:1'],{maxBuffer:20e6});decoded.set(i,new Float32Array(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)));}return decoded.get(i);}
function stroke(key,vel,idx){const regions=sfz.select(key,vel,{noteIdx:idx}).filter(r=>r.s>=0);if(!regions.length)throw Error(`No sample for ${key}/${vel}/${idx}`);const mix=new Float64Array(19200);let peak=0;
 for(const r of regions){if(!r.oneShot)throw Error(`Drum ${key} would be cut short`);const pcm=samples(r.s),gain=r.g*sfz.velGain(r,vel);for(let i=0;i<Math.min(mix.length,pcm.length);i++)mix[i]+=pcm[i]*gain;}
 let sum=0;for(const x of mix){sum+=x*x;peak=Math.max(peak,Math.abs(x));}return{power:sum/mix.length,peak};}
const dir=new URL('../public/band/repertoire/',import.meta.url),list=JSON.parse(fs.readFileSync(new URL('index.json',dir))),rows=[];let fail=false;
for(const item of list){const{song}=JSON.parse(fs.readFileSync(new URL(item.file,dir))),track=song.tracks.find(t=>t.role==='drums'),levels={};
 for(const[key,label]of[[49,'crash'],[38,'snare'],[42,'hat']]){let power=0,peak=0,count=0;for(const[noteIdx,n]of track.notes.entries()){if(n.p!==key)continue;const a=stroke(key===42?54:key,n.v,noteIdx);power+=a.power;peak=Math.max(peak,a.peak);count++;}levels[label]=10*Math.log10(power/count)+track.volume+(track.drumSampleGains?.[key]??0);levels[`${label}Peak`]=20*Math.log10(peak)+track.volume+(track.drumSampleGains?.[key]??0);}
 const row={song:item.title,crashDb:+levels.crash.toFixed(1),snareDb:+levels.snare.toFixed(1),hatDb:+levels.hat.toFixed(1),crashVsSnare:+(levels.crash-levels.snare).toFixed(1),crashPeak:+levels.crashPeak.toFixed(1)};
 if(!Number.isFinite(levels.crash)||row.crashVsSnare < -6||levels.crash<levels.hat||row.crashPeak>=0)fail=true;rows.push(row);
}
console.table(rows);console.log(`${fail?'FAIL':'PASS'}: actual GM 49 sample selection, one-shot tails, first 400 ms energy; ${decoded.size} bundled samples decoded. Final mix still needs listening.`);process.exitCode=fail?1:0;
