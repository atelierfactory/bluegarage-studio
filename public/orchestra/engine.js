// ═══════════ VESPER ORCHESTRA の音 (自前の予定表 + 楽器 × 奏法ごとのサンプル) ═══════════
// Tone.Transport は使わない。素の Web Audio だけで組むので、再生 (AudioContext) と WAV 書き出し (OfflineAudioContext) で同じ部品が動く。
//
// 流れ:
//   load(song)     … 曲が使うバンク (samples/<bank>/index.json) を読み、音符 1 つずつを「鳴らす予定」(event) にして、
//                    予定が選ぶサンプルだけを decode する (曲の音符 → 奏法でバンク → select() で region)。
//   play(fromBeat) … 0.2 秒先までを 25 ms ごとに予約する。途中から始めたときは、その瞬間に鳴っているはずの長い音を途中から鳴らす。
//                    画面が止まって予約が 0.08 秒より遅れたときも同じ (遅れた短い音は捨てる。まとめて鳴りださないように)
//   currentBeat()  … いま耳に届いている拍 (出力の遅れを引いた値)。3D の舞台はこれを毎コマ使う。
//   renderOffline  … 同じ予定表と同じ配線で曲全体を計算する (WAV 書き出しと、確かめの道具の測定)。
//
// 音の作り (楽譜の 1 音 → 鳴らす物):
//   ・奏法でバンクを選ぶ (sus / short / pizz / roll)。弦の trem は楽譜どおり 8 分音符の刻み (note.meas) として short で刻む
//     (この楽章の一本線のトレモロはベートーヴェンの省略記法。速いトレモロの録音を当てると別の音楽になるため)
//   ・スラーの 2 つ目からは立ち上がりを飛ばして前の音と 45 ms 重ねる (レガート)。前の音は速く消す
//   ・管の頭から鳴らす音は、録音の頭の息の音だけの所 (ループより 20 dB 以上小さい所) を飛ばす
//   ・弦の長い音は、録音のゆっくりした膨らみ (バイオリンの弱い層は 1 秒かけて -10 dB → 0) を途中から鳴らし、強い音には
//     spic の頭 (弓の噛みつき) を重ねる。acc (sf・アクセント) は頭をもっと強く、管は stac の頭を重ねる
//   ・同じ時刻・同じ高さで同じ録音が 2 つ重なる (第 1 と第 2 バイオリンの同音など) ときは、別のラウンドロビンを選ぶ。
//     そのうえで第 2 奏者の音は数セントずらし、持続音は 40 ms 先から鳴らす (選べたときも。同じ高さの 2 つの録音は打ち消し合うことがある)
import { SfzInstrument } from "../js/sampler.js";
import { beatToSec, secToBeat } from "../js/state.js";
import { makeImpulse } from "../js/ir.js";
import { measureLoudness, normalizeLoudness } from "../js/loudness.js";
import { buildLayout } from "./layout.js";
import { pianoReleaseBeat, HORN_DESKS } from "./concerto-audio.js";
import { applyConcertoMix } from "./concerto-mix.js";
import{pianoGain}from"./piano-level.js";
import{noteDynamicAt,expressionAt}from"./concerto-dynamics.js";
import { trimConcertoBuffer } from "./concerto-buffers.js";

const LOOKAHEAD = 0.2, TICK_MS = 25, HIDDEN_LOOKAHEAD = 2.5;   // 画面が隠れるとタイマーが 1 秒に 1 回になるので、先まで予約する
// 画面が止まって (重い処理など) 予約がこれより遅れた音は、頭から鳴らさない。止まった分の音が 1 度に鳴りだすのを防ぐ
// (1 秒止めると 60 個近い音が同じ瞬間に始まっていた)。まだ鳴っているはずの長い音は途中から鳴らし、短い音は捨てる
const LATE_SKIP = 0.08;
export const PREROLL = 1.25;          // 頭から再生するとき、拍 0 の前に置く時間 (指揮者の予備の振り)
const GRAPH_DELAY = 0.012;            // 2 つの DynamicsCompressor の先読み (6 ms ずつ) の分、音が遅れて出る
const dB = (x) => Math.pow(10, x / 20);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const now = () => (globalThis.performance ?? Date).now();
// 返事の来ない取り寄せで読み込みが永遠に止まらないように、時間を切ってやり直す (電波の悪い携帯・止まったサーバー)
async function fetchRetry(url, { tries = 3, timeoutMs = 20000, ...init } = {}) {
  let last;
  for (let k = 0; k < tries; k++) {
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, { ...init, signal: ac?.signal });
      if (!res.ok) throw new Error(`${res.status}`);
      const buf = await res.arrayBuffer();
      return buf;
    } catch (e) { last = e; }
    finally { clearTimeout(timer); }
  }
  throw new Error(`${url}: ${last?.name === "AbortError" ? "timeout" : last?.message}`);
}

/* ─────────── 音量の決め方 (数の理由は docs ではなくここに書く) ───────────
   バンクはどれも「いちばん強い層の v=127 が -20 dB」にそろえてある (ORCHESTRA_BANKS.md §2)。そのままだと
   バイオリン 10 人の録音もフルート 1 本も同じ大きさになるので、本物の楽団の釣り合いを家族と奏者ごとの差で戻す。
   ・弦は土台。第 1 バイオリンを 0 dB の基準にし、人数 (10/8/6/6/4) と楽器の鳴りで少しずつ下げる
   ・木管は 1 本ずつなので弦の群れより下げる (-4.5 dB)。-3 dB のときは ff の全合奏で木管 8 本が弦 34 人と同じ大きさ (中央値 -0.9 dB) で、
     吹奏楽のように聞こえる。-4.5 dB で約 -2.4 dB。弦と 1 小節ずつ受け渡す所 (196〜227 小節) は同じくらいのまま (受け渡しがこだまに聞こえる)
   ・金管は ff の全合奏で弦のすぐ下 (+1.5 dB で、弦との差の中央値 -2.9 → 約 -1.4 dB)。遠い (舞台の奥) ので高い音を少し落とし、響きを多めにする
   ・ティンパニは +4 dB。0 dB のときは ff の打つ瞬間 (85 ms) が弦より中央値で 7 dB 小さく、全合奏の中で打つ音が埋もれた
   ・数はどれも tools/orchestra/render-check.mjs で曲全体を書き出して測った値 (家族ごとの大きさは響きに送る前の音)
   ・masterDb は -1.5: 金管とティンパニを上げた分、リミッターの手前の余裕を戻す (WAV はあとで -16 LUFS にそろえる)
   ・hallDb は「ホールの響きの量」をそのままの音との比 (dB) で書く。奥の楽器ほど響きが多い。
     書いた値より実際の響きは多く出る (長く伸ばす音で響きが積もる・響きの IR は低い音ほど強い)。-9/-7/-6/-6 のときは
     大きい所で 響き − そのまま の中央値が -5.3 dB、ff のフェルマータの間は -3.6 dB で、刻む 8 分音符がにじむ。3 dB 下げて約 -8 dB にした
     (フェルマータを切ったあとの間は、切って 0.15 秒で伸ばしていた音より 10〜15 dB 下 = 響きが聞こえて、間も聞こえる) */
