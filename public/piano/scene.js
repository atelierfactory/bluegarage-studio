// ═══════════ VESPER-01 がグランドピアノを弾く 3D 舞台 (three.js) ═══════════
// 3 つの画面: 上 = VESPER の目線 (自分の手と鍵盤、開いた屋根の中の弦を見下ろす)、
//             下 = 鍵盤と両手のアップ、上の左下 = ペダルと右足の小窓。
// 音符 (p, s, d, v, h, f) とペダル区間から、手の位置・指の押し込み・鍵の沈み・ハンマー・ダンパー・体の揺れ・足のペダルを毎フレーム計算する。
// ロボットの見た目は product/toys/3D_model の VESPER-01 (buildRobot) と同じ部品構成。
// ピアノは「Salamander Grand Piano」(Alexander Holm 氏がヤマハ C5 を録音した無料音源) に敬意を込めて、
// 特定メーカーの意匠を写さない一般的なコンサートグランドとして、弦の一本一本まで組み立てる。

import * as THREE from "three";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

/* ─────────── 鍵盤の寸法 (m) ─────────── */
const WHITE_W = 0.0235, WHITE_L = 0.150, BLACK_W = 0.0135, BLACK_L = 0.095, KEY_H = 0.013;
const LOW = 21, HIGH = 108;
const isBlack = (p) => [1, 3, 6, 8, 10].includes(p % 12);
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
  lacquer: new THREE.MeshPhysicalMaterial({ color: 0x08080a, roughness: 0.10, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04, reflectivity: 0.9 }),
  lacquerMatte: new THREE.MeshPhysicalMaterial({ color: 0x101012, roughness: 0.35, metalness: 0.05, clearcoat: 0.5 }),
  ivory: new THREE.MeshPhysicalMaterial({ color: 0xf6f2e8, roughness: 0.32, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.25 }),
  ebony: new THREE.MeshPhysicalMaterial({ color: 0x151311, roughness: 0.28, metalness: 0.1, clearcoat: 0.85, clearcoatRoughness: 0.08 }),
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

