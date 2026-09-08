// ═══════════ song state / event bus / undo / tempo map / defaults ═══════════

const listeners = {};
export function on(ev, cb) { (listeners[ev] ??= []).push(cb); }
export function emit(ev, payload) { (listeners[ev] ?? []).forEach((cb) => cb(payload)); }

export const TRACK_COLORS = [
  "#38c3ff", "#2f7bff", "#7c5cff", "#43e6a0", "#ffc857",
  "#ff7ab8", "#5ef2e0", "#9fb8ff", "#ff8f5e", "#c3f45e",
];

export const INSTRUMENT_DEFS = {
  "drums":            { label: "ドラム",           en: "Drums",           gm: 0,  channel: 9,  color: "#38c3ff" },
  "bass":             { label: "エレキベース",     en: "Electric Bass",   gm: 33, channel: 1,  color: "#2f7bff" },
  "piano":            { label: "ピアノ",           en: "Piano",           gm: 0,  channel: 2,  color: "#9fb8ff" },
  "epiano":           { label: "エレピ",           en: "Electric Piano",  gm: 4,  channel: 3,  color: "#7c5cff" },
  "organ":            { label: "オルガン",         en: "Organ",           gm: 18, channel: 4,  color: "#ff8f5e" },
  "guitar-electric":  { label: "エレキギター",     en: "Electric Guitar", gm: 29, channel: 5,  color: "#43e6a0" },
  "guitar-electric-mute": { label: "エレキギター(ミュート)", en: "Guitar (mute)", gm: 28, channel: 14, color: "#2fb87e" },
  "guitar-acoustic":  { label: "アコギ",           en: "Acoustic Guitar", gm: 25, channel: 6,  color: "#c3f45e" },
  "synth":            { label: "シンセ",           en: "Synth",           gm: 81, channel: 15, color: "#ff9de2" },
  "synth-lead":       { label: "シンセリード",     en: "Synth Lead",      gm: 81, channel: 7,  color: "#ff7ab8" },
  "synth-pad":        { label: "シンセパッド",     en: "Synth Pad",       gm: 89, channel: 8,  color: "#5ef2e0" },
  "synth-bass":       { label: "シンセベース",     en: "Synth Bass",      gm: 38, channel: 0,  color: "#6f8cff" },
  "strings":          { label: "ストリングス",     en: "Strings",         gm: 48, channel: 10, color: "#ffc857" },
  "saxophone":        { label: "サックス",         en: "Saxophone",       gm: 65, channel: 11, color: "#ffb347" },
  "trumpet":          { label: "トランペット",     en: "Trumpet",         gm: 56, channel: 12, color: "#ffd66e" },
  "flute":            { label: "フルート",         en: "Flute",           gm: 73, channel: 13, color: "#bfe8ff" },
};
export const SYNTH_INSTRUMENTS = new Set(["synth", "synth-lead", "synth-pad", "synth-bass"]);

