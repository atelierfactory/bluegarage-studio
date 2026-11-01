// ═══════════ 弦の奏者 (第 1・第 2 バイオリン、ビオラ、チェロ、コントラバス) ═══════════
// 楽譜の秒だけから、弓 (弓のどこが弦に当たるか・向き・どの弦か・浮き)、左手 (弦・ポジション・指)、体 (ゆれ・アクセント)、
// 楽器の上げ下ろしを決める。乱数は使わない。人ごとの小さなずれは席の決まった乱数 (seat.hash) から作る。
// 姿勢は秒だけで決まる (前のコマの状態を持たない) ので、seek しても撮影 (poseAt) でも同じ形になる。
//
// ── 計画 (plan: 曲を受け取ったときに 1 回) ──
//   協奏曲の和音は最大4声を席へ配る。真ん中の音も必ず誰かが弾く。
//   弦: 開放弦がその音以下の一番高い弦。今の弦で開放から 7 半音以内なら弦を変えない (ORCHESTRA.md §6.1)。
//   左手: ポジション (1 の指が開放弦から何半音か) と指。届く範囲を出たら一番近い所へ移る (シフト)。
//   弓: スラーの組 = 1 ストローク。向きは楽譜の bow。長さ = k・長さ・(0.5 + v/127) (弓の長さに対する割合)。
//       弓のどこから弾き始めるか (u0) は、曲全体を通して「弓の残り」が足りるように動的計画法で決める:
//       長いダウンの前は毛箱へ寄せておく・短い音は弓の真ん中 (強いと元寄り)・休みでは弓を上げて戻す、を費用にして一番安い並びを取る。
// ── 毎コマ (pose) ──
//   体を少しゆらす → 楽器を構える (バイオリン・ビオラは胸と一緒に動く、チェロ・コントラバスは床とひざで止まっている) →
//   左手 (ポジションの所へ手を置き、指 1 本ずつを弦の止める点へ。ビブラート) → 弓 (弦の並びの弧に毛を当てる) → 右手で毛箱を持つ。
//   ピチカート: 弓を手のひらに握り、人差し指で指板の端の近くの弦を音の頭ではじく (バイオリン・ビオラは手を指板の端の E 線の側の横に置き、
//   弓は握りこぶしから右の肩の横へ立てる)。長い休み (6 秒以上): バイオリン・ビオラは楽器をひざへ下ろす。
//   体と楽器が重ならないように: 高いポジションで左手が胴の肩に入るなら、手を胴の外 (高い弦の側) と上へ逃がす (楽器ごとの上限つき)。
//   右手の指が毛箱の近くで表板に入るなら、その指だけ曲げを変える。楽器を下ろす・構える途中は、楽器を体の前へ回して動かす。
import * as THREE from "three";
import { V, clamp, lerp, smooth, Cursor, bowHairToString } from "./base.js";
import * as R from "../concerto-rig.js";
import { bodyDepth, STRING_DIMS } from "../instruments.js";
import { FINGER_SPLIT } from "../robot-lite.js";

const UP = V(0, 1, 0);
const TAU = Math.PI * 2;
const S = R.S;

/* ─────────── 楽器ごとの型 ─────────── */
// across: 弓の先の向き (楽器の +x = 高い弦の側に対して)。バイオリンは毛箱が E 線の側、チェロ・コントラバスは毛箱が C/E 線の側
// hand: base = 1 の指のはじめの位置 (開放弦から半音)、lo..hi = その位置から届く半音のずれ、fingers = ずれ → 指 (1 人差し指 … 4 小指)
//       thumbFrom / thumbFingers: このポジションから上は、親指のポジションの指づかい (チェロ。小指を使わない)
// lift: 休みで弓を上げる高さ (m)、lower: 長い休みで楽器をひざへ下ろすか
// frogMin: 弦ごとに、弓の元の方で使ってよい一番小さい u (コントラバスは高い弦の毛箱まで右腕が届かないので、そこを使わない。測った値)
// past: 高いポジションで、手がネックの根元 (胴の上の端) をこえて胴の上へ出てよい長さ (m)。コントラバスは指板と表板の間が広いので、
//       親指のポジションのように手を胴の肩の上まで下ろす (弦の真ん中の 1 オクターブ上まで届く)
// push: 左手の箱が胴に入るとき、手を胴の外へ逃がしてよい長さの上限 (m)。大きすぎると指が止める点に届かない (測って決めた値。既定 0.03)
const KIND = {
  violin: { across: -1, lower: true, lift: 0.025, hand: { base: 2, lo: -1, hi: 5, fingers: [1, 1, 2, 2, 3, 4, 4] }, past: 0.05 },
  viola: { across: -1, lower: true, lift: 0.025, hand: { base: 2, lo: -1, hi: 5, fingers: [1, 1, 2, 2, 3, 4, 4] }, past: 0.05 },
  cello: { across: 1, lower: false, lift: 0.026, hand: { base: 2, lo: -1, hi: 4, fingers: [1, 1, 2, 3, 4, 4], thumbFrom: 8, thumbFingers: [1, 1, 2, 2, 3, 3] }, past: 0.1, push: 0.09 },
  bass: { across: 1, lower: false, lift: 0.028, hand: { base: 2, lo: 0, hi: 2, fingers: [1, 2, 4], thumbFrom: 7, thumbFingers: [1, 2, 3] }, frogMin: [0.02, 0.05, 0.13, 0.22], past: 0.1, push: 0.08 },
};
// 左手 (楽器の中の向き・m): fingers / dorsal = 指の向きと手の甲の向き (手のひらはネックの方を向き、指は上へ出てから弦の上へ曲がる)。
//   knuckle = 中指と薬指の付け根の間を置く所 (x: 今の弦から高い弦の側へ、y: 手の位置 (1 の指と上の指の真ん中) から、z: 弦の面から)。
//   thumb = 親指の先 (x: ネックの真ん中から、z: 弦の面から。ネックの裏)
//   pole / poleLow = 肘を出す向き (体の向きの中。低い弦を弾くときは肘を内へ入れる)
// 右手 (弓の中の向き: x = 弓の横 (バイオリンは渦巻きの側、チェロ・コントラバスは駒の側 = 指をかぶせる側)、y = 先の側、z = 竿の側 (表板から離れる側)):
//   frog / tip = 毛箱 (u = 0) と先 (u = 1) での指の向き (手首 → 指の付け根) と手の甲の向き。手は竿の上にかぶさり (手のひらは竿へ)、
//   指は竿を包んで毛の高さで止まる (指が毛より下へ垂れると、毛箱の近くで楽器の表板に入る)。先では人差し指の側を先へ倒す (回内)
// ピチカートの右手 (pizz、楽器の中の向き): fingers / dorsal = 指と手の甲の向き、pole = 肘を出す向き (体の向きの中)、
//   fist = 握った弓の毛箱 → 先の向き (手の骨の中: x = 手首の側、y = 手の甲の側、z = 親指の側。省くと FIST_AXIS)、
//   above = 人差し指の先を弦の何 m 上に置くとして手首を決めるか (省くと 0.022)。
//   バイオリン・ビオラは手を E 線の側から横に向けて置き (親指が上・手首は目より下)、弓は親指の側から上へ立てる。
//   (手を弦の上から下へ向けると手首が目より上に上がり、弓が横へ寝て となりの人の頭の高さを横切っていた。
//    弓の先を下へ向けると、持ちかえる 0.6 秒の間に弓がビオラの胴を通る)
const HOLD = {
  violin: {
    left: { fingers: [-0.25, 0.05, 0.97], dorsal: [0.97, 0, 0.25], knuckle: [0.045, 0, -0.03], thumb: [-0.004, 0.016, -0.036], pole: [-0.35, -1, 0.15], poleLow: [-0.8, -1, 0.3] },
    bow: { frog: { fingers: [0.7, 0.25, -0.65], dorsal: [0.65, 0, 0.7] }, tip: { fingers: [0.55, 0.45, -0.7], dorsal: [0.7, -0.1, 0.5] }, pole: [-1, -0.45, -0.25] },
    pizz: { fingers: [-0.9, -0.08, -0.43], dorsal: [0, 0.98, -0.18], pole: [-1, -0.8, -0.2], fist: [0.2, -0.2, 0.96], above: 0.01 },
  },
  cello: {
    left: { fingers: [-0.42, 0, 1], dorsal: [1, 0.05, 0.42], knuckle: [0.055, 0, -0.042], thumb: [-0.004, 0.02, -0.058], pole: [1, -0.15, 0.15], poleLow: [1, 0.15, 0.1] },
    bow: { frog: { fingers: [0.65, 0.25, -0.7], dorsal: [0.7, 0, 0.65] }, tip: { fingers: [0.5, 0.45, -0.75], dorsal: [0.75, -0.1, 0.45] }, pole: [-1, -0.55, -0.1] },
    // fist: 握った弓の先を手首の側・手の甲の側へ (弓は手から下へ、チェロの右の横に垂れる)。
    // 既定の向き (FIST_AXIS) では、持ちかえる途中に弓の先が前の列のチェロの人の胸と楽器に入り (752・781 拍で 30〜50 mm)、持っている間も前の人のももに当たっていた
    pizz: { fingers: [0.1, -0.2, -1], dorsal: [-0.6, -0.8, 0.0], pole: [-1, -0.9, 0], fist: [-0.5, 0.8, 0.2] },
  },
  bass: {
    left: { fingers: [-0.3, 0, 0.95], dorsal: [0.95, 0.05, 0.3], knuckle: [0.06, 0, -0.055], thumb: [-0.004, 0.025, -0.07], pole: [1, -0.2, 0.05], poleLow: [1, 0.1, 0.05], poleHigh: [0.7, 0.7, -0.3] },
    bow: { frog: { fingers: [0.65, 0.25, -0.7], dorsal: [0.7, 0, 0.65] }, tip: { fingers: [0.5, 0.45, -0.75], dorsal: [0.75, -0.1, 0.45] }, pole: [-1, -0.6, -0.1] },
    pizz: { fingers: [0.1, -0.2, -1], dorsal: [-0.6, -0.8, 0.0], pole: [-1, -0.9, 0] },
  },
};
HOLD.viola = HOLD.violin;
// 右手の指 (弓を持つ形): 親指は毛箱の前で曲げ、ほかの指は竿を包む (ロボットの指は長いので、ゆるく握る形)。
// 小指は毛箱では丸く竿の上、先では少しゆるむ。人差し指は先で少し伸びて竿を押す
const BOW_CURL_FROG = [[0.7, 0.9], [1.4, 1.55], [1.5, 1.6], [1.5, 1.6], [1.3, 1.5]];
const BOW_CURL_TIP = [[0.7, 0.85], [1.2, 1.3], [1.45, 1.55], [1.45, 1.55], [1.2, 1.3]];
const BOW_SPREAD = [1.1, 0.12, 0, -0.1, -0.22];
const PIZZ_CURL = [[0.7, 0.9], [0.25, 0.3], [1.35, 1.2], [1.4, 1.2], [1.35, 1.1]];   // 人差し指だけ伸ばし、ほかは弓を握る
const _curlA = BOW_CURL_FROG.map((c) => c.slice());

/* ─────────── 計画: 声部・弦・指 ─────────── */
// 和音は全ての音を別の声へ配り、席を順に割り当てる。伸ばしている声には次の音を重ねない
function splitVoices(notes) {
  const groups=[];for(const n of notes){const g=groups.at(-1);if(g&&Math.abs(g.t0-n.t0)<1e-4)g.notes.push(n);else groups.push({t0:n.t0,notes:[n]});}
  const count=Math.max(1,...groups.map(g=>g.notes.length)),voices=Array.from({length:count},()=>[]);
  for(const g of groups){const ns=g.notes.slice().sort((a,b)=>b.p-a.p);for(let v=0;v<count;v++){const n=ns[Math.min(ns.length-1,Math.floor(v*ns.length/count))],list=voices[v],last=list.at(-1);if(last&&last.t1>n.t0+.001)continue;list.push({...n});}}
  return voices;
}
// 弦・ポジション・指を決める (n.str, n.semi, n.pos, n.finger)。finger 0 = 開放弦
function planLeft(voice, open, H) {
  let cur = -1, b = H.base;
  for (const n of voice) {
    let hi = 0;
    for (let i = 0; i < open.length; i++) if (open[i] <= n.p) hi = i;
    let i = hi;
    if (cur >= 0 && cur < hi && n.p - open[cur] <= 7) i = cur;     // 今の弦で 7 半音以内なら弦を変えない
    const s = Math.max(0, n.p - open[i]);
    n.under = n.p < open[0];                                        // 一番低い開放弦より低い音 (コントラバスの延長): 開放弦として扱う
    let f = 0;
    if (s > 0) {
      if (s > b + H.hi) b = s - H.hi + 1;                           // 上へシフト
      else if (s < b + H.lo) b = Math.max(1, s);                    // 下へシフト
      f = (b >= (H.thumbFrom ?? 99) ? H.thumbFingers : H.fingers)[s - b - H.lo];   // チェロの親指のポジションでは小指を使わない
    }
    n.str = i; n.semi = s; n.pos = b; n.finger = f; cur = i;
  }
}

