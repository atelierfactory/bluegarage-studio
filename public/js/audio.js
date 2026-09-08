// ═══════════ audio engine (Tone.js + 自作多層サンプラー + シンセ + ミックスバス) ═══════════
// 音源の優先順位:
//   1. /samples/<instrument>/index.json … tools/sfz-import.mjs で変換したローカルの多層サンプル
//   2. CDN の 1鍵1サンプル (Salamander mp3 / tonejs-instruments) … ローカル音源が無いときの予備
//   3. Tone.js シンセ … 読み込み失敗時のフォールバック (必ず鳴る)
// シンセ系トラック (synth / synth-lead / synth-pad / synth-bass) は synth.js のパッチで鳴らす。
// オルガンは Tone.js で作る (本物の Hammond+Leslie の再配布可能な録音が存在しないため)。
// 時間の基準: 拍 → 秒の変換は state.js の beatToSec (テンポマップ対応)。Transport の bpm は使わない。

/* global Tone */
import { state, totalBeats, emit, beatToSec, secToBeat, tempoAt, noteEndBeat, SYNTH_INSTRUMENTS, INSTRUMENT_DEFS } from "./state.js";
import { SfzInstrument, sampleCacheStats } from "./sampler.js";
import { createSynth, presetFor, normalizePatch } from "./synth.js";
import { createMixGraph, createTrackChain } from "./mix.js";
import { normalizeLoudness, measureLoudness } from "./loudness.js";
import * as midi from "./midiio.js";

const NB = "https://nbrosowsky.github.io/tonejs-instruments/samples/";
const TONEJS = "https://tonejs.github.io/audio/";
const SAMPLE_BASE = new URL("../samples/", import.meta.url).href; // このファイルの場所基準 (piano/ などのサブページや、サブディレクトリ配信でも同じ音源を指す)

const engines = new Map();   // trackId -> {chain, inst, instKind, patchKey, part}
let graph = null;            // マスター + リバーブバス (メインコンテキスト)
let graphKey = "";

function noteName(p) { return Tone.Frequency(p, "midi").toNote(); }
const rawCtx = () => Tone.getContext().rawContext;

function masterKey(m) { return `${(+m.hallDecay).toFixed(2)}|${(+m.roomDecay).toFixed(2)}`; }
function ensureGraph() {
  const m = state.song.master;
  const key = masterKey(m);
  if (graph && key === graphKey) { graph.update(m); return graph; }
  // 残響時間が変わった → IR ごと作り直し (チャンネルのつなぎ直しも必要)
  const old = graph;
  graph = createMixGraph(m);
  graphKey = key;
  if (old) {
    for (const eng of engines.values()) { eng.chain.dispose(); eng.chain = createTrackChain(trackById(eng.trackId) ?? {}, graph); eng.inst.outs.forEach((o) => Tone.connect(o, eng.chain.input)); }
    old.dispose();
  }
  return graph;
}
const trackById = (id) => state.song.tracks.find((t) => t.id === id);

/* ─────────── ローカル多層サンプル (index.json) ─────────── */
const sfzCache = new Map();
export function loadSfz(name) {
  if (!sfzCache.has(name)) {
    sfzCache.set(name, SfzInstrument.load(`${SAMPLE_BASE}${name}/`).then((s) => {
      console.info(`[audio] ローカル音源: ${name} ← ${s.label} (${s.regions.length} regions)`);
      return s;
    }).catch((e) => { console.info(`[audio] ${name}: ローカル音源なし (${e.message}) → 予備音源`); return null; }));
  }
  return sfzCache.get(name);
}

const DRUM_MAP = {
  35: 36, 36: 36, 37: 37, 38: 38, 40: 40,
  41: 41, 43: 43, 45: 45, 47: 47, 48: 48, 50: 48,
  42: 54, 44: 44, 46: 46, 49: 49, 57: 57, 55: 55, 52: 52, 51: 51, 53: 53, 59: 51,
};
const remapDrumNotes = (notes) => notes.map((n, i) => ({ ...n, p: DRUM_MAP[n.p] ?? n.p, i }));

