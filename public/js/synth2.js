// ═══════════ VESPER SYNTH2 — main-thread wrapper / presets / schema ═══════════
// 音の本体は public/js/synthcore.js (AudioWorklet "vesper-synth2" の中で動く)。
// ここは: パッチ形式の定義 (normalizePatch2 が正)、JSON Schema、プリセット、
//         Web Audio の FX チェーン (chorus → delay → reverb → level) と 8 ノブの自動化。
// import 時に Web Audio / DOM に触らない (server.js から prompts 経由で読まれても安全)。
import { makeImpulse } from "./ir.js";
import { knobToCutoff, cutoffToKnob, knobToLfoRate, lfoRateToKnob, knobToDivision, divisionToKnob, divisionBeats, knobDefaultsFromPatch, LFO_DIVISIONS, ENV_OCTAVES } from "./synthcore.js";

export const KNOBS = [
  { id: "cutoff", label: "CUTOFF" }, { id: "resonance", label: "RESO" }, { id: "envAmount", label: "ENV" }, { id: "lfoRate", label: "LFO RATE" },
  { id: "lfoDepth", label: "LFO DEPTH" }, { id: "drive", label: "DRIVE" }, { id: "delay", label: "DELAY" }, { id: "reverb", label: "REVERB" },
];
export { knobToCutoff, cutoffToKnob, knobToLfoRate, lfoRateToKnob, knobToDivision, divisionToKnob, LFO_DIVISIONS, ENV_OCTAVES };

export const OSC_WAVES = ["saw", "square", "pulse", "triangle", "sine", "supersaw", "wt:organ", "wt:bell", "wt:vocal", "wt:digital", "wt:pwm"];
export const SUB_WAVES = ["sine", "square", "triangle"];
export const FILTER_MODELS = ["ladder", "svf-lp", "svf-bp", "svf-hp", "off"];
export const LFO_WAVES = ["sine", "tri", "saw", "square", "sh"];
export const LFO_TARGETS = ["none", "cutoff", "pitch", "amp", "pan", "pw", "morph"];
export const MODENV_TARGETS = ["none", "cutoff", "pitch", "morph", "pw"];
export const DIVISIONS = LFO_DIVISIONS.map((d) => d[0]);

/* ─────────── normalize (パッチ形式の正) ─────────── */
const num = (x, lo, hi, d) => (Number.isFinite(+x) ? Math.max(lo, Math.min(hi, +x)) : d);
const pick = (x, list, d) => (list.includes(x) ? x : d);
const env = (e, d) => ({ a: num(e?.a, 0.001, 20, d.a), d: num(e?.d, 0.001, 20, d.d), s: num(e?.s, 0, 1, d.s), r: num(e?.r, 0.005, 30, d.r) });
function oscN(o, i) {
  o = o && typeof o === "object" ? o : {};
  return {
    wave: pick(o.wave, OSC_WAVES, "saw"), pw: num(o.pw, 0.05, 0.95, 0.5), morph: num(o.morph, 0, 1, 0),
    octave: Math.round(num(o.octave, -3, 3, 0)), semi: Math.round(num(o.semi, -24, 24, 0)), detune: num(o.detune, -100, 100, 0),
    level: num(o.level, 0, 1, i === 0 ? 0.8 : 0), unison: Math.round(num(o.unison, 1, 7, 1)), spread: num(o.spread, 0, 100, 0),
    width: num(o.width, 0, 1, 0.5), phaseRand: o.phaseRand == null ? true : !!o.phaseRand,
  };
}
function lfoN(l, d) {
  l = l && typeof l === "object" ? l : {};
  return { wave: pick(l.wave, LFO_WAVES, "sine"), rate: num(l.rate, 0.05, 20, d.rate), sync: !!l.sync, division: pick(l.division, DIVISIONS, "1/4"),
    depth: num(l.depth, 0, 1, 0), target: pick(l.target, LFO_TARGETS, "none"), fadeIn: num(l.fadeIn, 0, 10, 0), retrig: l.retrig == null ? true : !!l.retrig };
}
export function normalizePatch2(p) {
  p = p && typeof p === "object" ? p : {};
  const oscIn = Array.isArray(p.osc) && p.osc.length ? p.osc.slice(0, 3) : [{}];
  const f = p.filter ?? {}, s = p.sub ?? {}, n = p.noise ?? {}, me = p.modEnv ?? {}, v = p.voice ?? {}, dr = p.drive ?? {}, fx = p.fx ?? {};
  return {
    name: String(p.name ?? "Custom"), description: String(p.description ?? ""),
    osc: oscIn.map(oscN),
    sub: { wave: pick(s.wave, SUB_WAVES, "sine"), octave: Math.round(num(s.octave, -2, -1, -1)), level: num(s.level, 0, 1, 0) },
    noise: { color: pick(n.color, ["white", "pink"], "white"), level: num(n.level, 0, 1, 0), decay: num(n.decay, 0.005, 10, 0.1) },
    filter: { model: pick(f.model, FILTER_MODELS, "ladder"), cutoff: num(f.cutoff, 20, 18000, 2000), resonance: num(f.resonance, 0, 1, 0.2), envAmount: num(f.envAmount, -6, 6, 1),
      keyTrack: num(f.keyTrack, 0, 1, 0.5), velAmount: num(f.velAmount, 0, 1, 0.3), drive: num(f.drive, 0, 1, 0) },
    ampEnv: env(p.ampEnv, { a: 0.005, d: 0.2, s: 0.7, r: 0.2 }),
    filterEnv: env(p.filterEnv, { a: 0.005, d: 0.3, s: 0.3, r: 0.2 }),
    modEnv: { ...env(me, { a: 0.01, d: 0.2, s: 0, r: 0.2 }), target: pick(me.target, MODENV_TARGETS, "none"), amount: num(me.amount, -1, 1, 0) },
    lfo1: lfoN(p.lfo1, { rate: 5 }), lfo2: lfoN(p.lfo2, { rate: 1 }),
    voice: { mono: !!v.mono, legato: !!v.legato, glide: num(v.glide, 0, 2, 0) },
    drive: { amount: num(dr.amount, 0, 1, 0), asym: num(dr.asym, 0, 1, 0) },
    fx: {
      chorus: { mix: num(fx.chorus?.mix, 0, 1, 0), rate: num(fx.chorus?.rate, 0.05, 10, 0.8), depth: num(fx.chorus?.depth, 0, 1, 0.3) },
      delay: { mix: num(fx.delay?.mix, 0, 1, 0), time: num(fx.delay?.time, 0.0625, 4, 0.75), feedback: num(fx.delay?.feedback, 0, 0.95, 0.3), tone: num(fx.delay?.tone, 200, 18000, 4000), pingpong: fx.delay?.pingpong == null ? true : !!fx.delay.pingpong },
      reverb: { mix: num(fx.reverb?.mix, 0, 1, 0), decay: num(fx.reverb?.decay, 0.1, 12, 1.5), damp: num(fx.reverb?.damp, 0, 1, 0.5), preDelay: num(fx.reverb?.preDelay, 0, 0.2, 0.02) },
    },
    level: num(p.level, -40, 6, -10),
  };
}
export function clonePatch2(p) { return JSON.parse(JSON.stringify(p)); }