/* ─────────── ミックスの既定値 (楽器ごと) ─────────── */
// hpf: ローカット Hz / eq: dB / comp: 0..1 / hall,room: センド 0..1
const FX_DEFAULTS = {
  drums:            { hpf: 30,  eqLow: 0,  eqMid: -1, eqHigh: 1.5, comp: 0.35, hall: 0.05, room: 0.25 },
  bass:             { hpf: 30,  eqLow: 1,  eqMid: 0,  eqHigh: -2,  comp: 0.5,  hall: 0,    room: 0.05 },
  "synth-bass":     { hpf: 25,  eqLow: 1,  eqMid: 0,  eqHigh: -3,  comp: 0.4,  hall: 0,    room: 0.05 },
  piano:            { hpf: 80,  eqLow: -1, eqMid: 0,  eqHigh: 1,   comp: 0.2,  hall: 0.3,  room: 0.2 },
  epiano:           { hpf: 90,  eqLow: -1, eqMid: 0,  eqHigh: 0,   comp: 0.3,  hall: 0.2,  room: 0.25 },
  organ:            { hpf: 70,  eqLow: 0,  eqMid: 0,  eqHigh: 0,   comp: 0.2,  hall: 0.2,  room: 0.3 },
  "guitar-electric":{ hpf: 100, eqLow: -1, eqMid: 1,  eqHigh: 0,   comp: 0.3,  hall: 0.15, room: 0.35 },
  "guitar-electric-mute": { hpf: 110, eqLow: 0, eqMid: 0, eqHigh: -1, comp: 0.35, hall: 0.05, room: 0.3 },
  "guitar-acoustic":{ hpf: 90,  eqLow: -2, eqMid: 0,  eqHigh: 2,   comp: 0.25, hall: 0.25, room: 0.3 },
  synth:            { hpf: 60,  eqLow: 0,  eqMid: 0,  eqHigh: 0,   comp: 0.2,  hall: 0.25, room: 0.15 },
  "synth-lead":     { hpf: 120, eqLow: 0,  eqMid: 0,  eqHigh: 1,   comp: 0.3,  hall: 0.3,  room: 0.15 },
  "synth-pad":      { hpf: 150, eqLow: -2, eqMid: -1, eqHigh: 0,   comp: 0.1,  hall: 0.5,  room: 0.1 },
  strings:          { hpf: 120, eqLow: -1, eqMid: 0,  eqHigh: 1,   comp: 0.15, hall: 0.55, room: 0.15 },
  saxophone:        { hpf: 110, eqLow: 0,  eqMid: 1,  eqHigh: 0,   comp: 0.35, hall: 0.35, room: 0.25 },
  trumpet:          { hpf: 140, eqLow: 0,  eqMid: 0,  eqHigh: 1,   comp: 0.3,  hall: 0.45, room: 0.2 },
  flute:            { hpf: 200, eqLow: -1, eqMid: 0,  eqHigh: 1,   comp: 0.2,  hall: 0.5,  room: 0.15 },
};
export function defaultFx(instrument) { return { ...(FX_DEFAULTS[instrument] ?? FX_DEFAULTS.synth) }; }
export const PAN_DEFAULTS = { drums: 0, bass: 0, "synth-bass": 0, piano: -0.25, epiano: 0.25, organ: 0.3, "guitar-electric": 0.35, "guitar-electric-mute": -0.35, "guitar-acoustic": -0.3, synth: 0.2, "synth-lead": 0.1, "synth-pad": -0.15, strings: -0.1, saxophone: 0.2, trumpet: 0.15, flute: -0.2 };

export function defaultMaster() {
  return { glue: 0.3, hallDecay: 2.4, roomDecay: 0.6, targetLufs: -14, width: 1, volume: -4 };
}

