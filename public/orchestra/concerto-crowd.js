// 協奏曲の遠景用。骨・指・寸法は同じで、丸い面の分割だけを減らす。近景は元の形へ戻す。
// ═══════════ VESPER の軽い版 (オーケストラ 48 体用) ═══════════
// 見た目と寸法は ../piano/scene.js の buildRobot と同じ (SKELETON・ROBOT_SCALE・白い外装・黒い骨組み・水色の光の帯・バイザー)。
// 違うのは描き方だけ: 部品を「骨 × 材質」ごとに 1 つの形へまとめ、48 体ぶんを 1 つの InstancedMesh で描く。
// 毎コマ、骨 (rig.js の Object3D。描かない) の matrixWorld × 部品の置き方 = その体の部品の行列。
// 左右の腕は左用の形を 1 つだけ作り、右は骨の中で y 軸まわりに 180 度回して使う (腕の部品は前後対称に作ってある)。
// 脚は左右対称の形にしてあるので、左右とも同じ形をそのまま使う。
import * as THREE from "three";
import { M, ROBOT_SCALE } from "../piano/scene.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);

/* ─────────── 形をまとめる道具 (instruments.js も使う) ─────────── */
// geo を位置・回転・大きさで置き直し、色 (頂点色) を付けた新しい形を返す。元の形は捨てる
export function place(geo, { pos = null, rot = null, quat = null, scale = null, color = null, matrix = null } = {}) {
  const g = geo.index ? geo : indexed(geo);
  const m = matrix ? matrix.clone() : new THREE.Matrix4();
  if (!matrix) {
    const q = quat ?? (rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] ?? rot.x, rot[1] ?? rot.y, rot[2] ?? rot.z)) : new THREE.Quaternion());
    const s = scale ? (typeof scale === "number" ? V(scale, scale, scale) : (scale.isVector3 ? scale : V(...scale))) : V(1, 1, 1);
    m.compose(pos ? (pos.isVector3 ? pos : V(...pos)) : V(0, 0, 0), q, s);
  }
  g.applyMatrix4(m);
  if (m.determinant() < 0) flipWinding(g);
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "color" && k !== "uv") g.deleteAttribute(k);
  if (color != null) setColor(g, color);
  return g;
}
function indexed(geo) {
  const n = geo.attributes.position.count, idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}
function flipWinding(g) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
export function setColor(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}
// 置き直した形をつなげて 1 つの形に (頂点色はある物だけ。無い物は白)
export function merge(list, { colors = null } = {}) {
  const parts = list.filter(Boolean);
  const useColor = colors ?? parts.some((g) => g.attributes.color);
  const useUv = parts.length > 0 && parts.every((g) => g.attributes.uv);
  let nv = 0, ni = 0;
  for (const g of parts) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = useColor ? new Float32Array(nv * 3).fill(1) : null, uv = useUv ? new Float32Array(nv * 2) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let ov = 0, oi = 0;
  for (const g of parts) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), ov * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array.subarray(0, n * 3), ov * 3);
    if (col && g.attributes.color) col.set(g.attributes.color.array.subarray(0, n * 3), ov * 3);
    if (uv) uv.set(g.attributes.uv.array.subarray(0, n * 2), ov * 2);
    const src = g.index.array;
    for (let i = 0; i < src.length; i++) idx[oi + i] = src[i] + ov;
    ov += n; oi += src.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (uv) out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
export function triangles(geo) { return (geo.index ? geo.index.count : geo.attributes.position.count) / 3; }
// a から b へ伸びる円柱 / カプセル (y 軸の形を向けて置く)
export function rod(a, b, r0, r1 = r0, seg = 8, { capsule = false, color = null, open = false, capSeg = 1 } = {}) {
  const A = a.isVector3 ? a : V(...a), B = b.isVector3 ? b : V(...b);
  const d = B.clone().sub(A), len = Math.max(1e-6, d.length());
  const g = capsule ? new THREE.CapsuleGeometry(r0, Math.max(0.001, len - r0 * 2), capSeg, Math.min(seg, 6)) : new THREE.CylinderGeometry(r1, r0, len, Math.min(seg, 6), 1, open);
  return place(g, { pos: A.clone().add(B).multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()), color });
}
export const ball = (p, r, ws = 10, hs = 7, color = null, scale = null) => place(new THREE.SphereGeometry(r, Math.min(ws, 6), Math.min(hs, 4)), { pos: p, color, scale });
export const block = (p, s, rot = null, color = null) => place(new THREE.BoxGeometry(...s), { pos: p, rot, color });
export const ring = (p, R, r, rot = null, color = null, rs = 5, ts = 18, arc = Math.PI * 2) => place(new THREE.TorusGeometry(R, r, Math.min(rs, 3), Math.min(ts, 8), arc), { pos: p, rot, color });