/* ─────────── CDN サンプル (予備) ─────────── */
function expandMap(obj, dir) { return { urls: { ...obj }, baseUrl: NB + dir + "/" }; }
const SAMPLE_DEFS = {
  "piano": {
    urls: Object.fromEntries(["A0","C1","Ds1","Fs1","A1","C2","Ds2","Fs2","A2","C3","Ds3","Fs3","A3","C4","Ds4","Fs4","A4","C5","Ds5","Fs5","A5","C6","Ds6","Fs6","A6","C7","Ds7","Fs7","A7","C8"].map((n) => [n.replace("s", "#"), `${n}.mp3`])),
    baseUrl: TONEJS + "salamander/", release: 1.2,
  },
  "epiano": null,
  "bass": expandMap({ "A#1": "As1.mp3", "A#2": "As2.mp3", "A#3": "As3.mp3", "C#1": "Cs1.mp3", "C#2": "Cs2.mp3", "C#3": "Cs3.mp3", "E1": "E1.mp3", "E2": "E2.mp3", "E3": "E3.mp3", "G1": "G1.mp3", "G2": "G2.mp3", "G3": "G3.mp3" }, "bass-electric"),
  "guitar-electric": expandMap({ "C#2": "Cs2.mp3", "E2": "E2.mp3", "F#2": "Fs2.mp3", "A2": "A2.mp3", "C3": "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3", "A3": "A3.mp3", "C4": "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3", "A4": "A4.mp3", "C5": "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3", "A5": "A5.mp3", "C6": "C6.mp3" }, "guitar-electric"),
  "guitar-acoustic": expandMap({ "D2": "D2.mp3", "F2": "F2.mp3", "G#2": "Gs2.mp3", "B2": "B2.mp3", "D3": "D3.mp3", "F3": "F3.mp3", "G#3": "Gs3.mp3", "B3": "B3.mp3", "D4": "D4.mp3", "F4": "F4.mp3", "G#4": "Gs4.mp3", "B4": "B4.mp3", "D5": "D5.mp3" }, "guitar-acoustic"),
  "strings": expandMap({ "C4": "C4.mp3", "E4": "E4.mp3", "G4": "G4.mp3", "A4": "A4.mp3", "C5": "C5.mp3", "E5": "E5.mp3", "G5": "G5.mp3", "A5": "A5.mp3", "C6": "C6.mp3", "E6": "E6.mp3", "G6": "G6.mp3", "A6": "A6.mp3", "C7": "C7.mp3" }, "violin"),
  "saxophone": expandMap({ "C#3": "Cs3.mp3", "E3": "E3.mp3", "G3": "G3.mp3", "A#3": "As3.mp3", "C4": "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3", "A4": "A4.mp3", "C5": "C5.mp3", "D#5": "Ds5.mp3", "F5": "F5.mp3", "A5": "A5.mp3" }, "saxophone"),
  "trumpet": expandMap({ "F3": "F3.mp3", "A3": "A3.mp3", "C4": "C4.mp3", "D#4": "Ds4.mp3", "F4": "F4.mp3", "G4": "G4.mp3", "A#4": "As4.mp3", "D5": "D5.mp3", "F5": "F5.mp3", "A5": "A5.mp3", "C6": "C6.mp3" }, "trumpet"),
  "flute": expandMap({ "C4": "C4.mp3", "E4": "E4.mp3", "A4": "A4.mp3", "C5": "C5.mp3", "E5": "E5.mp3", "A5": "A5.mp3", "C6": "C6.mp3", "E6": "E6.mp3", "A6": "A6.mp3", "C7": "C7.mp3" }, "flute"),
};
SAMPLE_DEFS["guitar-electric-mute"] = SAMPLE_DEFS["guitar-electric"];

