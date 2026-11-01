// ═══════════ 奏者の動きの枠組み (players/*.js が使う共通の部品) ═══════════
//
// ── 家族ごとの部品 (strings.js / winds.js / timpani.js / conductor.js) が書く物 ──
//   export function createPlayers(stage, playerSpec, seats) → { plan(notesInSec), pose(sec, dt) }
//   stage.js は曲を受け取るたびに (setSong)、奏者 1 人 (= 1 パート、例: "vn1" 10 人) ごとに createPlayers を呼び、
//   すぐ plan(notes) を 1 回呼ぶ。そのあと毎コマ pose(sec, dt) を呼ぶ。pose のあと stage.js が行列を全部更新して描く。
//   指揮者は playerSpec = { id: "conductor", family: "conductor", notes: [] }、seats = [指揮者の席 1 つ]。
//
// ── 受け取る物 ──
//   playerSpec : 曲の players[] の 1 つ ({id, name, family, instrument, seats, banks, notes, ...})。
//   seats      : その奏者の席の配列 (layout.js の席に、stage.js が下を足した物)。弦は譜面台の 2 人ずつ (desk, part = "outside"|"inside")。
//     seat.rig        : 骨組み (rig.js)。rig.bones.Hips … RightToeBase (Object3D)、rig.fingers.Left[0..4] = {root, joint, tip}、
//                       rig.points.mouth / chin / jawLeft / eye / collarLeft / sternum / gripLeft / gripRight / palmLeft / palmRight (Object3D)。
//                       指先 rig.fingers[side][i].tip = 先の節の端 (指の軸の上)。腹 (ふれる面) はそこから手のひら側へ半径 radiusM。
//                       骨はローカルの回転 (quaternion / rotation) を書く。rig.root (= 体全体) の位置と向きは stage.js が席に置いてある。
//     seat.instrument : 楽器の持ち手 (instruments.js)。handle.root (Object3D、world・m) の position / quaternion を毎コマ決める。
//                       handle.spec (寸法と点)、handle.point(name)、handle.stringPoint(i, t)、handle.nodes.valves / levers (動く部品)。
//     seat.bow        : 弦だけ。弓の持ち手。handle.hairPoint(u) = 毛の上の点 (u 0 = 毛箱、1 = 先)。
//     seat.mallets    : ティンパニだけ。[左手, 右手] のマレットの持ち手。seat.drums = [{pitch, R, pos, H}] (大きい G2 が奏者の左)。
//     seat.baton      : 指揮者だけ。指揮棒の持ち手。
//     seat.instrumentKind : "violin" | "viola" | "cello" | "bass" | "flute" | "oboe" | "clarinet" | "bassoon" | "horn" | "trumpet" | "timpani" | "baton"
//                       (楽器の種類。曲の instrument が "contrabass" でも席は "bass"。家族の部品はこちらを見る)
//     seat.pos / yaw / forward / floorY / seatTop / kind ("chair"|"stool"|"standing"|"podium") / stand ({pos, yaw, sheetY})
//     seat.hash(k)    : この席の決まった乱数 0..1 (k ごとに違う値。毎回同じ)。人ごとの小さなずれに使う
//   stage      : stage.song (曲全体)、stage.toSec(beat)、stage.toBeat(sec)、stage.bars (曲の bars の写しに t0 = 始まりの秒・t1 = 終わりの秒を足した物)、
//                stage.fermatas (同じく t0/t1 つき。曲の sec = 伸ばした長さ はそのまま)、stage.focus (t0/t1 つき)、stage.endSec、
//                stage.players (全員の {id, spec, notes, seats})、stage.layout、stage.conductor (指揮者の席)、
//                stage.addCheck(check) (下)、stage.drums (ティンパニの太鼓)、stage.helpers (= この部品の書き出し全部)
//   notesInSec : その奏者の音符 ({p, s, d, v, art, slur, acc, bow, ...} に t0 = 始まりの秒、t1 = 終わりの秒、i = 番号 を足した物。t0 の順)
//
// ── pose(sec, dt) で決める物 ──
//   各席の rig の骨の回転 (腕は solveArm / reachWith、脚は solveLeg / sit / stand、背中は setSpine、頭は lookAt、指は setFingers)、
//   楽器・弓・マレット・指揮棒の handle.root の位置と向き (world)。動く部品 (トランペットのピストン、ホルンのレバー) の position。
//   決めなかった物は前のコマのまま残る。時間の決め方は ORCHESTRA.md §6 (楽譜の秒から計算する。乱数で動かさない)。
//   seek (時間が飛ぶ) と poseAt (撮影) でも同じ姿勢になるように、なるべく sec だけで決める。なめらかにするための状態を持つなら、
//   dt が大きい (> 0.25 s) か時間が戻ったときはその場で目標の姿勢に合わせる。
//
// ── 確かめ (rehearse) の登録 ──
//   stage.addCheck({ id, player, times, measure, frames })
//     id      : "vn1.bow-contact" のような名前 (結果はこの名前ごとに数える)
//     player  : 奏者の id
//     times   : 測る時刻 (秒) の配列。rehearse はその時刻ちょうどに姿勢を作ってから measure(sec, k) を呼ぶ
//     frames  : true なら 60 fps の毎コマにも measure(sec, -1) を呼ぶ (鳴っている間ずっと測るとき。関係ないコマは null を返す)
//     measure : (sec, k) → null (測らない) | { ok: bool, value: number, info?: any }
//   rehearse は ok:false を misses に、数を counts[id] に入れて返す。下の dist* の道具で本物の形の距離を測る。
import * as THREE from "three";
import * as rig from "../rig.js";

