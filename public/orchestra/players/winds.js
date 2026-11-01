// ═══════════ 木管・金管の奏者 (fl1 fl2 ob1 ob2 cl1 cl2 bn1 bn2 hn1 hn2 tp1 tp2) ═══════════
// 決まりは docs/ORCHESTRA.md §6.2。動きは全部、楽譜の秒 (音符の t0 / t1) から計算する (乱数なし・seek しても同じ姿勢)。
//
// ── 時間の流れ (1 人ぶん。plan で全部先に作り、pose は表を引くだけ)
//   ひと息 (フレーズ) = 休みが 1.5 秒未満の音符のつながり。
//   構える: ひと息の 0.9 秒前から楽器を口へ上げ、最後の 0.25 秒は口に当てて止める (息を吸う)。肩はこの間に上がる。
//   下ろす: ひと息の終わりの 0.7 秒後から下ろす (次のひと息まで 3 秒以上あるとき)。1.5〜3 秒の休みは、口から少し離して息を吸うだけ。
//   指・ピストン・レバー: 音の高さが変わるたびに、その音の始まりの 30 ms 前から 5 ms 前までの間に押さえ方を変える (楽器ごとの運指表)。
//   体: ひと息の強さで小さく揺れる・アクセントで前へ・ff の長い音でベルを上げる (金管は大きく、木管は少し)。
//   頭: 休みの間は譜面を読み、構える前に指揮者を見る。構えている間は楽器と一緒 (口と楽器はくっついたまま動く)。
//
// ── 形の決め方
//   楽器を吹く形 (play): 体と頭をその楽器の形にしたときの、頭の骨から見た楽器の位置と向きを plan で 1 回だけ求めておく。
//   毎コマ、頭の骨の行列 × その相対 = 楽器。だから頭がうなずいても、ベルを上げても、口と楽器は離れない。
//   休む形 (rest): 体 (rig.root) から見た位置と向き。上げ下げはこの 2 つの間を、少し前へふくらむ道でつなぐ。
//   手: 楽器の中に決めた手首の位置と手の向きに、腕の IK (rig.solveArm) で毎コマ合わせる。手は楽器に付いたまま動く。
//   指: 押さえる所 (キー・トーンホール・ピストンのボタン・レバー) を楽器の中に決め、指 2 節の IK で「押さえた」「離した」の角度を
//   plan で求めておく。毎コマ運指表の 0..1 で混ぜるだけ。
//
// ── 確かめ (rehearse に登録。ORCHESTRA.md §6.5)
//   <id>.mouth : 鳴っている間ずっと (と音の始まりちょうど) 楽器の口の点がロボットの口から 1 cm 以内
//   <id>.hold  : ひと息の始まりの 0.25 秒前 (息を吸う所) にもう口に当たっている。下ろしていた後なら、上げ始める前は口から離れている
//   <id>.clear : 楽器が自分の体 (手は除く)・隣の人・譜面台・自分の椅子にめり込まない (20 回/秒で測る)
//   <id>.keys  : 押さえ方の変わり目の 35 ms 前はまだ前の押さえ方、音の始まりでは新しい押さえ方 (ピストン・レバー・指の角度で測る)
//   <id>.grip  : 手首が楽器の中に決めた所に届いている (腕の長さが足りない形を作っていない)
import * as THREE from "three";
import { rig as R, V, clamp, lerp, smoother, phrases, distPointSegment } from "./base.js";

const S = R.S;
const PI = Math.PI;

/* ─────────── 時間の決まり (秒) ─────────── */
export const TIMING = {
  phraseGap: 1.5,     // これ未満の休みは同じひと息
  raise: 0.9,         // ひと息の何秒前から上げ始めるか
  hold: 0.25,         // 口に当てて止まっている (息を吸う) 長さ
  lowerAfter: 0.7,    // ひと息が終わってから下ろし始めるまで
  lowerGap: 3,        // 次のひと息までこれ以上あれば下ろす
  lowerDur: 0.85,     // 下ろすのにかける時間
  offAfter: 0.12,     // 短い休み (1.5〜3 秒) で口から離し始めるまで
  offDur: 0.4,
  keyLead: 0.03,      // 押さえ方は音の始まりの 30 ms 前から変え始め
  keyDone: 0.005,     // 5 ms 前に変え終わる
  lookBefore: 2.0,    // 下ろしていた後の入りの、何秒前に指揮者を見るか
};
const RATE = 30;      // 強さ・ベルの表の 1 秒あたりの点の数

/* ─────────── 運指表 ───────────
   押さえる指を 1 つの数のビットで表す: bit 0 = 左の親指、1〜3 = 左の人さし指・中指・薬指、4 = 左の小指、
   5〜7 = 右の人さし指・中指・薬指、8 = 右の小指。金管は bit 0〜2 = ピストン / レバーの 1〜3 番。 */
const LT = 1, L1 = 2, L2 = 4, L3 = 8, L4 = 16, R1 = 32, R2 = 64, R3 = 128, R4 = 256;
const LEFT_BITS = [LT, L1, L2, L3, L4], RIGHT_BITS = [0, R1, R2, R3, R4];
const fing = (s) => { let m = 0; for (const t of s.split(" ")) m |= { T: LT, 1: L1, 2: L2, 3: L3, l: L4, 4: R1, 5: R2, 6: R3, r: R4 }[t] ?? 0; return m; };
// フルート (ベーム式、実音 = 記譜)。C4 〜 C7
const FLUTE = {
  60: "T 1 2 3 4 5 6 r", 61: "T 1 2 3 4 5 6 r", 62: "T 1 2 3 4 5 6 r", 63: "T 1 2 3 4 5 6 r", 64: "T 1 2 3 4 5 r", 65: "T 1 2 3 4 r",
  66: "T 1 2 3 6 r", 67: "T 1 2 3 r", 68: "T 1 2 3 l r", 69: "T 1 2 r", 70: "1 4 r", 71: "T 1 r", 72: "1 r", 73: "r",
  74: "T 2 3 4 5 6 r", 75: "T 2 3 4 5 6 r", 76: "T 1 2 3 4 5 r", 77: "T 1 2 3 4 r", 78: "T 1 2 3 6 r", 79: "T 1 2 3 r", 80: "T 1 2 3 l r",
  81: "T 1 2 r", 82: "1 4 r", 83: "T 1 r", 84: "1 r", 85: "r", 86: "T 1 3 4 r", 87: "T 1 2 3 4 5 6 r", 88: "T 1 2 4 5 r",
  89: "T 1 3 4 r", 90: "T 1 3 6 r", 91: "1 2 3 r", 92: "2 3 l r", 93: "T 2 4 r", 94: "1 4 r", 95: "T 1 4 6 r", 96: "1 2 l 4 r",
};
// オーボエ (実音 = 記譜)。左の親指 = オクターブキー
const OBOE_LOW = { 58: "1 2 3 4 5 6 r", 59: "1 2 3 4 5 6 r", 60: "1 2 3 4 5 6 r", 61: "1 2 3 4 5 6 r", 62: "1 2 3 4 5 6", 63: "1 2 3 4 5 6 r",
  64: "1 2 3 4 5", 65: "1 2 3 4 6", 66: "1 2 3 5", 67: "1 2 3", 68: "1 2 3 l", 69: "1 2", 70: "1 4", 71: "1", 72: "2", 73: "" };
function oboe(p) { if (p <= 73) return OBOE_LOW[Math.max(58, p)]; if (p <= 85) return "T " + OBOE_LOW[p - 12]; return "T 1 2 4 5"; }
// クラリネット (B♭管: 記譜 = 実音 + 2)。左の親指 = 親指の穴 (T)、レジスターキーも同じ指。低い音域とその 12 度上 (クラリオン)
const CLAR_LOW = { 52: "T 1 2 3 l 4 5 6", 53: "T 1 2 3 4 5 6", 54: "T 1 2 3 4 5 6 r", 55: "T 1 2 3 4 5", 56: "T 1 2 3 4 5 r", 57: "T 1 2 3 4",
  58: "T 1 2 3 5", 59: "T 1 2 3 r", 60: "T 1 2 3", 61: "T 1 2 3 l", 62: "T 1 2", 63: "T 1 2 4", 64: "T 1", 65: "T", 66: "1", 67: "", 68: "1", 69: "1", 70: "T 1" };
function clarinet(p) {
  const w = p + 2;
  if (w <= 70) return CLAR_LOW[Math.max(52, w)];
  if (w <= 84) return "T " + CLAR_LOW[w - 19];           // クラリオン: 12 度下の押さえ方 + レジスターキー
  return { 85: "T 1 2 4 5", 86: "T 1 2 4", 87: "T 1 2 3 4 5", 88: "T 1 2 4 5", 89: "T 1 2 l 4" }[w] ?? "T 1 2 4";
}
// ファゴット (実音)。F2〜E3 の形を、上のオクターブは半分開け (見た目は同じ) で繰り返す。最低音域は小指のキーも
const BASSOON_OCT = { 0: "T 1 2 3 4 5 6", 1: "T 1 2 3 4 5 6 r", 2: "T 1 2 3 4 5", 3: "T 1 2 3 4 5 r", 4: "T 1 2 3 4", 5: "T 1 2 3 4 r",
  6: "T 1 2 3", 7: "T 1 2 3 l", 8: "T 1 2", 9: "T 1 2 l", 10: "T 1", 11: "T" };
