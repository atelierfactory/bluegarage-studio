// ═══════════ VESPER-01 のワンマンバンド 3D 舞台 (three.js) ═══════════
// 右手 = シンセの鍵盤 (37 鍵) と、その奥の 8 つのつまみ。右足 = 足鍵盤 (13 本)。
// 左手 = スティック 1 本 (ハイハット / スネア / タム 3 / クラッシュ)。左足 = バスドラのペダル。
// ロボットの部品・材質・骨組み・指先合わせは piano/scene.js の物をそのまま使う。
// 座標: ロボットはイス (z=0.64) に座って -z を向く。右 = +x。長さは m。

import * as THREE from "three";
import {
  V, clamp, lerp, solve3, M, P, shadowed, limb, sphere, box, ROBOT_SCALE, SKELETON, buildSkeleton, buildRobot,
  FINGER_OFFSET_M, FINGER_REACH_Z, FINGER_Z_WEIGHT, TIP_R, textPlate, makeEnvironment, isBlack,
} from "../piano/scene.js";
import { DRUM_KEYS, KEY_OF_DRUM, KICK, SYNTH_LOW, SYNTH_HIGH, PEDAL_LOW, PEDAL_HIGH, LIMITS } from "./prompts.js";
import { KNOBS } from "../js/synth2.js";
import { knobStateAt } from "../js/synth-automation.js";
import { knobMotionAt } from "./knob-motion.js";
import { KnobAR, knobChangesAt, arProtectedRegions } from "./ar.js";
import { HARDWARE, roundedSlab, meshAt, metalRod, valueArc, buildSynthCase, buildDisplay, cymbalGeometry, refineHands } from "./hardware.js";

/* ─────────── シンセの鍵盤 (37 鍵 C3〜C6) — 鍵盤のローカル座標: x = 低→高、z = 手前が +、鍵の上面 y=0 ─────────── */
const WHITE_W = 0.0225, WHITE_L = 0.135, BLACK_W = 0.0125, BLACK_L = 0.085, KEY_H = 0.012;
const whiteIndex = (p) => { let k = 0; for (let q = SYNTH_LOW; q < p; q++) if (!isBlack(q)) k++; return k; };
const N_WHITE = whiteIndex(SYNTH_HIGH) + 1;   // 22
const KB_W = N_WHITE * WHITE_W;               // 0.495
export function keyXL(p) {
  if (!isBlack(p)) return (whiteIndex(p) + 0.5) * WHITE_W;
  const boundary = (whiteIndex(p - 1) + 1) * WHITE_W;
  const shift = { 1: -0.12, 3: 0.12, 6: -0.18, 8: 0, 10: 0.18 }[p % 12] * WHITE_W;
  return boundary + shift;
}
const BLACK_TOP = 0.0095;           // 黒鍵の上面 (ローカル y)
const KEY_DIP = 0.008;
const KEY_PIVOT_Z = -WHITE_L - 0.01;
const KB_POS = V(0.05, 0.80, 0.16);  // 鍵盤ローカル原点 (低い C の左端・鍵の上面) の world 位置
const KB_YAW = -0.46;                // 高音側が体の横 (+z) へ回る
// つまみのパネル (鍵盤ローカル)
const PANEL_Z = -WHITE_L - 0.085, PANEL_Y = 0.028, PANEL_TILT = 0.30;
const KNOB_Z = PANEL_Z - 0.035, KNOB_Y = PANEL_Y + 0.035 * Math.sin(PANEL_TILT) + 0.014;
const knobXL = (i) => 0.045 + i * 0.0575;
const KNOB_ANGLE = 2.35;             // ±135°

/* ─────────── 足鍵盤 (13 本 C1〜C2) — world 座標 (床の上・右足の下) ─────────── */
const PB_X0 = 0.03, PB_WHITE_W = 0.052, PB_GAP = 0.006, PB_LONG = 0.30, PB_SHORT = 0.14;
const PB_Z_HEEL = 0.44;              // 手前 (かかと側)
const pbWhiteIndex = (p) => { let k = 0; for (let q = PEDAL_LOW; q < p; q++) if (!isBlack(q)) k++; return k; };
export function pedalX(p) {
  if (!isBlack(p)) return PB_X0 + (pbWhiteIndex(p) + 0.5) * (PB_WHITE_W + PB_GAP);
  return PB_X0 + (pbWhiteIndex(p - 1) + 1) * (PB_WHITE_W + PB_GAP);
}
const PB_TOP = 0.035, PB_SHARP_TOP = 0.075;
const TOE_Z = (p) => (isBlack(p) ? PB_Z_HEEL - PB_LONG + 0.04 : PB_Z_HEEL - 0.16);   // つま先を置く z

/* ─────────── ドラム (world) ─────────── */
const KICK_POS = V(-0.105, 0.30, -0.13), KICK_R = 0.28, KICK_DEPTH = 0.36;
const DRUMS = {
  sn: { pos: V(-0.40, 0.72, 0.10), r: 0.18, depth: 0.14, tilt: 0.12, shell: 0xf2efe6, kind: "drum", label: "SNARE" },
  hh: { pos: V(-0.64, 0.86, -0.08), r: 0.17, tilt: 0.10, kind: "cymbal", label: "HI-HAT" },
  t1: { pos: V(-0.15, 0.96, -0.25), r: 0.13, depth: 0.20, tilt: 0.45, shell: 0x2a2f3a, kind: "drum", label: "TOM 1" },
  t2: { pos: V(-0.44, 0.96, -0.31), r: 0.15, depth: 0.23, tilt: 0.45, shell: 0x2a2f3a, kind: "drum", label: "TOM 2" },
  t3: { pos: V(-0.76, 0.60, 0.42), r: 0.20, depth: 0.36, tilt: 0.05, shell: 0x2a2f3a, kind: "drum", label: "FLOOR TOM" },
  cr: { pos: V(-0.89, 1.20, 0.015), r: 0.2235, tilt: 0.16, kind: "cymbal", label: "CRASH" },
};
const STICK_LEN = 0.40;
const STICK_LEN_R = STICK_LEN / ROBOT_SCALE;

const D = {
  brass: new THREE.MeshPhysicalMaterial({ color: 0xd4b15a, roughness: 0.32, metalness: 1 }),
  cymbal: new THREE.MeshPhysicalMaterial({ color: 0xb9914e, roughness: 0.31, metalness: 1, clearcoat: 0.15, side: THREE.DoubleSide }),
  chrome: new THREE.MeshPhysicalMaterial({ color: 0xdadde2, roughness: 0.12, metalness: 1 }),
  head: new THREE.MeshPhysicalMaterial({ color: 0xe9e4d8, roughness: 0.75, metalness: 0, clearcoat: 0.2, side: THREE.DoubleSide }),
  headClear: new THREE.MeshPhysicalMaterial({ color: 0xbcc4cc, roughness: 0.35, metalness: 0.05, transmission: 0.25, thickness: 0.002, side: THREE.DoubleSide }),
  hoop: new THREE.MeshPhysicalMaterial({ color: 0xcfd2d6, roughness: 0.2, metalness: 1 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 }),
  panel: new THREE.MeshPhysicalMaterial({ color: 0x0d0e11, roughness: 0.42, metalness: 0.35, clearcoat: 0.4 }),
  wood: new THREE.MeshPhysicalMaterial({ color: 0x5a3a22, roughness: 0.5, metalness: 0.05, clearcoat: 0.5 }),
  knob: new THREE.MeshPhysicalMaterial({ color: 0x1a1b1f, roughness: 0.45, metalness: 0.5 }),
  knobTop: new THREE.MeshPhysicalMaterial({ color: 0xc9a656, roughness: 0.3, metalness: 1 }),
  stick: new THREE.MeshPhysicalMaterial({ color: 0xd8b98a, roughness: 0.55, metalness: 0 }),
  led: new THREE.MeshStandardMaterial({ color: 0x140a00, emissive: 0xffb347, emissiveIntensity: 2.5 }),
};
function shell(color) { return new THREE.MeshPhysicalMaterial({ color, roughness: 0.18, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 }); }

/* ─────────── 楽器を組む ─────────── */
function buildSynth(scene) {
  const g = new THREE.Group(); g.position.copy(KB_POS); g.rotation.y = KB_YAW;
  const keys = {};
  for (let p = SYNTH_LOW; p <= SYNTH_HIGH; p++) {
    const black = isBlack(p);
    const pivot = new THREE.Object3D(); pivot.position.set(keyXL(p), black ? 0.004 : -KEY_H / 2, KEY_PIVOT_Z);
    let geo;
    if (black) { geo = new THREE.BoxGeometry(BLACK_W - 0.0008, KEY_H * 0.95, BLACK_L); geo.translate(0, KEY_H * 0.48, BLACK_L / 2 + 0.006); }
    else {
      const gap = 0.0012, fullW = WHITE_W - gap * 2;
      const leftBlack = p > SYNTH_LOW && isBlack(p - 1), rightBlack = p < SYNTH_HIGH && isBlack(p + 1);
      const cutL = leftBlack ? (keyXL(p - 1) + BLACK_W / 2 + gap) - (keyXL(p) - WHITE_W / 2) : 0;
      const cutR = rightBlack ? (keyXL(p) + WHITE_W / 2) - (keyXL(p + 1) - BLACK_W / 2 - gap) : 0;
      const backLen = BLACK_L + 0.008, frontLen = WHITE_L + 0.01 - backLen;
      const sh = new THREE.Shape(); const x0 = -fullW / 2, x1 = fullW / 2;
      sh.moveTo(x0, 0); sh.lineTo(x1, 0); sh.lineTo(x1, frontLen); sh.lineTo(x1 - Math.max(0, cutR), frontLen); sh.lineTo(x1 - Math.max(0, cutR), frontLen + backLen); sh.lineTo(x0 + Math.max(0, cutL), frontLen + backLen); sh.lineTo(x0 + Math.max(0, cutL), frontLen); sh.lineTo(x0, frontLen); sh.lineTo(x0, 0);
      geo = new THREE.ExtrudeGeometry(sh, { depth: KEY_H, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2 });
      geo.rotateX(-Math.PI / 2); geo.translate(0, -KEY_H / 2, WHITE_L + 0.01);
    }
    const mat = (black ? P.ebony : P.ivory).clone(); if(black){mat.color.setHex(0x050607);mat.metalness=0;mat.roughness=.30;} mat.emissive = new THREE.Color(0xc9a656); mat.emissiveIntensity = 0;
    const mesh = shadowed(new THREE.Mesh(geo, mat)); pivot.add(mesh); g.add(pivot);
    keys[p] = { pivot, mesh, mat, black, press: 0, target: 0 };
  }
  buildSynthCase(g, KB_W, PANEL_Z, PANEL_Y, PANEL_TILT, textPlate);
  const display = buildDisplay(g);
  const knobs = [];
  KNOBS.forEach((k, i) => {
    const holder = new THREE.Object3D(); holder.position.set(knobXL(i), KNOB_Y, KNOB_Z); holder.rotation.x = PANEL_TILT; g.add(holder);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.006, 64), HARDWARE.black); base.position.y = -0.008; holder.add(base);
    const rot = new THREE.Object3D(); holder.add(rot);
    const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.0125, 0.017, 64), HARDWARE.silver)); cap.position.y = 0.002; rot.add(cap);
    const grooves = new THREE.InstancedMesh(new THREE.CylinderGeometry(.0004,.0005,.012,8), HARDWARE.black, 40);
    const groovePose = new THREE.Object3D();
    for(let j=0;j<40;j++){const a=j*Math.PI/20;groovePose.position.set(Math.sin(a)*.0119,.002,Math.cos(a)*.0119);groovePose.updateMatrix();grooves.setMatrixAt(j,groovePose.matrix);} rot.add(grooves);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.002, 64), HARDWARE.black); top.position.y = 0.0115; rot.add(top);
    const ptr = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.004, 0.011), HARDWARE.gold); ptr.position.set(0, 0.012, -0.0055); rot.add(ptr);
    const label = textPlate(k.label, 0.05, 0.011, { bg: "#0d0e11", fg: "#d8d8d8", line: "#0d0e11", size: 125, weight: "400" }); label.position.set(0, -0.006, 0.030); label.rotation.x = -Math.PI / 2; holder.add(label);
    const ring = new THREE.Mesh(valueArc(.0175,.0015), HARDWARE.unlit); ring.position.y=-.007;holder.add(ring);
    const arc = new THREE.Mesh(valueArc(.0175,.0015), HARDWARE.gold); arc.position.y=-.0068;holder.add(arc);
    const chase=new THREE.Mesh(new THREE.SphereGeometry(.0022,24,16),HARDWARE.gold);holder.add(chase);chase.visible=false;
    knobs.push({ id:k.id, holder, rot, arc, chase, value:.5, lit:0 });
  });
  scene.add(g);
  return { group: g, keys, knobs, display };
}

