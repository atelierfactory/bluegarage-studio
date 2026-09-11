// The same MIDI rounding and defaults as the piano page. No repertoire writes.
import fs from 'node:fs';
import { parseMidi } from '../public/js/midiread.js';
import { autoFinger } from '../public/js/fingering.js';
import { defaultSong, makeTrack } from '../public/js/state.js';
export const repertoireDir = new URL('../public/piano/repertoire/', import.meta.url);
export const repertoire = JSON.parse(fs.readFileSync(new URL('index.json', repertoireDir), 'utf8'));
export function loadPianoSong(item, finger = autoFinger) {
  if (item.perf) return JSON.parse(fs.readFileSync(new URL(item.perf, repertoireDir), 'utf8')).song;
  const m = parseMidi(fs.readFileSync(new URL(item.file, repertoireDir)));
  const song = defaultSong();
  song.title = item.title; song.tempo = Math.round(m.tempo);
  const ts = m.timeSig.den === 8 ? (m.timeSig.num === 6 ? 6 : 3) : m.timeSig.num;
  song.timeSig = [3, 4, 6].includes(ts) ? ts : 4;
  song.tempoMap = m.tempos.length > 1 ? m.tempos.map(x => ({beat:x.beat, tempo:Math.round(x.tempo*10)/10})) : [];
  song.pedal = m.pedal.map(p => ({s:+p.s.toFixed(4), d:+p.d.toFixed(4)}));
  const raw = m.notes.filter(n => n.p >= 21 && n.p <= 108).map(n => ({p:n.p, s:+n.s.toFixed(4), d:+Math.max(.05,n.d).toFixed(4), v:Math.max(1,Math.min(127,n.v)), track:n.track}));
  const notes = finger(raw, {tracks:m.tracks, tempo:song.tempo});
  song.tracks = [makeTrack({instrument:'piano', role:'piano', volume:-4, notes})];
  song.tracks[0].fx.hall = .35; song.tracks[0].fx.room = .15; song.master.hallDecay = 2.8;
  song.sections = [{name:item.title, bars:Math.ceil(Math.max(...notes.map(n => n.s+n.d))/song.timeSig)}];
  return song;
}
export function fingerChanges(notes, field = 'f') {
  const last = new Map(); let changes = 0;
  for (const n of notes.slice().sort((a,b) => a.s-b.s || a.p-b.p)) {
    const key = `${n.h}:${n.p}`, f = n[field];
    if (last.has(key) && last.get(key) !== f) changes++;
    last.set(key, f);
  }
  return changes;
}