/* ─────────── ロボットの材質 ─────────── */
// 外装 (白) と光る帯はピアノと同じ材質をそのまま使う。黒い骨組み (carbon)・濃い灰色 (gun)・関節の銀 (chrome) は
// 頂点の色だけ変えた 1 つの金属材質にまとめる (48 体ぶんの描画回数を減らすため)。
export const RM = {
  shell: M.shell,
  metal: new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.3, metalness: 0.86 }),
  glow: M.glow,
  glowO: M.glowO,
};
export const CARBON = 0x15171c, GUN = 0x3e434e, CHROME = 0xd9dde3;

// 骨の長さ (子の骨までのずれ、ロボット単位)
const CHILD = {
  LowerBack: [0, 2.0, 0], Spine: [0, 2.3, 0], Neck1: [0, 1.15, 0], Head: [0, 2.4, 0],
  Arm: [5.4, 0, 0], ForeArm: [4.9, 0, 0], Hand: [1.4, 0, 0], UpLeg: [0, -7.4, 0], Leg: [0, -7.0, 0], Foot: [0, -0.9, 2.0],
};
// 指 (親指 → 小指)。手の骨の中の付け根の位置と長さ。rig.js も同じ表を使う
export const FINGERS = [
  { root: [1.42, -0.2, 0.86], len: 1.7 },
  { root: [1.7, 0.02, 0.6], len: 2.0 },
  { root: [1.72, 0.02, 0.2], len: 2.15 },
  { root: [1.7, 0.02, -0.2], len: 2.05 },
  { root: [1.64, 0.0, -0.6], len: 1.75 },
];
export const FINGER_SPLIT = 0.55;           // 付け根の節の割合 (残りが先の節)
export const FINGER_R = [0.17, 0.15];       // 節の太さ (ロボット単位)
const PROX_LEN = 2.0 * FINGER_SPLIT, DIST_LEN = 2.0 * (1 - FINGER_SPLIT);