/* ─────────── シンセ (フォールバック / オルガン) ─────────── */
function makeSynth(kind) {
  switch (kind) {
    case "epiano": {
      const s = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 2.5, modulationIndex: 14, oscillator: { type: "sine" }, modulation: { type: "sine" }, envelope: { attack: 0.004, decay: 1.6, sustain: 0.12, release: 1.4 }, modulationEnvelope: { attack: 0.002, decay: 0.5, sustain: 0.05, release: 0.6 }, volume: -6 });
      const tremolo = new Tone.Tremolo(4.5, 0.25).start();
      s.connect(tremolo);
      return { node: s, out: tremolo, poly: true, nodes: [s, tremolo] };
    }
    case "organ": {
      const partials = new Array(17).fill(0);
      partials[0] = 0.85; partials[1] = 1.0; partials[2] = 0.75; partials[3] = 0.85; partials[7] = 0.3; partials[9] = 0.35; partials[11] = 0.45;
      const s = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "custom", partials }, detune: -1200, envelope: { attack: 0.006, decay: 0.05, sustain: 1, release: 0.05 }, volume: -14 });
      s.maxPolyphony = 16;
      const drive = new Tone.Distortion(0.12);
      const vib = new Tone.Vibrato(6.6, 0.12);
      const trem = new Tone.Tremolo(6.6, 0.45).start();
      const pan = new Tone.AutoPanner(6.6).start(); pan.depth.value = 0.35;
      const tone = new Tone.Filter(5200, "lowpass");
      s.chain(drive, vib, trem, pan, tone);
      return { node: s, out: tone, poly: true, nodes: [s, drive, vib, trem, pan, tone] };
    }
    case "bass": {
      const s = new Tone.MonoSynth({ oscillator: { type: "square" }, filter: { Q: 2, type: "lowpass", rolloff: -24 }, envelope: { attack: 0.004, decay: 0.3, sustain: 0.5, release: 0.15 }, filterEnvelope: { attack: 0.005, decay: 0.25, sustain: 0.3, baseFrequency: 90, octaves: 3 }, volume: -6 });
      return { node: s, out: s, poly: false, nodes: [s] };
    }
    default: {
      const s = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.01, decay: 0.4, sustain: 0.4, release: 0.6 }, volume: -8 });
      return { node: s, out: s, poly: true, nodes: [s] };
    }
  }
}

/* ─────────── drums ─────────── */
function synthPool(n, factory) {
  const items = Array.from({ length: n }, factory);
  let i = -1;
  return {
    next: () => items[(i = (i + 1) % n)],
    nodes: items.map((it) => it.out ?? it),
    dispose: () => items.forEach((it) => { (it.synth ?? it).dispose?.(); it.out?.dispose?.(); }),
  };
}
function makePercSynths() {
  const openHats = synthPool(2, () => { const synth = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.35, sustain: 0 }, volume: -16 }); const out = new Tone.Filter(8000, "highpass"); synth.connect(out); return { synth, out, trigger: (d, t, v) => synth.triggerAttackRelease(d, t, v) }; });
  const crashes = synthPool(2, () => { const synth = new Tone.MetalSynth({ frequency: 300, envelope: { attack: 0.001, decay: 1.6, release: 0.4 }, harmonicity: 5.1, modulationIndex: 40, resonance: 5000, octaves: 1.5, volume: -14 }); return { synth, out: synth, trigger: (d, t, v) => synth.triggerAttackRelease(d, t, v) }; });
  const rides = synthPool(4, () => { const synth = new Tone.MetalSynth({ frequency: 420, envelope: { attack: 0.001, decay: 0.5, release: 0.1 }, harmonicity: 4.1, modulationIndex: 22, resonance: 6500, octaves: 1.2, volume: -18 }); return { synth, out: synth, trigger: (d, t, v) => synth.triggerAttackRelease(d, t, v) }; });
  const claps = synthPool(2, () => { const synth = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.001, decay: 0.18, sustain: 0 }, volume: -10 }); const out = new Tone.Filter(1500, "bandpass", -12); synth.connect(out); return { synth, out, trigger: (d, t, v) => synth.triggerAttackRelease(d, t, v) }; });
  const percs = synthPool(3, () => { const synth = new Tone.MetalSynth({ frequency: 800, envelope: { attack: 0.001, decay: 0.12, release: 0.02 }, harmonicity: 6, modulationIndex: 18, resonance: 7000, octaves: 0.8, volume: -16 }); return { synth, out: synth, trigger: (d, t, v) => synth.triggerAttackRelease(d, t, v) }; });
  return { openHats, crashes, rides, claps, percs };
}