function bassoon(p) { if (p < 41) return "T 1 2 3 l 4 5 6 r"; const k = (p - 41) % 12; return p >= 65 ? "1 2 " + BASSOON_OCT[k] : BASSOON_OCT[k]; }
// 金管: 開いた管の倍音 (第 7 倍音は使わない) に届くまで下げる半音の数 → ピストンの組み合わせ (0, 2, 1, 1+2, 2+3, 1+3, 1+2+3)
const VALVES_BY_DROP = [0, 0b010, 0b001, 0b011, 0b110, 0b101, 0b111];
function brassValves(p, fundamental) {
  const partials = [2, 3, 4, 5, 6, 8, 9, 10, 12, 16].map((k) => fundamental + Math.round(12 * Math.log2(k)));
  for (let d = 0; d <= 6; d++) if (partials.includes(p + d)) return VALVES_BY_DROP[d];
  return 0b111;
}
const KEYS = {
  flute: (p) => fing(FLUTE[clamp(p, 60, 96)] ?? ""),
  oboe: (p) => fing(oboe(p)),
  clarinet: (p) => fing(clarinet(p)),
  bassoon: (p) => fing(bassoon(p)),
  trumpet: (p) => brassValves(p, 48),        // C 管: C3 の倍音列 (C4 G4 C5 E5 G5 C6 …)
  horn: (p) => brassValves(p, 29),           // F 管: F1 の倍音列 (F2 C3 F3 A3 C4 F4 G4 A4 …)
};
export function fingering(kind, p) { return KEYS[kind]?.(p) ?? 0; }

/* ─────────── 楽器ごとの形 ───────────
   方向は体の向きの中 (+x = 奏者の左、+y = 上、+z = 前)。楽器の中の点は instruments.js の楽器の中 (m)。
   play.inst: [楽器の軸 a1, 体の向き w1, 楽器の軸 a2, 体の向き w2] (a1 を w1 にぴったり、a2 を w2 の側へ)
   play.spine / head: [前へ, 左へ回る, 左へ傾く] (rad)。ahead = 楽器の口の点をロボットの口からどれだけ前に置くか (唇の厚み)
   rest.at: 休むときの楽器の口の点 (体の中・床から m)。rest.inst: 休むときの向き (play.inst と同じ書き方)
   hands[side]: 楽器の中の手の向き (fingers = 指の向き、dorsal = 手の甲の向き)。pole = 肘を出す向き (体の中)。
     key 方式: 中指を自然に曲げた形 (curl = [付け根, 先]) で、keys の中指の所に触るように手を置く。
     grip 方式: 手の中の点 (point = grip | palm) を at (楽器の中の点か spec.points の名前) に置く。
   keys[side][指 0..4] = [楽器の中の点, 面の外向き, 離したときの浮き (m)] か null (その指は form の形のまま)。 */
