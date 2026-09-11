// File writer and validator only. Each independently authored score owns its
// form, motifs, voicings, groove, dynamics and automation in tools/scores/.
import fs from 'node:fs';
import glass from './scores/glass-current.mjs';
import copper from './scores/copper-hinge.mjs';
import porcelain from './scores/porcelain-tide.mjs';
import {analyzeBand} from '../public/band/critic.js';
import {validateBandSong,partsFromSong} from '../public/band/model.js';
import {beatToSec} from '../public/js/state.js';
const dir=new URL('../public/band/repertoire/',import.meta.url),index=[];
// This writer owns only the three Astra files. Keep all independently added
// entries (including Fable listening candidates) and never rewrite their files.
const existing=JSON.parse(fs.readFileSync(new URL('index.json',dir),'utf8'));
const scores=[glass(),copper(),porcelain()];let failed=false;
for(const {id,song}of scores){
 const bars=song.sections.reduce((n,s)=>n+s.bars,0),errors=validateBandSong(song),a=analyzeBand(partsFromSong(song),{song,range:{startBar:0,bars}});
 if(errors.length||a.stats.fixes.length||a.issues.length){console.error(id,JSON.stringify({errors,fixes:a.stats.fixes,issues:a.issues},null,2));failed=true;}
 index.push({title:song.title,file:`${id}.band.json`,composer:song.composer,license:song.license,tempo:song.tempo,bars,note:song.concept,shots:song.shots,moments:song.moments});
 console.log(`${id}: ${beatToSec(bars*song.timeSig,song).toFixed(3)} seconds; ${a.stats.count} notes; ${song.tracks[0].knobs.length} gestures`);
}
if(existing.some(item=>item.candidate&&index.some(owned=>owned.file===item.file)))throw Error('Refusing to overwrite a listening candidate');
const ownedFiles=new Set(index.map(item=>item.file));
const nextIndex=[...index,...existing.filter(item=>!ownedFiles.has(item.file))];
if(failed)process.exitCode=1;
else {for(let i=0;i<scores.length;i++)fs.writeFileSync(new URL(index[i].file,dir),JSON.stringify({song:scores[i].song},null,2)+'\n');fs.writeFileSync(new URL('index.json',dir),JSON.stringify(nextIndex,null,2)+'\n');}
