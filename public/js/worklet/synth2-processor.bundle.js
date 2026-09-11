// ═══════════ 自動生成: node tools/bundle-worklet.mjs (synthcore.js + synth2-processor.js)。手で直さない ═══════════
// ═══════════ VESPER SYNTH2 — pure DSP core (no Web Audio, no DOM) ═══════════
// Node からも AudioWorklet からも import できる。
//   16 voice poly (内部プール 20: 奪った声を 1ms でフェードするための予備 4)
//   voice = up to 3 osc (PolyBLEP saw/square/pulse/tri, sine, JP-8000 supersaw, MIP-mapped wavetable)
//           + sub + noise → ladder (2x OS, tanh) / TPT-SVF → drive (2x OS) → amp / pan
//   制御は CTRL(16) サンプルごと、アンプエンベロープは毎サンプル。イベントはサンプル精度。
// ノブ (0..1) は setKnob で即時に入り、ブロックごとに ~5ms のワンポールで平滑化。

const CTRL = 16;
const MAX_VOICES = 16, POOL = 20, MAX_OSC = 3, MAX_UNI = 7;
const TWO_PI = Math.PI * 2;

// ───────────── knob mappings (synth2.js もこれを使う) ─────────────
const KNOB_IDS = ["cutoff", "resonance", "envAmount", "lfoRate", "lfoDepth", "drive", "delay", "reverb"];
const LFO_DIVISIONS = [["4/1", 16], ["2/1", 8], ["1/1", 4], ["1/2", 2], ["1/4d", 1.5], ["1/4", 1], ["1/8d", 0.75], ["1/8", 0.5], ["1/8t", 1 / 3], ["1/16", 0.25]];
const clamp01 = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(1, +v)) : 0.5);
function knobToCutoff(v) { return 20 * Math.pow(900, clamp01(v)); }            // 20 Hz .. 18 kHz (log)
function cutoffToKnob(hz) { return clamp01(Math.log(Math.max(20, hz) / 20) / Math.log(900)); }
function knobToLfoRate(v) { return 0.05 * Math.pow(400, clamp01(v)); }         // 0.05 .. 20 Hz (log)
function lfoRateToKnob(hz) { return clamp01(Math.log(Math.max(0.05, hz) / 0.05) / Math.log(400)); }
function knobToDivision(v) { return LFO_DIVISIONS[Math.round(clamp01(v) * (LFO_DIVISIONS.length - 1))][0]; }
function divisionToKnob(div) { const i = LFO_DIVISIONS.findIndex((d) => d[0] === div); return (i < 0 ? 5 : i) / (LFO_DIVISIONS.length - 1); }
function divisionBeats(div) { const d = LFO_DIVISIONS.find((x) => x[0] === div); return d ? d[1] : 1; }
const ENV_OCTAVES = 6; // envAmount knob 1.0 = 6 octaves

// ───────────── small helpers ─────────────
function ftanh(x) { if (x > 3) return 1; if (x < -3) return -1; const x2 = x * x; return x * (27 + x2) / (27 + 9 * x2); }
function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ───────────── wavetables (additive, MIP-mapped by octave) ─────────────
const WT_SIZE = 2048, WT_MASK = WT_SIZE - 1, WT_LEVELS = 9, WT_MAXH = 256;
let SINE_TAB = null;
const wtCache = new Map();
function sineTab() { if (!SINE_TAB) { SINE_TAB = new Float32Array(WT_SIZE); for (let i = 0; i < WT_SIZE; i++) SINE_TAB[i] = Math.sin(TWO_PI * i / WT_SIZE); } return SINE_TAB; }
// frames: 各フレームは harmonic amplitude 配列 (index h = 1..256, 負の値は位相反転)
function buildTable(frames) {
  const S = sineTab(), nf = frames.length;
  const data = new Float32Array(nf * WT_LEVELS * WT_SIZE);
  for (let f = 0; f < nf; f++) {
    const amps = frames[f];
    for (let lv = 0; lv < WT_LEVELS; lv++) {
      const H = Math.min(WT_MAXH >> lv, amps.length - 1), base = (f * WT_LEVELS + lv) * WT_SIZE;
      for (let h = 1; h <= H; h++) {
        const a = amps[h]; if (!a) continue;
        for (let n = 0, ph = 0; n < WT_SIZE; n++, ph = (ph + h) & WT_MASK) data[base + n] += a * S[ph];
      }
    }
    let peak = 1e-9; const b0 = f * WT_LEVELS * WT_SIZE;
    for (let n = 0; n < WT_SIZE; n++) peak = Math.max(peak, Math.abs(data[b0 + n]));
    const g = 1 / peak;
    for (let n = 0; n < WT_LEVELS * WT_SIZE; n++) data[b0 + n] *= g;
  }
  return { frames: nf, data };
}
const H = (pairs) => { const a = new Float32Array(WT_MAXH + 1); for (const [h, v] of pairs) if (h <= WT_MAXH) a[h] = v; return a; };
const WT_DEFS = {
  organ: () => [
    H([[1, 1], [2, 0.35]]),
    H([[1, 1], [2, 0.8], [3, 0.5], [4, 0.6]]),
    H([[1, 1], [2, 0.9], [3, 0.7], [4, 0.8], [5, 0.45], [6, 0.55], [8, 0.65]]),
    H([[1, 1], [2, 1], [3, 0.9], [4, 1], [5, 0.7], [6, 0.8], [8, 0.9], [10, 0.5], [12, 0.6], [16, 0.5]]),
  ],
  bell: () => [
    H([[1, 1], [3, 0.35], [5, 0.12]]),
    H([[1, 1], [3, 0.6], [5, 0.4], [7, 0.25], [11, 0.15]]),
    H([[1, 0.8], [3, 0.7], [5, 0.6], [7, 0.5], [11, 0.4], [13, 0.35], [17, 0.3], [23, 0.2]]),
    H([[1, 0.5], [4, 0.6], [7, 0.5], [10, 0.4], [13, 0.4], [19, 0.3], [27, 0.2], [41, 0.12]]),
  ],
  vocal: () => {
    const vowels = [[730, 1090, 2440], [570, 840, 2410], [300, 870, 2240], [270, 2290, 3010], [390, 1990, 2550]]; // a o u e i
    const rnd = mulberry(42);
    return vowels.map((F) => {
      const a = new Float32Array(WT_MAXH + 1);
      for (let h = 1; h <= 120; h++) {
        const f = h * 170; let s = 0;
        for (let k = 0; k < 3; k++) { const bw = 90 + k * 40; const d = (f - F[k]) / bw; s += [1, 0.6, 0.35][k] / (1 + d * d); }
        s *= 1 / (1 + h / 14);
        a[h] = s * (rnd() < 0.5 ? -1 : 1);
      }
      return a;
    });
  },
  digital: () => {
    const f1 = new Float32Array(WT_MAXH + 1), f2 = new Float32Array(WT_MAXH + 1), f3 = new Float32Array(WT_MAXH + 1), f4 = new Float32Array(WT_MAXH + 1), f5 = new Float32Array(WT_MAXH + 1);
    for (let h = 1; h <= WT_MAXH; h++) {
      f1[h] = 1 / h;                                              // saw
      f2[h] = (h & 1 ? 1 : 0.35) / Math.sqrt(h);                  // hollow, bright
      f3[h] = h <= 24 ? 1 : 0;                                    // flat spectrum (buzzy pulse)
      f4[h] = (h % 3 === 0 ? -1 : 1) / Math.pow(h, 0.7);          // metallic
    }
    for (const h of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]) f5[h] = 1 / Math.sqrt(h); // sparse / glassy
    return [f1, f2, f3, f4, f5];
  },
  pwm: () => [0.5, 0.35, 0.22, 0.12, 0.05].map((w) => { const a = new Float32Array(WT_MAXH + 1); for (let h = 1; h <= WT_MAXH; h++) a[h] = (2 / (h * Math.PI)) * Math.sin(Math.PI * h * w); return a; }),
};
function getWavetable(name) {
  if (wtCache.has(name)) return wtCache.get(name);
  const def = WT_DEFS[name] ?? WT_DEFS.digital;
  const t = buildTable(def()); wtCache.set(name, t); return t;
}
const WAVETABLE_NAMES = Object.keys(WT_DEFS);