/* ─────────── 部品の表 ─────────── */
// bone: 付く骨の名前 (side="LR" は "Left"+bone / "Right"+bone)、mat: RM の名前、cast: 影を落とすか
function buildParts() {
  const parts = [];
  const add = (key, bone, side, mat, geos, cast = false) => parts.push({ key, bone, side, mat, geo: merge(geos.flat(), { colors: mat === "metal" }), cast });
  const C = (n) => V(...CHILD[n]);
  // ── 腰
  add("hips.metal", "Hips", null, "metal", [
    block([0, -0.7, 0], [2.6, 1.5, 1.6], null, CARBON),
    ball([1.52, -0.95, 0.18], 0.55, 8, 6, CHROME), ball([-1.52, -0.95, 0.18], 0.55, 8, 6, CHROME),
  ], true);
  add("hips.shell", "Hips", null, "shell", [block([0, -0.5, 0.85], [2.0, 1.0, 0.35]), block([0, -0.5, -0.85], [2.2, 1.1, 0.35])]);
  add("hips.glow", "Hips", null, "glow", [ring([0, 0.05, 0], 1.32, 0.08, [Math.PI / 2, 0, 0], null, 3, 20)]);
  add("lowback.metal", "LowerBack", null, "metal", [rod(V(0, 0, 0), C("LowerBack"), 1.05, 0.95, 10, { color: CARBON })]);
  add("spine.metal", "Spine", null, "metal", [rod(V(0, 0, 0), C("Spine"), 1.15, 1.0, 10, { color: CARBON })]);
  add("spine.glow", "Spine", null, "glow", [ring([0, 1.0, 0], 1.08, 0.05, [Math.PI / 2, 0, 0], null, 3, 18)]);
  // ── 胸
  add("chest.metal", "Spine1", null, "metal", [
    block([0, 0.2, 0], [4.4, 3.2, 2.3], null, CARBON),
    block([0, -1.35, 0.6], [3.2, 0.6, 1.4], null, GUN),
    ring([0, 0.25, 1.48], 0.55, 0.09, null, CHROME, 4, 16),
    ring([0, 1.75, 0], 0.85, 0.16, [Math.PI / 2, 0, 0], GUN, 4, 14),
    ...[-1.1, 1.1].map((x) => place(new THREE.CylinderGeometry(0.45, 0.55, 2.2, 6), { pos: [x, 0.2, -1.7], rot: [0.15, 0, 0], color: GUN })),
  ], true);
  add("chest.shell", "Spine1", null, "shell", [
    block([1.15, 0.35, 1.2], [2.1, 2.6, 0.55], [0.08, -0.22, 0]), block([-1.15, 0.35, 1.2], [2.1, 2.6, 0.55], [0.08, 0.22, 0]),
    block([0, 1.55, 0.9], [3.6, 0.7, 1.2]), block([0, 0.3, -1.3], [4.0, 3.0, 0.5]),
  ], true);
  add("chest.glow", "Spine1", null, "glow", [place(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 12), { pos: [0, 0.25, 1.5], rot: [Math.PI / 2, 0, 0] })]);
  add("chest.glowO", "Spine1", null, "glowO", [-1.1, 1.1].map((x) => place(new THREE.CylinderGeometry(0.33, 0.33, 0.15, 10), { pos: [x, -0.9, -1.85], rot: [0.15, 0, 0] })));
  // ── 首と頭
  add("neck.metal", "Neck1", null, "metal", [rod(V(0, -0.6, 0), C("Neck1"), 0.5, 0.42, 10, { color: CARBON })]);
  add("neck.glow", "Neck1", null, "glow", [ring([0, 0.45, 0], 0.5, 0.06, [Math.PI / 2, 0, 0], null, 3, 14)]);
  const hl = 2.4;
  add("head.shell", "Head", null, "shell", [place(new THREE.SphereGeometry(1.2, 8, 6), { pos: [0, hl * 0.55, 0.05], scale: [0.95, 1.08, 1.0] })], true);
  add("head.metal", "Head", null, "metal", [
    place(new THREE.SphereGeometry(1.15, 8, 4, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.28, Math.PI * 0.5), { pos: [0, hl * 0.55, 0.08], scale: [0.97, 1.1, 1.02], color: CARBON }),
    block([0, hl * 0.15, 0.55], [0.9, 0.5, 0.7], null, GUN),
    // 口 (吹く楽器を当てる所)。顔の下の黒い細い溝
    block([0, 0.86, 1.13], [0.5, 0.09, 0.12], [-0.25, 0, 0], 0x07080a),
    ...[-1, 1].map((s) => place(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 6), { pos: [s * 1.15, hl * 0.6, 0], rot: [0, 0, Math.PI / 2], color: CHROME })),
  ]);
  add("head.glow", "Head", null, "glow", [
    block([0, hl * 0.62, 1.08], [1.5, 0.24, 0.3]),
    ...[-1, 1].map((s) => ring([s * 1.28, hl * 0.6, 0], 0.28, 0.05, [0, Math.PI / 2, 0], null, 3, 12)),
  ]);
  // ── 肩 (左用。右は y 軸 180 度で使う)
  const p = V(2.2, 0, 0);
  add("shoulder.shell", "Shoulder", "LR", "shell", [place(new THREE.SphereGeometry(1.0, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5), { pos: p.clone().add(V(0.15, 0.05, 0)), rot: [0, 0, -0.55] })], true);
  add("shoulder.metal", "Shoulder", "LR", "metal", [ball(p, 0.78, 9, 6, CHROME), rod(V(0.8, 1.5, 0), p.clone().add(V(0, 0.3, 0)), 0.3, 0.24, 8, { color: GUN })]);
  add("shoulder.glow", "Shoulder", "LR", "glow", [ring(p.clone().add(V(0.15, 0.2, 0)), 1.0, 0.05, [0, 0, -0.55], null, 3, 12, Math.PI)]);
  // ── 腕
  const strip = (len, r, w = 0.16, t = 0.05) => block([0, -r, 0], [len * 0.62, t, w]);   // 腕の下側の光の帯 (骨の -y)
  add("arm.shell", "Arm", "LR", "shell", [rod(V(0, 0, 0), C("Arm"), 0.62, 0.62, 10, { capsule: true })], false);
  add("arm.glow", "Arm", "LR", "glow", [place(strip(5.4, 0.6), { pos: [2.7, 0, 0] })]);
  add("fore.shell", "ForeArm", "LR", "shell", [rod(V(0, 0, 0), C("ForeArm"), 0.5, 0.5, 10, { capsule: true })], false);
  add("fore.metal", "ForeArm", "LR", "metal", [ball([0, 0, 0], 0.56, 8, 6, CHROME), block([4.9 * 0.55, 0.55, 0], [4.9 * 0.6, 0.35, 0.9], null, GUN)]);
  add("fore.glow", "ForeArm", "LR", "glow", [place(strip(4.9, 0.5), { pos: [2.45, 0, 0] })]);
  // 手: 手の甲 (白) と手のひら (黒)。手の骨の +x が指先、+y が手の甲、+z が親指の側 (左右とも)
  add("hand.shell", "Hand", "LR", "shell", [block([0.88, 0.25, 0], [1.3, 0.16, 1.55])]);
  add("hand.metal", "Hand", "LR", "metal", [ball([0, 0, 0], 0.42, 8, 6, CHROME), block([0.85, -0.02, 0], [1.55, 0.42, 1.75], null, CARBON), ball([1.1, -0.15, 0.62], 0.34, 6, 4, GUN)]);
  // ── 脚 (左右対称の形。光の帯は内と外の両側)
  const legStrip = (len, r, y0) => [-1, 1].map((s) => block([s * r, y0, 0], [0.05, len * 0.62, 0.16]));
  add("thigh.shell", "UpLeg", "LRsym", "shell", [rod(V(0, 0, 0), C("UpLeg"), 0.82, 0.82, 10, { capsule: true })], true);
  add("thigh.metal", "UpLeg", "LRsym", "metal", [place(new THREE.BoxGeometry(1.1, 7.4 * 0.5, 0.3), { pos: [0, -7.4 * 0.45, 0.75], rot: [0.25, 0, 0], color: GUN })]);
  add("thigh.glow", "UpLeg", "LRsym", "glow", [legStrip(7.4, 0.8, -3.7)]);
  add("shin.shell", "Leg", "LRsym", "shell", [rod(V(0, 0, 0), C("Leg"), 0.6, 0.6, 10, { capsule: true })], false);
  add("shin.metal", "Leg", "LRsym", "metal", [ball([0, 0, 0], 0.68, 8, 6, CHROME), block([0, -3.5, 0.65], [0.9, 7.0 * 0.7, 0.35], null, GUN)]);
  add("shin.glow", "Leg", "LRsym", "glow", [legStrip(7.0, 0.6, -3.5)]);
  add("foot.shell", "Foot", "LRsym", "shell", [block([0, -0.25, 1.0], [1.05, 0.55, 3.2]), block([0, -0.3, 2.55], [1.0, 0.4, 0.95])]);
  add("foot.metal", "Foot", "LRsym", "metal", [ball([0, 0, 0], 0.5, 7, 5, CHROME), block([0, -0.5, 1.15], [1.15, 0.15, 3.7], null, CARBON)]);
  // ── 指 (付け根の節 = 白、先の節 = 黒)。長さ 2.0 の指の形を作り、指ごとに x 方向へ伸び縮みさせる
  // 指は 5 角の柱 (1 本 20 三角形)。48 体 × 20 節あるので、ここが一番効く
  add("finger.prox", "FingerRoot", "finger", "shell", [rod(V(-FINGER_R[0] * 0.4, 0, 0), V(PROX_LEN, 0, 0), FINGER_R[0], FINGER_R[0] * 0.92, 5)]);
  add("finger.dist", "FingerJoint", "finger", "metal", [rod(V(-FINGER_R[1] * 0.3, 0, 0), V(DIST_LEN, 0, 0), FINGER_R[1], FINGER_R[1] * 0.8, 5, { color: GUN })]);
  return parts;
}