async function makeDrums() {
  const pools = makePercSynths();
  const { openHats, crashes, rides, claps, percs } = pools;
  const poolNodes = [...openHats.nodes, ...crashes.nodes, ...rides.nodes, ...claps.nodes, ...percs.nodes];
  const sfz = await loadSfz("drums");
  if (sfz) {
    const ctx = rawCtx();
    const out = sfz.createOutput(ctx);
    let counter = 0;
    function trigger(p, time, vel, noteIdx = null) {
      const g = vel / 127;
      const key = DRUM_MAP[p];
      if (key != null && sfz.byKey[key].length) { sfz.noteOn(ctx, out, key, time, 0.25, vel, noteIdx ?? counter++); return; }
      switch (p) {
        case 39: claps.next().trigger("16n", time, g); break;
        case 54: case 56: case 69: case 70: percs.next().trigger("16n", time, g); break;
        default:
          if (sfz.byKey[p]?.length) sfz.noteOn(ctx, out, p, time, 0.25, vel, noteIdx ?? counter++);
          else if (p < 42) sfz.noteOn(ctx, out, 36, time, 0.25, vel, noteIdx ?? counter++);
          else percs.next().trigger("16n", time, g * 0.7);
      }
    }
    return {
      kind: "drums", sampled: true, trigger, outs: [out, ...poolNodes],
      preload: (notes, tempo, cb) => sfz.preload(ctx, remapDrumNotes(notes), tempo, cb),
      ensure: (p, v) => sfz.ensure(ctx, DRUM_MAP[p] ?? p, v),
      reset: () => sfz.resetCounters(), panic: (t) => sfz.allNotesOff(t),
      dispose: () => { sfz.allNotesOff(ctx.currentTime); try { out.disconnect(); } catch {} Object.values(pools).forEach((p) => p.dispose()); },
    };
  }
  const players = new Tone.Players({ urls: { kick: "kick.mp3", snare: "snare.mp3", hihat: "hihat.mp3", tom1: "tom1.mp3", tom2: "tom2.mp3", tom3: "tom3.mp3" }, baseUrl: TONEJS + "drum-samples/acoustic-kit/", fadeOut: 0.05 });
  const lastStart = new Map();
  const mono = (key, t) => { const lt = lastStart.get(key) ?? -1; const nt = t <= lt + 1e-4 ? lt + 1e-4 : t; lastStart.set(key, nt); return nt; };
  function trigger(p, time, vel) {
    const g = vel / 127;
    const hit = (name) => { if (players.has(name) && players.loaded) { const pl = players.player(name); const t = mono(name, time); pl.volume.setValueAtTime(Tone.gainToDb(Math.max(0.05, g)), t); pl.start(t); } };
    switch (p) {
      case 35: case 36: hit("kick"); break;
      case 38: case 40: hit("snare"); break;
      case 37: percs.next().trigger("32n", time, g * 0.8); break;
      case 39: claps.next().trigger("16n", time, g); break;
      case 42: case 44: hit("hihat"); break;
      case 46: openHats.next().trigger("8n", time, g); break;
      case 41: case 43: hit("tom3"); break;
      case 45: case 47: hit("tom2"); break;
      case 48: case 50: hit("tom1"); break;
      case 49: case 57: case 55: crashes.next().trigger("2n", time, g * 0.8); break;
      case 51: case 59: rides.next().trigger("8n", time, g * 0.7); break;
      case 53: rides.next().trigger("8n", time, g); break;
      case 54: case 56: case 69: case 70: percs.next().trigger("16n", time, g); break;
      default: if (p < 42) hit("kick"); else percs.next().trigger("16n", time, g * 0.7);
    }
  }
  const ready = new Promise((resolve) => { const t0 = Date.now(); const iv = setInterval(() => { if (players.loaded || Date.now() - t0 > 8000) { clearInterval(iv); resolve(); } }, 100); });
  return { kind: "drums", sampled: false, trigger, outs: [players, ...poolNodes], ready, dispose: () => { players.dispose(); Object.values(pools).forEach((p) => p.dispose()); } };
}

