// ═══════════ VESPER-01 がグランドピアノを弾く 3D 舞台 (three.js) ═══════════
// 3 つの画面: 上 = VESPER の目線 (自分の手と鍵盤、開いた屋根の中の弦を見下ろす)、
//             下 = 鍵盤と両手のアップ、上の左下 = ペダルと右足の小窓。
// 音符 (p, s, d, v, h, f) とペダル区間から、手の位置・指の押し込み・鍵の沈み・ハンマー・ダンパー・体の揺れ・足のペダルを毎フレーム計算する。
// ロボットの見た目は product/toys/3D_model の VESPER-01 (buildRobot) と同じ部品構成。
// ピアノは「Salamander Grand Piano」(Alexander Holm 氏がヤマハ C5 を録音した無料音源) に敬意を込めて、
// 特定メーカーの意匠を写さない一般的なコンサートグランドとして、弦の一本一本まで組み立てる。

import * as THREE from "three";
import {addKeyIndicator, updateKeyIndicator} from "../js/key-visual.js";
import { buildMotion, motionAt, MOTION_LIMITS } from "./motion.js";
import { refineHands, refinePianoArms, batchHardware } from "../js/robot-hardware.js";

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
// 3x3 の連立方程式 A x = b (クラメルの公式)。解けなければ null
export function solve3(A, b) {
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A); if (Math.abs(D) < 1e-12) return null;
  const col = (k) => A.map((row, r) => row.map((v, c) => (c === k ? b[r] : v)));
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
}

/* ─────────── 鍵盤の寸法 (m) ─────────── */
const WHITE_W = 0.0235, WHITE_L = 0.150, BLACK_W = 0.0135, BLACK_L = 0.095, KEY_H = 0.013;
const LOW = 21, HIGH = 108;
export const isBlack = (p) => [1, 3, 6, 8, 10].includes(p % 12);
const whiteIndex = (p) => { let k = 0; for (let q = LOW; q < p; q++) if (!isBlack(q)) k++; return k; };
const N_WHITE = whiteIndex(HIGH) + 1;                 // 52
const KEYS_X0 = -(N_WHITE * WHITE_W) / 2;             // -0.611
export function keyX(p) {
  if (!isBlack(p)) return KEYS_X0 + (whiteIndex(p) + 0.5) * WHITE_W;
  const boundary = KEYS_X0 + (whiteIndex(p - 1) + 1) * WHITE_W;
  const shift = { 1: -0.12, 3: 0.12, 6: -0.18, 8: 0, 10: 0.18 }[p % 12] * WHITE_W;
  return boundary + shift;
}
const KEY_TOP_Y = 0.735;   // 白鍵の上面
const KEY_DIP = 0.010;     // 鍵の沈み (手前で約 1cm)

/* ─────────── 材質 ─────────── */
export const M = {
  shell: new THREE.MeshPhysicalMaterial({ color: 0xdfe4ec, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 }),
  carbon: new THREE.MeshPhysicalMaterial({ color: 0x111318, roughness: 0.45, metalness: 0.65 }),
  chrome: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.07, metalness: 1.0 }),
  gun: new THREE.MeshPhysicalMaterial({ color: 0x3a3f4a, roughness: 0.28, metalness: 0.9 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x061a22, emissive: 0x35e6ff, emissiveIntensity: 3.5, roughness: 0.4 }),
  glowO: new THREE.MeshStandardMaterial({ color: 0x221006, emissive: 0xff7a1a, emissiveIntensity: 3.0, roughness: 0.4 }),
  visor: new THREE.MeshPhysicalMaterial({ color: 0x030507, roughness: 0.05, metalness: 0.2, clearcoat: 1, emissive: 0x1de0ff, emissiveIntensity: 2.0 }),
};
export const P = {
  lacquer: new THREE.MeshPhysicalMaterial({ color: 0x08080a, roughness: 0.10, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04, reflectivity: 0.9 }),
  lacquerMatte: new THREE.MeshPhysicalMaterial({ color: 0x101012, roughness: 0.35, metalness: 0.05, clearcoat: 0.5 }),
  ivory: new THREE.MeshPhysicalMaterial({ color: 0xece6d8, roughness: 0.24, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.18 }),
  ebony: new THREE.MeshPhysicalMaterial({ color: 0x1a1714, roughness: 0.32, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
  plate: new THREE.MeshPhysicalMaterial({ color: 0xb8933e, roughness: 0.45, metalness: 0.85 }),          // 鋳鉄フレーム (金色の塗装)
  plateDark: new THREE.MeshPhysicalMaterial({ color: 0x7e6428, roughness: 0.6, metalness: 0.7 }),
  steel: new THREE.MeshPhysicalMaterial({ color: 0xd8dadc, roughness: 0.3, metalness: 1.0 }),           // 鋼の弦
  copper: new THREE.MeshPhysicalMaterial({ color: 0xb3672f, roughness: 0.42, metalness: 0.95 }),         // 巻線 (低音)
  spruce: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62 }),                          // 響板 (スプルース。木目は後で貼る)
  maple: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }),                           // 駒・ピン板
  feltRed: new THREE.MeshStandardMaterial({ color: 0x8a1f2a, roughness: 0.95 }),
  feltWhite: new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.95 }),
  hammerWood: new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.7 }),
  brass: new THREE.MeshPhysicalMaterial({ color: 0xc9a656, roughness: 0.28, metalness: 1 }),
  silver: new THREE.MeshPhysicalMaterial({ color: 0xcfcfd2, roughness: 0.25, metalness: 1 }),
  floor: new THREE.MeshPhysicalMaterial({ color: 0x141312, roughness: 0.3, metalness: 0.05, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
  bench: new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, roughness: 0.18, clearcoat: 1 }),
  cushion: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.9 }),
};

export function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }
export function limb(parent, a, b, rTop, rBot, mat, seg = 20, capsule = false) {
  const dir = b.clone().sub(a); const len = dir.length();
  const g = capsule ? new THREE.CapsuleGeometry(rTop, Math.max(0.01, len - rTop * 2), 6, seg) : new THREE.CylinderGeometry(rTop, rBot, len, seg, 1);
  const mesh = shadowed(new THREE.Mesh(g, mat));
  const holder = new THREE.Object3D();
  holder.position.copy(a).add(b).multiplyScalar(0.5);
  holder.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  holder.add(mesh); parent.add(holder); return holder;
}
export function sphere(parent, p, r, mat, seg = 24) { const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat)); m.position.copy(p); parent.add(m); return m; }
export function box(parent, p, s, mat, rot) { const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), mat)); m.position.copy(p); if (rot) m.rotation.set(rot.x, rot.y, rot.z); parent.add(m); return m; }
function strip(holder, len, r, mat, angle = 0, w = 0.16, thick = 0.05) {
  const g = new THREE.BoxGeometry(w, len * 0.62, thick); const m = new THREE.Mesh(g, mat);
  m.position.set(Math.sin(angle) * r, 0, Math.cos(angle) * r); m.rotation.y = angle; holder.add(m); return m;
}

/* ─────────── 骨組み (BVH と同じ名前・ロボット単位。全体を ROBOT_SCALE で m に) ─────────── */
export const ROBOT_SCALE = 0.061;
export const SKELETON = {
  Hips: [0, 0, 0],
  LowerBack: [0, 0.4, 0], Spine: [0, 2.0, 0], Spine1: [0, 2.3, 0], Neck1: [0, 1.85, 0], Head: [0, 1.15, 0], HeadEnd: [0, 2.4, 0],
  LeftShoulder: [1.0, 2.2, 0], LeftArm: [2.2, 0, 0], LeftForeArm: [5.4, 0, 0], LeftHand: [4.9, 0, 0], LeftHandEnd: [1.4, 0, 0],
  RightShoulder: [-1.0, 2.2, 0], RightArm: [-2.2, 0, 0], RightForeArm: [-5.4, 0, 0], RightHand: [-4.9, 0, 0], RightHandEnd: [-1.4, 0, 0],
  LeftUpLeg: [1.7, -0.9, 0], LeftLeg: [0, -7.4, 0], LeftFoot: [0, -7.0, 0], LeftToeBase: [0, -0.9, 2.0], LeftToeEnd: [0, 0, 1.2],
  RightUpLeg: [-1.7, -0.9, 0], RightLeg: [0, -7.4, 0], RightFoot: [0, -7.0, 0], RightToeBase: [0, -0.9, 2.0], RightToeEnd: [0, 0, 1.2],
};
const PARENT = {
  LowerBack: "Hips", Spine: "LowerBack", Spine1: "Spine", Neck1: "Spine1", Head: "Neck1", HeadEnd: "Head",
  LeftShoulder: "Spine1", LeftArm: "LeftShoulder", LeftForeArm: "LeftArm", LeftHand: "LeftForeArm", LeftHandEnd: "LeftHand",
  RightShoulder: "Spine1", RightArm: "RightShoulder", RightForeArm: "RightArm", RightHand: "RightForeArm", RightHandEnd: "RightHand",
  LeftUpLeg: "Hips", LeftLeg: "LeftUpLeg", LeftFoot: "LeftLeg", LeftToeBase: "LeftFoot", LeftToeEnd: "LeftToeBase",
  RightUpLeg: "Hips", RightLeg: "RightUpLeg", RightFoot: "RightLeg", RightToeBase: "RightFoot", RightToeEnd: "RightToeBase",
};
export function buildSkeleton() {
  const bones = {};
  for (const [name, pos] of Object.entries(SKELETON)) { const b = new THREE.Bone(); b.name = name; b.position.set(...pos); b.isBone = true; bones[name] = b; }
  for (const [name, parent] of Object.entries(PARENT)) bones[parent].add(bones[name]);
  return bones;
}