const D = (x, y, z) => new THREE.Vector3(x, y, z);
const FL_AX = -0.0112;
function reedAxes(deg) { const a = deg * PI / 180; return [D(0, 1, 0), D(0, -Math.cos(a), Math.sin(a)), D(0, 0, 1), D(0, Math.sin(a), Math.cos(a))]; }
function bn(x, y, z) { return D(x, y, z).add(D(0, -0.965, -0.205)); }   // ファゴットの下の端から測った点 (instruments.js の at と同じ)
function lever(k) { return [D(-0.05, -0.2, 0), D(-0.025, -0.218, 0), D(0, -0.228, 0)][k].add(D(-0.064, 0.018, 0.031)); }   // ホルンのレバーの指の当たる面
const KIND = {
  flute: {
    play: { spine: [0.05, 0.12, 0], head: [0.08, 0.3, -0.12], inst: [D(0, 1, 0), D(-0.95, -0.2, 0.3), D(0, 0, 1), D(0, 1, -0.15)], ahead: 0.006 },
    rest: { fromPlay: { dp: D(0.05, -0.22, 0.14), turn: [D(1, 0, -0.3), 0.45] } },
    hands: {
      Left: { mode: "key", fingers: D(0.3, 0, 1), dorsal: D(-1, 0, 0.3), curl: [0.55, 1.1], pole: D(0.5, -0.8, 0.2) },
      Right: { mode: "key", fingers: D(-0.25, 0, 1), dorsal: D(1, 0, 0.25), curl: [0.55, 1.0], pole: D(-0.2, -0.9, 0.35) },   // 右の肘は下へ (肩から手首への向きと平行にしない。平行だと上げ下げの途中で肘が裏返る)
    },
    keys: {
      Left: [[D(0.009, 0.236, FL_AX - 0.006), D(0.6, 0, -0.8), 0.006], [D(0, 0.226, 0.001), D(0, 0, 1), 0.012], [D(0, 0.29, 0.001), D(0, 0, 1), 0.012], [D(0, 0.318, 0.001), D(0, 0, 1), 0.012], [D(0.008, 0.342, 0.0), D(0.4, 0, 1), 0.01]],
      Right: [[D(0.006, 0.41, FL_AX - 0.011), D(0, 0, -1), 0], [D(0, 0.398, 0.001), D(0, 0, 1), 0.012], [D(0, 0.426, 0.001), D(0, 0, 1), 0.012], [D(0, 0.47, 0.001), D(0, 0, 1), 0.012], [D(0.008, 0.502, 0.0), D(0.4, 0, 1), 0.01]],
    },
  },
  oboe: {
    play: { spine: [0.06, 0, 0], head: [0.12, 0, 0], inst: reedAxes(36), ahead: 0.002 }, bellTilt: 0.06,
    rest: { at: D(-0.11, 1.17, 0.34), inst: [D(0, 1, 0), D(0.02, -0.95, 0.12), D(0, 0, 1), D(0, 0.15, 1)] },
    // 右の肘は下へ (体の横に下ろす)。横へ張ると、右どなり (0.75 m) の奏者の横へ張った左の肘と、上腕どうしが交わっていた。
    // 左の肘はそのまま: 左手は肩のすぐ前 (胸の上) にあり、肘を下げると前腕が自分の胸に入る
    hands: {
      Left: { mode: "key", fingers: D(0.25, -0.15, 1), dorsal: D(-1, 0, 0.2), curl: [0.5, 1.05], pole: D(0.8, -0.6, 0) },
      Right: { mode: "key", fingers: D(-0.25, -0.15, 1), dorsal: D(1, 0, 0.2), curl: [0.5, 1.05], pole: D(-0.1, -1, 0) },
    },
    keys: {
      Left: [[D(0, 0.2, -0.0125), D(0, 0, -1), 0.005], [D(0, 0.12, 0.0105), D(0, 0, 1), 0.011], [D(0, 0.155, 0.0105), D(0, 0, 1), 0.011], [D(0, 0.19, 0.0105), D(0, 0, 1), 0.011], [D(-0.008, 0.235, 0.008), D(-0.5, 0, 0.85), 0.009]],
      Right: [[D(0, 0.4, -0.016), D(0, 0, -1), 0], [D(0, 0.33, 0.011), D(0, 0, 1), 0.011], [D(0, 0.37, 0.0115), D(0, 0, 1), 0.011], [D(0, 0.41, 0.0118), D(0, 0, 1), 0.011], [D(0.008, 0.46, 0.0085), D(0.5, 0, 0.85), 0.009]],
    },
  },
  clarinet: {
    play: { spine: [0.06, 0, 0], head: [0.12, 0, 0], inst: reedAxes(40), ahead: 0.002 }, bellTilt: 0.06,
    rest: { at: D(-0.11, 1.18, 0.33), inst: [D(0, 1, 0), D(0.02, -0.95, 0.13), D(0, 0, 1), D(0, 0.15, 1)] },
    // 右の肘は下へ (オーボエと同じ理由。右どなりの奏者の左腕と交わらないように)
    hands: {
      Left: { mode: "key", fingers: D(0.25, -0.15, 1), dorsal: D(-1, 0, 0.2), curl: [0.5, 1.05], pole: D(0.8, -0.6, 0) },
      Right: { mode: "key", fingers: D(-0.25, -0.15, 1), dorsal: D(1, 0, 0.2), curl: [0.5, 1.05], pole: D(-0.1, -1, 0) },
    },
    keys: {
      Left: [[D(0, 0.205, -0.0158), D(0, 0, -1), 0.005], [D(0, 0.2, 0.0158), D(0, 0, 1), 0.011], [D(0, 0.24, 0.0158), D(0, 0, 1), 0.011], [D(0, 0.28, 0.0158), D(0, 0, 1), 0.011], [D(-0.01, 0.31, 0.01), D(-0.6, 0, 0.8), 0.009]],
      Right: [[D(0, 0.425, -0.018), D(0, 0, -1), 0], [D(0, 0.4, 0.0158), D(0, 0, 1), 0.011], [D(0, 0.44, 0.0158), D(0, 0, 1), 0.011], [D(0, 0.48, 0.0158), D(0, 0, 1), 0.011], [D(0.01, 0.52, 0.01), D(0.6, 0, 0.8), 0.009]],
    },
  },
  bassoon: {
    play: { spine: [0.05, 0.05, 0], head: [0.06, 0.12, 0.04], inst: [D(0, 1, 0), D(0.55, 0.83, -0.05), D(0, 0, 1), D(-0.5, 0, -0.86)], ahead: 0.002 },
    rest: { fromPlay: { dp: D(0.03, -0.06, 0.08), turn: [D(0, 0, 1), -0.08] } },
    hands: {
      Left: { mode: "key", frame: "body", fingers: D(-0.6, 0, 0.8), dorsal: D(-0.49, 0.22, -0.84), curl: [0.5, 1.0], pole: D(0.8, -0.6, 0) },
      Right: { mode: "key", frame: "body", fingers: D(0.2, -0.6, 0.75), dorsal: D(-0.49, 0.22, -0.84), curl: [0.5, 1.0], pole: D(-0.35, -0.8, -0.5) },
    },
    keys: {
      Left: [[bn(0.016, 0.74, -0.017), D(0, 0, -1), 0.006], [bn(0.016, 0.64, 0.024), D(0, 0, 1), 0.011], [bn(0.016, 0.7, 0.024), D(0, 0, 1), 0.011], [bn(0.016, 0.76, 0.024), D(0, 0, 1), 0.011], [bn(0.03, 0.58, 0.02), D(0.6, 0, 0.8), 0.009]],
      Right: [[bn(-0.004, 0.43, -0.026), D(0, 0, -1), 0.006], [bn(0, 0.35, 0.026), D(0, 0, 1), 0.011], [bn(0, 0.41, 0.026), D(0, 0, 1), 0.011], [bn(0, 0.47, 0.026), D(0, 0, 1), 0.011], [bn(0.03, 0.3, 0.022), D(0.6, 0, 0.8), 0.009]],
    },
  },
  horn: {
    play: { spine: [0.04, -0.12, 0], head: [0.1, 0.05, 0], inst: [D(0, -1, 0), D(-0.16, -0.86, 0.48), D(0.86, -0.51, 0), D(-0.78, -0.28, -0.56)], ahead: 0.003 },
    rest: { at: D(-0.03, 0.98, 0.28), inst: [D(0, -1, 0), D(-0.2, -0.85, 0.48), D(0.86, -0.51, 0), D(-0.65, -0.72, -0.25)] },
    hands: {
      Left: { mode: "key", fingers: D(0.45, 0.85, 0.2), dorsal: D(-0.1, 0, 1), curl: [0.45, 0.9], pole: D(0.15, -0.95, -0.25) },   // 左の肘は下へ (外へ張ると隣の hn2 の腕に、右隣のホルンのベルが当たる)
      // 右手はベルの中: 手首はベルの縁の上の側 (肘に近い側)、丸めた手を斜めに奥へ入れる。手のひら・指がベルの壁を外へ突き抜けず、
      // 指先が縁より外へ出ない形のうち、手首の曲がりが一番小さい (62°。手首はベルの縁に隠れる) 形を、手の点とベルの形の距離で探して決めた
      // (s = 手首の軸の上の位置 (ベルの長さの割合)、r = 軸からの離れ (m)、beta = 指を軸の側へ倒す角度、gam = 体の右から軸のまわりに回した側)。
      // 右の肘は下と後ろへ (横へ張らない)
      Right: { mode: "bell", s: 1.0, r: 0.09, beta: 0.9, gam: 1.6, pole: D(-0.4, -0.65, -0.65) },
    },
    keys: {
      // レバー 3 つ。押すと楽器の -z へ 8 mm 沈む (人さし指 = 1 番)
      Left: [null, [lever(0), D(0, 0, 1), 0], [lever(1), D(0, 0, 1), 0], [lever(2), D(0, 0, 1), 0], null],
      Right: [null, null, null, null, null],
    },
    press: { travel: 0.008, dir: D(0, 0, -1), lever: 0.16 },
    bellUp: { axis: D(-0.16, -0.86, 0.48).normalize(), angle: -0.15 },   // ff の長い音: 吹き込み管のまわりに少し回し、頭も後ろへ (bellTilt) → ベルがももから上がる
    bellTilt: 0.1,
  },
  trumpet: {
    play: { spine: [0.02, 0, 0], head: [-0.02, 0, 0], inst: [D(0, 1, 0), D(0, -0.16, 1), D(0, 0, 1), D(0, 1, 0.16)], ahead: 0.003 },
    rest: { at: D(0.12, 0.64, 0.24), inst: [D(0, 1, 0), D(0, 1, 0.15), D(0, 0, 1), D(0.3, 0, -1)], awayTurn: 1.5 },   // 左のももに立てて持つ (ベルは上・ピストンは自分の方)。上げるときは前へ倒すだけ
    hands: {
      Right: { mode: "key", fingers: D(-0.45, 0, 0.9), dorsal: D(0.9, 0, 0.45), curl: [0.6, 1.1], pole: D(-0.25, -1, -0.15) },   // 手首はピストンの右下、指は上から押す
      Left: { mode: "grip", point: "grip", at: D(-0.004, 0.19, -0.012), fingers: D(0, 1, 0), dorsal: D(-1, 0, 0), pole: D(0.5, -1, -0.1) },
    },
    keys: {
      // ピストンのボタンの上 (z = 0.0605)。押すと 12 mm 沈む。親指は 1 番の手前の管の下
      Right: [[D(0.004, 0.152, -0.008), D(0, -1, 0), 0], [D(0, 0.165, 0.0605), D(0, 0, 1), 0], [D(0, 0.188, 0.0605), D(0, 0, 1), 0], [D(0, 0.211, 0.0605), D(0, 0, 1), 0], null],
      Left: [null, null, null, null, null],
    },
    press: { travel: 0.012, dir: D(0, 0, -1) },
    bellTilt: 0.16,   // ff の長い音でベルを上げる (頭ごと後ろへ。楽器は頭に付いているので一緒に上がる)
    restHand: { side: "Right", at: D(-0.13, 0.58, 0.3), fingers: D(0, -0.3, 1), dorsal: D(-0.2, 1, 0) },
  },
};
// 押さえる所の無い指の形 ([付け根, 先] × 5、開き × 5)
const FORM = {
  key: { curl: [[0.55, 0.5], [0.6, 0.7], [0.6, 0.7], [0.6, 0.7], [0.6, 0.7]], spread: [0.9, 0.06, 0, -0.05, -0.1] },
  grip: { curl: [[0.6, 0.55], [1.15, 1.05], [1.2, 1.1], [1.2, 1.1], [1.15, 1.05]], spread: [0.9, 0.08, 0, -0.06, -0.12] },
  bell: { curl: [[0.6, 0.6], [0.8, 0.9], [0.8, 0.9], [0.8, 0.9], [0.8, 0.9]], spread: [0.4, 0.03, 0, -0.03, -0.06] },   // ホルンの右手: 丸めて指をそろえる
  thigh: { curl: [[0.3, 0.25], [0.35, 0.3], [0.35, 0.3], [0.35, 0.3], [0.4, 0.35]], spread: [0.5, 0.05, 0, -0.05, -0.1] },
};

/* ─────────── 当たりの形 (確かめ用) ───────────
   楽器: 楽器の中の球の並び {p, r, near}。near = 口の点に近い (自分の頭・首とは比べない)。
   ロボット: 骨ごとのカプセルと箱 (robot-lite.js の部品の寸法から。ロボット単位)。 */