export const MIX = {
  masterDb: -1.5,
  family: {
    strings: { trimDb: 0, hallDb: -12, lowpass: 0 },
    woodwind: { trimDb: -4.5, hallDb: -10, lowpass: 12000 },
    brass: { trimDb: 1.5, hallDb: -9, lowpass: 9000 },
    percussion: { trimDb: 4, hallDb: -9, lowpass: 0 },
  },
  // 奏者ごと (dB)。弦は人数の差の半分ほど、2 番奏者は少しだけ下げる
  player: { vn1: 0, vn2: -0.5, va: -1.5, vc: 0, cb: -0.5, fl1: 0, fl2: -1, ob1: 0, ob2: -1, cl1: 0, cl2: -1, bn1: 0, bn2: -1, hn1: 0, hn2: -0.5, tp1: 0, tp2: -1, timp: 0 },
  // 短い音 (spic / stac) の補い。録音そのままでは短い音が長い音より 3〜4 dB 強かった (ORCHESTRA_BANKS.md §2.4)。そろえたあと、短い音は耳に小さく聞こえるので少し戻す
  shortDb: { strings: 1.5, woodwind: 0.5, brass: 0.5, percussion: 0 },
  biteDb: -7,        // 弦の強い長い音 (v ≥ 72) に重ねる spic の頭
  accBiteDb: -3,     // acc の付いた弦の長い音の頭
  windAccDb: -4,     // acc の付いた管の長い音に重ねる stac の頭
};
// 全曲実測でビオラが -0.92 dB。弦全体の釣り合いを保ちながら少し戻す
export const STRING_DESK_TRIM_DB = { vn1: 0, vn2: 0, va: 0.5, vc: 0, cb: 0 };
// 独奏の持ち上げ (録音でいう「その楽器のそばのマイク」)。管楽器が薄い伴奏の上で弱く吹くとき、その奏者の音量をゆっくり上げる。
// 本物のホールでは p のオーボエ 1 本と ff の全合奏の差は 30 dB 近いが、そのままだと 268 小節のオーボエの独奏 (Adagio) が
// 曲の真ん中の大きさより 24 dB 下 (-46 dBFS) になり、ほとんど聞こえなかった (tools/orchestra/render-check.mjs で実測)。
//   持ち上げ (dB) = LIFT_MAX × 露出 × 弱さ
//   露出 = 1 − (ほかのパートの重さ ÷ RIDER.ref)。重さ = Σ (v/127)² × √人数 を、前後 1.5 秒の最大で取る
//          (全合奏が入る前に下げ終える。管と弦が 1 小節ずつ受け渡す所 (196〜227 小節) は露出 0 のまま = 釣り合いを変えない)
//   弱さ = (112 − 前後 1.5 秒のその奏者のいちばん強い v) ÷ 56 (ff では持ち上げない: 59 小節のホルンの呼びかけは ff のまま。
//          1 つの音の中の decresc. で持ち上げが増えて、強弱の形を打ち消さないように、前後の最大で決める)
// 1.2 秒の移動平均でならし、奏者の音量 (GainNode) を時間に沿ってゆっくり動かす (録音の人がフェーダーを押すのと同じ速さ)
const RIDER = { liftMaxDb: 8, ref: 1.2, step: 0.05, window: 1.5, smooth: 1.2, families: ["woodwind", "brass"] };
// 奏者ごとの小さな時間のずれ (秒)。大きな楽器ほど音の出が遅い。音符ごとに ±3 ms をさらに足す (決まった乱数)
const TIMING = { vn1: 0, vn2: 0.004, va: -0.002, vc: 0.003, cb: 0.008, fl1: 0, fl2: 0.002, ob1: 0.002, ob2: 0.003, cl1: 0.001, cl2: 0.002, bn1: 0.003, bn2: 0.004, hn1: 0.006, hn2: 0.007, tp1: 0.004, tp2: 0.005, timp: 0 };
// 2 番奏者 (同じ録音を使う人) の音高のずれ (セント) と、1 つしかない持続音の録音を先から鳴らす量 (秒)
const SECOND = { vn2: { cents: 4, off: 0.04 }, fl2: { cents: -4, off: 0.03 }, ob2: { cents: 5, off: 0.03 }, cl2: { cents: -3, off: 0.03 }, bn2: { cents: 4, off: 0.03 }, hn2: { cents: -5, off: 0.03 }, tp2: { cents: 4, off: 0.03 } };
const FAMILIES = ["strings", "woodwind", "brass", "percussion"];