// 3D_model/balance_mimic_v1.html の buildRobot と同じ部品 (手はピアノ用に指付き、首は胴とつながるように調整)
export function buildRobot(B, hands) {
  const child = (b) => b.children.find((c) => c.isBone);
  const off = (name) => child(B[name]) ? child(B[name]).position.clone() : V(0, 0, 0);
  const L = (name) => off(name).length();
  const hips = B.Hips;
  box(hips, V(0, -0.7, 0), V(2.6, 1.5, 1.6), M.carbon);
  box(hips, V(0, -0.5, 0.85), V(2.0, 1.0, 0.35), M.shell);
  box(hips, V(0, -0.5, -0.85), V(2.2, 1.1, 0.35), M.shell);
  sphere(hips, V(1.25, -1.6, 0.7), 0.62, M.chrome); sphere(hips, V(-1.2, -1.6, 0.7), 0.62, M.chrome);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.08, 8, 48), M.glow); belt.rotation.x = Math.PI / 2; belt.position.y = 0.05; hips.add(belt);
  limb(B.LowerBack, V(0, 0, 0), off("LowerBack"), 0.95, 1.05, M.carbon, 24);
  limb(B.Spine, V(0, 0, 0), off("Spine"), 1.0, 1.15, M.carbon, 24);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.05, 8, 48), M.glow); seam.rotation.x = Math.PI / 2; seam.position.y = 1.0; B.Spine.add(seam);
  const chest = B.Spine1;
  box(chest, V(0, 0.2, 0), V(4.4, 3.2, 2.3), M.carbon);
  box(chest, V(1.15, 0.35, 1.2), V(2.1, 2.6, 0.55), M.shell, V(0.08, -0.22, 0));
  box(chest, V(-1.15, 0.35, 1.2), V(2.1, 2.6, 0.55), M.shell, V(0.08, 0.22, 0));
  box(chest, V(0, 1.55, 0.9), V(3.6, 0.7, 1.2), M.shell);
  box(chest, V(0, 0.3, -1.3), V(4.0, 3.0, 0.5), M.shell);
  box(chest, V(0, -1.35, 0.6), V(3.2, 0.6, 1.4), M.gun);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 24), M.glow); core.rotation.x = Math.PI / 2; core.position.set(0, 0.25, 1.5); chest.add(core);
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.09, 8, 32), M.chrome); coreRing.position.set(0, 0.25, 1.48); chest.add(coreRing);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.16, 10, 36), M.gun); collar.rotation.x = Math.PI / 2; collar.position.set(0, 1.75, 0); chest.add(collar);
  [-1.1, 1.1].forEach((x) => {
    const th = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 2.2, 20), M.gun); th.position.set(x, 0.2, -1.7); th.rotation.x = 0.15; chest.add(th); shadowed(th);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.15, 20), M.glowO); nozzle.position.set(x, -0.9, -1.85); nozzle.rotation.x = 0.15; chest.add(nozzle);
  });
  ["LeftArm", "RightArm"].forEach((n, i) => {
    const sgn = i === 0 ? 1 : -1;
    const p = B[n].position.clone();
    const holder = B[i === 0 ? "LeftShoulder" : "RightShoulder"];
    const pad = new THREE.Mesh(new THREE.SphereGeometry(1.0, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), M.shell);
    pad.position.copy(p).add(V(sgn * 0.15, 0.05, 0)); pad.rotation.z = -sgn * 0.55; shadowed(pad); holder.add(pad);
    const padGlow = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 6, 40, Math.PI), M.glow); padGlow.position.copy(p).add(V(sgn * 0.15, 0.2, 0)); padGlow.rotation.z = -sgn * 0.55; holder.add(padGlow);
    sphere(holder, p, 0.78, M.chrome);
    limb(holder, V(sgn * 0.8, 1.5, 0), p.clone().add(V(0, 0.3, 0)), 0.24, 0.3, M.gun, 12);
  });
  ["Left", "Right"].forEach((s, i) => {
    const sgn = i === 0 ? 1 : -1;
    const A = B[s + "Arm"], F = B[s + "ForeArm"], H = B[s + "Hand"];
    const ua = limb(A, V(0, 0, 0), off(s + "Arm"), 0.62, 0.5, M.shell, 24, true);
    limb(A, V(0, 0, 0), off(s + "Arm"), 0.36, 0.36, M.carbon, 16);
    strip(ua, L(s + "Arm"), 0.6, M.glow, Math.PI * 0.5 * sgn);
    sphere(F, V(0, 0, 0), 0.56, M.chrome);
    const fa = limb(F, V(0, 0, 0), off(s + "ForeArm"), 0.5, 0.62, M.shell, 24, true);
    strip(fa, L(s + "ForeArm"), 0.58, M.glow, Math.PI * 0.5 * sgn);
    box(F, off(s + "ForeArm").multiplyScalar(0.55).add(V(0, 0.55, 0)), V(L(s + "ForeArm") * 0.6, 0.35, 0.9), M.gun);
    sphere(H, V(0, 0, 0), 0.42, M.chrome);
    hands[s] = buildHand(H, sgn);
  });
  ["Left", "Right"].forEach((s, i) => {
    const sgn = i === 0 ? 1 : -1;
    const U = B[s + "UpLeg"], K = B[s + "Leg"], Ft = B[s + "Foot"], T = B[s + "ToeBase"];
    const th = limb(U, V(0, 0, 0), off(s + "UpLeg"), 0.82, 0.62, M.shell, 24, true);
    limb(U, V(0, 0, 0), off(s + "UpLeg"), 0.45, 0.45, M.carbon, 16);
    strip(th, L(s + "UpLeg"), 0.8, M.glow, Math.PI * 0.5 * sgn);
    box(U, off(s + "UpLeg").multiplyScalar(0.45).add(V(0, 0, 0.75)), V(1.1, L(s + "UpLeg") * 0.5, 0.3), M.gun, V(0.25, 0, 0));
    sphere(K, V(0, 0, 0), 0.68, M.chrome);
    const sh = limb(K, V(0, 0, 0), off(s + "Leg"), 0.6, 0.5, M.shell, 24, true);
    limb(K, V(0, 0, 0), off(s + "Leg"), 0.38, 0.38, M.carbon, 16);
    strip(sh, L(s + "Leg"), 0.6, M.glow, Math.PI * 0.5 * sgn);
    box(K, off(s + "Leg").multiplyScalar(0.5).add(V(0, 0, 0.65)), V(0.9, L(s + "Leg") * 0.7, 0.35), M.gun);
    sphere(Ft, V(0, 0, 0), 0.5, M.chrome);
    const toe = off(s + "Foot");
    box(Ft, V(0, -0.25, toe.z * 0.5), V(1.05, 0.55, toe.z + 1.2), M.shell);
    box(Ft, V(0, -0.5, toe.z * 0.5), V(1.15, 0.15, toe.z + 1.4), M.carbon);
    const heel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.3), M.glowO); heel.position.set(0, -0.3, -0.55); Ft.add(heel);
    box(T, V(0, -0.2, 0.5), V(1.0, 0.4, 1.0), M.shell);
  });
  // 首: 胴 (襟) の中から頭までを太めの 2 段でつなぐ
  limb(B.Neck1, V(0, -0.6, 0), off("Neck1"), 0.5, 0.42, M.carbon, 16);
  const neckRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 32), M.glow); neckRing.rotation.x = Math.PI / 2; neckRing.position.y = 0.45; B.Neck1.add(neckRing);
  const hd = B.Head; const hl = L("Head");
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 24), M.shell); skull.scale.set(0.95, 1.08, 1.0); skull.position.set(0, hl * 0.55, 0.05); shadowed(skull); hd.add(skull);
  const face = new THREE.Mesh(new THREE.SphereGeometry(1.15, 32, 24, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.28, Math.PI * 0.5), M.carbon);
  face.scale.set(0.97, 1.1, 1.02); face.position.set(0, hl * 0.55, 0.08); hd.add(face);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.24, 0.3), M.visor); visor.position.set(0, hl * 0.62, 1.08); hd.add(visor);
  box(hd, V(0, hl * 0.15, 0.55), V(0.9, 0.5, 0.7), M.gun);
  [-1, 1].forEach((sgn) => { const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 20), M.chrome); pod.rotation.z = Math.PI / 2; pod.position.set(sgn * 1.15, hl * 0.6, 0); hd.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 8, 24), M.glow); ring.rotation.y = Math.PI / 2; ring.position.set(sgn * 1.28, hl * 0.6, 0); hd.add(ring); });
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.4, 8), M.chrome); ant.position.set(-0.75, hl * 1.3, -0.2); ant.rotation.z = 0.35; hd.add(ant);
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), M.glowO); antTip.position.set(-1.0, hl * 1.72, -0.2); hd.add(antTip);
  // 目 (カメラの位置)
  const eye = new THREE.Object3D(); eye.position.set(0, hl * 0.62, 1.15); hd.add(eye);
  return { visor, core, eye };
}

// 手: 手のひら + 5 本の指 (2 関節)。指は手の骨の +x*sgn 方向、手のひらの幅は骨の z 軸。
// 指の並び (world x): 右手は親指が一番左、左手は親指が一番右。
export const FINGER_LEN = [1.65, 2.0, 2.2, 2.0, 1.75];     // 親指→小指 (ロボット単位)。親指と小指は鍵に届くよう少し長め
// 手の骨のローカル z は、左手では world +x、右手では world -x を向く (どちらも「体の内側」= 親指側)。
// なので親指の z を + にすれば、右手は親指が左、左手は親指が右になる (実際の手と同じ)。
export const FINGER_Z = [0.9, 0.45, 0, -0.45, -0.9];
export const FINGER_OFFSET_M = [-0.9, -0.45, 0, 0.45, 0.9].map((z) => z * ROBOT_SCALE);   // 右手の world x のずれ (親指→小指)
export function fingerOffsetX(hand, fingerIdx) { return FINGER_OFFSET_M[fingerIdx] * (hand === "R" ? 1 : -1); }
// 指先が手の骨から前 (-z) にどれだけ届くか (m)。親指→小指。手の位置 z を決めるのに使う
export const FINGER_REACH_Z = [0.176, 0.210, 0.222, 0.210, 0.195];
// 手の z を決めるときの重み: 親指は伸ばせないので優先、長い指は曲げて合わせられる
export const FINGER_Z_WEIGHT = [3, 1, 1, 1, 1.5];
const BLACK_TOP_Y = 0.7514;   // 黒鍵の上面 (KEY_TOP_Y + 0.004 + 0.48*KEY_H + 0.475*KEY_H)
export const TIP_R = 0.0055;         // 指先の丸みの半径 (m)
const KEY_PIVOT_Z = -0.170;   // 鍵の支点 (奥)
export function buildHand(H, sgn) {
  const palm = box(H, V(sgn * 0.85, 0, 0), V(1.5, 0.34, 2.0), M.carbon);
  box(H, V(sgn * 0.85, 0.2, 0), V(1.25, 0.14, 1.8), M.shell);
  const fingers = [];
  for (let i = 0; i < 5; i++) {
    const root = new THREE.Object3D(); root.position.set(sgn * (i === 0 ? 1.45 : 1.7), i === 0 ? -0.18 : 0, FINGER_Z[i]); H.add(root);
    const len = FINGER_LEN[i];
    limb(root, V(0, 0, 0), V(sgn * len * 0.55, 0, 0), 0.14, 0.12, M.shell, 10, true);
    const joint = new THREE.Object3D(); joint.position.set(sgn * len * 0.55, 0, 0); root.add(joint);
    limb(joint, V(0, 0, 0), V(sgn * len * 0.45, 0, 0), 0.115, 0.09, M.gun, 10, true);
    const tip = new THREE.Object3D(); tip.position.set(sgn * len * 0.45, -0.1, 0); joint.add(tip);
    fingers.push({ root, joint, tip, len, lenM: len * ROBOT_SCALE, press: 0, spread: 0 });
  }
  return { bone: H, sgn, fingers, palm, restPos: H.position.clone() };
}

/* ─────────── グランドピアノ (一般的なコンサートグランド。弦 1 本ずつ) ─────────── */
const RIM_H = 0.27, TOP_Y = 0.99;
const CASE_FRONT = -0.20, CASE_TAIL = -2.05, HALF_W = 0.76;
// 平面図の輪郭。Shape の (x, y) を後で (x, -z) に回す。y が大きいほど奥。
function outline(inset = 0) {
  const w = HALF_W - inset, front = -CASE_FRONT + inset, tail = -CASE_TAIL - inset;
  const s = new THREE.Shape();
  s.moveTo(-w, front);
  s.lineTo(w, front);
  s.lineTo(w, front + 0.62);                                              // 高音側の直線
  s.bezierCurveTo(w, front + 1.05, w * 0.35, front + 1.2, -w * 0.05, front + 1.42);   // 曲げ側板 (S 字)
  s.bezierCurveTo(-w * 0.35, front + 1.58, -w * 0.62, front + 1.72, -w * 0.72, tail - 0.05);
  s.quadraticCurveTo(-w, tail, -w, tail - 0.32);                          // 尾の丸み
  s.lineTo(-w, front);
  return s;
}
function extrudeOutline(shape, depth, mat, holeShape = null) {
  if (holeShape) shape.holes.push(holeShape);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 48 });
  g.rotateX(-Math.PI / 2);   // (x, y, +z) → (x, +z→+y, y→-z)
  return shadowed(new THREE.Mesh(g, mat));
}
export function textPlate(text, w, h, opts = {}) {
  const cv = document.createElement("canvas"); cv.width = 1024; cv.height = Math.round(1024 * h / w);
  const c = cv.getContext("2d");
  c.fillStyle = opts.bg ?? "#c9a656"; c.fillRect(0, 0, cv.width, cv.height);
  c.strokeStyle = opts.line ?? "#6b5320"; c.lineWidth = 8; c.strokeRect(14, 14, cv.width - 28, cv.height - 28);
  c.fillStyle = opts.fg ?? "#3b2c0c"; c.textAlign = "center"; c.textBaseline = "middle";
  const lines = text.split("\n");
  let size = opts.size ?? Math.min(72, Math.floor(cv.height / (lines.length + 1.2)));
  // 一番長い行がプレートの幅に収まるまで小さくする
  for (;;) { c.font = `${opts.weight ?? "600"} ${size}px 'IBM Plex Mono', monospace`; const wmax = Math.max(...lines.map((ln) => c.measureText(ln).width)); if (wmax <= cv.width - 60 || size <= 10) break; size -= 1; }
  lines.forEach((ln, i) => c.fillText(ln, cv.width / 2, cv.height / 2 + (i - (lines.length - 1) / 2) * size * 1.25));
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, metalness: 0.8 }));
}