// wave codes
const W_SAW = 0, W_SQUARE = 1, W_PULSE = 2, W_TRI = 3, W_SINE = 4, W_SUPER = 5, W_WT = 6;
const waveCode = (w) => ({ saw: W_SAW, square: W_SQUARE, pulse: W_PULSE, triangle: W_TRI, sine: W_SINE, supersaw: W_SUPER }[w] ?? (String(w).startsWith("wt:") ? W_WT : W_SAW));
const LFO_W = { sine: 0, tri: 1, saw: 2, square: 3, sh: 4 };
const T_NONE = 0, T_CUTOFF = 1, T_PITCH = 2, T_AMP = 3, T_PAN = 4, T_PW = 5, T_MORPH = 6;
const targetCode = (t) => ({ none: 0, cutoff: 1, pitch: 2, amp: 3, pan: 4, pw: 5, morph: 6 }[t] ?? 0);
const F_OFF = 0, F_LADDER = 1, F_LP = 2, F_BP = 3, F_HP = 4;
const filterCode = (m) => ({ off: 0, ladder: 1, "svf-lp": 2, "svf-bp": 3, "svf-hp": 4 }[m] ?? 1);

// JP-8000 supersaw (Adam Szabo の解析) — detune 曲線と center/side のミックス
const SS_OFF = [-0.11002313, -0.06288439, -0.01952356, 0, 0.01991221, 0.06216538, 0.10745242];
function ssDetune(x) { return 10028.7312891634 * x ** 11 - 50818.8652045924 * x ** 10 + 111363.4808729368 * x ** 9 - 138150.6761080548 * x ** 8 + 106649.6679158292 * x ** 7 - 53046.9642751875 * x ** 6 + 17019.9518580080 * x ** 5 - 3425.0836591318 * x ** 4 + 404.2703938388 * x ** 3 - 24.1878824391 * x ** 2 + 0.6717417634 * x + 0.0030115596; }
function ssSide(x) { return -0.73764 * x * x + 1.2841 * x + 0.044372; }
function ssCenter(x) { return -0.55366 * x + 0.99785; }

// ───────────── envelope (analog-style exponential, per-sample or per-CTRL) ─────────────
const ATT_TARGET = 1.3;
function envCoefs(e, fs, step) {
  const c = (tau) => 1 - Math.exp(-step / (tau * fs));
  return { a: c(Math.max(1e-4, e.a) / 1.466), d: c(Math.max(1e-4, e.d) / 3.5), r: c(Math.max(1e-4, e.r) / 4.6), s: e.s };
}

// ───────────── voice ─────────────
class Voice {
  constructor(core) {
    this.core = core;
    this.state = 0;             // 0 free, 1 held, 2 released
    this.fade = -1;             // ≥0 : 1ms フェードアウト中 (奪われた声)
    this.note = 60; this.vel = 100; this.pitch = 60; this.targetPitch = 60;
    this.start = 0; this.age = 0;
    this.phase = new Float64Array(MAX_OSC * MAX_UNI);
    this.tri = new Float32Array(MAX_OSC * MAX_UNI);
    this.hpL = new Float32Array(MAX_OSC); this.hpR = new Float32Array(MAX_OSC);
    this.subPhase = 0; this.subTri = -1;
    this.noiseEnv = 0; this.pink = new Float32Array(3); this.rng = (Math.random() * 0xffffffff) | 0;
    this.amp = { v: 0, st: 0 }; this.fenv = { v: 0, st: 0 }; this.menv = { v: 0, st: 0 };
    this.lfoPhase = new Float64Array(2); this.lfoSH = new Float32Array(2);
    this.fL = new Float64Array(8); this.fR = new Float64Array(8);   // filter states
    this.dL = new Float64Array(6); this.dR = new Float64Array(6);   // drive states (biquad z1 z2, dc x1 y1, prev in)
    this.bufL = new Float32Array(CTRL); this.bufR = new Float32Array(CTRL);
    this.velGain = 0.8; this.velCutOct = 0; this.retrigLegato = false;
    this.lfoOut = new Float32Array(2); this.lfoDepthEff = new Float32Array(2); this.mod = new Float64Array(6);
  }
  rand() { let x = this.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.rng = x; return (x >>> 0) / 4294967296; }
  isPlaying() { return this.state !== 0; }
  loudness() { return this.amp.v * this.velGain; }