/* ─────────── knobs: パッチの値 → ノブ位置 0..1 ─────────── */
export function knobDefaults(patch) { return knobDefaultsFromPatch(normalizePatch2(patch)); }
// ノブ位置 → 表示用の実値 (UI / ログ用)
export function knobValue(id, v, patch) {
  switch (id) {
    case "cutoff": return `${Math.round(knobToCutoff(v))} Hz`;
    case "resonance": return v.toFixed(2);
    case "envAmount": return `${(v * ENV_OCTAVES).toFixed(1)} oct`;
    case "lfoRate": return patch?.lfo1?.sync ? knobToDivision(v) : `${knobToLfoRate(v).toFixed(2)} Hz`;
    default: return v.toFixed(2);
  }
}

/* ─────────── JSON Schema (Claude structured outputs 用) ─────────── */
const N = (description, minimum, maximum) => ({ type: "number", minimum, maximum, description });
const I = (description, minimum, maximum) => ({ type: "integer", minimum, maximum, description });
const B = (description) => ({ type: "boolean", description });
const E = (description, values) => ({ type: "string", enum: values, description });
const O = (description, properties) => ({ type: "object", description, properties, required: Object.keys(properties), additionalProperties: false });
const ENV = (what) => O(`${what}のエンベロープ (ADSR, 秒)`, { a: N("アタック 秒 (0.001..20)", 0.001, 20), d: N("ディケイ 秒 (0.001..20)", 0.001, 20), s: N("サステイン 0..1", 0, 1), r: N("リリース 秒 (0.005..30)", 0.005, 30) });
const LFO = (k) => O(`LFO${k}${k === 1 ? " (物理ノブ LFO RATE / LFO DEPTH で演奏中に動かせる)" : ""}`, {
  wave: E("波形: sine=なめらか / tri=三角 / saw=下降ノコギリ / square=矩形 / sh=サンプル&ホールド(ランダム階段)", LFO_WAVES),
  rate: N("速さ Hz (0.05..20)。sync=true のときは無視され division が使われる", 0.05, 20),
  sync: B("テンポ同期するか"),
  division: E("テンポ同期の周期: 4/1=4小節 … 1/4=四分 … 1/16=16分 (d=付点, t=3連)", DIVISIONS),
  depth: N("深さ 0..1。pitch では depth²×12 半音(0.2で約0.5半音のビブラート)、cutoff は ±4オクターブ×depth、amp はトレモロ、pan は左右、pw/morph は波形の変化", 0, 1),
  target: E("かける先: none / cutoff / pitch(ビブラート) / amp(トレモロ) / pan / pw(パルス幅) / morph(ウェーブテーブル位置)", LFO_TARGETS),
  fadeIn: N("発音後に LFO が効き始めるまでのフェード秒 (0..10)。遅れてかかるビブラートに", 0, 10),
  retrig: B("true=音ごとに LFO の位相を 0 から / false=フリーラン"),
});
export const SYNTH2_PATCH_SCHEMA = O("VESPER SYNTH2 のパッチ (減算 + ウェーブテーブル方式)", {
  name: { type: "string", description: "パッチ名 (英語, 短く)" },
  description: { type: "string", description: "音色の説明 (日本語1文)" },
  osc: {
    type: "array", description: "オシレーター 1〜3 本 (必ず 1 本以上、最大 3 本。使わない本は level 0)",
    items: O("オシレーター", {
      wave: E("波形: saw / square / pulse(幅=pw) / triangle / sine / supersaw(JP-8000 風 7 本デチューン。spread がデチューン量) / wt:organ(ドローバー) / wt:bell(鐘) / wt:vocal(母音 a-o-u-e-i) / wt:digital(デジタル) / wt:pwm(パルス幅)", OSC_WAVES),
      pw: N("パルス幅 0.05..0.95 (pulse のみ, 0.5=矩形)", 0.05, 0.95),
      morph: N("ウェーブテーブルの位置 0..1 (wt: のみ)。LFO/modEnv で動かすと音色が変わる", 0, 1),
      octave: I("オクターブ -3..3", -3, 3), semi: I("半音 -24..24 (7=5度, 12=1オクターブ)", -24, 24), detune: N("デチューン セント -100..100 (数セントずらすと厚くなる)", -100, 100),
      level: N("音量 0..1", 0, 1),
      unison: I("ユニゾン本数 1..7 (supersaw は常に 7)", 1, 7), spread: N("ユニゾンのデチューン幅 セント 0..100 (supersaw は 0..100 でデチューン曲線)", 0, 100),
      width: N("ユニゾンのステレオ幅 0..1", 0, 1), phaseRand: B("true=発音ごとに位相をランダムに (自然) / false=毎回同じ位相 (パンチ)"),
    }),
  },
  sub: O("サブオシレーター (低音を支える)", { wave: E("波形", SUB_WAVES), octave: I("-1 または -2 オクターブ", -2, -1), level: N("音量 0..1", 0, 1) }),
  noise: O("ノイズ (アタックの息・ざらつき)", { color: E("white=明るい / pink=柔らかい", ["white", "pink"]), level: N("音量 0..1", 0, 1), decay: N("ノイズ自身の減衰秒 0.005..10 (短いとアタックだけ)", 0.005, 10) }),
  filter: O("フィルター (物理ノブ CUTOFF / RESO / ENV で演奏中に動かせる)", {
    model: E("ladder=Moog 風 4 極 (太い, レゾ最大で自己発振) / svf-lp / svf-bp / svf-hp = クリーンな 2 極 / off", FILTER_MODELS),
    cutoff: N("カットオフ Hz 20..18000", 20, 18000), resonance: N("レゾナンス 0..1 (0.9 以上で発振気味)", 0, 1),
    envAmount: N("フィルターエンベロープの深さ オクターブ -6..6 (負で逆向き)", -6, 6),
    keyTrack: N("キートラッキング 0..1 (1=音程に合わせてカットオフが完全に追従)", 0, 1),
    velAmount: N("ベロシティ→カットオフ 0..1 (弱く弾くと暗くなる量)", 0, 1),
    drive: N("フィルター入力の歪み 0..1 (ladder は tanh 飽和)", 0, 1),
  }),
  ampEnv: ENV("音量"), filterEnv: ENV("フィルター"),
  modEnv: O("第3エンベロープ (ピッチ落ち・波形変化などに)", { ...ENV("モジュレーション").properties, target: E("かける先: none / cutoff(±4oct) / pitch(±12半音) / morph(±1) / pw(±0.45)", MODENV_TARGETS), amount: N("深さ -1..1", -1, 1) }),
  lfo1: LFO(1), lfo2: LFO(2),
  voice: O("発音モード", { mono: B("true=単音 (ベース・リード向け)"), legato: B("true=つなげて弾くとエンベロープを再スタートしない (mono のみ)"), glide: N("ポルタメント秒 0..2 (0=なし)", 0, 2) }),
  drive: O("フィルター後の歪み (物理ノブ DRIVE で演奏中に動かせる)", { amount: N("量 0..1", 0, 1), asym: N("非対称 0..1 (偶数倍音・真空管っぽさ)", 0, 1) }),
  fx: O("エフェクト (main thread)", {
    chorus: O("コーラス", { mix: N("量 0..1", 0, 1), rate: N("揺れの速さ Hz 0.05..10", 0.05, 10), depth: N("揺れの深さ 0..1", 0, 1) }),
    delay: O("ディレイ (物理ノブ DELAY で wet を演奏中に動かせる)", { mix: N("wet 0..1", 0, 1), time: N("拍単位の時間 0.0625..4 (0.75=付点8分, 0.5=8分, 1=4分)", 0.0625, 4), feedback: N("フィードバック 0..0.95", 0, 0.95), tone: N("繰り返しの明るさ ローパス Hz 200..18000", 200, 18000), pingpong: B("左右に交互に返す") }),
    reverb: O("リバーブ (物理ノブ REVERB で wet を演奏中に動かせる)", { mix: N("wet 0..1", 0, 1), decay: N("残響秒 0.1..12", 0.1, 12), damp: N("高域の減衰 0..1 (大きいほど暗い)", 0, 1), preDelay: N("プリディレイ秒 0..0.2", 0, 0.2) }),
  }),
  level: N("出力 dB -40..6", -40, 6),
});