// 木目 (計算で描く) — 響板のスプルースとピン板のメープル
export function woodTexture({ base = "#d9b57a", grain = "#b98f55", lines = 160, w = 1024, h = 1024, noise = 0.08 } = {}) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const c = cv.getContext("2d");
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  for (let i = 0; i < lines; i++) {
    const x = (i / lines) * w + (Math.random() - 0.5) * 6;
    c.strokeStyle = grain; c.globalAlpha = 0.12 + Math.random() * 0.25; c.lineWidth = 0.6 + Math.random() * 1.6;
    c.beginPath(); c.moveTo(x, 0);
    for (let y = 0; y <= h; y += 32) c.lineTo(x + Math.sin(y * 0.01 + i) * 3 + (Math.random() - 0.5) * 2, y);
    c.stroke();
  }
  c.globalAlpha = noise;
  for (let k = 0; k < 4000; k++) { c.fillStyle = Math.random() < 0.5 ? "#000" : "#fff"; c.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  c.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
  return tex;
}
// 映り込み用の環境 (暗いホール: 天井の照明と壁の淡い光)
export function makeEnvironment(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: 0x141414, side: THREE.BackSide })));
  const lamp = (x, y, z, w, h, col, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col })); m.position.set(x, y, z); m.lookAt(0, 0, 0); m.material.color.multiplyScalar(i); env.add(m); };
  lamp(0, 8, 2, 6, 3, 0xfff1dc, 6); lamp(-6, 5, -4, 4, 2, 0xbfd8ff, 2.5); lamp(6, 4, -3, 3, 2, 0xffe6c4, 2); lamp(0, 2.5, 9, 8, 1.2, 0xffffff, 0.8);
  const rt = pm.fromScene(env, 0.04);
  pm.dispose();
  return rt.texture;
}

