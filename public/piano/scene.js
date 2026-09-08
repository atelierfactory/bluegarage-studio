// ═══════════ VESPER-01 がグランドピアノを弾く 3D 舞台 (three.js) ═══════════
// 上の画面: ピアノ全体と座った VESPER。下の画面: 鍵盤と両手のアップ。
// 音符 (p, s, d, v, h, f) とペダル区間から、手の位置・指の押し込み・鍵の沈み・体の揺れ・足のペダルを毎フレーム計算する。
// ロボットの見た目は product/toys/3D_model の VESPER-01 (buildRobot) と同じ部品構成。

import * as THREE from "three";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

/* ─────────── 鍵盤の寸法 (m) ─────────── */
const WHITE_W = 0.0235, WHITE_L = 0.148, BLACK_W = 0.0135, BLACK_L = 0.092, KEY_H = 0.012;
const LOW = 21, HIGH = 108;
const isBlack = (p) => [1, 3, 6, 8, 10].includes(p % 12);
// 白鍵の番号 (A0=0) と x 座標
const whiteIndex = (p) => { let k = 0; for (let q = LOW; q < p; q++) if (!isBlack(q)) k++; return k; };
const N_WHITE = whiteIndex(HIGH) + 1;
const KEYS_X0 = -(N_WHITE * WHITE_W) / 2;
export function keyX(p) {
  if (!isBlack(p)) return KEYS_X0 + (whiteIndex(p) + 0.5) * WHITE_W;
  // 黒鍵: 左隣の白鍵と右隣の白鍵の境目を基準に、実物に合わせて少しずらす
  const boundary = KEYS_X0 + (whiteIndex(p - 1) + 1) * WHITE_W;
  const shift = { 1: -0.12, 3: 0.12, 6: -0.18, 8: 0, 10: 0.18 }[p % 12] * WHITE_W;
  return boundary + shift;
}
const KEY_TOP_Y = 0.735;   // 白鍵の上面の高さ
const KEY_FRONT_Z = 0.0;   // 鍵盤の手前の縁 (奏者側が +z)

/* ─────────── ロボット (VESPER-01) の材質 ─────────── */
const M = {
  shell: new THREE.MeshPhysicalMaterial({ color: 0xdfe4ec, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 }),
  carbon: new THREE.MeshPhysicalMaterial({ color: 0x111318, roughness: 0.45, metalness: 0.65 }),
  chrome: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.07, metalness: 1.0 }),
  gun: new THREE.MeshPhysicalMaterial({ color: 0x3a3f4a, roughness: 0.28, metalness: 0.9 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x061a22, emissive: 0x35e6ff, emissiveIntensity: 3.5, roughness: 0.4 }),
  glowO: new THREE.MeshStandardMaterial({ color: 0x221006, emissive: 0xff7a1a, emissiveIntensity: 3.0, roughness: 0.4 }),
  visor: new THREE.MeshPhysicalMaterial({ color: 0x030507, roughness: 0.05, metalness: 0.2, clearcoat: 1, emissive: 0x1de0ff, emissiveIntensity: 2.0 }),
};
const P = {
  lacquer: new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }),
  lacquerIn: new THREE.MeshPhysicalMaterial({ color: 0x141416, roughness: 0.3, metalness: 0.05, clearcoat: 0.6 }),
  ivory: new THREE.MeshPhysicalMaterial({ color: 0xf4efe2, roughness: 0.35, metalness: 0, clearcoat: 0.4 }),
  ebony: new THREE.MeshPhysicalMaterial({ color: 0x141210, roughness: 0.3, metalness: 0.1, clearcoat: 0.8 }),
  gold: new THREE.MeshPhysicalMaterial({ color: 0xd8b25a, roughness: 0.25, metalness: 1.0 }),
  felt: new THREE.MeshStandardMaterial({ color: 0x7a1f2b, roughness: 0.95 }),
  brass: new THREE.MeshPhysicalMaterial({ color: 0xb08d3a, roughness: 0.3, metalness: 1 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b3a1e, roughness: 0.6 }),
  string: new THREE.MeshStandardMaterial({ color: 0xc9c9c9, roughness: 0.4, metalness: 0.9 }),
  floor: new THREE.MeshPhysicalMaterial({ color: 0x1a120c, roughness: 0.35, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
  bench: new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, roughness: 0.2, clearcoat: 1 }),
  cushion: new THREE.MeshStandardMaterial({ color: 0x3a1c22, roughness: 0.9 }),
};

