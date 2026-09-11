// node tools/synth2-test.mjs — SynthCore をオフラインで回して全プリセットを WAV に書き、健全性を検査する
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SynthCore } from "../public/js/synthcore.js";
import { SYNTH2_PRESETS, normalizePatch2, knobDefaults } from "../public/js/synth2.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "exports", "synth2-test");
fs.mkdirSync(OUT, { recursive: true });
const FS = 48000, BLOCK = 128;

function writeWav(file, L, R, rate) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4); buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4); }
  fs.writeFileSync(file, buf);
}
// events: [{t (sec), on:bool, p, v}]
function render(patch, seconds, events, { block = BLOCK, knobs = null, tempo = 120 } = {}) {
  const core = new SynthCore(FS); core.setTempo(tempo); core.setPatch(patch);
  if (knobs) for (const [k, v] of Object.entries(knobs)) core.setKnob(k, v);
  const total = Math.ceil(seconds * FS / block) * block, L = new Float32Array(total), R = new Float32Array(total);
  const ev = events.map((e) => ({ ...e, s: Math.round(e.t * FS) })).sort((a, b) => a.s - b.s);
  let ei = 0; const oL = new Float32Array(block), oR = new Float32Array(block);
  for (let pos = 0; pos < total; pos += block) {
    while (ei < ev.length && ev[ei].s < pos + block) { const e = ev[ei++]; const off = Math.max(0, e.s - pos); if (e.on) core.noteOn(e.p, e.v, off); else core.noteOff(e.p, off); }
    core.process(oL, oR, block); L.set(oL, pos); R.set(oR, pos);
  }
  return { L, R };
}
function stats(L, R) {
  let peak = 0, sum = 0, mean = 0, bad = 0; const n = L.length;
  for (let i = 0; i < n; i++) { const l = L[i], r = R[i]; if (!Number.isFinite(l) || !Number.isFinite(r)) bad++; peak = Math.max(peak, Math.abs(l), Math.abs(r)); sum += l * l + r * r; mean += l + r; }
  const rms = Math.sqrt(sum / (2 * n)); return { peak, rmsDb: 20 * Math.log10(rms + 1e-12), peakDb: 20 * Math.log10(peak + 1e-12), dc: Math.abs(mean / (2 * n)), bad };
}
const phrase = (base = 48) => {
  const ev = [];
  const chord = [base + 12, base + 16, base + 19];
  for (const p of chord) { ev.push({ t: 0.05, on: true, p, v: 100 }); ev.push({ t: 1.0, on: false, p }); }
  const line = [base + 24, base + 26, base + 28, base + 31];
  line.forEach((p, i) => { ev.push({ t: 1.05 + i * 0.2, on: true, p, v: 90 }); ev.push({ t: 1.05 + i * 0.2 + 0.15, on: false, p }); });
  return ev;
};
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); return cond; };
const rows = [];
console.time("render");
for (const [name, patch] of Object.entries(SYNTH2_PRESETS)) {
  const base = /bass/i.test(name) ? 36 : 48;
  const t0 = performance.now();
  const { L, R } = render(patch, 2, phrase(base));
  const ms = performance.now() - t0;
  const s = stats(L, R);
  writeWav(path.join(OUT, `${name.replace(/[^\w\- ]+/g, "_")}.wav`), L, R, FS);
  const ok = check(s.bad === 0, `${name}: NaN/Inf`) & check(s.peak < 0.99, `${name}: peak ${s.peak.toFixed(3)} >= 0.99`) & check(s.rmsDb > -40 && s.rmsDb < -6, `${name}: RMS ${s.rmsDb.toFixed(1)} dBFS out of [-40,-6]`) & check(s.dc < 0.01, `${name}: DC ${s.dc.toFixed(4)}`);
  rows.push({ preset: name, peak_dB: +s.peakDb.toFixed(1), rms_dB: +s.rmsDb.toFixed(1), dc: +s.dc.toFixed(4), ms: +ms.toFixed(0), rt_x: +((2000 / ms)).toFixed(0), ok: ok ? "ok" : "FAIL" });
}
console.timeEnd("render");