/* ─────────── melodic instrument factory ─────────── */
export function patchOf(track) { return normalizePatch(track.patch ?? presetFor(track.instrument)); }
const patchKeyOf = (track) => (SYNTH_INSTRUMENTS.has(track.instrument) ? JSON.stringify(patchOf(track)) : "");

async function makeMelodic(track) {
  const instrument = track.instrument;
  // 0. シンセ (パッチ)
  if (SYNTH_INSTRUMENTS.has(instrument)) {
    const s = createSynth(patchOf(track), { tempo: tempoAt(0) });
    return { ...s, kind: instrument, patchKey: JSON.stringify(s.patch) };
  }
  // 1. ローカル多層サンプル
  if (instrument !== "organ") {
    const sfz = await loadSfz(instrument);
    if (sfz) {
      const ctx = rawCtx();
      const out = sfz.createOutput(ctx);
      const extra = [];
      let tail = out;
      if (instrument.startsWith("guitar-electric")) {
        const hp = new Tone.Filter(95, "highpass");
        const drive = new Tone.Distortion(instrument.endsWith("mute") ? 0.3 : 0.22);
        const tone = new Tone.Filter(4600, "lowpass");
        const trim = new Tone.Volume(-3);
        Tone.connect(out, hp); hp.chain(drive, tone, trim);
        extra.push(hp, drive, tone, trim); tail = trim;
      }
      return {
        kind: instrument, sampled: true, sfz,
        trigger: (p, time, dur, vel, noteIdx = null, velEnd = null) => sfz.noteOn(ctx, out, p, time, dur, vel, noteIdx, velEnd),
        outs: [tail],
        preload: (notes, tempo, cb) => sfz.preload(ctx, notes.map((n, i) => ({ ...n, i })), tempo, cb),
        ensure: (p, v) => sfz.ensure(ctx, p, v),
        reset: () => sfz.resetCounters(), panic: (t) => sfz.allNotesOff(t),
        dispose: () => { sfz.allNotesOff(ctx.currentTime); try { out.disconnect(); } catch {} extra.forEach((n) => n.dispose()); },
      };
    }
  }
  // 2. CDN サンプル (予備)
  const def = SAMPLE_DEFS[instrument];
  if (def) {
    try {
      const sampler = await new Promise((resolve, reject) => {
        const s = new Tone.Sampler({ urls: def.urls, baseUrl: def.baseUrl, release: def.release ?? 0.4, onload: () => resolve(s), onerror: (e) => reject(e) });
        setTimeout(() => (s.loaded ? resolve(s) : reject(new Error("timeout"))), 15000);
      });
      return { kind: instrument, sampled: true, trigger: (p, time, dur, vel) => sampler.triggerAttackRelease(noteName(p), dur, time, vel / 127), outs: [sampler], dispose: () => sampler.dispose() };
    } catch (e) { console.warn(`[audio] ${instrument} のCDNサンプル読込に失敗 → シンセにフォールバック`, e); }
  }
  // 3. シンセ
  const { node, out, nodes } = makeSynth(instrument);
  return { kind: instrument, sampled: false, trigger: (p, time, dur, vel) => node.triggerAttackRelease(noteName(p), dur, time, vel / 127), outs: [out], panic: () => { try { node.releaseAll?.(); } catch {} }, dispose: () => nodes.forEach((n) => n.dispose()) };
}