function instSpheres(kind) {
  const out = [], add = (p, r) => out.push({ p, r, near: p.length() < 0.045 });
  const along = (pts, r, step = 0.02) => {
    for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(a.distanceTo(b) / step)); for (let k = 0; k < n; k++) { const p = a.clone().lerp(b, k / n); add(p, typeof r === "function" ? r(p) : r); } }
    const e = pts[pts.length - 1].clone(); add(e, typeof r === "function" ? r(e) : r);
  };
  const rim = (c, axis, rad, r, n = 10) => {
    const u = D(1, 0, 0); if (Math.abs(u.dot(axis)) > 0.9) u.set(0, 0, 1); u.addScaledVector(axis, -u.dot(axis)).normalize();
    const w = new THREE.Vector3().crossVectors(axis, u);
    for (let i = 0; i < n; i++) { const a = 2 * PI * i / n; add(c.clone().addScaledVector(u, rad * Math.cos(a)).addScaledVector(w, rad * Math.sin(a)), r); }
  };
  if (kind === "flute") along([D(0, -0.06, FL_AX), D(0, 0.6, FL_AX)], 0.0115);
  else if (kind === "oboe") along([D(0, 0.03, 0), D(0, 0.6, 0), D(0, 0.645, 0)], (p) => (p.y < 0.07 ? 0.007 : p.y < 0.6 ? 0.012 : 0.02));
  else if (kind === "clarinet") { along([D(0, 0.02, 0), D(0, 0.6, 0)], (p) => (p.y < 0.1 ? 0.013 : 0.016)); rim(D(0, 0.645, 0), D(0, 1, 0), 0.022, 0.012, 8); }
  else if (kind === "bassoon") {
    along([bn(-0.004, 0.03, 0), bn(-0.004, 0.5, 0)], 0.036, 0.03);
    along([bn(0.016, 0.5, 0.005), bn(0.016, 1.0, 0.005)], 0.019, 0.03);
    along([bn(-0.024, 0.5, -0.006), bn(-0.024, 1.33, -0.006)], 0.026, 0.03);
    along([bn(0.016, 1.0, 0.005), bn(0.016, 1.04, 0.035), bn(0.014, 1.045, 0.09), bn(0.01, 1.02, 0.15), bn(0.006, 0.985, 0.19)], 0.006);
  } else if (kind === "horn") {
    const Cc = D(0.035, -0.255, 0), Rr = 0.128;
    for (let i = 0; i < 28; i++) { const a = 2 * PI * i / 28; add(Cc.clone().add(D(Rr * Math.cos(a), Rr * Math.sin(a), 0)), 0.019); }
    along([D(0, -0.03, 0), D(0, -0.068, 0), D(-0.006, -0.1, 0.004), D(-0.03, -0.135, 0.012), D(-0.06, -0.155, 0.012)], 0.008);
    const throat = Cc.clone().add(D(Rr * 0.55, -Rr * 0.84, 0)), axis = D(0.86, -0.51, 0).normalize();
    const n0 = out.length;
    for (let s = 0; s <= 1.0001; s += 0.1) { const rad = 0.0085 + 0.141 * Math.pow(s, 3.6), c = throat.clone().addScaledVector(axis, s * 0.36); if (rad < 0.03) add(c, rad + 0.003); else rim(c, axis, rad, 0.012, rad > 0.08 ? 14 : 8); }
    for (let i = n0; i < out.length; i++) out[i].skip = "RightForeArm";   // 右手はベルの中、右の前腕はベルの縁に乗せる (本物のホルン吹きと同じ)
  } else if (kind === "trumpet") {
    along([D(0, 0.01, 0), D(0, 0.085, 0), D(0, 0.2, -0.008), D(0, 0.33, -0.022), D(0, 0.345, -0.035), D(0, 0.335, -0.048), D(0, 0.24, -0.05)], 0.008);
    for (const y of [0.165, 0.188, 0.211]) for (const z of [-0.035, -0.006, 0.025]) add(D(0, y, z), 0.011);
    for (let s = 0; s <= 1.0001; s += 0.1) { const rad = 0.0062 + 0.0548 * Math.pow(s, 4.2), c = D(0, 0.27 + s * 0.21, 0.02); if (rad < 0.02) add(c, rad + 0.003); else rim(c, D(0, 1, 0), rad, 0.008, 10); }
  }
  return out;
}
// ロボットの体の当たり (ロボット単位): カプセル [骨, 端 a, 端 b, 半径] と箱 [骨, 中心, 半分の大きさ]
const BODY_CAPS = [
  ["LowerBack", [0, 0, 0], [0, 4.3, 0], 1.1], ["Neck1", [0, -0.6, 0], [0, 1.15, 0], 0.5],
  ["LeftArm", [0, 0, 0], [5.4, 0, 0], 0.62], ["RightArm", [0, 0, 0], [-5.4, 0, 0], 0.62],
  ["LeftForeArm", [0.3, 0, 0], [4.6, 0, 0], 0.55], ["RightForeArm", [-0.3, 0, 0], [-4.6, 0, 0], 0.55],
  ["LeftUpLeg", [0, 0, 0], [0, -7.4, 0], 0.85], ["RightUpLeg", [0, 0, 0], [0, -7.4, 0], 0.85],
  ["LeftLeg", [0, 0, 0], [0, -7.0, 0], 0.65], ["RightLeg", [0, 0, 0], [0, -7.0, 0], 0.65],
  ["LeftShoulder", [2.2, 0.1, 0], [2.2, 0.1, 0], 1.0], ["RightShoulder", [-2.2, 0.1, 0], [-2.2, 0.1, 0], 1.0],
  ["Head", [0, 1.1, 0.05], [0, 1.55, 0.05], 1.22],
];
const BODY_BOXES = [["Spine1", [0, 0.25, -0.03], [2.2, 1.7, 1.52]], ["Hips", [0, -0.7, 0], [1.3, 0.75, 1.03]]];
const HAND_BOXES = [["LeftHand", [0.85, 0.05, 0], [0.85, 0.35, 0.9]], ["RightHand", [-0.85, 0.05, 0], [0.85, 0.35, 0.9]]];
const HEADISH = new Set(["Head", "Neck1"]);

/* ─────────── 作業用 (毎コマ物を作らない) ─────────── */
const _v1 = V(), _v2 = V(), _v3 = V(), _v4 = V(), _p = V(), _s = V();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

/* ─────────── 時間の表 ─────────── */
// 区間の表 [{a, b, v0, v1}] (a の順・重ならない) の、時刻 t の値。区間の間は前の区間の終わりの値
function seg(list, t, cur) {
  if (!list.length) return 0;
  let i = clamp(cur.i, 0, list.length - 1);
  while (i + 1 < list.length && list[i + 1].a <= t) i++;
  while (i > 0 && list[i].a > t) i--;
  cur.i = i;
  const s = list[i];
  if (t < s.a) return s.v0;
  if (t >= s.b) return s.v1;
  return lerp(s.v0, s.v1, smoother((t - s.a) / (s.b - s.a)));
}
// 1 秒に RATE 点の表を引く (直線でつなぐ)
function sample(arr, t) { const x = clamp(t * RATE, 0, arr.length - 1), i = Math.floor(x), f = x - i; return i + 1 < arr.length ? arr[i] + (arr[i + 1] - arr[i]) * f : arr[i]; }
// 時刻 t 以下で一番遅い要素の番号 (key の順の配列、二分探索)
function lastAt(list, t, key = "t") { let lo = -1, hi = list.length; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (list[m][key] <= t) lo = m; else hi = m; } return lo; }

function buildTimeline(notes, kind, seat, endSec) {
  const T = TIMING, ph = phrases(notes, T.phraseGap), up = [], off = [], breaths = [], looks = [], accents = [], keys = [];
  const jit = (k) => seat.hash(k) - 0.5;
  ph.forEach((p, i) => {
    const prev = ph[i - 1], next = ph[i + 1];
    const lowered = !prev || p.t0 - prev.t1 >= T.lowerGap;
    const rs = p.t0 - T.raise + 0.06 * jit(10 + i), re = p.t0 - T.hold;
    if (lowered) { up.push({ a: rs, b: re, v0: 0, v1: 1 }); looks.push({ a: p.t0 - T.lookBefore + 0.2 * jit(40 + i), b: rs + 0.35 }); }
    else off.push({ a: Math.max(rs, prev.t1 + T.offAfter + T.offDur + 0.02), b: re, v0: 1, v1: 0 });
    if (!next || next.t0 - p.t1 >= T.lowerGap) { const a = p.t1 + T.lowerAfter; up.push({ a, b: a + T.lowerDur, v0: 1, v1: 0 }); }
    else { const a = p.t1 + T.offAfter; off.push({ a, b: a + T.offDur, v0: 0, v1: 1 }); }
    // 息: ひと息の前は大きく、ひと息の中の 0.3 秒以上の休みでは小さく
    breaths.push({ t: p.t0 - 0.03, amp: lowered ? 1 : 0.8, rise: 0.55 });
    for (let k = 1; k < p.notes.length; k++) {
      const g = p.notes[k].t0 - p.notes[k - 1].t1;
      if (g >= 0.3) breaths.push({ t: p.notes[k].t0 - 0.02, amp: clamp(0.35 + 0.3 * (g - 0.3), 0.35, 0.65), rise: Math.min(0.45, g - 0.05) });
    }
    // 体を前へ: f 以上で入るひと息の頭 (アクセントの音は下で)
    if (p.notes[0].v >= 96) accents.push({ t: p.t0, amp: 0.6 });
  });
  for (const n of notes) if (n.acc) accents.push({ t: n.t0, amp: 1 });
  accents.sort((a, b) => a.t - b.t);
  breaths.sort((a, b) => a.t - b.t);
  off.sort((a, b) => a.a - b.a);
  // 押さえ方の変わり目 (音の高さが変わる所。同時の 2 音は高い方)
  let last = null;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (i + 1 < notes.length && notes[i + 1].t0 === n.t0) continue;
    const pat = fingering(kind, n.p);
    if (last === null) { keys.push({ t: -1e9, from: pat, to: pat }); last = pat; }
    if (pat !== last) { keys.push({ t: n.t0, from: last, to: pat }); last = pat; }
  }
  if (!keys.length) keys.push({ t: -1e9, from: 0, to: 0 });
  // 強さ (揺れの大きさ) とベル: 1 秒 RATE 点。目標を前から順に追う (決まった計算なので毎回同じ)
  const n = Math.ceil((endSec + 2) * RATE) + 1, level = new Float32Array(n), bell = new Float32Array(n);
  let j = 0, lv = 0, bl = 0;
  for (let k = 0; k < n; k++) {
    const t = k / RATE;
    while (j < notes.length && notes[j].t1 <= t) j++;
    let target = 0, bt = 0;
    const c = notes[j];
    if (c && c.t0 <= t) {
      const f = clamp((t - c.t0) / Math.max(0.05, c.t1 - c.t0), 0, 1);
      const v = c.v2 != null ? lerp(c.v, c.v2, Math.min(1, f * (c.d / Math.max(1e-3, c.v2d ?? c.d)))) : c.v;
      target = v / 127;
      if (c.v >= 108 && c.t1 - c.t0 >= 0.45) bt = clamp((c.t1 - c.t0 - 0.3) / 1.2, 0.4, 1) * clamp((v - 96) / 20, 0, 1);
    } else if (j > 0 && t - notes[j - 1].t1 < 0.6) target = lv;
    lv += (target - lv) * (1 - Math.exp(-(1 / RATE) / (target > lv ? 0.2 : 0.55)));
    bl += (bt - bl) * (1 - Math.exp(-(1 / RATE) / (bt > bl ? 0.28 : 0.45)));
    level[k] = lv; bell[k] = bl;
  }
  return { ph, up, off, breaths, looks, accents, keys, level, bell, cur: { up: { i: 0 }, off: { i: 0 } } };
}
// 息 (肩の上がり 0..1): 吸うのは入りの前の rise 秒、吹きながら 1 秒で下がる
function breathAt(list, t) {
  let out = 0;
  for (let k = lastAt(list, t + 0.6); k >= 0; k--) {
    const b = list[k], tau = t - b.t;
    if (tau > 1.2) break;
    const v = tau < -b.rise ? 0 : tau <= 0 ? smoother((tau + b.rise) / b.rise) : 1 - smoother(tau / 1.0);
    out = Math.max(out, v * b.amp);
  }
  return out;
}
// アクセントで前へ (音の始まりから 80 ms で寄り、0.3 秒で戻る。口に当てて止まっている 0.25 秒の間は動かない)
function leanAt(list, t) {
  let out = 0;
  for (let k = lastAt(list, t); k >= 0; k--) {
    const a = list[k], tau = t - a.t;
    if (tau > 2) break;
    out += a.amp * (tau < 0 ? 0 : tau < 0.08 ? smoother(tau / 0.08) : Math.exp(-(tau - 0.08) / 0.3));
  }
  return Math.min(1.3, out);
}
// 指揮者を見る (0..1)
function lookAtConductor(list, t) {
  let out = 0;
  for (let k = Math.max(0, lastAt(list, t + 0.4, "a") - 1); k < list.length; k++) { const w = list[k]; if (w.a - 0.4 > t) break; if (t < w.b + 0.4) out = Math.max(out, smoother((t - w.a + 0.35) / 0.35) * (1 - smoother((t - w.b) / 0.35))); }
  return out;
}
// 今の押さえ方: from → to を f (0..1) で
function keysAt(list, t, out) {
  const k = list[Math.max(0, lastAt(list, t + TIMING.keyLead))];
  out.from = k.from; out.to = k.to; out.f = smoother((t - (k.t - TIMING.keyLead)) / (TIMING.keyLead - TIMING.keyDone));
  return out;
}