/* ─────────── 計画: 弓 ─────────── */
const K_SUS = 0.69, K_SHORT = 0.36;
// 1 音に使いたい弓の割合
function wantLen(n) {
  const v = n.v2 != null ? (n.v + n.v2) / 2 : n.v, d = n.t1 - n.t0, loud = 0.5 + v / 127;
  if (n.art === "short") return clamp(K_SHORT * d * loud, 0.06, 0.15);
  return K_SUS * d * loud * (n.acc ? 1.15 : 1);
}
// スラーの組 = 1 ストローク
function buildStrokes(arco) {
  const strokes = [];
  let cur = null;
  for (const n of arco) {
    const join = cur && n.slur && n.slur === cur.slur && n.art !== "trem" && cur.type !== "trem" && n.t0 - cur.t1 < 0.03;
    if (join) { cur.notes.push(n); cur.t1 = n.t1; cur.L += wantLen(n); cur.type = "sus"; }
    else {
      cur = { t0: n.t0, t1: n.t1, dir: n.bow === "U" ? -1 : 1, slur: n.slur, type: n.art === "trem" ? "trem" : n.art === "short" ? "short" : "sus", notes: [n], L: wantLen(n), v: n.v };
      strokes.push(cur);
    }
    n.k = strokes.length - 1;
  }
  for (const s of strokes) s.L = s.type === "trem" ? 0 : clamp(s.L, s.type === "short" ? 0.06 : 0.08, 0.95);
  return strokes;
}
// 弓のどこで弾くかを、曲全体で費用が一番小さくなるように決める (u は 0.02 … 0.98 を 96 等分)
const NU = 97, U0 = 0.02, DU = 0.96 / (NU - 1), uOf = (j) => U0 + DU * j;
function planBowPositions(strokes, breaks, frogMin) {
  if (!strokes.length) return;
  let C = new Float64Array(NU);
  const backS = [], backE = [];
  const S0 = new Float64Array(NU), E0 = new Float64Array(NU);
  for (let k = 0; k < strokes.length; k++) {
    const s = strokes[k], prev = strokes[k - 1], gap = prev ? s.t0 - prev.t1 : Infinity;
    const free = !prev || gap > 1.5 || breaks.has(k);
    // 1) 前のストロークの終わり → このストロークの始まり (休みがあれば弓を上げて戻せる)
    const bs = new Int16Array(NU);
    if (free) {
      let m = Infinity, mj = 0; for (let j = 0; j < NU; j++) if (C[j] < m) { m = C[j]; mj = j; }
      S0.fill(m); bs.fill(mj);
    } else if (gap < 0.09) {
      S0.set(C); for (let j = 0; j < NU; j++) bs[j] = j;
    } else {
      const cap = Math.min(0.9, 3 * (gap - 0.06)), capJ = Math.floor(cap / DU), lifted = gap >= 0.25;
      const base = lifted ? 0.01 : 0.03, per = lifted ? 0.08 : 0.25;
      for (let j = 0; j < NU; j++) {
        let m = C[j], mj = j;
        for (let q = Math.max(0, j - capJ), qe = Math.min(NU - 1, j + capJ); q <= qe; q++) {
          if (q === j) continue;
          const c = C[q] + base + per * Math.abs(j - q) * DU;
          if (c < m) { m = c; mj = q; }
        }
        S0[j] = m; bs[j] = mj;
      }
    }
    // 2) ストローク: 始まり j1 → 終わり j2
    const be = new Int16Array(NU);
    E0.fill(Infinity);
    const jLo = frogMin ? Math.max(0, Math.ceil((Math.max(...s.notes.map((n) => frogMin[n.str] ?? 0)) - U0) / DU - 1e-9)) : 0;
    if (s.type === "trem") {
      for (let j = jLo; j < NU; j++) { E0[j] = S0[j] + 2 * (uOf(j) - 0.62) ** 2; be[j] = j; }
    } else {
      const L = s.L, maxJ = Math.min(NU - 1, Math.ceil((1.7 * L + 0.08) / DU));
      const short = s.type === "short", centre = 0.5 - 0.2 * clamp((s.v - 64) / 64, -1, 1);
      for (let j1 = jLo; j1 < NU; j1++) {
        const c0 = S0[j1]; if (!Number.isFinite(c0)) continue;
        for (let dj = 1; dj <= maxJ; dj++) {
          const j2 = j1 + s.dir * dj; if (j2 < jLo || j2 >= NU) break;
          const a = dj * DU, dev = (a - L) / L;
          let c = c0 + (dev < 0 ? 1 : 0.25) * dev * dev;
          if (short) c += 0.6 * ((uOf(j1) + uOf(j2)) / 2 - centre) ** 2;
          if (c < E0[j2]) { E0[j2] = c; be[j2] = j1; }
        }
      }
    }
    backS.push(bs); backE.push(be);
    C = Float64Array.from(E0);
  }
  // 後ろからたどる
  let j = 0, m = Infinity;
  for (let q = 0; q < NU; q++) if (C[q] < m) { m = C[q]; j = q; }
  for (let k = strokes.length - 1; k >= 0; k--) {
    const s = strokes[k], j1 = backE[k][j];
    s.u1 = uOf(j); s.u0 = uOf(j1);
    j = backS[k][j1];
  }
}
// ストロークの中の進み方 (0 → 1) を、音ごとの分け前と立ち上がりの形から節点にして、単調な 3 次補間で滑らかにつなぐ
function strokeKnots(s) {
  const T = [], F = [];
  const push = (t, f) => { if (T.length && t - T[T.length - 1] < 1e-4) { F[F.length - 1] = f; return; } T.push(t); F.push(f); };
  const total = s.notes.reduce((a, n) => a + wantLen(n), 0) || 1;
  let f = 0;
  s.notes.forEach((n, i) => {
    const w = wantLen(n) / total, d = n.t1 - n.t0;
    push(n.t0, f);
    if (n.art === "short") push(n.t0 + 0.55 * d, f + 0.85 * w);
    else if (n.acc) push(n.t0 + Math.min(0.12, 0.3 * d), f + 0.32 * w);
    else if (s.notes.length === 1 && d > 0.25) { const r = Math.min(0.08, 0.2 * d), a = 0.5 * r / (d - r); push(n.t0 + r, a); push(n.t1 - r, 1 - a); }
    f += w; push(n.t1, f);
    void i;
  });
  F[F.length - 1] = 1;
  // 傾き (Fritsch–Butland。両端は 0 = 弓を返す所で止まる)
  const M = new Float64Array(T.length);
  for (let i = 1; i < T.length - 1; i++) {
    const h0 = T[i] - T[i - 1], h1 = T[i + 1] - T[i], d0 = (F[i] - F[i - 1]) / h0, d1 = (F[i + 1] - F[i]) / h1;
    M[i] = d0 * d1 <= 0 ? 0 : 3 * (h0 + h1) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
  }
  s.kt = T; s.kf = F; s.km = M;
}
function strokeProgress(s, t) {
  const T = s.kt, F = s.kf, M = s.km, n = T.length;
  if (t <= T[0]) return 0;
  if (t >= T[n - 1]) return 1;
  let i = 0; while (i < n - 2 && T[i + 1] <= t) i++;
  const h = T[i + 1] - T[i], x = (t - T[i]) / h, x2 = x * x, x3 = x2 * x;
  return (2 * x3 - 3 * x2 + 1) * F[i] + (x3 - 2 * x2 + x) * h * M[i] + (-2 * x3 + 3 * x2) * F[i + 1] + (x3 - x2) * h * M[i + 1];
}

// 1 つの声部の計画を全部作る
function planVoice(notes, kind, inst) {
  const K = KIND[kind], open = inst.spec.strings.map((s) => s.open);
  planLeft(notes, open, K.hand);
  const arco = notes.filter((n) => n.art !== "pizz"), pizz = notes.filter((n) => n.art === "pizz");
  const strokes = buildStrokes(arco);
  // ピチカートをはさんだ所は、弓の位置を自由に決め直してよい
  const breaks = new Set();
  for (let k = 1; k < strokes.length; k++) if (pizz.some((p) => p.t0 >= strokes[k - 1].t1 - 1e-6 && p.t0 < strokes[k].t0)) breaks.add(k);
  planBowPositions(strokes, breaks, K.frogMin);
  for (const s of strokes) if (s.type !== "trem") strokeKnots(s);
  // 弓を上げる・戻す (ストロークの前の休み)。land = 弦に下ろし終わる時刻
  strokes.forEach((s, k) => {
    const prev = strokes[k - 1], g0 = prev ? prev.t1 : -Infinity, gap = s.t0 - g0;
    const move = prev ? Math.abs(s.u0 - prev.u1) : 0;
    s.pre = { g0, gap, lift: 0, rise: 0, fall: 0, land: s.t0, arc: false, ma: s.t0, mb: s.t0 };
    if (!prev || gap >= 0.25) {
      s.pre.lift = K.lift; s.pre.land = s.t0 - (gap > 1.5 ? 0.35 : Math.min(0.04, gap / 6));
      s.pre.fall = Math.min(0.18, gap / 3); s.pre.rise = Math.min(0.15, gap / 3);
      // 上げた弓を戻す時間 (ma → mb): 上げ始めてすぐ動かし、長い休みでも 0.35 + 0.9・距離 秒で戻し終えて待つ。弦を移るのも同じ時間の中
      s.pre.ma = Number.isFinite(g0) ? g0 + 0.3 * s.pre.rise : s.t0 - 0.6;
      s.pre.mb = Math.max(s.pre.ma + 0.01, Math.min(s.pre.land - 0.3 * s.pre.fall, s.pre.ma + 0.35 + 0.9 * move));
    } else if (gap >= 0.06 && (move > 0.004 || s.type === "short")) {
      s.pre.lift = Math.min(0.02, 0.005 + 0.03 * move); s.pre.land = s.t0 - 0.012; s.pre.arc = true;
    }
  });
  // 弦を移る所 (弓)、弾く所 (駒から指板の端までの割合。強いほど駒の近く)
  arco.forEach((n, i) => {
    const p = arco[i - 1];
    n.sf = clamp(0.5 - 0.3 * (n.v / 127), 0.15, 0.45) + (n.art === "short" ? 0.06 : 0) + (n.art === "trem" ? 0.04 : 0);
    n.xex = 0; n.xin = 0;
    if (!p) { n.cA = 0.034; n.cB = -0.004; return; }
    const gap = n.t0 - p.t1, d = p.t1 - p.t0, di = Math.abs(n.str - p.str);
    // 弦を移る時間: 休みがあればその中 (頭の 4 ms 前に終わる)。続いているときは音の頭をはさんで半分ずつ (毛は 2 本の弦の間を転がる)
    // 弓を上げて戻す休みでは、戻すのと一緒に移る (毛箱の近くで高い弦に残ると、コントラバスでは右手が毛箱に届かない)
    const pre = n === strokes[n.k]?.notes[0] ? strokes[n.k].pre : null;
    if (pre && pre.lift && !pre.arc && gap >= 0.25) { n.cA = n.t0 - pre.ma; n.cB = pre.mb - n.t0; }
    else if (gap >= 0.05) { n.cA = Math.min(gap, 0.12) + 0.004; n.cB = -0.004; }
    else { const c = clamp(0.03 + 0.02 * di, 0.03, Math.min(0.7 * d, 0.7 * (n.t1 - n.t0))); n.cA = c / 2; n.cB = c / 2; }
    // 2 本以上とばす弦の移り (間の弦をまたぐ) は、その間、前の弦・次の弦から毛が離れる (確かめで外す)
    if (di >= 2 && gap < 0.05) { p.xex = n.cA - Math.max(0, gap); n.xin = n.cB; }
  });
  // 左手が移る所 (指を置く・手を動かす)。ex = 前の音の終わりの、指が止める点から離れてよい時間 (確かめで外す)
  notes.forEach((n, i) => {
    const p = notes[i - 1];
    n.ex = 0;
    if (!p) { n.shift = 0; n.drop = 0.04; return; }
    const gap = n.t0 - p.t1, d = p.t1 - p.t0;
    n.shift = n.pos === p.pos ? 0 : gap >= 0.06 ? Math.min(gap, 0.14) : clamp(0.05 + 0.006 * Math.abs(n.pos - p.pos), 0.05, 0.4 * d);
    n.drop = clamp(gap + 0.5 * d, 0.02, 0.04);
    const moves = n.shift > 0 || (p.finger && p.finger === n.finger && (p.str !== n.str || p.semi !== n.semi));
    p.ex = moves ? Math.max(0, Math.max(n.shift, n.drop) - Math.max(0, gap)) : 0;
  });
  // ピチカートの区間 (弓を握りかえる): a0 → a1 で持ちかえ、b0 → b1 で戻す
  const pizzRuns = [];
  for (const n of pizz) {
    const r = pizzRuns[pizzRuns.length - 1];
    const between = r && arco.some((a) => a.t0 > r.last.t0 && a.t0 < n.t0);
    if (r && !between) { r.notes.push(n); r.last = n; } else pizzRuns.push({ notes: [n], first: n, last: n });
  }
  for (const r of pizzRuns) {
    let before = null; for (const a of arco) if (a.t1 <= r.first.t0 + 1e-6) before = a;
    const after = arco.find((a) => a.t0 >= r.last.t0);
    const g0 = before ? before.t1 : r.first.t0 - 2, g1 = after ? after.t0 : r.last.t1 + 2;
    r.a1 = r.first.t0 - 0.15; r.a0 = Math.max(g0 + 0.05, r.a1 - 0.6);
    if (r.a0 > r.a1 - 0.15) r.a0 = r.a1 - 0.15;
    r.b0 = Math.max(r.last.t0 + 0.2, r.last.t1); r.b1 = Math.min(g1 - 0.15, r.b0 + 0.6);
    if (r.b1 < r.b0 + 0.15) r.b0 = r.b1 - 0.15;
  }
  // 長い休み (6 秒以上) と曲の終わり: 楽器・弓を休める (d0 → d1 で下ろし、e0 → e1 で構える。構え終わりは入りの 0.3 秒前)
  const rests = [];
  let end = -Infinity;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (i && n.t0 - end >= 6) rests.push({ d0: end + 0.5, d1: end + 1.7, e0: n.t0 - 1.2, e1: n.t0 - 0.3 });
    end = Math.max(end, n.t1);
  }
  if (notes.length) rests.push({ d0: end + 1.2, d1: end + 2.6, e0: Infinity, e1: Infinity });
  // アクセント (前へ少し乗り出す): acc、休みのあとの強い音、急に強くなる音
  const accents = [];
  notes.forEach((n, i) => {
    const p = notes[i - 1], after = !p || n.t0 - p.t1 > 0.2;
    if (n.acc || (n.v >= 108 && after) || (p && n.v - p.v >= 30)) accents.push({ t0: n.t0, a: (n.acc ? 1 : 0.7) * clamp(n.v / 127, 0.3, 1) });
  });
  return {
    notes, arco, pizz, strokes, pizzRuns, rests, accents, open, lift: K.lift, lower: K.lower,
    cN: new Cursor(notes), cA: new Cursor(arco), cS: new Cursor(strokes), cAcc: new Cursor(accents),
  };
}