/* ─────────── track engine management ─────────── */
async function ensureEngine(track) {
  ensureGraph();
  let eng = engines.get(track.id);
  const pk = patchKeyOf(track);
  if (eng && eng.instKind === track.instrument && eng.patchKey === pk) return eng;
  if (eng) disposeEngine(track.id);
  const chain = createTrackChain(track, graph);
  const inst = track.instrument === "drums" ? await makeDrums() : await makeMelodic(track);
  if (inst.ready) await inst.ready;
  inst.outs.forEach((o) => Tone.connect(o, chain.input));
  eng = { trackId: track.id, chain, inst, instKind: track.instrument, patchKey: pk, part: null };
  engines.set(track.id, eng);
  return eng;
}
function disposeEngine(id) {
  const eng = engines.get(id);
  if (!eng) return;
  eng.part?.dispose();
  eng.inst.dispose();
  eng.chain.dispose();
  engines.delete(id);
}

export function applyMixer() {
  ensureGraph();
  const anySolo = state.song.tracks.some((t) => t.solo);
  for (const t of state.song.tracks) {
    const eng = engines.get(t.id);
    if (!eng) continue;
    eng.chain.update(t, { muted: t.mute || (anySolo && !t.solo) || !!t.midiOut?.silent });
  }
}
export function setMasterVolume(db) { state.song.master.volume = db; ensureGraph().setMasterVolume(db); }

/* ─────────── transport / scheduling ─────────── */
let started = false;
export async function ensureAudio() {
  if (!started) { await Tone.start(); started = true; }
}

export async function rebuildAll(showLoad) {
  for (const id of [...engines.keys()]) {
    if (!state.song.tracks.find((t) => t.id === id)) disposeEngine(id);
  }
  for (const t of state.song.tracks) {
    if (showLoad) showLoad(`音源読み込み中: ${t.name}…`);
    await ensureEngine(t);
  }
  applyMixer();
}

async function preloadAll(onProgress) {
  for (const t of state.song.tracks) {
    if (!t.notes.length) continue;
    const eng = engines.get(t.id);
    if (!eng?.inst.preload) continue;
    await eng.inst.preload(t.notes, tempoAt(0), (d, n) => onProgress?.(`音を読み込み中: ${t.name} (${d}/${n})`));
  }
  const st = sampleCacheStats();
  if (st.files) console.info(`[audio] サンプルキャッシュ: ${st.files} files / ${st.mb} MB (PCM)`);
}

const usedMidi = new Map(); // portId -> Set(channel)
function midiTarget(track) {
  const mo = track.midiOut;
  if (!mo?.portId) return null;
  const out = midi.findOutput(mo.portId) ?? midi.findOutput(mo.portName);
  if (!out) return null;
  const ch = Math.max(0, Math.min(15, (mo.channel ?? 0) | 0));
  (usedMidi.get(out.id) ?? usedMidi.set(out.id, new Set()).get(out.id)).add(ch);
  return { out, ch };
}

function scheduleParts() {
  Tone.Transport.bpm.value = 120; // 拍→秒は beatToSec で計算するので Transport の bpm は使わない
  const ctx = rawCtx();
  usedMidi.clear();
  for (const t of state.song.tracks) {
    const eng = engines.get(t.id);
    if (!eng) continue;
    eng.part?.dispose();
    eng.inst.reset?.();
    eng.inst.setTempo?.(tempoAt(0));
    const mt = midiTarget(t);
    if (mt && t.instrument !== "drums") midi.sendProgram(mt.out, mt.ch, INSTRUMENT_DEFS[t.instrument]?.gm ?? 0);
    const silent = !!t.midiOut?.silent && mt;
    const events = t.notes.map((n, i) => [beatToSec(n.s), { n, i }]);
    eng.part = new Tone.Part((time, { n, i }) => {
      const durSec = Math.max(0.03, beatToSec(t.instrument === "piano" || t.instrument === "epiano" ? noteEndBeat(n) : n.s + n.d) - beatToSec(n.s));
      if (mt) midi.sendNote(mt.out, t.instrument === "drums" ? 9 : mt.ch, n.p, n.v, midi.audioTimeToPerf(ctx, time), durSec * 1000);
      if (silent) return;
      if (eng.inst.kind === "drums") eng.inst.trigger(n.p, time, n.v, i);
      else eng.inst.trigger(n.p, time, durSec, n.v, i, n.v2 ?? null);
    }, events);
    eng.part.start(0);
  }
}