// 足の裏の高さ (足の骨から、ロボット単位)。rig.js が床に足を置くのに使う
export const SOLE_Y = -0.575;
// 座ったときの腰の骨の高さ (座面の上、ロボット単位): 腰の黒い箱の底と股関節の銀の玉が座面に乗る
export const SEAT_HIPS_Y = 1.68;

/* ─────────── 48 体をまとめて描く ─────────── */
const SIDE_NAMES = ["Left", "Right"];
// 骨の行列 e の x 列を c[0] 倍、z 列を c[1] 倍して arr[o..] に書く (= 骨の行列 × 対角の行列)
function write(arr, o, e, c) {
  const sx = c[0], sz = c[1];
  arr[o] = e[0] * sx; arr[o + 1] = e[1] * sx; arr[o + 2] = e[2] * sx; arr[o + 3] = e[3];
  arr[o + 4] = e[4]; arr[o + 5] = e[5]; arr[o + 6] = e[6]; arr[o + 7] = e[7];
  arr[o + 8] = e[8] * sz; arr[o + 9] = e[9] * sz; arr[o + 10] = e[10] * sz; arr[o + 11] = e[11];
  arr[o + 12] = e[12]; arr[o + 13] = e[13]; arr[o + 14] = e[14]; arr[o + 15] = e[15];
}
export class RobotCrowd {
  // rigs: rig.js の createRig の戻り値の配列
  constructor(scene, rigs, { shadows = true } = {}) {
    this.rigs = rigs;
    this.parts = buildParts();
    this.meshes = [];
    for (const part of this.parts) {
      const per = part.side === "finger" ? 10 : part.side ? 2 : 1;
      const mesh = new THREE.InstancedMesh(part.geo, RM[part.mat], rigs.length * per);
      mesh.name = "robot." + part.key;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;           // 48 体が舞台じゅうに散っている。古い境界球で消えないように
      mesh.castShadow = shadows && part.cast; mesh.receiveShadow = true;
      part.mesh = mesh; part.per = per;
      // 部品ごとの置き方 (骨の中)。どれも骨の行列の列に掛けるだけで済む: 右の腕と指は y 軸 180 度 (x 列と z 列の符号を反転)、
      // 指は長さに合わせて x 列を伸ばす。cols = [x 列の倍率, z 列の倍率] を、1 体の中の部品の順に並べる
      part.cols = [];
      if (part.side === "finger") {
        for (const side of ["Left", "Right"]) for (let i = 0; i < 5; i++) {
          const len = FINGERS[i].len, k = part.bone === "FingerRoot" ? len * FINGER_SPLIT / PROX_LEN : len * (1 - FINGER_SPLIT) / DIST_LEN;
          part.cols.push(side === "Right" ? [-k, -1] : [k, 1]);
        }
      } else if (part.side === "LR") part.cols.push([1, 1], [-1, -1]);
      else part.cols.push([1, 1], [1, 1]);
      scene.add(mesh); this.meshes.push(mesh);
    }
    this.update();
  }
  // 骨の matrixWorld は呼ぶ前に更新しておく (stage.js が毎コマ rig.root.updateMatrixWorld する)
  update() {
    for (const part of this.parts) {
      const arr = part.mesh.instanceMatrix.array, cols = part.cols;
      let o = 0;
      for (const rig of this.rigs) {
        if (part.side === "finger") {
          let j = 0;
          for (const side of SIDE_NAMES) for (const f of rig.fingers[side]) { write(arr, o, (part.bone === "FingerRoot" ? f.root : f.joint).matrixWorld.elements, cols[j++]); o += 16; }
        } else if (part.side) {
          write(arr, o, rig.bones["Left" + part.bone].matrixWorld.elements, cols[0]); o += 16;
          write(arr, o, rig.bones["Right" + part.bone].matrixWorld.elements, cols[1]); o += 16;
        } else { arr.set(rig.bones[part.bone].matrixWorld.elements, o); o += 16; }
      }
      part.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  // 1 体ぶんの三角形の数 (確認用)
  trianglesPerRobot() { return this.parts.reduce((a, p) => a + triangles(p.geo) * p.per, 0); }
}
export { ROBOT_SCALE };