/* ─────────── 計画を時刻で読む ─────────── */
// 弓の位置 u (0 毛箱 … 1 先)。t は人ごとにずらした時刻
function bowU(P, t) {
  const st = P.strokes; if (!st.length) return 0.5;
  const k = P.cS.at(t);
  if (k < 0) return st[0].u0;
  const s = st[k];
  if (t <= s.t1) {
    if (s.type === "trem") {
      const d = s.t1 - s.t0, f = Math.max(1, Math.round(14 * d)) / d, env = smooth((t - s.t0) / 0.03) * smooth((s.t1 - t) / 0.03);
      return s.u0 + 0.026 * env * Math.sin(TAU * f * (t - s.t0));
    }
    return s.u0 + (s.u1 - s.u0) * strokeProgress(s, t);
  }
  const nx = st[k + 1]; if (!nx) return s.u1;
  const pre = nx.pre;
  if (!pre.lift || Math.abs(nx.u0 - s.u1) < 1e-6) return t < nx.t0 ? s.u1 : nx.u0;
  // 弓を上げて戻す: 上がっている間に動かす
  const w = pre.land - pre.g0, a = pre.arc ? pre.g0 + 0.15 * w : pre.ma, b = pre.arc ? pre.land - 0.15 * w : pre.mb;
  return lerp(s.u1, nx.u0, smooth((t - a) / Math.max(0.01, b - a)));
}
// 弓の浮き (m)
function bowLift(P, t) {
  const st = P.strokes; if (!st.length) return 0.03;
  const k = P.cS.at(t);
  if (k >= 0 && t <= st[k].t1) return 0;
  const nx = st[k + 1];
  if (!nx) return P.lift * smooth((t - st[k].t1) / 0.2);
  const pre = nx.pre; if (!pre.lift) return 0;
  if (t >= pre.land) return 0;
  if (pre.arc) { const x = (t - pre.g0) / Math.max(0.01, pre.land - pre.g0); return pre.lift * Math.sin(Math.PI * clamp(x, 0, 1)); }
  const up = Number.isFinite(pre.g0) ? smooth((t - pre.g0) / pre.rise) : 1, down = smooth((pre.land - t) / pre.fall);
  return pre.lift * Math.min(up, down);
}
// 弓が当たっている弦 (小数 = 2 本の弦の間を移っている) と、駒からの位置の割合
function bowString(P, t, out) {
  const A = P.arco; if (!A.length) { out.sigma = 1.5; out.sf = 0.3; return out; }
  const i = P.cA.at(t), n = A[Math.max(0, i)], nx = A[i + 1], pv = i > 0 ? A[i - 1] : null;
  let sig = n.str, sf = n.sf;
  if (i >= 0 && pv && t < n.t0 + n.cB) sig = lerp(pv.str, n.str, smooth((t - (n.t0 - n.cA)) / (n.cA + n.cB)));
  if (i >= 0 && nx) {
    if (t > nx.t0 - nx.cA) sig = lerp(n.str, nx.str, smooth((t - (nx.t0 - nx.cA)) / (nx.cA + nx.cB)));
    const r = Math.max(0.1, nx.cA);
    sf = lerp(n.sf, nx.sf, smooth((t - (nx.t0 - r)) / r));
  }
  out.sigma = sig; out.sf = sf; return out;
}
// ピチカートの持ちかえの重み (0 = 弓で弾く、1 = ピチカート)
function pizzWeight(P, t) {
  for (const r of P.pizzRuns) {
    if (t < r.a0 || t > r.b1) continue;
    if (t < r.a1) return smooth((t - r.a0) / (r.a1 - r.a0));
    if (t > r.b0) return 1 - smooth((t - r.b0) / (r.b1 - r.b0));
    return 1;
  }
  return 0;
}
// 楽器を休める重み (0 = 構えている、1 = 休めている)。part = "bow" | "inst" | null (どちらか一方でも動いている間)
// バイオリン・ビオラは、下ろすときは弓が先 (楽器から離してから)、構えるときは楽器が先 (弓はあとから弦の上へ)
function restWeight(P, t, part = null) {
  for (const r of P.rests) {
    if (t < r.d0 || t > r.e1) continue;
    const lo = r.d1 - r.d0, hi = r.e1 - r.e0;
    let a0 = r.d0, a1 = r.d1, b0 = r.e0, b1 = r.e1;
    if (part === "bow" && P.lower) { a1 = r.d0 + 0.6 * lo; b0 = r.e0 + 0.5 * hi; }
    if (part === "inst" && P.lower) { a0 = r.d0 + 0.5 * lo; b1 = r.e0 + 0.55 * hi; }
    if (t < a0 || t > b1) return 0;
    if (t < a1) return smooth((t - a0) / (a1 - a0));
    if (t > b0) return 1 - smooth((t - b0) / (b1 - b0));
    return 1;
  }
  return 0;
}

/* ─────────── 形の道具 ─────────── */
const _v = Array.from({ length: 12 }, () => V());
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
const _P = V(), _Q = new THREE.Quaternion(), _P2 = V(), _Q2 = new THREE.Quaternion(), _sc = V();
// 弦の並びの弧 (楽器の中・駒から t の所) を円で表し、弦 sigma の所に毛を当てる弓の点と向きを出す (楽器の中の座標)
//   contact = 毛の線が通る点、n = 弧の外向き (毛の面の外)、tng = 弧の接線 (+x の側へ)、sdir = 弦の向き (駒 → 上駒)
const ARCH = { p: [V(), V(), V(), V()], contact: V(), n: V(), tng: V(), sdir: V() };
function archAt(spec, t, sigma, out) {
  const st = spec.strings, P = out.p;
  for (let i = 0; i < 4; i++) P[i].copy(st[i].bridge).lerp(st[i].nut, t);
  // 3 点 (両端の弦と、真ん中の 2 本の中点) を通る円 (x-z 面)
  const ax = P[0].x, az = P[0].z, bx = (P[1].x + P[2].x) / 2, bz = (P[1].z + P[2].z) / 2, cx = P[3].x, cz = P[3].z;
  const d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
  const A2 = ax * ax + az * az, B2 = bx * bx + bz * bz, C2 = cx * cx + cz * cz;
  const ux = (A2 * (bz - cz) + B2 * (cz - az) + C2 * (az - bz)) / d, uz = (A2 * (cx - bx) + B2 * (ax - cx) + C2 * (bx - ax)) / d;
  const i0 = clamp(Math.floor(sigma), 0, 2), f = clamp(sigma - i0, 0, 1);
  const a0 = Math.atan2(P[i0].z - uz, P[i0].x - ux), a1 = Math.atan2(P[i0 + 1].z - uz, P[i0 + 1].x - ux);
  const r0 = Math.hypot(P[i0].x - ux, P[i0].z - uz), r1 = Math.hypot(P[i0 + 1].x - ux, P[i0 + 1].z - uz);
  const a = lerp(a0, a1, f), r = lerp(r0, r1, f) + lerp(st[i0].radius, st[i0 + 1].radius, f) + 0.0004;
  out.contact.set(ux + r * Math.cos(a), P[0].y, uz + r * Math.sin(a));
  out.n.set(Math.cos(a), 0, Math.sin(a));
  out.tng.set(Math.sin(a), 0, -Math.cos(a));
  out.sdir.copy(st[i0].nut).sub(st[i0].bridge).normalize();
  _sc.copy(st[i0 + 1].nut).sub(st[i0 + 1].bridge).normalize();
  out.sdir.lerp(_sc, f).normalize();
  return out;
}

// 指 1 本を、手の中の目標の点 (手の骨の中・ロボット単位) へ曲げる (付け根の開きと 2 つの節の曲げ)
const SEG1 = FINGER_SPLIT, SEG2 = 1 - FINGER_SPLIT;
function fingerTo(f, sgn, tx, ty, tz, lim) {
  const r = f.root.position, dx = tx - r.x, dy = ty - r.y, dz = tz - r.z;
  const sp = clamp(Math.atan2(dz, sgn * dx), lim[0], lim[1]);
  const X = Math.hypot(dx, dz), Y = -dy, l1 = f.len * SEG1, l2 = f.len * SEG2;
  const D = clamp(Math.hypot(X, Y), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995);
  const c1 = Math.acos(clamp((D * D - l1 * l1 - l2 * l2) / (2 * l1 * l2), -1, 1));
  const c0 = clamp(Math.atan2(Y, X) - Math.atan2(l2 * Math.sin(c1), l1 + l2 * Math.cos(c1)), lim[2], lim[3]);
  f.root.rotation.set(0, -sgn * sp, -sgn * c0, "YZX");
  f.joint.rotation.set(0, 0, -sgn * c1);
}
// 2 つの姿勢 (位置と向き) の間をとる
function blendPose(pa, qa, pb, qb, w, outP, outQ) { outP.copy(pa).lerp(pb, w); outQ.copy(qa).slerp(qb, w); }

