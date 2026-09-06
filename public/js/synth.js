// ═══════════ 減算方式シンセサイザー (Tone.js で組む・音色はデータ) ═══════════
// パッチ (SYNTH_PATCH_SCHEMA の形) から音源を組み立てる。
//   最大 3 オシレーター (各: 波形 / オクターブ / 半音 / デチューン / ユニゾン) + サブ + ノイズ
//   → フィルター (+エンベロープ) → アンプ → LFO 効果 → drive → chorus → delay → reverb → level
// Tone.Offline の中でも同じコードで組める (Tone のノードはその時のコンテキストに作られる)。

/* global Tone */
import { makeImpulse } from "./ir.js";

export const PRESETS = {
  // ── bass
  "Moog Sub Bass":   { osc: [{ wave: "saw", octave: 0, semi: 0, detune: 0, level: 0.8, unison: 1, spread: 0 }, { wave: "square", octave: -1, semi: 0, detune: 4, level: 0.6, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0.5 }, noise: { type: "white", level: 0, decay: 0.05 }, filter: { type: "lowpass", cutoff: 320, q: 2.5, envAmount: 2.6, keyTrack: 0.3 }, ampEnv: { a: 0.004, d: 0.25, s: 0.7, r: 0.12 }, filterEnv: { a: 0.002, d: 0.18, s: 0.15, r: 0.1 }, lfo: { target: "none", rate: 5, depth: 0, wave: "sine" }, fx: { drive: 0.12, chorus: { mix: 0, rate: 1, depth: 0.3 }, delay: { mix: 0, time: 0.5, feedback: 0.3, pingpong: false }, reverb: { mix: 0.03, decay: 0.8 } }, glide: 0.03, mono: true, level: -8 },
  "Reese Bass":      { osc: [{ wave: "saw", octave: 0, semi: 0, detune: -12, level: 0.7, unison: 2, spread: 18 }, { wave: "saw", octave: 0, semi: 0, detune: 12, level: 0.7, unison: 2, spread: 18 }], sub: { wave: "sine", level: 0.4 }, noise: { type: "white", level: 0, decay: 0.05 }, filter: { type: "lowpass", cutoff: 900, q: 1.2, envAmount: 0.8, keyTrack: 0.2 }, ampEnv: { a: 0.01, d: 0.3, s: 0.9, r: 0.2 }, filterEnv: { a: 0.01, d: 0.4, s: 0.5, r: 0.2 }, lfo: { target: "none", rate: 5, depth: 0, wave: "sine" }, fx: { drive: 0.25, chorus: { mix: 0, rate: 1, depth: 0.3 }, delay: { mix: 0, time: 0.5, feedback: 0.3, pingpong: false }, reverb: { mix: 0.02, decay: 0.8 } }, glide: 0, mono: true, level: -9 },
  "Acid 303":        { osc: [{ wave: "saw", octave: 0, semi: 0, detune: 0, level: 0.9, unison: 1, spread: 0 }], sub: { wave: "square", level: 0.2 }, noise: { type: "white", level: 0, decay: 0.05 }, filter: { type: "lowpass", cutoff: 240, q: 7, envAmount: 3.4, keyTrack: 0.2 }, ampEnv: { a: 0.003, d: 0.2, s: 0.5, r: 0.08 }, filterEnv: { a: 0.002, d: 0.22, s: 0.05, r: 0.1 }, lfo: { target: "none", rate: 5, depth: 0, wave: "sine" }, fx: { drive: 0.35, chorus: { mix: 0, rate: 1, depth: 0.3 }, delay: { mix: 0.12, time: 0.75, feedback: 0.3, pingpong: true }, reverb: { mix: 0.05, decay: 1 } }, glide: 0.06, mono: true, level: -9 },
  "80s FM Bass":     { osc: [{ wave: "fm2", octave: 0, semi: 0, detune: 0, level: 0.9, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0.5 }, noise: { type: "white", level: 0, decay: 0.05 }, filter: { type: "lowpass", cutoff: 2200, q: 0.8, envAmount: 1.5, keyTrack: 0.5 }, ampEnv: { a: 0.002, d: 0.35, s: 0.4, r: 0.1 }, filterEnv: { a: 0.001, d: 0.2, s: 0.2, r: 0.1 }, lfo: { target: "none", rate: 5, depth: 0, wave: "sine" }, fx: { drive: 0.05, chorus: { mix: 0.15, rate: 0.8, depth: 0.3 }, delay: { mix: 0, time: 0.5, feedback: 0.3, pingpong: false }, reverb: { mix: 0.03, decay: 0.8 } }, glide: 0, mono: true, level: -8 },
  // ── lead
  "Saw Lead":        { osc: [{ wave: "saw", octave: 0, semi: 0, detune: -6, level: 0.8, unison: 1, spread: 0 }, { wave: "saw", octave: 0, semi: 0, detune: 6, level: 0.8, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0.1 }, noise: { type: "white", level: 0, decay: 0.05 }, filter: { type: "lowpass", cutoff: 2400, q: 1.5, envAmount: 1.8, keyTrack: 0.5 }, ampEnv: { a: 0.01, d: 0.2, s: 0.75, r: 0.25 }, filterEnv: { a: 0.005, d: 0.3, s: 0.4, r: 0.2 }, lfo: { target: "pitch", rate: 5.5, depth: 0.12, wave: "sine" }, fx: { drive: 0.15, chorus: { mix: 0.1, rate: 0.7, depth: 0.3 }, delay: { mix: 0.22, time: 0.75, feedback: 0.35, pingpong: true }, reverb: { mix: 0.15, decay: 1.8 } }, glide: 0.04, mono: true, level: -10 },
  "Supersaw":        { osc: [{ wave: "saw", octave: 0, semi: 0, detune: 0, level: 0.8, unison: 7, spread: 42 }, { wave: "saw", octave: 1, semi: 0, detune: 0, level: 0.35, unison: 5, spread: 30 }], sub: { wave: "sine", level: 0.15 }, noise: { type: "white", level: 0, decay: 0.05 }, filter: { type: "lowpass", cutoff: 4200, q: 0.7, envAmount: 0.8, keyTrack: 0.5 }, ampEnv: { a: 0.02, d: 0.3, s: 0.8, r: 0.35 }, filterEnv: { a: 0.01, d: 0.4, s: 0.5, r: 0.3 }, lfo: { target: "none", rate: 5, depth: 0, wave: "sine" }, fx: { drive: 0.05, chorus: { mix: 0.2, rate: 0.5, depth: 0.4 }, delay: { mix: 0.18, time: 0.75, feedback: 0.3, pingpong: true }, reverb: { mix: 0.25, decay: 2.5 } }, glide: 0, mono: false, level: -12 },
  "Retro Square":    { osc: [{ wave: "pulse25", octave: 0, semi: 0, detune: 0, level: 0.8, unison: 1, spread: 0 }, { wave: "square", octave: -1, semi: 0, detune: 3, level: 0.4, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0 }, noise: { type: "white", level: 0, decay: 0.05 }, filter: { type: "lowpass", cutoff: 3000, q: 1, envAmount: 1, keyTrack: 0.5 }, ampEnv: { a: 0.005, d: 0.15, s: 0.7, r: 0.15 }, filterEnv: { a: 0.005, d: 0.2, s: 0.5, r: 0.1 }, lfo: { target: "pitch", rate: 6, depth: 0.1, wave: "triangle" }, fx: { drive: 0.08, chorus: { mix: 0, rate: 1, depth: 0.3 }, delay: { mix: 0.2, time: 0.5, feedback: 0.3, pingpong: false }, reverb: { mix: 0.12, decay: 1.5 } }, glide: 0.02, mono: true, level: -11 },
  "Sync Lead":       { osc: [{ wave: "am", octave: 0, semi: 0, detune: 0, level: 0.9, unison: 1, spread: 0 }, { wave: "saw", octave: 0, semi: 0, detune: -8, level: 0.5, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0 }, noise: { type: "white", level: 0, decay: 0.05 }, filter: { type: "lowpass", cutoff: 1800, q: 2, envAmount: 2.5, keyTrack: 0.6 }, ampEnv: { a: 0.005, d: 0.25, s: 0.7, r: 0.2 }, filterEnv: { a: 0.003, d: 0.5, s: 0.3, r: 0.2 }, lfo: { target: "pitch", rate: 5, depth: 0.1, wave: "sine" }, fx: { drive: 0.3, chorus: { mix: 0, rate: 1, depth: 0.3 }, delay: { mix: 0.2, time: 0.75, feedback: 0.3, pingpong: true }, reverb: { mix: 0.15, decay: 1.6 } }, glide: 0.05, mono: true, level: -11 },
  // ── pad
  "Warm Juno Pad":   { osc: [{ wave: "saw", octave: 0, semi: 0, detune: -5, level: 0.7, unison: 1, spread: 0 }, { wave: "square", octave: -1, semi: 0, detune: 5, level: 0.4, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0.15 }, noise: { type: "white", level: 0, decay: 0.05 }, filter: { type: "lowpass", cutoff: 1400, q: 0.6, envAmount: 1.2, keyTrack: 0.4 }, ampEnv: { a: 0.6, d: 1, s: 0.8, r: 1.6 }, filterEnv: { a: 0.8, d: 1.5, s: 0.6, r: 1.5 }, lfo: { target: "filter", rate: 0.15, depth: 0.2, wave: "sine" }, fx: { drive: 0, chorus: { mix: 0.5, rate: 0.6, depth: 0.5 }, delay: { mix: 0, time: 0.5, feedback: 0.3, pingpong: false }, reverb: { mix: 0.35, decay: 3.2 } }, glide: 0, mono: false, level: -14 },
  "Glass Pad":       { osc: [{ wave: "fm3", octave: 0, semi: 0, detune: 0, level: 0.6, unison: 1, spread: 0 }, { wave: "sine", octave: 1, semi: 0, detune: 7, level: 0.5, unison: 3, spread: 12 }, { wave: "triangle", octave: 0, semi: 7, detune: -4, level: 0.25, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0 }, noise: { type: "pink", level: 0.04, decay: 1.5 }, filter: { type: "lowpass", cutoff: 5000, q: 0.5, envAmount: 0.5, keyTrack: 0.5 }, ampEnv: { a: 1.2, d: 1.5, s: 0.7, r: 2.5 }, filterEnv: { a: 1.5, d: 1, s: 0.6, r: 2 }, lfo: { target: "pan", rate: 0.12, depth: 0.5, wave: "sine" }, fx: { drive: 0, chorus: { mix: 0.3, rate: 0.3, depth: 0.6 }, delay: { mix: 0.15, time: 1, feedback: 0.4, pingpong: true }, reverb: { mix: 0.5, decay: 5 } }, glide: 0, mono: false, level: -14 },
  "String Machine":  { osc: [{ wave: "saw", octave: 0, semi: 0, detune: -3, level: 0.6, unison: 3, spread: 14 }, { wave: "saw", octave: 1, semi: 0, detune: 4, level: 0.35, unison: 3, spread: 14 }], sub: { wave: "sine", level: 0 }, noise: { type: "white", level: 0, decay: 0.05 }, filter: { type: "lowpass", cutoff: 2600, q: 0.5, envAmount: 0.4, keyTrack: 0.5 }, ampEnv: { a: 0.35, d: 0.5, s: 0.9, r: 0.9 }, filterEnv: { a: 0.3, d: 0.5, s: 0.8, r: 0.8 }, lfo: { target: "none", rate: 5, depth: 0, wave: "sine" }, fx: { drive: 0, chorus: { mix: 0.6, rate: 0.9, depth: 0.7 }, delay: { mix: 0, time: 0.5, feedback: 0.3, pingpong: false }, reverb: { mix: 0.35, decay: 2.8 } }, glide: 0, mono: false, level: -14 },
  "Dark Drone":      { osc: [{ wave: "saw", octave: -1, semi: 0, detune: -9, level: 0.6, unison: 2, spread: 20 }, { wave: "square", octave: -1, semi: 7, detune: 9, level: 0.35, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0.5 }, noise: { type: "brown", level: 0.06, decay: 2 }, filter: { type: "lowpass", cutoff: 500, q: 1.5, envAmount: 1.5, keyTrack: 0.2 }, ampEnv: { a: 1.5, d: 2, s: 0.9, r: 3 }, filterEnv: { a: 2.5, d: 2, s: 0.5, r: 2 }, lfo: { target: "filter", rate: 0.08, depth: 0.5, wave: "triangle" }, fx: { drive: 0.15, chorus: { mix: 0.2, rate: 0.2, depth: 0.5 }, delay: { mix: 0.1, time: 1.5, feedback: 0.5, pingpong: true }, reverb: { mix: 0.45, decay: 6 } }, glide: 0, mono: false, level: -15 },
  // ── keys / pluck / bells
  "Pluck":           { osc: [{ wave: "saw", octave: 0, semi: 0, detune: 0, level: 0.7, unison: 2, spread: 10 }, { wave: "triangle", octave: 1, semi: 0, detune: 0, level: 0.3, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0.1 }, noise: { type: "white", level: 0.08, decay: 0.03 }, filter: { type: "lowpass", cutoff: 500, q: 1.5, envAmount: 3.8, keyTrack: 0.6 }, ampEnv: { a: 0.002, d: 0.35, s: 0, r: 0.25 }, filterEnv: { a: 0.001, d: 0.18, s: 0, r: 0.15 }, lfo: { target: "none", rate: 5, depth: 0, wave: "sine" }, fx: { drive: 0, chorus: { mix: 0.15, rate: 0.7, depth: 0.3 }, delay: { mix: 0.25, time: 0.75, feedback: 0.35, pingpong: true }, reverb: { mix: 0.22, decay: 2 } }, glide: 0, mono: false, level: -10 },
  "FM E.Piano":      { osc: [{ wave: "fm2", octave: 0, semi: 0, detune: 0, level: 0.8, unison: 1, spread: 0 }, { wave: "sine", octave: 0, semi: 0, detune: -4, level: 0.4, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0 }, noise: { type: "white", level: 0, decay: 0.05 }, filter: { type: "lowpass", cutoff: 6000, q: 0.5, envAmount: 1, keyTrack: 0.6 }, ampEnv: { a: 0.003, d: 1.4, s: 0.15, r: 0.8 }, filterEnv: { a: 0.002, d: 0.6, s: 0.1, r: 0.5 }, lfo: { target: "amp", rate: 4.5, depth: 0.25, wave: "sine" }, fx: { drive: 0.04, chorus: { mix: 0.3, rate: 0.5, depth: 0.4 }, delay: { mix: 0, time: 0.5, feedback: 0.3, pingpong: false }, reverb: { mix: 0.2, decay: 1.8 } }, glide: 0, mono: false, level: -10 },
  "Bells":           { osc: [{ wave: "fm5", octave: 0, semi: 0, detune: 0, level: 0.7, unison: 1, spread: 0 }, { wave: "sine", octave: 2, semi: 0, detune: 3, level: 0.3, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0 }, noise: { type: "white", level: 0, decay: 0.05 }, filter: { type: "lowpass", cutoff: 9000, q: 0.5, envAmount: 0.8, keyTrack: 0.5 }, ampEnv: { a: 0.002, d: 2.5, s: 0.05, r: 2.5 }, filterEnv: { a: 0.001, d: 1, s: 0.1, r: 1 }, lfo: { target: "none", rate: 5, depth: 0, wave: "sine" }, fx: { drive: 0, chorus: { mix: 0.1, rate: 0.4, depth: 0.3 }, delay: { mix: 0.25, time: 1, feedback: 0.4, pingpong: true }, reverb: { mix: 0.4, decay: 4 } }, glide: 0, mono: false, level: -12 },
  "Marimba-ish":     { osc: [{ wave: "sine", octave: 0, semi: 0, detune: 0, level: 0.9, unison: 1, spread: 0 }, { wave: "triangle", octave: 2, semi: 0, detune: 0, level: 0.25, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0 }, noise: { type: "white", level: 0.1, decay: 0.02 }, filter: { type: "lowpass", cutoff: 3000, q: 0.5, envAmount: 2, keyTrack: 0.8 }, ampEnv: { a: 0.001, d: 0.5, s: 0, r: 0.3 }, filterEnv: { a: 0.001, d: 0.1, s: 0, r: 0.1 }, lfo: { target: "none", rate: 5, depth: 0, wave: "sine" }, fx: { drive: 0, chorus: { mix: 0, rate: 1, depth: 0.3 }, delay: { mix: 0.1, time: 0.5, feedback: 0.25, pingpong: false }, reverb: { mix: 0.25, decay: 1.8 } }, glide: 0, mono: false, level: -9 },
  // ── brass / poly
  "80s Brass":       { osc: [{ wave: "saw", octave: 0, semi: 0, detune: -7, level: 0.8, unison: 1, spread: 0 }, { wave: "saw", octave: 0, semi: 0, detune: 7, level: 0.8, unison: 1, spread: 0 }, { wave: "saw", octave: -1, semi: 0, detune: 0, level: 0.4, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0.1 }, noise: { type: "white", level: 0, decay: 0.05 }, filter: { type: "lowpass", cutoff: 700, q: 1.2, envAmount: 2.8, keyTrack: 0.5 }, ampEnv: { a: 0.06, d: 0.3, s: 0.8, r: 0.3 }, filterEnv: { a: 0.09, d: 0.5, s: 0.55, r: 0.3 }, lfo: { target: "none", rate: 5, depth: 0, wave: "sine" }, fx: { drive: 0.1, chorus: { mix: 0.25, rate: 0.6, depth: 0.4 }, delay: { mix: 0.08, time: 0.5, feedback: 0.25, pingpong: false }, reverb: { mix: 0.25, decay: 2.2 } }, glide: 0, mono: false, level: -12 },
  "Poly Stab":       { osc: [{ wave: "saw", octave: 0, semi: 0, detune: -4, level: 0.7, unison: 2, spread: 12 }, { wave: "square", octave: 0, semi: 0, detune: 4, level: 0.5, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0 }, noise: { type: "white", level: 0, decay: 0.05 }, filter: { type: "lowpass", cutoff: 1200, q: 1.5, envAmount: 2.2, keyTrack: 0.5 }, ampEnv: { a: 0.005, d: 0.4, s: 0.2, r: 0.3 }, filterEnv: { a: 0.003, d: 0.25, s: 0.1, r: 0.2 }, lfo: { target: "none", rate: 5, depth: 0, wave: "sine" }, fx: { drive: 0.08, chorus: { mix: 0.2, rate: 0.8, depth: 0.3 }, delay: { mix: 0.18, time: 0.5, feedback: 0.3, pingpong: true }, reverb: { mix: 0.2, decay: 1.8 } }, glide: 0, mono: false, level: -11 },
  "Arp Pluck":       { osc: [{ wave: "square", octave: 0, semi: 0, detune: 0, level: 0.6, unison: 1, spread: 0 }, { wave: "saw", octave: 1, semi: 0, detune: 5, level: 0.4, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0.15 }, noise: { type: "white", level: 0.05, decay: 0.02 }, filter: { type: "lowpass", cutoff: 700, q: 2, envAmount: 3, keyTrack: 0.6 }, ampEnv: { a: 0.002, d: 0.25, s: 0.05, r: 0.2 }, filterEnv: { a: 0.001, d: 0.15, s: 0, r: 0.1 }, lfo: { target: "none", rate: 5, depth: 0, wave: "sine" }, fx: { drive: 0.05, chorus: { mix: 0.1, rate: 0.7, depth: 0.3 }, delay: { mix: 0.3, time: 0.75, feedback: 0.4, pingpong: true }, reverb: { mix: 0.2, decay: 2 } }, glide: 0, mono: false, level: -11 },
  "Organ Comp":      { osc: [{ wave: "square", octave: 0, semi: 0, detune: 0, level: 0.7, unison: 1, spread: 0 }, { wave: "sine", octave: 1, semi: 7, detune: 0, level: 0.4, unison: 1, spread: 0 }, { wave: "sine", octave: -1, semi: 0, detune: 0, level: 0.5, unison: 1, spread: 0 }], sub: { wave: "sine", level: 0 }, noise: { type: "white", level: 0.02, decay: 0.01 }, filter: { type: "lowpass", cutoff: 5000, q: 0.5, envAmount: 0, keyTrack: 0.5 }, ampEnv: { a: 0.005, d: 0.05, s: 1, r: 0.05 }, filterEnv: { a: 0.01, d: 0.1, s: 1, r: 0.1 }, lfo: { target: "amp", rate: 6.5, depth: 0.3, wave: "sine" }, fx: { drive: 0.12, chorus: { mix: 0.3, rate: 5, depth: 0.2 }, delay: { mix: 0, time: 0.5, feedback: 0.3, pingpong: false }, reverb: { mix: 0.2, decay: 1.5 } }, glide: 0, mono: false, level: -12 },
  "Riser Noise":     { osc: [{ wave: "saw", octave: 0, semi: 0, detune: 0, level: 0.3, unison: 7, spread: 60 }], sub: { wave: "sine", level: 0 }, noise: { type: "white", level: 0.7, decay: 4 }, filter: { type: "highpass", cutoff: 400, q: 1, envAmount: 4, keyTrack: 0 }, ampEnv: { a: 2, d: 0.5, s: 1, r: 0.5 }, filterEnv: { a: 4, d: 0.5, s: 1, r: 0.5 }, lfo: { target: "pan", rate: 0.5, depth: 0.6, wave: "sine" }, fx: { drive: 0, chorus: { mix: 0, rate: 1, depth: 0.3 }, delay: { mix: 0.2, time: 0.5, feedback: 0.5, pingpong: true }, reverb: { mix: 0.5, decay: 5 } }, glide: 0, mono: false, level: -14 },
};
for (const [k, p] of Object.entries(PRESETS)) { p.name = k; p.description ??= ""; }

export const DEFAULT_PRESET_BY_INSTRUMENT = { synth: "Poly Stab", "synth-lead": "Saw Lead", "synth-pad": "Warm Juno Pad", "synth-bass": "Moog Sub Bass" };

export function presetFor(instrument) { return clonePatch(PRESETS[DEFAULT_PRESET_BY_INSTRUMENT[instrument] ?? "Poly Stab"]); }
export function clonePatch(p) { return JSON.parse(JSON.stringify(p)); }

// 部分オブジェクトでパッチを上書き (深いマージ・配列 osc は index ごと)
export function mergePatch(base, over) {
  const out = clonePatch(base);
  const rec = (dst, src) => {
    for (const [k, v] of Object.entries(src ?? {})) {
      if (Array.isArray(v)) { dst[k] = v.map((item, i) => (typeof item === "object" && item && dst[k]?.[i] ? rec({ ...dst[k][i] }, item) : item)); }
      else if (v && typeof v === "object") { dst[k] = rec({ ...(dst[k] ?? {}) }, v); }
      else if (v !== undefined) dst[k] = v;
    }
    return dst;
  };
  return normalizePatch(rec(out, over));
}

const clamp = (x, lo, hi, dflt) => (Number.isFinite(+x) ? Math.max(lo, Math.min(hi, +x)) : dflt);
export function normalizePatch(p) {
  const d = PRESETS["Poly Stab"];
  const out = clonePatch({ ...d, ...(p ?? {}) });
  out.osc = (Array.isArray(out.osc) && out.osc.length ? out.osc : d.osc).slice(0, 3).map((o) => ({
    wave: ["saw", "square", "triangle", "sine", "pulse25", "pulse12", "fm2", "fm3", "fm5", "am"].includes(o.wave) ? o.wave : "saw",
    octave: Math.round(clamp(o.octave, -3, 3, 0)), semi: Math.round(clamp(o.semi, -24, 24, 0)), detune: clamp(o.detune, -100, 100, 0),
    level: clamp(o.level, 0, 1, 0.7), unison: Math.round(clamp(o.unison, 1, 7, 1)), spread: clamp(o.spread, 0, 100, 0),
  }));
  out.sub = { wave: ["sine", "square", "triangle"].includes(out.sub?.wave) ? out.sub.wave : "sine", level: clamp(out.sub?.level, 0, 1, 0) };
  out.noise = { type: ["white", "pink", "brown"].includes(out.noise?.type) ? out.noise.type : "white", level: clamp(out.noise?.level, 0, 1, 0), decay: clamp(out.noise?.decay, 0.005, 10, 0.05) };
  out.filter = { type: ["lowpass", "highpass", "bandpass"].includes(out.filter?.type) ? out.filter.type : "lowpass", cutoff: clamp(out.filter?.cutoff, 20, 18000, 2000), q: clamp(out.filter?.q, 0.1, 15, 1), envAmount: clamp(out.filter?.envAmount, 0, 7, 1), keyTrack: clamp(out.filter?.keyTrack, 0, 1, 0.5) };
  const env = (e, df) => ({ a: clamp(e?.a, 0.001, 20, df.a), d: clamp(e?.d, 0.001, 20, df.d), s: clamp(e?.s, 0, 1, df.s), r: clamp(e?.r, 0.005, 30, df.r) });
  out.ampEnv = env(out.ampEnv, d.ampEnv); out.filterEnv = env(out.filterEnv, d.filterEnv);
  out.lfo = { target: ["none", "filter", "pitch", "amp", "pan"].includes(out.lfo?.target) ? out.lfo.target : "none", rate: clamp(out.lfo?.rate, 0.01, 30, 5), depth: clamp(out.lfo?.depth, 0, 1, 0), wave: ["sine", "triangle", "square", "sawtooth"].includes(out.lfo?.wave) ? out.lfo.wave : "sine" };
  const fx = out.fx ?? {};
  out.fx = {
    drive: clamp(fx.drive, 0, 1, 0),
    chorus: { mix: clamp(fx.chorus?.mix, 0, 1, 0), rate: clamp(fx.chorus?.rate, 0.05, 10, 1), depth: clamp(fx.chorus?.depth, 0, 1, 0.3) },
    delay: { mix: clamp(fx.delay?.mix, 0, 1, 0), time: clamp(fx.delay?.time, 0.0625, 4, 0.5), feedback: clamp(fx.delay?.feedback, 0, 0.9, 0.3), pingpong: !!fx.delay?.pingpong },
    reverb: { mix: clamp(fx.reverb?.mix, 0, 1, 0), decay: clamp(fx.reverb?.decay, 0.1, 12, 1.5) },
  };
  out.glide = clamp(out.glide, 0, 2, 0);
  out.mono = !!out.mono;
  out.level = clamp(out.level, -40, 6, -10);
  out.name = String(out.name ?? "Custom");
  out.description = String(out.description ?? "");
  return out;
}

/* ─────────── engine ─────────── */

function oscOptions(o) {
  const fat = o.unison > 1;
  switch (o.wave) {
    case "saw": return fat ? { type: "fatsawtooth", count: o.unison, spread: o.spread } : { type: "sawtooth" };
    case "square": return fat ? { type: "fatsquare", count: o.unison, spread: o.spread } : { type: "square" };
    case "triangle": return fat ? { type: "fattriangle", count: o.unison, spread: o.spread } : { type: "triangle" };
    case "sine": return fat ? { type: "fatsine", count: o.unison, spread: o.spread } : { type: "sine" };
    case "pulse25": return { type: "pulse", width: 0.25 };
    case "pulse12": return { type: "pulse", width: 0.12 };
    case "fm2": return { type: "fmsine", harmonicity: 2, modulationIndex: 6, modulationType: "sine" };
    case "fm3": return { type: "fmsine", harmonicity: 3, modulationIndex: 5, modulationType: "sine" };
    case "fm5": return { type: "fmsine", harmonicity: 5.01, modulationIndex: 4, modulationType: "sine" };
    case "am": return { type: "amsine", harmonicity: 1.5, modulationType: "square" };
    default: return { type: "sawtooth" };
  }
}

/**
 * パッチから音源を作る。戻り値は audio.js の楽器インターフェース:
 *   { kind, trigger(p, time, durSec, vel), outs: [node], setTempo(bpm), dispose(), panic() }
 */
export function createSynth(patch, { tempo = 120 } = {}) {
  const p = normalizePatch(patch);
  const nodes = [];
  const layers = [];
  const mix = new Tone.Gain(1); nodes.push(mix);

  for (const o of p.osc) {
    if (o.level <= 0) continue;
    const opts = {
      oscillator: oscOptions(o),
      envelope: { attack: p.ampEnv.a, decay: p.ampEnv.d, sustain: p.ampEnv.s, release: p.ampEnv.r },
      filter: { type: p.filter.type, Q: p.filter.q, rolloff: -24 },
      filterEnvelope: { attack: p.filterEnv.a, decay: p.filterEnv.d, sustain: p.filterEnv.s, release: p.filterEnv.r, baseFrequency: p.filter.cutoff, octaves: p.filter.envAmount, exponent: 2 },
      detune: o.octave * 1200 + o.semi * 100 + o.detune,
      portamento: p.glide,
      volume: Tone.gainToDb(o.level) - 6,
    };
    let node;
    if (p.mono) node = new Tone.MonoSynth(opts);
    else { node = new Tone.PolySynth(Tone.MonoSynth, opts); node.maxPolyphony = 24; }
    node.connect(mix);
    nodes.push(node); layers.push(node);
  }
  let sub = null;
  if (p.sub.level > 0) {
    const opts = { oscillator: { type: p.sub.wave }, envelope: { attack: p.ampEnv.a, decay: p.ampEnv.d, sustain: p.ampEnv.s, release: p.ampEnv.r }, detune: -1200, portamento: p.glide, volume: Tone.gainToDb(p.sub.level) - 6 };
    sub = p.mono ? new Tone.Synth(opts) : new Tone.PolySynth(Tone.Synth, opts);
    if (!p.mono) sub.maxPolyphony = 16;
    sub.connect(mix); nodes.push(sub);
  }
  let noise = null;
  if (p.noise.level > 0) {
    noise = new Tone.NoiseSynth({ noise: { type: p.noise.type }, envelope: { attack: 0.002, decay: p.noise.decay, sustain: 0, release: 0.05 }, volume: Tone.gainToDb(p.noise.level) - 8 });
    const nf = new Tone.Filter(p.filter.type === "highpass" ? p.filter.cutoff : Math.max(p.filter.cutoff, 800), p.filter.type === "highpass" ? "highpass" : "lowpass");
    noise.connect(nf); nf.connect(mix); nodes.push(noise, nf);
  }

  // LFO 効果 (共有)
  let tail = mix;
  const chain = [];
  const l = p.lfo;
  if (l.target !== "none" && l.depth > 0) {
    let fx;
    if (l.target === "filter") { fx = new Tone.AutoFilter({ frequency: l.rate, type: l.wave, depth: l.depth, baseFrequency: Math.max(60, p.filter.cutoff * 0.35), octaves: 2 + l.depth * 2, filter: { type: "lowpass", rolloff: -12, Q: 1 } }).start(); }
    else if (l.target === "pitch") fx = new Tone.Vibrato({ frequency: l.rate, depth: l.depth * 0.4, type: l.wave });
    else if (l.target === "amp") fx = new Tone.Tremolo({ frequency: l.rate, depth: l.depth, type: l.wave }).start();
    else if (l.target === "pan") { fx = new Tone.AutoPanner({ frequency: l.rate, type: l.wave }).start(); fx.depth.value = l.depth; }
    if (fx) chain.push(fx);
  }
  if (p.fx.drive > 0.01) { const d = new Tone.Distortion({ distortion: p.fx.drive, wet: Math.min(1, 0.3 + p.fx.drive) }); chain.push(d); }
  if (p.fx.chorus.mix > 0.01) { const c = new Tone.Chorus({ frequency: p.fx.chorus.rate, delayTime: 3.5, depth: p.fx.chorus.depth, spread: 120, wet: p.fx.chorus.mix }).start(); chain.push(c); }
  let delay = null;
  if (p.fx.delay.mix > 0.01) {
    const t = p.fx.delay.time * (60 / tempo);
    delay = p.fx.delay.pingpong ? new Tone.PingPongDelay({ delayTime: t, feedback: p.fx.delay.feedback, wet: p.fx.delay.mix, maxDelay: 4 }) : new Tone.FeedbackDelay({ delayTime: t, feedback: p.fx.delay.feedback, wet: p.fx.delay.mix, maxDelay: 4 });
    chain.push(delay);
  }
  for (const n of chain) { tail.connect(n); tail = n; nodes.push(n); }
  if (p.fx.reverb.mix > 0.01) {
    // Tone.Convolver に wet が無いので、dry / wet を並列に足す
    const ir = makeImpulse(Tone.getContext().rawContext, { decay: p.fx.reverb.decay, preDelay: 0.01, damp: 0.5, early: 0.3, seed: 3 });
    const conv = new Tone.Convolver(new Tone.ToneAudioBuffer(ir));
    const dry = new Tone.Gain(1 - p.fx.reverb.mix * 0.7), wet = new Tone.Gain(p.fx.reverb.mix), sum = new Tone.Gain(1);
    tail.connect(dry); dry.connect(sum);
    tail.connect(conv); conv.connect(wet); wet.connect(sum);
    nodes.push(conv, dry, wet, sum); tail = sum;
  }
  const level = new Tone.Volume(p.level);
  tail.connect(level); nodes.push(level); tail = level;

  const freq = (pp) => Tone.Frequency(pp, "midi").toFrequency();
  function trigger(pp, time, durSec, vel) {
    const v = Math.max(0.05, Math.min(1, vel / 127));
    const f = freq(pp);
    const dur = Math.max(0.02, durSec);
    for (const n of layers) n.triggerAttackRelease(f, dur, time, v);
    if (sub) sub.triggerAttackRelease(f, dur, time, v);
    if (noise) noise.triggerAttackRelease(Math.min(dur, p.noise.decay + 0.05), time, v);
  }
  return {
    kind: "synth", patch: p, sampled: false, outs: [level],
    trigger,
    setTempo: (bpm) => { if (delay) delay.delayTime.value = p.fx.delay.time * (60 / bpm); },
    panic: () => { for (const n of layers) { try { n.releaseAll?.(); n.triggerRelease?.(); } catch {} } try { sub?.releaseAll?.(); sub?.triggerRelease?.(); } catch {} },
    dispose: () => { for (const n of nodes) { try { n.dispose(); } catch {} } },
  };
}

/* ─────────── UI 用のパラメータ表 (synth パネルが自動生成する) ─────────── */
export const PATCH_UI = [
  { group: "OSC 1", path: "osc.0", fields: [["wave", "select", ["saw", "square", "triangle", "sine", "pulse25", "pulse12", "fm2", "fm3", "fm5", "am"]], ["octave", "range", -2, 2, 1], ["semi", "range", -12, 12, 1], ["detune", "range", -50, 50, 1], ["level", "range", 0, 1, 0.01], ["unison", "range", 1, 7, 1], ["spread", "range", 0, 60, 1]] },
  { group: "OSC 2", path: "osc.1", fields: [["wave", "select", ["saw", "square", "triangle", "sine", "pulse25", "pulse12", "fm2", "fm3", "fm5", "am"]], ["octave", "range", -2, 2, 1], ["semi", "range", -12, 12, 1], ["detune", "range", -50, 50, 1], ["level", "range", 0, 1, 0.01], ["unison", "range", 1, 7, 1], ["spread", "range", 0, 60, 1]] },
  { group: "OSC 3", path: "osc.2", fields: [["wave", "select", ["saw", "square", "triangle", "sine", "pulse25", "pulse12", "fm2", "fm3", "fm5", "am"]], ["octave", "range", -2, 2, 1], ["semi", "range", -12, 12, 1], ["detune", "range", -50, 50, 1], ["level", "range", 0, 1, 0.01], ["unison", "range", 1, 7, 1], ["spread", "range", 0, 60, 1]] },
  { group: "SUB / NOISE", path: "", fields: [["sub.wave", "select", ["sine", "square", "triangle"]], ["sub.level", "range", 0, 1, 0.01], ["noise.type", "select", ["white", "pink", "brown"]], ["noise.level", "range", 0, 1, 0.01], ["noise.decay", "range", 0.005, 4, 0.005]] },
  { group: "FILTER", path: "filter", fields: [["type", "select", ["lowpass", "highpass", "bandpass"]], ["cutoff", "log", 20, 18000], ["q", "range", 0.1, 12, 0.1], ["envAmount", "range", 0, 6, 0.1], ["keyTrack", "range", 0, 1, 0.05]] },
  { group: "AMP ENV", path: "ampEnv", fields: [["a", "log", 0.001, 10], ["d", "log", 0.001, 10], ["s", "range", 0, 1, 0.01], ["r", "log", 0.005, 20]] },
  { group: "FILTER ENV", path: "filterEnv", fields: [["a", "log", 0.001, 10], ["d", "log", 0.001, 10], ["s", "range", 0, 1, 0.01], ["r", "log", 0.005, 20]] },
  { group: "LFO", path: "lfo", fields: [["target", "select", ["none", "filter", "pitch", "amp", "pan"]], ["rate", "log", 0.05, 20], ["depth", "range", 0, 1, 0.01], ["wave", "select", ["sine", "triangle", "square", "sawtooth"]]] },
  { group: "FX", path: "fx", fields: [["drive", "range", 0, 1, 0.01], ["chorus.mix", "range", 0, 1, 0.01], ["chorus.rate", "range", 0.05, 8, 0.05], ["chorus.depth", "range", 0, 1, 0.01], ["delay.mix", "range", 0, 1, 0.01], ["delay.time", "select", [0.125, 0.25, 0.333, 0.375, 0.5, 0.667, 0.75, 1, 1.5, 2]], ["delay.feedback", "range", 0, 0.9, 0.01], ["delay.pingpong", "bool"], ["reverb.mix", "range", 0, 1, 0.01], ["reverb.decay", "range", 0.2, 10, 0.1]] },
  { group: "VOICE", path: "", fields: [["mono", "bool"], ["glide", "range", 0, 0.5, 0.005], ["level", "range", -30, 6, 0.5]] },
];
export function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); }
export function setPath(obj, path, val) { const ks = path.split("."); let o = obj; for (const k of ks.slice(0, -1)) { if (o[k] == null) o[k] = /^\d+$/.test(k) ? [] : {}; o = o[k]; } o[ks[ks.length - 1]] = val; }