function buildPedalboard(scene) {
  const g = new THREE.Group();
  const base = shadowed(new THREE.Mesh(roundedSlab(PB_X0 * 2 + 8 * (PB_WHITE_W + PB_GAP) + 0.02, PB_LONG + 0.08, 0.02, .014), HARDWARE.black)); base.position.set(PB_X0 + 4 * (PB_WHITE_W + PB_GAP), 0.01, PB_Z_HEEL - PB_LONG / 2 - 0.02); g.add(base);
  const pedals = {};
  for (let p = PEDAL_LOW; p <= PEDAL_HIGH; p++) {
    const black = isBlack(p);
    const pivot = new THREE.Object3D(); pivot.position.set(pedalX(p), black ? PB_SHARP_TOP - 0.02 : PB_TOP - 0.012, PB_Z_HEEL - (black ? PB_LONG : PB_LONG) - 0.01);
    const len = black ? PB_SHORT : PB_LONG; const w = black ? 0.024 : PB_WHITE_W;
    const mat = (black ? P.ebony : P.ivory).clone(); if(black){mat.color.setHex(0x050607);mat.metalness=0;mat.roughness=.30;} mat.emissive = new THREE.Color(0xc9a656); mat.emissiveIntensity = 0;
    const mesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.024, len), mat)); mesh.position.set(0, 0, len / 2); pivot.add(mesh);
    if (black) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.02, PB_SHARP_TOP - 0.02, 0.02), D.rubber); post.position.set(0, -(PB_SHARP_TOP - 0.02) / 2, 0.04); pivot.add(post); }
    g.add(pivot);
    pedals[p] = { pivot, mat, black, press: 0, target: 0 };
  }
  scene.add(g);
  return { group: g, pedals };
}

function cymbal(r) {
  return cymbalGeometry(r);
}
function buildDrums(scene) {
  const g = new THREE.Group();
  const pads = {};
  const stand = (x, z, h, r = 0.011) => { const s = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), D.chrome)); s.position.set(x, h / 2, z); g.add(s); for (let i = 0; i < 3; i++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.30, 8), D.chrome); const a = i * Math.PI * 2 / 3 + 0.4; leg.position.set(x + Math.sin(a) * 0.11, 0.10, z + Math.cos(a) * 0.11); leg.rotation.z = Math.cos(a) * 0.75; leg.rotation.x = -Math.sin(a) * 0.75; g.add(leg); } return s; };
  const lugs = (holder, r, depth, n) => { for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n; const lug = new THREE.Mesh(new THREE.BoxGeometry(0.014, depth * 0.5, 0.01), D.chrome); lug.position.set(Math.sin(a) * (r + 0.006), -depth / 2, Math.cos(a) * (r + 0.006)); lug.rotation.y = a; holder.add(lug); } };
  for (const [k, d] of Object.entries(DRUMS)) {
    const holder = new THREE.Object3D(); holder.position.copy(d.pos); holder.rotation.x = d.tilt; g.add(holder);
    if (d.kind === "drum") {
      const sh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r, d.depth, 48, 1, true), shell(d.shell))); sh.position.y = -d.depth / 2; holder.add(sh);
      const head = shadowed(new THREE.Mesh(new THREE.CircleGeometry(d.r - 0.004, 48), k === "sn" ? D.head : D.headClear)); head.rotation.x = -Math.PI / 2; head.position.y = 0.0; holder.add(head);
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(d.r - 0.004, 48), D.headClear); bottom.rotation.x = Math.PI / 2; bottom.position.y = -d.depth; holder.add(bottom);
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(d.r + 0.004, 0.006, 8, 64), D.hoop); hoop.rotation.x = Math.PI / 2; hoop.position.y = 0.004; holder.add(hoop);
      const hoop2 = hoop.clone(); hoop2.position.y = -d.depth; holder.add(hoop2);
      lugs(holder, d.r, d.depth, k === "t1" ? 6 : k === "t3" ? 8 : 8);
      if (k === "sn") { const st = stand(d.pos.x, d.pos.z, d.pos.y - d.depth - 0.02); const basket = new THREE.Mesh(new THREE.TorusGeometry(d.r * 0.7, 0.006, 6, 32), D.chrome); basket.rotation.x = Math.PI / 2; basket.position.set(d.pos.x, d.pos.y - d.depth - 0.005, d.pos.z); g.add(basket); }
      if (k === "t3") { for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, d.pos.y - d.depth + 0.12, 8), D.chrome); leg.position.set(d.pos.x + Math.sin(a) * (d.r + 0.03), (d.pos.y - d.depth + 0.12) / 2 - 0.05, d.pos.z + Math.cos(a) * (d.r + 0.03)); g.add(leg); } }
      if (k === "t1" || k === "t2") { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.42, 8), D.chrome); arm.position.set(d.pos.x, d.pos.y - 0.32, d.pos.z + 0.02); g.add(arm); }
    } else {
      const cy = shadowed(new THREE.Mesh(cymbal(d.r), D.cymbal)); holder.add(cy);
      const felt = meshAt(holder,new THREE.CylinderGeometry(.015,.015,.008,40),D.rubber,0,.058,0);
      const nut = meshAt(holder,new THREE.CylinderGeometry(.007,.007,.013,32),D.chrome,0,.067,0);
      metalRod(nut,V(-.014,.002,0),V(.014,.002,0),.003,D.chrome);
      if (k === "hh") {
        const under = shadowed(new THREE.Mesh(cymbal(d.r), D.cymbal)); under.rotation.x = Math.PI; under.position.y = -0.008; holder.add(under);
        stand(d.pos.x, d.pos.z, d.pos.y - 0.02, 0.009);
        const fb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.20), D.chrome); fb.position.set(d.pos.x, 0.03, d.pos.z + 0.16); fb.rotation.x = -0.15; g.add(fb);
      } else {
        const mast = V(d.pos.x-.09,.96,d.pos.z-.20);
        stand(mast.x,mast.z,mast.y,.011);
        const hub=meshAt(g,new THREE.SphereGeometry(.021,32,20),D.chrome,...mast.toArray());
        metalRod(g,mast,d.pos.clone().add(V(0,.045,0)),.008,D.chrome);

      }
    }
    pads[k] = { ...d, holder, hit: 0, idx: k };
  }
  // バスドラ: 軸は z。打面 (バター) は手前 (+z) 側
  const kick = new THREE.Object3D(); kick.position.copy(KICK_POS); g.add(kick);
  const ks = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(KICK_R, KICK_R, KICK_DEPTH, 64, 1, true), shell(0x2a2f3a))); ks.rotation.x = Math.PI / 2; kick.add(ks);
  const kh = shadowed(new THREE.Mesh(new THREE.CircleGeometry(KICK_R - 0.004, 64), D.headClear)); kh.position.z = KICK_DEPTH / 2; kick.add(kh);
  const kf = new THREE.Mesh(new THREE.CircleGeometry(KICK_R - 0.004, 64), new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, roughness: 0.5, clearcoat: 0.6 })); kf.position.z = -KICK_DEPTH / 2; kf.rotation.y = Math.PI; kick.add(kf);
  const logo = textPlate("VESPER", 0.30, 0.09, { bg: "#0b0b0d", fg: "#e0b95a", line: "#0b0b0d", size: 90 }); logo.position.z = -KICK_DEPTH / 2 - 0.001; logo.rotation.y = Math.PI; kick.add(logo);
  [KICK_DEPTH / 2, -KICK_DEPTH / 2].forEach((z) => { const hp = new THREE.Mesh(new THREE.TorusGeometry(KICK_R + 0.006, 0.009, 8, 64), D.wood); hp.position.z = z; kick.add(hp); });
  for (let i = 0; i < 10; i++) { const a = i * Math.PI * 2 / 10; const lug = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, KICK_DEPTH * 0.45), D.chrome); lug.position.set(Math.sin(a) * (KICK_R + 0.008), Math.cos(a) * (KICK_R + 0.008), 0); kick.add(lug); }
  [-0.22, 0.22].forEach((x) => { const spur = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.30, 8), D.chrome); spur.position.set(KICK_POS.x + x, 0.14, KICK_POS.z - 0.10); spur.rotation.z = x > 0 ? -0.5 : 0.5; g.add(spur); });
  const tomHolder = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 10), D.chrome); tomHolder.position.set(KICK_POS.x - 0.15, KICK_POS.y + KICK_R + 0.15, KICK_POS.z - 0.10); g.add(tomHolder);
  // ペダル: かかと側 (z 大) の蝶番で回る踏み板、ビーター
  const pedal = { base: null, board: null, beater: null };
  const pbz = KICK_POS.z + KICK_DEPTH / 2;   // 打面の z
  const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.30), D.chrome)); base.position.set(KICK_POS.x, 0.006, pbz + 0.16); g.add(base);
  const hinge = new THREE.Object3D(); hinge.position.set(KICK_POS.x, 0.018, pbz + 0.31); g.add(hinge);
  const board = shadowed(new THREE.Mesh(roundedPlate(0.094,0.24,0.008,0.018), D.chrome)); board.position.set(0, 0, -0.12); hinge.add(board); board.rotation.x = 0.0;
  for (let j=0;j<8;j++) { const rib=new THREE.Mesh(roundedPlate(.071,.003,.002,.001),D.rubber); rib.position.set(0,.006,-.035-j*.024); hinge.add(rib); }
  const heel = shadowed(new THREE.Mesh(roundedPlate(.096,.047,.010,.008),D.panel)); heel.position.set(KICK_POS.x,.020,pbz+.315); g.add(heel);
  const hingeAxle=new THREE.Mesh(new THREE.CylinderGeometry(.007,.007,.104,24),D.chrome); hingeAxle.rotation.z=Math.PI/2; hingeAxle.position.copy(hinge.position); g.add(hingeAxle);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.20, 24), D.chrome); post.position.set(KICK_POS.x + 0.045, 0.10, pbz + 0.07); g.add(post);
  const post2 = post.clone(); post2.position.x = KICK_POS.x - 0.045; g.add(post2);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.10, 8), D.chrome); axle.rotation.z = Math.PI / 2; axle.position.set(KICK_POS.x, 0.20, pbz + 0.07); g.add(axle);
  const beaterPivot = new THREE.Object3D(); beaterPivot.position.set(KICK_POS.x, 0.20, pbz + 0.07); g.add(beaterPivot);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 8), D.chrome); rod.position.y = 0.11; beaterPivot.add(rod);
  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.03, 32, 24), new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.9 }))); head.position.y = 0.23; beaterPivot.add(head);
  const cam = new THREE.Mesh(new THREE.CylinderGeometry(.031,.031,.015,40),D.panel); cam.rotation.z=Math.PI/2; beaterPivot.add(cam);
  const chain = new THREE.Mesh(new THREE.BoxGeometry(.012,1,.004),D.gun??D.chrome); g.add(chain); pedal.chain=chain;
  const springPoints=[]; for(let j=0;j<=160;j++){const u=j/160,a=u*Math.PI*20; springPoints.push(V(KICK_POS.x+.061+Math.cos(a)*.006,.05+u*.12,pbz+.07+Math.sin(a)*.006));}
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPoints),160,.0014,8,false),D.chrome));
  pedal.head=head; pedal.board=board;
  pedal.hinge = hinge; pedal.beater = beaterPivot; pedal.heelPos = V(KICK_POS.x, 0.03, pbz + 0.31); pedal.toeZ = pbz + 0.10;
  // イス (ドラムスローン)
  const seat = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 32), P.cushion)); seat.position.set(0, 0.485, 0.66); g.add(seat);
  const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 12), D.chrome); seatPost.position.set(0, 0.24, 0.66); g.add(seatPost);
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.34, 8), D.chrome); leg.position.set(Math.sin(a) * 0.13, 0.12, 0.66 + Math.cos(a) * 0.13); leg.rotation.z = Math.cos(a) * 0.8; leg.rotation.x = -Math.sin(a) * 0.8; g.add(leg); }
  // ラグ
  const rug = meshAt(g,roundedSlab(2.45,1.94,.009,.15,.002),new THREE.MeshStandardMaterial({color:0x111317,roughness:.94}),-.20,.003,.06);
  const edge=meshAt(g,roundedSlab(2.48,1.97,.005,.16,.001),HARDWARE.grip,-.20,.001,.06);

  scene.add(g);
  return { group: g, pads, kick, pedal };
}