/* ─────────── 構え (計画のときに 1 回): 楽器の位置を体に対して覚える ─────────── */
const instQuat = (yDir, zDir) => R.basisQuat(V(0, 1, 0), yDir, V(0, 0, 1), zDir);
// root (体) に対する相対 (root の大きさ S を除いた位置と向き)
function relRoot(g, pos, quat) {
  const iq = g.root.quaternion.clone().invert();
  return { pos: pos.clone().sub(g.root.position).applyQuaternion(iq), quat: iq.multiply(quat.clone()) };
}
function fromRoot(g, rel, outP, outQ) { outP.copy(rel.pos).applyQuaternion(g.root.quaternion).add(g.root.position); outQ.copy(g.root.quaternion).multiply(rel.quat); }
function holdViolin(seat) {
  const g = seat.rig, h = seat.instrument;
  R.setSpine(g, 0.08, 0.06, 0.02);
  g.root.updateMatrixWorld(true);
  // 渦巻きは体の正面から左へ 48 度・少し上。表板は上向きから右へ 26 度ころがす (E 線の側が下)
  const yaw = 48 * Math.PI / 180, yDir = R.bodyDir(g, Math.sin(yaw), 0.16, Math.cos(yaw)).normalize();
  const x0 = new THREE.Vector3().crossVectors(yDir, R.bodyDir(g, 0, 1, 0)).normalize();
  const roll = 26 * Math.PI / 180, zDir = R.bodyDir(g, 0, 1, 0).multiplyScalar(Math.cos(roll)).addScaledVector(x0, Math.sin(roll));
  const q = instQuat(yDir, zDir);
  const collar = R.wpos(g.points.collarLeft);
  const target = collar.clone().add(R.bodyDir(g, -0.035, 0.068, 0.045));
  const pos = target.sub(h.spec.points.chin.clone().applyQuaternion(q));
  // 胸 (Spine1) に対する相対の行列: 毎コマ胸と一緒に動かす
  g.bones.Spine1.updateWorldMatrix(true, false);
  const play = new THREE.Matrix4().copy(g.bones.Spine1.matrixWorld).invert().multiply(new THREE.Matrix4().compose(pos, q, V(1, 1, 1)));
  // 休むとき: 左のももの上に立てる (渦巻きが上、表板は右前)
  const knee = R.wpos(g.bones.LeftLeg), hip = R.wpos(g.bones.LeftUpLeg);
  const base = hip.clone().lerp(knee, 0.8).add(V(0, 0.075, 0));
  const ry = R.bodyDir(g, 0.08, 1, -0.2).normalize(), rz = R.bodyDir(g, -0.7, 0, 0.7);
  rz.addScaledVector(ry, -rz.dot(ry)).normalize();
  return { mode: "chin", play, rest: relRoot(g, base, instQuat(ry, rz)), spine: [0.08, 0.06, 0.02], neck: [0.22, 0.2, 0.12], head: [0.3, 0.3, 0.12] };
}
// チェロの2人を譜面台の向きへ回す割合。弓の腕が相手の側にある外側は大きくする
// 前の内側は0.25、後ろ2列の内側は1.0。広げた席でも構えと休止移行の接触を増やさない値を保つ
const DESK_TURN = { outside: 1.5, inside: 1.0, insideFront: 0.25 };
// 同じ譜面台の2人は、指揮者を向いたままだと前の列ほど向きが内へ寄る。ひざ・弓・右腕の間も空ける。
// 2 人を譜面台の向き (2 人の真ん中から指揮者の方) の側へ回す (DESK_TURN)。体と椅子は同じ向き (席の点のまわりに回す)
function celloYaw(seat) {
  const deskYaw = seat.stand ? Math.atan2(-seat.stand.pos.x, -seat.stand.pos.z) : seat.yaw, dy = Math.atan2(Math.sin(deskYaw - seat.yaw), Math.cos(deskYaw - seat.yaw));
  const k = seat.part === "inside" && seat.row === 0 ? DESK_TURN.insideFront : (DESK_TURN[seat.part] ?? 0);
  return seat.yaw + k * dy;
}
// 椅子の向き (stage.js が椅子を置くときに使う): チェロは体と同じに回した向き、ほかは席の向き
export function chairYaw(seat) { return (seat.instrumentKind ?? seat.instrument) === "cello" ? celloYaw(seat) : seat.yaw; }
function holdCello(seat) {
  const g = seat.rig, h = seat.instrument;
  R.sit(g, { ...seat, yaw: celloYaw(seat) }, { forward: 0.05, lift: 0.008, feet: { Left: { x: 0.27, z: 0.32, knee: 0.62 }, Right: { x: -0.29, z: 0.3, knee: 0.62 } } });
  R.setSpine(g, 0.12, 0, 0);
  g.root.updateMatrixWorld(true);
  const pin = R.bodyPoint(g, 0.0, 0, 0.66); pin.y = seat.floorY;
  const neckTo = R.bodyPoint(g, 0.15, 1.08, 0.09);
  const yDir = neckTo.clone().sub(pin).normalize();
  const turn = -18 * Math.PI / 180;   // 表板を少し右 (弓の側) へ向ける
  const q = instQuat(yDir, R.bodyDir(g, Math.sin(turn), 0, Math.cos(turn)));
  const pos = pin.clone().addScaledVector(yDir, pin.distanceTo(neckTo) - h.spec.nutY);
  return { mode: "floor", world: { pos, quat: q }, spine: [0.12, 0, 0] };
}
function holdBass(seat) {
  const g = seat.rig, h = seat.instrument;
  // 高い椅子に浅く。左足は椅子の足掛けの輪の左前に、つま先を外へ向けて乗せる (楽器の胴に入らないように)
  R.sit(g, seat, { forward: 0.05, feet: { Left: { x: 0.14, z: 0.18, knee: 0.3 }, Right: { x: -0.2, z: 0.42, knee: 0.4 } } });
  const ring = R.bodyPoint(g, 0.16, 0, 0.02); ring.y = seat.floorY + 0.32 + 0.012;
  R.solveLeg(g, "Left", ring.add(V(0, R.SOLE, 0)), { knee: R.bodyDir(g, 0.55, 0.2, 1), foot: { fwd: R.bodyDir(g, 0.75, 0, 0.66).normalize() } });
  R.setSpine(g, 0.1, 0.12, 0);
  g.root.updateMatrixWorld(true);
  // 楽器の位置は、体 (もも・ひざ・胸) が胴に入らず、弓の毛箱に右手が届く所 (舞台の作りで探した値)
  const pin = R.bodyPoint(g, 0.2, 0, 0.6); pin.y = seat.floorY;
  const neckTo = R.bodyPoint(g, 0.18, 1.7, 0.2);
  const yDir = neckTo.clone().sub(pin).normalize();
  const turn = -45 * Math.PI / 180;
  const q = instQuat(yDir, R.bodyDir(g, Math.sin(turn), 0, Math.cos(turn)));
  const pos = pin.clone().addScaledVector(yDir, pin.distanceTo(neckTo) - h.spec.nutY);
  return { mode: "floor", world: { pos, quat: q }, spine: [0.1, 0.12, 0] };
}
// 弓の中の、右手で持つ点 (毛箱の前・竿の上)。持ち手の大きさ (h.scale) をかけた所
const gripLocal = (b, out = V()) => out.set(0, 0.016 * b.scale.y, 0.019 * b.scale.z);
// 長い休みの肘を出す向き (体の向きの中: x = 左、y = 上、z = 前)。どちらも体の横へ下ろす (同じ譜面台の人は 0.52〜0.62 m となりにいる)。
// left = 楽器をももに立てて持つ左腕、right = 弓をももに置く右腕 (休みの重みで、弓で弾くときの向きから移る)
const REST_POLE = { left: [0.1, -1, 0.3], right: [-0.15, -1, -0.2] };
// 弓を休める所へ動かす道: 動かす点 (毛箱から毛の長さの割合) と、途中で上へ浮かせる高さ (m)
// (弓の真ん中を動かす点にすると、向きが変わる途中で毛箱と右手が体の右へ 40 cm 振り出し、となりの人の胸に入っていた)
const REST_PATH = { pivot: 0.25, arc: 0.05 };
// 低弦で弓を休めるとき、先を少し起こしてひざを避ける角度 (rad)。広げた列間で前の椅子にも当たらない
const FLOOR_TIP_TURN = -0.35;
// 弓を休める所: 右のももの上で毛箱を持ち、先を前の右下へ (左のひざに立てる楽器から離す)
function bowRestPose(seat) {
  const g = seat.rig, b = seat.bow;
  g.root.updateMatrixWorld(true);
  const knee = R.wpos(g.bones.RightLeg), hip = R.wpos(g.bones.RightUpLeg);
  const grip = hip.clone().lerp(knee, 0.62).add(V(0, 0.085, 0)).add(R.bodyDir(g, -0.03, 0, 0));
  // 弓の先までひざから浮かせる。楽器の長さと座り方に合わせて高さを変える
  if (seat.instrumentKind === "cello") grip.add(V(0, 0.1, 0));
  else grip.add(V(0, seat.instrumentKind === "bass" ? 0.04 : 0.13, 0));
  const by = R.bodyDir(g, -0.22, -0.55, 0.8).normalize();
  const bz = R.bodyDir(g, 0, 1, 0.3); bz.addScaledVector(by, -bz.dot(by)).normalize();
  const q = R.basisQuat(V(0, 1, 0), by, V(0, 0, 1), bz);
  const pos = grip.sub(gripLocal(b).applyQuaternion(q));
  return relRoot(g, pos, q);
}

/* ─────────── 弦の奏者 ─────────── */
export function createPlayers(stage, spec, seats) {
  const kind = seats[0]?.instrumentKind ?? (spec.instrument === "contrabass" ? "bass" : spec.instrument);
  const K = KIND[kind] ?? KIND.violin, Hd = HOLD[kind] ?? HOLD.violin;
  const tmp = { sig: { sigma: 0, sf: 0 } };
  return {
    kind, seats, plans: [],
    plan(notes) {
      this.notes = notes;
      const inst = seats[0]?.instrument;
      this.plans = inst ? splitVoices(notes).map((v) => planVoice(v, kind, inst)) : [];
      // 席ごとの構え・ずれ
      for (const s of seats) {
        const g = s.rig;
        s.str = {
          plan: this.plans[seats.indexOf(s) % this.plans.length],
          dt: (s.hash(11) - 0.5) * 2 * 0.012,                 // 弓の動きの時刻のずれ (±12 ms)
          amp: 1 - 0.08 * s.hash(12),                          // 弓の振れの大きさ (-8 % … 0)
          body: 0.92 + 0.16 * s.hash(13),                      // 体のゆれの大きさ (±8 %)
          phase: (s.hash(14) - 0.5) * 0.8,
          hold: kind === "cello" ? holdCello(s) : kind === "bass" ? holdBass(s) : holdViolin(s),
        };
        s.str.bowRest = bowRestPose(s);
        // 頭: 譜面台を見る形と指揮者を見る形 (首と頭の回転) を先に作っておく
        const sheet = s.stand?.sheetCentre ?? (s.stand ? s.stand.pos.clone().setY(s.stand.sheetY) : R.bodyPoint(g, 0, 1, 1));
        R.lookAt(g, sheet, 0.85); s.str.lookStand = [g.bones.Neck1.rotation.clone(), g.bones.Head.rotation.clone()];
        R.lookAt(g, V(0, 1.75, 0), 0.8); s.str.lookCond = [g.bones.Neck1.rotation.clone(), g.bones.Head.rotation.clone()];
      }
      registerChecks(stage, spec.id ?? kind, seats);
      this.pose(0);
    },
    pose(sec) {
      for (const s of seats) if (s.str?.plan) poseSeat(stage, s, kind, K, Hd, sec, tmp);
    },
  };
}

/* ─────────── 1 人の毎コマ ─────────── */
const BAR = { cursor: null, bars: null };
function barPos(stage, t) {
  if (BAR.bars !== stage.bars) { BAR.bars = stage.bars; BAR.cursor = new Cursor(stage.bars ?? []); }
  const i = BAR.cursor.at(t), b = stage.bars?.[i];
  if (!b) return t / 0.58;
  return i + clamp((t - b.t0) / Math.max(1e-3, b.t1 - b.t0), 0, 1);
}
// 今の音の大きさ (0..1) と、音が鳴っている近さ (0 = 長く休んでいる)
const ACT = { loud: 0, on: 0 };
function activity(P, t) {
  const i = P.cN.at(t), n = P.notes[i];
  if (!n) { ACT.loud = 0; ACT.on = 0; return ACT; }
  ACT.on = t <= n.t1 ? 1 : 1 - smooth((t - n.t1) / 0.8);
  ACT.loud = (n.v2 != null && t < n.t1 ? lerp(n.v, n.v2, clamp((t - n.t0) / (n.t1 - n.t0), 0, 1)) : n.v) / 127;
  return ACT;
}
function accentLean(P, t) {
  const A = P.accents, i = P.cAcc.at(t + 0.08);
  let x = 0;
  for (let k = i; k >= 0 && k > i - 3; k--) {
    const a = A[k], dt = t - a.t0;
    x += a.a * (dt < 0 ? smooth((dt + 0.08) / 0.08) : Math.exp(-dt / 0.32));
  }
  return Math.min(1.2, x);
}
// 入りの前 (2 秒以上休んだあと) とフェルマータの間は、指揮者を見る (0..1)
function glance(stage, P, t) {
  let w = 0;
  const i = P.cN.at(t + 1.5), n = P.notes[i];
  if (n && n.t0 > t - 0.5) { const p = P.notes[i - 1]; if (!p || n.t0 - p.t1 >= 2) w = smooth((t - (n.t0 - 1.5)) / 0.4) * (1 - smooth((t - n.t0 - 0.1) / 0.4)); }
  for (const f of stage.fermatas ?? []) if (t > f.t0 - 0.2 && t < f.t1 + 0.4) w = Math.max(w, smooth((t - f.t0 + 0.2) / 0.4) * (1 - smooth((t - f.t1) / 0.4)));
  return w;
}