  // 新しい音 (retrig=false なら legato: ピッチだけ移動)
  start_(note, vel, fromPitch, retrig, freshPhases) {
    const P = this.core.P, fs = this.core.fs;
    this.note = note; this.vel = vel; this.targetPitch = note;
    this.pitch = (P.voice.glide > 0 && fromPitch != null) ? fromPitch : note;
    const v01 = Math.max(0, Math.min(1, vel / 127));
    this.velGain = 0.2 + 0.8 * Math.pow(v01, 1.3);
    this.velCutOct = P.filter.velAmount * (v01 - 1) * 3;
    if (retrig) {
      this.amp.st = 1; this.fenv.st = 1; this.menv.st = 1;      // 現在値から attack (クリックなし)
      this.noiseEnv = 1;
      for (let k = 0; k < 2; k++) { const L = P.lfo[k]; this.lfoPhase[k] = L.retrig ? 0 : this.core.lfoFree[k]; this.lfoSH[k] = this.rand() * 2 - 1; }
      this.age = 0;
    }
    if (freshPhases) {
      for (let o = 0; o < P.oscs.length; o++) {
        const O = P.oscs[o];
        for (let u = 0; u < O.count; u++) { const k = o * MAX_UNI + u; const ph = O.phaseRand ? this.rand() : 0; this.phase[k] = ph; this.tri[k] = ph < 0.5 ? -1 + 4 * ph : 3 - 4 * ph; }
        this.hpL[o] = 0; this.hpR[o] = 0;
      }
      this.subPhase = 0; this.subTri = -1;
    }
    this.state = 1; this.fade = -1; this.start = this.core.clock;
  }
  release() { if (this.state === 1) { this.state = 2; this.amp.st = 4; this.fenv.st = 4; this.menv.st = 4; } }
  kill() { this.state = 0; this.fade = -1; this.amp.v = 0; this.amp.st = 0; }
  stealFade() { this.fade = 1; this.state = 2; }

  // ctrl レート用 (16 サンプル分まとめて進める)
  stepEnvCtrl(e, C, len) {
    switch (e.st) {
      case 1: e.v += (ATT_TARGET - e.v) * (1 - Math.pow(1 - C.a, len)); if (e.v >= 1) { e.v = 1; e.st = 2; } break;
      case 2: e.v += (C.s - e.v) * (1 - Math.pow(1 - C.d, len)); break;
      case 4: e.v += (0 - e.v) * (1 - Math.pow(1 - C.r, len)); if (e.v < 1e-5) { e.v = 0; e.st = 0; } break;
    }
    return e.v;
  }

  lfo(k, len) {
    const L = this.core.P.lfo[k]; if (L.target === T_NONE) { this.lfoOut[k] = 0; this.lfoDepthEff[k] = 0; return; }
    const rate = k === 0 ? this.core.lfo1Rate : L.rateHz;
    let p = this.lfoPhase[k] + rate * len / this.core.fs;
    if (p >= 1) { p -= Math.floor(p); this.lfoSH[k] = this.rand() * 2 - 1; }
    this.lfoPhase[k] = p;
    let y;
    switch (L.wave) {
      case 0: y = Math.sin(TWO_PI * p); break;
      case 1: y = 1 - 4 * Math.abs(p - 0.5); break;
      case 2: y = 1 - 2 * p; break;
      case 3: y = p < 0.5 ? 1 : -1; break;
      default: y = this.lfoSH[k];
    }
    const depth = k === 0 ? this.core.kLfoDepth : L.depth;
    const fade = L.fadeIn > 0 ? Math.min(1, this.age / (L.fadeIn * this.core.fs)) : 1;
    this.lfoOut[k] = y * depth * fade; this.lfoDepthEff[k] = depth * fade;
  }

  // v = LFO 出力 (wave × depth), d = 実効 depth。pitch は depth² で細かいビブラートを出しやすく、
  // amp は 1-depth..1 のトレモロ。結果は this.mod = [cutoff oct, pitch semi, amp gain, pan, pw, morph]
  applyMod(t, v, d, isEnv) {
    const M = this.mod;
    switch (t) {
      case T_CUTOFF: M[0] += v * 4; break;
      case T_PITCH: M[1] += isEnv ? v * 12 : v * d * 12; break;
      case T_AMP: M[2] *= isEnv ? 1 - 0.5 * v : 1 - 0.5 * (d - v); break;
      case T_PAN: M[3] += v; break;
      case T_PW: M[4] += v * 0.45; break;
      case T_MORPH: M[5] += v * 0.5; break;
    }
  }