/* ─────────── 骨組み (BVH と同じ名前・ロボット単位。全体を ROBOT_SCALE で m に) ─────────── */
const ROBOT_SCALE = 0.061;
const SKELETON = {
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
function buildSkeleton() {
  const bones = {};
  for (const [name, pos] of Object.entries(SKELETON)) { const b = new THREE.Bone(); b.name = name; b.position.set(...pos); b.isBone = true; bones[name] = b; }
  for (const [name, parent] of Object.entries(PARENT)) bones[parent].add(bones[name]);
  return bones;
}

// 3D_model/balance_mimic_v1.html の buildRobot と同じ部品 (手はピアノ用に指付き、首は胴とつながるように調整)
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
const FINGER_LEN = [1.3, 2.0, 2.2, 2.0, 1.6];       // 親指→小指 (ロボット単位)
const FINGER_Z = [-0.9, -0.45, 0, 0.45, 0.9];        // 右手基準の並び (world x 方向 = z*sgn なので左手は自動で鏡になる)
const FINGER_OFFSET_M = FINGER_Z.map((z) => z * ROBOT_SCALE);
export function fingerOffsetX(hand, fingerIdx) { return FINGER_OFFSET_M[fingerIdx] * (hand === "R" ? 1 : -1); }
function buildHand(H, sgn) {
  const palm = box(H, V(sgn * 0.85, 0, 0), V(1.5, 0.34, 2.0), M.carbon);
  box(H, V(sgn * 0.85, 0.2, 0), V(1.25, 0.14, 1.8), M.shell);
  const fingers = [];
  for (let i = 0; i < 5; i++) {
    const root = new THREE.Object3D(); root.position.set(sgn * (i === 0 ? 1.15 : 1.7), i === 0 ? -0.1 : 0, FINGER_Z[i]); H.add(root);
    const len = FINGER_LEN[i];
    limb(root, V(0, 0, 0), V(sgn * len * 0.55, 0, 0), 0.14, 0.12, M.shell, 10, true);
    const joint = new THREE.Object3D(); joint.position.set(sgn * len * 0.55, 0, 0); root.add(joint);
    limb(joint, V(0, 0, 0), V(sgn * len * 0.45, 0, 0), 0.115, 0.09, M.gun, 10, true);
    const tip = new THREE.Object3D(); tip.position.set(sgn * len * 0.45, -0.1, 0); joint.add(tip);
    fingers.push({ root, joint, tip, len, lenM: len * ROBOT_SCALE, press: 0, spread: 0 });
  }
  return { bone: H, sgn, fingers, palm };
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
function textPlate(text, w, h, opts = {}) {
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
function woodTexture({ base = "#d9b57a", grain = "#b98f55", lines = 160, w = 1024, h = 1024, noise = 0.08 } = {}) {
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
function makeEnvironment(renderer) {
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
    if (black) { geo = new THREE.BoxGeometry(BLACK_W, KEY_H * 0.95, BLACK_L); }
    else {
      // 白鍵は奥で黒鍵をよける L 字 / T 字。左右どちらに黒鍵があるかで奥の幅を削る
      const gap = 0.0006, fullW = WHITE_W - gap * 2;
      const leftBlack = p > LOW && isBlack(p - 1), rightBlack = p < HIGH && isBlack(p + 1);
      const cutL = leftBlack ? (keyX(p - 1) + BLACK_W / 2 + gap) - (keyX(p) - WHITE_W / 2) : 0;
      const cutR = rightBlack ? (keyX(p) + WHITE_W / 2) - (keyX(p + 1) - BLACK_W / 2 - gap) : 0;
      const backLen = BLACK_L + 0.006, frontLen = WHITE_L + 0.02 - backLen;
      const sh = new THREE.Shape();
      const x0 = -fullW / 2, x1 = fullW / 2;
      sh.moveTo(x0, 0); sh.lineTo(x1, 0); sh.lineTo(x1, frontLen); sh.lineTo(x1 - Math.max(0, cutR), frontLen); sh.lineTo(x1 - Math.max(0, cutR), frontLen + backLen); sh.lineTo(x0 + Math.max(0, cutL), frontLen + backLen); sh.lineTo(x0 + Math.max(0, cutL), frontLen); sh.lineTo(x0, frontLen); sh.lineTo(x0, 0);
      geo = new THREE.ExtrudeGeometry(sh, { depth: KEY_H, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2 });
      geo.rotateX(-Math.PI / 2);                 // shape の y (奥行き) → -z、押し出し → +y。x はそのまま (左右を裏返さない)
      geo.translate(0, -KEY_H / 2, WHITE_L + 0.02); // 支点 (奥) から手前へ 0〜L
    }
    const mesh = shadowed(new THREE.Mesh(geo, black ? P.ebony : P.ivory));
    mesh.position.set(0, black ? KEY_H * 0.48 : 0, black ? BLACK_L / 2 + 0.02 : 0);
    pivot.add(mesh); g.add(pivot);
    keys[p] = { pivot, mesh, black, press: 0, target: 0, idx: p - LOW, hasDamper: p <= 89, dirty: true };
  }
  // ── 鍵盤まわり
  const keybed = shadowed(new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.07, 0.46), P.lacquer)); keybed.position.set(0, KEY_TOP_Y - KEY_H - 0.04, -0.08); g.add(keybed);
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
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050505);
    this.scene.fog = new THREE.Fog(0x050505, 7, 16);
    this.scene.add(new THREE.HemisphereLight(0x9a9a9a, 0x0a0a0a, 0.5));
    this.scene.environment = makeEnvironment(this.renderer); // 漆・金属の映り込み
    this.scene.environmentIntensity = 0.55;
    const key = new THREE.SpotLight(0xfff1dc, 110, 12, 0.55, 0.55, 1.4); key.position.set(1.6, 3.8, 1.6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; this.scene.add(key); this.scene.add(key.target); key.target.position.set(0, 0.8, -0.3);
    const rim = new THREE.SpotLight(0xbfd8ff, 35, 10, 0.7, 0.7, 1.4); rim.position.set(-2.4, 2.8, -2.0); this.scene.add(rim);
    const fill = new THREE.PointLight(0xffe6c4, 5, 5, 1.6); fill.position.set(0.6, 1.5, 1.6); this.scene.add(fill);
    const inside = new THREE.PointLight(0xffe9c8, 3.5, 2.6, 1.6); inside.position.set(0.1, 1.25, -0.9); this.scene.add(inside);
    const handLamp = new THREE.PointLight(0xffffff, 4, 2.0, 1.8); handLamp.position.set(0, 1.35, 0.3); this.scene.add(handLamp);
    const pedalLamp = new THREE.PointLight(0xfff0d8, 2.2, 1.4, 1.6); pedalLamp.position.set(0.35, 0.45, 0.35); this.scene.add(pedalLamp); // ペダルと右足 (小窓用)
    const floor = shadowed(new THREE.Mesh(new THREE.CircleGeometry(7, 64), P.floor)); floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
    this.piano = buildPiano(this.scene);
    this.bones = buildSkeleton();
    this.hands = {};
    this.robotParts = buildRobot(this.bones, this.hands);
    this.robot = new THREE.Group(); this.robot.scale.setScalar(ROBOT_SCALE);
    this.robot.add(this.bones.Hips);
    this.scene.add(this.robot);
    this.poseSeated();
    this.camEye = new THREE.PerspectiveCamera(62, 1, 0.03, 30);
    this.camHands = new THREE.PerspectiveCamera(32, 1, 0.02, 10);
    this.camWide = new THREE.PerspectiveCamera(40, 1, 0.05, 40);
    // 全体カメラ: 目標点のまわりを回す (ドラッグ = 回転、ホイール = 寄り引き)
    this.orbit = { target: new THREE.Vector3(0.1, 0.95, -0.3), theta: 0.75, phi: 1.15, radius: 3.0, auto: true };
    this.view = "wide";          // 上 (または左) の画面: wide | eye | side | top
    this.layout = "stack";       // stack (上下) | side (左右)
    this._bindOrbit();
    this.t = 0; this.energy = 0; this.pedalDown = false; this.pedalAmt = 0; this._lastPedalAmt = -1; this._damperInit = false;
    this.handState = { L: { x: keyX(48), y: KEY_TOP_Y + 0.05, z: 0.115 }, R: { x: keyX(72), y: KEY_TOP_Y + 0.05, z: 0.115 } };
    this.notesRef = []; this.pedalRef = [];
    this.headNod = 0;
    this._eyeLook = new THREE.Vector3(0, KEY_TOP_Y, -0.05);
    this._resize();
    new ResizeObserver(() => this._resize()).observe(canvas.parentElement);
  }

  _resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(64, Math.floor(r.width)), h = Math.max(64, Math.floor(r.height));
    this.renderer.setSize(w, h, false);
    this.w = w; this.h = h;
    if (this.layout === "side") {
      this.split = Math.round(w * 0.6);
      this.rects = { main: [0, 0, this.split, h], hands: [this.split, 0, w - this.split, h] };
    } else {
      this.split = Math.round(h * 0.58);
      this.rects = { main: [0, h - this.split, w, this.split], hands: [0, 0, w, h - this.split] };
    }
    for (const c of [this.camEye, this.camWide]) { c.aspect = this.rects.main[2] / this.rects.main[3]; c.updateProjectionMatrix(); }
    this.camHands.aspect = this.rects.hands[2] / this.rects.hands[3]; this.camHands.updateProjectionMatrix();
  }
  setLayout(layout) { this.layout = layout; this._resize(); }
  setView(view) {
    this.view = view;
    const o = this.orbit; o.auto = false;
    if (view === "wide") { o.theta = 0.75; o.phi = 1.15; o.radius = 3.0; o.auto = true; }
    if (view === "side") { o.theta = Math.PI / 2 + 0.05; o.phi = 1.35; o.radius = 2.6; }
    if (view === "top") { o.theta = 0.2; o.phi = 0.35; o.radius = 2.8; }
    if (view === "front") { o.theta = Math.PI + 0.35; o.phi = 1.25; o.radius = 3.2; }
  }
  _bindOrbit() {
    const cv = this.canvas; const o = this.orbit;
    let drag = null;
    const inMain = (x, y) => { const [rx, ry, rw, rh] = this.rects.main; const gy = this.h - y; return x >= rx && x <= rx + rw && gy >= ry && gy <= ry + rh; };
    cv.addEventListener("pointerdown", (e) => { const r = cv.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; if (!inMain(x, y) || this.view === "eye") return; drag = { x: e.clientX, y: e.clientY, theta: o.theta, phi: o.phi }; cv.setPointerCapture(e.pointerId); o.auto = false; });
    cv.addEventListener("pointermove", (e) => { if (!drag) return; o.theta = drag.theta - (e.clientX - drag.x) * 0.006; o.phi = clamp(drag.phi - (e.clientY - drag.y) * 0.005, 0.25, 1.5); });
    const up = (e) => { if (!drag) return; drag = null; try { cv.releasePointerCapture(e.pointerId); } catch {} };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", (e) => { const r = cv.getBoundingClientRect(); if (!inMain(e.clientX - r.left, e.clientY - r.top)) return; e.preventDefault(); o.radius = clamp(o.radius * (e.deltaY > 0 ? 1.08 : 0.92), 0.9, 7); o.auto = false; }, { passive: false });
    cv.addEventListener("dblclick", () => { if (this.view !== "eye") this.setView("wide"); });
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
    this.notesRef = notes.slice().sort((a, b) => a.s - b.s);
    this.pedalRef = pedal ?? [];
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
      bone.quaternion.slerp(q, Math.min(1, dt * 24));
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
    hand.quaternion.slerp(pq.clone().invert().multiply(wq), Math.min(1, dt * 20));
  }


  _updateKeys(dt) {
    const pn = this.piano;
    const pedalChanged = Math.abs(this.pedalAmt - this._lastPedalAmt) > 1e-3;
    let mechDirty = false;
    for (const k of Object.values(pn.keys)) {
      const prev = k.press;
      k.press = lerp(k.press, k.target, Math.min(1, dt * (k.target ? 60 : 16)));
      const moving = Math.abs(k.press - prev) > 1e-4 || k.press > 1e-3;
      if (!moving && !k.dirty && !pedalChanged) continue;
      k.dirty = moving;
      k.pivot.rotation.x = Math.atan(KEY_DIP / (k.black ? BLACK_L : WHITE_L)) * k.press;
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
    this.t += dt;
    const B = this.bones; const pn = this.piano;
    const nowSec = beatToSec(beat);
    const LOOK = 0.5;
    const active = { L: [], R: [] }, upcoming = { L: [], R: [] };
    let accent = 0;
    for (const n of this.notesRef) {
      const s = beatToSec(n.s), e = beatToSec(n.s + n.d);
      if (e < nowSec - 0.3) continue;
      if (s > nowSec + LOOK + 0.2) break;
      const h = n.h === "L" ? "L" : "R";
      if (s <= nowSec && nowSec < Math.max(e, s + 0.09)) { active[h].push(n); if (nowSec - s < 0.06) accent = Math.max(accent, n.v / 127); }
      else if (s > nowSec && s <= nowSec + LOOK) upcoming[h].push(n);
    }
    // ペダルと右足
    const pd = playing && this.pedalRef.some((p) => beat >= p.s - 1e-6 && beat < p.s + p.d - 1e-6);
    this.pedalDown = pd;
    this.pedalAmt = lerp(this.pedalAmt, pd ? 1 : 0, Math.min(1, dt * 14));
    pn.pedals[2].rotation.x = this.pedalAmt * 0.14;
    B.RightFoot.rotation.x = 0.42 - 0.08 + this.pedalAmt * 0.14;
    // 鍵・ハンマー・ダンパー
    for (const k of Object.values(pn.keys)) k.target = 0;
    // 鍵は「その音を受け持つ指が鍵の上に来た時」に沈む (指が届く前に鍵だけ沈まない)。
    // 指が遠すぎる場合は 80ms だけ待ってから沈める (音とのずれを大きくしないため)。
    this._pendingKeys = [];
    for (const h of ["L", "R"]) for (const n of active[h]) { const k = pn.keys[n.p]; if (k) this._pendingKeys.push({ k, n, h }); }
    // (鍵の更新は指の判定のあとで行う: _updateKeys)
    // 体
    const density = active.L.length + active.R.length;
    this.energy = lerp(this.energy, clamp(density / 4 + accent * 0.6, 0, 1.2), Math.min(1, dt * 2.5));
    if (accent > 0.72) this.headNod = Math.max(this.headNod, accent);
    this.headNod = lerp(this.headNod, 0, Math.min(1, dt * 4));
    const sway = Math.sin(this.t * 0.9) * 0.03 * (0.4 + this.energy) + Math.sin(this.t * 0.37) * 0.015;
    const lean = 0.10 + this.energy * 0.12;
    B.LowerBack.rotation.set(lean * 0.5, 0, sway * 0.5);
    B.Spine.rotation.set(lean * 0.4, sway * 0.3, sway * 0.5);
    B.Spine1.rotation.set(lean * 0.2, 0, sway * 0.3);
    const cx = (this.handState.L.x + this.handState.R.x) / 2;
    B.Neck1.rotation.set(0.1, 0, 0);
    B.Head.rotation.set(0.42 + this.headNod * 0.18 + Math.sin(this.t * 1.3) * 0.015, clamp(cx * 0.9, -0.5, 0.5), -sway * 0.5);
    this.robotParts.visor.emissiveIntensity = 1.6 + this.energy * 1.4 + this.headNod * 2;
    this.robotParts.core.material.emissiveIntensity = 3 + Math.sin(this.t * 3) * 0.6 + this.energy * 2;
    this.robot.updateMatrixWorld(true);

    // 手と指
    for (const h of ["L", "R"]) {
      const st = this.handState[h];
      const side = h === "L" ? "Left" : "Right";
      const hand = this.hands[side];
      const list = active[h].length ? active[h] : upcoming[h];
      let palmX = st.x, palmZ = 0.115;
      if (list.length) {
        const offs = list.map((n) => keyX(n.p) - fingerOffsetX(h, clamp((n.f ?? 3) - 1, 0, 4)));
        palmX = offs.reduce((a, b) => a + b, 0) / offs.length;
        const blackRatio = list.filter((n) => isBlack(n.p)).length / list.length;
        palmZ = 0.115 - blackRatio * 0.04;
      } else if (playing) palmX = lerp(st.x, h === "L" ? keyX(48) : keyX(72), 0.002);
      st.x = lerp(st.x, palmX, Math.min(1, dt * (active[h].length ? 40 : 22)));
      st.z = lerp(st.z, palmZ, Math.min(1, dt * 10));
      const palmY = KEY_TOP_Y + 0.05;
      st.y = palmY;
      this._solveArm(side, new THREE.Vector3(st.x, st.y, st.z + 0.85 * ROBOT_SCALE), dt);
      const pressing = new Map();
      for (const n of active[h]) { const i = clamp((n.f ?? 3) - 1, 0, 4); pressing.set(i, n); }
      const nextByF = new Map();
      for (const n of upcoming[h]) { const i = clamp((n.f ?? 3) - 1, 0, 4); if (!nextByF.has(i)) nextByF.set(i, n); }
      hand.fingers.forEach((f, i) => {
        const n = pressing.get(i) ?? nextByF.get(i);
        const p = pressing.has(i) ? 1 : nextByF.has(i) ? 0.3 : 0;
        f.press = lerp(f.press, p, Math.min(1, dt * (p === 1 ? 60 : 18)));
        const keyTop = n && isBlack(n.p) ? KEY_TOP_Y + 0.012 : KEY_TOP_Y;
        const restDrop = clamp((palmY - keyTop - 0.018) / f.lenM, 0, 0.95), pressDrop = clamp((palmY - keyTop + 0.006) / f.lenM, 0, 0.98);
        const ang = Math.asin(lerp(restDrop, pressDrop, f.press));
        f.root.rotation.z = hand.sgn * -(ang * 0.75);
        f.joint.rotation.z = hand.sgn * -(ang * 0.45 + 0.1);
        let shift = 0;
        if (n) shift = keyX(n.p) - (st.x + fingerOffsetX(h, i));
        const target = clamp(shift / Math.max(0.03, f.lenM * 0.9), -0.8, 0.8);
        f.spread = lerp(f.spread, target, Math.min(1, dt * 26));
        f.root.rotation.y = -Math.asin(f.spread);
      });
    }

    // 鍵を沈める判定 (指先の world x が鍵から 1 鍵分以内、または音が始まって 80ms 過ぎた)
    const tipPos = new THREE.Vector3();
    for (const { k, n, h } of this._pendingKeys) {
      const hand = this.hands[h === "L" ? "Left" : "Right"];
      const f = hand.fingers[clamp((n.f ?? 3) - 1, 0, 4)];
      f.tip.getWorldPosition(tipPos);
      const near = Math.abs(tipPos.x - keyX(n.p)) < WHITE_W * 1.1;
      const elapsed = nowSec - beatToSec(n.s);
      if (near || elapsed > 0.08) k.target = 0.7 + 0.3 * (n.v / 127);
    }
    this._updateKeys(dt);

    // カメラ 1: VESPER の目線
    const eyePos = new THREE.Vector3(); this.robotParts.eye.getWorldPosition(eyePos);
    const eyeTarget = new THREE.Vector3(clamp(cx * 0.6, -0.35, 0.35), KEY_TOP_Y - 0.02, -0.18);
    this._eyeLook.lerp(eyeTarget, Math.min(1, dt * 3));
    this.camEye.position.set(eyePos.x, eyePos.y + 0.02, eyePos.z + 0.02);
    this.camEye.lookAt(this._eyeLook);
    this.camEye.rotateZ(-sway * 0.35);
    // カメラ 2: 鍵盤と両手のアップ
    // (頭の前・上から見下ろす。頭は z≈0.6 にあるので、その手前 z=0.3 に置く)
    const hx = lerp(this.camHands.position.x || cx, cx * 0.8, Math.min(1, dt * 2));
    this.camHands.position.set(hx, 1.12, 0.30);
    this.camHands.lookAt(hx * 0.85, KEY_TOP_Y - 0.02, -0.07);
    // カメラ 3: 全体 (回せる)。auto のときはゆっくり回る
    const o = this.orbit;
    if (o.auto) o.theta += dt * 0.04;
    this.camWide.position.set(o.target.x + o.radius * Math.sin(o.phi) * Math.sin(o.theta), o.target.y + o.radius * Math.cos(o.phi), o.target.z + o.radius * Math.sin(o.phi) * Math.cos(o.theta));
    this.camWide.lookAt(o.target);
  }

  render() {
    const r = this.renderer;
    const main = this.view === "eye" ? this.camEye : this.camWide;
    r.setScissorTest(true);
    const [mx, my, mw, mh] = this.rects.main; r.setViewport(mx, my, mw, mh); r.setScissor(mx, my, mw, mh); r.render(this.scene, main);
    const [hx, hy, hw, hh] = this.rects.hands; r.setViewport(hx, hy, hw, hh); r.setScissor(hx, hy, hw, hh); r.render(this.scene, this.camHands);
    r.setScissorTest(false);
  }
}