/* ─────────── presets ─────────── */
const osc = (wave, o = {}) => ({ wave, pw: 0.5, morph: 0, octave: 0, semi: 0, detune: 0, level: 0.8, unison: 1, spread: 0, width: 0.5, phaseRand: true, ...o });
const lfoOff = { wave: "sine", rate: 5, sync: false, division: "1/4", depth: 0, target: "none", fadeIn: 0, retrig: true };
const noFx = { chorus: { mix: 0, rate: 0.8, depth: 0.3 }, delay: { mix: 0, time: 0.75, feedback: 0.3, tone: 4000, pingpong: true }, reverb: { mix: 0, decay: 1.5, damp: 0.5, preDelay: 0.02 } };
const fx = (o = {}) => ({ chorus: { ...noFx.chorus, ...(o.chorus ?? {}) }, delay: { ...noFx.delay, ...(o.delay ?? {}) }, reverb: { ...noFx.reverb, ...(o.reverb ?? {}) } });
const RAW = {
  // ── bass (エレクトーン風の足鍵盤に)
  "Sub Bass": { description: "サイン+サブの純な低音。足鍵盤の土台", osc: [osc("sine", { level: 0.9 }), osc("triangle", { octave: 0, level: 0.25, detune: 3 })], sub: { wave: "sine", octave: -1, level: 0.7 }, noise: { color: "white", level: 0, decay: 0.05 },
    filter: { model: "svf-lp", cutoff: 900, resonance: 0.1, envAmount: 0.8, keyTrack: 0.3, velAmount: 0.2, drive: 0 }, ampEnv: { a: 0.004, d: 0.3, s: 0.85, r: 0.15 }, filterEnv: { a: 0.002, d: 0.2, s: 0.2, r: 0.1 },
    modEnv: { a: 0.001, d: 0.05, s: 0, r: 0.1, target: "pitch", amount: 0.06 }, lfo1: lfoOff, lfo2: lfoOff, voice: { mono: true, legato: true, glide: 0.02 }, drive: { amount: 0.08, asym: 0.3 }, fx: fx({ reverb: { mix: 0.03 } }), level: -6 },
  "Moog Bass": { description: "ノコギリ+矩形をラダーで太く。Minimoog 風", osc: [osc("saw", { level: 0.8 }), osc("square", { octave: -1, level: 0.55, detune: 5 })], sub: { wave: "sine", octave: -1, level: 0.35 }, noise: { color: "white", level: 0, decay: 0.05 },
    filter: { model: "ladder", cutoff: 380, resonance: 0.45, envAmount: 2.6, keyTrack: 0.3, velAmount: 0.4, drive: 0.25 }, ampEnv: { a: 0.003, d: 0.25, s: 0.7, r: 0.12 }, filterEnv: { a: 0.002, d: 0.22, s: 0.12, r: 0.1 },
    modEnv: { a: 0.01, d: 0.2, s: 0, r: 0.2, target: "none", amount: 0 }, lfo1: lfoOff, lfo2: lfoOff, voice: { mono: true, legato: true, glide: 0.04 }, drive: { amount: 0.12, asym: 0.2 }, fx: fx({ reverb: { mix: 0.03 } }), level: -7 },
  "FM 80s Bass": { description: "DX 風のカチッとした金属的アタックの 80s ベース", osc: [osc("wt:bell", { morph: 0.55, level: 0.75 }), osc("sine", { level: 0.6, detune: -3 })], sub: { wave: "sine", octave: -1, level: 0.45 }, noise: { color: "white", level: 0.03, decay: 0.02 },
    filter: { model: "svf-lp", cutoff: 1200, resonance: 0.15, envAmount: 2.5, keyTrack: 0.5, velAmount: 0.5, drive: 0 }, ampEnv: { a: 0.002, d: 0.35, s: 0.4, r: 0.1 }, filterEnv: { a: 0.001, d: 0.12, s: 0.05, r: 0.1 },
    modEnv: { a: 0.001, d: 0.18, s: 0, r: 0.1, target: "morph", amount: -0.9 }, lfo1: lfoOff, lfo2: lfoOff, voice: { mono: true, legato: false, glide: 0 }, drive: { amount: 0.05, asym: 0 }, fx: fx({ chorus: { mix: 0.15, rate: 0.6, depth: 0.25 }, reverb: { mix: 0.04 } }), level: -7 },
  "Growl Bass": { description: "ユニゾンノコギリ+LFO でうなる歪みベース", osc: [osc("saw", { level: 0.7, unison: 3, spread: 18, width: 0.4 }), osc("pulse", { pw: 0.3, octave: -1, level: 0.5 })], sub: { wave: "sine", octave: -1, level: 0.4 }, noise: { color: "white", level: 0, decay: 0.05 },
    filter: { model: "ladder", cutoff: 500, resonance: 0.6, envAmount: 1.2, keyTrack: 0.2, velAmount: 0.3, drive: 0.5 }, ampEnv: { a: 0.005, d: 0.3, s: 0.9, r: 0.15 }, filterEnv: { a: 0.01, d: 0.3, s: 0.4, r: 0.15 },
    modEnv: { a: 0.01, d: 0.2, s: 0, r: 0.2, target: "none", amount: 0 }, lfo1: { wave: "sine", rate: 4, sync: true, division: "1/8", depth: 0.5, target: "cutoff", fadeIn: 0, retrig: true }, lfo2: lfoOff,
    voice: { mono: true, legato: true, glide: 0.03 }, drive: { amount: 0.35, asym: 0.4 }, fx: fx({ reverb: { mix: 0.04 } }), level: -9 },
  "Acid Bass": { description: "303 風。レゾ高め+短いエンベロープ、グライドで鳴く", osc: [osc("saw", { level: 0.9, phaseRand: false })], sub: { wave: "square", octave: -1, level: 0.15 }, noise: { color: "white", level: 0, decay: 0.05 },
    filter: { model: "ladder", cutoff: 260, resonance: 0.8, envAmount: 3.2, keyTrack: 0.2, velAmount: 0.6, drive: 0.35 }, ampEnv: { a: 0.002, d: 0.2, s: 0.5, r: 0.08 }, filterEnv: { a: 0.001, d: 0.2, s: 0.02, r: 0.1 },
    modEnv: { a: 0.01, d: 0.2, s: 0, r: 0.2, target: "none", amount: 0 }, lfo1: lfoOff, lfo2: lfoOff, voice: { mono: true, legato: true, glide: 0.07 }, drive: { amount: 0.3, asym: 0.2 }, fx: fx({ delay: { mix: 0.12, time: 0.75, feedback: 0.3, tone: 3000, pingpong: true }, reverb: { mix: 0.05 } }), level: -8 },
  // ── lead
  "Supersaw Lead": { description: "JP-8000 のスーパーソー。トランス/アニソンの主役", osc: [osc("supersaw", { level: 0.75, spread: 55, width: 0.9 }), osc("supersaw", { octave: 1, level: 0.3, spread: 45, width: 0.9 })], sub: { wave: "sine", octave: -1, level: 0.15 }, noise: { color: "white", level: 0, decay: 0.05 },
    filter: { model: "svf-lp", cutoff: 5200, resonance: 0.1, envAmount: 0.8, keyTrack: 0.5, velAmount: 0.3, drive: 0 }, ampEnv: { a: 0.015, d: 0.3, s: 0.85, r: 0.35 }, filterEnv: { a: 0.01, d: 0.4, s: 0.5, r: 0.3 },
    modEnv: { a: 0.01, d: 0.2, s: 0, r: 0.2, target: "none", amount: 0 }, lfo1: { wave: "sine", rate: 5.5, sync: false, division: "1/4", depth: 0.12, target: "pitch", fadeIn: 0.4, retrig: true }, lfo2: lfoOff,
    voice: { mono: false, legato: false, glide: 0 }, drive: { amount: 0.05, asym: 0 }, fx: fx({ chorus: { mix: 0.15, rate: 0.5, depth: 0.3 }, delay: { mix: 0.22, time: 0.75, feedback: 0.35, tone: 5000, pingpong: true }, reverb: { mix: 0.25, decay: 2.5, damp: 0.5 } }), level: -11 },
  "Hard Sync Lead": { description: "シンク風の鋭いリード。modEnv で波形が切り込む", osc: [osc("wt:digital", { morph: 0.7, level: 0.8 }), osc("saw", { level: 0.5, detune: -8 })], sub: { wave: "square", octave: -1, level: 0.2 }, noise: { color: "white", level: 0, decay: 0.05 },
    filter: { model: "ladder", cutoff: 2400, resonance: 0.35, envAmount: 2, keyTrack: 0.6, velAmount: 0.4, drive: 0.3 }, ampEnv: { a: 0.005, d: 0.2, s: 0.8, r: 0.2 }, filterEnv: { a: 0.003, d: 0.35, s: 0.3, r: 0.2 },
    modEnv: { a: 0.002, d: 0.3, s: 0.2, r: 0.2, target: "morph", amount: -0.7 }, lfo1: { wave: "sine", rate: 5.8, sync: false, division: "1/4", depth: 0.15, target: "pitch", fadeIn: 0.3, retrig: true }, lfo2: lfoOff,
    voice: { mono: true, legato: true, glide: 0.05 }, drive: { amount: 0.3, asym: 0.3 }, fx: fx({ delay: { mix: 0.2, time: 0.5, feedback: 0.35, tone: 4000, pingpong: true }, reverb: { mix: 0.15, decay: 1.8 } }), level: -10 },
  "Retro Square Lead": { description: "ゲーム機風のパルス+矩形。ビブラート付き", osc: [osc("pulse", { pw: 0.25, level: 0.8, phaseRand: false }), osc("square", { octave: -1, level: 0.35, detune: 4 })], sub: { wave: "sine", octave: -1, level: 0 }, noise: { color: "white", level: 0, decay: 0.05 },
    filter: { model: "svf-lp", cutoff: 3600, resonance: 0.15, envAmount: 1, keyTrack: 0.5, velAmount: 0.2, drive: 0 }, ampEnv: { a: 0.004, d: 0.15, s: 0.75, r: 0.12 }, filterEnv: { a: 0.004, d: 0.2, s: 0.4, r: 0.15 },
    modEnv: { a: 0.01, d: 0.2, s: 0, r: 0.2, target: "none", amount: 0 }, lfo1: { wave: "tri", rate: 6, sync: false, division: "1/4", depth: 0.16, target: "pitch", fadeIn: 0.2, retrig: true }, lfo2: { wave: "sine", rate: 0.7, sync: false, division: "1/4", depth: 0.4, target: "pw", fadeIn: 0, retrig: false },
    voice: { mono: true, legato: true, glide: 0.02 }, drive: { amount: 0, asym: 0 }, fx: fx({ delay: { mix: 0.18, time: 0.5, feedback: 0.3, tone: 5000, pingpong: true }, reverb: { mix: 0.12, decay: 1.5 } }), level: -11 },
  "Soft Flute Lead": { description: "三角波+息ノイズの柔らかい笛。遅れてかかるビブラート", osc: [osc("triangle", { level: 0.9 }), osc("sine", { octave: 1, level: 0.2, detune: 2 })], sub: { wave: "sine", octave: -1, level: 0 }, noise: { color: "pink", level: 0.12, decay: 0.25 },
    filter: { model: "svf-lp", cutoff: 2600, resonance: 0.2, envAmount: 0.6, keyTrack: 0.7, velAmount: 0.3, drive: 0 }, ampEnv: { a: 0.06, d: 0.3, s: 0.8, r: 0.25 }, filterEnv: { a: 0.08, d: 0.3, s: 0.6, r: 0.25 },
    modEnv: { a: 0.01, d: 0.2, s: 0, r: 0.2, target: "none", amount: 0 }, lfo1: { wave: "sine", rate: 5.2, sync: false, division: "1/4", depth: 0.14, target: "pitch", fadeIn: 0.5, retrig: true }, lfo2: { wave: "sine", rate: 5.2, sync: false, division: "1/4", depth: 0.15, target: "amp", fadeIn: 0.5, retrig: true },
    voice: { mono: true, legato: true, glide: 0.03 }, drive: { amount: 0, asym: 0 }, fx: fx({ delay: { mix: 0.15, time: 0.75, feedback: 0.25, tone: 3500, pingpong: true }, reverb: { mix: 0.3, decay: 2.8, damp: 0.6 } }), level: -9 },
  // ── keys / pluck
  "JP Pluck": { description: "JP-8000 風のプラック。短いフィルター減衰でコロコロ", osc: [osc("saw", { level: 0.7, unison: 3, spread: 14, width: 0.6 }), osc("square", { octave: 1, level: 0.25, detune: 6 })], sub: { wave: "sine", octave: -1, level: 0.15 }, noise: { color: "white", level: 0.06, decay: 0.02 },
    filter: { model: "ladder", cutoff: 500, resonance: 0.3, envAmount: 3.4, keyTrack: 0.6, velAmount: 0.6, drive: 0.1 }, ampEnv: { a: 0.002, d: 0.35, s: 0.05, r: 0.25 }, filterEnv: { a: 0.001, d: 0.16, s: 0, r: 0.2 },
    modEnv: { a: 0.01, d: 0.2, s: 0, r: 0.2, target: "none", amount: 0 }, lfo1: lfoOff, lfo2: lfoOff, voice: { mono: false, legato: false, glide: 0 }, drive: { amount: 0.05, asym: 0 },
    fx: fx({ chorus: { mix: 0.1, rate: 0.6, depth: 0.25 }, delay: { mix: 0.25, time: 0.75, feedback: 0.4, tone: 4500, pingpong: true }, reverb: { mix: 0.2, decay: 2.2 } }), level: -8 },
  "FM E.Piano": { description: "DX7 風エレピ。鐘テーブルの倍音がベロシティで開く", osc: [osc("wt:bell", { morph: 0.35, level: 0.7 }), osc("sine", { level: 0.55, detune: -2 }), osc("sine", { octave: 2, level: 0.08, detune: 3 })], sub: { wave: "sine", octave: -1, level: 0.12 }, noise: { color: "white", level: 0.02, decay: 0.01 },
    filter: { model: "svf-lp", cutoff: 1800, resonance: 0.1, envAmount: 2.2, keyTrack: 0.6, velAmount: 0.7, drive: 0 }, ampEnv: { a: 0.002, d: 1.4, s: 0.15, r: 0.35 }, filterEnv: { a: 0.001, d: 0.5, s: 0.1, r: 0.3 },
    modEnv: { a: 0.001, d: 0.6, s: 0, r: 0.3, target: "morph", amount: -0.6 }, lfo1: { wave: "sine", rate: 4.5, sync: false, division: "1/4", depth: 0.2, target: "pan", fadeIn: 0, retrig: false }, lfo2: lfoOff,
    voice: { mono: false, legato: false, glide: 0 }, drive: { amount: 0.06, asym: 0.5 }, fx: fx({ chorus: { mix: 0.3, rate: 0.7, depth: 0.35 }, reverb: { mix: 0.18, decay: 1.8 } }), level: -8 },
  "Drawbar Organ": { description: "ドローバーオルガン。LFO でロータリー風の揺れ", osc: [osc("wt:organ", { morph: 0.6, level: 0.8 }), osc("sine", { octave: -1, level: 0.3 })], sub: { wave: "sine", octave: -1, level: 0 }, noise: { color: "white", level: 0.03, decay: 0.008 },
    filter: { model: "svf-lp", cutoff: 6000, resonance: 0, envAmount: 0, keyTrack: 0.5, velAmount: 0, drive: 0 }, ampEnv: { a: 0.004, d: 0.05, s: 1, r: 0.06 }, filterEnv: { a: 0.01, d: 0.1, s: 1, r: 0.1 },
    modEnv: { a: 0.01, d: 0.2, s: 0, r: 0.2, target: "none", amount: 0 }, lfo1: { wave: "sine", rate: 6.2, sync: false, division: "1/4", depth: 0.25, target: "amp", fadeIn: 0, retrig: false }, lfo2: { wave: "sine", rate: 6.2, sync: false, division: "1/4", depth: 0.35, target: "pan", fadeIn: 0, retrig: false },
    voice: { mono: false, legato: false, glide: 0 }, drive: { amount: 0.18, asym: 0.5 }, fx: fx({ chorus: { mix: 0.2, rate: 1.2, depth: 0.2 }, reverb: { mix: 0.12, decay: 1.4 } }), level: -10 },
  // ── pad / strings
  "Warm Pad": { description: "ノコギリ+PWM の暖かいパッド。ゆっくり立ち上がる", osc: [osc("saw", { level: 0.6, unison: 3, spread: 12, width: 0.8, detune: -3 }), osc("wt:pwm", { morph: 0.3, level: 0.5, octave: -1, detune: 4 })], sub: { wave: "sine", octave: -1, level: 0.12 }, noise: { color: "pink", level: 0, decay: 0.05 },
    filter: { model: "ladder", cutoff: 900, resonance: 0.2, envAmount: 1.2, keyTrack: 0.4, velAmount: 0.2, drive: 0.1 }, ampEnv: { a: 0.6, d: 1, s: 0.85, r: 1.4 }, filterEnv: { a: 1.2, d: 1.5, s: 0.5, r: 1.2 },
    modEnv: { a: 0.01, d: 0.2, s: 0, r: 0.2, target: "none", amount: 0 }, lfo1: { wave: "sine", rate: 0.35, sync: false, division: "1/4", depth: 0.5, target: "morph", fadeIn: 0, retrig: false }, lfo2: { wave: "tri", rate: 0.2, sync: false, division: "1/4", depth: 0.2, target: "cutoff", fadeIn: 0, retrig: false },
    voice: { mono: false, legato: false, glide: 0 }, drive: { amount: 0, asym: 0 }, fx: fx({ chorus: { mix: 0.35, rate: 0.5, depth: 0.4 }, reverb: { mix: 0.35, decay: 3.5, damp: 0.55 } }), level: -12 },
  "String Machine": { description: "70s ストリングス・アンサンブル。コーラスで広がる", osc: [osc("saw", { level: 0.6, unison: 4, spread: 16, width: 0.9 }), osc("saw", { octave: 1, level: 0.3, unison: 3, spread: 12, width: 0.9, detune: 3 })], sub: { wave: "sine", octave: -1, level: 0 }, noise: { color: "pink", level: 0, decay: 0.05 },
    filter: { model: "svf-lp", cutoff: 3200, resonance: 0.05, envAmount: 0.4, keyTrack: 0.5, velAmount: 0.2, drive: 0 }, ampEnv: { a: 0.35, d: 0.5, s: 0.9, r: 0.9 }, filterEnv: { a: 0.5, d: 1, s: 0.6, r: 0.8 },
    modEnv: { a: 0.01, d: 0.2, s: 0, r: 0.2, target: "none", amount: 0 }, lfo1: { wave: "sine", rate: 5.5, sync: false, division: "1/4", depth: 0.06, target: "pitch", fadeIn: 0.8, retrig: false }, lfo2: lfoOff,
    voice: { mono: false, legato: false, glide: 0 }, drive: { amount: 0, asym: 0 }, fx: fx({ chorus: { mix: 0.5, rate: 0.7, depth: 0.5 }, reverb: { mix: 0.3, decay: 2.8, damp: 0.5 } }), level: -12 },
  "Vocal Pad": { description: "母音テーブルが a→i とゆっくり移る声のパッド", osc: [osc("wt:vocal", { morph: 0.2, level: 0.7, unison: 2, spread: 8, width: 0.8 }), osc("wt:vocal", { morph: 0.7, level: 0.45, detune: -6, semi: 0 }), osc("sine", { octave: -1, level: 0.25 })], sub: { wave: "sine", octave: -1, level: 0 }, noise: { color: "pink", level: 0.03, decay: 3 },
    filter: { model: "svf-lp", cutoff: 4000, resonance: 0.1, envAmount: 0.5, keyTrack: 0.3, velAmount: 0.2, drive: 0 }, ampEnv: { a: 0.8, d: 1, s: 0.85, r: 1.6 }, filterEnv: { a: 1, d: 1, s: 0.7, r: 1 },
    modEnv: { a: 0.01, d: 0.2, s: 0, r: 0.2, target: "none", amount: 0 }, lfo1: { wave: "tri", rate: 0.12, sync: false, division: "1/4", depth: 0.6, target: "morph", fadeIn: 0, retrig: false }, lfo2: { wave: "sine", rate: 4.8, sync: false, division: "1/4", depth: 0.05, target: "pitch", fadeIn: 1, retrig: false },
    voice: { mono: false, legato: false, glide: 0 }, drive: { amount: 0, asym: 0 }, fx: fx({ chorus: { mix: 0.3, rate: 0.4, depth: 0.35 }, delay: { mix: 0.15, time: 1, feedback: 0.35, tone: 2500, pingpong: true }, reverb: { mix: 0.4, decay: 4.5, damp: 0.6, preDelay: 0.04 } }), level: -12 },
};
export const SYNTH2_PRESETS = {};
for (const [name, p] of Object.entries(RAW)) SYNTH2_PRESETS[name] = normalizePatch2({ ...p, name });
export const SYNTH2_DEFAULT_BY_INSTRUMENT = { synth: "JP Pluck", "synth-lead": "Supersaw Lead", "synth-pad": "Warm Pad", "synth-bass": "Moog Bass" };