  // [pos, pos+len) を outL/outR に加算
  render(outL, outR, pos, len) {
    const core = this.core, P = core.P, fs = core.fs;
    const bL = this.bufL, bR = this.bufR;
    for (let done = 0; done < len;) {
      const n = Math.min(CTRL, len - done), at = pos + done;
      // ── control-rate ──
      const fenv = this.stepEnvCtrl(this.fenv, core.fenvC, n);
      const menv = this.stepEnvCtrl(this.menv, core.menvC, n);
      this.lfo(0, n); this.lfo(1, n);
      const l1 = this.lfoOut[0], l2 = this.lfoOut[1], L1 = P.lfo[0], L2 = P.lfo[1], ME = P.modEnv;
      const M = this.mod; M[0] = 0; M[1] = 0; M[2] = 1; M[3] = 0; M[4] = 0; M[5] = 0;
      this.applyMod(L1.target, l1, this.lfoDepthEff[0], false); this.applyMod(L2.target, l2, this.lfoDepthEff[1], false); this.applyMod(ME.target, menv * ME.amount, 0, true);
      const cutMod = M[0], pitchMod = M[1], ampMod = M[2], panMod = M[3], pwMod = M[4], morphMod = M[5];
      // glide
      if (P.voice.glide > 0 && this.pitch !== this.targetPitch) {
        this.pitch += (this.targetPitch - this.pitch) * (1 - Math.exp(-n / (fs * P.voice.glide / 4)));
        if (Math.abs(this.pitch - this.targetPitch) < 1e-3) this.pitch = this.targetPitch;
      }
      const f0 = 440 * Math.pow(2, (this.pitch + pitchMod - 69) / 12);
      // ── oscillators → bL/bR ──
      bL.fill(0, 0, n); if (P.stereo) bR.fill(0, 0, n);
      for (let o = 0; o < P.oscs.length; o++) {
        const O = P.oscs[o]; if (O.level <= 0) continue;
        const fo = f0 * O.ratio;
        if (O.wave === W_SUPER) { this.renderSupersaw(O, o, fo, n); continue; }
        const pw = Math.max(0.05, Math.min(0.95, O.pw + pwMod));
        const morph = Math.max(0, Math.min(1, O.morph + morphMod));
        for (let u = 0; u < O.count; u++) {
          const k = o * MAX_UNI + u, inc = Math.min(0.49, fo * O.pRatio[u] / fs);
          const gL = O.pGL[u] * O.level, gR = O.pGR[u] * O.level;
          this.renderPartial(O.wave, O.table, k, inc, n, gL, gR, pw, morph, P.stereo);
        }
      }
      // sub
      if (P.sub.level > 0) {
        const inc = Math.min(0.49, f0 * P.sub.ratio / fs), g = P.sub.level; let p = this.subPhase, tri = this.subTri;
        for (let i = 0; i < n; i++) {
          let y;
          if (P.sub.wave === W_SINE) y = Math.sin(TWO_PI * p);
          else { y = (p < 0.5 ? 1 : -1) + polyblep(p, inc) - polyblep((p + 0.5) % 1, inc); if (P.sub.wave === W_TRI) { tri = tri * 0.9998 + y * 4 * inc; y = tri; } }
          bL[i] += y * g; if (P.stereo) bR[i] += y * g;
          p += inc; if (p >= 1) p -= 1;
        }
        this.subPhase = p; this.subTri = tri;
      }
      // noise
      if (P.noise.level > 0 && this.noiseEnv > 1e-4) {
        const g = P.noise.level, dec = P.noise.decayCoef, pk = this.pink; let e = this.noiseEnv;
        for (let i = 0; i < n; i++) {
          let w = this.rand() * 2 - 1;
          if (P.noise.pink) { pk[0] = 0.99765 * pk[0] + w * 0.0990460; pk[1] = 0.96300 * pk[1] + w * 0.2965164; pk[2] = 0.57000 * pk[2] + w * 1.0526913; w = (pk[0] + pk[1] + pk[2] + w * 0.1848) * 0.25; }
          const y = w * g * e; bL[i] += y; if (P.stereo) bR[i] += y;
          e *= dec;
        }
        this.noiseEnv = e;
      }
      // ── filter ──
      const F = P.filter;
      if (F.model !== F_OFF) {
        let oct = core.cutOct + F.keyTrack * (this.note - 60) / 12 + core.envAmt * fenv + cutMod + this.velCutOct;
        let fc = Math.pow(2, oct);
        fc = Math.max(20, Math.min(fc, 20000, fs * 0.45));
        const res = core.kRes;
        if (F.model === F_LADDER) {
          const g = Math.tan(Math.PI * fc / (2 * fs)), G = g / (1 + g);
          const k = 4 * res + (res > 0.9 ? (res - 0.9) * 2.5 : 0);
          const dg = 1 + F.drive * 8, ig = 0.5 * (1 + 0.3 * k) * dg, og = 2 / Math.sqrt(dg);
          ladder(this.fL, bL, n, G, k, ig, og); if (P.stereo) ladder(this.fR, bR, n, G, k, ig, og);
        } else {
          const g = Math.tan(Math.PI * fc / fs), kk = 2 - 1.98 * res;
          const dg = F.drive > 0 ? 1 + F.drive * 8 : 0;
          svf(this.fL, bL, n, g, kk, F.model, dg); if (P.stereo) svf(this.fR, bR, n, g, kk, F.model, dg);
        }
      }
      // ── drive (post filter, 2x OS) ──
      if (core.kDrive > 0.002) {
        drive(this.dL, bL, n, core.kDrive, P.drive.asym, core.driveBq); if (P.stereo) drive(this.dR, bR, n, core.kDrive, P.drive.asym, core.driveBq);
      }
      // ── amp / pan ──
      const pan = Math.max(-1, Math.min(1, panMod));
      const a = (pan + 1) * Math.PI / 4;
      const base = this.velGain * ampMod * core.voiceGain;
      const gL = Math.cos(a) * base * 1.41421356, gR = Math.sin(a) * base * 1.41421356;
      const A = this.amp, C = core.ampC;
      const src = P.stereo ? bR : bL;
      let v = A.v, st = A.st, fade = this.fade;
      for (let i = 0; i < n; i++) {
        if (st === 1) { v += (ATT_TARGET - v) * C.a; if (v >= 1) { v = 1; st = 2; } }
        else if (st === 2) v += (C.s - v) * C.d;
        else if (st === 4) { v += -v * C.r; if (v < 1e-5) { v = 0; st = 0; } }
        let g = v;
        if (fade >= 0) { g *= fade; fade -= core.fadeStep; if (fade < 0) { fade = -1; st = 0; v = 0; } }
        outL[at + i] += bL[i] * g * gL; outR[at + i] += src[i] * g * gR;
      }
      A.v = v; A.st = st; this.fade = fade;
      this.age += n;
      if (st === 0) { this.kill(); return; }
      done += n;
    }
  }