/* ─────────── 指 2 節の IK ─────────── */
// 手の骨の中 (ロボット単位) の点 target に、指 i の先を当てる → [付け根の曲げ, 先の曲げ, 開き]
function fingerIK(rig, side, i, target) {
  const f = rig.fingers[side][i], sgn = R.sgnOf(side), l0 = f.len * 0.55, l1 = f.len * 0.45;
  const v = target.clone().sub(f.root.position);
  const sp = sgn > 0 ? Math.atan2(v.z, v.x) : Math.atan2(v.z, -v.x);
  const h = Math.hypot(v.x, v.z), dn = -v.y;
  const d = clamp(Math.hypot(h, dn), Math.abs(l0 - l1) + 1e-3, (l0 + l1) * 0.999);
  const al = Math.atan2(dn, h), be = Math.acos(clamp((l0 * l0 + d * d - l1 * l1) / (2 * l0 * d), -1, 1));
  const c1 = PI - Math.acos(clamp((l0 * l0 + l1 * l1 - d * d) / (2 * l0 * l1), -1, 1));
  return [al - be, c1, sp];
}
// 指 i を (c0, c1) に曲げたときの指先 (手の骨の中、ロボット単位。開き 0)
function fingerTipLocal(rig, side, i, c0, c1) {
  const f = rig.fingers[side][i], sgn = R.sgnOf(side), l0 = f.len * 0.55, l1 = f.len * 0.45;
  return f.root.position.clone().add(D(sgn * (l0 * Math.cos(c0) + l1 * Math.cos(c0 + c1)), -(l0 * Math.sin(c0) + l1 * Math.sin(c0 + c1)), 0));
}

/* ─────────── 腕の IK (rig.solveArm と同じ答え。行列を何度も更新せず、骨の local の回転だけ書く) ───────────
   肩 → 肘 → 手首の 2 本の骨を、手首 wrist (world) に。pole = 肘を出す向き (world)、handQ = 手の world の向き。
   Spine1 の matrixWorld は呼ぶ前に新しくしておく。戻り値 = 届かなかった長さ (m) */
const _a = V(), _b = V(), _c = V(), _d = V(), _f = V(), _h = V(), _ty = V(), _tz = V();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _mW = new THREE.Matrix4();
// 腕の骨の中の軸 (x = 骨の向き (sgn,0,0)、y = (0,0,1)、z = x × y) の行列の転置 (左右で 2 つ)
const ARM_LT = { 1: new THREE.Matrix4().makeBasis(V(1, 0, 0), V(0, 0, 1), V(0, -1, 0)).transpose(), [-1]: new THREE.Matrix4().makeBasis(V(-1, 0, 0), V(0, 0, 1), V(0, 1, 0)).transpose() };
function aimQuat(sgn, d1, h, out) {
  // ローカルの (sgn,0,0) を d1 に、(0,0,1) を h の側へ向ける回転 = W · Lᵀ (rig.basisQuat と同じ)
  const y = _ty.copy(h).addScaledVector(d1, -h.dot(d1));
  if (y.lengthSq() < 1e-10) { const t = Math.abs(d1.y) < 0.9 ? Y : X; y.copy(t).addScaledVector(d1, -t.dot(d1)); }
  y.normalize();
  _mW.makeBasis(d1, y, _tz.crossVectors(d1, y));
  return out.setFromRotationMatrix(_mW.multiply(ARM_LT[sgn]));
}
function armIK(g, side, wrist, pole, handQ) {
  const sgn = R.sgnOf(side), B = g.bones, sh = B[side + "Shoulder"], arm = B[side + "Arm"];
  sh.updateWorldMatrix(false, false); arm.updateWorldMatrix(false, false);
  const S0 = _a.setFromMatrixPosition(arm.matrixWorld), a = R.ARM.upper, b = R.ARM.fore;
  // 2 本の骨 (rig.twoBone と同じ)
  const Dv = _b.subVectors(wrist, S0);
  let d = Dv.length(); const maxD = (a + b) * 0.9995, over = Math.max(0, d - maxD);
  d = Math.max(Math.min(d, maxD), Math.abs(a - b) + 1e-4);
  const dir = Dv.lengthSq() > 1e-12 ? Dv.normalize() : Dv.set(0, -1, 0);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const perp = _c.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (perp.lengthSq() < 1e-8) perp.set(0, 1, 0).addScaledVector(dir, -dir.y);
  perp.normalize();
  const E = _d.copy(S0).addScaledVector(dir, a * cosA).addScaledVector(perp, a * sinA);   // 肘
  const W = _f.copy(S0).addScaledVector(dir, d);                                           // 手首
  const d2 = W.sub(E).normalize(), d1 = E.sub(S0).normalize();
  const h = _h.crossVectors(d1, d2);
  if (h.lengthSq() < 1e-8) h.crossVectors(d1, pole);
  if (h.lengthSq() < 1e-8) h.copy(Y).applyQuaternion(g.root.quaternion).cross(d1);
  h.normalize().multiplyScalar(sgn);
  // world の向き → 骨の local
  sh.matrixWorld.decompose(_p, _qa, _s);                     // 肩の world
  const qArm = aimQuat(sgn, d1, h, _qb);
  arm.quaternion.copy(_qa).invert().multiply(qArm);
  const qFore = aimQuat(sgn, d2, h, _qc);
  B[side + "ForeArm"].quaternion.copy(qArm).invert().multiply(qFore);
  B[side + "Hand"].quaternion.copy(qFore).invert().multiply(handQ);
  return over;
}

/* ─────────── 1 パート (= 1 人) ─────────── */
export function createPlayers(stage, spec, seats) {
  const kind = seats[0]?.instrumentKind ?? spec.instrument, K = KIND[kind];
  if (!K) return { plan() {}, pose() {} };
  const ctl = { id: spec.id, kind, seats, K, ks: { from: 0, to: 0, f: 1 } };
  ctl.plan = (notes) => {
    ctl.notes = notes;
    for (const seat of seats) planSeat(stage, ctl, seat, notes);
    registerChecks(stage, ctl);
  };
  ctl.pose = (sec) => { for (const seat of seats) poseSeat(stage, ctl, seat, sec); };
  ctl.debug = (seat = seats[0]) => debugSeat(stage, ctl, seat);
  return ctl;
}