function poseSeat(stage, seat, kind, K, Hd, sec, tmp) {
  const g = seat.rig, h = seat.instrument, st = seat.str, P = st.plan, hold = st.hold;
  const tb = sec + st.dt;                          // 弓と体の時刻 (人ごとのずれ)
  const wBowRest = restWeight(P, sec, "bow"), wRest = K.lower ? restWeight(P, sec, "inst") : 0, wPizz = pizzWeight(P, sec);
  const act = activity(P, sec), lean = accentLean(P, tb);
  // ── 体: 4 小節でひと回りのゆっくりしたゆれ (鳴っている間だけ・大きい音ほど大きい) と、アクセントで前へ
  const bp = barPos(stage, tb), sw = Math.sin(TAU * bp / 4 + st.phase), sw2 = Math.sin(TAU * bp / 2 + st.phase * 1.7);
  const amp = st.body * act.on * (0.4 + 0.6 * act.loud) * (1 - wBowRest);
  const sp = hold.spine;
  if (hold.mode === "chin") {
    R.setSpine(g, lerp(sp[0] + 0.02 * sw2 * amp + 0.07 * lean, 0.03, wRest), lerp(sp[1] + 0.05 * sw * amp, 0, wRest), lerp(sp[2] + 0.035 * sw * amp, 0, wRest));
  } else {
    R.setSpine(g, sp[0] + 0.008 * sw2 * amp + 0.025 * lean, sp[1] + 0.015 * sw * amp, sp[2] + 0.01 * sw * amp);
  }
  // ── 頭 (バイオリン・ビオラはあご当てに乗せたまま、休むときは譜面台を見る。チェロ・コントラバスは譜面台と指揮者)
  {
    let n0, h0, w;
    if (hold.mode === "chin") { n0 = hold.neck; h0 = hold.head; w = wRest; }
    else { const a = st.lookStand; n0 = [a[0].x, a[0].y, a[0].z]; h0 = [a[1].x, a[1].y, a[1].z]; w = glance(stage, P, sec); }
    const tgt = hold.mode === "chin" ? st.lookStand : st.lookCond, nod = hold.mode === "chin" ? 0 : 0.06 * lean;
    g.bones.Neck1.rotation.set(lerp(n0[0], tgt[0].x, w) + nod * 0.4, lerp(n0[1], tgt[0].y, w), lerp(n0[2], tgt[0].z, w), "YXZ");
    g.bones.Head.rotation.set(lerp(h0[0], tgt[1].x, w) + nod * 0.6, lerp(h0[1], tgt[1].y, w), lerp(h0[2], tgt[1].z, w), "YXZ");
  }
  // ── 楽器
  if (hold.mode === "chin") {
    const sp1 = g.bones.Spine1; sp1.updateWorldMatrix(true, false);
    _m.multiplyMatrices(sp1.matrixWorld, hold.play).decompose(_P, _Q, _sc);
    if (wRest > 0) {
      fromRoot(g, hold.rest, _P2, _Q2); blendPose(_P, _Q, _P2, _Q2, wRest, _P, _Q);
      // 下ろす・構える途中は、楽器を体の前へ大きく回して動かす (左の二の腕と胸をくぐらない)
      _P.add(R.bodyDir(g, 0.06, 0.03, 0.2, _v[11]).multiplyScalar(Math.sin(Math.PI * wRest)));
    }
    h.root.position.copy(_P); h.root.quaternion.copy(_Q);
  } else {
    h.root.position.copy(hold.world.pos); h.root.quaternion.copy(hold.world.quat); h.floorY = seat.floorY;
  }
  h.root.updateMatrixWorld(true);
  sdBegin(h);
  poseLeft(seat, kind, Hd.left, P, sec, wRest);
  poseBow(seat, kind, K, Hd, P, sec, tb, wPizz, wBowRest, tmp);
}