function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }
function limb(parent, a, b, rTop, rBot, mat, seg = 20, capsule = false) {
  const dir = b.clone().sub(a); const len = dir.length();
  const g = capsule ? new THREE.CapsuleGeometry(rTop, Math.max(0.01, len - rTop * 2), 6, seg) : new THREE.CylinderGeometry(rTop, rBot, len, seg, 1);
  const mesh = shadowed(new THREE.Mesh(g, mat));
  const holder = new THREE.Object3D();
  holder.position.copy(a).add(b).multiplyScalar(0.5);
  holder.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  holder.add(mesh); parent.add(holder); return holder;
}
function sphere(parent, p, r, mat, seg = 24) { const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat)); m.position.copy(p); parent.add(m); return m; }
function box(parent, p, s, mat, rot) { const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), mat)); m.position.copy(p); if (rot) m.rotation.set(rot.x, rot.y, rot.z); parent.add(m); return m; }
function strip(holder, len, r, mat, angle = 0, w = 0.16, thick = 0.05) {
  const g = new THREE.BoxGeometry(w, len * 0.62, thick); const m = new THREE.Mesh(g, mat);
  m.position.set(Math.sin(angle) * r, 0, Math.cos(angle) * r); m.rotation.y = angle; holder.add(m); return m;
}