function hash01(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ═══════════ 1 つのバンク (楽器 × 奏法) ═══════════ */
// 共有の SfzInstrument (../js/sampler.js) を引き継ぎ、選び方 (select・velGain・gc) はそのまま使う。
// 足した物: 奏法をはっきり指定して選ぶ・自分で decode して持つ・鳴らし始めの位置 (offset) / 立ち上がり / 離す速さ / 音高のずれを 1 音ごとに変える。
class OrchInstrument extends SfzInstrument {
  constructor(baseUrl, index, name) {
    super(baseUrl, index);
    this.name = name;
    // 1 つのバンクの中は 1 つの奏法 (ORCHESTRA_BANKS.md §2.1)。short のバンクは、長さに関係なく short を選ぶ
    this.art = index.art ?? (this.hasShort ? "short" : "sus");
    this.buffers = new Map();   // サンプル番号 → AudioBuffer
    this.envs = new Map();      // サンプル番号 → 立ち上がりの形 (decode のあと 1 回だけ測る)
  }
  static async loadBank(base, name) {
    const bankBase = name === "piano" ? "../samples/piano/" : `${base}${name}/`;
    const buf = await fetchRetry(`${bankBase}index.json`, { cache: "no-cache", timeoutMs: 15000 });
    return new OrchInstrument(bankBase, JSON.parse(new TextDecoder().decode(buf)), name);
  }
  pick(p, v, noteIdx) { return this.select(p, v, { noteIdx, short: this.art === "short" }).filter((r) => r.s >= 0); }

  // 立ち上がりの形: 20 ms ごとの大きさ (ループ区間の平均との比 dB)。ループの無い録音は使わない (null)
  env(r) {
    if (!r.loop || r.oneShot) return null;
    if (this.envs.has(r.s)) return this.envs.get(r.s);
    const buf = this.buffers.get(r.s); if (!buf) return null;
    const fs = buf.sampleRate, nc = buf.numberOfChannels, hop = Math.round(0.02 * fs);
    const ch = Array.from({ length: nc }, (_, c) => buf.getChannelData(c));
    const pow = (i0, i1) => { let s = 0; for (const x of ch) for (let i = i0; i < i1; i++) s += x[i] * x[i]; return s / Math.max(1, (i1 - i0) * nc); };
    const ref = pow(Math.floor(r.loop[0] * fs), Math.min(buf.length, Math.floor(r.loop[1] * fs)));
    const n = Math.min(Math.floor(r.loop[0] * fs / hop), 200);
    const frames = new Float32Array(n);
    for (let k = 0; k < n; k++) frames[k] = 10 * Math.log10(pow(k * hop, (k + 1) * hop) / (ref + 1e-12) + 1e-12);
    const e = { frames, hop: hop / fs, loop0: r.loop[0] };
    this.envs.set(r.s, e);
    return e;
  }
  // 録音の頭から数えて、大きさがループの -db dB まで来る時刻 (秒、録音の時間)。cap を超えない
  rise(r, db, cap = 1.6) {
    const e = this.env(r); if (!e) return 0;
    const lim = Math.min(cap, e.loop0 - 0.06);
    for (let k = 0; k < e.frames.length; k++) if (e.frames[k] >= -db) return Math.max(0, Math.min(lim, k * e.hop));
    return Math.max(0, lim);
  }
  // そこから win 秒の平均の大きさがループの -db dB 以上になる、最初の時刻 (秒、録音の時間)。cap を超えない。
  // rise() は 20 ms の 1 コマが届いた所を返すので、届いたあとまた沈む録音 (弦の弱い層は 1 秒以上かけて揺れながら膨らむ) では、
  // 鳴らし始めの 0.3 秒がループより 5〜9 dB 小さいままだった
  settle(r, db, win, cap = 4) {
    const e = this.env(r); if (!e) return 0;
    const key = `${db}/${win}/${cap}`, memo = e.settle ?? (e.settle = new Map());
    if (memo.has(key)) return memo.get(key);
    const w = Math.max(1, Math.round(win / e.hop)), lim = Math.max(0, Math.min(cap, e.loop0 - 0.06));
    let sum = 0, at = lim;
    for (let k = 0; k < e.frames.length; k++) {
      sum += Math.pow(10, e.frames[k] / 10);
      if (k >= w) sum -= Math.pow(10, e.frames[k - w] / 10);
      if (k >= w - 1 && 10 * Math.log10(Math.max(1e-12, sum / w)) >= -db) { at = Math.min(lim, (k - w + 1) * e.hop); break; }
    }
    memo.set(key, at);
    return at;
  }

  /** 1 つの声を鳴らす。o: {gain, cents, offset (録音の秒), attack (秒), release (秒), expr {ratio, tEnd}}。
   *  list: 止めるときのために声を覚える配列 (再生のときだけ。書き出しの計算では覚えない) */
  voice(ctx, out, r, pitch, time, vel, o = {}, list = null) {
    const buf = this.buffers.get(r.s);
    if (!buf) return null;
    const g = r.g * this.velGain(r, vel, null) * (o.gain ?? 1);
    if (g < 1e-5) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const semis = (pitch - r.kc) * (r.kt ?? 1) + ((r.tune ?? 0) + (o.cents ?? 0)) / 100;
    const rate = Math.pow(2, semis / 12);
    src.playbackRate.value = rate;
    const looped = !!(r.loop && !r.oneShot);
    if (looped) { src.loop = true; src.loopStart = r.loop[0]; src.loopEnd = r.loop[1]; }
    let off = (r.off ?? 0) + (o.offset ?? 0);
    if (looped && off >= r.loop[1]) off = r.loop[0] + ((off - r.loop[0]) % (r.loop[1] - r.loop[0]));
    const end = r.end ?? buf.duration;
    if (!looped && off >= end - 0.01) return null;
    const gain = ctx.createGain();
    const e = r.env;
    const t0 = Math.max(time, 0) + (r.delay ?? 0);
    const atk = Math.max(0.002, o.attack ?? e.a);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(g, t0 + atk);
    if (e.d > 0 && e.s < 0.999) gain.gain.setTargetAtTime(g * e.s, t0 + atk + (e.h ?? 0), Math.max(0.01, e.d / 4));
    let node = gain;
    if (r.pan) { const p = ctx.createStereoPanner(); p.pan.value = r.pan / 100; gain.connect(p); node = p; }
    // 音の途中の膨らみ・しぼみ (v2): 別のゲインで直線に。tEnd に v2 に着いたら、あとはそのまま
    if (o.expr && !r.oneShot) {
      const ex = ctx.createGain();
      ex.gain.setValueAtTime(1, t0);
      if(o.expr.points)for(const p of o.expr.points)ex.gain.linearRampToValueAtTime(p.ratio,Math.max(t0+.002,p.tEnd));
      else ex.gain.linearRampToValueAtTime(o.expr.ratio, Math.max(t0 + 0.02, o.expr.tEnd));
      node.connect(ex); node = ex;
    }
    src.connect(gain); node.connect(out);
    src.start(t0, off, looped ? undefined : Math.max(0.01, end - off));
    const rel = Math.max(0.005, o.release ?? e.r);
    // ended = 鳴り終わった (または止めた)。release はこれから先の時刻に離す予約で、ended にはしない
    // (予約だけの声も、一時停止のときに allNotesOff で止められるように)
    const voice = {
      region: r, pitch, start: t0, ended: false, relAt: null, endTime: Infinity, src, gain,
      natEnd: looped ? Infinity : t0 + (end - off) / rate,
      stop: (t, fade = 0.006) => {
        if (voice.ended) return; voice.ended = true;
        const at = Math.max(t, ctx.currentTime);
        if (at <= t0) { gain.gain.cancelScheduledValues(0); gain.gain.setValueAtTime(0, 0); try { src.stop(t0 + 0.001); } catch {} voice.endTime = t0; return; }
        if (gain.gain.cancelAndHoldAtTime) gain.gain.cancelAndHoldAtTime(at);
        else { const cur = gain.gain.value; gain.gain.cancelScheduledValues(at); gain.gain.setValueAtTime(cur, at); }
        gain.gain.linearRampToValueAtTime(0, at + fade);
        try { src.stop(at + fade + 0.01); } catch {}
        voice.endTime = at + fade;
      },
      release: (t) => {
        if (voice.ended || voice.relAt != null) return;
        voice.relAt = t;
        gain.gain.setTargetAtTime(0, t, rel / 3);
        try { src.stop(t + rel * 2.5 + 0.02); } catch {}   // 2.5 × rel で -65 dB (止める瞬間に音が切れない)
        voice.endTime = t + rel * 2.5;
      },
    };
    src.onended = () => { voice.ended = true; try { src.disconnect(); gain.disconnect(); node.disconnect(); } catch {} };
    list?.push(voice);
    return voice;
  }
}

/* ═══════════ 音符 → 鳴らす予定 (event) ═══════════ */
// event: { t (曲の秒), dur (秒), pi (奏者の番号), inst, regs (region の配列), p, v, gain, cents, offset, mode, attack, release, expr, rr, id }
//   mode: "plain" (録音の頭から) | "str" (弦の長い音: 膨らみの途中から) | "legato" | "portato" (スラーの中の同じ高さ)
function bankFor(spec, art) {
  const b = spec.banks ?? {};
  if (art === "roll") return b.roll ?? b.sus;
  if (art === "pizz") return b.pizz ?? b.short;
  if (art === "trem") return b.trem ?? b.sus;
  if (art === "short") return b.short ?? b.sus;
  return b.sus ?? b.short;
}

export function buildRider(song) {
  const S = (b) => beatToSec(b, song), st = RIDER.step;
  const end = Math.max(0, ...song.players.flatMap((p) => (p.notes ?? []).map((n) => S(n.s + n.d)))) + 1;
  const N = Math.ceil(end / st) + 1;
  const pairOf = (id) => id.replace(/\d$/, "");   // fl1 と fl2 は 1 つの声 (2 人で 3 度を吹くのも独奏のうち)
  const weight = new Map(), loud = new Map();    // 声 → 重さの並び / 奏者 → いちばん強い v の並び
  for (const p of song.players) {
    const key = pairOf(p.id), w = weight.get(key) ?? weight.set(key, new Float32Array(N)).get(key);
    const lv = new Float32Array(N); loud.set(p.id, lv);
    const k = Math.sqrt(p.seats ?? 1);
    for (const n of p.notes ?? []) {
      const a = Math.floor(S(n.s) / st), b = Math.min(N, Math.ceil(S(n.s + n.d) / st));
      for (let i = a; i < b; i++) { const v = song.solo&&n.dynCurve ? noteDynamicAt(n,secToBeat(i*st,song)) : n.v2 != null ? n.v + (n.v2 - n.v) * ((i - a) / Math.max(1, b - a)) : n.v; w[i] += Math.pow(v / 127, 2) * k; lv[i] = Math.max(lv[i], v); }
    }
  }
  const total = new Float32Array(N); for (const w of weight.values()) for (let i = 0; i < N; i++) total[i] += w[i];
  const win = Math.round(RIDER.window / st), half = Math.round(RIDER.smooth / st / 2);
  const out = new Map();
  for (const p of song.players) {
    if (!RIDER.families.includes(p.family)) continue;
    const own = weight.get(pairOf(p.id)), lv = loud.get(p.id), raw = new Float32Array(N).fill(NaN);
    for (let i = 0; i < N; i++) {
      if (!lv[i]) continue;
      let others = 0, vmax = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(N - 1, i + win); j++) { others = Math.max(others, total[j] - own[j]); vmax = Math.max(vmax, lv[j]); }
      raw[i] = RIDER.liftMaxDb * clamp(1 - others / RIDER.ref, 0, 1) * clamp((112 - vmax) / 56, 0, 1);
    }
    // 鳴っていない所: 次の音まで 1 秒以内ならその音の値 (入りの前に上げ終える)、そうでなければ前の値のまま (休みの間に動かさない)
    const fill = new Float32Array(N); let prev = 0;
    for (let i = 0; i < N; i++) {
      if (!Number.isNaN(raw[i])) { prev = fill[i] = raw[i]; continue; }
      let j = i + 1; const lim = Math.min(N, i + Math.round(1 / st));
      while (j < lim && Number.isNaN(raw[j])) j++;
      fill[i] = j < lim && !Number.isNaN(raw[j]) ? raw[j] : prev;
    }
    // 0.4 秒の移動平均 (前後の端はある分だけで割る)
    const sum = new Float64Array(N + 1); for (let i = 0; i < N; i++) sum[i + 1] = sum[i] + fill[i];
    const sm = new Float32Array(N);
    for (let i = 0; i < N; i++) { const a = Math.max(0, i - half), b = Math.min(N, i + half + 1); sm[i] = (sum[b] - sum[a]) / (b - a); }
    // 0.25 dB 以上変わる所だけ点にする
    const pts = []; let last = null;
    for (let i = 0; i < N; i++) { const v = Math.round(sm[i] * 4) / 4; if (last == null || Math.abs(v - last) >= 0.25 || i === N - 1) { pts.push([i * st, v]); last = v; } }
    out.set(p.id, pts);
  }
  return out;
}