let posTimer = null;
export async function play(fromBeat = null, onProgress = null) {
  await ensureAudio();
  await rebuildAll(onProgress);
  await preloadAll(onProgress);
  onProgress?.(null);
  scheduleParts();
  scheduleClick();
  if (state.loop) {
    Tone.Transport.loop = true;
    Tone.Transport.loopStart = 0;
    Tone.Transport.loopEnd = beatToSec(totalBeats());
  } else {
    Tone.Transport.loop = false;
  }
  const startBeat = fromBeat ?? state.playheadBeat;
  Tone.Transport.seconds = beatToSec(startBeat);
  Tone.Transport.start();
  state.playing = true;
  emit("transport");
  clearInterval(posTimer);
  posTimer = setInterval(() => {
    state.playheadBeat = secToBeat(Tone.Transport.seconds);
    if (!state.loop && state.playheadBeat >= totalBeats()) stop(true);
    emit("playhead");
  }, 33);
}

export function stop(resetToStart = false) {
  Tone.Transport.stop();
  Tone.Transport.cancel();
  const now = rawCtx().currentTime;
  for (const eng of engines.values()) { eng.part?.dispose(); eng.part = null; eng.inst.panic?.(now); }
  clickPart?.dispose(); clickPart = null;
  for (const [id, chs] of usedMidi) { const out = midi.findOutput(id); for (const ch of chs) midi.allNotesOff(out, ch); midi.allNotesOff(out, 9); }
  clearInterval(posTimer);
  state.playing = false;
  if (resetToStart) state.playheadBeat = 0;
  emit("transport");
  emit("playhead");
}

export function seek(beat) {
  state.playheadBeat = Math.max(0, beat);
  if (state.playing) Tone.Transport.seconds = beatToSec(state.playheadBeat);
  emit("playhead");
}

/** 各トラックとマスターのレベル (dB, [L, R]) — ミキサーのメーター用 */
export function getLevels() {
  const out = { tracks: {}, master: null };
  const norm = (v) => (Array.isArray(v) ? v.map((x) => (Number.isFinite(x) ? x : -100)) : [Number.isFinite(v) ? v : -100, Number.isFinite(v) ? v : -100]);
  for (const [id, eng] of engines) { try { out.tracks[id] = norm(eng.chain.meter.getValue()); } catch { out.tracks[id] = [-100, -100]; } }
  try { out.master = graph ? norm(graph.meter.getValue()) : [-100, -100]; } catch { out.master = [-100, -100]; }
  return out;
}

/* ─────────── metronome (クリック) ─────────── */
let click = null, clickPart = null;
function ensureClick() {
  if (click) return click;
  const hi = new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 }, volume: -14 });
  const lo = new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 }, volume: -18 });
  const f = new Tone.Filter(4000, "lowpass"); hi.connect(f); lo.connect(f); f.connect(ensureGraph().input);
  click = { hi, lo };
  return click;
}
function scheduleClick() {
  clickPart?.dispose(); clickPart = null;
  if (!state.metronome) return;
  const c = ensureClick();
  const ts = state.song.timeSig;
  const events = [];
  for (let b = 0; b < totalBeats(); b++) events.push([beatToSec(b), b % ts === 0]);
  clickPart = new Tone.Part((time, accent) => { (accent ? c.hi : c.lo).triggerAttackRelease(accent ? 1760 : 1320, 0.03, time); }, events);
  clickPart.start(0);
}

/** 再生中に拍位置を秒にした値 (録音用) */
export function currentBeat() { return state.playing ? secToBeat(Tone.Transport.seconds) : state.playheadBeat; }