  renderPartial(wave, table, k, inc, n, gL, gR, pw, morph, stereo) {
    const ph = this.phase, bL = this.bufL, bR = this.bufR; let p = ph[k];
    switch (wave) {
      case W_SAW:
        for (let i = 0; i < n; i++) { const y = 2 * p - 1 - polyblep(p, inc); bL[i] += y * gL; if (stereo) bR[i] += y * gR; p += inc; if (p >= 1) p -= 1; }
        break;
      case W_SQUARE: case W_PULSE: {
        const w = wave === W_SQUARE ? 0.5 : pw, dc = 2 * w - 1;
        for (let i = 0; i < n; i++) { let t2 = p - w; if (t2 < 0) t2 += 1; const y = (p < w ? 1 : -1) + polyblep(p, inc) - polyblep(t2, inc) - dc; bL[i] += y * gL; if (stereo) bR[i] += y * gR; p += inc; if (p >= 1) p -= 1; }
        break;
      }
      case W_TRI: {
        let tri = this.tri[k]; const s = 4 * inc;
        for (let i = 0; i < n; i++) { let t2 = p - 0.5; if (t2 < 0) t2 += 1; const sq = (p < 0.5 ? 1 : -1) + polyblep(p, inc) - polyblep(t2, inc); tri = tri * 0.9998 + sq * s; bL[i] += tri * gL; if (stereo) bR[i] += tri * gR; p += inc; if (p >= 1) p -= 1; }
        this.tri[k] = tri; break;
      }
      case W_SINE:
        for (let i = 0; i < n; i++) { const y = Math.sin(TWO_PI * p); bL[i] += y * gL; if (stereo) bR[i] += y * gR; p += inc; if (p >= 1) p -= 1; }
        break;
      case W_WT: {
        const d = table.data, nf = table.frames;
        const maxH = 0.5 / inc; let lv = 0; while (lv < WT_LEVELS - 1 && (WT_MAXH >> lv) > maxH) lv++;
        const fpos = morph * (nf - 1), f0 = Math.min(nf - 1, Math.floor(fpos)), f1 = Math.min(nf - 1, f0 + 1), ff = fpos - f0;
        const b0 = (f0 * WT_LEVELS + lv) * WT_SIZE, b1 = (f1 * WT_LEVELS + lv) * WT_SIZE;
        for (let i = 0; i < n; i++) {
          const x = p * WT_SIZE, i0 = x | 0, fr = x - i0, i1 = (i0 + 1) & WT_MASK;
          const y0 = d[b0 + i0] + (d[b0 + i1] - d[b0 + i0]) * fr;
          const y = ff > 0 ? y0 + ((d[b1 + i0] + (d[b1 + i1] - d[b1 + i0]) * fr) - y0) * ff : y0;
          bL[i] += y * gL; if (stereo) bR[i] += y * gR; p += inc; if (p >= 1) p -= 1;
        }
        break;
      }
    }
    ph[k] = p;
  }

  renderSupersaw(O, o, fo, n) {
    const fs = this.core.fs, ph = this.phase, bL = this.bufL, bR = this.bufR, st = this.core.P.stereo;
    const tL = this.core.tmpL, tR = this.core.tmpR; tL.fill(0, 0, n); tR.fill(0, 0, n);
    for (let u = 0; u < 7; u++) {
      const k = o * MAX_UNI + u, inc = Math.min(0.49, fo * O.pRatio[u] / fs), gL = O.pGL[u], gR = O.pGR[u]; let p = ph[k];
      for (let i = 0; i < n; i++) { const y = 2 * p - 1 - polyblep(p, inc); tL[i] += y * gL; tR[i] += y * gR; p += inc; if (p >= 1) p -= 1; }
      ph[k] = p;
    }
    // HPF at the fundamental (JP-8000 らしさ: 低域の濁りを取る)
    const c = 1 - Math.exp(-TWO_PI * Math.min(fo, fs * 0.2) / fs); let lpL = this.hpL[o], lpR = this.hpR[o]; const g = O.level;
    for (let i = 0; i < n; i++) { lpL += (tL[i] - lpL) * c; bL[i] += (tL[i] - lpL) * g; if (st) { lpR += (tR[i] - lpR) * c; bR[i] += (tR[i] - lpR) * g; } }
    this.hpL[o] = lpL; this.hpR[o] = lpR;
  }
}

// ───────────── filters ─────────────
// TPT ladder, feedback path tanh, 2x oversampled. st: [s1,s2,s3,s4,y4,prevIn]
function ladder(st, buf, n, G, k, ig, og) {
  const a = 1 - G, G2 = G * G, G3 = G2 * G, G4 = G3 * G, den = 1 / (1 + k * G4);
  let s1 = st[0], s2 = st[1], s3 = st[2], s4 = st[3], xp = st[5], y = 0;
  for (let i = 0; i < n; i++) {
    const x = buf[i] * ig, xm = 0.5 * (xp + x); xp = x;
    for (let pass = 0; pass < 2; pass++) {
      const inp = pass === 0 ? xm : x;
      const S = a * (G3 * s1 + G2 * s2 + G * s3 + s4);
      const y4e = (G4 * inp + S) * den;
      let u = ftanh(inp - k * y4e), v;
      v = G * (u - s1); u = v + s1; s1 = u + v;
      v = G * (u - s2); u = v + s2; s2 = u + v;
      v = G * (u - s3); u = v + s3; s3 = u + v;
      v = G * (u - s4); u = v + s4; s4 = u + v;
      y = u;
    }
    buf[i] = y * og;
  }
  st[0] = s1; st[1] = s2; st[2] = s3; st[3] = s4; st[4] = y; st[5] = xp;
}
// Zavalishin TPT SVF. st: [ic1eq, ic2eq]
function svf(st, buf, n, g, k, mode, dg) {
  const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
  let ic1 = st[0], ic2 = st[1];
  const comp = mode === F_BP ? Math.min(2, k) : 1;
  for (let i = 0; i < n; i++) {
    let x = buf[i]; if (dg) x = 2 * ftanh(x * dg * 0.5);
    const v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    buf[i] = mode === F_LP ? v2 : mode === F_BP ? v1 * comp : x - k * v1 - v2;
  }
  st[0] = ic1; st[1] = ic2;
}
// waveshaper 2x OS + biquad LP + DC blocker. st: [z1, z2, dcx, dcy, prevIn]
function drive(st, buf, n, amt, asym, bq) {
  const pre = 1 + amt * 15, mk = 1 / (1 + amt * 2.5), bias = asym * 0.6 * amt, off = ftanh(bias);
  const b0 = bq[0], b1 = bq[1], b2 = bq[2], a1 = bq[3], a2 = bq[4], dcR = bq[5];
  let z1 = st[0], z2 = st[1], dx = st[2], dy = st[3], xp = st[4];
  for (let i = 0; i < n; i++) {
    const x = buf[i], xm = 0.5 * (xp + x); xp = x;
    let y = 0;
    for (let pass = 0; pass < 2; pass++) {
      const s = (ftanh((pass ? x : xm) * pre + bias) - off) * mk;
      y = b0 * s + z1; z1 = b1 * s - a1 * y + z2; z2 = b2 * s - a2 * y;   // transposed direct form II
    }
    const out = y - dx + dcR * dy; dx = y; dy = out;
    buf[i] = out;
  }
  st[0] = z1; st[1] = z2; st[2] = dx; st[3] = dy; st[4] = xp;
}