export function buildEvents(song, banks) {
  const S = (b) => beatToSec(b, song);
  const events = [], missing = [];
  const used = new Map();   // "bank|ms|p" → 使った録音の番号 (同じ録音が同時に 2 つ鳴らないように)
  const barStarts = new Set((song.bars ?? []).map((b) => Math.round(b.s * 1000)));
  // フェルマータを指揮者が切る所 (cut)。そこで終わる音は全員がいっしょに速く離す (響きだけが残る。ふつうの離し 0.25〜0.35 秒だと間 (caesura) が埋まる)
  const cutEnds = (song.fermatas ?? []).filter((f) => f.cut).map((f) => f.s + f.d);
  const endsAtCut = (n) => cutEnds.some((e) => Math.abs(n.s + n.d - e) < 0.06);
  const push = (pi, spec, n, i, sub, { bank, p, v, beat, durBeats, gain = 1, mode = "plain", expr = null, layer = "main" }) => {
    const inst = banks.get(bank);
    const t = S(beat) + (TIMING[spec.id] ?? 0) + (hash01(pi * 977 + 13, i * 31 + sub) - 0.5) * 0.006;
    const dur = Math.max(0.03, S(beat + durBeats) - S(beat));
    const ev = { t, dur, pi, inst, bank, p, v, gain, mode, expr, layer, cents: 0, offset: 0, attack: null, release: null, id: `${spec.id}.${i}.${sub}`, beat, player: spec.id, fam: spec.family };
    if (!inst) { ev.regs = []; missing.push({ id: ev.id, bank, p, v, reason: "no bank" }); events.push(ev); return ev; }
    // 録音を選ぶ: 同じ瞬間・同じ高さで同じ録音を使っている人がいれば、ほかのラウンドロビンを探す
    const key = `${bank}|${Math.round(S(beat) * 1000)}|${p}`, taken = used.get(key);
    const base = i * 16 + sub + (song.solo && HORN_DESKS[spec.id] ? pi * 7919 : 0);
    ev.noteIdx = base;
    let regs = inst.pick(p, v, base), rr = 0;
    if (taken) for (let k = 1; k < 6 && regs.some((r) => taken.has(r.s)); k++) { const alt = inst.pick(p, v, base + k * 7919); if (alt.length && !alt.some((r) => taken.has(r.s))) { regs = alt; rr = k; break; } }
    const set = taken ?? new Set(); for (const r of regs) set.add(r.s); used.set(key, set);
    // shared = 同じ瞬間に同じ高さをこのバンクで鳴らす人がいる。別のラウンドロビンを選べたときも 2 番奏者は数セントずらす:
    // ぴったり同じ高さだと 2 つの録音の位相の関係が音の間ずっと変わらず、基音が打ち消し合ったままになることがある
    // (59 小節のホルンで 9〜12 dB)。数セントずらすと、長い音ではその関係が動いていく
    ev.regs = regs; ev.rr = rr; ev.shared = !!taken;
    if (!regs.length) missing.push({ id: ev.id, bank, p, v, reason: "no region" });
    // 同じ録音しか無いときの 2 番奏者: 少し高く、持続音は先から
    const sec = SECOND[spec.id] ?? (song.solo ? HORN_DESKS[spec.id] : null);
    if (sec && (ev.shared || inst.art === "sus")) { ev.cents = sec.cents; if (inst.art === "sus") ev.offset = sec.off; }
    else if (ev.shared) ev.cents = (hash01(pi, i) < 0.5 ? -1 : 1) * 3;
    events.push(ev);
    return ev;
  };

  song.players.forEach((spec, pi) => {
    const fam = spec.family, isStr = fam === "strings", notes = spec.notes ?? [];
    const shortGain = dB(MIX.shortDb[fam] ?? 0);
    // スラーの始まりの拍と、スラーの中で次の音が続く音 (速く離す)
    const slurStart = new Map(), slurOnsets = new Map();
    for (const n of notes) if (n.slur) { slurStart.set(n.slur, Math.min(slurStart.get(n.slur) ?? Infinity, n.s)); (slurOnsets.get(n.slur) ?? slurOnsets.set(n.slur, []).get(n.slur)).push(n.s); }
    let prevByGroup = new Map();
    notes.forEach((n, i) => {
      const art = n.art ?? "sus";
      // 一本線のトレモロ = 8 分音符の刻み (meas 拍ごと)。強さは v → v2 へ直線で、小節の頭を少しだけ強く
      if (art === "trem" && n.meas > 0 && spec.banks?.short) {
        const k = Math.max(1, Math.round(n.d / n.meas));
        for (let j = 0; j < k; j++) {
          const at = j * n.meas, frac = n.v2 != null ? (n.v2d ? Math.min(1, at / n.v2d) : at / n.d) : 0;
          const v = clamp(Math.round(n.v + ((n.v2 ?? n.v) - n.v) * frac + (barStarts.has(Math.round((n.s + at) * 1000)) ? 3 : 0)), 1, 127);
          push(pi, spec, n, i, j + 1, { bank: spec.banks.short, p: n.p, v, beat: n.s + at, durBeats: n.meas, gain: shortGain, layer: "stroke" });
        }
        return;
      }
      if (song.solo && spec.id === song.solo.player) {
        const end = pianoReleaseBeat(song, n);
        const ev = push(pi, spec, n, i, 0, { bank: "piano", p: n.p, v: Math.round(n.pv??n.v), beat: n.s, durBeats: end - n.s, mode: "piano" });
        if(song.solo.levels&&n.pv!=null)ev.regs=ev.regs.map(r=>({...r,concertoGain:pianoGain(song.solo.levels,ev.inst,r,n.p,n.v,n.pv)*dB(n.pianoDb??0)}));
        ev.printedV=n.v;ev.performedV=n.pv??n.v;
        ev.t = S(n.s); ev.release = 0.16; ev.keyOff = S(n.s + n.d); ev.pedalHeld = end > n.s + n.d + 1e-5;
        const rels = ev.inst?.select(n.p, Math.round(n.pv??n.v), { release: true, noteIdx: ev.noteIdx }) ?? [];
        if (rels.length) events.push({ ...ev, t: S(end), beat: end, dur: 1.2, regs: rels.map(r => ({ ...r, oneShot: true })), mode: "piano-release", gain: 0.65, id: ev.id + ".release", layer: "release" });
        return;
      }
      const bank = bankFor(spec, art), inst = banks.get(bank);
      const long = inst?.art === "sus";
      const legato = long && n.slur && n.s > (slurStart.get(n.slur) ?? n.s) + 1e-6;
      const prev = n.slur ? prevByGroup.get(n.slur) : null;
      const mode = legato ? (prev && prev.p === n.p ? "portato" : "legato") : (long && isStr ? "str" : "plain");
      let expr = null;
      if (n.v2 != null && n.v2 !== n.v && long) {
        const tAt = n.v2d != null ? S(n.s + Math.min(n.d, n.v2d)) - S(n.s) : S(n.s + n.d) - S(n.s);
        expr = { ratio: clamp(Math.pow(Math.max(1, n.v2) / Math.max(1, n.v), 2), 0.03, 4), at: tAt };
      }
      if(song.solo&&n.dynCurve&&long){const points=n.dynCurve.map(p=>({at:S(p.b)-S(n.s),ratio:clamp(Math.pow(p.v/Math.max(1,n.v),2),.03,16)}));expr={points,ratio:points.at(-1).ratio,at:points.at(-1).at};}
      const ev = push(pi, spec, n, i, 0, { bank, p: n.p, v: n.v, beat: n.s, durBeats: n.d, gain: long ? 1 : shortGain, mode, expr });
      // スラーの中で次の音がすぐ続くなら、この音は速く離す (前の音が長く残ると 2 つの高さが濁る)
      if (n.slur && long && (slurOnsets.get(n.slur) ?? []).some((s) => Math.abs(s - (n.s + n.d)) < 0.02)) ev.release = isStr ? 0.1 : 0.07;
      if (endsAtCut(n)) ev.release = isStr ? 0.12 : fam === "percussion" ? 0.25 : 0.09;   // ティンパニは手で止めても少し鳴る
      if (n.slur) prevByGroup.set(n.slur, n);
      // 頭の重ね: 弦の強い長い音 (スラーの途中でない) に spic、acc の付いた管の長い音に stac
      if (long && !legato && spec.banks?.short && fam !== "percussion") {
        let db = null;
        if (isStr && (n.acc || n.v >= 72)) db = n.acc ? MIX.accBiteDb : MIX.biteDb;
        else if (!isStr && n.acc) db = MIX.windAccDb;
        if (db != null) push(pi, spec, n, i, 9, { bank: spec.banks.short, p: n.p, v: n.v, beat: n.s, durBeats: Math.min(n.d, 0.5), gain: dB(db) * shortGain, layer: "bite" });
      }
    });
  });
  events.sort((a, b) => a.t - b.t || a.pi - b.pi);
  return { events, missing };
}