/* ─────────── main-thread engine ─────────── */
const moduleLoaded = new WeakMap(); // context → Promise
// Tone.js の Context (standardized-audio-context の包み) が来たら、その addAudioWorkletModule / createAudioWorkletNode を使う。
// その包みの addModule は中身を blob にして読むので import 文が使えない → import 無しの 1 ファイル版 (bundle) を読ませる。
// 素の AudioContext なら本物の addModule で ES module 版を読む。bundle は `node tools/bundle-worklet.mjs` で作る。
function loadModule(context, toneCtx) {
  const key = toneCtx ?? context;
  let p = moduleLoaded.get(key);
  if (!p) {
    p = toneCtx ? toneCtx.addAudioWorkletModule(new URL("./worklet/synth2-processor.bundle.js", import.meta.url).href, "vesper-synth2")
                : context.audioWorklet.addModule(new URL("./worklet/synth2-processor.js", import.meta.url));
    p = p.catch((error) => { moduleLoaded.delete(key); throw error; });
    moduleLoaded.set(key, p);
  }
  return p;
}
const wetGain = (v) => Math.sin(Math.max(0, Math.min(1, v)) * Math.PI / 2); // 0..1 → equal-power 風

/**
 * @param {object} patch  (normalizePatch2 で整えられる)
 * @param {{context: BaseAudioContext, tempo?: number}} o
 * 戻り値: { kind:"synth2", patch, outs:[node], trigger, setKnob, getKnob, setTempo, panic, dispose }
 */