function roundedPlate(width, length, depth, radius) {
  const x = -width / 2, y = -length / 2, r = radius, sh = new THREE.Shape();
  sh.moveTo(x+r,y); sh.lineTo(x+width-r,y); sh.quadraticCurveTo(x+width,y,x+width,y+r);
  sh.lineTo(x+width,y+length-r); sh.quadraticCurveTo(x+width,y+length,x+width-r,y+length);
  sh.lineTo(x+r,y+length); sh.quadraticCurveTo(x,y+length,x,y+length-r);
  sh.lineTo(x,y+r); sh.quadraticCurveTo(x,y,x+r,y);
  const geo = new THREE.ExtrudeGeometry(sh, {depth,bevelEnabled:true,bevelSize:0.001,bevelThickness:0.001,bevelSegments:3,curveSegments:16});
  geo.translate(0,0,-depth/2); geo.rotateX(-Math.PI/2); return geo;
}

const STICK_AXIS = V(0.42, 0.12, 0.90).normalize();
function buildStick(handBone) {
  // A fixed diagonal through the palm: the fingers wrap around this axis.
  const pivot = new THREE.Object3D(); pivot.position.set(2.0, -0.66, 0.30); handBone.add(pivot);
  pivot.quaternion.setFromUnitVectors(V(0,1,0), STICK_AXIS);
  const profile = [[0,-1.1],[.108,-1.1],[.12,-1.03],[.12,0],[.115,STICK_LEN_R-1.2],[.07,STICK_LEN_R-.35],[.10,STICK_LEN_R-.18],[.07,STICK_LEN_R-.03],[0,STICK_LEN_R]];
  const mesh = shadowed(new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),48),D.stick)); pivot.add(mesh);
  const tip = new THREE.Object3D(); tip.position.y=STICK_LEN_R; pivot.add(tip);
  return {pivot,tip,mesh};
}

// Numerical three-joint fingertip solve, also used for the two sides of a knob.
function placeContact(hand, finger, target, seed = null) {
  const { root, joint, tip } = finger, sg = hand.sgn;
  const get = () => [root.rotation.y, root.rotation.z * sg, joint.rotation.z * sg];
  const set = (q) => { root.rotation.y=clamp(q[0],-1.5,1.5); root.rotation.z=sg*clamp(q[1],-2.3,.6); joint.rotation.z=sg*clamp(q[2],-2.9,.3); root.updateMatrixWorld(true); };
  const pos = () => tip.getWorldPosition(new THREE.Vector3());
  // Solve the actual two links, including the fingertip's -0.1 y offset.
  // A reachable target needs no iterative search (especially useful in shots).
  const local=hand.bone.worldToLocal(target.clone()).sub(root.position);
  const radial=Math.hypot(local.x,local.z),a=Math.abs(joint.position.x),b=tip.position.length();
  const elbow=-sg*Math.acos(clamp((radial*radial+local.y*local.y-a*a-b*b)/(2*a*b),-1,1));
  const distalAngle=Math.atan2(tip.position.y*sg,Math.abs(tip.position.x));
  const analytic=[Math.atan2(-local.z*sg,local.x*sg),(Math.atan2(local.y*sg,radial)-Math.atan2(b*Math.sin(elbow),a+b*Math.cos(elbow)))/sg,(elbow-distalAngle)/sg];
  set(analytic);
  if(pos().distanceTo(target)<.00012){finger.contactPose=get();return target.clone().sub(pos());}
  let best = null;
  for (const initial of [seed ?? get(), [0,-.1,-2.3], [0,-.8,-.8]]) {
    set(initial);
    for (let it=0;it<18;it++) {
      const q=get(), base=pos(), err=target.clone().sub(base), e=err.length();
      if (!best || e<best.e) best={q,e};
      if (e<.00012) break;
      const J=[];
      for(let k=0;k<3;k++) { const q2=q.slice(); q2[k]+=.008; set(q2); const actual=get()[k]-q[k]; if(Math.abs(actual)<.00001) {q2[k]=q[k]-.008;set(q2);} const h=get()[k]-q[k]; J.push(pos().sub(base).divideScalar(h||.008)); }
      const A=J.map((u,i)=>J.map((v,j)=>u.dot(v)+(i===j?.000008:0))), g=J.map(u=>u.dot(err));
      const dq=solve3(A,g); if(!dq) break;
      set(q.map((v,i)=>v+clamp(dq[i],-.35,.35)));
    }
    if(best.e<.0002) break;
  }
  set(best.q); finger.contactPose=best.q; return target.clone().sub(pos());
}