// 客席から見て +x が左。席の中心を使い、パートの平均は従来の定位に保つ
export function stringDesks(song) {
  const layout = buildLayout(Object.fromEntries(song.players.map((p) => [p.id, p])));
  return Object.fromEntries(song.players.filter((p) => p.family === "strings").map((p) => {
    const groups = new Map();
    for (const seat of layout.byPlayer[p.id] ?? []) (groups.get(seat.desk) ?? groups.set(seat.desk, []).get(seat.desk)).push(seat);
    const desks = [...groups].map(([desk, seats]) => ({ desk, x: seats.reduce((s, v) => s + v.pos.x, 0) / seats.length, row: seats[0].row }));
    const mid = desks.reduce((s, d) => s + d.x, 0) / Math.max(1, desks.length);
    return [p.id, desks.map((d, k) => ({ ...d, pan: clamp((p.pan ?? 0) - (d.x - mid) * 0.12, -1, 1),
      delay: d.row * 0.002 + k * 0.0005, cents: desks.length > 1 ? 8 * (k / (desks.length - 1) - 0.5) : 0, offset: k * 0.043 }))];
  }));
}

// 同じバッファを使い回す。短い録音は頭を飛ばさず、別の録音と音高のずれで広げる
export function spreadStrings(events, desks) {
  const out = [];
  for (const ev of events) {
    const ds = desks[ev.player];
    if (!ds?.length) { out.push(ev); continue; }
    const taken = new Set();
    for (const d of ds) {
      let regs = ev.regs, rr = ev.rr;
      if (d.desk && ev.inst) {
        const base = ev.noteIdx + d.desk * 7919;
        regs = ev.inst.pick(ev.p, ev.v, base);
        for (let k = 1; k < 6 && regs.some((r) => taken.has(r.s)); k++) {
          const alt = ev.inst.pick(ev.p, ev.v, base + k * 7919);
          if (alt.length && !alt.some((r) => taken.has(r.s))) { regs = alt; rr = k; break; }
        }
      }
      for (const r of regs) taken.add(r.s);
      out.push({ ...ev, regs, rr, desk: d.desk, id: `${ev.id}.desk${d.desk}`, t: ev.t + d.delay,
        gain: ev.gain * dB(STRING_DESK_TRIM_DB[ev.player] ?? 0) / Math.sqrt(ds.length), cents: ev.cents + d.cents,
        offset: ev.offset + (ev.inst?.art === "sus" ? d.offset : 0) });
    }
  }
  return out.sort((a, b) => a.t - b.t || a.pi - b.pi || (a.desk ?? 0) - (b.desk ?? 0));
}

/* ═══════════ エンジン ═══════════ */
export class OrchestraEngine {
  constructor({ base = "./samples/", strings = new URLSearchParams(globalThis.location?.search ?? "").get("strings") } = {}) {
    this.base = base;
    this.strings = strings === "section" ? "section" : "desk";   // 初期は譜面台ごと (10-29 さとるんが選んだ)。?strings=section で前のまとめた音
    this.requestedStrings = this.strings;
    this.trimConcertoSamples = new URLSearchParams(globalThis.location?.search ?? "").get("sampleCuts") !== "off";
    this.banks = new Map();     // バンク名 → OrchInstrument (曲が変わっても decode 済みの物は使い回す)
    this.ctx = null; this.graph = null;
    this.playing = false; this.playhead = 0; this.volumeDb = 0;
    this.song = null; this.events = []; this.ready = null;
    this.stats = this._freshStats();
    this._timer = null; this._playRevision = 0; this._loadRevision = 0;
  }
  _freshStats() {
    return { strings: this.strings, events: this.events?.length ?? 0, scheduled: 0, started: 0, missing: 0, missingList: [], late: 0, lateMaxMs: 0, restarted: 0, voicesPeak: 0, voicesTotal: 0,
      skipped: 0, caught: 0, stallMaxMs: 0,
      files: 0, decodedMB: 0, failures: 0, bankFailures: 0, loaded: false, buildMissing: this.buildMissing?.length ?? 0 };
  }

  /* ─────────── 読み込み ─────────── */
  load(song, { onProgress } = {}) {
    this.stop();
    // 配線は奏者ごとなので、曲が変わったら作り直す (前の配線は外す)
    if (this.ctx && this.graph && this.song !== song) { try { this.graph.out.disconnect(); } catch {} this.graph = null; }
    if (song.solo || this.song?.solo) {
      for (const inst of this.banks.values()) { inst.buffers.clear(); inst.envs.clear(); }
      this.banks.clear(); this.events = [];
    }
    this.song = song;
    this.strings = song.solo ? "desk" : this.requestedStrings;
    this.desks = this.strings === "desk" ? stringDesks(song) : {};
    if (this.ctx && !this.graph) this.graph = this._graph(this.ctx, { live: true });
    this.endSec = Math.max(0, ...song.players.flatMap((p) => (p.notes ?? []).map((n) => beatToSec(n.s + n.d, song))));
    const revision = ++this._loadRevision;
    this.ready = this._load(song, (p) => { if (revision === this._loadRevision) onProgress?.(p); }, revision);
    return this.ready;
  }
  async _load(song, onProgress, revision) {
    if(song.solo?.levelFile&&!song.solo.levels){const r=await fetchRetry('repertoire/'+song.solo.levelFile,{cache:'no-cache'});song.solo.levels=JSON.parse(new TextDecoder().decode(r));}
    const names = new Set();
    for (const p of song.players) for (const b of Object.values(p.banks ?? {})) names.add(b);
    // 目次 (index.json) は小さいので全部いっしょに取る (1 つずつ待つと、遠いサーバーでは往復の時間が 30 回ぶん積もる)
    // 目次の取り寄せに失敗したバンクは、その音を「鳴らせない音」にして先へ進む (1 つの失敗で全部が止まらないように)。
    // 次の load() では、まだ持っていないバンクと decode できていない録音だけを取りに行く
    let k = 0, bankFailures = 0;
    const got = await Promise.allSettled([...names].filter((name) => !this.banks.has(name)).map(async (name) => {
      const inst = await OrchInstrument.loadBank(this.base, name);
      if (!this.banks.has(name)) this.banks.set(name, inst);
      onProgress?.({ phase: "bank", name, done: ++k, total: names.size });
    }));
    for (const g of got) if (g.status === "rejected") { bankFailures++; console.warn("[orchestra] bank", g.reason?.message ?? g.reason); }
    if (revision !== this._loadRevision) return { cancelled: true };
    const built = buildEvents(song, this.banks);
    const events = this.strings === "desk" ? spreadStrings(built.events, this.desks) : built.events;
    const missing = this.strings === "section" ? built.missing : events.filter((e) => !e.regs.length).map((e) => ({ id: e.id, bank: e.bank, p: e.p, v: e.v, reason: "no region" }));
    this.events = events; this.buildMissing = missing;
    this.rider = buildRider(song);
    // 予定が選んだ録音だけを decode する (曲の音符が選べる録音の全部ではない)
    const want = new Map();
    for (const ev of events) for (const r of ev.regs) { const inst = ev.inst; if (!inst.buffers.has(r.s)) (want.get(inst) ?? want.set(inst, new Set()).get(inst)).add(r.s); }
    const uses = new Map(), bankMemory = {};
    if (song.solo) for (const ev of events) for (const r of ev.regs) {
      const key = ev.bank + "/" + r.s; (uses.get(key) ?? uses.set(key, []).get(key)).push({ ev, r });
    }
    const tasks = [];
    for (const [inst, set] of want) for (const s of set) tasks.push({ inst, s });
    const decodeCtx = new OfflineAudioContext(2, 128, 48000);   // 音を出さない入れ物で decode (指で押す前に AudioContext を作らない)
    const sampleContexts = new Map([[48000, decodeCtx]]);
    const contextFor = inst => { const rate = song.solo && this.trimConcertoSamples ? song.interpretation?.sampleRates?.[inst.name] ?? 48000 : 48000; if (!sampleContexts.has(rate)) sampleContexts.set(rate, new OfflineAudioContext(2, 128, rate)); return sampleContexts.get(rate); };
    let done = 0, failures = 0;
    const total = tasks.length;
    const worker = async () => {
      while (tasks.length) {
        const { inst, s } = tasks.shift();
        const url = inst.baseUrl + inst.samples[s].f;
        try {
          const sampleCtx = contextFor(inst), buffer = await sampleCtx.decodeAudioData(await fetchRetry(url, { tries: 2, timeoutMs: 30000 }));
          inst.buffers.set(s, buffer);
          if (song.solo) {
            const row = bankMemory[inst.name] ??= { files: 0, beforeBytes: 0, afterBytes: 0, sampleRate: buffer.sampleRate };
            const cut = this.trimConcertoSamples ? trimConcertoBuffer(sampleCtx, inst, s, buffer, uses.get(inst.name + "/" + s)) : buffer;
            inst.buffers.set(s, cut); row.files++; row.beforeBytes += (buffer.length / buffer.sampleRate) * 48000 * buffer.numberOfChannels * 4; row.afterBytes += cut.length * cut.numberOfChannels * 4;
          }
        }
        catch (e) { failures++; console.warn("[orchestra] sample", url, e.message); }
        done++;
        onProgress?.({ phase: "samples", name: inst.index.label ?? inst.name, done, total });
      }
    };
    await Promise.all(Array.from({ length: song.solo ? 4 : 8 }, worker));
    if (revision !== this._loadRevision) return { cancelled: true };
    let bytes = 0, files = 0;
    for (const inst of this.banks.values()) for (const b of inst.buffers.values()) { bytes += b.length * b.numberOfChannels * 4; files++; }
    this.stats = this._freshStats();
    if (song.solo) this.stats.sampleBanks = bankMemory;
    // failures = 取れなかった録音 + 取れなかったバンク (目次) の数
    Object.assign(this.stats, { files, decodedMB: +(bytes / 1e6).toFixed(song.solo ? 3 : 0), failures: failures + bankFailures, bankFailures, loaded: true, buildMissing: missing.length, events: events.length });
    if ((failures || bankFailures) && files === 0) throw Object.assign(new Error(`samples: ${failures + bankFailures} failed`), { failures: failures + bankFailures });
    return { strings: this.strings, files, failures: failures + bankFailures, bankFailures, events: events.length, decodedMB: this.stats.decodedMB };
  }