// The same native effect chain serves playback and silent measured previews.
export function createSynth2Output(source, p, {context, tempo=120, knobs=knobDefaults(p)}={}) {
  const nodes=[],mk=n=>{nodes.push(n);return n;};
  try {
  let tail = source;
  // ── chorus: 2 本の変調ディレイ (L/R で逆相) ──
  const ch = p.fx.chorus;
  if (ch.mix > 0.001) {
    const split = mk(context.createChannelSplitter(2)), merge = mk(context.createChannelMerger(2));
    const dL = mk(context.createDelay(0.1)), dR = mk(context.createDelay(0.1));
    dL.delayTime.value = 0.016; dR.delayTime.value = 0.019;
    const lfo = mk(context.createOscillator()); lfo.type = "sine"; lfo.frequency.value = ch.rate;
    const gL = mk(context.createGain()), gR = mk(context.createGain()); gL.gain.value = 0.006 * ch.depth; gR.gain.value = -0.006 * ch.depth;
    lfo.connect(gL); lfo.connect(gR); gL.connect(dL.delayTime); gR.connect(dR.delayTime); lfo.start();
    const wet = mk(context.createGain()), dry = mk(context.createGain()), sum = mk(context.createGain());
    wet.gain.value = ch.mix * 0.8; dry.gain.value = 1 - ch.mix * 0.3;
    tail.connect(split); split.connect(dL, 0); split.connect(dR, 1); dL.connect(merge, 0, 0); dR.connect(merge, 0, 1); merge.connect(wet); wet.connect(sum);
    tail.connect(dry); dry.connect(sum); tail = sum;
  }
  // ── delay: テンポ同期 / feedback / tone / ping-pong ──
  const dl = p.fx.delay;
  const delayWet = mk(context.createGain()); delayWet.gain.value = wetGain(knobs.delay);
  const dlL = mk(context.createDelay(5)), dlR = mk(context.createDelay(5));
  const fbL = mk(context.createGain()), fbR = mk(context.createGain()); fbL.gain.value = dl.feedback; fbR.gain.value = dl.feedback;
  const toneL = mk(context.createBiquadFilter()), toneR = mk(context.createBiquadFilter());
  for (const t of [toneL, toneR]) { t.type = "lowpass"; t.frequency.value = dl.tone; t.Q.value = 0.5; }
  const dSplit = mk(context.createChannelSplitter(2)), dMerge = mk(context.createChannelMerger(2)), dSum = mk(context.createGain());
  const setDelayTime = (bpm, time = context.currentTime) => { const sec = Math.min(4.9, dl.time * 60 / Math.max(20, bpm)); dlL.delayTime.setValueAtTime(sec, time); dlR.delayTime.setValueAtTime(sec, time); };
  setDelayTime(tempo);
  tail.connect(dSplit);
  if (dl.pingpong) { const mono = mk(context.createGain()); mono.gain.value = 0.5; dSplit.connect(mono, 0); dSplit.connect(mono, 1); mono.connect(dlL); }
  else { dSplit.connect(dlL, 0); dSplit.connect(dlR, 1); }
  dlL.connect(toneL); dlR.connect(toneR);
  if (dl.pingpong) { toneL.connect(fbL); fbL.connect(dlR); toneR.connect(fbR); fbR.connect(dlL); }
  else { toneL.connect(fbL); fbL.connect(dlL); toneR.connect(fbR); fbR.connect(dlR); }
  toneL.connect(dMerge, 0, 0); toneR.connect(dMerge, 0, 1); dMerge.connect(delayWet); delayWet.connect(dSum);
  tail.connect(dSum); tail = dSum;
  // ── reverb (convolver) ──
  const rv = p.fx.reverb;
  const reverbWet = mk(context.createGain()); reverbWet.gain.value = wetGain(knobs.reverb);
  const conv = mk(context.createConvolver()); conv.normalize = false;
  conv.buffer = makeImpulse(context, { decay: rv.decay, preDelay: rv.preDelay, damp: rv.damp, early: 0.3, seed: 3 });
  const rSum = mk(context.createGain());
  tail.connect(conv); conv.connect(reverbWet); reverbWet.connect(rSum); tail.connect(rSum); tail = rSum;
  // ── level ──
  const out = mk(context.createGain()); out.gain.value = Math.pow(10, p.level / 20);
  tail.connect(out);

  return {out,nodes,delayWet,reverbWet,dlL,dlR,setDelayTime};
  } catch(error) {for(const n of nodes){try{n.stop?.();}catch{}try{n.disconnect();}catch{}}throw error;}
}

