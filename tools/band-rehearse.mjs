// No browser/rendering: real THREE scene + actual animation/IK, only label canvases stubbed.
// node --experimental-loader ./tools/band-node-loader.mjs tools/band-rehearse.mjs
import fs from 'node:fs';
import { beatToSec } from '../public/js/state.js';
import { partsFromSong } from '../public/band/model.js';
import { knobDefaults } from '../public/js/synth2.js';
const ctx={fillRect(){},strokeRect(){},fillText(){},measureText(s){return {width:s.length*22};}};
globalThis.document={createElement(){return {getContext(){return ctx;}};}};
const { BandStage }=await import('../public/band/scene.js');
const stage=new BandStage(null,{headless:true});
const dir=new URL('../public/band/repertoire/',import.meta.url);
const list=JSON.parse(fs.readFileSync(new URL('index.json',dir),'utf8'));
for(const item of list) {
  if(process.argv[2]&&!item.file.includes(process.argv[2])) continue;
  const {song}=JSON.parse(fs.readFileSync(new URL(item.file,dir),'utf8'));
  stage.setSong(partsFromSong(song),knobDefaults(song.tracks[0].synth2));
  const result=stage.rehearse(b=>beatToSec(b,song));
  console.log(JSON.stringify({file:item.file,counts:result.counts,misses:result.misses.length,examples:result.misses.slice(0,12)}));
  if(result.misses.length) process.exitCode=1;
}