  /* ─────────── 配線 ─────────── */
  // 奏者 → 音量・定位 → 家族のバス (遠い楽器は高い音を少し落とす) → まとめ → やわらかいコンプ → リミッター風のコンプ (-1 dBFS 付近) → 音量
  //                                          └→ ホールへの送り (家族ごと) → 畳み込みの響き → まとめ
  _graph(ctx, { analyse = false, live = false } = {}) {
    const song = this.song, G = { players: [], fam: {}, analysers: null };
    const out = ctx.createGain(); out.gain.value = live ? dB(this.volumeDb) : 1; out.connect(ctx.destination);
    const limiter = ctx.createDynamicsCompressor();
    // 注意: DynamicsCompressor は自分で持ち上げる (makeup gain = 圧縮の量の 0.6 乗)。リミッター風 (-3 dB・20:1) で約 +1.7 dB、
    // glue (-14 dB・1.5:1・knee 10) で約 +2.8 dB、全体が持ち上がる。masterDb はそれを含めて決めてある
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.12;
    limiter.connect(out);
    const master = ctx.createGain(); master.gain.value = dB(MIX.masterDb + (song.master?.volume ?? 0)); master.connect(limiter);
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -14; glue.knee.value = 10; glue.ratio.value = 1.5; glue.attack.value = 0.025; glue.release.value = 0.3;
    glue.connect(master);
    const mix = ctx.createGain(); mix.connect(glue);
    // ホール: 計算で作ったインパルス応答 (../js/ir.js)。normalize を切り、響きの量は IR のエネルギーから決める
    const ir = makeImpulse(ctx, { decay: clamp(song.master?.hallDecay ?? 2.6, 0.5, 8), preDelay: 0.025, damp: 0.45, early: 0.35, seed: 11 });
    const conv = ctx.createConvolver(); conv.normalize = false; conv.buffer = ir;
    let e = 0; { const d = ir.getChannelData(0); for (let i = 0; i < d.length; i++) e += d[i] * d[i]; }
    const irGain = Math.sqrt(e) || 1;
    const hallIn = ctx.createGain();
    const hallHp = ctx.createBiquadFilter(); hallHp.type = "highpass"; hallHp.frequency.value = 110; hallHp.Q.value = 0.7;
    hallIn.connect(conv); conv.connect(hallHp); hallHp.connect(mix);
    // 測定用: 左右を分けて測る (AnalyserNode は 1 つだと左右を足して半分にするので、左右に振った弦が小さく出てしまう)
    const meter = (node) => { const sp = ctx.createChannelSplitter(2), a = [ctx.createAnalyser(), ctx.createAnalyser()]; node.connect(sp); a.forEach((x, i) => { x.fftSize = 4096; sp.connect(x, i); }); return a; };
    if (analyse) G.analysers = {};
    for (const f of (song.solo ? [...FAMILIES, "solo"] : FAMILIES)) {
      const m = MIX.family[f] ?? { trimDb: -3, hallDb: -15, lowpass: 0 };
      const bus = ctx.createGain();
      let tail = bus;
      if (m.lowpass) { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = m.lowpass; lp.Q.value = 0.5; bus.connect(lp); tail = lp; }
      const famOut = ctx.createGain(); famOut.gain.value = dB(m.trimDb); tail.connect(famOut); famOut.connect(mix);
      const send = ctx.createGain(); send.gain.value = dB(m.hallDb) / irGain; famOut.connect(send); send.connect(hallIn);
      if (analyse) G.analysers[f] = meter(famOut);
      G.fam[f] = { bus, out: famOut, send, base: dB(m.trimDb) };
    }
    if (analyse) { G.analysers.mix = meter(limiter); G.analysers.hall = meter(hallHp); }
    for (const spec of song.players) {
      const gain = ctx.createGain(); gain.gain.value = dB((spec.volume ?? -6) + (MIX.player[spec.id] ?? 0));
      const pan = ctx.createStereoPanner(); pan.pan.value = clamp(spec.pan ?? 0, -1, 1);
      gain.connect(pan); pan.connect((G.fam[spec.family] ?? G.fam.strings).bus);
      const desks = (this.desks?.[spec.id] ?? []).map((d) => {
        const input = ctx.createGain(); input.gain.value = gain.gain.value;
        const p = ctx.createStereoPanner(); p.pan.value = d.pan;
        input.connect(p); p.connect((G.fam[spec.family] ?? G.fam.strings).bus);
        return { input, pan: p };
      });
      if (analyse && spec.family === "strings") {
        const tap = ctx.createGain(); pan.connect(tap);
        for (const d of desks) d.pan.connect(tap);
        G.analysers[`string_${spec.id}`] = meter(tap);
      }
      G.players.push({ input: gain, pan, desks, base: gain.gain.value, id: spec.id });
    }
    Object.assign(G, { out, limiter, master, glue, mix, conv, hallIn, irGain });
    return G;
  }

  /* ─────────── 独奏の持ち上げを音量の時間変化として入れる ─────────── */
  // base = 曲の 0 秒にあたるコンテキストの時刻。fromSec より前の点は入れない (その瞬間の値から始める)
  _applyRider(ctx, G, base, fromSec) {
    applyConcertoMix(ctx, G, base, fromSec, this.song, b => beatToSec(b, this.song));
    if (!this.rider) return;
    for (const pl of G.players) {
      const pts = this.rider.get(pl.id); if (!pts) continue;
      const g = pl.input.gain, t0 = Math.max(ctx.currentTime, base + fromSec);
      g.cancelScheduledValues(0);
      let i = 0; while (i + 1 < pts.length && pts[i + 1][0] <= fromSec) i++;
      g.setValueAtTime(pl.base * dB(pts[i][1]), t0);
      for (let k = i + 1; k < pts.length; k++) g.linearRampToValueAtTime(pl.base * dB(pts[k][1]), base + pts[k][0]);
    }
  }
  _clearRider(G) { if (!G) return; for (const pl of G.players) { try { pl.input.gain.cancelScheduledValues(0); pl.input.gain.value = pl.base; } catch {} } }
  /** 独奏の持ち上げ (dB) の表: { 奏者: [[秒, dB], …] } (確かめの道具が見る) */
  riderTable() { return this.rider ? Object.fromEntries(this.rider) : {}; }