/* ─────────── 左手 ─────────── */
// 指先 (先の節の端) を置く点 (楽器の中・m): 弦 i の、上駒から半音 s の所 (弦の長さ · (1 − 2^(−s/12)))、弦の面の外へ (弦の太さ + 1.5 mm)
const PAD = 0.0015;
function padLocal(spec, i, s, out) {
  const st = spec.strings[i], L = st.nut.distanceTo(st.bridge), d = L * (1 - Math.pow(2, -s / 12));
  out.copy(st.nut).lerp(st.bridge, d / L);
  out.z += st.radius + PAD;
  return out;
}
// 弦の面の高さ (真ん中の 2 本の平均、楽器の中の y の所)
function stringZ(spec, y) {
  const a = spec.strings[1], b = spec.strings[2], t = (y - a.bridge.y) / (a.nut.y - a.bridge.y);
  return (lerp(a.bridge.z, a.nut.z, t) + lerp(b.bridge.z, b.nut.z, t)) / 2;
}
// 弦 sigma (小数は 2 本の間) の x (楽器の中の y の所)
function stringX(spec, y, sigma) {
  const i0 = Math.floor(clamp(sigma, 0, 2.999)), f = clamp(sigma, 0, 3) - i0, a = spec.strings[i0], b = spec.strings[i0 + 1];
  const t = (y - a.bridge.y) / (a.nut.y - a.bridge.y);
  return lerp(lerp(a.bridge.x, a.nut.x, t), lerp(b.bridge.x, b.nut.x, t), f);
}
// ポジション b の手の位置の y (1 の指と 4 の指のふつうの所の真ん中)
function handY(spec, b, H) {
  const st = spec.strings[1], Ls = st.nut.distanceTo(st.bridge);
  const d1 = Ls * (1 - Math.pow(2, -(b + fingerOffset(H, 1)) / 12)), d4 = Ls * (1 - Math.pow(2, -(b + fingerOffset(H, 4)) / 12));
  return st.nut.y - (d1 + d4) / 2;
}
// 指 f のふつうのずれ (ポジションの 1 の指から半音)
function fingerOffset(H, f) {
  if (!H.off) H.off = [0, 1, 2, 3, 4].map((g) => { let a = -1, b = -1; H.fingers.forEach((x, k) => { if (x === g) { if (a < 0) a = k; b = k; } }); return a < 0 ? g : (a + b) / 2 + H.lo; });
  return H.off[f];
}
// ビブラート: 0.4 秒以上の音で、手を弦の向きに ±3 mm、5.5 Hz。音の頭から 0.12 秒で入る
function vibrato(n, t) {
  if (!n || n.finger === 0 || n.t1 - n.t0 < 0.4 || t < n.t0 || t > n.t1) return 0;
  const env = smooth((t - n.t0 - 0.12) / 0.2) * smooth((n.t1 - t) / 0.08);
  return 0.003 * env * Math.sin(TAU * 5.5 * (t - n.t0));
}
// 左手の箱 (手の甲・手のひら・指の付け根・手首の玉) の点 (手の骨の中・ロボット単位、[x, y, z, 半径])
//   (箱の面のまん中も入れる: 表板はふくらんでいるので、角が外でも面のまん中が入ることがある)
const HAND_PTS = [[1.1, -0.15, 0.62, 0.34], [0, 0, 0, 0.42], [1.7, 0.02, 0.6, 0.17], [1.7, 0.02, -0.6, 0.17]];
for (const x of [0.08, 0.85, 1.62]) for (const y of [-0.23, 0.33]) for (const z of [-0.875, 0, 0.875]) HAND_PTS.push([x, y, z, 0]);
// 前腕: 軸の上の点 (太さ 0.5) と、手の甲の側の金属の板の角 (前腕の骨の中・ロボット単位)
const FORE_AXIS = [0.15, 0.35, 0.55, 0.75], FORE_PLATE = [];
for (const x of [1.3, 2.7, 4.1]) for (const z of [-0.45, 0.45]) FORE_PLATE.push([x, 0.725, z]);
const _hp2 = V(), PUSH = [1, 0.6], VIOLA_K = 0.40 / 0.356;
// 楽器の胴との符号つきの距離 (m): + = 胴の中へ入っている深さ (instruments.js の bodyDepth と同じ)、− = 胴の外の離れ
// (外では、横・上下・縦のはみ出しを合わせた長さ。bodyDepth は外の点の離れを正しく返さないので、太さのある指や腕の確かめにはこちらを使う)
const SD = { h: null, inv: new THREE.Matrix4(), p: V() };
function sdBegin(h) { h.root.updateWorldMatrix(true, false); SD.h = h; SD.inv.copy(h.root.matrixWorld).invert(); }
function outlineW(pts, f) {   // 胴の形の半分の幅 (instruments.js と同じ Catmull-Rom)
  if (f <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [y0, w0] = pts[i], [y1, w1] = pts[i + 1];
    if (f <= y1) {
      const t = (f - y0) / (y1 - y0), wm = (pts[i - 1] ?? pts[i])[1], wp = (pts[i + 2] ?? pts[i + 1])[1], t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * w0 + (-wm + w1) * t + (2 * wm - 5 * w0 + 4 * w1 - wp) * t2 + (-wm + 3 * w0 - 3 * w1 + wp) * t3);
    }
  }
  return pts[pts.length - 1][1];
}
// 胴の半分の幅を 512 に分けた表 (楽器の形ごとに 1 回作る。毎コマ形の点を頭からたどらない)
const OUTLINE_LUT = {}, LUT_N = 512;
function outlineLut(name) {
  const d = STRING_DIMS[name], a = new Float32Array(LUT_N + 1);
  for (let i = 0; i <= LUT_N; i++) a[i] = outlineW(d.outline, i / LUT_N);
  return (OUTLINE_LUT[name] = a);
}
function bodySD(h, p) {
  if (SD.h !== h) sdBegin(h);
  const d = STRING_DIMS[h.geoName], q = SD.p.copy(p).applyMatrix4(SD.inv).divide(h.scale), L = d.L;
  const lut = OUTLINE_LUT[h.geoName] ?? outlineLut(h.geoName);
  const f = clamp(q.y / L, 0, 1), fi = f * LUT_N, i0 = Math.min(LUT_N - 1, fi | 0), w = lut[i0] + (lut[i0 + 1] - lut[i0]) * (fi - i0);
  const hw = Math.max(1e-6, w * L), t = clamp(q.x / hw, -1, 1);
  const along = Math.pow(Math.max(0, Math.sin(Math.PI * f)), 0.45), sh = Math.pow(1 - t * t, 0.8);
  const top = d.rib / 2 + d.arch * along * sh, back = -d.rib / 2 - d.backArch * along * sh;
  const ex = Math.abs(q.x) - hw, ez = Math.max(q.z - top, back - q.z), ey = Math.max(-q.y, q.y - L);
  if (ex <= 0 && ez <= 0 && ey <= 0) return -Math.max(ex, ez) * h.scale.x;
  return -Math.hypot(Math.max(0, ex), Math.max(0, ez), Math.max(0, ey)) * h.scale.x;
}
// 手首を wrist、向き hq に置いたとき、手の箱が胴に入らないために nrm の向きへ持ち上げる長さ (m)。入らなければ 0
function handLift(h, hq, wrist, nrm) {
  let lift = 0;
  for (let it = 0; it < 4; it++) {
    let deep = -1;
    for (const p of HAND_PTS) {
      _hp2.set(p[0] * S, p[1] * S, p[2] * S).applyQuaternion(hq).add(wrist).addScaledVector(nrm, lift);
      deep = Math.max(deep, bodySD(h, _hp2) + p[3] * S + 0.002);
    }
    if (deep <= 0) break;
    lift += deep;
  }
  return lift;
}
// 腕を解いたあと、前腕 (太さ 3 cm) が胴に入るなら、手をさらに持ち上げる長さ
function foreDepth(g, h, side) {
  const fa = g.bones[side + "ForeArm"], W = R.wpos(g.bones[side + "Hand"], _c1), E = R.wpos(fa, _c2), sgn = side === "Left" ? 1 : -1;
  let deep = -1;
  for (const k of FORE_AXIS) deep = Math.max(deep, bodySD(h, _c3.copy(W).lerp(E, k)) + 0.5 * S);
  for (const p of FORE_PLATE) deep = Math.max(deep, bodySD(h, _c3.set(sgn * p[0], p[1], p[2]).applyMatrix4(fa.matrixWorld)));
  return deep;
}
function foreLift(g, h) {
  const deep = foreDepth(g, h, "Left") + 0.004;
  return deep > 0 ? deep : 0;
}
// 音 n のときの指 f: 止める指とそれより下の番号の指は弦の上 (down)。止める指はその音の半音、ほかはポジションの中のふつうの所
const FS0 = { down: false, semi: 0, str: 0 }, FS1 = { down: false, semi: 0, str: 0 };
function fingerState(n, f, H, out) {
  out.down = n.finger >= f && n.finger > 0;
  out.semi = n.finger === f ? n.semi : n.pos + fingerOffset(H, f);
  out.str = n.str;
  return out;
}
const FINGER_LIM = [-0.7, 0.7, -0.5, 1.75], THUMB_LIM = [-0.6, 1.4, -0.6, 1.9];
function poseLeft(seat, kind, L, P, t, wRest) {
  const g = seat.rig, h = seat.instrument, spec = h.spec, q = h.root.quaternion, H = KIND[kind].hand;
  const N = P.notes, i = P.cN.at(t), cur = i >= 0 ? N[i] : null, nx = N[i + 1] ?? null;
  const first = N[0]; if (!first) return;
  // 手の位置 (ポジション)。次の音へ移る時間の中では、なめらかに移す
  let pos = cur ? cur.pos : first.pos, sigma = cur ? cur.str : first.str;
  if (cur && nx) {
    if (nx.shift > 0) pos = lerp(cur.pos, nx.pos, smooth((t - (nx.t0 - nx.shift)) / nx.shift));
    const ws = clamp(0.5 * (cur.t1 - cur.t0) + Math.max(0, nx.t0 - cur.t1), 0.04, 0.15);   // 手は弦を移る音の前に、ゆっくり横へ
    sigma = lerp(cur.str, nx.str, smooth((t - (nx.t0 - ws)) / ws));
  }
  // 高いポジションでは手がネックの根元 (胴) で止まり、指をのばして届かせる
  const yH = Math.max(handY(spec, pos, H), spec.L + 0.004 - (KIND[kind].past ?? 0) * (kind === "viola" ? VIOLA_K : 1));
  const vib = vibrato(cur, t), xk = kind === "viola" ? 1.06 : 1;
  // ── 手の向きと位置 (楽器の中で決めてから world へ)
  const hq = R.handQuatOf("Left", _v[0].set(...L.fingers).applyQuaternion(q), _v[1].set(...L.dorsal).applyQuaternion(q));
  const sz = stringZ(spec, yH), kn = L.knuckle, sx = stringX(spec, yH, sigma);
  const knW = h.local(_v[2].set(sx + kn[0] * xk, yH + kn[1] + vib * 0.8, sz + kn[2]), _v[3]);
  const wrist = knW.sub(_v[4].set(1.7 * S, 0.02 * S, 0).applyQuaternion(hq));   // 手の中の、中指と薬指の付け根の間
  // 肘: 低い弦ほど内へ (バイオリンは楽器の下へ、チェロは上へ)
  const wl = smooth((1.6 - sigma) / 1.2);
  const pole = _v[5].set(lerp(L.pole[0], L.poleLow[0], wl), lerp(L.pole[1], L.poleLow[1], wl), lerp(L.pole[2], L.poleLow[2], wl)).normalize().applyQuaternion(g.root.quaternion);
  // 手が胴の肩の上まで下りる高いポジション (コントラバス・チェロ): 肘を上げて、前腕が胴の肩の上を通るように
  if (L.poleHigh) pole.lerp(_v[9].set(...L.poleHigh).normalize().applyQuaternion(g.root.quaternion), smooth((spec.L + 0.06 - yH) / 0.12)).normalize();
  // 楽器を休めているとき (ももの上に立てる): 肘は体の横へ下ろす (REST_POLE.left)。
  // (前は肘を楽器の横 (手の甲の側) へ出していて、肘が体の左 48 cm まで開き、0.55 m 左にいる同じ譜面台の人の胸に 10 cm 入っていた)
  if (wRest > 0) pole.lerp(_v[9].set(...REST_POLE.left).normalize().applyQuaternion(g.root.quaternion), smooth(wRest)).normalize();
  // 高いポジションで手の箱が胴の肩 (表板・横板) に入るなら、表板の外の向きへ手を持ち上げる (指は上から弦へ下りる)。前腕も同じ
  // (手が胴の上の端から十分離れている 1 のポジションのあたりでは、測らない)
  const nrm = _v[10].set(PUSH[0], 0, PUSH[1]).normalize().applyQuaternion(q), nearBody = yH - spec.L * (kind === "violin" || kind === "viola" ? 0.2 : 0.1) < spec.L;
  if (nearBody) wrist.addScaledVector(nrm, Math.min(KIND[kind].push ?? 0.03, handLift(h, hq, wrist, nrm)));
  R.solveArm(g, "Left", wrist, { pole, hand: hq });
  const fl = nearBody || wRest > 0 ? foreLift(g, h) : 0;
  if (fl > 0) { wrist.addScaledVector(nrm, Math.min(KIND[kind].push ?? 0.03, fl)); R.solveArm(g, "Left", wrist, { pole, hand: hq }); }
  // ── 指 (1 … 4): 止める指と、それより下の番号の指は弦の上。上の番号の指は浮かせる。親指はネックの裏
  const hand = g.bones.LeftHand;          // 手の行列は solveArm が手の向きを決めたときに更新済み
  _inv.copy(hand.matrixWorld).invert();
  const FL = g.fingers.Left, kUp = kind === "bass" ? 1.5 : kind === "cello" ? 1.25 : 1;
  const pv = i > 0 ? N[i - 1] : null, REL = 0.05;
  for (let f = 1; f <= 4; f++) {
    // 今の音での指の形 (下りているか・半音・弦)。音の頭のすぐあとは、前の音で下りていた指を上げる。次の音の頭の前は、下りる指を下ろす
    fingerState(cur ?? first, f, H, FS0);
    let w = cur && FS0.down ? 1 : 0, semi = FS0.semi, str = FS0.str, bump = 0;
    // 音の頭のすぐあと: 前の音で下りていた指を上げる。前の音を止めていた指は、ここで次の位置へ移る (弦から少し浮かせて)
    if (pv && cur && t < cur.t0 + REL) {
      fingerState(pv, f, H, FS1);
      const x = smooth((t - cur.t0) / REL), moved = FS1.semi !== FS0.semi || FS1.str !== FS0.str;
      if (FS1.down && !FS0.down) { w = 1 - x; semi = lerp(FS1.semi, semi, x); str = lerp(FS1.str, str, x); }
      else if (FS1.down && FS0.down && f === pv.finger && f !== cur.finger && moved) { semi = lerp(FS1.semi, semi, x); str = lerp(FS1.str, str, x); bump = Math.sin(Math.PI * x) * 0.006; }
    }
    // 次の音の頭の前: 下りる指を下ろす (次の音を止める指は頭までに着く)。今の音を止めている指は、頭までは動かさない
    if (cur && nx) {
      const win = Math.max(nx.drop, nx.shift, 1e-3);
      if (t > nx.t0 - win) {
        fingerState(nx, f, H, FS1);
        const x = smooth((t - (nx.t0 - win)) / win), moved = FS1.semi !== FS0.semi || FS1.str !== FS0.str;
        if (FS1.down && !FS0.down) { w = smooth((t - (nx.t0 - nx.drop)) / nx.drop); semi = lerp(semi, FS1.semi, x); str = lerp(str, FS1.str, x); }
        else if (FS1.down && FS0.down && moved && (f === nx.finger || f !== cur.finger)) { semi = lerp(semi, FS1.semi, x); str = lerp(str, FS1.str, x); bump = Math.sin(Math.PI * x) * 0.004; }
        else if (!FS0.down && !FS1.down) { semi = lerp(semi, FS1.semi, x); str = lerp(str, FS1.str, x); }
      }
    }
    w *= 1 - wRest;
    const s0 = Math.floor(clamp(str, 0, 2.999)), fr = clamp(str, 0, 3) - s0;
    const pa = padLocal(spec, s0, Math.max(0.3, semi), _v[6]), pb = padLocal(spec, s0 + 1, Math.max(0.3, semi), _v[7]);
    pa.lerp(pb, fr);
    pa.z += (1 - w) * 0.012 * kUp + Math.sin(Math.PI * fr) * 0.004 + bump + wRest * 0.01;
    if (cur && cur.finger === f) pa.y += vib * 0.35;
    const tw = h.local(pa, _v[8]).applyMatrix4(_inv);
    fingerTo(FL[f], 1, tw.x, tw.y, tw.z, FINGER_LIM);
  }
  const th = L.thumb, tW = h.local(_v[6].set(th[0] * xk, yH + th[1] + vib * 0.6, sz + th[2]), _v[7]).applyMatrix4(_inv);
  fingerTo(FL[0], 1, tW.x, tW.y, tW.z, THUMB_LIM);
  // 高いポジションの親指はネックの根元を回り、胴の中へ押し込まない。
  if(kind==='violin'||kind==='viola')clearOneFinger(FL[0],h,1,-FL[0].root.rotation.z,-FL[0].joint.rotation.z,-FL[0].root.rotation.y);
}

