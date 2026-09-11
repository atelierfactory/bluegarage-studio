// Local verification only. No browser, network, score writes or git operations.
import fs from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const node='/Users/satorun/.local/node/bin/node',loader=['--experimental-loader','./tools/band-node-loader.mjs'],vm=['--experimental-vm-modules'];
const files=['public/piano/scene.js','public/band/scene.js','public/band/hardware.js','public/js/key-visual.js','public/band/drum-grip.js','tools/key-visual-check.mjs','tools/band-grip-check.mjs','tools/band-geometry-preview.mjs','astra/verify-p3.mjs'];
for(const file of files){const r=spawnSync(node,['--check',file],{stdio:'inherit'});if(r.status)process.exit(r.status);}
const hashes=Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const scoreHashes=()=>Object.fromEntries(['piano','band'].flatMap(app=>fs.readdirSync(`public/${app}/repertoire`).filter(f=>/\.(json|mid)$/.test(f)).map(f=>{const p=`public/${app}/repertoire/${f}`;return[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')];})));
const protectedBefore=scoreHashes();
const jobs=[
 ['piano-motion-check',loader,['--json']],['band-grip-check',loader],['key-visual-check',loader],
 ['piano-camera-check',loader],['piano-fingering-check',[]],['piano-level-check',[],['--json']],
 ['piano-hardware-check',loader],['piano-headless',loader],['piano-page-check',[...vm,...loader]],
 ['band-check',[],['--json']],['band-regression',vm],['band-page-check',[...vm,...loader]],
 ['band-rehearse',loader],['band-visual-check',loader],['band-hand-check',loader],['band-knob-check',loader],
 ['band-signal-check',[]],['band-drum-check',[]],['band-audio-check',[]],['band-repertoire-check',vm]
].filter(([name])=>!process.argv[2]||process.argv.slice(2).some(filter=>name.includes(filter)));
const previous=process.argv[2]&&fs.existsSync('astra/verification-p3.json')?JSON.parse(fs.readFileSync('astra/verification-p3.json')):null;
const results=(previous?.results??[]).filter(r=>!jobs.some(([name])=>name===r.name));let next=0;
async function worker(){while(next<jobs.length){
 const[name,flags,args=[]]=jobs[next++],out=`astra/${name}-p3.out`,err=`astra/${name}-p3.err`,start=Date.now();
 const stdout=fs.openSync(out,'w'),stderr=fs.openSync(err,'w');
 const child=spawn(node,[...flags,`tools/${name}.mjs`,...args],{stdio:['ignore',stdout,stderr]});fs.closeSync(stdout);fs.closeSync(stderr);
 const exitCode=await new Promise(resolve=>{child.on('error',e=>{console.error(e);resolve(-1);});child.on('exit',resolve);});
 const result={name,exitCode,seconds:+((Date.now()-start)/1000).toFixed(1),out,err};results.push(result);console.log(JSON.stringify(result));
 fs.writeFileSync('astra/verification-p3.json',JSON.stringify({hashes,results,protectedScoresUnchanged:JSON.stringify(protectedBefore)===JSON.stringify(scoreHashes())},null,2)+'\n');
}}
await Promise.all([worker(),worker(),worker()]);
process.exitCode=results.some(r=>r.exitCode!==0)||JSON.stringify(protectedBefore)!==JSON.stringify(scoreHashes())?1:0;
