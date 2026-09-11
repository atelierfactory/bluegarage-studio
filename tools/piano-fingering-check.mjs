import assert from 'node:assert/strict';
import {autoFinger} from '../public/js/fingering.js';
import {repertoire,loadPianoSong,fingerChanges} from './piano-data.mjs';
const note=(p,s=0,extra={})=>({p,s,d:.2,v:80,...extra});
const repeat=autoFinger(Array.from({length:6},(_,i)=>note(60,i*.1)),{tempo:120});
assert.ok(repeat.slice(1).every((n,i)=>n.f!==repeat[i].f),'Fast repeated single notes alternate fingers');
const written=[note(48,0,{h:'R',f:1}),note(72,0,{h:'L',f:5}),note(64,1)];
const preserved=autoFinger(written);assert.equal(preserved[0].h,'R');assert.equal(preserved[0].f,1);assert.equal(preserved[1].h,'L');assert.equal(preserved[1].f,5);
assert.equal(written[2].f,undefined,'Input untouched');
const dense=autoFinger([60,62,64,65,67,69].map(p=>note(p)));
for(const h of ['L','R'])assert.ok(new Set(dense.filter(n=>n.h===h).map(n=>n.f)).size===dense.filter(n=>n.h===h).length,'Six-note chord split between hands');
const limits=[89,157,123];
for(const [i,item]of repertoire.filter(it=>!it.perf).entries()){
  const song=loadPianoSong(item),notes=song.tracks[0].notes;
  assert.ok(notes.every(n=>Number.isInteger(n.f)&&n.f>=1&&n.f<=5));
  assert.ok(fingerChanges(notes)<=limits[i]);
  console.log(`${item.file}: ${fingerChanges(notes)} substitutions`);
}
console.log('PASS: score-wide stability, rapid repetition, fixed assignments, dense chord and immutable input');