// ── ladder attenuation: 1 kHz sine, cutoff 500 Hz vs 18 kHz ──
{
  const sinePatch = normalizePatch2({ osc: [{ wave: "sine", level: 1 }], filter: { model: "ladder", cutoff: 18000, resonance: 0, envAmount: 0, keyTrack: 0, velAmount: 0 }, ampEnv: { a: 0.001, d: 0.1, s: 1, r: 0.05 }, filterEnv: { a: 0.001, d: 0.1, s: 0, r: 0.05 } });
  const p1k = 69 + 12 * Math.log2(1000 / 440); // 非整数 MIDI は使えないので 1 kHz に最も近い整数 + detune で合わせる
  const note = Math.round(p1k), cents = (p1k - note) * 100;
  sinePatch.osc[0].detune = cents;
  const ev = [{ t: 0.02, on: true, p: note, v: 100 }, { t: 1.9, on: false, p: note }];
  const rmsWin = (L) => { let s = 0, c = 0; for (let i = Math.round(0.5 * FS); i < Math.round(1.5 * FS); i++) { s += L[i] * L[i]; c++; } return Math.sqrt(s / c); };
  const open = rmsWin(render(sinePatch, 2, ev, { knobs: { cutoff: 1 } }).L);
  const closed = rmsWin(render(sinePatch, 2, ev, { knobs: { cutoff: Math.log(500 / 20) / Math.log(900) } }).L);
  const att = 20 * Math.log10(open / (closed + 1e-12));
  check(att > 20, `ladder attenuation ${att.toFixed(1)} dB <= 20 dB`);
  rows.push({ preset: "[ladder 1kHz sine: fc 500 vs 18k]", peak_dB: +(20 * Math.log10(open)).toFixed(1), rms_dB: +(20 * Math.log10(closed + 1e-12)).toFixed(1), dc: +att.toFixed(1), ms: 0, rt_x: 0, ok: att > 20 ? "ok" : "FAIL" });
  // SVF too
  const svfPatch = normalizePatch2({ ...sinePatch, filter: { ...sinePatch.filter, model: "svf-lp" } });
  const o2 = rmsWin(render(svfPatch, 2, ev, { knobs: { cutoff: 1 } }).L), c2 = rmsWin(render(svfPatch, 2, ev, { knobs: { cutoff: Math.log(500 / 20) / Math.log(900) } }).L);
  const att2 = 20 * Math.log10(o2 / (c2 + 1e-12));
  check(att2 > 10, `svf-lp attenuation ${att2.toFixed(1)} dB <= 10 dB`);
  rows.push({ preset: "[svf-lp 1kHz sine: fc 500 vs 18k]", peak_dB: +(20 * Math.log10(o2)).toFixed(1), rms_dB: +(20 * Math.log10(c2 + 1e-12)).toFixed(1), dc: +att2.toFixed(1), ms: 0, rt_x: 0, ok: att2 > 10 ? "ok" : "FAIL" });
}
// ── sample-accurate start: noteOn at offset 37 → sample < 37 は無音 ──
{
  const core = new SynthCore(FS);
  core.setPatch(normalizePatch2({ osc: [{ wave: "saw", level: 1, phaseRand: false }], filter: { model: "off" }, ampEnv: { a: 0.001, d: 0.1, s: 1, r: 0.1 } }));
  const L = new Float32Array(128), R = new Float32Array(128);
  core.process(L, R, 128); // 1 ブロック空回し
  core.noteOn(60, 120, 37);
  core.process(L, R, 128);
  // PolyBLEP saw は位相 0 でちょうど 0 なので、最初の非ゼロは 37 か 38。37 より前は完全な無音であること
  let firstNonZero = -1; for (let i = 0; i < 128; i++) if (Math.abs(L[i]) > 1e-9) { firstNonZero = i; break; }
  const okStart = firstNonZero === 37 || firstNonZero === 38;
  check(okStart, `sample-accurate start: first non-zero sample = ${firstNonZero}, expected 37 (or 38: waveform is 0 at phase 0)`);
  rows.push({ preset: "[noteOn @ offset 37]", peak_dB: 0, rms_dB: 0, dc: firstNonZero, ms: 0, rt_x: 0, ok: okStart ? "ok" : "FAIL" });
}
// ── polyphony stress: 16 声 × 3 osc ladder — 実時間比 ──
{
  const stress = normalizePatch2({ osc: [{ wave: "saw", level: 0.5, unison: 3, spread: 10 }, { wave: "square", level: 0.4, unison: 3, spread: 10 }, { wave: "supersaw", level: 0.3 }], filter: { model: "ladder", cutoff: 1500, resonance: 0.4 }, drive: { amount: 0.3 }, ampEnv: { a: 0.01, d: 0.3, s: 1, r: 0.2 } });
  const ev = []; for (let i = 0; i < 16; i++) { ev.push({ t: 0.01 + i * 0.01, on: true, p: 40 + i * 2, v: 100 }); }
  // 速度は負荷の影響を受けるので 3 回の最小値で見る
  let ms = Infinity, L, R;
  for (let rep = 0; rep < 3; rep++) { const t0 = performance.now(); ({ L, R } = render(stress, 2, ev)); ms = Math.min(ms, performance.now() - t0); }
  const s = stats(L, R);
  check(s.bad === 0 && s.peak < 0.99, `stress: bad=${s.bad} peak=${s.peak.toFixed(3)}`);
  check(2000 / ms > 1.2, `stress: only ${(2000 / ms).toFixed(2)}x realtime (16 voices x 13 partials + ladder 2x OS + drive 2x OS)`);
  rows.push({ preset: "[16 voices x (3+3+7 partials) ladder]", peak_dB: +s.peakDb.toFixed(1), rms_dB: +s.rmsDb.toFixed(1), dc: +s.dc.toFixed(4), ms: +ms.toFixed(0), rt_x: +((2000 / ms)).toFixed(1), ok: s.bad === 0 && s.peak < 0.99 ? "ok" : "FAIL" });
}
// ── garbage patch never throws ──
{
  let threw = false;
  try { const c = new SynthCore(FS); c.setPatch(normalizePatch2({ osc: "x", filter: { cutoff: "nan", model: 42 }, lfo1: null, fx: 7 })); const L = new Float32Array(128), R = new Float32Array(128); c.noteOn(60, 100, 0); c.process(L, R, 128); } catch (e) { threw = true; console.error(e); }
  check(!threw, "normalizePatch2 garbage input threw");
  const kd = knobDefaults(SYNTH2_PRESETS["Moog Bass"]);
  check(Object.keys(kd).length === 8 && Object.values(kd).every((v) => v >= 0 && v <= 1), "knobDefaults shape");
}
console.table(rows);
if (failures.length) { console.error("\nFAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
console.log(`\nall ok — ${Object.keys(SYNTH2_PRESETS).length} presets rendered to ${OUT}`);