// ───────────── core ─────────────
class SynthCore {
  constructor(sampleRate = 48000) {
    this.fs = sampleRate;
    this.clock = 0;
    this.voices = []; for (let i = 0; i < POOL; i++) this.voices.push(new Voice(this));
    this.events = [];             // {t:0 on|1 off|2 all, off, p, v}
    this.heldMono = [];
    this.lastPitch = null;
    this.tempo = 120;
    this.knob = { cutoff: 0.5, resonance: 0.2, envAmount: 0.2, lfoRate: 0.5, lfoDepth: 0, drive: 0, delay: 0, reverb: 0 };
    this.sm = { cutoff: 0.5, resonance: 0.2, envAmount: 0.2, lfoRate: 0.5, lfoDepth: 0, drive: 0 };
    this.voiceGain = 0.26;
    this.fadeStep = 1 / (0.001 * sampleRate);
    this.lfoFree = new Float64Array(2);
    this.tmpL = new Float32Array(CTRL); this.tmpR = new Float32Array(CTRL);
    this.cap = 0; this.mixL = null; this.mixR = null; this.ensure(128);
    this.dcL = new Float64Array(2); this.dcR = new Float64Array(2);
    this.dcCoef = 1 - TWO_PI * 5 / sampleRate;
    // drive 用 2x OS ローパス (Butterworth, fc = 0.42 fs @ 2fs) + DC blocker 係数
    { const w0 = Math.PI * 0.42 / 2, cs = Math.cos(w0), sn = Math.sin(w0), al = sn / (2 * 0.7071), a0 = 1 + al; this.driveBq = new Float64Array([(1 - cs) / 2 / a0, (1 - cs) / a0, (1 - cs) / 2 / a0, -2 * cs / a0, (1 - al) / a0, 1 - TWO_PI * 10 / sampleRate]); }
    this.P = null;
    this.setPatch(DEFAULT_CORE_PATCH);
  }
  ensure(n) { if (n > this.cap) { this.cap = n; this.mixL = new Float32Array(n); this.mixR = new Float32Array(n); } }
  setTempo(bpm) { this.tempo = Math.max(20, Math.min(300, +bpm || 120)); }
  setKnob(id, v) { if (id in this.knob) this.knob[id] = clamp01(v); }
  getKnob(id) { return this.knob[id]; }

  setPatch(p) {
    const fs = this.fs;
    const oscs = [];
    let stereo = false;
    for (const o of (p.osc ?? []).slice(0, MAX_OSC)) {
      const wave = waveCode(o.wave);
      const O = { wave, table: wave === W_WT ? getWavetable(String(o.wave).slice(3)) : null, level: +o.level || 0, pw: o.pw ?? 0.5, morph: o.morph ?? 0, phaseRand: wave === W_SUPER ? true : !!o.phaseRand,
        ratio: Math.pow(2, ((o.octave | 0) * 12 + (o.semi | 0) + (+o.detune || 0) / 100) / 12), count: 1, pRatio: new Float32Array(MAX_UNI), pGL: new Float32Array(MAX_UNI), pGR: new Float32Array(MAX_UNI) };
      const width = Math.max(0, Math.min(1, o.width ?? 0.5));
      if (wave === W_SUPER) {
        O.count = 7; const x = Math.max(0, Math.min(1, (o.spread ?? 50) / 100)), det = ssDetune(x), cg = ssCenter(x) * 0.6, sg = ssSide(x) * 0.6;
        for (let u = 0; u < 7; u++) { O.pRatio[u] = 1 + SS_OFF[u] * det; const pan = (u / 6 - 0.5) * 2 * width * (u % 2 ? 1 : -1); const a = (pan + 1) * Math.PI / 4; const g = u === 3 ? cg : sg; O.pGL[u] = Math.cos(a) * g * 1.414; O.pGR[u] = Math.sin(a) * g * 1.414; }
        if (width > 0) stereo = true;
      } else {
        const cnt = Math.max(1, Math.min(MAX_UNI, o.unison | 0)); O.count = cnt; const spread = +o.spread || 0; const g = 1 / Math.pow(cnt, 0.6);
        for (let u = 0; u < cnt; u++) {
          const t = cnt === 1 ? 0 : (u / (cnt - 1) - 0.5) * 2;
          O.pRatio[u] = Math.pow(2, t * spread / 1200);
          const pan = cnt === 1 ? 0 : t * width * (u % 2 ? -1 : 1);
          const a = (pan + 1) * Math.PI / 4; O.pGL[u] = Math.cos(a) * g * 1.414; O.pGR[u] = Math.sin(a) * g * 1.414;
        }
        if (cnt > 1 && width > 0) stereo = true;
      }
      oscs.push(O);
    }
    const sub = p.sub ?? {}, noise = p.noise ?? {}, f = p.filter ?? {};
    const lfo = [p.lfo1 ?? {}, p.lfo2 ?? {}].map((L) => ({ wave: LFO_W[L.wave] ?? 0, rateHz: +L.rate || 5, sync: !!L.sync, division: L.division ?? "1/4", depth: +L.depth || 0, target: targetCode(L.target), fadeIn: +L.fadeIn || 0, retrig: L.retrig !== false }));
    const me = p.modEnv ?? {};
    this.P = {
      oscs, stereo,
      sub: { wave: waveCode(sub.wave ?? "sine"), ratio: (sub.octave | 0) <= -2 ? 0.25 : 0.5, level: +sub.level || 0 },
      noise: { pink: noise.color === "pink", level: +noise.level || 0, decayCoef: Math.exp(-4.6 / (Math.max(0.005, +noise.decay || 0.1) * fs)) },
      filter: { model: filterCode(f.model), cutoff: +f.cutoff || 2000, resonance: +f.resonance || 0, envSign: (+f.envAmount || 0) < 0 ? -1 : 1, keyTrack: +f.keyTrack || 0, velAmount: +f.velAmount || 0, drive: +f.drive || 0 },
      modEnv: { target: targetCode(me.target), amount: +me.amount || 0 },
      lfo, voice: { mono: !!p.voice?.mono, legato: !!p.voice?.legato, glide: +p.voice?.glide || 0 },
      drive: { asym: +p.drive?.asym || 0 },
    };
    this.ampC = envCoefs(p.ampEnv ?? { a: 0.01, d: 0.2, s: 0.7, r: 0.2 }, fs, 1);
    this.fenvC = envCoefs(p.filterEnv ?? { a: 0.01, d: 0.2, s: 0.5, r: 0.2 }, fs, 1);
    this.menvC = envCoefs(me.a != null ? me : { a: 0.01, d: 0.2, s: 0, r: 0.2 }, fs, 1);
    // ノブ初期値 = パッチの値 (main thread も同じ値を AudioParam に入れる)
    const kd = knobDefaultsFromPatch(p);
    for (const id of KNOB_IDS) { this.knob[id] = kd[id]; if (id in this.sm) this.sm[id] = kd[id]; }
    this.updateDerived(1);
  }
  updateDerived(coef) {
    const s = this.sm, k = this.knob;
    for (const id in s) s[id] += (k[id] - s[id]) * coef;
    this.cutOct = Math.log2(knobToCutoff(s.cutoff));
    this.kRes = s.resonance;
    this.envAmt = s.envAmount * ENV_OCTAVES * this.P.filter.envSign;
    this.kLfoDepth = s.lfoDepth;
    this.kDrive = s.drive;
    const L1 = this.P.lfo[0];
    this.lfo1Rate = L1.sync ? (this.tempo / 60) / divisionBeats(knobToDivision(s.lfoRate)) : knobToLfoRate(s.lfoRate);
    for (let i = 0; i < 2; i++) { const L = this.P.lfo[i]; if (L.sync && i === 1) L.rateHz = (this.tempo / 60) / divisionBeats(L.division); }
  }