/* ─────────── 弓と右手 ─────────── */
const _pizzBy=V(),_pizzDorsal=V();
const _bp = V(), _bq = new THREE.Quaternion(), _hp = V(), _hq = new THREE.Quaternion(), _fq = new THREE.Quaternion();
function bowCurl(u, out = _curlA) { for (let i = 0; i < 5; i++) { out[i][0] = lerp(BOW_CURL_FROG[i][0], BOW_CURL_TIP[i][0], u); out[i][1] = lerp(BOW_CURL_FROG[i][1], BOW_CURL_TIP[i][1], u); } return out; }
function poseBow(seat, kind, K, Hd, P, t, tb, wPizz, wRest, tmp) {
  const g = seat.rig, h = seat.instrument, b = seat.bow, spec = h.spec, st = seat.str, B = Hd.bow;
  // ── 弓で弾くときの弓の位置と向き
  bowString(P, t, tmp.sig);
  // 2 列目の外側のチェロは先を使い切らず、前の椅子へ毛箱の手を伸ばしすぎない
  const reach = kind === "cello" && seat.row === 1 && seat.part === "outside" ? 0.86 : 1;
  const u = clamp(0.02 + reach * (0.5 + st.amp * (bowU(P, tb) - 0.5) - 0.02), 0.004, 0.996);
  let lift = bowLift(P, t) * (0.92 + 0.16 * seat.hash(15));
  // 最後の音のあとも、弓を休める前にひざから離す
  const finalEnd = P.notes[P.notes.length - 1]?.t1 ?? Infinity;
  if (kind === "cello" && t > finalEnd) lift += 0.07 * smooth((t - finalEnd) / 0.2);
  const yC = spec.bridgeY + tmp.sig.sf * (spec.fbEndY - spec.bridgeY), s1 = spec.strings[1];
  const A = archAt(spec, (yC - s1.bridge.y) / (s1.nut.y - s1.bridge.y), clamp(tmp.sig.sigma, 0, 3), ARCH);
  const q = h.root.quaternion;
  // 弓の向き: by = 毛箱 → 先 (弦に直角)、bz = 竿の側 (弧の外)。竿を指板の側へ少し倒す (毛箱で 18 度、先で 6 度)
  const by = _v[0].copy(A.tng).multiplyScalar(K.across);
  by.addScaledVector(A.sdir, -by.dot(A.sdir)).normalize();
  const bz = _v[1].copy(A.n); bz.addScaledVector(A.sdir, -bz.dot(A.sdir)).addScaledVector(by, -bz.dot(by)).normalize();
  const tilt = lerp(0.31, 0.1, u);
  const bzT = _v[2].copy(bz).multiplyScalar(Math.cos(tilt)).addScaledVector(A.sdir, Math.sin(tilt));
  const contact = h.local(_v[3].copy(A.contact).addScaledVector(bz, 0.5 * b.spec.hairWidth * Math.sin(tilt) + lift), _v[3]);
  by.applyQuaternion(q); bzT.applyQuaternion(q);
  _bq.copy(R.basisQuat(UP, by, _v[4].set(0, 0, 1), bzT));
  _bp.copy(contact).addScaledVector(by, -u * b.spec.hairLen);
  // ── 右手の向き (弓の中の向きを、毛箱 → 先で変える) と手首
  const fr = B.frog, tp = B.tip;
  const fF = _v[5].set(lerp(fr.fingers[0], tp.fingers[0], u), lerp(fr.fingers[1], tp.fingers[1], u), lerp(fr.fingers[2], tp.fingers[2], u)).normalize().applyQuaternion(_bq);
  const fD = _v[6].set(lerp(fr.dorsal[0], tp.dorsal[0], u), lerp(fr.dorsal[1], tp.dorsal[1], u), lerp(fr.dorsal[2], tp.dorsal[2], u)).normalize().applyQuaternion(_bq);
  _hq.copy(R.handQuatOf("Right", fF, fD));
  _hp.copy(R.wristFor(g, "Right", _hq, g.points.gripRight, gripLocal(b, _v[7]).applyQuaternion(_bq).add(_bp)));
  reachAssist(g, contact, _v[11].copy(bz).applyQuaternion(q), wPizz > 0 || wRest > 0);
  // ── ピチカート: 手を指板の端の上へ (弓は握る)
  let pz = null;
  if (wPizz > 0) { pz = pizzPose(seat, Hd, P, t); blendPose(_hp, _hq, pz.wrist, pz.hq, wPizz, _hp, _hq); }
  // ── 長い休み: 右のももの上に弓を置く。はじめ (3.5 割) は毛箱を持つ手を軸に、弓の先を動かして楽器の上から抜く
  //    (バイオリン・ビオラは弦の面の外へ、チェロ・コントラバスは先を少し起こしてひざから離す)。
  //    そのあと毛箱から 1/4 の所を動かす点にして、少し上へ浮かせながら、向きを変えてももの上へ下ろす (構えるときは同じ道を逆に)
  if (wRest > 0) {
    // ピチカートの握りのまま休む経路へ入る。弓だけをあとから回すと、手と弓が別の経路になる。
    if(wPizz>0){
      const byF=_pizzBy.set(...(Hd.pizz.fist??FIST_AXIS)).normalize().applyQuaternion(_hq),bzF=_pizzDorsal.set(0,1,0).applyQuaternion(_hq);
      _fq.copy(R.basisQuat(UP,byF,_v[2].set(0,0,1),bzF));_bq.slerp(_fq,wPizz);
      const gw=_v[3].copy(g.points.gripRight.position).multiplyScalar(S).applyQuaternion(_hq).add(_hp);
      _bp.copy(gw).sub(gripLocal(b,_v[4]).applyQuaternion(_bq));
    }
    fromRoot(g, st.bowRest, _P2, _Q2);
    const nW = _v[8].copy(bz).applyQuaternion(q), gripW = gripLocal(b, _v[7]).applyQuaternion(_bq).add(_bp), w1 = smooth(wRest / 0.35);
    if (st.hold.mode === "floor") _qa.setFromAxisAngle(_v[9].crossVectors(UP, by).normalize(), FLOOR_TIP_TURN * w1);
    else _qa.setFromAxisAngle(_v[9].crossVectors(by, nW).normalize(), 0.9 * w1);
    _bq.premultiply(_qa); _bp.sub(gripW).applyQuaternion(_qa).add(gripW).addScaledVector(nW, 0.06 * w1);
    const w2 = smooth((wRest - 0.35) / 0.65);
    if (w2 > 0) {
      const piv = REST_PATH.pivot * b.spec.hairLen;
      const pA = _v[5].set(0, piv, 0).applyQuaternion(_bq).add(_bp), pB = _v[6].set(0, piv, 0).applyQuaternion(_Q2).add(_P2);
      pA.lerp(pB, w2); pA.y += REST_PATH.arc * Math.sin(Math.PI * w2);
      _bq.slerp(_Q2, w2);
      _bp.copy(pA).sub(_v[7].set(0, piv, 0).applyQuaternion(_bq));
    }
    // 手は弓の毛箱を持ったまま (手の向きは毛箱の持ち方へ)
    const fF = _v[5].set(...fr.fingers).normalize().applyQuaternion(_bq), fD = _v[6].set(...fr.dorsal).normalize().applyQuaternion(_bq);
    _hq.slerp(R.handQuatOf("Right", fF, fD), wRest);
    _hp.copy(R.wristFor(g, "Right", _hq, g.points.gripRight, gripLocal(b, _v[7]).applyQuaternion(_bq).add(_bp)));
  }
  // 持ちかえと楽器を下ろす経路が重なる所は、手と弓を一緒に表板の外へ回す。
  // 実物の箱と竿・毛の点で距離を取り、鳴っている弦の接点や判定の許容値は変えない。
  if(wRest>0){
    const n=_v[10].set(0,0,1).applyQuaternion(q);
    for(let it=0;it<6;it++){
      let deep=-1;
      for(const p of HAND_PTS){_v[11].set(-p[0]*S,p[1]*S,p[2]*S).applyQuaternion(_hq).add(_hp);deep=Math.max(deep,bodySD(h,_v[11])+p[3]*S+.004);}
      for(let k=0;k<=16;k++){
        _v[11].set(0,k/16*b.spec.hairLen,0).applyQuaternion(_bq).add(_bp);deep=Math.max(deep,bodySD(h,_v[11])+.003);
        _v[11].set(0,(-.03+.69*k/16)*b.scale.y,.012*b.scale.z).applyQuaternion(_bq).add(_bp);deep=Math.max(deep,bodySD(h,_v[11])+.003);
      }
      if(deep<=0)break;_hp.addScaledVector(n,deep);_bp.addScaledVector(n,deep);
    }
  }
  // ── 右腕を解く
  const pole = _v[9].set(...(wPizz > 0.5 ? Hd.pizz.pole : B.pole)).normalize().applyQuaternion(g.root.quaternion);
  // 長い休み: 肘を体の横へ下ろす (弓で弾くときの向きのままだと、ももの上の弓を持つ肘が体の右 36 cm まで開いていた)
  if (wRest > 0) pole.lerp(_v[10].set(...REST_POLE.right).normalize().applyQuaternion(g.root.quaternion), smooth(wRest)).normalize();
  R.solveArm(g, "Right", _hp, { pole, hand: _hq });
  if (wPizz > 0) {
    if(wRest>0){const gw=R.wpos(g.points.gripRight,_v[8]);b.root.position.copy(gw).sub(gripLocal(b,_v[7]).applyQuaternion(_bq));b.root.quaternion.copy(_bq);}
    else placeBowInFist(seat, wPizz, Hd.pizz);
    const c = bowCurl(u);
    for (let i = 0; i < 5; i++) { c[i][0] = lerp(c[i][0], PIZZ_CURL[i][0], wPizz*(1-wRest)); c[i][1] = lerp(c[i][1], PIZZ_CURL[i][1], wPizz*(1-wRest)); }
    R.setFingers(g, "Right", c, BOW_SPREAD);
    clearFingers(g, h, "Right", c, BOW_SPREAD, wPizz >= 0.999 && wRest===0 ? 1 : -1);
    if (wPizz >= 0.999 && wRest===0) pluck(seat, kind, P, t);
  } else {
    if (wRest > 0) {
      // 休むときは弓を手の握りに付ける (腕が届かない所でも離れない)
      const gw = R.wpos(g.points.gripRight, _v[8]);
      _bp.copy(gw).sub(gripLocal(b, _v[7]).applyQuaternion(_bq));
    }
    b.root.position.copy(_bp); b.root.quaternion.copy(_bq);
    const c = bowCurl(u);
    R.setFingers(g, "Right", c, BOW_SPREAD);
    clearFingers(g, h, "Right", c, BOW_SPREAD, -1);
  }
  b.root.updateMatrixWorld(true);
}
// 指が楽器の胴 (表板・横板) に入らないようにする: 入る指だけ、付け根を開いて先を曲げる (竿の上へ指を持ち上げる) か、もっと握る。
// ロボットの指は長いので、毛箱が胴の縁の上に来る所 (バイオリンの E 線の毛箱など) で、竿を包んだ指先が表板に届いてしまう。
// 手が胴から指の長さより離れているときは何もしない。曲げの量は、深さが 0 になる所を 4 つの試しの間でつないで決める (時間でなめらか)
const CLR_PATHS = [[-0.9, 0.35, 0], [0.55, 0.45, 0], [0, 0.3, -0.6], [0, 0.3, 0.6]];   // a = 1 のときの [付け根の曲げ, 先の曲げ, 開き] の変え方 (開く、握る、横へ 2 つ)
const _c1 = V(), _c2 = V(), _c3 = V(), _c4 = V();
function fingerDepth(h, f) {
  f.root.updateMatrixWorld(true);
  const pj = _c1.setFromMatrixPosition(f.joint.matrixWorld), pt = _c2.setFromMatrixPosition(f.tip.matrixWorld);
  const pm = _c3.setFromMatrixPosition(f.root.matrixWorld).lerp(pj, 0.6), pd = _c4.copy(pj).lerp(pt, 0.5);
  return Math.max(bodySD(h, pj), bodySD(h, pt), bodySD(h, pm), bodySD(h, pd)) + f.radiusM * 1.15 + 0.002;
}
function setFinger(f, sgn, c0, c1, sp) { f.root.rotation.set(0, -sgn * sp, -sgn * c0, "YZX"); f.joint.rotation.set(0, 0, -sgn * c1); }
function clearFingers(g, h, side, curl, spread, skip = -1) {
  const hand = g.bones[side + "Hand"], sgn = side === "Left" ? 1 : -1;
  if (bodySD(h, _c1.set(sgn * 0.9, -0.25, 0).applyMatrix4(hand.matrixWorld)) < -0.2) return;   // 指先は手のひらのまん中から 18 cm まで届く
  g.fingers[side].forEach((f, i) => {
    if (i === skip) return;
    const c0 = curl[i][0], c1 = curl[i][1], sp = spread[i];
    clearOneFinger(f,h,sgn,c0,c1,sp);
  });
}
function clearOneFinger(f,h,sgn,c0,c1,sp){
    const d0 = fingerDepth(h, f); if (d0 <= 0) return;
    let pick = null, least = { d: d0, a: 0, P: CLR_PATHS[0] };
    for (const P of CLR_PATHS) {
      let pa = 0, pd = d0;
      for (let k = 1; k <= 4 && !pick; k++) {
        const a = k / 4;
        setFinger(f, sgn, c0 + P[0] * a, c1 + P[1] * a, sp + P[2] * a);
        const d = fingerDepth(h, f);
        if (d <= 0) pick = { a: pa + (a - pa) * pd / Math.max(1e-9, pd - d), P };
        else if (d < least.d) least = { d, a, P };
        pa = a; pd = d;
      }
      if (pick) break;
    }
    const r = pick ?? least;
    setFinger(f, sgn, c0 + r.P[0] * r.a, c1 + r.P[1] * r.a, sp + r.P[2] * r.a);
    f.root.updateMatrixWorld(true);
}