// 体・頭を吹く形にしてから、頭の骨から見た楽器の位置と向きを求める。手と指も楽器の中で決める
function planSeat(stage, ctl, seat, notes) {
  const g = seat.rig, h = seat.instrument, K = ctl.K, B = g.bones;
  const w = (seat.W = {});
  w.tl = buildTimeline(notes, ctl.kind, seat, Math.max(stage.endSec ?? 0, notes.length ? notes[notes.length - 1].t1 : 0));
  // 譜面台をよける: 前へ向く楽器 (オーボエ・クラリネット・トランペット) は、譜面台と反対の側へ少しだけ向ける
  const toStand = seat.stand ? seat.stand.pos.clone().sub(seat.pos).applyQuaternion(_q.copy(g.root.quaternion).invert()) : V();
  w.away = ["oboe", "clarinet", "trumpet"].includes(ctl.kind) ? -Math.sign(toStand.x || 1) * (ctl.kind === "trumpet" ? 0.12 : 0.07) : 0;
  w.spine = [K.play.spine[0], K.play.spine[1] + w.away * 0.5, K.play.spine[2]];
  w.head = [K.play.head[0], K.play.head[1] + w.away * 0.5, K.play.head[2]];
  // 吹く形の体と頭 → 楽器
  setBody(g, w.spine[0], w.spine[1], w.spine[2], 0);
  setHead(g, w.head[0], w.head[1], w.head[2]);
  g.root.updateMatrixWorld(true);
  const [a1, w1, a2, w2] = K.play.inst;
  const qInst = R.basisQuat(a1, R.bodyDir(g, w1.x, w1.y, w1.z), a2, R.bodyDir(g, w2.x, w2.y, w2.z));
  if (w.away) qInst.premultiply(_q.setFromAxisAngle(Y, w.away));
  const qHead = R.wquat(B.Head, new THREE.Quaternion()), mouth = R.wpos(g.points.mouth).addScaledVector(Z.clone().applyQuaternion(qHead), K.play.ahead);
  w.relPos = mouth.clone().applyMatrix4(_m.copy(B.Head.matrixWorld).invert());      // 頭の骨の中 (ロボット単位)
  w.relQ = qHead.clone().invert().multiply(qInst);
  // 休む形 (体の中: rig.root から見た位置と向き)。at = 楽器の口の点の位置、pivot = この楽器の中の点を吹く形と同じ所に残して回す、
  // fromPlay = 吹く形を体の中で dp だけずらし、turn = [体の中の軸, 角度] だけ回す
  const rootInv = g.root.quaternion.clone().invert();
  const playQB = rootInv.clone().multiply(qInst), playPB = mouth.clone().sub(g.root.position).applyQuaternion(rootInv);
  if (K.rest.fromPlay) {
    const fp = K.rest.fromPlay, turn = fp.turn ? new THREE.Quaternion().setFromAxisAngle(fp.turn[0].clone().normalize(), fp.turn[1]) : new THREE.Quaternion();
    w.restQ = turn.multiply(playQB); w.restP = playPB.clone().add(fp.dp);
  } else {
    const [r1, v1, r2, v2] = K.rest.inst;
    w.restQ = R.basisQuat(r1, v1, r2, v2);
    w.restP = K.rest.pivot ? K.rest.pivot.clone().applyQuaternion(playQB).add(playPB).sub(K.rest.pivot.clone().applyQuaternion(w.restQ)) : K.rest.at.clone();
  }
  // 上げ下ろしの間に譜面台へ振れないよう、休む形も譜面台と反対へ回しておく
  if (K.rest.awayTurn && w.away) w.restQ.premultiply(new THREE.Quaternion().setFromAxisAngle(Y, w.away * K.rest.awayTurn));
  // 手: 楽器の中の手首の位置と手の向き
  w.hands = {};
  for (const side of R.SIDES) {
    const H = K.hands[side], hand = (w.hands[side] = { side, pole: H.pole.clone(), fingers: [] });
    // 手の向きは楽器の中の向き (frame: "body" なら吹く形のときの体の中の向きで書いてある)
    const toInst = H.frame === "body" ? playQB.clone().invert() : new THREE.Quaternion();
    if (H.fingers) hand.q = R.handQuatOf(side, H.fingers.clone().applyQuaternion(toInst).normalize(), H.dorsal.clone().applyQuaternion(toInst).normalize());
    if (H.mode === "bell") {
      // ベルの中の手 (上の KIND.horn の説明)。体の右をベルの軸に直角な面へ写した向きが F、その軸まわり gam の側に手首を置く
      const A = h.spec.bellAxis.clone().normalize(), T = h.spec.points.throat, BL = h.spec.bellLength;
      const F = R.bodyDir(g, -1, 0, 0).applyQuaternion(qInst.clone().invert()), G = V();
      F.addScaledVector(A, -F.dot(A)).normalize(); G.crossVectors(A, F);
      const Fg = F.multiplyScalar(Math.cos(H.gam)).addScaledVector(G, Math.sin(H.gam));
      const t = A.clone().multiplyScalar(-Math.cos(H.beta)).addScaledVector(Fg, -Math.sin(H.beta)), n = A.clone().multiplyScalar(-Math.sin(H.beta)).addScaledVector(Fg, Math.cos(H.beta));
      hand.q = R.handQuatOf(side, t, n);
      hand.wrist = T.clone().addScaledVector(A, H.s * BL).addScaledVector(Fg, H.r);
    } else if (H.mode === "key") {
      // 中指を自然に曲げた形で、中指の押さえる所に触るように手首を置く
      const key = K.keys[side][2], target = key[0].clone().addScaledVector(key[1], g.fingers[side][2].radiusM);
      const tip = fingerTipLocal(g, side, 2, H.curl[0], H.curl[1]).multiplyScalar(S).applyQuaternion(hand.q);
      hand.wrist = target.sub(tip);
    } else {
      const at = typeof H.at === "string" ? h.spec.points[H.at].clone() : H.at.clone();
      const pt = (H.point === "palm" ? g.points["palm" + side] : g.points["grip" + side]).position.clone().multiplyScalar(S).applyQuaternion(hand.q);
      hand.wrist = at.sub(pt);
    }
    hand.form = FORM[H.mode === "key" ? "key" : ctl.kind === "horn" && side === "Right" ? "bell" : "grip"];
    // 指: 押さえる所があれば、押さえた (on) / 離した (off) 角度を IK で
    const inv = hand.q.clone().invert(), toHand = (p) => p.clone().sub(hand.wrist).applyQuaternion(inv).divideScalar(S);
    for (let i = 0; i < 5; i++) {
      const k = K.keys[side][i];
      if (!k) { hand.fingers.push(null); continue; }
      const rad = g.fingers[side][i].radiusM, valve = K.press && i >= 1 && i <= 3;
      const pressed = valve ? k[0].clone().addScaledVector(K.press.dir, K.press.travel) : k[0];
      hand.fingers.push({ on: fingerIK(g, side, i, toHand(pressed.clone().addScaledVector(k[1], rad))), off: fingerIK(g, side, i, toHand(k[0].clone().addScaledVector(k[1], rad + k[2]))), key: k });
    }
    hand.curl = hand.form.curl.map((c) => c.slice()); hand.spread = hand.form.spread.slice();
  }
  // トランペットは休むとき右手をももへ
  if (K.restHand) { const RH = K.restHand; w.restHand = { side: RH.side, at: RH.at.clone(), q: R.handQuatOf(RH.side, RH.fingers.clone().normalize(), RH.dorsal.clone().normalize()) }; }
  // 金管の動く部品の元の位置
  w.valve0 = (h.nodes.valves ?? []).map((n) => n.position.clone());
  w.lever0 = (h.nodes.levers ?? []).map((n) => n.quaternion.clone());
  w.spheres = instSpheres(ctl.kind);
  w.phase = [seat.hash(1) * 2 * PI, seat.hash(2) * 2 * PI, seat.hash(3) * 2 * PI];
  w.bellAmp = 0.92 + 0.16 * seat.hash(5);   // ベル上げの大きさは人ごとに ±8% (同じ音を吹いても全員が同じ角度にならない)
  w.over = 0; w.press = [0, 0, 0];
  poseSeat(stage, ctl, seat, -5);
}

// 背中: pitch (+ 前へ)・yaw (+ 左へ回る)・roll。肩: breath (0..1) で持ち上げる (腕の付け根が 1.5 cm ほど上がる)
function setBody(g, pitch, yaw, roll, breath) {
  R.setSpine(g, pitch, yaw, roll);
  const B = g.bones, rise = 0.11 * breath;
  B.LeftShoulder.rotation.set(0, 0, rise);
  B.RightShoulder.rotation.set(0, 0, -rise);
}
function setHead(g, pitch, yaw, roll) {
  g.bones.Neck1.rotation.set(pitch * 0.4, yaw * 0.4, roll * 0.4, "YXZ");
  g.bones.Head.rotation.set(pitch * 0.6, yaw * 0.6, roll * 0.6, "YXZ");
}