export { rig };
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (6 * t - 15) + 10); };

// 決まった乱数 0..1 (同じ引数なら必ず同じ値)
export function hash01(a = 0, b = 0, c = 0) {
  let h = 2166136261 ^ (a * 374761393) ^ (b * 668265263) ^ (c * 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h = Math.imul(h ^ (h >>> 16), 2246822519); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
// 音符に秒を足す (stage.js が使う。家族の部品も、別の曲の部分を秒にするときに使ってよい)
export function notesInSec(notes, toSec) {
  return (notes ?? []).map((n, i) => ({ ...n, i, t0: toSec(n.s), t1: toSec(n.s + n.d) })).sort((a, b) => a.t0 - b.t0 || a.p - b.p);
}
// 時刻の並んだ配列の中の「今」を速く探す (毎コマ頭から数えない)。list は key (既定 t0) の順
export class Cursor {
  constructor(list, key = "t0") { this.list = list; this.key = key; this.i = 0; }
  // sec 以下で一番遅い要素の番号 (無ければ -1)
  at(sec) {
    const L = this.list, k = this.key;
    if (!L.length) return -1;
    let i = clamp(this.i, 0, L.length - 1);
    if (Math.abs(L[i][k] - sec) > 8) { let lo = -1, hi = L.length; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m][k] <= sec) lo = m; else hi = m; } this.i = Math.max(0, lo); return lo; }
    while (i + 1 < L.length && L[i + 1][k] <= sec) i++;
    while (i >= 0 && L[i][k] > sec) i--;
    this.i = Math.max(0, i);
    return i;
  }
  prev(sec) { const i = this.at(sec); return i >= 0 ? this.list[i] : null; }
  next(sec) { const i = this.at(sec); return this.list[i + 1] ?? null; }
}
// 休みが gap 秒未満の音符をつないだ「ひと息」(フレーズ) の配列 [{t0, t1, notes}]
export function phrases(notes, gap = 1.5) {
  const out = [];
  for (const n of notes) {
    const last = out[out.length - 1];
    if (last && n.t0 - last.t1 < gap) { last.t1 = Math.max(last.t1, n.t1); last.notes.push(n); }
    else out.push({ t0: n.t0, t1: n.t1, notes: [n] });
  }
  return out;
}
// 鳴っている音符 (t0 <= sec < t1) を返す。cursor は Cursor
export function soundingAt(cursor, sec, back = 6) {
  const i = cursor.at(sec), out = [];
  for (let k = i; k >= 0; k--) { const n = cursor.list[k]; if (n.t0 < sec - back) break; if (n.t1 > sec) out.push(n); }
  return out;
}

/* ─────────── 距離の道具 (確かめに使う) ─────────── */
const _a = V(), _b = V(), _c = V(), _d = V();
// 点 p と線分 ab の距離
export function distPointSegment(p, a, b) {
  _a.subVectors(b, a); const t = clamp(_b.subVectors(p, a).dot(_a) / Math.max(1e-12, _a.lengthSq()), 0, 1);
  return _c.copy(a).addScaledVector(_a, t).distanceTo(p);
}
// 線分 p1q1 と p2q2 の一番近い距離と、その点の割合 {d, s, t}
export function distSegments(p1, q1, p2, q2) {
  const d1 = _a.subVectors(q1, p1), d2 = _b.subVectors(q2, p2), r = _c.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) return { d: p1.distanceTo(p2), s: 0, t: 0 };
  if (a <= 1e-12) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-12) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const P = _d.copy(p1).addScaledVector(d1, s), Q = V().copy(p2).addScaledVector(d2, t);
  return { d: P.distanceTo(Q), s, t };
}
// 弓の毛 (線分) と弦 i (駒 → 上駒の線分) の距離 (m)。毛の帯の厚さと弦の太さを引いた「すき間」
export function bowHairToString(seat, i) {
  const b = seat.bow, inst = seat.instrument;
  const h0 = b.hairPoint(0, V()), h1 = b.hairPoint(1, V()), s0 = inst.stringPoint(i, 0, V()), s1 = inst.stringPoint(i, 1, V());
  const r = distSegments(h0, h1, s0, s1);
  return { gap: r.d - inst.spec.strings[i].radius - 0.0004, u: r.s, t: r.t };
}
// 楽器の口の点と、ロボットの口の距離 (m)
export function mouthDistance(seat) { return seat.instrument.point("mouth", V()).distanceTo(rig.wpos(seat.rig.points.mouth, V())); }
// 手の中の点 (rig.points.gripLeft など) と world の点の距離
export function gripDistance(seat, side, target) { return rig.wpos(seat.rig.points["grip" + side], V()).distanceTo(target); }

// 1 人ぶんの「姿勢を決める」入口を、席の配列ごとにまとめる小さな道具 (家族の部品が使わなくてもよい)
export function eachSeat(seats, fn) { for (const s of seats) fn(s); }
