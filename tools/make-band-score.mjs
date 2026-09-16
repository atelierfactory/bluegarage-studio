// Writer for one independently authored score: node tools/make-band-score.mjs <score-id> [--first]
// Validates like make-band-repertoire.mjs, writes public/band/repertoire/<id>.band.json and
// upserts the index entry (--first puts it at the top = the song the page opens at boot).
import fs from 'node:fs';
import {analyzeBand} from '../public/band/critic.js';
import {validateBandSong,partsFromSong} from '../public/band/model.js';
import {beatToSec} from '../public/js/state.js';
const id=process.argv[2];if(!id)throw Error('usage: node tools/make-band-score.mjs <score-id> [--first]');
const first=process.argv.includes('--first');
const {default:make}=await import(`./scores/${id}.mjs`);
const {song}=make();
const dir=new URL('../public/band/repertoire/',import.meta.url);
const bars=song.sections.reduce((n,s)=>n+s.bars,0),errors=validateBandSong(song),a=analyzeBand(partsFromSong(song),{song,range:{startBar:0,bars}});
const seconds=beatToSec(bars*song.timeSig,song);
console.log(`${id}: ${seconds.toFixed(3)} seconds; ${bars} bars; keys ${a.stats.synth} / pedal ${a.stats.pedal} / drums ${a.stats.drums} / kick ${a.stats.kick} / knobs ${a.stats.knobs}; keys per bar ${(a.stats.synth/bars).toFixed(2)}`);
if(errors.length||a.stats.fixes.length||a.issues.length){console.error(JSON.stringify({errors,fixes:a.stats.fixes,issues:a.issues},null,2));process.exitCode=1;}
else{
 const entry={title:song.title,file:`${id}.band.json`,composer:song.composer,license:song.license,tempo:song.tempo,bars,note:song.concept,shots:song.shots,moments:song.moments};
 const existing=JSON.parse(fs.readFileSync(new URL('index.json',dir),'utf8')).filter(item=>item.file!==entry.file);
 const index=first?[entry,...existing]:[...existing,entry];
 fs.writeFileSync(new URL(entry.file,dir),JSON.stringify({song},null,2)+'\n');
 fs.writeFileSync(new URL('index.json',dir),JSON.stringify(index,null,2)+'\n');
 console.log(`wrote ${entry.file}; index: ${index.map(i=>i.file).join(', ')}`);
}