function poseSeat(stage, ctl, seat, sec) {
  const g = seat.rig, h = seat.instrument, K = ctl.K, w = seat.W, tl = w.tl, B = g.bones, rootQ = g.root.quaternion;
  // ── 時間の表から今の値
  const up = ctl.forceUp ?? seg(tl.up, sec, tl.cur.up), off = ctl.forceUp != null ? 0 : seg(tl.off, sec, tl.cur.off);   // forceUp: 形を調べるとき用 (0 = 休む形、1 = 吹く形)
  const breath = breathAt(tl.breaths, sec), lean = leanAt(tl.accents, sec);
  const level = sample(tl.level, sec), bell = sample(tl.bell, sec) * w.bellAmp, look = lookAtConductor(tl.looks, sec);
  // ── 体: 吹く形と休む形を up で混ぜ、強さで小さく揺れ、アクセントで前へ
  const ph = w.phase, playAmt = up * (1 - 0.6 * off);
  const swayRoll = playAmt * level * (0.022 * Math.sin(2 * PI * sec / 3.1 + ph[0]) + 0.014 * Math.sin(2 * PI * sec / 4.7 + ph[1]));
  const swayPitch = playAmt * level * (0.018 * Math.sin(2 * PI * sec / 2.3 + ph[2]) + 0.03);
  setBody(g, lerp(0.03, w.spine[0], up) + swayPitch + 0.055 * lean * up, lerp(0, w.spine[1], up), lerp(0, w.spine[2], up) + swayRoll, breath);
  // ── 頭: 休みは譜面か指揮者、構えると楽器の形
  // 行列は鎖ごとに 1 回だけ更新する (Spine1 まで → 首 → 頭 → 肩)。腕は local の回転だけ決める (armIK)
  B.Neck1.updateWorldMatrix(true, false);
  B.Spine1.matrixWorld.decompose(_p, _q3, _s); _q3.invert();
  const qS = _q3;
  const eye = _v1.setFromMatrixPosition(B.Neck1.matrixWorld).addScaledVector(Y, 0.12);
  const cond = stage.conductor;
  const target = _v2.copy(seat.stand?.sheetCentre ?? R.bodyPoint(g, 0, 1.0, 0.6, _v4)).lerp(_v3.set(cond.pos.x, (cond.floorY ?? 0.2) + 1.55, cond.pos.z), look);
  const dl = target.sub(eye).applyQuaternion(qS);
  const gYaw = clamp(Math.atan2(dl.x, dl.z), -0.9, 0.9) * 0.85, gPitch = clamp(-Math.atan2(dl.y, Math.hypot(dl.x, dl.z)) + 0.05 * (1 - look), -0.4, 0.6) * 0.85;
  const bellTilt = (K.bellTilt ?? 0) * bell;
  setHead(g, lerp(gPitch, w.head[0] - bellTilt + (K.press ? 0 : 0.03 * lean), up), lerp(gYaw, w.head[1], up), lerp(0, w.head[2], up));
  // ── 楽器: 頭に付いた吹く形 (ベル上げ・口から離す) と、体に付いた休む形の間
  B.Neck1.updateWorldMatrix(false, false); B.Head.updateWorldMatrix(false, false);
  const pPlay = _v1.copy(w.relPos).applyMatrix4(B.Head.matrixWorld);
  B.Head.matrixWorld.decompose(_p, _q, _s);
  const qPlay = _q.multiply(w.relQ);
  if (K.bellUp && bell > 0) qPlay.premultiply(_q2.setFromAxisAngle(_v3.copy(K.bellUp.axis).applyQuaternion(rootQ), K.bellUp.angle * bell));
  if (off > 0) { pPlay.add(_v3.set(0, -0.022 * off, 0.012 * off).applyQuaternion(rootQ)); qPlay.premultiply(_q2.setFromAxisAngle(_v3.set(1, 0, 0).applyQuaternion(rootQ), 0.08 * off)); }
  const pRest = _v2.copy(w.restP).applyQuaternion(rootQ).add(g.root.position);
  const qRest = _q2.copy(rootQ).multiply(w.restQ);
  h.root.position.lerpVectors(pRest, pPlay, up).add(_v3.set(0, 0.045, -0.01).applyQuaternion(rootQ).multiplyScalar(Math.sin(PI * up)));   // 少し上を通る (譜面台の方へふくらまない)
  h.root.quaternion.slerpQuaternions(qRest, qPlay, up);
  // ── ピストン・レバー・指の押さえ方
  const ks = keysAt(tl.keys, sec, ctl.ks);
  if (K.press) for (let k = 0; k < 3; k++) w.press[k] = lerp((ks.from >> k) & 1, (ks.to >> k) & 1, ks.f);
  if (h.nodes.valves) h.nodes.valves.forEach((n, k) => n.position.copy(w.valve0[k]).addScaledVector(K.press.dir, K.press.travel * w.press[k]));
  if (h.nodes.levers) h.nodes.levers.forEach((n, k) => n.quaternion.copy(w.lever0[k]).multiply(_q4.setFromAxisAngle(Y, -K.press.lever * w.press[k])));
  // ── 腕と手 (手首 = 楽器の位置 + 楽器の向き × 楽器の中の手首)
  let over = 0;
  for (const side of R.SIDES) {
    const hand = w.hands[side];
    const wrist = _v3.copy(hand.wrist).applyQuaternion(h.root.quaternion).add(h.root.position);
    const hq = _q3.copy(h.root.quaternion).multiply(hand.q);
    let rel = 0;
    if (w.restHand?.side === side) {
      rel = 1 - clamp((up - 0.03) / 0.9, 0, 1);   // 手は楽器の上げ下げの間ずっと同じ速さで動かす (短い間にまとめると手が飛ぶ)
      if (rel > 0) { wrist.lerp(_v4.copy(w.restHand.at).applyQuaternion(rootQ).add(g.root.position), rel); hq.slerp(_q4.copy(rootQ).multiply(w.restHand.q), rel); }
      w.handRel = rel;
    }
    const o = armIK(g, side, wrist, _v4.copy(hand.pole).applyQuaternion(rootQ), hq);
    if (rel === 0) over = Math.max(over, o);
    hand.play = smoother((up - 0.6) / 0.35);   // 休んでいる間、木管の指はキーの上に軽く置いておく
    fingersFor(g, ctl, hand, ks, rel);
  }
  w.over = over; w.state = { up, off, breath, lean, level, bell, look };
}

// 指: 押さえる所のある指は運指表で on / off を混ぜる。ほかは形のまま
function fingersFor(g, ctl, hand, ks, rel) {
  const side = hand.side, brass = !!ctl.K.press;
  for (let i = 0; i < 5; i++) {
    const f = hand.fingers[i];
    if (!f) { hand.curl[i][0] = hand.form.curl[i][0]; hand.curl[i][1] = hand.form.curl[i][1]; hand.spread[i] = hand.form.spread[i]; continue; }
    let x = 1;
    if (brass) { if (i >= 1 && i <= 3) x = lerp((ks.from >> (i - 1)) & 1, (ks.to >> (i - 1)) & 1, ks.f); }
    else { const bit = (side === "Left" ? LEFT_BITS : RIGHT_BITS)[i]; if (bit) x = lerp(1, lerp(ks.from & bit ? 1 : 0, ks.to & bit ? 1 : 0, ks.f), hand.play); }
    hand.curl[i][0] = lerp(f.off[0], f.on[0], x); hand.curl[i][1] = lerp(f.off[1], f.on[1], x); hand.spread[i] = lerp(f.off[2], f.on[2], x);
  }
  if (rel > 0) { const T = FORM.thigh; for (let i = 0; i < 5; i++) { hand.curl[i][0] = lerp(hand.curl[i][0], T.curl[i][0], rel); hand.curl[i][1] = lerp(hand.curl[i][1], T.curl[i][1], rel); hand.spread[i] = lerp(hand.spread[i], T.spread[i], rel); } }
  R.setFingers(g, side, hand.curl, hand.spread);
}