  // ───── events (sampleOffset はこのブロック内) ─────
  noteOn(pitch, vel, sampleOffset = 0) { this.events.push({ t: 0, off: sampleOffset | 0, p: pitch | 0, v: Math.max(1, Math.min(127, vel | 0)) }); }
  noteOff(pitch, sampleOffset = 0) { this.events.push({ t: 1, off: sampleOffset | 0, p: pitch | 0, v: 0 }); }
  allNotesOff(sampleOffset = 0) { this.events.push({ t: 2, off: sampleOffset | 0, p: 0, v: 0 }); }

  activeCount() { let c = 0; for (const v of this.voices) if (v.state !== 0 && v.fade < 0) c++; return c; }
  allocVoice() {
    for (const v of this.voices) if (v.state === 0) { if (this.activeCount() < MAX_VOICES) return v; break; }
    // steal: 最も古い released → 最も静か
    let victim = null;
    for (const v of this.voices) { if (v.state === 2 && v.fade < 0 && (!victim || v.start < victim.start)) victim = v; }
    if (!victim) for (const v of this.voices) { if (v.state !== 0 && v.fade < 0 && (!victim || v.loudness() < victim.loudness() || (v.loudness() === victim.loudness() && v.start < victim.start))) victim = v; }
    let spare = null; for (const v of this.voices) if (v.state === 0) { spare = v; break; }
    if (spare && victim) { victim.stealFade(); return spare; }
    return victim ?? this.voices[0];   // 予備が無い: その場で再スタート (attack は現在値から)
  }
  doNoteOn(p, vel) {
    const P = this.P;
    if (P.voice.mono) {
      const held = this.heldMono; const wasHeld = held.length > 0; held.push(p);
      let v = this.voices[0];
      const playing = v.state === 1;
      if (playing && P.voice.legato && wasHeld) { v.targetPitch = p; v.note = p; if (P.voice.glide <= 0) v.pitch = p; }
      else v.start_(p, vel, v.state !== 0 ? v.pitch : this.lastPitch, true, v.state === 0);
      this.lastPitch = p; return;
    }
    const v = this.allocVoice();
    const fresh = v.state === 0;
    v.start_(p, vel, fresh ? this.lastPitch : v.pitch, true, fresh);
    this.lastPitch = p;
  }
  doNoteOff(p) {
    const P = this.P;
    if (P.voice.mono) {
      const held = this.heldMono, i = held.lastIndexOf(p); if (i >= 0) held.splice(i, 1);
      const v = this.voices[0];
      if (v.note === p && v.state === 1) {
        if (held.length) { const back = held[held.length - 1]; if (P.voice.legato) { v.targetPitch = back; v.note = back; if (P.voice.glide <= 0) v.pitch = back; } else v.start_(back, v.vel, v.pitch, true, false); }
        else v.release();
      }
      return;
    }
    for (const v of this.voices) if (v.state === 1 && v.note === p) v.release();
  }
  doAllOff() { this.heldMono.length = 0; for (const v of this.voices) v.release(); }

  // ───── render ─────
  process(outL, outR, n) {
    this.ensure(n);
    const mixL = this.mixL, mixR = this.mixR;
    mixL.fill(0, 0, n); mixR.fill(0, 0, n);
    this.updateDerived(1 - Math.exp(-n / (0.005 * this.fs)));
    for (let k = 0; k < 2; k++) { const r = k === 0 ? this.lfo1Rate : this.P.lfo[k].rateHz; this.lfoFree[k] = (this.lfoFree[k] + r * n / this.fs) % 1; }
    const ev = this.events;
    if (ev.length > 1) ev.sort((a, b) => a.off - b.off);
    let pos = 0, ei = 0;
    while (pos < n) {
      while (ei < ev.length && ev[ei].off <= pos) { const e = ev[ei++]; if (e.t === 0) this.doNoteOn(e.p, e.v); else if (e.t === 1) this.doNoteOff(e.p); else this.doAllOff(); }
      const next = ei < ev.length ? Math.min(n, Math.max(pos + 1, ev[ei].off)) : n;
      const len = next - pos;
      for (const v of this.voices) if (v.state !== 0) v.render(mixL, mixR, pos, len);
      pos = next;
    }
    while (ei < ev.length) { const e = ev[ei++]; if (e.t === 0) this.doNoteOn(e.p, e.v); else if (e.t === 1) this.doNoteOff(e.p); else this.doAllOff(); }
    ev.length = 0;
    // master: DC blocker + soft limiter
    const dc = this.dcCoef, dL = this.dcL, dR = this.dcR;
    let xl = dL[0], yl = dL[1], xr = dR[0], yr = dR[1];
    for (let i = 0; i < n; i++) {
      let l = mixL[i], r = mixR[i];
      const ol = l - xl + dc * yl; xl = l; yl = ol; const or = r - xr + dc * yr; xr = r; yr = or;
      outL[i] = lim(ol); outR[i] = lim(or);
    }
    dL[0] = xl; dL[1] = yl; dR[0] = xr; dR[1] = yr;
    this.clock += n;
  }
}
function lim(x) { const a = x < 0 ? -x : x; if (a <= 0.8) return x; const y = 0.8 + 0.17 * ftanh((a - 0.8) / 0.17); return x < 0 ? -y : y; }