/* ─────────── 骨組み (BVH と同じ名前・単位は「ロボット単位」。全体を ROBOT_SCALE で m に) ─────────── */
const ROBOT_SCALE = 0.061;
const SKELETON = {
  Hips: [0, 0, 0],
  LowerBack: [0, 0.4, 0], Spine: [0, 2.0, 0], Spine1: [0, 2.3, 0], Neck1: [0, 2.7, 0], Head: [0, 1.4, 0], HeadEnd: [0, 2.4, 0],
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
function buildSkeleton() {
  const bones = {};
  for (const [name, pos] of Object.entries(SKELETON)) { const b = new THREE.Bone(); b.name = name; b.position.set(...pos); b.isBone = true; bones[name] = b; }
  for (const [name, parent] of Object.entries(PARENT)) bones[parent].add(bones[name]);
  return bones;
}

// 3D_model/balance_mimic_v1.html の buildRobot と同じ部品 (手だけはピアノ用に指付きに差し替え)
function buildRobot(B, hands) {
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
  limb(B.Neck1, V(0, 0, 0), off("Neck1"), 0.4, 0.5, M.carbon, 16);
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
  return { visor, core };
}

// ピアノ用の手: 手のひら + 5 本の指 (2 関節)。手の骨の +x (左手) / -x (右手) 方向に指が伸びる
// 指の並びは手のひらの幅方向 (骨の z 軸) に沿う。親指 (1) は体の内側。
const FINGER_LEN = [1.0, 1.55, 1.7, 1.55, 1.25];   // 親指→小指 (ロボット単位)
const FINGER_Z = [-0.95, -0.48, 0, 0.48, 0.95];    // 手のひら上の位置 (右手基準。左手は反転)
export const FINGER_SPREAD_M = FINGER_Z.map((z) => z * ROBOT_SCALE); // m
function buildHand(H, sgn) {
  // sgn = +1 左手 (骨は +x に伸びる), -1 右手
  const palm = box(H, V(sgn * 0.9, 0, 0), V(1.7, 0.42, 2.1), M.carbon);
  box(H, V(sgn * 0.9, 0.24, 0), V(1.4, 0.18, 1.9), M.shell);
  const fingers = [];
  for (let i = 0; i < 5; i++) {
    const root = new THREE.Object3D(); root.position.set(sgn * (i === 0 ? 1.2 : 1.75), i === 0 ? -0.15 : 0, FINGER_Z[i] * sgn); H.add(root);
    const len = FINGER_LEN[i];
    const seg1 = limb(root, V(0, 0, 0), V(sgn * len * 0.55, 0, 0), 0.17, 0.15, M.shell, 10, true);
    const joint = new THREE.Object3D(); joint.position.set(sgn * len * 0.55, 0, 0); root.add(joint);
    const seg2 = limb(joint, V(0, 0, 0), V(sgn * len * 0.45, 0, 0), 0.14, 0.11, M.gun, 10, true);
    const tip = new THREE.Object3D(); tip.position.set(sgn * len * 0.45, -0.1, 0); joint.add(tip);
    fingers.push({ root, joint, tip, len, press: 0, target: 0 });
  }
  return { bone: H, sgn, fingers, palm };
}

/* ─────────── グランドピアノ ─────────── */
function buildPiano(scene) {
  const g = new THREE.Group();
  const W = 1.52, DEPTH = 1.95, RIM_H = 0.26, TOP_Y = 0.98;     // 本体
  // 胴体 (ケース): 手前は真っ直ぐ、奥は丸い → 箱 + 円柱で近似
  const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W, RIM_H, DEPTH * 0.62), P.lacquer)); body.position.set(0, TOP_Y - RIM_H / 2, -0.16 - DEPTH * 0.31); g.add(body);
  const tail = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(W * 0.42, W * 0.42, RIM_H, 48, 1, false, Math.PI, Math.PI), P.lacquer)); tail.position.set(-W * 0.08, TOP_Y - RIM_H / 2, -0.16 - DEPTH * 0.62); tail.rotation.y = Math.PI; g.add(tail);
  const bass = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, RIM_H, DEPTH * 0.35), P.lacquer)); bass.position.set(-W * 0.25, TOP_Y - RIM_H / 2, -0.16 - DEPTH * 0.62 - DEPTH * 0.1); g.add(bass);
  // 響板 (内側) と弦
  const board = new THREE.Mesh(new THREE.BoxGeometry(W - 0.08, 0.02, DEPTH * 0.6), P.wood); board.position.set(0, TOP_Y - RIM_H + 0.06, -0.16 - DEPTH * 0.31); g.add(board);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.015, DEPTH * 0.55), P.gold); frame.position.set(0, TOP_Y - RIM_H + 0.09, -0.16 - DEPTH * 0.3); g.add(frame);
  for (let i = 0; i < 60; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.0015, DEPTH * (0.3 + 0.28 * (1 - i / 60))), P.string); s.position.set(-W * 0.44 + i * (W * 0.88 / 60), TOP_Y - RIM_H + 0.12, -0.16 - DEPTH * 0.18 - DEPTH * (0.14 * (1 - i / 60))); g.add(s); }
  // 屋根 (lid) — 開いている
  const lid = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W, 0.03, DEPTH * 0.92), P.lacquer)); lid.position.set(0, TOP_Y + 0.015, -0.16 - DEPTH * 0.46);
  const lidPivot = new THREE.Object3D(); lidPivot.position.set(W / 2, TOP_Y, -0.16 - DEPTH * 0.46); lidPivot.rotation.z = -0.95; lid.position.set(-W / 2, 0.015, 0); lidPivot.add(lid); g.add(lidPivot);
  const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 10), P.lacquer); prop.position.set(-W * 0.32, TOP_Y + 0.3, -0.16 - DEPTH * 0.55); prop.rotation.z = 0.3; g.add(prop);
  // 鍵盤の棚 (keybed) と手前の腕木
  const keybed = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, 0.42), P.lacquer)); keybed.position.set(0, KEY_TOP_Y - KEY_H - 0.03, -0.05); g.add(keybed);
  [-1, 1].forEach((s) => { const cheek = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.44), P.lacquer)); cheek.position.set(s * (W / 2 - 0.055), KEY_TOP_Y + 0.05, -0.05); g.add(cheek); });
  const fallboard = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W - 0.22, 0.26, 0.05), P.lacquer)); fallboard.position.set(0, KEY_TOP_Y + 0.12, -0.19); g.add(fallboard);
  const logo = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.003), P.gold); logo.position.set(0, KEY_TOP_Y + 0.17, -0.163); g.add(logo);
  const desk = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.28, 0.02), P.lacquer)); desk.position.set(0, TOP_Y + 0.16, -0.45); desk.rotation.x = -0.25; g.add(desk);
  const lip = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W - 0.22, 0.03, 0.04), P.lacquer)); lip.position.set(0, KEY_TOP_Y - 0.02, 0.09); g.add(lip);
  // 脚 3 本 + キャスター
  for (const [x, z] of [[W / 2 - 0.1, 0.05], [-W / 2 + 0.1, 0.05], [-W * 0.15, -0.16 - DEPTH * 0.9]]) {
    const leg = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.11, KEY_TOP_Y - 0.1, 0.11), P.lacquer)); leg.position.set(x, (KEY_TOP_Y - 0.1) / 2, z); g.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 16), P.brass); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.035, z); g.add(wheel);
  }
  // ペダル (リラ)
  const lyre = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.05), P.lacquer)); lyre.position.set(0, 0.3, 0.02); g.add(lyre);
  const pedalBase = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.14), P.lacquer); pedalBase.position.set(0, 0.04, 0.1); g.add(pedalBase);
  const pedals = [];
  [-0.08, 0, 0.08].forEach((x) => { const pv = new THREE.Object3D(); pv.position.set(x, 0.06, 0.05); const pd = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.11), P.brass); pd.position.set(0, 0, 0.055); pv.add(pd); g.add(pv); pedals.push(pv); });
  // 鍵盤
  const keys = {};
  for (let p = LOW; p <= HIGH; p++) {
    const black = isBlack(p);
    const pivot = new THREE.Object3D();
    pivot.position.set(keyX(p), black ? KEY_TOP_Y + 0.004 : KEY_TOP_Y - KEY_H / 2, -WHITE_L + 0.005); // 奥側を支点に沈む
    const geo = black ? new THREE.BoxGeometry(BLACK_W, KEY_H * 0.9, BLACK_L) : new THREE.BoxGeometry(WHITE_W - 0.0012, KEY_H, WHITE_L);
    const mesh = shadowed(new THREE.Mesh(geo, black ? P.ebony : P.ivory));
    mesh.position.set(0, black ? KEY_H * 0.45 : 0, black ? BLACK_L / 2 : WHITE_L / 2);
    pivot.add(mesh); g.add(pivot);
    keys[p] = { pivot, mesh, black, press: 0 };
  }
  // 椅子
  const bench = new THREE.Group();
  const seat = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.34), P.bench)); seat.position.set(0, 0.47, 0.62); bench.add(seat);
  const cushion = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.035, 0.3), P.cushion)); cushion.position.set(0, 0.51, 0.62); bench.add(cushion);
  for (const [x, z] of [[-0.27, 0.48], [0.27, 0.48], [-0.27, 0.76], [0.27, 0.76]]) { const bl = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), P.bench)); bl.position.set(x, 0.225, z); bench.add(bl); }
  g.add(bench);
  scene.add(g);
  return { group: g, keys, pedals, lidPivot };
}