export async function createSynth2(patch, { context, tempo = 120 } = {}) {
  if (!context) throw new Error("createSynth2: context is required");
  let toneCtx = null;
  if (context.rawContext && typeof context.createAudioWorkletNode === "function") { toneCtx = context; context = context.rawContext; }   // Tone.getContext() が渡された
  const p = normalizePatch2(patch);
  await loadModule(context, toneCtx);
  const nodeOpts = { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] };
  const node = toneCtx ? toneCtx.createAudioWorkletNode("vesper-synth2", nodeOpts) : new AudioWorkletNode(context, "vesper-synth2", nodeOpts);
  const nodes = [node];
  const knobs = knobDefaults(p);
  for (const id of ["cutoff", "resonance", "envAmount", "lfoRate", "lfoDepth", "drive"]) { const ap = node.parameters.get(id); ap.value = knobs[id]; ap.setValueAtTime(knobs[id], 0); }
  node.port.postMessage({ type: "patch", patch: p });
  node.port.postMessage({ type: "tempo", bpm: tempo });

  let fx;
  try {fx=createSynth2Output(node,p,{context,tempo,knobs});}
  catch(error){try{node.port.postMessage({type:"dispose"});node.port.close();node.disconnect();}catch{}throw error;}
  const {out,delayWet,reverbWet,dlL,dlR,setDelayTime}=fx;nodes.push(...fx.nodes);
  let analyser=null, signal=null;

  const now = () => context.currentTime;
  const knobParam = (id) => (id === "delay" ? delayWet.gain : id === "reverb" ? reverbWet.gain : node.parameters.get(id));
  const current = { ...knobs };
  function setKnob(id, value01, time = now(), rampSec = 0, from01 = current[id]) {
    const ap = knobParam(id); if (!ap) return;
    const v = Math.max(0, Math.min(1, +value01 || 0));
    const target = id === "delay" || id === "reverb" ? wetGain(v) : v;
    const t = Math.max(now(), +time || 0);
    ap.cancelScheduledValues(t);
    const from = id === "delay" || id === "reverb" ? wetGain(from01) : from01;
    ap.setValueAtTime(from, t);
    if (rampSec > 0) ap.linearRampToValueAtTime(target, t + rampSec); else ap.setValueAtTime(target, t);
    current[id] = v;
  }
  return {
    kind: "synth2", patch: p, sampled: false, outs: [out], node,
    sampleSignal() {
      if(!context.createAnalyser)return null;
      if(!analyser){analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.65;out.connect(analyser);nodes.push(analyser);signal={wave:new Float32Array(2048),db:new Float32Array(1024),rate:context.sampleRate,serial:0};}
      analyser.getFloatTimeDomainData(signal.wave);analyser.getFloatFrequencyData(signal.db);signal.serial++;return signal;
    },
    trigger(pitch, time, durSec, vel = 100) { out.gain.setValueAtTime(Math.pow(10, p.level / 20), Math.max(now(), time)); node.port.postMessage({ type: "noteOn", p: pitch | 0, v: Math.max(1, Math.min(127, Math.round(vel))), t: +time || now(), dur: Math.max(0.01, +durSec || 0.1) }); },
    noteOn(pitch, vel = 100, time = now()) { node.port.postMessage({ type: "noteOn", p: pitch | 0, v: vel, t: time }); },
    noteOff(pitch, time = now()) { node.port.postMessage({ type: "noteOff", p: pitch | 0, t: time }); },
    setKnob, getKnob: (id) => current[id],
    setTempo(bpm, time = now()) { setDelayTime(bpm, time); node.port.postMessage({ type: "tempo", bpm, t: time }); },
    panic(time = now()) {
      node.port.postMessage({ type: "allOff", t: time });
      dlL.delayTime.cancelScheduledValues(time); dlR.delayTime.cancelScheduledValues(time);
      for (const { id } of KNOBS) { const ap = knobParam(id); ap.cancelScheduledValues(time); ap.setValueAtTime(ap.value, time); }
      out.gain.cancelScheduledValues(time); out.gain.setValueAtTime(out.gain.value, time); out.gain.linearRampToValueAtTime(0, time + 0.008);
    },
    dispose() { try { node.port.postMessage({ type: "dispose" }); node.port.close(); } catch {} for (const n of nodes) { try { n.stop?.(); } catch {} try { n.disconnect(); } catch {} } },
  };
}