let idCounter = 1;
export const uid = () => `id${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function makeTrack(partial = {}) {
  const instrument = partial.instrument ?? "piano";
  return {
    id: uid(),
    name: partial.name ?? INSTRUMENT_DEFS[instrument]?.label ?? "トラック",
    instrument,
    role: partial.role ?? "",
    stylePrompt: partial.stylePrompt ?? "",
    color: partial.color ?? INSTRUMENT_DEFS[instrument]?.color ?? TRACK_COLORS[state.song.tracks.length % TRACK_COLORS.length],
    volume: partial.volume ?? -6,   // dB
    pan: partial.pan ?? 0,          // -1..1
    mute: false,
    solo: false,
    fx: partial.fx ?? defaultFx(instrument),
    patch: partial.patch ?? null,   // シンセ音色 (synth.js) — null なら楽器種別の既定プリセット
    midiOut: partial.midiOut ?? null, // {portId, portName, channel(0-15), silent}
    notes: partial.notes ?? [],     // {id, p, s(拍・曲頭基準), d(拍), v, v2?}
  };
}

export function defaultSong() {
  return {
    version: 2,
    title: "無題のセッション",
    tempo: 128,
    timeSig: 4,
    key: "A minor",
    concept: "",
    sections: [
      { name: "Intro", bars: 4, description: "" },
      { name: "A", bars: 8, description: "" },
      { name: "Sabi", bars: 8, description: "" },
      { name: "Outro", bars: 4, description: "" },
    ],
    chordProgression: [],
    tempoMap: [],          // [{beat, tempo}] 曲頭からの拍。点の間は直線 (リタルダンド等)
    pedal: [],             // [{s, d}] サスティンペダルを踏んでいる区間 (拍)
    master: defaultMaster(),
    tracks: [],
  };
}

// 古い保存データに新しい項目を足す
export function migrateSong(song) {
  if (!song) return defaultSong();
  song.version = 2;
  song.tempoMap ??= [];
  song.pedal ??= [];
  song.master = { ...defaultMaster(), ...(song.master ?? {}) };
  song.chordProgression ??= [];
  song.sections ??= [];
  for (const t of song.tracks ?? []) {
    t.fx = { ...defaultFx(t.instrument), ...(t.fx ?? {}) };
    t.patch ??= null;
    t.midiOut ??= null;
    t.notes ??= [];
    t.volume ??= -6; t.pan ??= 0;
    if (!INSTRUMENT_DEFS[t.instrument]) t.instrument = "piano";
  }
  return song;
}

export const state = {
  song: defaultSong(),
  selectedTrackId: null,
  playing: false,
  loop: false,
  recording: false,
  metronome: false,
  songId: null,          // ライブラリ上の ID (library.js)
  playheadBeat: 0,
  generating: false,
};

export function totalBars(song = state.song) {
  const secBars = (song.sections ?? []).reduce((a, s) => a + s.bars, 0);
  let noteEnd = 0;
  for (const t of song.tracks) for (const n of t.notes) noteEnd = Math.max(noteEnd, n.s + n.d);
  return Math.max(secBars, Math.ceil(noteEnd / song.timeSig), 8);
}
export function totalBeats(song = state.song) { return totalBars(song) * song.timeSig; }

export function selectedTrack() {
  return state.song.tracks.find((t) => t.id === state.selectedTrackId) ?? null;
}

export function addTrack(partial) {
  const t = makeTrack(partial);
  state.song.tracks.push(t);
  state.selectedTrackId = t.id;
  pushUndo();
  emit("tracks");
  emit("selection");
  return t;
}

export function removeTrack(id) {
  const i = state.song.tracks.findIndex((t) => t.id === id);
  if (i < 0) return;
  state.song.tracks.splice(i, 1);
  if (state.selectedTrackId === id) state.selectedTrackId = state.song.tracks[0]?.id ?? null;
  pushUndo();
  emit("tracks");
  emit("selection");
}

/* ─────────── tempo map: 拍 ⇄ 秒 ─────────── */
// tempoMap の点の間は直線でテンポが変わる。点が無ければ song.tempo 一定。
// 最初の点より前は song.tempo、最後の点より後はその点のテンポで一定。
function segments(song) {
  const pts = (song.tempoMap ?? []).filter((p) => Number.isFinite(p.beat) && p.tempo > 0).slice().sort((a, b) => a.beat - b.beat);
  const segs = [];
  let b = 0, T = song.tempo;
  for (const p of pts) {
    if (p.beat > b) { segs.push({ b0: b, b1: p.beat, T0: T, T1: p.beat === pts[0].beat ? T : p.tempo }); }
    b = Math.max(b, p.beat); T = p.tempo;
  }
  segs.push({ b0: b, b1: Infinity, T0: T, T1: T });
  return segs;
}
export function tempoAt(beat, song = state.song) {
  for (const s of segments(song)) {
    if (beat >= s.b0 && beat < s.b1) { if (s.b1 === Infinity || s.T0 === s.T1) return s.T0; return s.T0 + (s.T1 - s.T0) * (beat - s.b0) / (s.b1 - s.b0); }
  }
  return song.tempo;
}
export function beatToSec(beat, song = state.song) {
  let t = 0;
  for (const s of segments(song)) {
    if (beat <= s.b0) break;
    const end = Math.min(beat, s.b1);
    const len = end - s.b0;
    if (len <= 0) continue;
    if (s.b1 === Infinity || Math.abs(s.T1 - s.T0) < 1e-6) t += 60 * len / s.T0;
    else { const k = (s.T1 - s.T0) / (s.b1 - s.b0); const Tend = s.T0 + k * len; t += (60 / k) * Math.log(Tend / s.T0); }
    if (beat <= s.b1) break;
  }
  return t;
}
export function secToBeat(sec, song = state.song) {
  let t = 0;
  for (const s of segments(song)) {
    const segLen = s.b1 - s.b0;
    let segTime;
    const ramp = !(s.b1 === Infinity || Math.abs(s.T1 - s.T0) < 1e-6);
    const k = ramp ? (s.T1 - s.T0) / segLen : 0;
    segTime = s.b1 === Infinity ? Infinity : (ramp ? (60 / k) * Math.log(s.T1 / s.T0) : 60 * segLen / s.T0);
    if (sec - t < segTime) {
      const dt = sec - t;
      if (!ramp) return s.b0 + dt * s.T0 / 60;
      return s.b0 + (s.T0 / k) * (Math.exp(dt * k / 60) - 1);
    }
    t += segTime;
  }
  return 0;
}
export function hasTempoMap(song = state.song) { return (song.tempoMap ?? []).length > 0; }

/* ─────────── sustain pedal ─────────── */
// ペダルを踏んでいる間に鍵を離しても音は続く → 実際の音の終わりは「ペダルを離す拍」まで伸びる
export function pedalDownAt(beat, song = state.song) { return (song.pedal ?? []).some((p) => beat >= p.s - 1e-6 && beat < p.s + p.d - 1e-6); }
export function noteEndBeat(n, song = state.song) {
  const end = n.s + n.d;
  for (const p of song.pedal ?? []) if (end >= p.s - 1e-6 && end < p.s + p.d - 1e-6) return Math.max(end, p.s + p.d);
  return end;
}

/* ─────────── chords at beat (for piano roll display) ─────────── */
export function chordAtBeat(beat) {
  const ts = state.song.timeSig;
  let cur = null;
  for (const c of state.song.chordProgression ?? []) {
    const cb = c.bar * ts + c.beat;
    if (cb <= beat + 1e-6) cur = c.chord; else break;
  }
  return cur;
}

export function sectionAtBar(bar) {
  let b = 0;
  for (const s of state.song.sections ?? []) {
    if (bar >= b && bar < b + s.bars) return { ...s, startBar: b };
    b += s.bars;
  }
  return null;
}

/* ─────────── undo ─────────── */
const undoStack = [];
const redoStack = [];
export function pushUndo() {
  undoStack.push(JSON.stringify(state.song));
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  scheduleAutosave();
}
export function undo() {
  if (undoStack.length < 2) return;
  redoStack.push(undoStack.pop());
  state.song = migrateSong(JSON.parse(undoStack[undoStack.length - 1]));
  reselect();
}
export function redo() {
  if (!redoStack.length) return;
  const snap = redoStack.pop();
  undoStack.push(snap);
  state.song = migrateSong(JSON.parse(snap));
  reselect();
}
function reselect() {
  if (!state.song.tracks.find((t) => t.id === state.selectedTrackId)) {
    state.selectedTrackId = state.song.tracks[0]?.id ?? null;
  }
  emit("song");
  emit("tracks");
  emit("selection");
  scheduleAutosave();
}

/* ─────────── persistence ─────────── */
const LS_KEY = "bluegarage.project.v1";
let autosaveTimer = null;
export function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveLocal, 800);
}
const saveHooks = [];
export function onSave(cb) { saveHooks.push(cb); }
export function saveLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ song: state.song, selectedTrackId: state.selectedTrackId, songId: state.songId }));
  } catch { /* quota */ }
  for (const cb of saveHooks) { try { cb(); } catch {} }
}
export function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data?.song?.tracks) return false;
    state.song = migrateSong(data.song);
    state.selectedTrackId = data.selectedTrackId ?? data.song.tracks[0]?.id ?? null;
    state.songId = data.songId ?? null;
    undoStack.length = 0;
    undoStack.push(JSON.stringify(state.song));
    return true;
  } catch { return false; }
}
export function resetSong(song) {
  state.song = migrateSong(song ?? defaultSong());
  state.selectedTrackId = state.song.tracks[0]?.id ?? null;
  undoStack.length = 0; redoStack.length = 0;
  undoStack.push(JSON.stringify(state.song));
  emit("song"); emit("tracks"); emit("selection");
  scheduleAutosave();
}

/* ─────────── track summary (AIコンテキスト用) ─────────── */
export function summarizeTrack(t, song = state.song) {
  if (!t.notes.length) return "空";
  const ts = song.timeSig;
  let lo = 127, hi = 0, end = 0, vsum = 0;
  for (const n of t.notes) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); end = Math.max(end, n.s + n.d); vsum += n.v; }
  const bars = Math.ceil(end / ts);
  const density = (t.notes.length / Math.max(1, bars)).toFixed(1);
  return `${t.notes.length}ノート, 音域 MIDI ${lo}-${hi}, ${bars}小節, 密度 ${density}音/小節, 平均ベロシティ ${Math.round(vsum / t.notes.length)}`;
}