/* ─────────── 舞台 ─────────── */
export class PianoStage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07060a);
    this.scene.fog = new THREE.Fog(0x07060a, 6, 14);
    // 光: 暖かいキー光 + 青いリム + 環境
    this.scene.add(new THREE.HemisphereLight(0x8a7a66, 0x0a0806, 0.55));
    const key = new THREE.SpotLight(0xffe2b8, 90, 12, 0.6, 0.6, 1.4); key.position.set(1.8, 3.6, 2.2); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; this.scene.add(key); this.scene.add(key.target);
    const rim = new THREE.SpotLight(0x3fbfff, 40, 10, 0.7, 0.7, 1.4); rim.position.set(-2.2, 2.6, -1.8); this.scene.add(rim);
    const fill = new THREE.PointLight(0xffd9a0, 6, 5, 1.6); fill.position.set(0.4, 1.6, 1.4); this.scene.add(fill);
    const handLamp = new THREE.PointLight(0xfff2d8, 5, 2.2, 1.8); handLamp.position.set(0, 1.35, 0.25); this.scene.add(handLamp);
    // 床
    const floor = shadowed(new THREE.Mesh(new THREE.CircleGeometry(6, 64), P.floor)); floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.24, 96), new THREE.MeshBasicMaterial({ color: 0xc9a24a, transparent: true, opacity: 0.35 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; this.scene.add(ring);
    // ピアノ
    this.piano = buildPiano(this.scene);
    key.target.position.set(0, 0.8, 0);
    // ロボット
    this.bones = buildSkeleton();
    this.hands = {};
    this.robotParts = buildRobot(this.bones, this.hands);
    this.robot = new THREE.Group(); this.robot.scale.setScalar(ROBOT_SCALE);
    this.robot.add(this.bones.Hips);
    this.scene.add(this.robot);
    this.poseSeated();
    // カメラ
    this.camMain = new THREE.PerspectiveCamera(38, 1, 0.05, 30);
    this.camHands = new THREE.PerspectiveCamera(34, 1, 0.02, 10);
    this.t = 0; this.energy = 0; this.pedalDown = false; this.pedalAmt = 0;
    this.handState = { L: { x: keyX(48), y: 0, z: 0, ready: 0 }, R: { x: keyX(72), y: 0, z: 0, ready: 0 } };
    this.notesRef = []; this.pedalRef = [];
    this.headNod = 0; this.lastAccentT = -10;
    this._resize();
    new ResizeObserver(() => this._resize()).observe(canvas.parentElement);
  }

  _resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(64, Math.floor(r.width)), h = Math.max(64, Math.floor(r.height));
    this.renderer.setSize(w, h, false);
    this.w = w; this.h = h;
    this.split = Math.round(h * 0.58);
    this.camMain.aspect = w / this.split; this.camMain.updateProjectionMatrix();
    this.camHands.aspect = w / (h - this.split); this.camHands.updateProjectionMatrix();
  }

  /* ── 座った姿勢: 骨盤を椅子に、脚を曲げ、腕を鍵盤の上へ ── */
  poseSeated() {
    const B = this.bones;
    this.robot.position.set(0, 0.5 + 1.0 * ROBOT_SCALE, 0.62);   // 骨盤 (椅子の高さ + 少し)
    this.robot.rotation.y = Math.PI;                              // -z (ピアノ) を向く
    B.Hips.rotation.set(0, 0, 0);
    B.LowerBack.rotation.set(0.06, 0, 0);
    B.Spine.rotation.set(0.05, 0, 0);
    B.Spine1.rotation.set(0.02, 0, 0);
    B.Neck1.rotation.set(-0.05, 0, 0);
    B.Head.rotation.set(0.15, 0, 0);
    // 脚: 腿を前 (ロボットの +z が前), 膝を曲げ, 足を床へ
    for (const s of ["Left", "Right"]) {
      B[s + "UpLeg"].rotation.set(-Math.PI / 2 + 0.05, 0, (s === "Left" ? -1 : 1) * 0.08);
      B[s + "Leg"].rotation.set(Math.PI / 2 - 0.35, 0, 0);
      B[s + "Foot"].rotation.set(0.35 - 0.05, 0, 0);
    }
    // 腕は毎フレーム IK。肩の基準
    B.LeftShoulder.rotation.set(0, 0, -0.05); B.RightShoulder.rotation.set(0, 0, 0.05);
    this.robot.updateMatrixWorld(true);
    this.armLen = { upper: SKELETON.LeftForeArm[0] * ROBOT_SCALE, fore: SKELETON.LeftHand[0] * ROBOT_SCALE };
  }

  /* ── 曲を渡す (ノートは絶対拍 s, d, p, v, h, f) ── */
  setSong(notes, pedal) {
    this.notesRef = notes.slice().sort((a, b) => a.s - b.s);
    this.pedalRef = pedal ?? [];
    this.cursor = 0;
  }

  /* ── 2 本の骨の IK: 肩から手首の目標へ ── */
  _solveArm(side, target, dt) {
    const B = this.bones;
    const sgn = side === "Left" ? 1 : -1;
    const shoulder = B[side + "Arm"], elbow = B[side + "ForeArm"], hand = B[side + "Hand"];
    const S = new THREE.Vector3(); shoulder.getWorldPosition(S);
    const a = this.armLen.upper, b = this.armLen.fore;
    const D = target.clone().sub(S);
    let d = D.length(); const maxD = (a + b) * 0.985; if (d > maxD) { D.multiplyScalar(maxD / d); d = maxD; }
    d = Math.max(d, Math.abs(a - b) + 0.01);
    // 肘の角度 (余弦定理)
    const cosE = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const angE = Math.acos(cosE);
    const dirN = D.clone().normalize();
    // 肘を外・下・後ろへ向ける基準ベクトル (ピアニストは肘を少し外に)
    const pole = new THREE.Vector3(sgn * 0.55, -1, 0.35).normalize();
    const side1 = new THREE.Vector3().crossVectors(dirN, pole).normalize();
    const perp = new THREE.Vector3().crossVectors(side1, dirN).normalize().negate(); // pole 側
    const E = S.clone().add(dirN.clone().multiplyScalar(a * Math.cos(angE))).add(perp.multiplyScalar(a * Math.sin(angE)));
    // 上腕: 親 (Shoulder) 座標で local +x*sgn を (E-S) へ
    const setBone = (bone, from, to, restAxis) => {
      const parent = bone.parent; parent.updateWorldMatrix(true, false);
      const pq = new THREE.Quaternion(); parent.getWorldQuaternion(pq);
      const dirWorld = to.clone().sub(from).normalize();
      const dirLocal = dirWorld.applyQuaternion(pq.clone().invert());
      const q = new THREE.Quaternion().setFromUnitVectors(restAxis, dirLocal);
      bone.quaternion.slerp(q, Math.min(1, dt * 22));
      bone.updateMatrixWorld(true);
    };
    setBone(shoulder, S, E, new THREE.Vector3(sgn, 0, 0));
    const Ew = new THREE.Vector3(); elbow.getWorldPosition(Ew);
    setBone(elbow, Ew, target, new THREE.Vector3(sgn, 0, 0));
    // 手: 手のひらを下・指をピアノ (world -z) へ。手首の world 向きを直接決める
    hand.updateWorldMatrix(true, false);
    const pq = new THREE.Quaternion(); hand.parent.getWorldQuaternion(pq);
    // 手の local: 指は +x*sgn 方向。world で -z (ピアノへ) にしたい。手の local +y は world +y。
    const m = new THREE.Matrix4();
    const xAxis = new THREE.Vector3(0, 0, -sgn);      // local x → world (指の方向 = -z を sgn で符号)
    const yAxis = new THREE.Vector3(0, 1, 0);
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
    m.makeBasis(xAxis, yAxis, zAxis);
    const wq = new THREE.Quaternion().setFromRotationMatrix(m);
    const lq = pq.clone().invert().multiply(wq);
    hand.quaternion.slerp(lq, Math.min(1, dt * 18));
  }

  /* ── 毎フレーム ── */
  update(beat, beatToSec, dt, playing) {
    this.t += dt;
    const B = this.bones;
    const notes = this.notesRef;
    const nowSec = beatToSec(beat);
    // 進行中・直近の音を拾う (拍で ±)
    const LOOK = 0.35; // 秒: 先読み
    const active = { L: [], R: [] }, upcoming = { L: [], R: [] };
    let accent = 0;
    for (const n of notes) {
      const s = beatToSec(n.s), e = beatToSec(n.s + n.d);
      if (e < nowSec - 0.3) continue;
      if (s > nowSec + LOOK + 0.2) break;
      const h = n.h === "L" ? "L" : "R";
      if (s <= nowSec && nowSec < Math.max(e, s + 0.08)) { active[h].push(n); if (nowSec - s < 0.06) accent = Math.max(accent, n.v / 127); }
      else if (s > nowSec && s <= nowSec + LOOK) upcoming[h].push(n);
    }
    // 鍵の沈み
    for (const k of Object.values(this.piano.keys)) k.target = 0;
    for (const h of ["L", "R"]) for (const n of active[h]) { const k = this.piano.keys[n.p]; if (k) k.target = 0.6 + 0.4 * (n.v / 127); }
    for (const k of Object.values(this.piano.keys)) { k.press = lerp(k.press, k.target ?? 0, Math.min(1, dt * (k.target ? 40 : 14))); k.pivot.rotation.x = k.press * (k.black ? 0.05 : 0.045); }
    // ペダル
    const pd = this.pedalRef.some((p) => beat >= p.s - 1e-6 && beat < p.s + p.d - 1e-6) && playing;
    this.pedalDown = pd;
    this.pedalAmt = lerp(this.pedalAmt, pd ? 1 : 0, Math.min(1, dt * 14));
    this.piano.pedals[2].rotation.x = this.pedalAmt * 0.16;
    B.RightFoot.rotation.x = 0.3 + this.pedalAmt * 0.16 - 0.05;
    // 体の揺れ: 音のエネルギーを追う
    const density = active.L.length + active.R.length;
    this.energy = lerp(this.energy, clamp(density / 4 + accent * 0.6, 0, 1.2), Math.min(1, dt * 2.5));
    if (accent > 0.72) { this.lastAccentT = this.t; this.headNod = Math.max(this.headNod, accent); }
    this.headNod = lerp(this.headNod, 0, Math.min(1, dt * 4));
    const sway = Math.sin(this.t * 0.9) * 0.03 * (0.4 + this.energy) + Math.sin(this.t * 0.37) * 0.015;
    const lean = 0.06 + this.energy * 0.12;
    B.LowerBack.rotation.set(lean * 0.5, 0, sway * 0.5);
    B.Spine.rotation.set(lean * 0.4, sway * 0.3, sway * 0.5);
    B.Spine1.rotation.set(lean * 0.2, 0, sway * 0.3);
    B.Head.rotation.set(0.12 + this.headNod * 0.22 + Math.sin(this.t * 1.3) * 0.02, -sway * 1.2, -sway * 0.6);
    this.robotParts.visor.emissiveIntensity = 1.6 + this.energy * 1.4 + this.headNod * 2;
    this.robotParts.core.material.emissiveIntensity = 3 + Math.sin(this.t * 3) * 0.6 + this.energy * 2;
    this.robot.updateMatrixWorld(true);

    // 手: 目標 (指ごとに鍵 x)。掌の x は「押している/次に押す指の鍵 x - 指のオフセット」の平均
    for (const h of ["L", "R"]) {
      const st = this.handState[h];
      const side = h === "L" ? "Left" : "Right";
      const hand = this.hands[side];
      const sgn = hand.sgn;
      const list = active[h].length ? active[h] : upcoming[h];
      let palmX = st.x, palmZ = 0.115, targetY = KEY_TOP_Y + 0.055;
      if (list.length) {
        // 指のオフセット: 右手 親指 = 一番左 (-x)。左手 親指 = 一番右 (+x)
        const offs = list.map((n) => { const fi = clamp((n.f ?? 3) - 1, 0, 4); const off = FINGER_SPREAD_M[fi] * (h === "R" ? 1 : -1); return keyX(n.p) - off; });
        palmX = offs.reduce((a, b) => a + b, 0) / offs.length;
        // 黒鍵が多いなら奥へ
        const blackRatio = list.filter((n) => isBlack(n.p)).length / list.length;
        palmZ = 0.115 - blackRatio * 0.035;
      } else if (playing) {
        palmX = lerp(st.x, h === "L" ? keyX(48) : keyX(72), 0.002);
      }
      const rate = active[h].length ? 26 : 14;
      st.x = lerp(st.x, palmX, Math.min(1, dt * rate));
      st.z = lerp(st.z || palmZ, palmZ, Math.min(1, dt * 10));
      st.y = lerp(st.y || targetY, targetY, Math.min(1, dt * 10));
      const wristTarget = new THREE.Vector3(st.x + (h === "R" ? -0.055 : 0.055), st.y, st.z + 0.09);
      this._solveArm(side, wristTarget, dt);
      // 指: 押している指は曲げて沈める
      const pressing = new Map();
      for (const n of active[h]) pressing.set(clamp((n.f ?? 3) - 1, 0, 4), n.v / 127);
      const upcomingF = new Set(upcoming[h].map((n) => clamp((n.f ?? 3) - 1, 0, 4)));
      hand.fingers.forEach((f, i) => {
        const p = pressing.has(i) ? 1 : upcomingF.has(i) ? 0.25 : 0;
        f.press = lerp(f.press, p, Math.min(1, dt * (p ? 45 : 16)));
        // 指の曲げ: 根元を下げ、第二関節を少し曲げる (押す = 指先が下がる)
        const base = i === 0 ? 0.15 : 0.32, curl = i === 0 ? 0.25 : 0.45;
        f.root.rotation.z = sgn * -(base + f.press * 0.35);   // 下向き
        f.joint.rotation.z = sgn * -(curl * 0.6 + f.press * 0.3);
        // 横の広がり: 押す鍵に合わせて指を少し開く
        const n = active[h].find((q) => clamp((q.f ?? 3) - 1, 0, 4) === i) ?? upcoming[h].find((q) => clamp((q.f ?? 3) - 1, 0, 4) === i);
        let spreadTarget = 0;
        if (n) { const want = keyX(n.p) - st.x; const have = FINGER_SPREAD_M[i] * (h === "R" ? 1 : -1); spreadTarget = clamp((want - have) / 0.03, -0.6, 0.6); }
        f.spread = lerp(f.spread ?? 0, spreadTarget, Math.min(1, dt * 14));
        f.root.rotation.y = (h === "R" ? -1 : 1) * f.spread * 0.5 * (i === 0 ? 1.4 : 1);
      });
    }

    // カメラ: 上 = 右斜め後ろからゆっくり回る。下 = 鍵盤の真上に近い所から両手を追う
    const cx = (this.handState.L.x + this.handState.R.x) / 2;
    const orbit = this.t * 0.05;
    this.camMain.position.set(1.55 + Math.sin(orbit) * 0.35, 1.55 + Math.sin(this.t * 0.11) * 0.06, 1.75 + Math.cos(orbit) * 0.25);
    this.camMain.lookAt(-0.15, 0.9, -0.15);
    this.camHands.position.set(lerp(this.camHands.position.x || cx, cx * 0.85, Math.min(1, dt * 2)), 1.12, 0.46);
    this.camHands.lookAt(this.camHands.position.x * 0.9, KEY_TOP_Y - 0.02, -0.06);
  }

  render() {
    const r = this.renderer; const w = this.w, h = this.h, sp = this.split;
    r.setScissorTest(true);
    r.setViewport(0, h - sp, w, sp); r.setScissor(0, h - sp, w, sp); r.render(this.scene, this.camMain);
    r.setViewport(0, 0, w, h - sp); r.setScissor(0, 0, w, h - sp); r.render(this.scene, this.camHands);
    r.setScissorTest(false);
  }
}