  /* ─────────── 1 つの予定を鳴らす ─────────── */
  // base = 曲の 0 秒にあたるコンテキストの時刻。late = 曲の途中から鳴らすときの、音の頭からの経過 (秒)
  _schedule(ctx, G, ev, base, late = 0, stats = this.stats) {
    stats.scheduled++;
    if (!ev.regs.length) { this._miss(stats, ev, "no region"); return 0; }
    const inst = ev.inst, pl = G.players[ev.pi], out = ev.desk == null ? pl.input : pl.desks[ev.desk].input, live = ctx === this.ctx;
    let time = base + ev.t + late, started = 0;
    for (const r of ev.regs) {
      const o = { gain: ev.gain*(r.concertoGain??1), cents: ev.cents, release: ev.release ?? undefined };
      let offset = ev.offset, attack = null, early = 0;
      if (ev.mode === "legato") { offset += inst.rise(r, 2.5, 1.8); attack = 0.045; early = 0.022; }
      else if (ev.mode === "portato") { offset += inst.rise(r, 4, 1.2); attack = 0.03; }
      // 弦の弱い音は、そこから 0.4 秒の平均がループの -2 dB に届く所から (rise(8) からだと、最初の音だけ 7〜10 dB 小さく膨らんだ)
      else if (ev.mode === "str") { const hard = ev.v >= 80; offset += hard ? inst.rise(r, 5, 1.2) : inst.settle(r, 2, 0.4); attack = hard ? 0.025 : 0.08; }
      // 管の頭から鳴らす音: 録音の頭の、ループより 20 dB 以上小さい所 (息の音だけの所) は飛ばす。ファゴット・クラリネットの
      // 弱い録音には 0.1〜0.26 秒あり、楽譜より遅れて聞こえた (多くの録音は 0〜0.04 秒で、ほとんど変わらない)
      else if (ev.mode === "plain" && (ev.fam === "woodwind" || ev.fam === "brass")) offset += Math.max(0, inst.rise(r, 20, 0.4) - 0.02);
      const rate = Math.pow(2, ((ev.p - r.kc) * (r.kt ?? 1) + ((r.tune ?? 0) + ev.cents) / 100) / 12);
      let dur = ev.dur, gain = o.gain;
      if (late > 0) {
        // 途中から: 録音を経過の分だけ先から鳴らし (ループの中に折り返す)、強さの膨らみもその時点の値から続ける
        offset += late * rate; attack = 0.04; dur = ev.dur - late; early = 0;
        if (ev.expr) { const f = clamp(late / Math.max(0.02, ev.expr.at), 0, 1); gain *= ev.expr.points?expressionAt(ev.expr.points,late):1 + (ev.expr.ratio - 1) * f; }
      }
      o.gain = gain; o.offset = offset; if (attack != null) o.attack = attack;
      if (ev.expr) { const left = ev.expr.at - late; if (left > 0.02) { const f = clamp(late / Math.max(0.02, ev.expr.at), 0, 1), cur = 1 + (ev.expr.ratio - 1) * f; o.expr = { ratio: ev.expr.ratio / cur, tEnd: time + left }; } }
      if(ev.expr?.points){const cur=expressionAt(ev.expr.points,late);o.expr={points:ev.expr.points.filter(p=>p.at>late).map(p=>({tEnd:time+p.at-late,ratio:p.ratio/cur}))};}
      const t = Math.max(ctx.currentTime + 0.005, time - early);
      if (t > time - early + 0.03 && late === 0) { stats.late++; stats.lateMaxMs = Math.max(stats.lateMaxMs, Math.round((t - time + early) * 1000)); }
      const v = inst.voice(ctx, out, r, ev.p, t, ev.v, o, live ? inst.voices : null);
      if (!v) continue;
      started++;
      stats.voicesTotal++;
      if (!r.oneShot) v.release(Math.max(t + 0.02, time + dur));
      stats.voiceWindows?.push([v.start, Math.min(v.natEnd, v.endTime + (v.relAt != null ? 0.02 : 0))]);
    }
    if (!started) this._miss(stats, ev, "no buffer");
    else stats.started++;
    if (live) inst.gc(ctx.currentTime);
    return started;
  }
  _miss(stats, ev, reason) {
    stats.missing++;
    if (stats.missingList.length < 40) stats.missingList.push({ id: ev.id, bank: ev.bank, p: ev.p, v: ev.v, beat: ev.beat, reason });
  }
  _firstAt(sec) { const E = this.events; let lo = 0, hi = E.length; while (lo < hi) { const m = (lo + hi) >> 1; if (E[m].t < sec) lo = m + 1; else hi = m; } return lo; }
  // sec の瞬間に鳴っているはずの長い音 (oneShot と短い音は除く) を途中から鳴らす
  _restartSounding(ctx, G, base, sec, stats) {
    const E = this.events, i1 = this._firstAt(sec);
    let n = 0;
    for (let i = 0; i < i1; i++) {
      const ev = E[i];
      if (ev.t + ev.dur <= sec + 0.05 || ev.inst?.art !== "sus" || ev.layer !== "main") continue;
      if (this._schedule(ctx, G, ev, base, sec - ev.t, stats)) n++;
    }
    stats.restarted += n;
    return n;
  }