/* ─────────── 舞台 ─────────── */
export class BandStage {
  constructor(canvas, { headless = false } = {}) {
    this.canvas = canvas; this.headless = headless;
    this.scene = new THREE.Scene();
    if (!headless) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050505);
    this.scene.fog = new THREE.Fog(0x050505, 7, 16);
    this.scene.add(new THREE.HemisphereLight(0x9a9a9a, 0x0a0a0a, 0.5));
    this.scene.environment = makeEnvironment(this.renderer); this.scene.environmentIntensity = 0.55;
    const key = new THREE.SpotLight(0xfff1dc, 120, 12, 0.6, 0.55, 1.4); key.position.set(1.4, 3.8, 1.8); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; this.scene.add(key); this.scene.add(key.target); key.target.position.set(-0.1, 0.8, 0);
    const rim = new THREE.SpotLight(0xbfd8ff, 40, 10, 0.7, 0.7, 1.4); rim.position.set(-2.4, 2.8, -2.0); this.scene.add(rim);
    const fill = new THREE.PointLight(0xffe6c4, 5, 5, 1.6); fill.position.set(0.6, 1.5, 1.6); this.scene.add(fill);
    const drumLamp = new THREE.SpotLight(0xffe0c0, 30, 5, 0.7, 0.6, 1.5); drumLamp.position.set(-1.2, 2.6, 1.0); this.scene.add(drumLamp); this.scene.add(drumLamp.target); drumLamp.target.position.set(-0.45, 0.8, 0);
    const kbLamp = new THREE.SpotLight(0xfff6e8, 22, 4, 0.6, 0.5, 1.5); kbLamp.position.set(0.9, 1.7, 0.9); kbLamp.castShadow = true; kbLamp.shadow.mapSize.set(2048, 2048); kbLamp.shadow.bias = -0.00012; kbLamp.shadow.normalBias = 0.0008; this.scene.add(kbLamp); this.scene.add(kbLamp.target); kbLamp.target.position.set(0.3, KB_POS.y, 0.15);
    const floor = shadowed(new THREE.Mesh(new THREE.CircleGeometry(7, 64), P.floor)); floor.rotation.x = -Math.PI / 2; this.scene.add(floor);

    }
    this.synth = buildSynth(this.scene);
    this.pb = buildPedalboard(this.scene);
    this.drums = buildDrums(this.scene);
    this.bones = buildSkeleton();
    this.hands = {};
    this.robotParts = buildRobot(this.bones, this.hands);
    this.robot = new THREE.Group(); this.robot.scale.setScalar(ROBOT_SCALE); this.robot.add(this.bones.Hips); this.scene.add(this.robot);
    this.stick = buildStick(this.bones.LeftHand);
    refineHands(this.hands, ROBOT_SCALE, TIP_R);
    // Band-only detail: smooth finger shells and flush toe soles; piano is untouched.
    for (const hand of Object.values(this.hands)) for (const f of hand.fingers) f.root.traverse((o) => {
      if (o.geometry?.type === "CapsuleGeometry") { const old=o.geometry,p=old.parameters; o.geometry=new THREE.CapsuleGeometry(p.radius,p.length,10,28); old.dispose(); }
    });
    this.bones.LeftToeBase.position.y = -0.2;
    this.bones.RightToeBase.position.y = -0.2;
    for (const mesh of this.bones.RightToeBase.children) if(mesh.isMesh) mesh.scale.x=.42;
    this.poseSeated();

    this.camEye = new THREE.PerspectiveCamera(62, 1, 0.03, 30);
    this.camClose = new THREE.PerspectiveCamera(34, 1, 0.02, 10);
    this.camWide = new THREE.PerspectiveCamera(40, 1, 0.05, 40);
    this.orbit = { target: new THREE.Vector3(-0.05, 0.85, 0.0), theta: 0.55, phi: 1.15, radius: 3.4, auto: true };
    this.view = "wide"; this.layout = "stack"; this.closeMode = "auto"; this.closeTarget = "keys";
    if (!headless) this._bindOrbit();
    this.t = 0; this.energy = 0; this.headNod = 0;
    this.song = { synth: [], pedal: [], drums: [], kick: [], knobs: [] };
    this.knobDefaults = Object.fromEntries(KNOBS.map((k) => [k.id, 0.5]));
    this.handR = { x: keyXL(60), z: 0.045, mode: "keys", knobT: 0 };
    this.stickState = { tip: V(-0.40, 0.95, 0.20), target: null };
    this.footR = { x: pedalX(29), z: PB_Z_HEEL - 0.05, press: 0 };
    this.footL = { press: 0 };
    this._eyeLook = new THREE.Vector3(0, 0.8, 0);
    this._tmpV = new THREE.Vector3(); this._tmpV2 = new THREE.Vector3();
    this._arPoint=new THREE.Vector3();this.arChanges=[];
    if(!headless)this.ar=new KnobAR(canvas.parentElement);
    this._resize();
    if (!headless) new ResizeObserver(() => this._resize()).observe(canvas.parentElement);
  }

  setSignal({signal=null,traces={}}={}) {this.signal=signal;this.signalTraces=traces;this.synth.display.set(this.patchName,this.knobValues??this.knobDefaults,this.arChanges.at(-1),signal);}

  _resize() {
    const r = this.headless ? {width:1000,height:800} : this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(64, Math.floor(r.width)), h = Math.max(64, Math.floor(r.height));
    // Setting an unchanged canvas size clears its drawing buffer. A frozen shot
    // must survive ResizeObserver delivery after its one completed render.
    if(w!==this.w||h!==this.h){this.renderer?.setSize(w,h,false);this.needsRender=true;}
    this.w = w; this.h = h;
    if (this.layout === "side") { this.split = Math.round(w * 0.6); this.rects = { main: [0, 0, this.split, h], close: [this.split, 0, w - this.split, h] }; }
    else { this.split = Math.round(h * 0.58); this.rects = { main: [0, h - this.split, w, this.split], close: [0, 0, w, h - this.split] }; }
    for (const c of [this.camEye, this.camWide]) { c.aspect = this.rects.main[2] / this.rects.main[3]; c.updateProjectionMatrix(); }
    this.camClose.aspect = this.rects.close[2] / this.rects.close[3]; this.camClose.updateProjectionMatrix();
  }
  setLayout(layout) { this.layout = layout; this._resize(); }
  cameraForClose(w,h) {
    if(w>700||h>340)return this.camClose;
    // A phone's short close-up needs air above the controls for readable AR.
    // Keep this framing even between gestures, avoiding a zoom on every turn.
    const camera=this._compactClose??=this.camClose.clone();camera.copy(this.camClose,false);
    camera.aspect=w/h;camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const bounds=arProtectedRegions(this,camera,w,h,{clip:false,allKnobs:true});
    if(bounds.length){
      const x0=Math.min(...bounds.map(b=>b.x)),x1=Math.max(...bounds.map(b=>b.x+b.width)),y0=Math.min(...bounds.map(b=>b.y)),y1=Math.max(...bounds.map(b=>b.y+b.height));
      const top=Math.min(110,h*.55),scale=Math.min(1,(w-24)/(x1-x0),(h-top-10)/(y1-y0));
      camera.zoom*=scale;camera.updateProjectionMatrix();
      const cx=w/2+((x0+x1)/2-w/2)*scale,cy=h/2+((y0+y1)/2-h/2)*scale;
      camera.projectionMatrix.elements[8]-=2*(w/2-cx)/w;
      camera.projectionMatrix.elements[9]+=2*((top+h-10)/2-cy)/h;
    }
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld();return camera;
  }
  getViews() {
    if(this.shotCamera)return [{camera:this.shotCamera,rect:[0,0,this.w,this.h]}];
    const close=this.rects.close;
    return [{camera:this.view==='eye'?this.camEye:this.camWide,rect:this.rects.main},{camera:this.cameraForClose(close[2],close[3]),rect:close}];
  }
  setView(view) {
    this.view = view; const o = this.orbit; o.auto = false;
    if (view === "wide") { o.theta = 0.55; o.phi = 1.15; o.radius = 3.4; o.auto = true; }
    if (view === "drums") { o.theta = -0.9; o.phi = 1.2; o.radius = 2.4; o.target.set(-0.4, 0.8, 0.0); }
    if (view === "synth") { o.theta = 1.2; o.phi = 1.15; o.radius = 2.2; o.target.set(0.3, 0.8, 0.2); }
    if (view === "top") { o.theta = 0.1; o.phi = 0.3; o.radius = 3.0; o.target.set(-0.05, 0.85, 0.05); }
    if (view === "front") { o.theta = Math.PI + 0.2; o.phi = 1.25; o.radius = 3.4; }
    if (view === "wide") o.target.set(-0.05, 0.85, 0.0);
  }
  setClose(mode) { this.closeMode = mode; }   // auto | keys | drums | knobs
  _bindOrbit() {
    const cv = this.canvas; const o = this.orbit; let drag = null;
    const inMain = (x, y) => { const [rx, ry, rw, rh] = this.rects.main; const gy = this.h - y; return x >= rx && x <= rx + rw && gy >= ry && gy <= ry + rh; };
    cv.addEventListener("pointerdown", (e) => { const r = cv.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; if (!inMain(x, y) || this.view === "eye") return; drag = { x: e.clientX, y: e.clientY, theta: o.theta, phi: o.phi }; cv.setPointerCapture(e.pointerId); o.auto = false; });
    cv.addEventListener("pointermove", (e) => { if (!drag) return; o.theta = drag.theta - (e.clientX - drag.x) * 0.006; o.phi = clamp(drag.phi - (e.clientY - drag.y) * 0.005, 0.2, 1.5); });
    const up = (e) => { if (!drag) return; drag = null; try { cv.releasePointerCapture(e.pointerId); } catch {} };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", (e) => { const r = cv.getBoundingClientRect(); if (!inMain(e.clientX - r.left, e.clientY - r.top)) return; e.preventDefault(); o.radius = clamp(o.radius * (e.deltaY > 0 ? 1.08 : 0.92), 0.8, 8); o.auto = false; }, { passive: false });
    cv.addEventListener("dblclick", () => { if (this.view !== "eye") this.setView("wide"); });
  }

  poseSeated() {
    const B = this.bones;
    this.robot.position.set(0, 0.51 + 1.0 * ROBOT_SCALE, 0.66);
    this.robot.rotation.y = Math.PI;
    B.Hips.rotation.set(0, 0, 0);
    B.LeftShoulder.rotation.set(0, 0, -0.05); B.RightShoulder.rotation.set(0, 0, 0.05);
    this.robot.updateMatrixWorld(true);
    this.armLen = { upper: SKELETON.LeftForeArm[0] * ROBOT_SCALE, fore: SKELETON.LeftHand[0] * ROBOT_SCALE };
    this.legLen = { thigh: -SKELETON.LeftLeg[1] * ROBOT_SCALE, shin: -SKELETON.LeftFoot[1] * ROBOT_SCALE };
  }

  /** 曲を渡す。synth: [{p,s,d,v,f}] pedal: [{p,s,d,v}] drums: [{p or k, s, v}] kick: [{s,v}] knobs: [{param,s,d,to}] (s は曲頭からの拍) */
  setSong({ synth = [], pedal = [], drums = [], kick = [], knobs = [] }, knobDefaults = null, patchName = "VESPER SYNTH2") {
    this.patchName=patchName;
    const byS = (a, b) => a.s - b.s;
    this.song = {
      synth: synth.map((n) => ({...n})).sort(byS), pedal: pedal.map((n) => ({...n})).sort(byS),
      drums: drums.map((n) => ({ ...n, k: n.k ?? KEY_OF_DRUM[n.p] ?? "sn" })).filter((n) => DRUMS[n.k]).sort(byS),
      kick: kick.slice().sort(byS), knobs: knobs.slice().sort(byS),
    };
    if (knobDefaults) this.knobDefaults = { ...this.knobDefaults, ...knobDefaults };
    this._initPose();
  }
  /** 最初の音に手足を構えておく (曲頭 0 拍目の音にも間に合うように) */
  _initPose() {
    this.t=0; this.energy=0; this.headNod=0; this._yaw=0; this._look=0; this.footL.press=0; this.footR.press=0;
    this._cp=null; this._cl=null; this._closeSwitchT=0;
    for (const k of Object.values(this.synth.keys)) { k.press=0; k.pivot.rotation.x=0; k.mat.emissiveIntensity=0; }
    for (const p of Object.values(this.pb.pedals)) { p.press=0; p.pivot.rotation.x=0; p.mat.emissiveIntensity=0; }
    for (const p of Object.values(this.drums.pads)) p.hit=0;
    for (const k of this.synth.knobs) k.lit=0;
    for (const h of Object.values(this.hands)) for(const f of h.fingers) {f.exactPose=null;f.contactPose=null;f.press=0;f.spread=0;f.root.rotation.set(0,0,0);f.joint.rotation.set(0,0,0);}
    const d0 = this.song.drums[0]; if (d0) { const d = DRUMS[d0.k]; this.stickState.tip.copy(d.pos).add(V(0, 0.11, d.r * 0.35)); }
    const p0 = this.song.pedal[0]; if (p0) { this.footR.x = pedalX(p0.p); this.footR.z = TOE_Z(p0.p); }
    const s0 = this.song.synth[0]; if (s0) { const first = this.song.synth.filter((n) => n.s - s0.s < 0.05); this.handR.x = first.reduce((a, n) => a + keyXL(n.p) - FINGER_OFFSET_M[clamp((n.f ?? 3) - 1, 0, 4)], 0) / first.length; this.handR.z = 0.045; }
    this.handR.mode = "keys";
  }
  /** つまみの値 (0..1) を、曲頭からの秒で */
  knobValueAt(param, sec, beatToSec) {
    // sec->beat inversion is avoided in the frame loop, which caches all values.
    return knobStateAt(this.knobDefaults, this.song.knobs, Infinity, beatToSec, sec)[param] ?? .5;
  }

  /* ── 2 本骨 IK (腕)。yaw: 手の向き (鍵盤の回転に合わせる)。pitch: 手首を下に向ける (つまみ用) ── */
  _solveArm(side, target, { yaw = 0, pitch = 0, roll = 0, pole = null, quaternion = null } = {}) {
    const B = this.bones; const sgn = side === "Left" ? 1 : -1;
    const shoulder = B[side + "Arm"], elbow = B[side + "ForeArm"], hand = B[side + "Hand"];
    const S = new THREE.Vector3(); shoulder.getWorldPosition(S);
    const a = this.armLen.upper, b = this.armLen.fore;
    const Dv = target.clone().sub(S); let d = Dv.length(); const maxD = (a + b) * 0.985; if (d > maxD) { Dv.multiplyScalar(maxD / d); d = maxD; }
    d = Math.max(d, Math.abs(a - b) + 0.01);
    const angE = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
    const dirN = Dv.clone().normalize();
    const outward = Math.sign(S.x) || 1;
    const pl = (pole ?? new THREE.Vector3(outward * 0.55, -0.85, 0.75)).clone().normalize();
    const perp = pl.clone().sub(dirN.clone().multiplyScalar(pl.dot(dirN))); if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0); perp.normalize();
    const E = S.clone().add(dirN.clone().multiplyScalar(a * Math.cos(angE))).add(perp.multiplyScalar(a * Math.sin(angE)));
    const setBone = (bone, from, to, restAxis) => { const parent = bone.parent; parent.updateWorldMatrix(true, false); const pq = new THREE.Quaternion(); parent.getWorldQuaternion(pq); const dirLocal = to.clone().sub(from).normalize().applyQuaternion(pq.clone().invert()); bone.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(restAxis, dirLocal)); bone.updateMatrixWorld(true); };
    setBone(shoulder, S, E, new THREE.Vector3(sgn, 0, 0));
    const Ew = new THREE.Vector3(); elbow.getWorldPosition(Ew);
    setBone(elbow, Ew, target, new THREE.Vector3(sgn, 0, 0));
    hand.updateWorldMatrix(true, false);
    const pq = new THREE.Quaternion(); hand.parent.getWorldQuaternion(pq);
    // 手の向き: 指の方向 (-z を yaw で回す) を pitch で下へ倒す、roll は指の軸まわり
    const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(rotY);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotY);
    const rotP = new THREE.Quaternion().setFromAxisAngle(right, -pitch);   // pitch > 0 で指先が下を向く
    fwd.applyQuaternion(rotP); const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotP);
    const rotR = new THREE.Quaternion().setFromAxisAngle(fwd, roll); up.applyQuaternion(rotR);
    // 指は手の骨のローカル +x*sgn に伸びる → ローカル x = fwd*sgn (piano/scene.js の (0,0,-sgn) と同じ)
    const xAxis = fwd.clone().multiplyScalar(sgn), yAxis = up, zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    hand.quaternion.copy(pq.clone().invert().multiply(quaternion ?? new THREE.Quaternion().setFromRotationMatrix(m)));
    hand.updateMatrixWorld(true);
  }
  /* ── 2 本骨 IK (脚): 足首を target へ。ひざは前 (+z 側 = ロボットの正面は -z なので、world -z) ── */
  _solveLeg(side, ankleTarget, footPitch = 0) {
    const B = this.bones; const hip = B[side + "UpLeg"], knee = B[side + "Leg"], foot = B[side + "Foot"];
    const H = new THREE.Vector3(); hip.getWorldPosition(H);
    const a = this.legLen.thigh, b = this.legLen.shin;
    const Dv = ankleTarget.clone().sub(H); let d = Dv.length(); const maxD = (a + b) * 0.99; if (d > maxD) { Dv.multiplyScalar(maxD / d); d = maxD; }
    d = Math.max(d, Math.abs(a - b) + 0.01);
    const angK = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
    const dirN = Dv.clone().normalize();
    const pole = new THREE.Vector3(0, 0.35, -1).normalize();
    const perp = pole.clone().sub(dirN.clone().multiplyScalar(pole.dot(dirN))); if (perp.lengthSq() < 1e-6) perp.set(0, 0, -1); perp.normalize();
    const K = H.clone().add(dirN.clone().multiplyScalar(a * Math.cos(angK))).add(perp.multiplyScalar(a * Math.sin(angK)));
    const setBone = (bone, from, to) => { const parent = bone.parent; parent.updateWorldMatrix(true, false); const pq = new THREE.Quaternion(); parent.getWorldQuaternion(pq); const dirLocal = to.clone().sub(from).normalize().applyQuaternion(pq.clone().invert()); bone.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dirLocal)); bone.updateMatrixWorld(true); };
    setBone(hip, H, K);
    const Kw = new THREE.Vector3(); knee.getWorldPosition(Kw);
    setBone(knee, Kw, ankleTarget);
    // 足: 床に平ら (つま先は -z)。footPitch で つま先を下げる
    foot.updateWorldMatrix(true, false);
    const pq = new THREE.Quaternion(); foot.parent.getWorldQuaternion(pq);
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));   // ロボットは y 軸に π 回っているので x と z を反転
    const wq = new THREE.Quaternion().setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), footPitch));
    foot.quaternion.copy(pq.clone().invert().multiply(wq));
    foot.updateMatrixWorld(true);
  }

  /* ── 指先を鍵の上へ (piano/scene.js の _placeFinger を鍵盤ローカル座標で) ── */
  _placeFinger(hand, f, p, keyPress, hover) {
    const black = isBlack(p); const sgn = hand.sgn, root = f.root, joint = f.joint, tip = f.tip;
    const T = this._tmpV; const kb = this.synth.group;
    const measure = () => { root.updateMatrixWorld(true); tip.getWorldPosition(T); return [T.x, T.y, T.z]; };
    const lo = [-1.1, sgn > 0 ? -1.35 : -0.4, sgn > 0 ? -1.8 : -0.05], hi = [1.1, sgn > 0 ? 0.4 : 1.35, sgn > 0 ? 0.05 : 1.8];
    const get = () => [root.rotation.y, root.rotation.z, joint.rotation.z];
    const set = (q) => { root.rotation.y = clamp(q[0], lo[0], hi[0]); root.rotation.z = clamp(q[1], lo[1], hi[1]); joint.rotation.z = clamp(q[2], lo[2], hi[2]); };
    const restPose = get();
    const zLo = black ? -0.125 : -0.100, zHi = black ? -0.060 : -0.015;
    const cur = measure(); const curL = kb.worldToLocal(V(cur[0], cur[1], cur[2]));
    const zT = clamp(curL.z, zLo, zHi);
    const dip = keyPress * (KEY_DIP / (black ? BLACK_L : WHITE_L)) * (zT - KEY_PIVOT_Z);
    const yT = (black ? BLACK_TOP : 0) - dip + TIP_R + hover;
    const tw = kb.localToWorld(V(keyXL(p), yT, zT)); const target = [tw.x, tw.y, tw.z];
    const solveFrom = (q0) => {
      set(q0); let base = measure(); let e = Math.hypot(target[0] - base[0], target[1] - base[1], target[2] - base[2]);
      for (let it = 0; it < 6 && e >= 0.0004; it++) {
        const q = get(); const err = [target[0] - base[0], target[1] - base[1], target[2] - base[2]]; const J = [];
        for (let k = 0; k < 3; k++) { const hk = q[k] + 0.015 > hi[k] ? -0.015 : 0.015; const q2 = q.slice(); q2[k] += hk; set(q2); const m = measure(); J.push([(m[0] - base[0]) / hk, (m[1] - base[1]) / hk, (m[2] - base[2]) / hk]); }
        const lam = 1e-4; const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
        for (let a = 0; a < 3; a++) { for (let b = 0; b < 3; b++) { let sum = 0; for (let r = 0; r < 3; r++) sum += J[a][r] * J[b][r]; A[a][b] = sum + (a === b ? lam : 0); } let gs = 0; for (let r = 0; r < 3; r++) gs += J[a][r] * err[r]; g[a] = gs; }
        const dq = solve3(A, g); if (!dq) { set(q); break; }
        set([q[0] + clamp(dq[0], -0.6, 0.6), q[1] + clamp(dq[1], -0.6, 0.6), q[2] + clamp(dq[2], -0.6, 0.6)]);
        base = measure(); e = Math.hypot(target[0] - base[0], target[1] - base[1], target[2] - base[2]);
      }
      return { q: get(), base, e };
    };
    let best = null;
    for (const q0 of f.exactPose ? [f.exactPose, restPose] : [restPose]) { const r = solveFrom(q0); if (!best || r.e < best.e) best = r; if (best.e < 0.002) break; }
    set(best.q); root.updateMatrixWorld(true); f.exactPose = best.q;
    return new THREE.Vector3(target[0] - best.base[0], target[1] - best.base[1], target[2] - best.base[2]);
  }

  /* ── 毎フレーム ── */
  update(beat, beatToSec, dt, playing) {
    this.t += dt;
    const B = this.bones; const now = beatToSec(beat);
    this.knobValues = knobStateAt(this.knobDefaults, this.song.knobs, beat, beatToSec);
    this.arChanges=knobChangesAt(this.knobDefaults,this.song.knobs,beat,beatToSec);
    const S = this.song;
    // ── 今の音を集める
    const LOOK = 0.5, LEAD = 0.10;
    const active = [], lead = [], upcoming = []; let accent = 0;
    for (const n of S.synth) { const s = beatToSec(n.s), e = beatToSec(n.s + n.d); if (e < now - 0.3) continue; if (s > now + LOOK + 0.2) break; const held = now < Math.max(e, s + 0.09); if (s <= now + 0.004 && held) { active.push(n); lead.push(n); if (now - s < 0.06) accent = Math.max(accent, n.v / 127); } else if (s > now && s <= now + LEAD) { lead.push(n); upcoming.push(n); } else if (s > now && s <= now + LOOK) upcoming.push(n); }
    // つまみ: 今 (手を伸ばす時間込みで) 回しているもの
    const knobMotion=knobMotionAt(S.knobs,now,beatToSec),knobEv=knobMotion?.event??null;
    // 足鍵盤: 鳴っている音 / 次の音
    let pedNow = null, pedNext = null;
    for (const n of S.pedal) { const s = beatToSec(n.s), e = beatToSec(n.s + n.d); if (e < now - 0.05) continue; if (s > now + 0.6) break; if (s <= now + 0.004) pedNow = n; else if (!pedNext) pedNext = n; }
    // ドラム: 直前の打と次の打
    let hitPrev = null, hitNext = null, drumBurst = 0;
    for (const n of S.drums) { const s = beatToSec(n.s); if (s <= now + 0.004) { hitPrev = n; hitPrev._sec = s; } else { if (!hitNext) { hitNext = n; hitNext._sec = s; } if (s - now < 1.0 && n.k !== "hh") drumBurst++; if (s - now > 1.0) break; } }
    let kickPrev = null, kickNext = null;
    for (const n of S.kick) { const s = beatToSec(n.s); if (s <= now + 0.004) { kickPrev = s; } else { kickNext = s; break; } }

    // ── 体
    const density = active.length + (hitPrev && now - hitPrev._sec < 0.15 ? 1 : 0) + (kickPrev != null && now - kickPrev < 0.12 ? 1 : 0);
    if (hitPrev && now - hitPrev._sec < 0.05) accent = Math.max(accent, hitPrev.v / 127);
    if (kickPrev != null && now - kickPrev < 0.05) accent = Math.max(accent, 0.8);
    this.energy = lerp(this.energy, clamp(density / 3 + accent * 0.5, 0, 1.2), Math.min(1, dt * 2.5));
    if (accent > 0.75) this.headNod = Math.max(this.headNod, accent);
    this.headNod = lerp(this.headNod, 0, Math.min(1, dt * 5));
    const sway = Math.sin(this.t * 0.9) * 0.03 * (0.4 + this.energy) + Math.sin(this.t * 0.37) * 0.015;
    const lean = 0.12 + this.energy * 0.10;
    const kbCenter = this.synth.group.localToWorld(V(clamp(this.handR.x, 0, KB_W), 0, 0));
    const yawTarget = clamp((kbCenter.x - 0.15) * 0.9 * (this.handR.mode === "idle" ? 0.3 : 1), -0.35, 0.55);
    this._yaw = lerp(this._yaw ?? 0, yawTarget, Math.min(1, dt * 3));
    B.LowerBack.rotation.set(lean * 0.5, this._yaw * 0.35, sway * 0.5);
    B.Spine.rotation.set(lean * 0.4, this._yaw * 0.35 + sway * 0.3, sway * 0.5);
    B.Spine1.rotation.set(lean * 0.2, this._yaw * 0.3, sway * 0.3);
    B.Neck1.rotation.set(0.1, 0, 0);
    const lookX = this.handR.mode === "knob" ? 0.4 : hitNext && hitNext._sec - now < 0.25 && hitNext.k !== "hh" ? -0.5 : 0.1;
    this._look = lerp(this._look ?? 0, lookX, Math.min(1, dt * 4));
    B.Head.rotation.set(0.38 + this.headNod * 0.2 + Math.sin(this.t * 1.3) * 0.015, this._look - this._yaw * 0.6, -sway * 0.5);
    this.robotParts.visor.material.emissiveIntensity = 1.6 + this.energy * 1.4 + this.headNod * 2;
    this.robotParts.core.material.emissiveIntensity = 3 + Math.sin(this.t * 3) * 0.6 + this.energy * 2;
    this.robot.updateMatrixWorld(true);

    // ── 鍵 (シンセ)
    for (const k of Object.values(this.synth.keys)) k.target = 0;
    for (const n of active) { const k = this.synth.keys[n.p]; if (k) k.target = 0.7 + 0.3 * (n.v / 127); }
    for (const k of Object.values(this.synth.keys)) { const prev = k.press; k.press = lerp(k.press, k.target, Math.min(1, dt * (k.target ? 60 : 16))); if (Math.abs(k.press - prev) > 1e-4 || k.press > 1e-3) { k.pivot.rotation.x = Math.atan(KEY_DIP / (k.black ? BLACK_L : WHITE_L)) * k.press; k.mat.emissiveIntensity = k.press * (k.black ? 1.1 : 0.55); } }
    // ── つまみの回転と点灯
    for (const kn of this.synth.knobs) {
      const v = playing || S.knobs.length ? this.knobValues[kn.id] : (this.knobDefaults[kn.id] ?? 0.5);
      kn.value = v; kn.rot.rotation.y = -(v - 0.5) * 2 * KNOB_ANGLE;
      const on = knobEv && knobEv.param === kn.id;
      kn.lit = lerp(kn.lit, on ? 1 : 0, Math.min(1, dt * 10)); kn.arc.geometry.setDrawRange(0,Math.round(v*96)*6);
      kn.chase.visible=!!on&&now>=beatToSec(knobEv.s)&&now<=beatToSec(knobEv.s+knobEv.d);
      if(kn.chase.visible){const a=now*9;kn.chase.position.set(Math.sin(a)*.0185,-.005,Math.cos(a)*.0185);}
    }

    this.synth.display.set(this.patchName,this.knobValues,this.arChanges.at(-1),this.signal);

    // ── 右手: 鍵盤 or つまみ
    const hand = this.hands.Right; const st = this.handR;
    const FI = (n) => n._f ?? clamp((n.f ?? 3) - 1, 0, 4);
    if (knobEv) {
      st.mode = "knob";
      const ki = KNOBS.findIndex((k) => k.id === knobEv.param);
      const kb = this.synth.group;
      // 手のひらをつまみの上・少し手前に。指は下向き (pitch)、回す量で手首をひねる (roll)
      const kv = this.knobValues[knobEv.param];
      const there=knobMotion.there;
      const geometry=(index,value,lift=0)=>{
        const holder=this.synth.knobs[index].holder;holder.updateWorldMatrix(true,true);
        const angle=-(value-.5)*2*KNOB_ANGLE,centre=holder.getWorldPosition(V(0,0,0));
        const axis=V(0,1,0).applyQuaternion(holder.getWorldQuaternion(new THREE.Quaternion())),turn=new THREE.Quaternion().setFromAxisAngle(axis,-angle);
        // Radius of the actual tapered cap at local y=.004, plus fingertip pad.
        const radius=.0125+(.011-.0125)*(.004+.0065)/.017+TIP_R;
        const targets=[-1,1].map(sign=>holder.localToWorld(V(sign*radius*Math.cos(angle),.004,sign*radius*Math.sin(angle))).add(V(0,lift*.075,0)));
        const palm=kb.localToWorld(V(knobXL(index)+.045,KNOB_Y+.140+lift*.05,KNOB_Z+.10)).sub(centre).applyQuaternion(turn).add(centre);
        return {targets,palm,turn};
      };
      const pose=geometry(ki,kv,1-there),{targets}=pose,palmW=pose.palm,turn=pose.turn;
      if(knobMotion.travel){
        const {from,progress:u}=knobMotion.travel,fi=KNOBS.findIndex(k=>k.id===from.param),prev=geometry(fi,this.knobValues[from.param]);
        // Smoothly lift between controls; use the whole available gap rather
        // than return to the keys and start a new reach for every gesture.
        const blend=u*u*(3-2*u),lift=Math.sin(Math.PI*u)*.025;
        const next=geometry(ki,kv);palmW.copy(prev.palm).lerp(next.palm,blend).add(V(0,lift,0));
        turn.copy(prev.turn).slerp(next.turn,blend);
        const rotation=turn.clone().multiply(prev.turn.clone().invert());
        for(let i=0;i<2;i++)targets[i].copy(prev.targets[i]).sub(prev.palm).applyQuaternion(rotation).add(palmW);
      }
      st.x=knobXL(ki); st.z=KNOB_Z+.15;
      hand.bone.position.copy(hand.restPos);
      const orientation={yaw:KB_YAW,pitch:.45,roll:0,pole:V(.7,-.6,.5)};
      this._solveArm("Right",palmW,orientation);
      orientation.quaternion=turn.clone().multiply(hand.bone.getWorldQuaternion(new THREE.Quaternion()));
      this._solveArm("Right",palmW,orientation);
      hand.fingers.forEach((f,i)=>{f.exactPose=null;if(i>1){f.root.rotation.set(0,-hand.sgn*.50, -hand.sgn*2.25);f.joint.rotation.set(0,0,-hand.sgn*.90);}});
      for(let pass=0;pass<12;pass++) {
        const err=V(0,0,0);let worst=0;
        for(let i=0;i<2;i++){const e=placeContact(hand,hand.fingers[i],targets[i],hand.fingers[i].contactPose);err.add(e);worst=Math.max(worst,e.length());}
        if(worst<.0002) break;
        palmW.add(err.multiplyScalar(.5)); this._solveArm("Right",palmW,orientation);
      }
      this.knobContacts=targets;

    } else {
      // 鍵盤。piano/scene.js と同じ段取り (1 本の手)
      let list;
      { const mean = (arr) => arr.reduce((a, n) => a + keyXL(n.p), 0) / arr.length; const act = active; const up = lead.filter((n) => !act.includes(n)); const soon = lead.filter((n) => { const ds = beatToSec(n.s) - now; return ds >= -0.12 && ds <= 0.06; });
        let kept = act; if (soon.length) { const cx = mean(soon); kept = act.filter((n) => Math.abs(keyXL(n.p) - cx) <= 0.12); }
        if (kept.length) { const cx = mean(kept); list = kept.concat(up.filter((n) => Math.abs(keyXL(n.p) - cx) <= 0.12)); }
        else { const src = up.length ? up : upcoming; if (src.length) { const s0 = Math.min(...src.map((n) => beatToSec(n.s))); list = src.filter((n) => beatToSec(n.s) - s0 <= 0.03); } else list = []; } }
      { const conflict = (arr) => { for (const n of arr) n._f = clamp((n.f ?? 3) - 1, 0, 4); const used = new Map(); for (const n of arr) { const prev = used.get(n._f); if (prev && prev.p !== n.p) return true; used.set(n._f, n); } const srt = arr.slice().sort((a, b) => a.p - b.p); for (let i = 1; i < srt.length; i++) { if (srt[i].p === srt[i - 1].p) continue; if (srt[i]._f < srt[i - 1]._f) return true; } return false; };
        let bad = conflict(list);
        if (bad && list.some((n) => beatToSec(n.s) > now)) { const fresh = list.filter((n) => !(beatToSec(n.s) <= now && beatToSec(n.s + n.d) <= now + 0.004)); if (fresh.length < list.length && !conflict(fresh)) { list = fresh; bad = false; } }
        if (bad && list.some((n) => beatToSec(n.s) > now) && list.some((n) => beatToSec(n.s) <= now)) { const cur = list.filter((n) => beatToSec(n.s) <= now); if (!conflict(cur)) { list = cur; bad = false; } }
        if (bad) { const uniq = [...new Map(list.map((n) => [n.p, n])).values()].sort((a, b) => a.p - b.p); const k = Math.min(5, uniq.length); const plan = { 1: [0], 2: [0, 4], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4] }[k]; uniq.forEach((n, i) => { const fi = plan[Math.min(i, k - 1)]; for (const m of list) if (m.p === n.p) m._f = fi; }); } }
      const inList = new Set(list);
      for (const n of lead) n._released = !inList.has(n);
      for (const n of active) n._released = !inList.has(n);
      let palmX = st.x, palmZ = 0.045;
      if (list.length) {
        st.mode = "keys";
        const offs = list.map((n) => keyXL(n.p) - FINGER_OFFSET_M[FI(n)]); palmX = offs.reduce((a, b) => a + b, 0) / offs.length;
        let zsum = 0, wsum = 0; for (const n of list) { const fi = FI(n); const w = FINGER_Z_WEIGHT[fi]; zsum += ((isBlack(n.p) ? -0.085 : -0.040) + FINGER_REACH_Z[fi]) * w; wsum += w; }
        palmZ = zsum / wsum - 0.85 * ROBOT_SCALE;
      } else { st.mode = playing ? "keys" : "idle"; palmX = lerp(st.x, keyXL(62), 0.002); palmZ = 0.05; }
      const speed = st.mode === "knob" ? 12 : lead.length ? 55 : 22;
      st.x = lerp(st.x, palmX, Math.min(1, dt * speed)); if (Math.abs(st.x - palmX) < 0.0004) st.x = palmX;
      st.z = lerp(st.z, palmZ, Math.min(1, dt * (lead.length ? 40 : 12))); if (Math.abs(st.z - palmZ) < 0.0004) st.z = palmZ;
      const palmY = 0.044;
      const palmW = this.synth.group.localToWorld(V(st.x, palmY, st.z + 0.85 * ROBOT_SCALE));
      hand.bone.position.copy(hand.restPos);
      this._solveArm("Right", palmW, { yaw: KB_YAW, pole: new THREE.Vector3(0.7, -0.75, 0.55) });
      const pressing = new Map(); for (const n of active) if (inList.has(n)) pressing.set(FI(n), n);
      const ready = new Map(); for (const n of lead) { if (!inList.has(n)) continue; const i = FI(n); if (!pressing.has(i) && !ready.has(i)) ready.set(i, n); }
      const nextByF = new Map(); for (const n of upcoming) { const i = FI(n); if (!nextByF.has(i)) nextByF.set(i, n); }
      const exactList = [];
      hand.fingers.forEach((f, i) => {
        const n = pressing.get(i) ?? ready.get(i) ?? nextByF.get(i);
        const p = pressing.has(i) ? 1 : ready.has(i) ? 0.4 : nextByF.has(i) ? 0.2 : 0;
        f.press = lerp(f.press, p, Math.min(1, dt * (p === 1 ? 70 : 18)));
        const keyTop = n && isBlack(n.p) ? BLACK_TOP : 0;
        const restDrop = clamp((palmY - keyTop - 0.018) / f.lenM, 0, 0.95), pressDrop = clamp((palmY - keyTop + 0.006) / f.lenM, 0, 0.98);
        const ang = Math.asin(lerp(restDrop, pressDrop, f.press));
        f.root.rotation.z = hand.sgn * -(ang * 0.75); f.joint.rotation.z = hand.sgn * -(ang * 0.45 + 0.1);
        let shift = 0; if (n) shift = keyXL(n.p) - (st.x + FINGER_OFFSET_M[i]);
        const target = clamp(shift / Math.max(0.03, f.lenM * 0.9), -0.8, 0.8);
        f.spread = lerp(f.spread, target, Math.min(1, dt * 30)); f.root.rotation.y = -Math.asin(f.spread);
        if (n && (pressing.has(i) || ready.has(i))) exactList.push({ f, n, i, hover: pressing.has(i) ? 0 : 0.016 * (1 - Math.min(1, f.press / 0.4)) + 0.004 }); else f.exactPose = null;
      });
      let shiftAcc = new THREE.Vector3();
      for (let pass = 0; pass < 3; pass++) {
        const resid = new THREE.Vector3(); let nres = 0;
        for (const e of exactList) { const k = this.synth.keys[e.n.p]; const err = this._placeFinger(hand, e.f, e.n.p, k ? k.press : 0, e.hover); if (pressing.has(e.i) && err.length() > 0.0003) { resid.add(err); nres++; } }
        if (pass < 2 && nres) { resid.divideScalar(nres); const pq = new THREE.Quaternion(); hand.bone.parent.getWorldQuaternion(pq); shiftAcc.add(resid.clone().applyQuaternion(pq.invert()).divideScalar(ROBOT_SCALE)); const maxShift = 0.045 / ROBOT_SCALE; if (shiftAcc.length() > maxShift) shiftAcc.setLength(maxShift); hand.bone.position.copy(hand.restPos).add(shiftAcc); hand.bone.updateMatrixWorld(true); } else break;
      }
    }

    // ── 左手: スティック
    {
      const ss = this.stickState; const hitR = 0.09;
      const padPoint = (k) => { const d = DRUMS[k]; return d.pos.clone().add(new THREE.Vector3(0, 0, d.kind === "cymbal" ? d.r * 0.55 : d.r * 0.35).applyAxisAngle(new THREE.Vector3(1, 0, 0), d.tilt)); };   // 打点: 手前寄り
      let tipTarget;
      const restTip = V(-0.42, 0.98, 0.16);
      let speed = 14;
      if (hitPrev && now - hitPrev._sec < 0.05) {
        // 打った直後: 打点から跳ね返る (次の打が近くても、まず跳ねる)
        const T = padPoint(hitPrev.k); const dtp = now - hitPrev._sec;
        tipTarget = T.clone().add(V(0, 0.06 * Math.min(1, dtp / 0.05), 0)); speed = 40;
      } else if (hitNext && hitNext._sec - now < 0.35) {
        const T = padPoint(hitNext.k); const dtn = hitNext._sec - now;
        const h = dtn > 0.14 ? 0.11 : 0.11 * Math.pow(dtn / 0.14, 0.7);   // 振り上げ → 振り下ろし
        tipTarget = T.clone().add(V(0, h, 0)); speed = dtn < 0.14 ? 60 : 24;
      } else if (hitNext) { const T = padPoint(hitNext.k); tipTarget = T.clone().add(V(0, 0.11, 0)); speed = 12; }
      else tipTarget = restTip;
      ss.tip.lerp(tipTarget, Math.min(1, dt * speed));
      // 打った瞬間: 太鼓を震わせ、灯す
      for (const pad of Object.values(this.drums.pads)) pad.hit = lerp(pad.hit, 0, Math.min(1, dt * 9));
      if (hitPrev && now - hitPrev._sec < 0.03) { const pad = this.drums.pads[hitPrev.k]; pad.hit = Math.max(pad.hit, hitPrev.v / 127); }
      for (const pad of Object.values(this.drums.pads)) {
        pad.holder.position.copy(pad.pos);
        // Phase starts at the strike, rather than an unrelated animation clock.
        const event=S.drums.findLast(n=>n.k===pad.idx&&beatToSec(n.s)<=now+.0001);
        const age=event?Math.max(0,now-beatToSec(event.s)):100;
        const ring=pad.kind==='cymbal'?Math.exp(-age*(pad.idx==='cr'?2.1:8))*(event?.v??0)/127:0;
        pad.holder.rotation.x=pad.tilt+ring*.12*Math.sin(age*27);
        pad.holder.rotation.z=ring*.055*Math.sin(age*33);
      }

      const Sh = B.LeftArm.getWorldPosition(new THREE.Vector3());
      const dir = ss.tip.clone().sub(Sh.clone().add(V(-.06,-.10,-.18))).normalize();
      const localUp=V(0,1,0).addScaledVector(STICK_AXIS,-STICK_AXIS.y).normalize();
      const worldUp=V(0,1,0).addScaledVector(dir,-dir.y).normalize();
      const localBasis=new THREE.Matrix4().makeBasis(STICK_AXIS,localUp,new THREE.Vector3().crossVectors(STICK_AXIS,localUp));
      const worldBasis=new THREE.Matrix4().makeBasis(dir,worldUp,new THREE.Vector3().crossVectors(dir,worldUp));
      const q=new THREE.Quaternion().setFromRotationMatrix(worldBasis.multiply(localBasis.invert()));
      const wrist=ss.tip.clone().addScaledVector(dir,-STICK_LEN).sub(this.stick.pivot.position.clone().applyQuaternion(q).multiplyScalar(ROBOT_SCALE));
      this._solveArm("Left",wrist,{pole:V(-.7,-.6,.5)});
      const hand=this.hands.Left, pq=hand.bone.parent.getWorldQuaternion(new THREE.Quaternion());
      hand.bone.quaternion.copy(pq.invert().multiply(q)); hand.bone.updateMatrixWorld(true);
      hand.fingers.forEach((f,i)=>{
        const z=f.root.position.z, u=(z-this.stick.pivot.position.z)/STICK_AXIS.z;
        const target=this.stick.pivot.position.clone().addScaledVector(STICK_AXIS,u);
        target.x += i===0 ? .20 : -.20;
        const world=hand.bone.localToWorld(target);
        if (!f.gripPose) { placeContact(hand,f,world); f.gripPose=f.contactPose; }
        else { const q=f.gripPose; f.root.rotation.y=q[0];f.root.rotation.z=q[1];f.joint.rotation.z=q[2];f.root.updateMatrixWorld(true); }
        f.exactPose=null;
      });
    }

    // ── 左足: バスドラのペダル
    {
      const pd = this.drums.pedal; const fl = this.footL;
      let pressT = 0;
      if (kickNext != null && kickNext - now < 0.06) pressT = 1 - (kickNext - now) / 0.06;
      if (kickPrev != null && now - kickPrev < 0.09) pressT = Math.max(pressT, 1 - (now - kickPrev) / 0.09);
      fl.press = kickPrev != null && now-kickPrev < .022 ? 1 : lerp(fl.press, pressT, Math.min(1, dt * 40));
      const boardAng = .24 - fl.press*.20;
      pd.hinge.rotation.x = boardAng;
      pd.beater.rotation.x = .66 - fl.press*.835;
      pd.hinge.updateMatrixWorld(true); pd.beater.updateMatrixWorld(true);
      const contact=pd.hinge.localToWorld(V(0,.006,-.17));
      const fq=new THREE.Quaternion().setFromAxisAngle(V(0,1,0),Math.PI).multiply(new THREE.Quaternion().setFromAxisAngle(V(1,0,0),-boardAng));
      const ankle=contact.clone().sub(V(0,-.60,2.5).multiplyScalar(ROBOT_SCALE).applyQuaternion(fq));
      this._solveLeg("Left",ankle,-boardAng);
      pd.contact=contact;
      if(pd.chain) {
        const a=pd.hinge.localToWorld(V(0,.006,-.235)), b=pd.beater.localToWorld(V(0,.027,.017));
        pd.chain.position.copy(a).add(b).multiplyScalar(.5); pd.chain.scale.y=a.distanceTo(b); pd.chain.quaternion.setFromUnitVectors(V(0,1,0),b.sub(a).normalize());
      }
    }

    // ── 右足: 足鍵盤
    {
      const fr = this.footR; const pedals = this.pb.pedals;
      for (const p of Object.values(pedals)) p.target = 0;
      // 次の音が近くて違うペダルなら、今の音は早めに離して足を移す (実際の足も先に動く)
      const nextSoon = pedNext && beatToSec(pedNext.s) - now < 0.30 && (!pedNow || (pedNext.p !== pedNow.p && now - beatToSec(pedNow.s) > 0.10));
      const tgt = nextSoon ? pedNext : (pedNow ?? pedNext);
      let pressT = 0;
      if (pedNow && !nextSoon) { pressT = 1; const p = pedals[pedNow.p]; if (p) p.target = 1; }
      else if (pedNow) { const p = pedals[pedNow.p]; if (p) p.target = 0.5; }
      const tx = tgt ? pedalX(tgt.p) : fr.x; const tz = tgt ? TOE_Z(tgt.p) : fr.z;
      const moveSpeed = nextSoon ? 32 : 10;
      fr.x = lerp(fr.x, tx, Math.min(1, dt * moveSpeed)); fr.z = lerp(fr.z, tz, Math.min(1, dt * moveSpeed));
      fr.press = lerp(fr.press, pressT, Math.min(1, dt * 35));
      for (const p of Object.values(pedals)) { const prev = p.press; p.press = lerp(p.press, p.target, Math.min(1, dt * (p.target ? 50 : 14))); if (Math.abs(p.press - prev) > 1e-4 || p.press > 1e-3) { p.pivot.rotation.x = 0.05 * p.press; p.mat.emissiveIntensity = p.press * 0.7; } }
      const pedal=tgt?pedals[tgt.p]:null;
      let contact=V(fr.x,PB_TOP,fr.z);
      if(pedal) { pedal.pivot.updateMatrixWorld(true); contact=pedal.pivot.localToWorld(V(0,.012,fr.z-pedal.pivot.position.z)); contact.x=fr.x; }
      contact.y+=(1-fr.press)*.02;
      const pitch=-(pedal?.press??0)*.05;
      const fq=new THREE.Quaternion().setFromAxisAngle(V(0,1,0),Math.PI).multiply(new THREE.Quaternion().setFromAxisAngle(V(1,0,0),pitch));
      this._solveLeg("Right",contact.clone().sub(V(0,-.60,2.5).multiplyScalar(ROBOT_SCALE).applyQuaternion(fq)),pitch);
      this.pedalContact=contact;
    }

    // ── カメラ
    const eyePos = new THREE.Vector3(); this.robotParts.eye.getWorldPosition(eyePos);
    const eyeTarget = this.handR.mode === "knob" ? this.synth.group.localToWorld(V(this.handR.x, 0, KNOB_Z)) : hitNext && hitNext._sec - now < 0.25 && hitNext.k !== "hh" ? DRUMS[hitNext.k].pos.clone() : this.synth.group.localToWorld(V(clamp(this.handR.x, 0.05, KB_W - 0.05), 0, -0.05));
    this._eyeLook.lerp(eyeTarget, Math.min(1, dt * 3));
    this.camEye.position.set(eyePos.x, eyePos.y + 0.02, eyePos.z + 0.02); this.camEye.lookAt(this._eyeLook); this.camEye.rotateZ(-sway * 0.35);
    // 寄りカメラ: auto は 右手 (鍵盤/つまみ) と ドラム (フィル) を切り替える
    let want = this.closeMode;
    if (want === "auto") want = this.handR.mode === "knob" ? "knobs" : drumBurst >= 3 || (hitNext && hitNext._sec - now < 0.3 && (hitNext.k === "cr" || hitNext.k.startsWith("t"))) ? "drums" : "keys";
    if (want !== this.closeTarget) { this._closeSwitchT = (this._closeSwitchT ?? 0) + dt; if (this._closeSwitchT > 0.35 || want === "knobs") { this.closeTarget = want; this._closeSwitchT = 0; } } else this._closeSwitchT = 0;
    const kb = this.synth.group;
    let cp, cl;
    if (this.closeTarget === "knobs") { const hx = clamp(this.handR.x, 0.1, KB_W - 0.1); cp = kb.localToWorld(V(hx - 0.26, 0.40, KNOB_Z - 0.28)); cl = kb.localToWorld(V(hx - 0.02, 0.02, KNOB_Z)); }
    else if (this.closeTarget === "drums") { cp = V(-0.05, 1.55, 0.95); cl = V(-0.42, 0.85, 0.0); }
    else { const hx = clamp(this.handR.x, 0.08, KB_W - 0.08); cp = kb.localToWorld(V(hx * 0.7 + 0.08, 0.36, 0.34)); cl = kb.localToWorld(V(hx * 0.8 + 0.05, 0.0, -0.06)); }
    this._cp = (this._cp ?? cp.clone()).lerp(cp, Math.min(1, dt * 2.5)); this._cl = (this._cl ?? cl.clone()).lerp(cl, Math.min(1, dt * 2.5));
    this.camClose.position.copy(this._cp); this.camClose.lookAt(this._cl);
    const o = this.orbit;
    if (o.auto) { o.autoT = (o.autoT ?? 0) + dt; o.theta = 0.45 + 0.7 * Math.sin(o.autoT * 0.05); }
    this.camWide.position.set(o.target.x + o.radius * Math.sin(o.phi) * Math.sin(o.theta), o.target.y + o.radius * Math.cos(o.phi), o.target.z + o.radius * Math.sin(o.phi) * Math.cos(o.theta));
    this.camWide.lookAt(o.target);
  }

  /* ── リハーサル: 描画せずに曲を通し、打点・指先・つま先が合っているかを測る ── */
  rehearse(beatToSec, { fps = 60, endBeat = null } = {}) {
    const S = this.song; const T = new THREE.Vector3();
    const all = [...S.synth.map((n) => ({ kind: "synth", n, at: beatToSec(n.s) })), ...S.drums.map((n) => ({ kind: "drum", n, at: beatToSec(n.s) })), ...S.pedal.map((n) => ({ kind: "pedal", n, at: beatToSec(n.s) })), ...S.kick.map((n)=>({kind:"kick",n,at:beatToSec(n.s)})), ...S.knobs.flatMap((n) => [0,.5,.98].map(u=>({ kind: "knob", n, at: beatToSec(n.s+n.d*u) })))].sort((a, b) => a.at - b.at);
    const end = endBeat ?? Math.max(0, ...S.synth.map((n) => n.s + n.d), ...S.pedal.map((n) => n.s + n.d), ...S.drums.map((n) => n.s), ...S.kick.map((n) => n.s), ...S.knobs.map((n) => n.s + n.d));
    const endSec = beatToSec(end) + 0.5;
    const secToBeat = (sec) => { let lo = 0, hi = end + 8; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (beatToSec(mid) < sec) lo = mid; else hi = mid; } return (lo + hi) / 2; };
    const dt = 1 / fps; let ci = 0; const misses = []; const counts = { synth: 0, drum: 0, pedal: 0, knob: 0, kick: 0, grip: 0 };
    const kb = this.synth.group;
    this._initPose();
    const checkKnob=c=>{
      counts.knob++;
      for(let i=0;i<2;i++){
        this.hands.Right.fingers[i].tip.getWorldPosition(T);
        const dist=this.knobContacts?T.distanceTo(this.knobContacts[i]):Infinity;
        const kn=this.synth.knobs.find(k=>k.id===c.n.param),local=kn.holder.worldToLocal(T.clone());
        const radius=.0125+(.011-.0125)*(local.y+.0065)/.017,surfaceGap=Math.hypot(local.x,local.z)-radius-TIP_R;
        if(dist>.008||Math.abs(surfaceGap)>.002||local.y<-.0065||local.y>.0105)misses.push({kind:"knob",param:c.n.param,s:c.n.s,f:i+1,dist:+dist.toFixed(4),surfaceGap:+surfaceGap.toFixed(4)});
      }
    };
    for (let sec = 0; sec <= endSec; sec += dt) {
      const due=[];while(ci<all.length&&all[ci].at<=sec)due.push(all[ci++]);
      // Knob samples are exact instants, before the next rendered frame can
      // enter a transfer. A zero dt preserves the normal fixed-rate animation
      // integrators (foot/key depression, stick recovery and body sway).
      for(const c of due)if(c.kind==="knob"){this.update(secToBeat(c.at),beatToSec,0,true);checkKnob(c);}
      this.update(secToBeat(sec),beatToSec,dt,true);
      for(const c of due){if(c.kind==="knob")continue;counts[c.kind]++;
        if (c.kind === "synth") {
          const n = c.n;
          const f = this.hands.Right.fingers[n._f ?? clamp((n.f ?? 3) - 1, 0, 4)]; f.tip.getWorldPosition(T); const L = kb.worldToLocal(T.clone());
          const black = isBlack(n.p); const dx = L.x - keyXL(n.p); const zLo = black ? -0.13 : -0.105, zHi = black ? -0.055 : 0.0; const dz = L.z < zLo ? L.z - zLo : L.z > zHi ? L.z - zHi : 0;
          const k = this.synth.keys[n.p]; const dip = (k ? k.press : 0) * (KEY_DIP / (black ? BLACK_L : WHITE_L)) * (clamp(L.z, zLo, zHi) - KEY_PIVOT_Z); const dy = L.y - ((black ? BLACK_TOP : 0) - dip + TIP_R);
          if (Math.abs(dx) > (black ? BLACK_W : WHITE_W) / 2 - 0.001 || dz !== 0 || Math.abs(dy) > 0.008) misses.push({ kind: "synth", p: n.p, f: n.f, s: n.s, dx: +dx.toFixed(4), dy: +dy.toFixed(4), dz: +dz.toFixed(4) });
        } else if (c.kind === "drum") {
          const d = DRUMS[c.n.k]; this.stick.tip.getWorldPosition(T); const rel = T.clone().sub(d.pos); const dy = rel.y; const dr = Math.hypot(rel.x, rel.z);
          if (dr > d.r * 0.95 || Math.abs(dy) > 0.05) misses.push({ kind: "drum", k: c.n.k, s: c.n.s, dr: +dr.toFixed(3), dy: +dy.toFixed(3) });
        } else if (c.kind === "pedal") {
          const sole=this.bones.RightFoot.localToWorld(V(0,-.60,2.5));
          const pedal=this.pb.pedals[c.n.p];const local=pedal.pivot.worldToLocal(sole);
          const dx=local.x,dy=local.y-.012,width=isBlack(c.n.p)?.024:PB_WHITE_W;
          if(Math.abs(dx)>width/2-.001||Math.abs(dy)>.012||local.z<0||local.z>(isBlack(c.n.p)?PB_SHORT:PB_LONG))misses.push({kind:"pedal",p:c.n.p,s:c.n.s,dx:+dx.toFixed(4),dy:+dy.toFixed(4),z:+local.z.toFixed(4)});
        } else if(c.kind === "kick") {
          const pd=this.drums.pedal;
          pd.head.getWorldPosition(T);
          const gap=T.z-.03-(KICK_POS.z+KICK_DEPTH/2);
          const sole=this.bones.LeftFoot.localToWorld(V(0,-.60,2.5));
          if(Math.abs(gap)>.025||sole.distanceTo(pd.contact)>.01) misses.push({kind:"kick",s:c.n.s,gap:+gap.toFixed(4),sole:+sole.distanceTo(pd.contact).toFixed(4)});
        }
        if(c.kind==="drum") for(const f of this.hands.Left.fingers) {
          counts.grip++;
          const tip=this.hands.Left.bone.worldToLocal(f.tip.getWorldPosition(new THREE.Vector3()));
          const rel=tip.sub(this.stick.pivot.position), along=rel.dot(STICK_AXIS);
          const gap=(rel.addScaledVector(STICK_AXIS,-along).length()-.12)*ROBOT_SCALE-TIP_R;
          if(Math.abs(gap)>.005) misses.push({kind:"grip",s:c.n.s,gap:+gap.toFixed(4)});
        }

      }
    }
    return { counts, misses };
  }

  poseAt(beat, beatToSec) {
    this._initPose();
    const end=beatToSec(beat), start=Math.max(0,end-.8);
    const invert=(sec)=>{let lo=0,hi=beat;for(let j=0;j<32;j++){const m=(lo+hi)/2;if(beatToSec(m)<sec)lo=m;else hi=m;}return (lo+hi)/2;};
    this.t=start;
    for(let i=0;i<=48;i++) this.update(i===48?beat:invert(start+(end-start)*i/48),beatToSec,1/60,false);
  }
  setShot(view="full") {
    const camera=this.shotCamera??new THREE.PerspectiveCamera(38,this.w/this.h,.015,30);
    this.shotCamera=camera; camera.aspect=this.w/this.h;
    let target,offset;
    if(view==="stick") {target=this.stick.pivot.getWorldPosition(V(0,0,0));offset=V(-.36,.27,.42);}
    else if(view==="pedal") {target=V(KICK_POS.x,.20,.20);offset=V(-.62,.22,.46);}
    else if(view==="crash") {target=DRUMS.cr.pos.clone().add(V(.06,-.03,.04));offset=V(-.36,.38,.67);}
    else if(view==="synth") {target=this.synth.group.localToWorld(V(KB_W/2,.018,-.17));offset=V(.20,.52,.75).applyAxisAngle(V(0,1,0),KB_YAW);}
    else if(view==="knob"||view==="ar") {
      const kn=this.synth.knobs.reduce((a,b)=>Math.abs(a.holder.position.x-this.handR.x)<Math.abs(b.holder.position.x-this.handR.x)?a:b);
      target=kn.holder.getWorldPosition(V(0,0,0));
      // Look across the two contact pads, not along their axis (which hides one behind the other).
      const a=-(kn.value-.5)*2*KNOB_ANGLE;offset=V(-Math.sin(a),0,Math.cos(a));if(offset.z>0)offset.negate();
      target.y+=.065;offset.multiplyScalar(view==="ar"?.62:.46);offset.y=view==="ar"?.40:.34;offset.applyAxisAngle(V(0,1,0),KB_YAW);
      if(view==="ar")target.add(new THREE.Vector3().crossVectors(V(0,1,0),offset).normalize().multiplyScalar(.11));
    }
    else if(view==="keys") {target=this.synth.group.localToWorld(V(this.handR.x,0,-.05));offset=V(.30,.34,.42);}
    else if(view==="bass") {target=V(.25,.13,.28);offset=V(.44,.42,.60);}
    else {target=V(-.10,.80,.06);offset=V(1.7,1.15,2.8);}
    camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateProjectionMatrix();
  }

  /** デバッグ: 今の骨・スティック・指先の world 位置 */
  debugPose() {
    const W = (o) => { const v = new THREE.Vector3(); o.getWorldPosition(v); return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; };
    const B = this.bones;
    return { shoulderL: W(B.LeftArm), elbowL: W(B.LeftForeArm), wristL: W(B.LeftHand), stickPivot: W(this.stick.pivot), stickTip: W(this.stick.tip), tipTarget: this.stickState.tip.toArray().map((x) => +x.toFixed(3)),
      shoulderR: W(B.RightArm), wristR: W(B.RightHand), fingerR: this.hands.Right.fingers.map((f) => W(f.tip)), fingerL: this.hands.Left.fingers.map((f)=>W(f.tip)), ar:this.arChanges.map(({param,from,current,to,progress,active})=>({param,from,current,to,progress,active})), signal:this.signal?{source:this.signal.source,samples:this.signal.wave.length,bins:this.signal.spectrum.length,peak:Math.max(...this.signal.wave.map(Math.abs))}:null, crashTilt:[this.drums.pads.cr.holder.rotation.x,this.drums.pads.cr.holder.rotation.z], knobValues: {...this.knobValues}, kickPress:this.footL.press, beater:W(this.drums.pedal.head), handR: { ...this.handR }, toeR: W(B.RightToeBase), toeL: W(B.LeftToeBase), hipL: W(B.LeftUpLeg), kneeL: W(B.LeftLeg), ankleL: W(B.LeftFoot) };
  }

  render() {
    this.needsRender=false;
    const r = this.renderer;
    if (this.shotCamera) { this.shotCamera.aspect=this.w/this.h;this.shotCamera.updateProjectionMatrix();r.setScissorTest(false);r.setViewport(0,0,this.w,this.h);r.render(this.scene,this.shotCamera);this.ar?.render(this);return; }
    r.setScissorTest(true);
    for(const {camera,rect:[x,y,w,h]}of this.getViews()){r.setViewport(x,y,w,h);r.setScissor(x,y,w,h);r.render(this.scene,camera);}
    r.setScissorTest(false);
    this.ar?.render(this);
  }
}

export { DRUMS, KB_POS, KB_YAW, KB_W };