/* ─────────── offline render → WAV ─────────── */
export async function renderSong(onProgress, { normalize = true } = {}) {
  const song = state.song;
  const LEAD = 0.1;
  const tail = Math.max(3, (song.master.hallDecay ?? 2.4) + 1.5);
  const duration = beatToSec(totalBeats(song)) + LEAD + tail;

  onProgress?.("音源を準備中…");
  await rebuildAll((m) => onProgress?.(m));
  await preloadAll((m) => onProgress?.(m));

  const buffer = await Tone.Offline(async (context) => {
    const g = createMixGraph(song.master);
    const anySolo = song.tracks.some((t) => t.solo);
    for (const t of song.tracks) {
      if (t.mute || (anySolo && !t.solo) || t.midiOut?.silent) continue;
      onProgress?.(`音源を準備中: ${t.name}…`);
      const chain = createTrackChain(t, g);
      chain.update(t, { muted: false });
      const inst = t.instrument === "drums" ? await makeDrums() : await makeMelodic(t);
      if (inst.ready) await inst.ready;
      inst.outs.forEach((o) => Tone.connect(o, chain.input));
      inst.reset?.();
      inst.setTempo?.(tempoAt(0, song));
      t.notes.forEach((n, i) => {
        const durSec = Math.max(0.03, beatToSec(t.instrument === "piano" || t.instrument === "epiano" ? noteEndBeat(n, song) : n.s + n.d, song) - beatToSec(n.s, song));
        context.transport.schedule((time) => {
          if (inst.kind === "drums") inst.trigger(n.p, time, n.v, i);
          else inst.trigger(n.p, time, durSec, n.v, i, n.v2 ?? null);
        }, beatToSec(n.s, song) + LEAD);
      });
    }
    onProgress?.("レンダリング中… (曲の長さ分の計算を行います)");
    context.transport.start(0);
  }, duration);

  const ab = buffer.get();
  let report = null;
  if (normalize) {
    onProgress?.("ラウドネスを測って整えています…");
    const r = normalizeLoudness(ab, { targetLufs: song.master.targetLufs ?? -14, ceilingDb: -1 });
    report = { gainDb: r.gainDb, lufs: r.after.lufs, peakDb: r.after.peakDb, lra: r.after.lra, limited: r.limited, beforeLufs: r.before.lufs };
  } else {
    const m = measureLoudness(ab);
    report = { gainDb: 0, lufs: m.lufs, peakDb: m.peakDb, lra: m.lra, limited: false, beforeLufs: m.lufs };
  }
  return { buffer: ab, report };
}

// AudioBuffer → 16bit PCM WAV
export function bufferToWav(buffer) {
  if (typeof buffer.get === "function") buffer = buffer.get();
  const numCh = Math.min(2, buffer.numberOfChannels);
  const rate = buffer.sampleRate;
  const len = buffer.length;
  const dataSize = len * numCh * 2;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const wstr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  wstr(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); wstr(8, "WAVE");
  wstr(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, numCh, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * numCh * 2, true); view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true);
  wstr(36, "data"); view.setUint32(40, dataSize, true);
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < numCh; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2; }
  return new Blob([out], { type: "audio/wav" });
}

/* ─────────── note preview / live input ─────────── */
let previewIdx = 0;
export async function previewNote(track, p, vel = 96, dur = 0.35) {
  await ensureAudio();
  const eng = await ensureEngine(track);
  applyMixer();
  if (eng.inst.ensure) await eng.inst.ensure(p, vel);
  const now = Tone.now();
  const i = previewIdx++;
  const mt = midiTarget(track);
  if (mt) midi.sendNote(mt.out, track.instrument === "drums" ? 9 : mt.ch, p, vel, midi.audioTimeToPerf(rawCtx(), now), dur * 1000);
  if (track.midiOut?.silent && mt) return;
  if (eng.inst.kind === "drums") eng.inst.trigger(p, now, vel, i);
  else eng.inst.trigger(p, now, dur, vel, i);
}

/** シンセのパッチを差し替えた直後に鳴らして確かめる用 */
export async function refreshTrack(track) {
  const eng = engines.get(track.id);
  if (eng && (eng.instKind !== track.instrument || eng.patchKey !== patchKeyOf(track))) {
    const wasPlaying = state.playing;
    if (wasPlaying) stop();
    disposeEngine(track.id);
    await ensureEngine(track);
    applyMixer();
    if (wasPlaying) await play();
  }
}