  /* ─────────── 再生 ─────────── */
  async ensureContext() {
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}   // iPhone: 消音スイッチが入っていても鳴らす
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new AudioContext({ latencyHint: "playback" });
      this.graph = this._graph(this.ctx, { live: true });
    }
    const ctx = this.ctx;
    if (ctx.state !== "running") { try { await ctx.resume(); } catch {} }
    return ctx.state;
  }
  async play(fromBeat = null) {
    if (!this.song) return;
    // 待っている間の停止・シーク・新しい再生を優先する
    const revision = ++this._playRevision, requested = fromBeat ?? this.playhead;
    await this.ready;
    if (revision !== this._playRevision) return;
    const state = await this.ensureContext();
    if (revision !== this._playRevision) return;
    if (state !== "running") throw Object.assign(new Error("audio blocked"), { code: "blocked" });
    this._silence(0.05);
    const ctx = this.ctx, beat = Math.max(0, requested);
    const startSec = beat <= 1e-3 ? -PREROLL : beatToSec(beat, this.song);
    if (startSec >= this.endSec) return this.play(0);
    const stats = this.stats; Object.assign(stats, { scheduled: 0, started: 0, missing: 0, missingList: [], late: 0, lateMaxMs: 0, restarted: 0, voicesPeak: 0, voicesTotal: 0, skipped: 0, caught: 0, stallMaxMs: 0 });
    this.base0 = ctx.currentTime + 0.08 - startSec;   // 曲の 0 秒にあたる時刻
    this.cursor = this._firstAt(Math.max(startSec, -1e9));
    this._applyRider(ctx, this.graph, this.base0, Math.max(0, startSec));
    if (startSec > 0) this._restartSounding(ctx, this.graph, this.base0, startSec, stats);
    this.playing = true; this._lastSec = startSec; this.startSec = startSec;
    this._tick();
    clearInterval(this._timer); this._timer = setInterval(() => this._tick(), TICK_MS);
  }
  _tick() {
    if (!this.playing) return;
    const ctx = this.ctx, E = this.events;
    if (this.cursor < E.length && E[this.cursor].t < ctx.currentTime - this.base0 - LATE_SKIP) this._catchUp(ctx, ctx.currentTime - this.base0);
    const horizon = ctx.currentTime + (globalThis.document?.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD) - this.base0;
    while (this.cursor < E.length && E[this.cursor].t < horizon) this._schedule(ctx, this.graph, E[this.cursor++], this.base0);
    let voices = 0; for (const inst of this.banks.values()) for (const v of inst.voices) if (!v.ended && v.start <= ctx.currentTime && Math.min(v.endTime + (v.relAt != null ? 0.02 : 0), v.natEnd) > ctx.currentTime) voices++;
    this.stats.voicesPeak = Math.max(this.stats.voicesPeak, voices);
    // 最後の音と響きが終わったら止まる
    if (this.songSec() > this.endSec + (this.song.ending?.hallTail ?? ((this.song.master?.hallDecay ?? 2.6) + 0.5))) { this.stop(); this.playhead = 0; this.onEnd?.(); }
  }
  // 画面が止まって予約が LATE_SKIP より遅れたとき: 遅れた予定を飛ばして、今の位置から続ける。
  // 長い音 (sus の本体) でまだ鳴っているはずの物は、シークと同じく途中から鳴らす。短い音・頭の重ねは鳴らさない
  _catchUp(ctx, nowSec) {
    const E = this.events, stats = this.stats, from = this.cursor, at = nowSec + 0.01;
    const i1 = this._firstAt(nowSec - LATE_SKIP);
    let caught = 0, skipped = 0;
    for (let i = from; i < i1; i++) {
      const ev = E[i];
      if (ev.inst?.art === "sus" && ev.layer === "main" && ev.t + ev.dur > at + 0.05) { if (this._schedule(ctx, this.graph, ev, this.base0, at - ev.t, stats)) caught++; }
      else skipped++;
    }
    this.cursor = Math.max(this.cursor, i1);
    stats.caught += caught; stats.skipped += skipped;
    stats.stallMaxMs = Math.max(stats.stallMaxMs, Math.round((nowSec - E[from].t) * 1000));
  }
  // いま耳に届いている曲の秒。出力の遅れ (getOutputTimestamp) を使い、戻らないようにする
  songSec() {
    if (!this.playing || !this.ctx) return this.playhead > 0 ? beatToSec(this.playhead, this.song) : 0;
    const ctx = this.ctx;
    let t = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    try { const ts = ctx.getOutputTimestamp?.(); if (ts && ts.contextTime > 0 && ts.performanceTime > 0) t = ts.contextTime + (now() - ts.performanceTime) / 1000; } catch {}
    const sec = t - this.base0 - GRAPH_DELAY;
    if (sec < this._lastSec && sec > this._lastSec - 0.05) return this._lastSec;   // 時計の更新の小さな後戻りはならす
    this._lastSec = sec;
    return sec;
  }
  /** いま聞こえている拍。頭からの再生の直前 (予備の振り) は負の拍になる */
  currentBeat() {
    if (!this.playing) return this.playhead;
    const sec = this.songSec();
    return sec < 0 ? sec * (this.song.tempo ?? 120) / 60 : secToBeat(sec, this.song);
  }
  _silence(fade = 0.08) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const inst of this.banks.values()) inst.allNotesOff(t, fade);
  }
  /** 一時停止 (位置は残す) */
  pause() {
    this._playRevision++;
    if (this.playing) this.playhead = Math.max(0, this.currentBeat());
    this.playing = false; clearInterval(this._timer); this._timer = null;
    this._silence(0.12);
    this._clearRider(this.graph);
  }
  /** 止めて頭へ */
  stop() { this.pause(); this.playhead = 0; }
  /** 再生位置を動かす。再生中ならその位置から鳴らし直す */
  seek(beat) {
    const b = Math.max(0, Number.isFinite(beat) ? beat : 0);
    if (this.playing) { this.playing = false; clearInterval(this._timer); this._silence(0.05); this.playhead = b; return this.play(b); }
    this._playRevision++;
    this.playhead = b;
  }
  setVolume(db) { this.volumeDb = db; if (this.graph) this.graph.out.gain.setTargetAtTime(dB(db), this.ctx.currentTime, 0.03); }
  /** ページを離れるとき: 音を止めてコンテキストを閉じる (decode 済みの音は残す。次の ▶ で作り直す) */
  release() {
    this.pause();
    try { this.ctx?.close(); } catch {}
    this.ctx = null; this.graph = null;
  }

  /* ─────────── 書き出し (と測定) ─────────── */
  // from / to: 曲の秒。analyse: 家族ごとと全体の大きさ (RMS dB) を step 秒ごとに測る (確かめの道具が使う)
  async renderOffline({ from = 0, to = null, sampleRate = 48000, analyse = false, step = null, onProgress } = {}) {
    await this.ready;
    const LEAD = 0.1, tail = (this.song.master?.hallDecay ?? 2.6) + 1.5;
    const start = Math.max(0, from), end = Math.min(this.endSec, to ?? this.endSec);
    const length = Math.ceil((end - start + LEAD + tail) * sampleRate);
    const ctx = new OfflineAudioContext(2, length, sampleRate);
    const G = this._graph(ctx, { analyse });
    const stats = this._freshStats(); stats.loaded = true;
    // 全曲の同時発音数は実際に鳴らした声の開始・終了から数える。測定用の配列は JSON に含めない
    Object.defineProperty(stats, "voiceWindows", { value: [] });
    const base = LEAD - start;
    let cursor = this._firstAt(start);
    this._applyRider(ctx, G, base, start);
    if (start > 0) this._restartSounding(ctx, G, base, start, stats);
    const E = this.events;
    const fill = (until) => { while (cursor < E.length && E[cursor].t < until && E[cursor].t < end) this._schedule(ctx, G, E[cursor++], base, 0, stats); };
    fill(start + 1.0);
    const dt = step ?? (analyse ? 0.1 : 0.5), frames = [], A = G.analysers;
    const buf = analyse ? new Float32Array(4096) : null;
    // 左右の平均二乗の和 (dB)。ラウドネスの測り方と同じく、左右の力を足す
    const rmsDb = (pair) => { let s = 0; for (const a of pair) { a.getFloatTimeDomainData(buf); let q = 0; for (let i = 0; i < buf.length; i++) q += buf[i] * buf[i]; s += q / buf.length; } return +(10 * Math.log10(s + 1e-12)).toFixed(2); };
    const steps = Math.floor(length / sampleRate / dt);
    let lastPct = -1;
    for (let k = 1; k < steps; k++) {
      const T = k * dt;
      ctx.suspend(T).then(() => {
        // 何があっても resume する (ここで止まると計算が永遠に終わらない)
        try {
          fill(T - base + 1.0);
          if (analyse) { const row = { t: +(T - base).toFixed(3) }; for (const f of Object.keys(A)) row[f] = rmsDb(A[f]); frames.push(row); }
          const pct = Math.floor((k / steps) * 100); if (pct !== lastPct) { lastPct = pct; onProgress?.(pct); }
        } catch (e) { (stats.errors ??= []).push(String(e?.stack ?? e).slice(0, 300)); }
        finally { this.renderPct = Math.floor((k / steps) * 100); ctx.resume(); }
      });
    }
    const t0 = now();
    const out = await ctx.startRendering();
    stats.renderMs = Math.round(now() - t0);
    const edges = stats.voiceWindows.flatMap(([a, b]) => [[a, 1], [b, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let sounding = 0;
    for (const [, delta] of edges) { sounding += delta; stats.voicesPeak = Math.max(stats.voicesPeak, sounding); }
    stats.voiceWindows.length = 0;
    this.lastRenderStats = stats;
    return { buffer: out, stats, frames, start, end, lead: LEAD };
  }
  /** WAV 書き出し: 曲全体を計算 → 目標のラウドネスへ (../js/loudness.js) → 16 bit */
  async renderWav({ onProgress } = {}) {
    const r = await this.renderOffline({ onProgress: (p) => onProgress?.("render", p) });
    onProgress?.("normalize", 100);
    const n = normalizeLoudness(r.buffer, { targetLufs: this.song.master?.targetLufs ?? -16, ceilingDb: -1 });
    return { buffer: r.buffer, stats: r.stats, report: { gainDb: n.gainDb, lufs: n.after.lufs, peakDb: n.after.peakDb, lra: n.after.lra, limited: n.limited, beforeLufs: n.before.lufs, beforePeakDb: n.before.peakDb } };
  }
}

export { measureLoudness };

/** AudioBuffer → 16 bit PCM の WAV (../js/audio.js の bufferToWav と同じ作り。Tone に頼らない写し) */
export function bufferToWav(buffer) {
  const numCh = Math.min(2, buffer.numberOfChannels), rate = buffer.sampleRate, len = buffer.length;
  const dataSize = len * numCh * 2, out = new ArrayBuffer(44 + dataSize), view = new DataView(out);
  const wstr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  wstr(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); wstr(8, "WAVE");
  wstr(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, numCh, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * numCh * 2, true); view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true);
  wstr(36, "data"); view.setUint32(40, dataSize, true);
  const chans = []; for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  const pcm = new Int16Array(out, 44);
  for (let i = 0, k = 0; i < len; i++) for (let c = 0; c < numCh; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); pcm[k++] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  return new Blob([out], { type: "audio/wav" });
}