// 腕が届かないときの助け (弓の先・高い弦の毛箱): まず右の肩を前へ出す (最大 0.45 rad = 肩の付け根が約 6 cm 前へ)。
// それでも届かなければ、弓を弦に当たる点のまわりに (毛の面の中で) 回し、毛箱を肩の方へ寄せる (最大 14 度。弓は弦に直角から少し斜めになる)。
// どちらも手首と肩の距離から毎コマ計算するので、なめらかに出入りする。弓・手首・手の向きを、その点のまわりに一緒に回す
const RM = (R.ARM.upper + R.ARM.fore) * 0.995, PHI_MAX = 14 * Math.PI / 180;
const _qa = new THREE.Quaternion();
function reachAssist(g, C, n, off) {
  const sh = g.bones.RightShoulder;
  sh.rotation.set(0, 0, 0);
  if (off>=1) return;
  const S0 = R.wpos(g.bones.RightArm, _v[10]);
  const th = 0.45 * smooth((_hp.distanceTo(S0) - RM + 0.06) / 0.12);
  if (th <= 0) return;
  sh.rotation.set(0, th*(1-off), 0);
  R.wpos(g.bones.RightArm, S0);
  const need = RM - 0.004;
  if (_hp.distanceTo(S0) <= need) return;
  // 回す角度: 手首 W を n の軸 (C を通る) のまわりに回したとき、肩との距離が need になる一番小さい角度
  const a = _v[8].copy(_hp).sub(C), b = _v[9].copy(S0).sub(C);
  const an = a.dot(n), bn = b.dot(n);
  a.addScaledVector(n, -an); b.addScaledVector(n, -bn);
  const la = a.length(), lb = b.length(), c = an - bn;
  const best = Math.atan2(_v[7].crossVectors(a, b).dot(n), a.dot(b));
  const kap = (la * la + lb * lb + c * c - need * need) / Math.max(1e-9, 2 * la * lb);
  let phi = best;
  if (kap <= 1) { const room = Math.acos(Math.max(-1, kap)); phi = Math.abs(best) > room ? best - Math.sign(best) * room : 0; }
  phi = clamp(phi, -PHI_MAX, PHI_MAX)*(1-off);
  if (!phi) return;
  _qa.setFromAxisAngle(n, phi);
  _bq.premultiply(_qa); _hq.premultiply(_qa);
  _bp.sub(C).applyQuaternion(_qa).add(C); _hp.sub(C).applyQuaternion(_qa).add(C);
}
// ピチカートの手の位置: 人差し指の先が、指板の端の少し上 (上駒の側) の弦の Z.above (既定 2.2 cm) 上に来る
const PZ = { wrist: V(), hq: new THREE.Quaternion() };
function pluckPoint(spec, h, str, out) {
  const s = spec.strings[str], y = spec.fbEndY + 0.025 * Math.sqrt(spec.L / 0.356);
  return h.stringPoint(str, (y - s.bridge.y) / (s.nut.y - s.bridge.y), out);
}
function pizzPose(seat, Hd, P, t) {
  const g = seat.rig, h = seat.instrument, spec = h.spec, q = h.root.quaternion, Z = Hd.pizz;
  const i = P.cN.at(t + 0.2), n = P.notes[Math.max(0, i)];
  const pt = pluckPoint(spec, h, n?.str ?? 1, _v[10]).addScaledVector(_v[11].set(0, 0, 1).applyQuaternion(q), Z.above ?? 0.022);
  PZ.hq.copy(R.handQuatOf("Right", _v[5].set(...Z.fingers).applyQuaternion(q), _v[6].set(...Z.dorsal).applyQuaternion(q)));
  // 人差し指の先の、手の中の位置 (付け根 0.25、先 0.3 だけ曲げた形)
  const f = g.fingers.Right[1], r = f.root.position, l1 = f.len * SEG1, l2 = f.len * SEG2, c0 = 0.25, c1 = 0.3;
  const tip = _v[7].set(r.x - (l1 * Math.cos(c0) + l2 * Math.cos(c0 + c1)), r.y - (l1 * Math.sin(c0) + l2 * Math.sin(c0 + c1)), r.z).multiplyScalar(S).applyQuaternion(PZ.hq);
  PZ.wrist.copy(pt).sub(tip);
  return PZ;
}
// ピチカートの間、弓は握った手の中: 毛箱を握りこぶしに、先は Z.fist の向き (省くと親指の側から手の甲の側へ)。弓で弾くときの向きから回す
const FIST_AXIS = [0.25, 0.35, 0.9];
function placeBowInFist(seat, w, Z) {
  const g = seat.rig, b = seat.bow;
  const hq = R.wquat(g.bones.RightHand, _q);
  const byF = _v[0].set(...(Z?.fist ?? FIST_AXIS)).normalize().applyQuaternion(hq), bzF = _v[1].set(0, 1, 0).applyQuaternion(hq);
  _fq.copy(R.basisQuat(UP, byF, _v[2].set(0, 0, 1), bzF));
  _bq.slerp(_fq, w);
  const gw = R.wpos(g.points.gripRight, _v[3]);
  b.root.quaternion.copy(_bq); b.root.position.copy(gw).sub(gripLocal(b, _v[4]).applyQuaternion(_bq));
}
// 人差し指で弦をはじく: 音の頭で指先が弦に当たり、そのまま弦を横切って離れる
function pluck(seat, kind, P, t) {
  const g = seat.rig, h = seat.instrument, spec = h.spec, q = h.root.quaternion;
  const i = P.cN.at(t + 0.12), n = P.notes[i];
  if (!n || n.art !== "pizz") return;
  const hand = g.bones.RightHand; hand.updateWorldMatrix(true, false);
  _inv.copy(hand.matrixWorld).invert();
  const pt = pluckPoint(spec, h, n.str, _v[0]);
  const nz = _v[1].set(0, 0, 1).applyQuaternion(q), nxv = _v[2].set(1, 0, 0).applyQuaternion(q);
  const r = spec.strings[n.str].radius + PAD, dt = t - n.t0;
  // 近づく (-0.12 s → 0) → 当たる → 横切って離れる (0 → 0.1 s)
  let up, side;
  if (dt < 0) { const x = smooth((dt + 0.12) / 0.12); up = lerp(0.02, r, x); side = lerp(0.006, 0, x); }
  else { const x = smooth(dt / 0.1); up = r + 0.016 * x; side = -0.012 * x * KIND[kind].across; }
  pt.addScaledVector(nz, up).addScaledVector(nxv, side).applyMatrix4(_inv);
  fingerTo(g.fingers.Right[1], -1, pt.x, pt.y, pt.z, [-0.8, 0.8, -0.6, 1.7]);
}

/* ─────────── 確かめ (rehearse) ─────────── */
// 鳴っている間 (60 fps の毎コマ) と音の頭で、本物の形の距離を測る (奏者 1 つにつき、その時刻で一番悪い席の値):
//   bow-contact : 弓の毛と、その音を弾く弦のすき間 < 5 mm (ほかの弦を毛が 1 mm 以上突き抜けない)。
//                 2 本以上とばして弦を移る時間 (音の頭をはさんで多くて 50 ms) は外して数える
//   finger-stop : 止める指の先が、計算した止める点 (弦の上、弦の太さ + 1.5 mm) から 6 mm 以内。
//                 ポジションを移る・同じ指で別の所へ移る音の終わりの時間 (ex、多くて 60 ms) は外して数える
//   bow-body    : 弓の毛と竿が、楽器の胴の中に入らない (1 mm まで)
//   right-grip  : 右手の握りの点が、弓の持つ点から 8 mm 以内 (腕が届かないと離れる)
//   hand-body   : 両手 (手の箱の角・指の 3 つの点・手首) と前腕が、自分の楽器の胴に 3 mm より深く入らない (指と腕の太さを入れる。10 回/秒)
function registerChecks(stage, id, seats) {
  if (!stage?.addCheck || !seats.length) return;
  const plans = [...new Set(seats.map((s) => s.str.plan))];
  const onsets = [...new Set(plans.flatMap((P) => P.notes.map((n) => n.t0)))].sort((a, b) => a - b);
  const soundingIn = (P, t, arcoOnly) => {
    const L = arcoOnly ? P.arco : P.notes, i = (arcoOnly ? P.cA : P.cN).at(t), n = L[i];
    return n && t >= n.t0 && t < n.t1 ? n : null;
  };
  const worst = (fn) => (sec) => {
    let best = null;
    for (const s of seats) {
      const r = fn(s, s.str.plan, sec);
      if (r && (!best || (!r.ok && best.ok) || (r.ok === best.ok && r.value > best.value))) best = r;
    }
    return best;
  };
  const _a = V(), _b = V(), _c = V(), _d = V();
  stage.addCheck({ id: `${id}.bow-contact`, player: id, times: onsets, frames: true, measure: worst((s, P, t) => {
    const n = soundingIn(P, t, true); if (!n) return null;
    if (pizzWeight(P, t) > 0 || restWeight(P, t) > 0 || (n.xex && t > n.t1 - n.xex - 1e-6) || (n.xin && t < n.t0 + n.xin)) return null;
    const gap = bowHairToString(s, n.str).gap;
    let through = 0;
    for (let i = 0; i < 4; i++) if (i !== n.str) through = Math.min(through, bowHairToString(s, i).gap);
    return { ok: Math.abs(gap) < 0.005 && through > -0.001, value: Math.max(Math.abs(gap), -through) * 1000, info: { seat: s.id, str: n.str, gap: +(gap * 1000).toFixed(2), through: +(through * 1000).toFixed(2) } };
  }) });
  stage.addCheck({ id: `${id}.finger-stop`, player: id, times: onsets, frames: true, measure: worst((s, P, t) => {
    const n = soundingIn(P, t, false); if (!n || !n.finger || n.under) return null;
    if (n.ex && t > n.t1 - n.ex - 1e-6) return null;
    if (restWeight(P, t) > 0) return null;
    const pad = s.instrument.local(padLocal(s.instrument.spec, n.str, n.semi, _a), _a);
    const d = R.wpos(s.rig.fingers.Left[n.finger].tip, _b).distanceTo(pad);
    return { ok: d < 0.006, value: d * 1000, info: { seat: s.id, str: n.str, semi: n.semi, finger: n.finger } };
  }) });
  stage.addCheck({ id: `${id}.bow-body`, player: id, times: [], frames: true, measure: worst((s) => {
    let deep = -1;
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      deep = Math.max(deep, bodyDepth(s.instrument, s.bow.hairPoint(u, _c)));
      deep = Math.max(deep, bodyDepth(s.instrument, s.bow.root.localToWorld(_d.set(0, (-0.03 + 0.69 * u) * s.bow.scale.y, 0.012 * s.bow.scale.z))));
    }
    return { ok: deep < 0.001, value: Math.max(0, deep) * 1000, info: { seat: s.id } };
  }) });
  stage.addCheck({ id: `${id}.hand-body`, player: id, times: [], frames: true, measure: worst((s, P, t) => {
    if (Math.round(t * 60) % 6) return null;
    const deep = handBodyDepth(s);
    return { ok: deep.d < 0.003, value: Math.max(0, deep.d) * 1000, info: { seat: s.id, part: deep.part } };
  }) });
  stage.addCheck({ id: `${id}.right-grip`, player: id, times: [], frames: true, measure: worst((s, P, t) => {
    if (pizzWeight(P, t) > 0) return null;
    const d = R.wpos(s.rig.points.gripRight, _c).distanceTo(s.bow.root.localToWorld(gripLocal(s.bow, _d)));
    return { ok: d < 0.008, value: d * 1000, info: { seat: s.id } };
  }) });
}

// 両手と前腕の、楽器の胴への一番深いめり込み (m、太さ込み。+ なら入っている) と、その部品の名前
const _hb = V(), _hb2 = V(), HB = { d: 0, part: "" };
function handBodyDepth(s) {
  const g = s.rig, h = s.instrument;
  sdBegin(h);
  HB.d = -1; HB.part = "";
  const put = (d, part) => { if (d > HB.d) { HB.d = d; HB.part = part; } };
  for (const side of R.SIDES) {
    const sgn = side === "Left" ? 1 : -1, hand = g.bones[side + "Hand"];
    hand.updateWorldMatrix(true, false);
    for (const p of HAND_PTS) put(bodySD(h, _hb.set(sgn * p[0], p[1], p[2]).applyMatrix4(hand.matrixWorld)) + p[3] * S, side + " hand");
    g.fingers[side].forEach((f, i) => { f.tip.updateWorldMatrix(true, false); put(fingerDepth(h, f) - 0.002, side + " finger " + i); });
    put(foreDepth(g, h, side), side + " forearm");
  }
  return HB;
}

// 弓を弦 i の上、毛の位置 u に乗せる (前からある書き出し。ほかの部品や道具が使ってもよい)
export function placeBow(seat, i, u) {
  const h = seat.instrument, b = seat.bow, spec = h.spec, s1 = spec.strings[1];
  h.root.updateMatrixWorld(true);
  const A = archAt(spec, (spec.bowY - s1.bridge.y) / (s1.nut.y - s1.bridge.y), i, ARCH), q = h.root.quaternion;
  const by = V().copy(A.tng).multiplyScalar(KIND[seat.instrumentKind]?.across ?? -1); by.addScaledVector(A.sdir, -by.dot(A.sdir)).normalize();
  const bz = V().copy(A.n); bz.addScaledVector(A.sdir, -bz.dot(A.sdir)).addScaledVector(by, -bz.dot(by)).normalize();
  const contact = h.local(A.contact.clone(), V());
  by.applyQuaternion(q); bz.applyQuaternion(q);
  b.root.quaternion.copy(R.basisQuat(UP, by, V(0, 0, 1), bz));
  b.root.position.copy(contact).addScaledVector(by, -u * b.spec.hairLen);
  b.root.updateMatrixWorld(true);
  return { contact, by, bz };
}
// 道具 (tools/orchestra/) から計画の中身を見るための書き出し
export const _internal = { splitVoices, planLeft, buildStrokes, planBowPositions, planVoice, bowU, bowLift, bowString, pizzWeight, restWeight, archAt, wantLen, KIND, HOLD, PUSH, HAND_PTS, bodySD, sdBegin, handLift, BOW_CURL_FROG, BOW_CURL_TIP, BOW_SPREAD };