function buildPiano(scene) {
  const g = new THREE.Group();
  if (!P.spruce.map) { P.spruce.map = woodTexture({ base: "#dcb97e", grain: "#b58b4e", lines: 220 }); P.spruce.map.repeat.set(2, 2); P.spruce.needsUpdate = true; }
  if (!P.maple.map) { P.maple.map = woodTexture({ base: "#a8743f", grain: "#7a4f26", lines: 90 }); P.maple.map.repeat.set(3, 3); P.maple.needsUpdate = true; }
  const rim = extrudeOutline(outline(0), RIM_H, P.lacquer, outline(0.032)); rim.position.y = TOP_Y - RIM_H; g.add(rim);
  const bottom = extrudeOutline(outline(0.02), 0.02, P.lacquerMatte); bottom.position.y = TOP_Y - RIM_H; g.add(bottom);
  const board = extrudeOutline(outline(0.035), 0.012, P.spruce); board.position.y = TOP_Y - RIM_H + 0.08; g.add(board);
  for (let i = 0; i < 9; i++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(1.2 - i * 0.05, 0.006, 0.02), P.maple); rib.position.set(-0.05 - i * 0.02, TOP_Y - RIM_H + 0.075, -0.55 - i * 0.16); rib.rotation.y = -0.35; g.add(rib); }
  // 鋳鉄フレーム: 響板を響かせる丸い抜き穴を 4 つ
  const plateShape = outline(0.06);
  for (const [cx, cz, rx, rz] of [[-0.05, -0.80, 0.16, 0.13], [0.30, -0.75, 0.12, 0.10], [-0.42, -1.25, 0.12, 0.11], [-0.10, -1.30, 0.16, 0.12]]) {
    const hole = new THREE.Path(); hole.absellipse(cx, -cz, rx, rz, 0, Math.PI * 2, false, 0); plateShape.holes.push(hole);
  }
  const plate = extrudeOutline(plateShape, 0.02, P.plate); plate.position.y = TOP_Y - RIM_H + 0.10; g.add(plate);
  // フレームの縁取り (少し暗い金の帯)
  const plateEdge = extrudeOutline(outline(0.055), 0.004, P.plateDark, outline(0.085)); plateEdge.position.y = TOP_Y - RIM_H + 0.12; g.add(plateEdge);
  // 弦の下の緑のフェルト (ピン板の手前)
  const felt = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 - 0.14, 0.004, 0.05), new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 0.95 })); felt.position.set(0, TOP_Y - RIM_H + 0.158, -0.40); g.add(felt);
  const struts = [[-0.55, -0.35, -0.62, -1.75], [-0.2, -0.35, -0.36, -1.85], [0.15, -0.35, -0.12, -1.55], [0.45, -0.35, 0.25, -1.15], [0.68, -0.35, 0.62, -0.75]];
  for (const [x0, z0, x1, z1] of struts) { const len = Math.hypot(x1 - x0, z1 - z0); const bar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, len), P.plateDark)); bar.position.set((x0 + x1) / 2, TOP_Y - RIM_H + 0.145, (z0 + z1) / 2); bar.rotation.y = Math.atan2(x1 - x0, -(z1 - z0)); g.add(bar); }
  const pinblock = shadowed(new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 - 0.08, 0.05, 0.14), P.plateDark)); pinblock.position.set(0, TOP_Y - RIM_H + 0.13, -0.30); g.add(pinblock);
  // ── 弦
  const strings = [], pins = [];
  // 弦の終わりは必ずケースの内側 (外形線から 7cm 内側) に収める: 外形の多角形で内外判定して、はみ出す分だけ短くする
  const casePts = outline(0.07).getPoints(96).map((q) => ({ x: q.x, z: -q.y }));
  const insideCase = (x, z) => { let inside = false; for (let i = 0, j = casePts.length - 1; i < casePts.length; j = i++) { const a = casePts[i], b = casePts[j]; if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside; } return inside; };
  for (let p = LOW; p <= HIGH; p++) {
    const t = (p - LOW) / (HIGH - LOW);
    const nStr = p < 28 ? 1 : p < 41 ? 2 : 3;
    const wound = p < 41;
    const x = keyX(p);
    let len = wound ? 1.66 - (p - LOW) * 0.022 : 1.30 * Math.pow(2, -(p - 41) / 13.5) + 0.05;
    const gap = wound ? 0.0055 : 0.0026;
    for (let k = 0; k < nStr; k++) {
      const x0 = x + (k - (nStr - 1) / 2) * gap + (wound ? -0.05 : 0);
      const z0 = -0.30;
      const ang = wound ? 0.07 : -0.05 * t;   // 低音弦は尾 (低音側の奥) へ少し斜め、高音弦は曲げ側板へ少し斜め
      while (len > 0.15 && !insideCase(x0 - Math.sin(ang) * len, z0 - Math.cos(ang) * len)) len -= 0.01;
      const x1 = x0 - Math.sin(ang) * len, z1 = z0 - Math.cos(ang) * len;
      strings.push({ p, x0, z0, x1, z1, wound, r: wound ? 0.0018 + (41 - p) * 0.00008 : 0.0008 + (1 - t) * 0.0005, y: wound ? TOP_Y - RIM_H + 0.215 : TOP_Y - RIM_H + 0.19 });
      pins.push({ x: x0, z: z0 + 0.02, y: TOP_Y - RIM_H + 0.16 });
    }
  }
  const strGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1); strGeo.rotateX(Math.PI / 2);
  const steelMesh = new THREE.InstancedMesh(strGeo, P.steel, strings.filter((s) => !s.wound).length);
  const copperMesh = new THREE.InstancedMesh(strGeo, P.copper, strings.filter((s) => s.wound).length);
  const tmp = new THREE.Object3D(); let is = 0, ic = 0;
  for (const s of strings) {
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    tmp.position.set((s.x0 + s.x1) / 2, s.y, (s.z0 + s.z1) / 2); tmp.rotation.set(0, Math.atan2(s.x1 - s.x0, -(s.z1 - s.z0)), 0); tmp.scale.set(s.r * 1.6, s.r * 1.6, len); tmp.updateMatrix();
    if (s.wound) copperMesh.setMatrixAt(ic++, tmp.matrix); else steelMesh.setMatrixAt(is++, tmp.matrix);
  }
  steelMesh.castShadow = true; copperMesh.castShadow = true; g.add(steelMesh, copperMesh);
  const pinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.06, 8), P.silver, pins.length);
  pins.forEach((pn, i) => { tmp.position.set(pn.x, pn.y, pn.z); tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); pinMesh.setMatrixAt(i, tmp.matrix); });
  g.add(pinMesh);
  // アグラフ (中高音の弦の始点を押さえる真鍮の小さな金具) とヒッチピン (弦の終点)
  const agGeo = new THREE.BoxGeometry(0.009, 0.006, 0.007);
  const agraffes = strings.filter((st) => !st.wound);
  const agMesh = new THREE.InstancedMesh(agGeo, P.brass, agraffes.length);
  agraffes.forEach((st, i) => { tmp.position.set(st.x0 + (st.x1 - st.x0) * 0.04, st.y - 0.002, st.z0 + (st.z1 - st.z0) * 0.04); tmp.rotation.set(0, Math.atan2(st.x1 - st.x0, -(st.z1 - st.z0)), 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); agMesh.setMatrixAt(i, tmp.matrix); });
  g.add(agMesh);
  const hitchMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.02, 6), P.silver, strings.length);
  strings.forEach((st, i) => { tmp.position.set(st.x1, st.y - 0.004, st.z1); tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); hitchMesh.setMatrixAt(i, tmp.matrix); });
  g.add(hitchMesh);
  // ── 駒
  const bridgePts = strings.filter((s) => !s.wound && s.p % 4 === 1).map((s) => ({ x: s.x1 + (s.x0 - s.x1) * 0.06, z: s.z1 + (s.z0 - s.z1) * 0.06 }));
  for (let i = 1; i < bridgePts.length; i++) { const a = bridgePts[i - 1], b = bridgePts[i]; const len = Math.hypot(b.x - a.x, b.z - a.z); const seg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, len + 0.006), P.maple); seg.position.set((a.x + b.x) / 2, TOP_Y - RIM_H + 0.165, (a.z + b.z) / 2); seg.rotation.y = Math.atan2(b.x - a.x, -(b.z - a.z)); g.add(seg); }
  const bassPts = strings.filter((s) => s.wound && s.p % 3 === 0).map((s) => ({ x: s.x1 + (s.x0 - s.x1) * 0.05, z: s.z1 + (s.z0 - s.z1) * 0.05 }));
  for (let i = 1; i < bassPts.length; i++) { const a = bassPts[i - 1], b = bassPts[i]; const len = Math.hypot(b.x - a.x, b.z - a.z); const seg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, len + 0.006), P.maple); seg.position.set((a.x + b.x) / 2, TOP_Y - RIM_H + 0.19, (a.z + b.z) / 2); seg.rotation.y = Math.atan2(b.x - a.x, -(b.z - a.z)); g.add(seg); }
  // ── ダンパーとハンマー (鍵ごと)
  const N_KEYS = HIGH - LOW + 1;
  const dampers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.016, 0.012, 0.028), P.feltWhite, N_KEYS);
  const damperHead = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.03, 0.012), P.hammerWood, N_KEYS);
  const hammers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.010, 0.018, 0.026), P.feltWhite, N_KEYS);
  const hammerShank = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 6), P.hammerWood, N_KEYS);
  g.add(dampers, damperHead, hammers, hammerShank);
  const DAMPER_Z = -0.50, HAMMER_Z = -0.42, STRING_Y = TOP_Y - RIM_H + 0.19;
  const keys = {};
  for (let p = LOW; p <= HIGH; p++) {
    const black = isBlack(p);
    const pivot = new THREE.Object3D();
    pivot.position.set(keyX(p), black ? KEY_TOP_Y + 0.004 : KEY_TOP_Y - KEY_H / 2, -WHITE_L - 0.02);
    let geo;
    // 鍵の境目が見えるように: すき間を実物より少し広く (片側 1.1mm)、角に丸み (1.2mm) をつける
    const KEY_GAP = 0.0011, BEV = 0.0012, BEV_T = 0.0012;
    if (black) {
      // 黒鍵: 上がわずかに細い台形の断面。角は丸い
      const w = BLACK_W - 0.0006 - BEV * 2, hh = KEY_H * 0.95 - BEV * 2;
      const sh = new THREE.Shape();
      sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2 * 0.84, hh); sh.lineTo(-w / 2 * 0.84, hh); sh.lineTo(-w / 2, 0);
      geo = new THREE.ExtrudeGeometry(sh, { depth: BLACK_L - BEV_T * 2, bevelEnabled: true, bevelThickness: BEV_T, bevelSize: BEV, bevelSegments: 3 });
      geo.translate(0, BEV - KEY_H * 0.95 / 2, BEV_T);   // 高さの中心を 0 に、z を 0〜BLACK_L に
      geo.rotateY(Math.PI);                              // 押し出し (+z) を奥 (-z) へ。断面は左右対称なので裏返っても同じ
      geo.translate(0, 0, BLACK_L);                      // z: 0 (奥=支点側) 〜 BLACK_L (手前)
    } else {
      // 白鍵は奥で黒鍵をよける L 字 / T 字。左右どちらに黒鍵があるかで奥の幅を削る
      const gap = KEY_GAP + BEV, fullW = WHITE_W - gap * 2;
      const leftBlack = p > LOW && isBlack(p - 1), rightBlack = p < HIGH && isBlack(p + 1);
      const cutL = leftBlack ? (keyX(p - 1) + BLACK_W / 2 + gap) - (keyX(p) - WHITE_W / 2) : 0;
      const cutR = rightBlack ? (keyX(p) + WHITE_W / 2) - (keyX(p + 1) - BLACK_W / 2 - gap) : 0;
      const backLen = BLACK_L + 0.006, frontLen = WHITE_L + 0.02 - backLen;
      const sh = new THREE.Shape();
      const x0 = -fullW / 2, x1 = fullW / 2;
      sh.moveTo(x0, 0); sh.lineTo(x1, 0); sh.lineTo(x1, frontLen); sh.lineTo(x1 - Math.max(0, cutR), frontLen); sh.lineTo(x1 - Math.max(0, cutR), frontLen + backLen); sh.lineTo(x0 + Math.max(0, cutL), frontLen + backLen); sh.lineTo(x0 + Math.max(0, cutL), frontLen); sh.lineTo(x0, frontLen); sh.lineTo(x0, 0);
      geo = new THREE.ExtrudeGeometry(sh, { depth: KEY_H - BEV_T * 2, bevelEnabled: true, bevelThickness: BEV_T, bevelSize: BEV, bevelSegments: 3 });
      geo.translate(0, 0, BEV_T);                // 押し出しの範囲を 0〜KEY_H に
      geo.rotateX(-Math.PI / 2);                 // shape の y (奥行き) → -z、押し出し → +y。x はそのまま (左右を裏返さない)
      geo.translate(0, -KEY_H / 2, WHITE_L + 0.02); // 支点 (奥) から手前へ 0〜L
    }
    // 鍵の上面は元の色を保ち、小口だけに押した印を出す
    const mat = (black ? P.ebony : P.ivory).clone(); mat.emissive.setHex(0); mat.emissiveIntensity = 0;
    const mesh = shadowed(new THREE.Mesh(geo, mat));
    mesh.position.set(0, black ? KEY_H * 0.48 : 0, black ? 0.02 : 0);
    pivot.add(mesh); g.add(pivot);
    keys[p] = { pivot, mesh, mat, indicator: addKeyIndicator(mesh), black, press: 0, target: 0, idx: p - LOW, hasDamper: p <= 89, dirty: true };
  }
  // ── 鍵盤まわり
  const keybed = shadowed(new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.07, 0.46), P.lacquer)); keybed.position.set(0, KEY_TOP_Y - KEY_H - 0.04, -0.08); g.add(keybed);
  // 鍵と鍵のすき間の底に黒い細い板 (上から見たとき、境目が黒い線に見える)
  const gapMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
  const gapMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0007, KEY_H * 0.8, WHITE_L + 0.02), gapMat, N_WHITE + 1);
  for (let i = 0; i <= N_WHITE; i++) { tmp.position.set(KEYS_X0 + i * WHITE_W, KEY_TOP_Y - KEY_H / 2 - 0.0025, -(WHITE_L + 0.02) / 2); tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); gapMesh.setMatrixAt(i, tmp.matrix); }
  g.add(gapMesh);
  [-1, 1].forEach((s) => { const cheek = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.22, 0.46), P.lacquer)); cheek.position.set(s * (HALF_W - 0.0575), KEY_TOP_Y + 0.055, -0.08); g.add(cheek); });
  const keyslip = shadowed(new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 - 0.23, 0.028, 0.02), P.lacquer)); keyslip.position.set(0, KEY_TOP_Y - 0.018, 0.10); g.add(keyslip);
  const nameboardFelt = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 - 0.23, 0.01, 0.012), P.feltRed); nameboardFelt.position.set(0, KEY_TOP_Y + 0.006, -WHITE_L - 0.03); g.add(nameboardFelt);
  const fallboard = shadowed(new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 - 0.23, 0.026, 0.19), P.lacquer)); fallboard.position.set(0, KEY_TOP_Y + 0.135, -0.28); fallboard.rotation.x = 0.06; g.add(fallboard);
  const nameboard = shadowed(new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 - 0.23, 0.15, 0.03), P.lacquer)); nameboard.position.set(0, KEY_TOP_Y + 0.075, -WHITE_L - 0.05); g.add(nameboard);
  const plaque = textPlate("SALAMANDER GRAND PIANO V3\nsampled by Alexander Holm · 16 velocity layers · 48 kHz / 24 bit\nSFZ by kinwie · given to the world for free — thank you", 0.44, 0.078, { size: 30 });
  plaque.position.set(0, KEY_TOP_Y + 0.078, -WHITE_L - 0.034); g.add(plaque);
  const desk = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.30, 0.018), P.lacquer)); desk.position.set(0, TOP_Y + 0.17, -0.52); desk.rotation.x = -0.28; g.add(desk);
  const deskLip = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.05), P.lacquer)); deskLip.position.set(0, TOP_Y + 0.035, -0.49); g.add(deskLip);
  // ── 屋根 (低音側の蝶番で開く)
  const lidPivot = new THREE.Object3D(); lidPivot.position.set(-HALF_W, TOP_Y + 0.005, 0); lidPivot.rotation.z = 0.92; g.add(lidPivot);
  const lid = extrudeOutline(outline(-0.01), 0.026, P.lacquer); lid.position.set(HALF_W, 0, 0); lidPivot.add(lid);
  const lidInner = extrudeOutline(outline(0.04), 0.004, P.lacquerMatte); lidInner.position.set(HALF_W, -0.004, 0); lidPivot.add(lidInner);
  const prop = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.05), P.lacquer)); prop.position.set(0.08, TOP_Y + 0.29, -1.05); prop.rotation.z = -0.22; prop.rotation.x = 0.08; g.add(prop);
  const hinge1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 10), P.brass); hinge1.position.set(-HALF_W, TOP_Y + 0.005, -0.5); hinge1.rotation.x = Math.PI / 2; g.add(hinge1);
  const hinge2 = hinge1.clone(); hinge2.position.z = -1.3; g.add(hinge2);
  // ── 脚・キャスター・リラ・ペダル
  for (const [x, z] of [[HALF_W - 0.12, -0.25], [-HALF_W + 0.12, -0.25], [-0.32, -1.82]]) {
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.07, KEY_TOP_Y - 0.12, 12), P.lacquer)); leg.position.set(x, (KEY_TOP_Y - 0.12) / 2 + 0.06, z); g.add(leg);
    const cap = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.15), P.lacquer)); cap.position.set(x, KEY_TOP_Y - 0.09, z); g.add(cap);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.036, 16), P.brass); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.038, z + 0.02); g.add(wheel);
    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), P.brass); fork.position.set(x, 0.07, z); g.add(fork);
  }
  const lyre = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.52, 0.045), P.lacquer)); lyre.position.set(0, 0.33, -0.16); g.add(lyre);
  [-0.09, 0.09].forEach((x) => { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 8), P.brass); rod.position.set(x, 0.33, -0.12); g.add(rod); });
  const pedalBase = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.16), P.lacquer)); pedalBase.position.set(0, 0.035, -0.08); g.add(pedalBase);
  const pedals = [];
  [-0.085, 0, 0.085].forEach((x) => { const pv = new THREE.Object3D(); pv.position.set(x, 0.055, -0.14); const pd = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.012, 0.12), P.brass); pd.position.set(0, 0, 0.06); pv.add(pd); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.008, 0.03), P.brass); foot.position.set(0, 0.004, 0.115); pv.add(foot); g.add(pv); pedals.push(pv); });
  // ── 椅子
  const seat = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.05, 0.36), P.bench)); seat.position.set(0, 0.47, 0.64); g.add(seat);
  const cushion = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.035, 0.32), P.cushion)); cushion.position.set(0, 0.51, 0.64); g.add(cushion);
  for (const [x, z] of [[-0.28, 0.5], [0.28, 0.5], [-0.28, 0.78], [0.28, 0.78]]) { const bl = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.45, 10), P.bench)); bl.position.set(x, 0.225, z); g.add(bl); }
  scene.add(g);
  return { group: g, keys, pedals, lidPivot, dampers, damperHead, hammers, hammerShank, DAMPER_Z, HAMMER_Z, STRING_Y, tmp };
}