// ノブ初期値をパッチから (synth2.js の knobDefaults と同じ定義)
function knobDefaultsFromPatch(p) {
  const f = p.filter ?? {}, l1 = p.lfo1 ?? {};
  return {
    cutoff: cutoffToKnob(+f.cutoff || 2000),
    resonance: clamp01(f.resonance ?? 0.2),
    envAmount: clamp01(Math.abs(+f.envAmount || 0) / ENV_OCTAVES),
    lfoRate: l1.sync ? divisionToKnob(l1.division ?? "1/4") : lfoRateToKnob(+l1.rate || 5),
    lfoDepth: clamp01(l1.depth ?? 0),
    drive: clamp01(p.drive?.amount ?? 0),
    delay: clamp01(p.fx?.delay?.mix ?? 0),
    reverb: clamp01(p.fx?.reverb?.mix ?? 0),
  };
}

const DEFAULT_CORE_PATCH = {
  osc: [{ wave: "saw", pw: 0.5, morph: 0, octave: 0, semi: 0, detune: 0, level: 0.8, unison: 1, spread: 0, width: 0.5, phaseRand: true }],
  sub: { wave: "sine", octave: -1, level: 0 }, noise: { color: "white", level: 0, decay: 0.1 },
  filter: { model: "ladder", cutoff: 2000, resonance: 0.2, envAmount: 1, keyTrack: 0.5, velAmount: 0.3, drive: 0 },
  ampEnv: { a: 0.005, d: 0.2, s: 0.7, r: 0.2 }, filterEnv: { a: 0.005, d: 0.3, s: 0.3, r: 0.2 },
  modEnv: { a: 0.01, d: 0.2, s: 0, r: 0.2, target: "none", amount: 0 },
  lfo1: { wave: "sine", rate: 5, sync: false, division: "1/4", depth: 0, target: "none", fadeIn: 0, retrig: true },
  lfo2: { wave: "sine", rate: 1, sync: false, division: "1/4", depth: 0, target: "none", fadeIn: 0, retrig: true },
  voice: { mono: false, legato: false, glide: 0 }, drive: { amount: 0, asym: 0 },
  fx: { chorus: { mix: 0, rate: 0.8, depth: 0.3 }, delay: { mix: 0, time: 0.75, feedback: 0.3, tone: 4000, pingpong: true }, reverb: { mix: 0, decay: 1.5, damp: 0.5, preDelay: 0.02 } },
  level: -10,
};


/* ───── processor ───── */
// ═══════════ AudioWorkletProcessor "vesper-synth2" ═══════════
// main thread から {type:"patch"|"noteOn"|"noteOff"|"allOff"|"tempo"} を受け取り、
// 絶対時刻 t (AudioContext 秒) をサンプルオフセットに変換して SynthCore に渡す。
// 6 つの k-rate AudioParam (0..1) を毎ブロック core.setKnob に流す。

const PARAMS = ["cutoff", "resonance", "envAmount", "lfoRate", "lfoDepth", "drive"];

class VesperSynth2 extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return PARAMS.map((name) => ({ name, defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" }));
  }
  constructor() {
    super();
    this.core = new SynthCore(sampleRate);
    this.queue = [];          // {t, kind, p, v} 時刻順
    this.port.onmessage = (e) => this.onMessage(e.data);
  }
  push(ev) {
    const q = this.queue; let i = q.length;
    while (i > 0 && q[i - 1].t > ev.t) i--;   // 安定挿入 (同時刻は到着順)
    q.splice(i, 0, ev);
  }
  onMessage(m) {
    if (!m) return;
    switch (m.type) {
      case "patch": this.core.setPatch(m.patch); break;
      case "tempo": this.push({ t: +m.t || 0, kind: 3, bpm: m.bpm }); break;
      case "noteOn": {
        const t = +m.t || 0, p = m.p | 0, v = m.v ?? 100;
        this.push({ t, kind: 0, p, v });
        if (m.dur != null && m.dur > 0) this.push({ t: t + m.dur, kind: 1, p, v: 0 });
        break;
      }
      case "noteOff": this.push({ t: +m.t || 0, kind: 1, p: m.p | 0, v: 0 }); break;
      case "allOff": this.queue.length = 0; this.push({ t: +m.t || 0, kind: 2, p: 0, v: 0 }); break;
      case "dispose": this.queue.length = 0; this.disposed = true; break;
    }
  }
  process(inputs, outputs, parameters) {
    if (this.disposed) return false;
    const out = outputs[0]; if (!out || out.length < 1) return true;
    const L = out[0], R = out[1] ?? out[0], n = L.length;
    const core = this.core;
    for (const name of PARAMS) { const a = parameters[name]; if (a && a.length) core.setKnob(name, a[0]); }
    // 時刻 → サンプルオフセット。過ぎた分は 0 で鳴らす
    const t0 = currentTime, fs = sampleRate, tEnd = t0 + n / fs;
    const q = this.queue;
    while (q.length && q[0].t < tEnd) {
      const e = q.shift();
      const off = Math.max(0, Math.min(n - 1, Math.round((e.t - t0) * fs)));
      if (e.kind === 0) core.noteOn(e.p, e.v, off); else if (e.kind === 1) core.noteOff(e.p, off); else if (e.kind === 3) core.setTempo(e.bpm); else core.allNotesOff(off);
    }
    core.process(L, R, n);
    return true;
  }
}
registerProcessor("vesper-synth2", VesperSynth2);