/* ─────────── 確かめ ─────────── */
function registerChecks(stage, ctl) {
  const id = ctl.id, notes = ctl.notes, seat = ctl.seats[0];
  if (!seat || !stage.addCheck) return;
  const w = seat.W, tl = w.tl;
  let ci = 0;
  const sounding = (t) => {
    while (ci > 0 && notes[ci].t0 > t) ci--;
    while (ci + 1 < notes.length && notes[ci + 1].t0 <= t) ci++;
    for (let k = ci; k >= 0 && k > ci - 4; k--) if (notes[k].t0 <= t && notes[k].t1 > t) return true;
    return false;
  };
  stage.addCheck({ id: id + ".mouth", player: id, frames: true, times: notes.map((n) => n.t0),
    measure: (t, k) => { if (k < 0 && !sounding(t)) return null; const d = mouthDist(seat); return { ok: d < 0.01, value: d }; } });
  const holdTimes = [], holdKind = [];
  tl.ph.forEach((p, i) => {
    holdTimes.push(p.t0 - TIMING.hold); holdKind.push(0);
    const lowered = i === 0 || p.t0 - tl.ph[i - 1].t1 >= TIMING.lowerGap;
    if (lowered && p.t0 - TIMING.raise - 0.08 > 0) { holdTimes.push(p.t0 - TIMING.raise - 0.08); holdKind.push(1); }
  });
  stage.addCheck({ id: id + ".hold", player: id, times: holdTimes,
    measure: (t, k) => { const d = mouthDist(seat); return holdKind[k] === 0 ? { ok: d < 0.01, value: d } : { ok: d > 0.05, value: d, info: "at the mouth before the raise" }; } });
  const keyTimes = [], keyEvent = [];
  for (const e of tl.keys) if (e.t > 0) { keyTimes.push(e.t - 0.035, e.t); keyEvent.push(e, e); }
  stage.addCheck({ id: id + ".keys", player: id, times: keyTimes,
    measure: (t, k) => { const e = keyEvent[k], dv = keyError(ctl, seat, k % 2 === 0 ? e.from : e.to); return { ok: dv < 1e-3, value: dv }; } });
  stage.addCheck({ id: id + ".grip", player: id, frames: true, measure: (t) => (Math.round(t * 60) % 2 ? null : { ok: w.over < 0.004, value: w.over }) });
  const neighbours = stage.seats.filter((s) => s !== seat && s.rig && s.pos.distanceTo(seat.pos) < 1.4);
  stage.addCheck({ id: id + ".clear", player: id, frames: true, measure: (t, k) => {
    if (k < 0 && Math.round(t * 60) % 3) return null;
    const c = clearance(seat, neighbours);
    return { ok: c.d <= 0.004, value: c.d, info: c.what };
  } });
}
function mouthDist(seat) { return seat.instrument.point("mouth", _v1).distanceTo(R.wpos(seat.rig.points.mouth, _v2)); }
// 今の形 (ピストンの位置・レバーの角度・指の曲げ) が、押さえ方 want とどれだけ違うか (m。角度は 5 cm の腕の先の動きに直す)
function keyError(ctl, seat, want) {
  const w = seat.W, h = seat.instrument, K = ctl.K;
  let err = 0;
  if (h.nodes.valves) h.nodes.valves.forEach((n, k) => { err = Math.max(err, Math.abs(n.position.distanceTo(w.valve0[k]) - K.press.travel * ((want >> k) & 1))); });
  if (h.nodes.levers) h.nodes.levers.forEach((n, k) => { err = Math.max(err, Math.abs(n.quaternion.angleTo(w.lever0[k]) - K.press.lever * ((want >> k) & 1)) * 0.05); });
  if (!K.press) for (const side of R.SIDES) {
    w.hands[side].fingers.forEach((f, i) => {
      const bit = (side === "Left" ? LEFT_BITS : RIGHT_BITS)[i];
      if (!f || !bit) return;
      const c0 = -R.sgnOf(side) * seat.rig.fingers[side][i].root.rotation.z;
      err = Math.max(err, Math.abs(c0 - ((want & bit) ? f.on[0] : f.off[0])) * 0.05);
    });
  }
  return err;
}
// 楽器の球と、体・隣の人・譜面台・椅子の一番深いめり込み (m)
function clearance(seat, neighbours) {
  const w = seat.W, h = seat.instrument;
  h.root.updateMatrixWorld(true);
  const M = h.root.matrixWorld, pts = (w._pts ??= w.spheres.map(() => V()));
  const c = (w._c ??= V()).set(0, 0, 0);
  w.spheres.forEach((s, i) => { pts[i].copy(s.p).applyMatrix4(M); c.add(pts[i]); });
  c.divideScalar(Math.max(1, pts.length));
  let reach = 0; for (const p of pts) reach = Math.max(reach, p.distanceTo(c));
  let worst = { d: 0, what: null };
  const test = (d, what) => { if (d > worst.d) worst = { d, what }; };
  const body = (s, own) => {
    const g = s.rig, who = own ? "own " : s.id + " ";
    for (const [bone, a, b, r] of BODY_CAPS) {
      const o = g.bones[bone]; o.updateWorldMatrix(true, false);
      const A = _v1.set(...a).applyMatrix4(o.matrixWorld), Bp = _v2.set(...b).applyMatrix4(o.matrixWorld), rr = r * S;
      if (distPointSegment(c, A, Bp) > reach + rr + 0.05) continue;
      pts.forEach((p, i) => { const sp = w.spheres[i]; if (own && ((sp.near && HEADISH.has(bone)) || sp.skip === bone)) return; test(sp.r + rr - distPointSegment(p, A, Bp), who + bone); });
    }
    for (const [bone, cc, hh] of own ? BODY_BOXES : BODY_BOXES.concat(HAND_BOXES)) boxTest(g.bones[bone], cc, hh, pts, w.spheres, (d) => test(d, who + bone), c, reach);
  };
  body(seat, true);
  for (const s of neighbours) body(s, false);
  // 譜面台 (板と柱) と自分の椅子 (座面と背もたれ)
  const st = seat.stand;
  if (st) {
    const sq = new THREE.Quaternion().setFromAxisAngle(Y, st.yaw), so = V(st.pos.x, st.floorY, st.pos.z), hgt = st.sheetY - st.floorY;
    obbTest(so, sq, D(0, hgt, -0.005), new THREE.Quaternion().setFromAxisAngle(X, -(st.tilt ?? 0.62)), D(0.25, 0.175, 0.022), pts, w.spheres, (d) => test(d, "stand desk"));
    const A = V(0, 0.02, 0).applyQuaternion(sq).add(so), Bp = V(0, hgt - 0.12, 0).applyQuaternion(sq).add(so);
    pts.forEach((p, i) => test(w.spheres[i].r + 0.014 - distPointSegment(p, A, Bp), "stand pole"));
  }
  if (seat.instrumentKind === "horn") bellHand(seat, test);
  if (seat.kind === "chair") {
    const cq = new THREE.Quaternion().setFromAxisAngle(Y, seat.yaw), co = V(seat.pos.x, seat.floorY, seat.pos.z), top = seat.seatTop - seat.floorY;
    obbTest(co, cq, D(0, top - 0.03, 0), null, D(0.225, 0.035, 0.215), pts, w.spheres, (d) => test(d, "chair seat"));
    obbTest(co, cq, D(0, top + 0.3, -0.22), null, D(0.21, 0.11, 0.025), pts, w.spheres, (d) => test(d, "chair back"));
  }
  return worst;
}
// ホルンの右手がベルの壁を突き抜けていないか: 手のひらの箱の角と指の節はベルの中 (か縁より外)、前腕は壁の帯に入らない (縁に乗るのはよい)。
// ベルの太さは instruments.js の buildHorn と同じ式 (のどから縁まで 0.36 m、半径 0.0085 + 0.141·s^3.6)
const HAND_PTS = [];
for (const [cx, cy, cz, sx, sy, sz] of [[0.85, -0.02, 0, 1.55, 0.42, 1.75], [0.88, 0.25, 0, 1.3, 0.16, 1.55]]) for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) HAND_PTS.push(V(-(cx + i * sx / 2), cy + j * sy / 2, cz + k * sz / 2));
const bellR = (s) => 0.0085 + 0.141 * Math.pow(Math.max(0, s), 3.6);
function bellHand(seat, test) {
  const g = seat.rig, h = seat.instrument, spec = h.spec, A = spec.bellAxis, T = spec.points.throat, BL = spec.bellLength;
  const inv = (seat.W._instInv ??= new THREE.Matrix4()).copy(h.root.matrixWorld).invert();
  const inBell = !(seat.W.handRel > 0);   // ももへ動いている間は、手も前腕と同じ「壁の帯に入らない」で測る
  const one = (p, r, fore, what) => {
    const l = p.applyMatrix4(inv).sub(T), s = l.dot(A) / BL;
    if (s < -0.05 || s > (fore ? 0.9 : 1)) return;   // 前腕がベルの縁 (口から 3.6 cm まで) に乗るのはよい (本物のホルン吹きと同じ)
    const d = l.addScaledVector(A, -s * BL).length();
    test(fore ? r + 0.003 - Math.abs(d - bellR(s)) : d + r + 0.003 - bellR(s), what);
  };
  const hb = g.bones.RightHand; hb.updateWorldMatrix(true, false);
  for (const c of HAND_PTS) one(_v1.copy(c).applyMatrix4(hb.matrixWorld), 0.003, !inBell, "right hand through the bell");
  for (const f of g.fingers.Right) for (const o of [f.root, f.joint, f.tip]) { o.updateWorldMatrix(false, false); one(_v1.setFromMatrixPosition(o.matrixWorld), 0.011, !inBell, "right finger through the bell"); }
  const fa = g.bones.RightForeArm; fa.updateWorldMatrix(false, false);
  for (let k = 0; k <= 8; k++) one(_v1.set(-(0.3 + 4.3 * k / 8), 0, 0).applyMatrix4(fa.matrixWorld), 0.034, true, "right forearm in the bell wall");
}
// 骨の箱 (ロボット単位) と球の並び
function boxTest(bone, cc, hh, pts, spheres, cb, c, reach) {
  bone.updateWorldMatrix(true, false);
  bone.matrixWorld.decompose(_p, _q3, _s);
  const centre = _v1.set(...cc).multiplyScalar(S).applyQuaternion(_q3).add(_p), half = _v2.set(...hh).multiplyScalar(S);
  if (centre.distanceTo(c) > reach + half.length() + 0.05) return;
  const inv = _q2.copy(_q3).invert();
  pts.forEach((p, i) => cb(spheres[i].r - sdBox(_v3.copy(p).sub(centre).applyQuaternion(inv), half)));
}
function obbTest(origin, q, centreLocal, q2, half, pts, spheres, cb) {
  const qq = q2 ? q.clone().multiply(q2) : q.clone(), centre = centreLocal.clone().applyQuaternion(q).add(origin), inv = qq.invert();
  pts.forEach((p, i) => cb(spheres[i].r - sdBox(_v3.copy(p).sub(centre).applyQuaternion(inv), half)));
}
// 箱 (中心 0、半分の大きさ half) までの符号つき距離 (中は負)
function sdBox(p, half) {
  const qx = Math.abs(p.x) - half.x, qy = Math.abs(p.y) - half.y, qz = Math.abs(p.z) - half.z;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
}

function debugSeat(stage, ctl, seat) {
  const w = seat.W;
  return { id: seat.id, state: w.state, over: w.over, mouth: mouthDist(seat), clear: clearance(seat, stage.seats.filter((s) => s !== seat && s.rig && s.pos.distanceTo(seat.pos) < 1.4)) };
}