/* ─────────── 舞台 ─────────── */
export class PianoStage {
  constructor(canvas, { headless = false } = {}) {
    this.canvas = canvas; this.headless = headless;
    if (!headless) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); // 軽さ優先 (Retina でも 1.5 まで)
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    }
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050505);
    this.scene.fog = new THREE.Fog(0x050505, 7, 16);
    this.scene.add(new THREE.HemisphereLight(0x9a9a9a, 0x0a0a0a, 0.5));
    if (!headless) this.scene.environment = makeEnvironment(this.renderer); // 漆・金属の映り込み
    this.scene.environmentIntensity = 0.55;
    const key = new THREE.SpotLight(0xfff1dc, 110, 12, 0.55, 0.55, 1.4); key.position.set(1.6, 3.8, 1.6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; this.scene.add(key); this.scene.add(key.target); key.target.position.set(0, 0.8, -0.3);
    const rim = new THREE.SpotLight(0xbfd8ff, 35, 10, 0.7, 0.7, 1.4); rim.position.set(-2.4, 2.8, -2.0); this.scene.add(rim);
    const fill = new THREE.PointLight(0xffe6c4, 5, 5, 1.6); fill.position.set(0.6, 1.5, 1.6); this.scene.add(fill);
    const inside = new THREE.PointLight(0xffe9c8, 3.5, 2.6, 1.6); inside.position.set(0.1, 1.25, -0.9); this.scene.add(inside);
    const handLamp = new THREE.PointLight(0xffffff, 2.2, 2.0, 1.8); handLamp.position.set(0, 1.35, 0.3); this.scene.add(handLamp);
    // 鍵盤を斜めから撫でる光 (影つき): 鍵の丸い角に光が乗り、すき間に影が落ちて境目が見える
    const keyLamp = new THREE.SpotLight(0xfff6e8, 30, 4.5, 0.62, 0.5, 1.5); keyLamp.position.set(1.05, 1.55, 0.62); keyLamp.castShadow = true; keyLamp.shadow.mapSize.set(2048, 2048); keyLamp.shadow.bias = -0.00012; keyLamp.shadow.normalBias = 0.0008; keyLamp.shadow.camera.near = 0.3; keyLamp.shadow.camera.far = 4; this.scene.add(keyLamp); this.scene.add(keyLamp.target); keyLamp.target.position.set(-0.1, KEY_TOP_Y, -0.08);
    const pedalLamp = new THREE.PointLight(0xfff0d8, 2.2, 1.4, 1.6); pedalLamp.position.set(0.35, 0.45, 0.35); this.scene.add(pedalLamp); // ペダルと右足 (小窓用)
    const floor = shadowed(new THREE.Mesh(new THREE.CircleGeometry(7, 64), P.floor)); floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
    this.piano = buildPiano(this.scene);
    this.bones = buildSkeleton();
    this.hands = {};
    this.robotParts = buildRobot(this.bones, this.hands);
    refineHands(this.hands,ROBOT_SCALE,TIP_R,{knuckleArch:false});
    refinePianoArms(this.bones,this.hands);
    // 軽さ優先 (2026-09-11): 手の小さな部品は影を落とさない (手首の甲・前腕の外装だけ影あり)
    for (const hand of Object.values(this.hands)) hand.bone.traverse((o) => { if (o.isMesh && o !== hand.palm) { o.castShadow = false; o.receiveShadow = false; } });
    for(const side of ["Left","Right"])batchHardware(this.bones[side+"ForeArm"]);
    this.robot = new THREE.Group(); this.robot.scale.setScalar(ROBOT_SCALE);
    this.robot.add(this.bones.Hips);
    this.scene.add(this.robot);
    this.poseSeated();
    this.camEye = new THREE.PerspectiveCamera(62, 1, 0.03, 30);
    this.camHands = new THREE.PerspectiveCamera(32, 1, 0.02, 10);
    this.camWide = new THREE.PerspectiveCamera(40, 1, 0.05, 40);
    // 全体カメラ: 目標点のまわりを回す (ドラッグ = 回転、ホイール = 寄り引き)
    this.orbit = { target: new THREE.Vector3(0, 0.85, 0.12), theta: 0.68, phi: 1.25, radius: 2.5, auto: true };
    this.view = "wide";          // 上 (または左) の画面: wide | eye | side | top
    this.closeMode = "auto"; this.closeTarget = "both"; this._closeDwell = 1;
    this._closePos = V(0,1.12,.30); this._closeLook = V(0,KEY_TOP_Y,-.07);
    this.camDetail = new THREE.PerspectiveCamera(38,1,.02,30);
    this.layout = "stack";       // stack (上下) | side (左右)
    if (!headless) this._bindOrbit();
    this.t = 0; this.energy = 0; this.pedalDown = false; this.pedalAmt = 0; this._lastPedalAmt = -1; this._damperInit = false;
    this.handState = { L: { x: keyX(48), y: KEY_TOP_Y + 0.044, z: 0.055 }, R: { x: keyX(72), y: KEY_TOP_Y + 0.044, z: 0.055 } };
    this.notesRef = []; this.pedalRef = [];
    this.headNod = 0;
    this._eyeLook = new THREE.Vector3(0, KEY_TOP_Y, -0.05);
    this._resize();
    if (!headless) new ResizeObserver(() => this._resize()).observe(canvas.parentElement);
  }

  _resize() {
    const r = this.headless ? (this.headlessViewport??{width:1000,height:800}) : this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(64, Math.floor(r.width)), h = Math.max(64, Math.floor(r.height));
    this.renderer?.setSize(w, h, false);
    this.w = w; this.h = h; this.needsRender = true;
    if (this.layout === "side" && w >= 700) {
      this.split = Math.round(w * 0.6);
      this.rects = { main: [0, 0, this.split, h], hands: [this.split, 0, w - this.split, h] };
    } else {
      this.split = Math.round(h * 0.58);
      this.rects = { main: [0, h - this.split, w, this.split], hands: [0, 0, w, h - this.split] };
    }
    for (const c of [this.camEye, this.camWide]) { c.aspect = this.rects.main[2] / this.rects.main[3]; c.updateProjectionMatrix(); }
    this.camHands.aspect = this.rects.hands[2] / this.rects.hands[3]; this.camHands.updateProjectionMatrix();
    if(this.shotCamera){this.shotCamera.aspect=w/h;this.shotCamera.updateProjectionMatrix();}
  }
  setLayout(layout) { this.layout = layout; this._resize(); }
  setView(view) {
    this.view = view;
    const o = this.orbit; o.auto = false;
    if (view === "wide") { o.theta = 0.68; o.phi = 1.25; o.radius = 2.5; o.auto = true; }
    if (view === "side") { o.theta = Math.PI / 2 + 0.05; o.phi = 1.35; o.radius = 2.6; }
    if (view === "top") { o.theta = 0.2; o.phi = 0.35; o.radius = 2.8; }
    if (view === "front") { o.theta = Math.PI + 0.35; o.phi = 1.25; o.radius = 3.2; }
  }
  setClose(mode) {
    if(!["auto","left","right","both"].includes(mode))throw new Error("Unknown close camera");
    this.closeMode=mode;this._closePending=null;this._closeDwell=1;
  }
  _bindOrbit() {
    const cv=this.canvas,o=this.orbit;let drag=null;
    const inMain=e=>{const r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=this.h-e.clientY+r.top;const [rx,ry,rw,rh]=this.rects.main;return x>=rx&&x<=rx+rw&&y>=ry&&y<=ry+rh;};
    cv.addEventListener("pointerdown",e=>{
      const main=inMain(e);if(main&&this.view==="eye")return;
      drag={main,x:e.clientX,y:e.clientY,theta:o.theta,phi:o.phi,pos:this._closePos.clone(),look:this._closeLook.clone()};
      cv.setPointerCapture(e.pointerId);
      if(main)o.auto=false;else this.closeMode="manual";
    });
    cv.addEventListener("pointermove",e=>{
      if(!drag)return;
      if(drag.main){o.theta=drag.theta-(e.clientX-drag.x)*.006;o.phi=clamp(drag.phi-(e.clientY-drag.y)*.005,.25,1.5);}
      else {const dx=-(e.clientX-drag.x)*.001,dy=(e.clientY-drag.y)*.001;this._closePos.copy(drag.pos).add(V(dx,dy,0));this._closeLook.copy(drag.look).add(V(dx,0,0));}
    });
    const up=e=>{if(!drag)return;drag=null;try{cv.releasePointerCapture(e.pointerId);}catch{}};
    cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);
    cv.addEventListener("wheel",e=>{
      e.preventDefault();
      if(inMain(e)){o.radius=clamp(o.radius*(e.deltaY>0?1.08:.92),.9,7);o.auto=false;}
      else {this.closeMode="manual";this._closePos.sub(this._closeLook).multiplyScalar(e.deltaY>0?1.08:.92).add(this._closeLook);}
    },{passive:false});
    cv.addEventListener("dblclick",e=>{if(inMain(e))this.setView("wide");else this.setClose("auto");});
  }

  poseSeated() {
    const B = this.bones;
    this.robot.position.set(0, 0.5 + 1.0 * ROBOT_SCALE, 0.64);
    this.robot.rotation.y = Math.PI;
    B.Hips.rotation.set(0, 0, 0);
    // 左足: ペダルから離して床に平らに (少し外側・手前)。右足: サスティンペダルの上 (踵は床)
    B.LeftUpLeg.rotation.set(-Math.PI / 2 + 0.25, 0.05, -0.34);
    B.LeftLeg.rotation.set(Math.PI / 2 - 0.55, 0, 0);
    B.LeftFoot.rotation.set(0.30, 0, 0.05);
    B.RightUpLeg.rotation.set(-Math.PI / 2 + 0.08, 0, 0.02);
    B.RightLeg.rotation.set(Math.PI / 2 - 0.42, 0, 0);
    B.RightFoot.rotation.set(0.34, 0, 0);
    B.LeftShoulder.rotation.set(0, 0, -0.05); B.RightShoulder.rotation.set(0, 0, 0.05);
    this.robot.updateMatrixWorld(true);
    this.armLen = { upper: SKELETON.LeftForeArm[0] * ROBOT_SCALE, fore: SKELETON.LeftHand[0] * ROBOT_SCALE };
  }

  setSong(notes, pedal) {
    this.notesRef = notes.map(n => ({...n})).sort((a, b) => a.s - b.s);
    this.motion = null; this._motionTempo = null;
    this._cameraAngle=null;this._visibilityAt=-Infinity;
    this.pedalRef = pedal ?? [];
  }

  _palmFor(h, list) {
    let x=0,z=0,weight=0;
    for(const n of list) {
      x+=keyX(n.p)-fingerOffsetX(h,n._f);
      const w=FINGER_Z_WEIGHT[n._f];
      z+=((isBlack(n.p)?-.095:-.045)+FINGER_REACH_Z[n._f])*w;weight+=w;
    }
    return {x:x/list.length,y:KEY_TOP_Y+.044,z:z/weight-.85*ROBOT_SCALE};
  }

  _fitPalm(h,g) {
    const hand=this.hands[h==="L"?"Left":"Right"],side=h==="L"?"Left":"Right";
    const palm=g.palm;
    hand.bone.position.copy(hand.restPos);
    for(let pass=0;pass<6;pass++) {
      this._solveArm(side,V(palm.x,palm.y,palm.z+.85*ROBOT_SCALE),0);
      const residual=V(0,0,0);let count=0;
      for(const n of g.contacts) {
        const f=hand.fingers[n._f];
        f.exactPose=null;f.root.rotation.set(0,0,-hand.sgn*.25);f.joint.rotation.z=-hand.sgn*.2;
        const error=this._placeFinger(hand,f,n.p,.7+.3*n.v/127,0);
        if(error.length()>.0007){residual.add(error);count++;}
      }
      if(!count)break;
      residual.divideScalar(count);if(residual.length()>.03)residual.setLength(.03);
      palm.x+=residual.x;palm.y+=residual.y;palm.z+=residual.z;
    }
    this._solveArm(side,V(palm.x,palm.y,palm.z+.85*ROBOT_SCALE),0);
    let error=0;g.fingerPoses={};
    for(const n of g.contacts){const f=hand.fingers[n._f];const r=this._placeFinger(hand,f,n.p,.7+.3*n.v/127,0);error=Math.max(error,r.length());g.fingerPoses[n._f]=f.exactPose.slice();}
    return error;
  }

  _canHold(h,n,palm) {
    const side=h==="L"?"Left":"Right",hand=this.hands[side];
    hand.bone.position.copy(hand.restPos);
    this._solveArm(side,V(palm.x,palm.y,palm.z+.85*ROBOT_SCALE),0);
    return this._placeFinger(hand,hand.fingers[n._f],n.p,.7+.3*n.v/127,0).length()<.0015;
  }

  setFrameRate(fps=0) {
    if(!Number.isFinite(fps)||fps<0)throw new Error("fps must be zero (native) or positive");
    this.frameRate=fps;return fps;
  }

  /* ── 2 本骨 IK。肘は「外・下・体側 (手前)」へ ── */
  _solveArm(side, target, dt) {
    const B = this.bones;
    const sgn = side === "Left" ? 1 : -1;
    const shoulder = B[side + "Arm"], elbow = B[side + "ForeArm"], hand = B[side + "Hand"];
    const S = new THREE.Vector3(); shoulder.getWorldPosition(S);
    const a = this.armLen.upper, b = this.armLen.fore;
    const D = target.clone().sub(S);
    let d = D.length(); const maxD = (a + b) * 0.985; if (d > maxD) { D.multiplyScalar(maxD / d); d = maxD; }
    d = Math.max(d, Math.abs(a - b) + 0.01);
    const cosE = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const angE = Math.acos(cosE);
    const dirN = D.clone().normalize();
    const outward = Math.sign(S.x) || 1;
    const pole = new THREE.Vector3(outward * 0.55, -0.85, 0.75).normalize();
    const perp = pole.clone().sub(dirN.clone().multiplyScalar(pole.dot(dirN)));
    if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0); perp.normalize();
    const E = S.clone().add(dirN.clone().multiplyScalar(a * Math.cos(angE))).add(perp.multiplyScalar(a * Math.sin(angE)));
    const setBone = (bone, from, to, restAxis) => {
      const parent = bone.parent; parent.updateWorldMatrix(true, false);
      const pq = new THREE.Quaternion(); parent.getWorldQuaternion(pq);
      const dirLocal = to.clone().sub(from).normalize().applyQuaternion(pq.clone().invert());
      const q = new THREE.Quaternion().setFromUnitVectors(restAxis, dirLocal);
      bone.quaternion.copy(q);
      bone.updateMatrixWorld(true);
    };
    setBone(shoulder, S, E, new THREE.Vector3(sgn, 0, 0));
    const Ew = new THREE.Vector3(); elbow.getWorldPosition(Ew);
    setBone(elbow, Ew, target, new THREE.Vector3(sgn, 0, 0));
    hand.updateWorldMatrix(true, false);
    const pq = new THREE.Quaternion(); hand.parent.getWorldQuaternion(pq);
    const m = new THREE.Matrix4();
    const xAxis = new THREE.Vector3(0, 0, -sgn), yAxis = new THREE.Vector3(0, 1, 0);
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
    m.makeBasis(xAxis, yAxis, zAxis);
    const wq = new THREE.Quaternion().setFromRotationMatrix(m);
    hand.quaternion.copy(pq.clone().invert().multiply(wq));
  }


  // Analytic two-link finger IK, including the pad's 0.1-unit offset.
  // Solve the actual bones; no proxy contact points or fingertip translation.
  _placeFinger(hand,f,p,keyPress,hover) {
    const black=isBlack(p),sgn=hand.sgn,lo=black?-.140:-.115,hi=black?-.068:-.020;
    const natural=black?-.095:-.045,A=f.len*.55,B=Math.hypot(f.len*.45,.1),pad=Math.atan2(-.1,f.len*.45);
    hand.bone.updateWorldMatrix(true,false);
    const inverse=hand.bone.matrixWorld.clone().invert();
    const targets=[natural,...Array.from({length:13},(_,i)=>lo+(hi-lo)*i/12)];
    let best=null;
    for(const z of targets) {
      const dip=keyPress*(KEY_DIP/(black?BLACK_L:WHITE_L))*(z-KEY_PIVOT_Z);
      const target=V(keyX(p),(black?BLACK_TOP_Y:KEY_TOP_Y)-dip+TIP_R+hover,z);
      const q=target.clone().applyMatrix4(inverse).sub(f.root.position);
      const yaw=clamp(Math.atan2(-sgn*q.z,sgn*q.x),-1.1,1.1);
      const x=Math.hypot(q.x,q.z),y=q.y,d2=x*x+y*y;
      const gamma=-Math.acos(clamp((d2-A*A-B*B)/(2*A*B),-1,1));
      const bend=clamp(gamma-pad,-1.8,.05);
      const root=clamp(Math.atan2(y,x)-Math.atan2(B*Math.sin(gamma),A+B*Math.cos(gamma)),-1.35,.4);
      f.root.rotation.set(0,yaw,sgn*root);f.joint.rotation.z=sgn*bend;f.root.updateMatrixWorld(true);
      const actual=V(0,0,0);f.tip.getWorldPosition(actual);
      const residual=target.clone().sub(actual),error=residual.length();
      const cost=error*1000+Math.abs(z-natural)*.4;
      if(!best||cost<best.cost)best={cost,error,residual,pose:[yaw,sgn*root,sgn*bend]};
      if(error<.0001&&z===natural)break;
    }
    f.root.rotation.set(0,best.pose[0],best.pose[1]);f.joint.rotation.z=best.pose[2];f.root.updateMatrixWorld(true);
    f.exactPose=best.pose;return best.residual;
  }

  measureContact(n) {
    const hand=this.hands[n.h==="L"?"Left":"Right"], f=hand.fingers[n._f];
    const p=n.p, black=isBlack(p), T=new THREE.Vector3();f.tip.getWorldPosition(T);
    const k=this.piano.keys[p],dx=T.x-keyX(p);
    const zLo=black?-.145:-.120,zHi=black?-.060:-.004;
    const dz=T.z<zLo?T.z-zLo:T.z>zHi?T.z-zHi:0;
    const dip=(k?.press??0)*(KEY_DIP/(black?BLACK_L:WHITE_L))*(clamp(T.z,zLo,zHi)-KEY_PIVOT_Z);
    const dy=T.y-((black?BLACK_TOP_Y:KEY_TOP_Y)-dip+TIP_R);
    return {i:n._i,p,h:n.h,f:n._f+1,s:n.s,dx,dy,dz,
      miss:Math.abs(dx)>(black?BLACK_W:WHITE_W)/2-.001 || Math.abs(dy)>.008 || Math.abs(dz)>0};
  }

  measureRelease(n) {
    const key=this.piano.keys[n.p],point=V(keyX(n.p),key.black?BLACK_TOP_Y:KEY_TOP_Y,key.black?-.095:-.045);
    let nearestTip=Infinity;
    for(const hand of Object.values(this.hands))for(const finger of hand.fingers)nearestTip=Math.min(nearestTip,finger.tip.getWorldPosition(V(0,0,0)).distanceTo(point));
    return {i:n._i,p:n.p,beat:n.s,keyPress:key.press,nearestTip,clear:key.press<.01&&nearestTip>.012};
  }

  // Exact onset probes are independent of the regular FPS samples. In particular,
  // an onset is never rounded up to a later frame. Authorised visual releases
  // are separately counted and checked, not presented as successful contacts.
  rehearse(notes,pedal,beatToSec,{fps=60,endBeat=null,secToBeat:fromSec=null}={}) {
    const saved={notes:this.notesRef,pedal:this.pedalRef,beat:this._lastBeat??0};
    this.setSong(notes,pedal);this.update(0,beatToSec,0,true);
    const timed=this.motion.notes;
    const end=endBeat??Math.max(0,...timed.map(n=>n.s+n.d));
    const toBeat=fromSec??((sec,near=0)=>{let lo=near,hi=near+.5;while(beatToSec(hi)<sec)hi+=1;for(let i=0;i<22;i++){const m=(lo+hi)/2;if(beatToSec(m)<sec)lo=m;else hi=m;}return (lo+hi)/2;});
    const events=[];
    for(const n of timed)if(n.s<=end){events.push({sec:n._s,n,stage:n._visualRelease?2:0});if(!n._visualRelease&&n._e-n._s>=.06&&n._release>n._s+.06)events.push({sec:n._s+.06,n,stage:1});}
    events.sort((a,b)=>a.sec-b.sec);
    const misses=[],released=[];let checked=0,maxDx=0,maxDy=0,maxDz=0;
    for(const e of events){
      this.update(e.stage!==1?e.n.s:toBeat(e.sec,e.n.s),beatToSec,1/fps,true);
      if(e.stage===2){const r=this.measureRelease(e.n);released.push(r);if(!r.clear)misses.push({...r,stage:2});continue;}
      const r=this.measureContact(e.n);checked++;
      maxDx=Math.max(maxDx,Math.abs(r.dx));maxDy=Math.max(maxDy,Math.abs(r.dy));maxDz=Math.max(maxDz,Math.abs(r.dz));
      if(r.miss)misses.push({...r,stage:e.stage});
    }
    this.setSong(saved.notes,saved.pedal);this.update(saved.beat,beatToSec,0,false);
    return {notes:timed.length,checked,misses,maxDx,maxDy,maxDz,released};
  }

  poseAt(beat,beatToSec) {
    for(const hand of Object.values(this.hands))for(const f of hand.fingers){f.exactPose=null;f.spread=0;f.press=0;}
    this._eyeLook.set(0,KEY_TOP_Y,-.05);
    this.closeTarget=this.closeMode==="auto"?"right":this.closeMode;
    this._closeDwell=1;this._closePending=null;this._closeWait=0;
    this._cameraSnap=true;this.update(beat,beatToSec,1,true);this._cameraSnap=false;
    return this.handState;
  }

  _updateKeys(dt) {
    const pn = this.piano;
    const pedalChanged = Math.abs(this.pedalAmt - this._lastPedalAmt) > 1e-3;
    let mechDirty = false;
    for (const k of Object.values(pn.keys)) {
      const prev = k.press;
      k.press = k.target;
      const moving = Math.abs(k.press - prev) > 1e-4 || k.press > 1e-3;
      if (!moving && !k.dirty && !pedalChanged) continue;
      k.dirty = moving;
      k.pivot.rotation.x = Math.atan(KEY_DIP / (k.black ? BLACK_L : WHITE_L)) * k.press;
      updateKeyIndicator(k);   // 押した鍵は金色に灯る
      const swing = Math.min(1, k.press * 1.4);
      const lift = k.hasDamper ? Math.max(k.press, this.pedalAmt) * 0.012 : 0.02;
      this._placeMechanics(k, swing, lift);
      mechDirty = true;
    }
    if (!this._damperInit) { for (const k of Object.values(pn.keys)) this._placeMechanics(k, 0, k.hasDamper ? 0 : 0.02); this._damperInit = true; mechDirty = true; }
    if (mechDirty) pn.hammers.instanceMatrix.needsUpdate = pn.hammerShank.instanceMatrix.needsUpdate = pn.dampers.instanceMatrix.needsUpdate = pn.damperHead.instanceMatrix.needsUpdate = true;
    this._lastPedalAmt = this.pedalAmt;
  }

  _placeMechanics(k, swing, lift) {
    const pn = this.piano, tmp = pn.tmp, x = keyX(k.idx + LOW);
    tmp.position.set(x, pn.STRING_Y - 0.075 + swing * 0.06, pn.HAMMER_Z); tmp.rotation.set(-0.9 + swing * 0.85, 0, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); pn.hammers.setMatrixAt(k.idx, tmp.matrix);
    tmp.position.set(x, pn.STRING_Y - 0.12 + swing * 0.03, pn.HAMMER_Z + 0.03); tmp.rotation.set(-0.7 + swing * 0.85, 0, 0); tmp.updateMatrix(); pn.hammerShank.setMatrixAt(k.idx, tmp.matrix);
    tmp.position.set(x, pn.STRING_Y + 0.008 + lift, pn.DAMPER_Z); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); pn.dampers.setMatrixAt(k.idx, tmp.matrix);
    tmp.position.set(x, pn.STRING_Y + 0.03 + lift, pn.DAMPER_Z); tmp.updateMatrix(); pn.damperHead.setMatrixAt(k.idx, tmp.matrix);
  }

  update(beat, beatToSec, dt, playing) {
    const B = this.bones; const pn = this.piano;
    const nowSec = beatToSec(beat);
    this.t = nowSec; this._lastBeat = beat;
    // Cache note times and contact assignments. A tempo edit invalidates the plan.
    const tempoKey = [beatToSec(1), beatToSec(this.notesRef.at(-1)?.s ?? 0)].join(":");
    if (!this.motion || this._motionTempo !== tempoKey) {
      this.robot.position.x=0;
      B.LowerBack.rotation.set(.07,0,0);B.Spine.rotation.set(.056,0,0);B.Spine1.rotation.set(.028,0,0);
      this.robot.updateMatrixWorld(true);
      this.motion = buildMotion(this.notesRef, beatToSec, {keyX, fingerOffsetX, palmFor:(h,list)=>this._palmFor(h,list),fitPalm:(h,g)=>this._fitPalm(h,g),canHold:(h,n,p)=>this._canHold(h,n,p)});
      this._motionTempo = tempoKey;
      const events=this.pedalRef.flatMap(p=>[{sec:beatToSec(p.s),target:1},{sec:beatToSec(p.s+p.d),target:0}]).sort((a,b)=>a.sec-b.sec||a.target-b.target);
      let value=0,target=0,time=0;this._pedalTimeline=[];
      for(const e of events){value=target+(value-target)*Math.exp(-14*(e.sec-time));time=e.sec;target=e.target;this._pedalTimeline.push({...e,value});}
    }
    const poses = {L:motionAt(this.motion,"L",nowSec),R:motionAt(this.motion,"R",nowSec)};
    const active = {L:poses.L?.contacts??[],R:poses.R?.contacts??[]};
    const timed=this.motion.notes;
    let lo=0,hi=timed.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(timed[mid]._s<nowSec-.9)lo=mid+1;else hi=mid;}
    this._nearNotes=[];
    for(let i=lo;i<timed.length&&timed[i]._s<nowSec+.6;i++)this._nearNotes.push(timed[i]);
    let accent=0,bodyEnergy=0,nod=0;
    for(const n of this._nearNotes){const age=nowSec-n._s;if(age<0)continue;const pulse=(1-Math.exp(-age*40))*Math.exp(-age*5)*n.v/127;bodyEnergy+=pulse;nod=Math.max(nod,pulse);if(age<.06)accent=Math.max(accent,n.v/127);}
    // ペダルと右足
    const pd = playing && this.pedalRef.some((p) => beat >= p.s - 1e-6 && beat < p.s + p.d - 1e-6);
    this.pedalDown = pd;
    let pedalEdge=null;
    for(const event of this._pedalTimeline){if(event.sec>nowSec)break;pedalEdge=event;}
    this.pedalAmt=playing&&pedalEdge?pedalEdge.target+(pedalEdge.value-pedalEdge.target)*Math.exp(-14*(nowSec-pedalEdge.sec)):0;
    pn.pedals[2].rotation.x = this.pedalAmt * 0.14;
    B.RightFoot.rotation.x = 0.42 - 0.08 + this.pedalAmt * 0.14;
    // 鍵・ハンマー・ダンパー
    for (const k of Object.values(pn.keys)) k.target = 0;
    // 体
    this.robot.position.x=clamp(((poses.L?.palm.x??0)+(poses.R?.palm.x??0))*.24,-.14,.14);
    this.energy = clamp(bodyEnergy*.42,0,1.2);
    this.headNod = nod;
    const sway = Math.sin(this.t * 0.9) * 0.03 * (0.4 + this.energy) + Math.sin(this.t * 0.37) * 0.015;
    const lean = 0.10 + this.energy * 0.12;
    B.LowerBack.rotation.set(lean * 0.5, 0, sway * 0.5);
    B.Spine.rotation.set(lean * 0.4, sway * 0.3, sway * 0.5);
    B.Spine1.rotation.set(lean * 0.2, 0, sway * 0.3);
    const cx = ((poses.L?.palm.x??this.handState.L.x) + (poses.R?.palm.x??this.handState.R.x)) / 2;
    B.Neck1.rotation.set(0.1, 0, 0);
    B.Head.rotation.set(0.42 + this.headNod * 0.18 + Math.sin(this.t * 1.3) * 0.015, clamp(cx * 0.9, -0.5, 0.5), -sway * 0.5);
    this.robotParts.visor.emissiveIntensity = 1.6 + this.energy * 1.4 + this.headNod * 2;
    this.robotParts.core.material.emissiveIntensity = 3 + Math.sin(this.t * 3) * 0.6 + this.energy * 2;
    this.robot.updateMatrixWorld(true);

    // 鍵を沈める (音の始まりと同時)。指はこのあと、沈んだ鍵の上面に合わせて置く
    for(const n of this.motion.notes) {
      if(n._visualRelease)continue;
      if(nowSec<n._s-1e-7 || nowSec>n._release+.45)continue;
      const k=pn.keys[n.p];if(k)k.target=Math.max(k.target,(.7+.3*n.v/127)*Math.exp(-16*Math.max(0,nowSec-n._release)));
    }
    this._updateKeys(dt);

    const FI = (n) => n._f ?? clamp((n.f ?? 3) - 1, 0, 4);

    // 手と指
    // Palm position comes from the score-time path, not the previous frame.
    for (const h of ["L", "R"]) {
      const st = this.handState[h];
      const side = h === "L" ? "Left" : "Right";
      const hand = this.hands[side];
      const pose=poses[h];
      const list=pose?.contacts??[];
      const readyNotes=pose?.ready??[];
      const inList=new Set(list);

      if(pose){st.x=pose.palm.x;st.z=pose.palm.z;}
      const palmY=(pose?.palm.y??KEY_TOP_Y+.044)+(pose?.lift??0);
      st.y=palmY;
      // 前のフレームの「手のずらし」を戻してから腕を解く
      hand.bone.position.copy(hand.restPos);
      this._solveArm(side, new THREE.Vector3(st.x, st.y, st.z + 0.85 * ROBOT_SCALE), dt);
      hand.bone.updateMatrixWorld(true);
      const pressing = new Map();
      for (const n of active[h]) if (inList.has(n)) pressing.set(FI(n), n);
      const ready = new Map();
      for(const n of readyNotes)if(!pressing.has(FI(n)))ready.set(FI(n),n);
      const nextByF = new Map();
      for(const n of pose?.next?.notes??[])if(!nextByF.has(FI(n)))nextByF.set(FI(n),n);
      const exactList = [];
      hand.fingers.forEach((f, i) => {
        const n = pressing.get(i) ?? ready.get(i) ?? nextByF.get(i);
        const p = pressing.has(i) ? 1 : ready.has(i) ? 0.4 : nextByF.has(i) ? 0.2 : 0;
        f.press = p;
        // まず「だいたいの形」(休んでいる指もこの形)
        const keyTop = n && isBlack(n.p) ? BLACK_TOP_Y : KEY_TOP_Y;
        const restDrop = clamp((palmY - keyTop - 0.018) / f.lenM, 0, 0.95), pressDrop = clamp((palmY - keyTop + 0.006) / f.lenM, 0, 0.98);
        const ang = Math.asin(lerp(restDrop, pressDrop, f.press));
        f.root.rotation.z = hand.sgn * -(ang * 0.75);
        f.joint.rotation.z = hand.sgn * -(ang * 0.45 + 0.1);
        let shift = 0;
        if (n) shift = keyX(n.p) - (st.x + fingerOffsetX(h, i));
        const target = clamp(shift / Math.max(0.03, f.lenM * 0.9), -0.8, 0.8);
        f.spread = target;
        f.root.rotation.y = -Math.asin(f.spread);
        // 鳴っている音・すぐ鳴る音の指は、指先を鍵の上にぴったり合わせる
        if (n && (pressing.has(i) || ready.has(i))) exactList.push({ f, n, i, hover: pressing.has(i) ? 0 : 0.016 * (1 - Math.min(1, f.press / 0.4)) + 0.004 });
        else f.exactPose = null;
      });
      for(const e of exactList) {
        const k=pn.keys[e.n.p];
        if(pressing.has(e.i)&&pose.group.fingerPoses?.[e.i])e.f.exactPose=pose.group.fingerPoses[e.i];
        this._placeFinger(hand,e.f,e.n.p,k?k.press:0,e.hover);
      }
    }


    this._updateCameras(poses,nowSec,dt,sway,beatToSec);
  }

  // 寄り・目線・全体のカメラ。毎コマの光線判定や境界箱の計算はしない (処理落ちの原因だった)。
  // 動きは「ゆっくり・少なく」: 狙いは時定数 2 秒でなめらかに、10cm 未満のずれは追わない、寄る相手の切り替えは 6 秒以上あけて 1.2 秒迷ってから。
  _updateCameras(poses,sec,dt,sway,toSec) {
    const snap=this._cameraSnap;
    const ease=(tau)=>snap?1:1-Math.exp(-Math.max(0,dt)/tau);
    const stats={};
    for(const h of ["L","R"]) {
      const ns=this._nearNotes.filter(n=>(n.h==="L"?"L":"R")===h&&n._s>=sec-.6&&n._s<sec+.6);
      const mean=ns.reduce((a,n)=>a+n.p,0)/Math.max(1,ns.length);
      const strength=ns.reduce((a,n)=>a+n.v/127,0)/Math.sqrt(Math.max(1,ns.length));
      const pose=poses[h];
      stats[h]={score:strength*(.65+clamp((mean-45)/45,0,1)),x:pose?.palm.x??(h==="L"?-.2:.2),chord:pose?.contacts.length??0};
    }
    const L=stats.L,R=stats.R,spread=Math.abs(R.x-L.x);
    // 主役の手の判定は 3 秒の時定数でならしてから (小節ごとにころころ変えない)
    this._melody=this._melody??0;
    this._melody+=((L.score-R.score)-this._melody)*ease(3);
    let want=this.closeMode;
    if(want==="auto"){
      const cur=this.closeTarget;
      want=this._melody>.35?"left":this._melody<-.35?"right":(cur==="left"||cur==="right")?cur:"both";
      if(spread>.46)want="both";
    }
    if(want==="pedal"&&this.closeMode==="auto")want="both";
    this._closeDwell=(this._closeDwell??0)+dt;
    if(snap||this.closeMode!=="auto")this.closeTarget=want;
    else if(want!==this.closeTarget){
      if(this._closePending!==want){this._closePending=want;this._closeWait=0;}
      this._closeWait+=dt;
      if(this._closeWait>=1.2&&this._closeDwell>=6){this.closeTarget=want;this._closeDwell=0;this._closePending=null;}
    }else{this._closePending=null;this._closeWait=0;}
    const mode=this.closeTarget;
    // 指先の広がり (今の姿勢から。手のひらの中心だけだと、伸ばした指が端に出る)
    let tipLo=Infinity,tipHi=-Infinity;
    for(const h of (mode==="left"?["Left"]:mode==="right"?["Right"]:["Left","Right"]))for(const f of this.hands[h].fingers){const x=f.tip.getWorldPosition(V(0,0,0)).x;if(x<tipLo)tipLo=x;if(x>tipHi)tipHi=x;}
    const cxRaw=(tipLo+tipHi)/2, spanRaw=Math.max(mode==="both"?.42:.34,(tipHi-tipLo)+.18);
    // 狙う点はゆっくり追う (6cm 未満のずれは追わない、時定数 2 秒)。指先が画面から出そうなときだけ速く追う
    if(this._closeAnchorX==null||snap)this._closeAnchorX=cxRaw;
    // 「急ぎ」は前のコマで指先が画面の端から出ていたときだけ (下の投影の判定が決める)。ふだんはゆっくり
    const urgent=!!this._closeUrgent;
    if(urgent)this._closeAnchorX+=(cxRaw-this._closeAnchorX)*ease(.3);
    else if(Math.abs(cxRaw-this._closeAnchorX)>.06)this._closeAnchorX+=(cxRaw-this._closeAnchorX)*ease(2);
    const cx=clamp(this._closeAnchorX,-.55,.55);
    // 幅: 広げるのは速く (指が端に出ないように)、寄せるのはゆっくり (酔わないように)
    this._closeSpan=this._closeSpan==null||snap?spanRaw:this._closeSpan+(spanRaw-this._closeSpan)*ease(spanRaw>this._closeSpan?.15:4);
    // (急ぎの旗は下の投影の判定で決める)
    // 位置と角度は v4 まで使っていた物 (頭の前・上から見下ろす)。手の中心 cx だけをゆっくり追う。両手が大きく離れたときは少し引く
    const pull=Math.max(0,this._closeSpan-.48)*.8;
    let look=V(cx*.85,KEY_TOP_Y-.02,-.07);
    const narrow=1; // 縦長の画面では距離は変えず、画角だけ広げる (引きすぎると手が小さくなる)
    const wantFov=Math.min(64,32*Math.max(1,1.6/Math.max(.4,this.camHands.aspect)));
    if(Math.abs(this.camHands.fov-wantFov)>.01){this.camHands.fov=wantFov;this.camHands.updateProjectionMatrix();}
    let position=look.clone().add(V(-.05*cx,.405+pull*.6,.37+pull*.5).multiplyScalar(narrow));
    if(mode==="pedal"){position=V(.95,1.02,.60);look=V(.04,.40,.02);}
    if(this.closeMode!=="manual"){
      if(snap||!this._closePos){this._closePos=(this._closePos??V(0,0,0)).copy(position);this._closeLook=(this._closeLook??V(0,0,0)).copy(look);}
      else{
        const a=ease(this._closeUrgent?.25:mode==="pedal"?1.2:2.0); // 指が端に出そうなときだけ速く動く
        this._closePos.lerp(position,a);this._closeLook.lerp(look,a);
        // 速さの上限 (酔わないように): カメラは 1 秒に 8cm まで
        const maxStep=(this._closeUrgent?.80:.08)*Math.max(0,dt); // ふだんは 1 秒に 8cm。指が端に出そうなときだけ速く
        const dv=this._closePos.clone().sub(this._prevClosePos??this._closePos);
        if(dv.length()>maxStep){this._closePos.copy(this._prevClosePos).addScaledVector(dv.normalize(),maxStep);}
      }
      this._prevClosePos=(this._prevClosePos??V(0,0,0)).copy(this._closePos);
    }
    this.camHands.position.copy(this._closePos);this.camHands.lookAt(this._closeLook);
    // それでも指先が画面の端から出るなら、その場で引く (引く動きは酔わない。寄り戻しはふだんの遅さで)
    if(this.closeMode!=="manual"&&mode!=="pedal"&&tipLo<Infinity){
      const tips=[];for(const h of (mode==="left"?["Left"]:mode==="right"?["Right"]:["Left","Right"]))for(const f of this.hands[h].fingers)tips.push(f.tip.getWorldPosition(V(0,0,0)));
      let widened=false,budget=snap?Infinity:1.0*Math.max(1/120,dt),lookBudget=snap?Infinity:.6*Math.max(1/120,dt); // 1 コマに引ける量の合計 (1 秒に 1m まで。撮影の瞬間は上限なし)。足りない分は次のコマで続ける
      for(let k=0;k<5&&budget>1e-5;k++){
        this.camHands.updateMatrixWorld(true);
        const out=tips.some(t=>{const p=t.clone().project(this.camHands);return Math.abs(p.x)>.94||Math.abs(p.y)>.94;});
        if(!out)break; widened=true;
        const off=this._closePos.clone().sub(this._closeLook),grow=Math.min(off.length()*.12,budget);budget-=grow;
        off.setLength(off.length()+grow);
        const shift=clamp((cxRaw-this._closeLook.x)*.5,-lookBudget,lookBudget);lookBudget-=Math.abs(shift);
        this._closePos.copy(this._closeLook).add(off);this._closeLook.x+=shift;
        this.camHands.position.copy(this._closePos);this.camHands.lookAt(this._closeLook);
      }
      if(this._prevClosePos)this._prevClosePos.copy(this._closePos);
      this._closeUrgent=widened;
    } else this._closeUrgent=false;
    // 目線カメラ: 主役の手のあたりをゆっくり見る
    const eyePos=V(0,0,0);this.robotParts.eye.getWorldPosition(eyePos);
    this._eyeLook.lerp(V(clamp(cx,-.5,.5),KEY_TOP_Y-.02,-.13),ease(1.5));
    this.camEye.position.copy(eyePos).add(V(0,.02,.02));this.camEye.lookAt(this._eyeLook);this.camEye.rotateZ(-sway*.35);
    // 全体カメラ: ゆっくり行き来。演奏者が収まる距離は 1 秒に 1 回だけ計算し、時定数 3 秒で寄せる (毎コマ合わせない)
    const o=this.orbit;
    if(o.auto){o.theta=.64+.38*Math.sin(sec*.045);o.phi=1.25+.025*Math.sin(sec*.031);}
    const wideDirection=V(Math.sin(o.phi)*Math.sin(o.theta),Math.cos(o.phi),Math.sin(o.phi)*Math.cos(o.theta));
    if(o.auto){
      if(snap||this._wideFitAt==null||sec-this._wideFitAt>=1||sec<this._wideFitAt){
        const head=V(0,0,0);this.bones.HeadEnd.getWorldPosition(head);
        const performer=[V(L.x,KEY_TOP_Y+.10,.05),V(R.x,KEY_TOP_Y+.10,.05),V(-.65,.72,-.17),V(.65,.72,-.17),V(0,.10,.70),V(0,.05,.45),head,head.clone().add(V(0,.12,0))];
        this._wideFit=this.frameDistance(this.camWide,o.target,wideDirection,performer,2.2);this._wideFitAt=sec;
      }
      this._wideRadius=this._wideRadius==null||snap?this._wideFit:this._wideRadius+(this._wideFit-this._wideRadius)*ease(3);
    } else this._wideRadius=o.radius;
    this.camWide.position.copy(o.target).addScaledVector(wideDirection,this._wideRadius);
    this.camWide.lookAt(o.target);
    this.cameraInfo={mode,requested:this.closeMode,jump:false,span:this._closeSpan,melody:this._melody>0?"L":"R",pedalEdge:false,subjects:mode==="left"?["L"]:mode==="right"?["R"]:["L","R"]};
  }

  // 切れの判定に使う点: 指先 5 本 (箱の角より現実的)
  handKeyPoints(subjects=["L","R"]) {
    const points=[];
    for(const h of subjects){const hand=this.hands[h==="L"?"Left":"Right"];for(const f of hand.fingers)points.push(f.tip.getWorldPosition(V(0,0,0)));} // 手首の丸みは画面の下端にかかってよいので指先だけ
    return points;
  }

  handFramePoints(subjects=["L","R"]) {
    const points=[];
    for(const h of subjects){
      const hand=this.hands[h==="L"?"Left":"Right"],box=new THREE.Box3().setFromObject(hand.bone);
      for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])points.push(V(x,y,z));
    }
    return points;
  }

  frameDistance(camera,look,direction,points,minDistance) {
    const right=V(0,1,0).cross(direction).normalize(),up=direction.clone().cross(right);
    const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanX=tanY*camera.aspect;
    let distance=minDistance;
    for(const point of points){const d=point.clone().sub(look);distance=Math.max(distance,d.dot(direction)+Math.abs(d.dot(right))/(tanX*.84),d.dot(direction)+Math.abs(d.dot(up))/(tanY*.84));}
    return distance;
  }

  chooseCloseAngle(look,points,subjects,current=null) {
    const camera=this._cameraProbe??=this.camHands.clone();camera.fov=this.camHands.fov;camera.aspect=this.camHands.aspect;camera.updateProjectionMatrix();
    const directions=[V(.28,.92,.12),V(-.28,.92,.12),V(0,1,-.35),V(0,1,-.50),V(.05,1,-.20),V(.05,1,.30),V(.4,1,-.4),V(-.4,1,-.4)].map(v=>v.normalize());
    if(current)directions.unshift(current);
    let best=null;const geometry={};
    for(const direction of directions){
      camera.position.copy(look).addScaledVector(direction,this.frameDistance(camera,look,direction,points,.54));camera.lookAt(look);
      const reports=this.keyVisibility(camera,subjects,geometry);
      const penalty=reports.reduce((a,k)=>a+(!k.inFrame?100:0)+(!k.tipVisible?20:0)+Math.max(0,3-k.visible)*12+Math.max(0,2-k.indicatorVisible)*6,0);
      if(!best||penalty<best.penalty)best={direction,penalty};
      if(!penalty)break;
    }
    return best.direction.clone();
  }

  // Cast through the real meshes, including both hands and the piano case.
  // One key is represented by a 3x3 patch of its exposed playing surface.
  keyVisibility(camera=this.camHands,subjects=this.cameraInfo?.subjects??["L","R"],geometry=null) {
    // Angle candidates share one frozen pose. Build its world bounds once,
    // without keeping stale bounds across animation frames or external calls.
    const meshes=geometry?.meshes??[];
    if(!geometry?.meshes){this.scene.updateMatrixWorld(true);this.scene.traverseVisible(o=>{if(o.isMesh){
      if(o.isInstancedMesh)o.computeBoundingBox();else if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
      meshes.push({object:o,box:(o.isInstancedMesh?o.boundingBox:o.geometry.boundingBox).clone().applyMatrix4(o.matrixWorld)});
    }});if(geometry)geometry.meshes=meshes;}
    camera.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(),origin=camera.getWorldPosition(V(0,0,0));
    const hitPoint=V(0,0,0),hits=(own=null)=>ray.intersectObjects(meshes.filter(({object,box})=>object!==own&&ray.ray.intersectBox(box,hitPoint)&&origin.distanceToSquared(hitPoint)<(ray.far+.002)**2).map(m=>m.object),false);
    const visible=(point,own)=>{
      const ndc=point.clone().project(camera),inside=Math.abs(ndc.x)<.96&&Math.abs(ndc.y)<.96&&Math.abs(ndc.z)<1;
      if(!inside)return {inside,clear:false};
      const dir=point.clone().sub(origin);ray.set(origin,dir.clone().normalize());ray.far=dir.length()-.0004;
      return {inside,clear:!hits(own).length};
    };
    const reports=[];
    for(const h of subjects)for(const n of motionAt(this.motion,h,this.t)?.contacts??[]) {
      const key=this.piano.keys[n.p],width=key.black?BLACK_W:WHITE_W,zs=key.black?[-.130,-.103,-.080]:[-.062,-.040,-.012];
      const samples=[];
      for(const dx of[-.27,0,.27])for(const z of zs){const dip=key.press*(KEY_DIP/(key.black?BLACK_L:WHITE_L))*(z-KEY_PIVOT_Z);samples.push(visible(V(keyX(n.p)+width*dx,(key.black?BLACK_TOP_Y:KEY_TOP_Y)-dip+.0006,z),key.mesh));}
      const finger=this.hands[h==="L"?"Left":"Right"].fingers[n._f],tip=finger.tip.getWorldPosition(V(0,0,0));
      // The last phalanx may cover its own contact pad from above. Seeing that
      // terminal link is seeing the fingertip; any other finger/hand is a blocker.
      const projected=tip.clone().project(camera),tipInFrame=Math.abs(projected.x)<.96&&Math.abs(projected.y)<.96;
      const dir=tip.clone().sub(origin);ray.set(origin,dir.clone().normalize());ray.far=dir.length()+TIP_R;
      const hit=hits()[0];let tipVisible=false;
      for(let o=hit?.object;o;o=o.parent)if(o===finger.joint){tipVisible=true;break;}
      const indicator=key.indicator,indicatorVisible=[-.3,0,.3].filter(x=>visible(indicator.light.localToWorld(V(indicator.width*x,indicator.height/2,0)),indicator.light).clear).length;
      reports.push({h,p:n.p,beat:n.s,visible:samples.filter(s=>s.clear).length,samples:samples.length,inFrame:samples.every(s=>s.inside),tipVisible:tipInFrame&&tipVisible,indicatorVisible});
    }
    return reports;
  }

  setShot(view=null) {
    this.shotCamera=null;
    if(view===null){this._resize();return;}
    if(["left","right","both","keys"].includes(view)){this.setClose(view==="keys"?"auto":view);this.shotCamera=this.camHands;}
    else if(view==="pedal"){this.camDetail.position.set(.56,.39,.75);this.camDetail.lookAt(.055,.10,.03);this.shotCamera=this.camDetail;}
    else {this.setView(view==="full"?"wide":view);this.shotCamera=view==="eye"?this.camEye:this.camWide;}
    this.shotCamera.aspect=this.w/this.h;this.shotCamera.updateProjectionMatrix();
  }

  render() {
    const r = this.renderer;
    this.needsRender = false;
    if (this.shotCamera) { r.setScissorTest(false); r.setViewport(0,0,this.w,this.h); r.render(this.scene,this.shotCamera); return; }
    const main = this.view === "eye" ? this.camEye : this.camWide;
    r.setScissorTest(true);
    const [mx, my, mw, mh] = this.rects.main; r.setViewport(mx, my, mw, mh); r.setScissor(mx, my, mw, mh); r.render(this.scene, main);
    const [hx, hy, hw, hh] = this.rects.hands; r.setViewport(hx, hy, hw, hh); r.setScissor(hx, hy, hw, hh); r.render(this.scene, this.camHands);
    r.setScissorTest(false);
  }
}
