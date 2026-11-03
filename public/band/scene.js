// ═══════════ VESPER-01 のワンマンバンド 3D 舞台 (three.js) ═══════════
// 右手 = シンセの鍵盤 (37 鍵) と、その奥の 8 つのつまみ。右足 = 足鍵盤 (13 本)。
// 左手 = スティック 1 本 (ハイハット / スネア / タム 3 / クラッシュ)。左足 = バスドラのペダル。
// ロボットの部品・材質・骨組み・指先合わせは piano/scene.js の物をそのまま使う。
// 座標: ロボットはイス (z=0.64) に座って -z を向く。右 = +x。長さは m。

import * as THREE from "three";
import {addKeyIndicator, updateKeyIndicator} from "../js/key-visual.js";
import {refinePianoArms as refineArms} from "../js/robot-hardware.js";
import {STICK_AXIS, STICK_GRIP, drumGripFrame} from "./drum-grip.js";
import {
  V, clamp, lerp, solve3, M, P, shadowed, limb, sphere, box, ROBOT_SCALE, SKELETON, buildSkeleton, buildRobot,
  FINGER_OFFSET_M, FINGER_REACH_Z, FINGER_Z_WEIGHT, TIP_R, textPlate, makeEnvironment, isBlack,
} from "../piano/scene.js";
import { DRUM_KEYS, KEY_OF_DRUM, KICK, SYNTH_LOW, SYNTH_HIGH, PEDAL_LOW, PEDAL_HIGH, LIMITS } from "./prompts.js";
import { KNOBS } from "../js/synth2.js";
import { knobStateAt } from "../js/synth-automation.js";
import { knobMotionAt, KNOB_BACK } from "./knob-motion.js";
import LAYOUT from "./layout.js";
import BODY from "./chimp/body.js";
import { KnobAR, knobChangesAt, arProtectedRegions } from "./ar.js";
import { HARDWARE, roundedSlab, meshAt, metalRod, valueArc, buildSynthCase, buildDisplay, cymbalGeometry, refineHands } from "./hardware.js";
import { snapshotRest, loadChimp, hideRobot, MOUTH, PUCKER_Z, ROUND_Z } from "./chimp.js";

/* ─────────── シンセの鍵盤 (37 鍵 C3〜C6) — 鍵盤のローカル座標: x = 低→高、z = 手前が +、鍵の上面 y=0 ─────────── */
// 鍵の幅だけ 1.15 倍 (2026-11-03 さとるん「鍵盤を大きくした方がいい」: 白鍵の幅 2.25 cm → 2.59 cm。模型の指の太さは約 2.0 cm)。
// 奥行き (鍵の長さ・つまみまで) はもとのまま。シンセをまるごと 1.35 倍にしたら、模型の大きさの腕では奥と両はしのつまみに届かなかった。
// 1.35 倍の幅では、模型の大きさの手 (親指から小指まで約 21 cm) で 10 度の和音 (白鍵 9 つ分 27 cm) に届かなかった
const KEY_WIDE = 1.15;
const WHITE_W = 0.0225 * KEY_WIDE, WHITE_L = 0.135, BLACK_W = 0.0125 * KEY_WIDE, BLACK_L = 0.085, KEY_H = 0.012;
const whiteIndex = (p) => { let k = 0; for (let q = SYNTH_LOW; q < p; q++) if (!isBlack(q)) k++; return k; };
const N_WHITE = whiteIndex(SYNTH_HIGH) + 1;   // 22
const KB_W = N_WHITE * WHITE_W;               // 0.569
export function keyXL(p) {
  if (!isBlack(p)) return (whiteIndex(p) + 0.5) * WHITE_W;
  const boundary = (whiteIndex(p - 1) + 1) * WHITE_W;
  const shift = { 1: -0.12, 3: 0.12, 6: -0.18, 8: 0, 10: 0.18 }[p % 12] * WHITE_W;
  return boundary + shift;
}
const BLACK_TOP = 0.0095;           // 黒鍵の上面 (ローカル y)
const KEY_DIP = 0.008;
const KEY_PIVOT_Z = -WHITE_L - 0.01;
// 置き場所は layout.js のずれを足す (2026-11-03・配置の画面)
const KB_POS = V(0.05 + LAYOUT.synth.x, 0.80 + LAYOUT.synth.y, 0.16 + LAYOUT.synth.z);  // 鍵盤ローカル原点 (低い C の左端・鍵の上面) の world 位置
const KB_YAW = -0.46 + LAYOUT.synth.yaw;                // 高音側が体の横 (+z) へ回る
// シンセの中の座標と世界の寸法の比。鍵の幅だけを広げる形にしたので 1 (シンセ全体を大きくするときのために残す)
const KB_SCALE = 1;
// つまみのパネル (鍵盤ローカル)
// つまみの板は 6 cm 短くして、つまみを鍵の近くへ (SYNTH_D・2026-11-03: 模型の大きさの腕では、鍵の手前の縁から 25.5 cm 奥のつまみに届かなかった → 19.5 cm)
const SYNTH_D = 0.075, PANEL_TILT = 0.30;
const PANEL_Z = -WHITE_L - 0.085 + SYNTH_D / 2, PANEL_Y = 0.028 - SYNTH_D / 2 * Math.tan(PANEL_TILT);
const KNOB_Z = PANEL_Z - 0.035 + SYNTH_D / 2, KNOB_Y = PANEL_Y + (0.035 - SYNTH_D / 2) * Math.sin(PANEL_TILT) + 0.014;
// つまみは鍵盤のまん中 (右手の前) に、間隔 4.4 cm (もとは 5.75 cm)、右はしが遠いので 4 cm 左寄り でまとめる。模型の大きさの腕では、両はしのつまみ (カットオフ・リバーブ) に届かなかった
const KNOB_GAP = 0.044, KNOB_SHIFT = -0.04, knobXL = (i) => KB_W / 2 + KNOB_SHIFT + (i - 3.5) * KNOB_GAP;
const KNOB_ANGLE = 2.35;             // ±135°
// つまむ手の楽な向き (ラジアン・つまみの軸まわり)。-0.4・0・0.4・0.6・0.8・1.0・1.2 を試し、指どうしのぶつかり (手の検査) が 293・174・68・39・36・30・28 件、
// つまみの検査は 0.4 から上で 120 件 (残りは遠いリバーブのつまみに指先が届き切らない所)。手を大きくひねりすぎない 0.8 にした
const KNOB_ROLL0 = 0.8;

/* ─────────── 足鍵盤 (13 本 C1〜C2) — world 座標 (床の上・右足の下) ─────────── */
// 足鍵盤は 0.85 倍の幅 (2026-11-03): 模型の大きさの脚では、右足が横に届くのは腰の関節から左右に約 20 cm で、
// 大人の寸法 (低いドから高いドまで中心どうしで 41 cm) では端のドに届かず、左足のバスドラのペダルとも場所を取り合った
const PBS = 0.85, PB_X0 = 0.03 + LAYOUT.pedal.x, PB_WHITE_W = 0.052 * PBS, PB_GAP = 0.006 * PBS, PB_LONG = 0.30 * PBS, PB_SHORT = 0.14 * PBS, PB_BLACK_W = 0.024 * PBS;
const PB_Z_HEEL = 0.44 + LAYOUT.pedal.z;              // 手前 (かかと側)
const pbWhiteIndex = (p) => { let k = 0; for (let q = PEDAL_LOW; q < p; q++) if (!isBlack(q)) k++; return k; };
export function pedalX(p) {
  if (!isBlack(p)) return PB_X0 + (pbWhiteIndex(p) + 0.5) * (PB_WHITE_W + PB_GAP);
  return PB_X0 + (pbWhiteIndex(p - 1) + 1) * (PB_WHITE_W + PB_GAP);
}
const PB_TOP = 0.035, PB_SHARP_TOP = 0.075;
const TOE_Z = (p) => (isBlack(p) ? PB_Z_HEEL - PB_LONG + 0.04 * PBS : PB_Z_HEEL - 0.16 * PBS);   // つま先を置く z

/* ─────────── 耳にかけるマイク (2026-11-03 さとるん「猿の口元に、耳からかけるスタイルのマイクがついてて、これなんだろう的な謎が最後に解ける」) ───────────
   はじめからずっと付けておき、トルコ行進曲の明るい所の 2 回目で口笛を吹くときに使う。左耳にかけ、ほおに沿って口の前まで伸ばす。
   寸法は m・頭の関節から測った位置 (チンパンジーの模型の皮: 耳の外側は横 10.5 cm・上 4.5 cm、口の前は前へ 14 cm・下 2 cm。マイクの先は口の前の少し上) */
function buildHeadset(head) {
  const g = new THREE.Group(); g.scale.setScalar(1 / ROBOT_SCALE); g.name = "headset"; head.add(g);
  const dark = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.45, metalness: 0.3 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.9 });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.009, 32), dark); pad.rotation.z = Math.PI / 2; pad.position.set(0.112, 0.045, 0.016); g.add(pad);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0028, 10, 40, Math.PI * 1.25), dark); hook.rotation.set(0, Math.PI / 2, Math.PI * 0.35); hook.position.set(0.108, 0.05, 0.004); g.add(hook);
  const path = new THREE.CatmullRomCurve3([V(0.114, 0.042, 0.022), V(0.113, 0.022, 0.07), V(0.09, 0.008, 0.122), V(0.04, 0.004, 0.152)]);
  const boom = new THREE.Mesh(new THREE.TubeGeometry(path, 40, 0.0022, 10), metal); g.add(boom);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 24, 16), dark); cap.position.set(0.034, 0.003, 0.154); g.add(cap);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 12, 8), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 0.4 }));
  led.position.set(0.041, 0.01, 0.156); g.add(led);
  // 口笛の穴: すぼめた唇の奥に置く、奥行きのある短い筒 (前の端は唇になじむ暗い茶色、奥へ行くほど黒・いちばん奥に黒い底。少し横長)。
  // 前は黒い平たい楕円で、唇に丸い黒を貼っただけに見えた (2026-11-03 さとるん「口がただの丸になっているのもっとリアルに」)。
  // 筒の前の端は唇のふちの内側に隠れ、正面から見ると暗い赤のふちから黒へ落ちる穴、斜めから見ると奥の内側の壁が見える
  const holeGeo = new THREE.CylinderGeometry(1, 0.6, 1, 32, 6, true); holeGeo.rotateX(Math.PI / 2); holeGeo.translate(0, 0, -0.5);
  { const p = holeGeo.attributes.position, c = new Float32Array(p.count * 3), a = new THREE.Color(0x24120f), b = new THREE.Color(0x050202), t = new THREE.Color();
    for (let i = 0; i < p.count; i++) { t.copy(a).lerp(b, Math.min(1, -p.getZ(i) * 1.5)); c.set([t.r, t.g, t.b], i * 3); }
    holeGeo.setAttribute("color", new THREE.BufferAttribute(c, 3)); }
  const hole = new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const holeBack = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshBasicMaterial({ color: 0x050202 })); holeBack.position.z = -1; hole.add(holeBack);
  hole.scale.setScalar(1e-4); hole.visible = false; g.add(hole);
  return { group: g, led, boom, cap, hole };
}
// 皮を着せたあとで、マイクを本当の口へ合わせる (2026-11-03 さとるん「マイクが猿の口の位置にあっていない」)。前は頭の関節から測った寸法で
// 置いていて、マイクの先が鼻の下 (唇の合わせ目の 3 cm 上・3 cm 横) にあった。皮の座標 (m) で口から決め、頭の骨の座標へ移す (toGroup)。
// マイクの先は、すぼめた唇の左下の前 (口の穴は隠さない)。腕はほおに沿って耳から伸ばす。
// 口笛の穴: すぼめた唇のまん中に置く暗い楕円。唇を前へ出した分だけ前へ動かす (mouth → mouthFront)
function fitHeadset(hs, toGroup) {
  const S = (x, y, z) => toGroup(V(x, y, z));
  hs.mouth = toGroup(MOUTH.clone()); hs.mouthFwd = toGroup(MOUTH.clone().add(V(0, 0, 0.01))).sub(hs.mouth).multiplyScalar(100);
  hs.hole.position.copy(hs.mouth); hs.hole.lookAt(hs.mouth.clone().add(hs.mouthFwd));
  const tip = S(0.016, MOUTH.y - 0.007, MOUTH.z + 0.030);
  const path = new THREE.CatmullRomCurve3([V(0.114, 0.042, 0.022), S(0.100, 0.848, 0.060), S(0.080, 0.826, 0.100), S(0.048, 0.812, 0.134), S(0.027, 0.814, 0.150)]);
  hs.boom.geometry.dispose(); hs.boom.geometry = new THREE.TubeGeometry(path, 48, 0.0022, 10);
  hs.cap.position.copy(tip); hs.led.position.copy(S(0.022, MOUTH.y - 0.001, MOUTH.z + 0.034));
  hs.mic = tip.clone();
}

/* ─────────── ドラム (world) ─────────── */
// ドラムは子ども用の大きさ (KIT 倍) にする (2026-11-03 さとるん「チンパンジーは模型の縮尺比を維持して、他の位置関係とか相対的に作りきって」)。
// 体を模型の大きさ (立って約 1 m) にしたら、大人のドラム (バスドラ 22 インチ) では、太鼓を体に合う高さまで下げるとタムがバスドラに、
// 床置きのタムが床にめり込んだ。床の上のスネアの真下を中心に、位置と大きさをまとめて縮める (床に置く物は床に立ったまま)
const KIT = 0.62, KIT_C = V(-0.40, 0, 0.10);
const kitAt = (p) => V(KIT_C.x + (p.x - KIT_C.x) * KIT, p.y * KIT, KIT_C.z + (p.z - KIT_C.z) * KIT);
// バスドラは、ほかの太鼓とは別に動かせる (2026-11-03 さとるん「バスドラの位置だけ別途変えれるように」)
// バスドラはさらに小さめ (14 インチ・0.65 倍): 上に乗るスネアを、模型の大きさの体に合う高さ (約 49 cm) まで下げられるように
const KICK_S = 0.62, KICK_R = 0.28 * KICK_S, KICK_DEPTH = 0.36 * KICK_S, KICK_BASE = kitAt(V(-0.105, 0, -0.13)).setY(KICK_R + 0.02), KICK_POS = KICK_BASE.clone().add(V(LAYOUT.kick.x, 0, LAYOUT.kick.z));
const DRUMS = {
  sn: { pos: V(-0.40, 0.72, 0.10), r: 0.18, depth: 0.14, tilt: 0.12, shell: 0xf2efe6, kind: "drum", label: "SNARE" },
  hh: { pos: V(-0.64, 0.86, -0.08), r: 0.17, tilt: 0.10, kind: "cymbal", label: "HI-HAT" },
  t1: { pos: V(-0.15, 0.96, -0.25), r: 0.13, depth: 0.20, tilt: 0.45, shell: 0x2a2f3a, kind: "drum", label: "TOM 1" },
  t2: { pos: V(-0.44, 0.96, -0.31), r: 0.15, depth: 0.23, tilt: 0.45, shell: 0x2a2f3a, kind: "drum", label: "TOM 2" },
  t3: { pos: V(-0.76, 0.60, 0.42), r: 0.20, depth: 0.36, tilt: 0.05, shell: 0x2a2f3a, kind: "drum", label: "FLOOR TOM" },
  // クラッシュは 8 cm 下げた (1.20 → 1.07・縮めたあとで高さ 0.73 → 0.65 m・肩の高さ)。2026-11-03 さとるん「クラッシュがちょっと位置が高くて
  // 上から叩きつけるようにいきづらいのかもしれない」: 肩より上にあると、振りかぶっても上から振り下ろせなかった
  cr: { pos: V(-0.89, 1.07, 0.015), r: 0.2235, tilt: 0.16, kind: "cymbal", label: "CRASH" },
};
const DRUM_SHIFT = V(LAYOUT.drums.x, LAYOUT.drums.y, LAYOUT.drums.z);
// 広がり (spread): スネアを中心に、太鼓とシンバルの横の間隔をこの倍率にする (体を模型の大きさにしたら、端のシンバルに腕が届かなかった)
for (const d of Object.values(DRUMS)) { d.pos.copy(kitAt(d.pos)); d.r *= KIT; if (d.depth) d.depth *= KIT; }
{ const c = DRUMS.sn.pos.clone(); for (const d of Object.values(DRUMS)) { d.pos.x = c.x + (d.pos.x - c.x) * LAYOUT.drums.spread; d.pos.z = c.z + (d.pos.z - c.z) * LAYOUT.drums.spread; } }
for (const d of Object.values(DRUMS)) d.pos.add(DRUM_SHIFT);   // バスドラ以外の太鼓とシンバルはまとめて動かす (並びはそのまま)
// 手と足も模型の大きさにする (2026-11-03 さとるん「チンパンジーは模型の縮尺比を維持して」)。演奏の計算の手 (ピアノと共有のロボットの手) は
// 手のひら 8.5 cm・指が模型の 1.1〜1.85 倍あり、皮を長さだけ引きのばしていた (指が細く見えたのはこのため)。骨を HAND_S 倍に縮め、
// 手の寸法を使う計算 (指の開き・指先の丸み・手のひらの高さ) にも同じ倍率を掛ける。足も同じ (模型の足は演奏の足の 0.8 倍)。
// スティックは手の中にあるので一緒に縮む (40 cm → 31 cm・子ども用のドラムに合う長さ)
const HAND_S = 0.77, FOOT_S = 0.8;
const F_OFF = FINGER_OFFSET_M.map((x) => x * HAND_S), F_REACH = FINGER_REACH_Z.map((x) => x * HAND_S), TIP = TIP_R * HAND_S;
const STICK_LEN = 0.40 * HAND_S;
const STICK_LEN_R = 0.40 / ROBOT_SCALE;   // 手の中の長さ (手の骨の座標)

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
  const g = new THREE.Group(); g.position.copy(KB_POS); g.rotation.y = KB_YAW; g.scale.setScalar(KB_SCALE);
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
    const mat = (black ? P.ebony : P.ivory).clone(); if(black){mat.color.setHex(0x050607);mat.metalness=0;mat.roughness=.30;} mat.emissive.setHex(0); mat.emissiveIntensity = 0;
    const mesh = shadowed(new THREE.Mesh(geo, mat)); pivot.add(mesh); g.add(pivot);
    keys[p] = { pivot, mesh, mat, indicator: addKeyIndicator(mesh), black, press: 0, target: 0 };
  }
  buildSynthCase(g, KB_W, PANEL_Z, PANEL_Y, PANEL_TILT, textPlate, -KB_POS.y / KB_SCALE, SYNTH_D);
  const display = buildDisplay(g, KB_W - 0.137, SYNTH_D, SYNTH_D * Math.tan(PANEL_TILT));
  const knobs = [];
  KNOBS.forEach((k, i) => {
    const holder = new THREE.Object3D(); holder.position.set(knobXL(i), KNOB_Y, KNOB_Z); holder.rotation.x = PANEL_TILT; g.add(holder);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.006, 20), HARDWARE.black); base.position.y = -0.008; holder.add(base);
    const rot = new THREE.Object3D(); holder.add(rot);
    const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.0125, 0.017, 20), HARDWARE.silver)); cap.position.y = 0.002; rot.add(cap);
    const grooves = new THREE.InstancedMesh(new THREE.CylinderGeometry(.0004,.0005,.012,8), HARDWARE.black, 40);
    const groovePose = new THREE.Object3D();
    for(let j=0;j<40;j++){const a=j*Math.PI/20;groovePose.position.set(Math.sin(a)*.0119,.002,Math.cos(a)*.0119);groovePose.updateMatrix();grooves.setMatrixAt(j,groovePose.matrix);} rot.add(grooves);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.002, 20), HARDWARE.black); top.position.y = 0.0115; rot.add(top);
    const ptr = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.004, 0.011), HARDWARE.gold); ptr.position.set(0, 0.012, -0.0055); rot.add(ptr);
    const label = textPlate(k.label, 0.041, 0.011, { bg: "#0d0e11", fg: "#d8d8d8", line: "#0d0e11", size: 125, weight: "400" }); label.position.set(0, -0.006, 0.030); label.rotation.x = -Math.PI / 2; holder.add(label);
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
  const base = shadowed(new THREE.Mesh(roundedSlab(8 * (PB_WHITE_W + PB_GAP) + 0.06, PB_LONG + 0.08, 0.02, .014), HARDWARE.black)); base.position.set(PB_X0 + 4 * (PB_WHITE_W + PB_GAP), 0.01, PB_Z_HEEL - PB_LONG / 2 - 0.02); g.add(base);
  const pedals = {};
  for (let p = PEDAL_LOW; p <= PEDAL_HIGH; p++) {
    const black = isBlack(p);
    const pivot = new THREE.Object3D(); pivot.position.set(pedalX(p), black ? PB_SHARP_TOP - 0.02 : PB_TOP - 0.012, PB_Z_HEEL - (black ? PB_LONG : PB_LONG) - 0.01);
    const len = black ? PB_SHORT : PB_LONG; const w = black ? PB_BLACK_W : PB_WHITE_W;
    const mat = (black ? P.ebony : P.ivory).clone(); if(black){mat.color.setHex(0x050607);mat.metalness=0;mat.roughness=.30;} mat.emissive.setHex(0); mat.emissiveIntensity = 0;
    const mesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.024, len), mat)); mesh.position.set(0, 0, len / 2); pivot.add(mesh);
    if (black) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.02, PB_SHARP_TOP - 0.02, 0.02), D.rubber); post.position.set(0, -(PB_SHARP_TOP - 0.02) / 2, 0.04); pivot.add(post); }
    g.add(pivot);
    pedals[p] = { pivot, mesh, mat, indicator: addKeyIndicator(mesh), black, press: 0, target: 0 };
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
      if (k === "t1" || k === "t2") { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.10, 8), D.chrome); arm.position.set(d.pos.x, d.pos.y - d.depth - 0.03, d.pos.z + 0.02); g.add(arm); }
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
        const mast = V(d.pos.x-.09*KIT,.96*KIT+DRUM_SHIFT.y,d.pos.z-.20*KIT);
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
  const logo = textPlate("VESPER", 0.30 * KICK_S, 0.09 * KICK_S, { bg: "#0b0b0d", fg: "#e0b95a", line: "#0b0b0d", size: 90 }); logo.position.z = -KICK_DEPTH / 2 - 0.001; logo.rotation.y = Math.PI; kick.add(logo);
  [KICK_DEPTH / 2, -KICK_DEPTH / 2].forEach((z) => { const hp = new THREE.Mesh(new THREE.TorusGeometry(KICK_R + 0.006, 0.009, 8, 64), D.wood); hp.position.z = z; kick.add(hp); });
  for (let i = 0; i < 10; i++) { const a = i * Math.PI * 2 / 10; const lug = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, KICK_DEPTH * 0.45), D.chrome); lug.position.set(Math.sin(a) * (KICK_R + 0.008), Math.cos(a) * (KICK_R + 0.008), 0); kick.add(lug); }
  [-0.22 * KIT, 0.22 * KIT].forEach((x) => { const spur = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.30 * KIT, 8), D.chrome); spur.position.set(KICK_POS.x + x, 0.14 * KIT, KICK_POS.z - 0.10 * KIT); spur.rotation.z = x > 0 ? -0.5 : 0.5; g.add(spur); });
  // タムの支え: バスドラの上から、2 つのタムの下の腕の先まで (バスドラを別に動かしても、つながったまま)
  const tomFoot = DRUMS.t1.pos.clone().add(DRUMS.t2.pos).multiplyScalar(0.5).add(V(0, -Math.max(DRUMS.t1.depth, DRUMS.t2.depth) - 0.08, 0.02));
  metalRod(g, V(KICK_POS.x, KICK_POS.y + KICK_R, KICK_POS.z - 0.05), tomFoot, 0.012, D.chrome);
  metalRod(g, tomFoot, V(DRUMS.t1.pos.x, tomFoot.y, DRUMS.t1.pos.z + 0.02), 0.009, D.chrome); metalRod(g, tomFoot, V(DRUMS.t2.pos.x, tomFoot.y, DRUMS.t2.pos.z + 0.02), 0.009, D.chrome);
  // ペダル: かかと側 (z 大) の蝶番で回る踏み板、ビーター
  const pedal = { base: null, board: null, beater: null };
  const pbz = KICK_POS.z + KICK_DEPTH / 2;   // 打面の z
  const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.30), D.chrome)); base.position.set(KICK_POS.x, 0.006, pbz + 0.16); g.add(base);
  const hinge = new THREE.Object3D(); hinge.position.set(KICK_POS.x, 0.018, pbz + 0.31); g.add(hinge);
  const board = shadowed(new THREE.Mesh(roundedPlate(0.094,0.24,0.008,0.018), D.chrome)); board.position.set(0, 0, -0.12); hinge.add(board); board.rotation.x = 0.0;
  for (let j=0;j<8;j++) { const rib=new THREE.Mesh(roundedPlate(.071,.003,.002,.001),D.rubber); rib.position.set(0,.006,-.035-j*.024); hinge.add(rib); }
  const heel = shadowed(new THREE.Mesh(roundedPlate(.096,.047,.010,.008),D.panel)); heel.position.set(KICK_POS.x,.020,pbz+.315); g.add(heel);
  const hingeAxle=new THREE.Mesh(new THREE.CylinderGeometry(.007,.007,.104,24),D.chrome); hingeAxle.rotation.z=Math.PI/2; hingeAxle.position.copy(hinge.position); g.add(hingeAxle);
  // ビーターは小さいバスドラの真ん中 (高さ KICK_POS.y) を打つ: 軸の高さ BEAT_Y、棒の長さ BEAT_L
  const BEAT_Y = KICK_POS.y * 0.55, BEAT_L = KICK_POS.y * 0.45 + 0.01;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, BEAT_Y, 24), D.chrome); post.position.set(KICK_POS.x + 0.045, BEAT_Y / 2, pbz + 0.07); g.add(post);
  const post2 = post.clone(); post2.position.x = KICK_POS.x - 0.045; g.add(post2);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.10, 8), D.chrome); axle.rotation.z = Math.PI / 2; axle.position.set(KICK_POS.x, BEAT_Y, pbz + 0.07); g.add(axle);
  const beaterPivot = new THREE.Object3D(); beaterPivot.position.set(KICK_POS.x, BEAT_Y, pbz + 0.07); g.add(beaterPivot);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, BEAT_L - 0.01, 8), D.chrome); rod.position.y = (BEAT_L - 0.01) / 2; beaterPivot.add(rod);
  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.03, 32, 24), new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.9 }))); head.position.y = BEAT_L; beaterPivot.add(head);
  const cam = new THREE.Mesh(new THREE.CylinderGeometry(.031,.031,.015,40),D.panel); cam.rotation.z=Math.PI/2; beaterPivot.add(cam);
  const chain = new THREE.Mesh(new THREE.BoxGeometry(.012,1,.004),D.gun??D.chrome); g.add(chain); pedal.chain=chain;
  const springPoints=[]; for(let j=0;j<=160;j++){const u=j/160,a=u*Math.PI*20; springPoints.push(V(KICK_POS.x+.061+Math.cos(a)*.006,.05+u*.12,pbz+.07+Math.sin(a)*.006));}
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPoints),160,.0014,8,false),D.chrome));
  pedal.head=head; pedal.board=board;
  pedal.hinge = hinge; pedal.beater = beaterPivot; pedal.heelPos = V(KICK_POS.x, 0.03, pbz + 0.31); pedal.toeZ = pbz + 0.10;
  // イス (ドラムスローン)
  const seat = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 32), P.cushion)); seat.position.set(SEAT_X, 0.485 + SEAT_Y, SEAT_Z); g.add(seat);
  const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 12), D.chrome); seatPost.position.set(SEAT_X, 0.24 + SEAT_Y / 2, SEAT_Z); seatPost.scale.y = (0.42 + SEAT_Y) / 0.42; g.add(seatPost);
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.34, 8), D.chrome); leg.position.set(SEAT_X + Math.sin(a) * 0.13, 0.12, SEAT_Z + Math.cos(a) * 0.13); leg.rotation.z = Math.cos(a) * 0.8; leg.rotation.x = -Math.sin(a) * 0.8; g.add(leg); }
  // ラグ
  const rug = meshAt(g,roundedSlab(2.45,1.94,.009,.15,.002),new THREE.MeshStandardMaterial({color:0x111317,roughness:.94}),-.20,.003,.06);
  const edge=meshAt(g,roundedSlab(2.48,1.97,.005,.16,.001),HARDWARE.grip,-.20,.001,.06);

  scene.add(g);
  return { group: g, pads, kick, pedal };
}

// 臨界減衰のばね (位置 x・速さ v を target へ。w が大きいほど速い)。1 コマで飛ばずに加速・減速して着く
function spring(x, v, target, w, dt) { const d = x - target, e = Math.exp(-w * dt), c = v + w * d; return [target + (d + c * dt) * e, (v - w * c * dt) * e]; }

function roundedPlate(width, length, depth, radius) {
  const x = -width / 2, y = -length / 2, r = radius, sh = new THREE.Shape();
  sh.moveTo(x+r,y); sh.lineTo(x+width-r,y); sh.quadraticCurveTo(x+width,y,x+width,y+r);
  sh.lineTo(x+width,y+length-r); sh.quadraticCurveTo(x+width,y+length,x+width-r,y+length);
  sh.lineTo(x+r,y+length); sh.quadraticCurveTo(x,y+length,x,y+length-r);
  sh.lineTo(x,y+r); sh.quadraticCurveTo(x,y,x+r,y);
  const geo = new THREE.ExtrudeGeometry(sh, {depth,bevelEnabled:true,bevelSize:0.001,bevelThickness:0.001,bevelSegments:3,curveSegments:16});
  geo.translate(0,0,-depth/2); geo.rotateX(-Math.PI/2); return geo;
}

function buildStick(handBone) {
  // A fixed diagonal through the palm: the fingers wrap around this axis.
  const pivot = new THREE.Object3D(); pivot.position.copy(STICK_GRIP); handBone.add(pivot);
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
// スティックの構えの手首の曲げ (ラジアン)。ひじを下げた形 (drum-grip.js ELBOW_DROP) では、そのままだとスティックが打面とほぼ平らになり、
// 打面へ下向きにするための手の回しが大きく、ハイハットを刻むと手首が大きく動いた。初めから曲げておく (2026-11-03)
const WRIST_COCK = -0.35;
// 骨の寸法はチンパンジーの模型のまま (2026-11-03 さとるん「チンパンジーを模型の縮尺にしないと合わせられない」)。
// 胴・首・頭・肩・股の付け根は模型の関節の位置、腕と脚は模型の長さ (向きは演奏の計算のとおり横と下)。手・指・足の先は演奏の寸法のまま。
// 寸法は chimp/body.js (chimp/tools/make_body.py が chimp.json から書く)。楽器と椅子の位置は配置の画面 (layout.js) で合わせる。
// 前は骨をロボットの寸法 (腕は模型の 1.6〜1.7 倍・脚は 1.9〜3.6 倍・全体 1.33 倍) にして、皮をそれに合わせて引きのばしていた
const ARM = { upper: BODY.len.upper / ROBOT_SCALE, fore: BODY.len.fore / ROBOT_SCALE };
const LEG = { thigh: BODY.len.thigh / ROBOT_SCALE, shin: BODY.len.shin / ROBOT_SCALE };
const HIP_ABOVE_SEAT = 0.04;   // 股の付け根の関節を座面からこれだけ上に (太ももの皮の下の半分の厚み・m)
const SEAT_Z = 0.66 + LAYOUT.seat.z, SEAT_X = LAYOUT.seat.x, SEAT_Y = LAYOUT.seat.y;
// チンパンジーの頭の中心 (頭の骨から測る・ロボットの骨の単位)。皮の頭の点の平均から測った (模型で頭の関節から上 12.4 cm・前 3.0 cm)。半径は約 11 cm
const HEAD_CENTER = new THREE.Vector3(0, 0.1236, 0.0298).divideScalar(ROBOT_SCALE);
/* ── 曲ごとの体の動き (2026-11-02・メドレー): song.moves = [{beat, style}]。胴と頭の角度 (ラジアン) を足すだけで、
   手足は今までどおり鍵盤・太鼓・足鍵盤へ解くので演奏の位置は変わらない。b = 曲頭からの拍、u = その場面に入ってからの拍 ── */
const pulse = (x) => Math.max(0, Math.cos(Math.PI * 2 * x)) ** 3;   // 拍の頭で 1、間は 0
const MOVES = {
  // ゆっくり胸を張って顔を上げていく (16 拍で上がりきる)
  majestic: (b, u) => { const p = Math.min(1, u / 16); return { lean: -0.10 * p, roll: 0.03 * Math.sin(b * Math.PI / 2), headX: -0.30 * p, headY: 0.05 * Math.sin(b * Math.PI / 4), headZ: 0, nod: 0.6, calm: 0.4 }; },
  // 拍ごとに弾み、頭を左右に振る (2 拍で 1 往復)
  cancan: (b) => ({ lean: 0.06 * pulse(b), roll: 0.05 * Math.sin(b * Math.PI), headX: -0.06 + 0.10 * pulse(b), headY: 0, headZ: 0.20 * Math.sin(b * Math.PI), nod: 0.8, calm: 0.3 }),
  // 背中を丸めて、4 拍で 1 往復、こっそり左右を見る
  sneak: (b) => ({ lean: 0.12, roll: 0.02 * Math.sin(b * Math.PI / 2), headX: 0.10, headY: 0.32 * Math.sin(b * Math.PI / 2), headZ: 0.06 * Math.sin(b * Math.PI / 2), nod: 0.5, calm: 0.3 }),
  // 速くなるほど大きく頭を振る (16 拍で最大)
  frenzy: (b, u) => { const p = Math.min(1, u / 16); return { lean: 0.06 + 0.04 * p, roll: (0.03 + 0.05 * p) * Math.sin(b * Math.PI), headX: (0.06 + 0.16 * p) * pulse(b), headY: 0, headZ: (0.06 + 0.12 * p) * Math.sin(b * Math.PI), nod: 1.2, calm: 0.5 }; },
  // 蜂を目で追う: 速さの違う 2 つの揺れを重ねて、頭がすばやく動く
  bee: (b) => ({ lean: 0.03, roll: 0.02 * Math.sin(b * 2.1), headX: -0.10 + 0.10 * Math.sin(b * 4.7), headY: 0.26 * Math.sin(b * 3.3) + 0.10 * Math.sin(b * 8.9), headZ: 0.08 * Math.sin(b * 5.3), nod: 0.4, calm: 0.3 }),
  // 馬に乗っているように: タ・タ・タン の 3 つで前後にゆれる
  gallop: (b) => { const x = b % 1, g = pulse(x * 2) * (x < 0.5 ? 0.6 : 1); return { lean: 0.04 + 0.07 * g, roll: 0.03 * Math.sin(b * Math.PI), headX: 0.10 * g - 0.04, headY: 0, headZ: 0.05 * Math.sin(b * Math.PI), nod: 0.8, calm: 0.3 }; },
  // 打つたびに大きくうなずき (音の強さで)、最後の和音 (8 拍目から) で頭をそらす
  fate: (b, u) => { const back = Math.min(1, Math.max(0, (u - 8) / 1.5)); return { lean: 0.06 * (1 - back) - 0.08 * back, roll: 0, headX: -0.42 * back, headY: 0, headZ: 0, nod: 2.2 * (1 - back), calm: 0.3 }; },
};
const NO_MOVE = { lean: 0, roll: 0, headX: 0, headY: 0, headZ: 0, nod: 1, calm: 1 };
function moveAt(moves, b) {
  if (!moves?.length || b < moves[0].beat) return NO_MOVE;
  let i = 0; while (i + 1 < moves.length && moves[i + 1].beat <= b) i++;
  const cur = MOVES[moves[i].style](b, b - moves[i].beat);
  const prev = i > 0 ? MOVES[moves[i - 1].style](b, b - moves[i - 1].beat) : NO_MOVE;
  const w = Math.min(1, (b - moves[i].beat) / 1), k = w * w * (3 - 2 * w);
  const out = {}; for (const key of Object.keys(NO_MOVE)) out[key] = prev[key] + (cur[key] - prev[key]) * k;
  return out;
}

export class BandStage {
  constructor(canvas, { headless = false } = {}) {
    this.canvas = canvas; this.headless = headless;
    this.scene = new THREE.Scene();
    if (!headless) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); // 軽さ優先 (Retina でも 1.5 まで)
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
    const bv = (v, sg = 1) => V(sg * v[0], v[1], v[2]).divideScalar(ROBOT_SCALE);
    for (const n of ["LowerBack", "Spine", "Spine1", "Neck1", "Head", "HeadEnd"]) this.bones[n].position.copy(bv(BODY.vec[n]));
    for (const [sd, sg] of [["Left", 1], ["Right", -1]]) {
      for (const n of ["Shoulder", "Arm", "UpLeg"]) this.bones[sd + n].position.copy(bv(BODY.vec[n], sg));
      this.bones[sd + "ForeArm"].position.set(sg * ARM.upper, 0, 0); this.bones[sd + "Hand"].position.set(sg * ARM.fore, 0, 0);
      this.bones[sd + "Leg"].position.set(0, -LEG.thigh, 0); this.bones[sd + "Foot"].position.set(0, -LEG.shin, 0);
    }
    this.hands = {};
    this.robotParts = buildRobot(this.bones, this.hands);
    this.robot = new THREE.Group(); this.robot.scale.setScalar(ROBOT_SCALE); this.robot.add(this.bones.Hips); this.scene.add(this.robot);
    this.stick = buildStick(this.bones.LeftHand);
    this.headset = buildHeadset(this.bones.Head);
    refineHands(this.hands, ROBOT_SCALE, TIP_R);
    for (const h of Object.values(this.hands)) { h.bone.scale.setScalar(HAND_S); for (const f of h.fingers) f.lenM *= HAND_S; }
    this.bones.LeftFoot.scale.setScalar(FOOT_S); this.bones.RightFoot.scale.setScalar(FOOT_S);
    // 軽さ優先 (2026-09-11): 手の小さな部品は影を落とさない (手首の甲だけ影あり)
    for (const hand of Object.values(this.hands)) hand.bone.traverse((o) => { if (o.isMesh && o !== hand.palm) { o.castShadow = false; o.receiveShadow = false; } });
    refineArms(this.bones, this.hands);
    // Band-only detail: smooth finger shells and flush toe soles; piano is untouched.
    for (const hand of Object.values(this.hands)) for (const f of hand.fingers) f.root.traverse((o) => {
      if (o.geometry?.type === "CapsuleGeometry") { const old=o.geometry,p=old.parameters; o.geometry=new THREE.CapsuleGeometry(p.radius,p.length,10,28); old.dispose(); }
    });
    this.bones.LeftToeBase.position.y = -0.2;
    this.bones.RightToeBase.position.y = -0.2;
    for (const mesh of this.bones.RightToeBase.children) if(mesh.isMesh) mesh.scale.x=.42;
    // チンパンジーの皮 (2026-11-02): 骨が静止姿勢のうちに位置を控えてから座らせる。?robot=1 で元のロボット
    if (!headless && !new URLSearchParams(location.search).has("robot")) {
      const chimpRest = snapshotRest(this.bones, this.hands);
      this.chimpReady = loadChimp(chimpRest).then((mesh) => { hideRobot(this.robot, this.stick.pivot); this.headset.group.traverse((o) => { o.visible = true; });
        { const inv = mesh.skeleton.boneInverses[mesh.skeleton.bones.indexOf(this.bones.Head)]; fitHeadset(this.headset, (p) => p.applyMatrix4(inv).multiplyScalar(ROBOT_SCALE)); } this.scene.add(mesh); this.chimp = mesh; this.needsRender = true; })
        .catch((e) => console.warn("chimp", e));
    }
    this.poseSeated();

    this.camEye = new THREE.PerspectiveCamera(62, 1, 0.03, 30);
    this.camClose = new THREE.PerspectiveCamera(34, 1, 0.02, 10);
    this.camWide = new THREE.PerspectiveCamera(40, 1, 0.05, 40);
    this.orbit = { target: new THREE.Vector3(-0.05, 0.85, 0.0), theta: 0.55, phi: 1.15, radius: 3.4, auto: true };
    this.view = "wide"; this.layout = "stack"; this.closeMode = "auto"; this.closeTarget = "keys";
    if (!headless) this._bindOrbit();
    this.camPlan = new URLSearchParams(globalThis.location?.search ?? "").get("cam") ?? "a";
    this.setView("wide");   // 開いたときから前から撮る (前は組み立て前の決まった値で、うしろから遠く撮っていた)
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
    // 写す範囲は右手・画面・つまみだけで決める (ar.js のふつうの守る物。2026-11-03 さとるん「無茶苦茶なカメラアングル」: 顔・太鼓・
    // スティックまで全部写そうとして、遠くへ引いて斜めにずらした絵になっていた)
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
    // 見る先は、椅子・シンセ・太鼓の今の位置から決める。距離は前の 0.7 倍 (2026-11-03: 体を模型の大きさにして楽器を寄せたら、
    // 前の決まった点と距離では、バンドが画面のまん中に小さく写った)
    const seat = V(SEAT_X, 0.55 + SEAT_Y, SEAT_Z), synthC = this.synth.group.localToWorld(V(KB_W / 2, 0, -0.10));
    const drumC = Object.values(DRUMS).reduce((a, d) => a.add(d.pos), V()).divideScalar(Object.keys(DRUMS).length);
    const all = seat.clone().add(synthC).add(drumC).divideScalar(3); all.y = seat.y + 0.12;
    this._bandC = all.clone(); this._drumC = drumC.clone(); this._synthC = synthC.clone();
    // 向きは「チンパンジーの正面から、シンセ側 (右手側) へ何度か」と「見下ろす角度」で決める (2026-11-03): 前は全体・ドラム・シンセの
    // どれも体のうしろ側から撮っていて、顔が写らなかった (チンパンジーは -z を向いている)
    const aim = (a, e, r) => { o.theta = Math.PI - a * Math.PI / 180; o.phi = Math.PI / 2 - e * Math.PI / 180; o.radius = r; };
    if (view === "wide") { aim(30, 28, 1.65); o.auto = true; o.autoT = 0; o.target.copy(all); }
    if (view === "drums") { aim(-40, 26, 1.35); o.target.copy(drumC).lerp(seat, 0.3); }
    if (view === "synth") { aim(60, 30, 1.25); o.target.copy(synthC).lerp(seat, 0.3); }
    if (view === "top") { aim(20, 70, 1.9); o.target.copy(all); }
    if (view === "front") { aim(0, 12, 1.7); o.target.copy(all); }
  }
  /* ── 全体の画面のカメラの自動 (2026-11-03 さとるん「カメラアングルのところ、考えてください」) ──
     いつも前 (正面〜シンセ側) から撮る。?cam= で 2 つの案を切りかえる
     a: 正面からシンセ側 55 度の間を、ゆっくり行き来する (見下ろす角度も少し変える)
     b: 曲の場面 (song.moves) ごとにカットを変え、場面の中ではゆっくり寄る・揺れる。場面の無い曲は 8 小節ごとに 4 つの向きを順に */
  _autoCamera(beat, o) {
    const aim = (a, e, r) => { o.theta = Math.PI - a * Math.PI / 180; o.phi = Math.PI / 2 - e * Math.PI / 180; o.radius = r; };
    const band = this._bandC ?? o.target, t = o.autoT;
    if (this.camPlan !== "b") { aim(30 + 25 * Math.sin(t * 0.06), 28 + 4 * Math.sin(t * 0.045), 1.65); o.target.copy(band); return; }
    const mv = this.song.moves ?? [], i = mv.findLastIndex((m) => m.beat <= beat + 1e-6);
    const style = i >= 0 ? mv[i].style : ["front", "synth", "drums", "low"][Math.floor(beat / 32) % 4];
    const b0 = i >= 0 ? mv[i].beat : Math.floor(beat / 32) * 32, b1 = i >= 0 && mv[i + 1] ? mv[i + 1].beat : b0 + 32;
    const u = clamp((beat - b0) / Math.max(1, b1 - b0), 0, 1), e2 = u * u * (3 - 2 * u), sway = Math.sin(Math.PI * 2 * beat / 8);
    const face = this.bones.Head.localToWorld(HEAD_CENTER.clone()), mid = band.clone().lerp(face, 0.35);
    o.target.copy(band);
    if (style === "majestic") { aim(8 + 6 * e2, 6 + 4 * e2, 2.0 - 0.55 * e2); o.target.copy(mid); }          // 下から見上げて、ゆっくり寄る
    else if (style === "cancan") aim(35 + 12 * sway, 26, 1.55);                                                // 斜め前から、拍に合わせて左右に揺れる
    else if (style === "sneak") aim(-35 + 15 * e2, 10, 1.5);                                                   // ドラム側の低い所から、こっそり
    else if (style === "frenzy") { aim(20 + 22 * Math.sin(Math.PI * 2 * beat / 4), 22, 1.3); o.target.copy(mid); }   // 近くで速く揺れる
    else if (style === "bee") { aim(60 - 15 * e2, 38, 1.3); o.target.copy(this._synthC ?? band).lerp(face, 0.3); } // シンセ側の上から指を
    else if (style === "fate") { aim(0, 4, 1.15 - 0.25 * e2); o.target.copy(face).lerp(band, 0.3); }        // 正面の低い所から顔へ寄る
    else if (style === "synth") aim(60, 30, 1.35);
    else if (style === "drums") aim(-40, 26, 1.45);
    else if (style === "low") aim(10, 8, 1.8);
    else aim(30, 28, 1.65);
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
    this.robot.position.set(SEAT_X, 0.51 + SEAT_Y + HIP_ABOVE_SEAT - BODY.vec.UpLeg[1], SEAT_Z);
    this.robot.rotation.y = Math.PI + LAYOUT.seat.yaw;
    B.Hips.rotation.set(0, 0, 0);
    B.LeftShoulder.rotation.set(0, 0, -0.05); B.RightShoulder.rotation.set(0, 0, 0.05);
    this.robot.updateMatrixWorld(true);
    this.armLen = { upper: ARM.upper * ROBOT_SCALE, fore: ARM.fore * ROBOT_SCALE };
    this.legLen = { thigh: LEG.thigh * ROBOT_SCALE, shin: LEG.shin * ROBOT_SCALE };
  }

  /** 曲を渡す。synth: [{p,s,d,v,f}] pedal: [{p,s,d,v}] drums: [{p or k, s, v}] kick: [{s,v}] knobs: [{param,s,d,to}] (s は曲頭からの拍) */
  setSong({ synth = [], pedal = [], drums = [], kick = [], knobs = [], moves = [], whistle = [] }, knobDefaults = null, patchName = "VESPER SYNTH2") {
    this.patchName=patchName;
    const byS = (a, b) => a.s - b.s;
    this.song = {
      synth: synth.map((n) => ({...n})).sort(byS), pedal: pedal.map((n) => ({...n})).sort(byS),
      drums: drums.map((n) => ({ ...n, k: n.k ?? KEY_OF_DRUM[n.p] ?? "sn" })).filter((n) => DRUMS[n.k]).sort(byS),
      kick: kick.slice().sort(byS), knobs: knobs.slice().sort(byS), whistle: whistle.slice().sort(byS),
      moves: moves.filter((x) => MOVES[x.style]).slice().sort((a, b) => a.beat - b.beat),
    };
    if (knobDefaults) this.knobDefaults = { ...this.knobDefaults, ...knobDefaults };
    this._initPose();
  }
  /** 最初の音に手足を構えておく (曲頭 0 拍目の音にも間に合うように) */
  _initPose() {
    this.t=0; this.energy=0; this.headNod=0; this._yaw=0; this._look=0; this.footL.press=0; this.footR.press=0; 
    this._cp=null; this._cl=null; this._closeSwitchT=0;
    for (const k of Object.values(this.synth.keys)) { k.press=0; k.pivot.rotation.x=0; updateKeyIndicator(k); }
    for (const p of Object.values(this.pb.pedals)) { p.press=0; p.pivot.rotation.x=0; updateKeyIndicator(p); }
    for (const p of Object.values(this.drums.pads)) p.hit=0;
    for (const k of this.synth.knobs) k.lit=0;
    for (const h of Object.values(this.hands)) for(const f of h.fingers) {f.exactPose=null;f.contactPose=null;f.press=0;f.spread=0;f.root.rotation.set(0,0,0);f.joint.rotation.set(0,0,0);}
    const d0 = this.song.drums[0]; if (d0) { const d = DRUMS[d0.k]; this.stickState.tip.copy(d.pos).add(V(0, 0.11, d.r * 0.35)); }
    const p0 = this.song.pedal[0]; if (p0) { this.footR.x = pedalX(p0.p); this.footR.z = TOE_Z(p0.p); }
    const s0 = this.song.synth[0]; if (s0) { const first = this.song.synth.filter((n) => n.s - s0.s < 0.05); this.handR.x = first.reduce((a, n) => a + keyXL(n.p) - F_OFF[clamp((n.f ?? 3) - 1, 0, 4)] / KB_SCALE, 0) / first.length; this.handR.z = 0.045; }
    this.handR.mode = "keys"; this.handR.vx = 0; this.handR.vz = 0; this.handR.keysPalm = null; this.stickState.side = 0; this._armSmooth = null; this._lastNow = null;
  }
  /** つまみの値 (0..1) を、曲頭からの秒で */
  knobValueAt(param, sec, beatToSec) {
    // sec->beat inversion is avoided in the frame loop, which caches all values.
    return knobStateAt(this.knobDefaults, this.song.knobs, Infinity, beatToSec, sec)[param] ?? .5;
  }

  /* ── 2 本骨 IK (腕)。yaw: 手の向き (鍵盤の回転に合わせる)。pitch: 手首を下に向ける (つまみ用) ── */
  _solveArm(side, target, { yaw = 0, pitch = 0, roll = 0, pole = null, quaternion = null, extension = .985 } = {}) {
    const B = this.bones; const sgn = side === "Left" ? 1 : -1;
    const shoulder = B[side + "Arm"], elbow = B[side + "ForeArm"], hand = B[side + "Hand"];
    const S = new THREE.Vector3(); shoulder.getWorldPosition(S);
    const a = this.armLen.upper, b = this.armLen.fore;
    const Dv = target.clone().sub(S); let d = Dv.length(); const maxD = (a + b) * extension; if (d > maxD) { Dv.multiplyScalar(maxD / d); d = maxD; }
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
  /* ── 腕の飛びをつなぐ (2026-11-02): 解いた腕の形で手首が 1 コマに JUMP を超えて動くときだけ、
     前のコマの形から、距離に合わせた時間 (0.08〜0.25 秒) でなめらかに移す。つまみの間の移動が 2 コマしかない所など、
     曲のデータ上で間に合わない所のため。ふだんの演奏 (ばねで動く鍵盤の手) では 1 コマ 4 cm 未満なので効かない ── */
  /* ── カメラを体の外に置く (2026-11-02): 頭は球、胸と両腕は円柱の両端を丸めた形で包む。
     push(p, look, margin): p をそれぞれの形の外 (形の半径 + 余白) へ押し出す。look があれば、p から look を見る線も頭と胸を通らないようにする。
     margin 1 は 7 cm、0 は 1.5 cm の余白。頭の中心は頭の骨から測った位置 (ロボットの骨の単位)。速いうなずきでカメラが揺れないよう、ゆっくり追う ── */
  _keepOut(dt) {
    const B = this.bones, W = (n) => B[n].getWorldPosition(new THREE.Vector3());
    const head = B.Head.localToWorld(HEAD_CENTER.clone());
    this._headC = this._headC && dt > 0 ? this._headC.lerp(head, Math.min(1, dt * 4)) : head;
    const shapes = [
      { a: this._headC, b: this._headC, r: 0.11, sight: true },
      { a: W("Spine"), b: W("Neck1"), r: 0.13, sight: true },
      { a: W("RightArm"), b: W("RightForeArm"), r: 0.055 }, { a: W("RightForeArm"), b: W("RightHand"), r: 0.045 },
      { a: W("LeftArm"), b: W("LeftForeArm"), r: 0.055 }, { a: W("LeftForeArm"), b: W("LeftHand"), r: 0.045 },
    ];
    const nearest = (a, b, p) => { const ab = b.clone().sub(a), L = ab.lengthSq(); return L < 1e-9 ? a.clone() : a.clone().addScaledVector(ab, clamp(p.clone().sub(a).dot(ab) / L, 0, 1)); };
    const away = (d) => (d.lengthSq() < 1e-9 ? d.set(1, 0, 0) : d.normalize());
    return {
      push: (p, look, margin) => {
        const pad = 0.015 + 0.055 * margin;
        for (let it = 0; it < 3; it++) for (const s of shapes) {
          const R = s.r + pad, q = nearest(s.a, s.b, p), d = p.clone().sub(q);
          if (d.length() < R) p.copy(q).addScaledVector(away(d), R);
          if (!s.sight || !look) continue;
          // 見る線の上で形にいちばん近い点 m が形の中なら、線が形の外を通るまで p を横へずらす (look は動かさない)
          const c = nearest(s.a, s.b, nearest(p, look, s.a.clone().lerp(s.b, 0.5))), m = nearest(p, look, c), e = m.clone().sub(c), el = e.length(), r = s.r + 0.01;
          if (el >= r) continue;
          // 見る先そのものが形の中にあるときは、線をよけられないので押さない。押す倍率にも上限 (2026-11-03: 体を模型の大きさにしたら、
          // 見る先が腕の中に入り、寄りカメラが 1 コマごとに遠くへ押され続けて 10 の 14 乗 m まで飛んだ)
          if (look.distanceTo(nearest(s.a, s.b, look)) < r) continue;
          const k = Math.min(3, p.distanceTo(look) / Math.max(1e-3, m.distanceTo(look)));
          p.addScaledVector(away(e), (r - el) * k);
        }
      },
    };
  }
  _smoothArm(side, dt) {
    const JUMP = 0.05, B = this.bones, hand = this.hands[side];
    const nodes = this._armNodes(side);
    const wrist = hand.bone.getWorldPosition(new THREE.Vector3());
    const sm = (this._armSmooth ??= {})[side];
    const target = nodes.map((n) => n.quaternion.clone()), targetPos = hand.bone.position.clone();
    if (sm && dt > 0) {
      if (!sm.blend && wrist.distanceTo(sm.wrist) > JUMP) sm.blend = { from: sm.pose, fromPos: sm.pos, t: 0, dur: clamp(wrist.distanceTo(sm.wrist) / 1.6, 0.08, 0.25) };
      if (sm.blend) {
        const b = sm.blend; b.t += dt; const u = clamp(b.t / b.dur, 0, 1), w = u * u * (3 - 2 * u);
        nodes.forEach((n, i) => n.quaternion.copy(b.from[i]).slerp(target[i], w));
        hand.bone.position.copy(b.fromPos).lerp(targetPos, w);
        B[side + "Shoulder"].updateMatrixWorld(true);
        if (u >= 1) sm.blend = null;
      }
    }
    this._armSmooth[side] = { ...this._armSnapshot(side), blend: sm?.blend ?? null };
  }
  _armNodes(side) { const B = this.bones, hand = this.hands[side]; return [B[side + "Shoulder"], B[side + "Arm"], B[side + "ForeArm"], hand.bone, ...hand.fingers.flatMap((f) => [f.root, f.joint])]; }
  _armSnapshot(side) { const hand = this.hands[side]; return { pose: this._armNodes(side).map((n) => n.quaternion.clone()), pos: hand.bone.position.clone(), wrist: hand.bone.getWorldPosition(new THREE.Vector3()), blend: null }; }

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
    const yT = (black ? BLACK_TOP : 0) - dip + (TIP + hover) / KB_SCALE;
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
    this.t += dt; this._b2s = beatToSec;
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
    // 曲ごとの体の動き (song.moves): 場面が変わったら 1 拍かけて移る
    const mv = moveAt(S.moves, beat, this.headNod);
    // 口笛 (song.whistle): 吹いている間はあごを上げ、マイクの赤い点を光らせる。吹き始めの半拍前から、終わりの 1/4 拍あとまで
    const WH = S.whistle ?? [], whOn = WH.length && beat >= WH[0].s - 0.5 && beat <= WH.at(-1).s + WH.at(-1).d + 0.25 ? 1 : 0;
    this._whistle = lerp(this._whistle ?? 0, whOn, Math.min(1, dt * 6));
    const whNote = WH.find((n) => beat >= n.s && beat < n.s + n.d);
    this.headset.led.material.emissiveIntensity = 0.4 + (whNote ? 5 * (0.6 + 0.4 * whNote.v / 127) : 0) * this._whistle;
    // 口の形 (chimp.js addMouth の 0 すぼめ・1 丸): 吹いている間はすぼめる。音の頭で強くすぼめて 0.12 秒で戻り、音の切れ目では少しゆるめる。
    // 低い音ほど丸く開く (2026-11-03 さとるん「リズムに合わせて口の形が多少変わるように」)
    if (this.chimp?.morphTargetInfluences) {
      const atk = whNote ? Math.exp(-Math.max(0, now - beatToSec(whNote.s)) / 0.12) : 0, low = whNote ? clamp((100 - whNote.p) / 20, 0, 1) : 0.5;
      this._pucker = lerp(this._pucker ?? 0, (whNote ? 0.72 + 0.28 * atk : 0.55) * this._whistle, Math.min(1, dt * 24));
      this._round = lerp(this._round ?? 0, (whNote ? 0.15 + 0.35 * low : 0.3) * this._whistle, Math.min(1, dt * 14));
      this.chimp.morphTargetInfluences[0] = this._pucker; this.chimp.morphTargetInfluences[1] = this._round;
      const hs = this.headset, open = clamp((this._pucker + this._round - 0.15) / 0.6, 0, 1);
      if (hs.mouth) {
        hs.hole.visible = open > 0.01;
        // 筒の前の端は、唇のふちの輪 (前へ出した量の 9 割) の少し奥。奥行き 6 mm で、まん中の引っこめた皮より前に収まる
        hs.hole.position.copy(hs.mouth).addScaledVector(hs.mouthFwd, (PUCKER_Z * this._pucker + ROUND_Z * this._round) * 0.85);
        // 穴の大きさ: 低い音ほど丸く大きく、音の頭で強くすぼめた瞬間は小さく (音ごとに口の形が少し変わって見える)
        hs.hole.scale.set((0.0032 + 0.0026 * this._round + 0.001 * (1 - this._pucker)) * open, (0.0022 + 0.0035 * this._round + 0.001 * (1 - this._pucker)) * open, 0.006 * open + 1e-4);
        if (this.chimp.userData.lip) this.chimp.userData.lip.value = clamp(this._pucker + 0.6 * this._round, 0, 1);
      }
    }
    const sway = Math.sin(this.t * 0.9) * 0.03 * (0.4 + this.energy) * mv.calm + Math.sin(this.t * 0.37) * 0.015 * mv.calm + mv.roll;
    // つまみを回す間は、胴を少しだけ前へ傾ける (0.12 rad)。0.30 rad では曲の場面の傾きと重なって頭が鍵盤の高さまで下がり、
    // 右腕が頭の上を越えてつまみへ伸びた (2026-11-03)。足りない分は右肩を前へ出して届かせる
    this._knobLean = lerp(this._knobLean ?? 0, this.handR.mode === "knob" ? 0.12 : 0, Math.min(1, dt * 4));
    const lean = 0.12 + this.energy * 0.10 + mv.lean + this._knobLean;
    const kbCenter = this.synth.group.localToWorld(V(clamp(this.handR.mode === "knob" ? this.handR.knobX ?? this.handR.x : this.handR.x, 0, KB_W), 0, 0));
    // 胴は、右手で弾いている所の方へ回す。椅子の位置から測る (前は世界の x で測り、椅子を動かすと向きがずれた)。
    // 0.08 は右肩の少し内側、1.5 は腕の長さの比 (前の体の腕は今の 1.6〜1.7 倍で、0.9 だった)
    const yawTarget = clamp((kbCenter.x - SEAT_X - 0.08) * 1.5 * (this.handR.mode === "idle" ? 0.3 : 1), -0.35, 0.55);
    this._yaw = lerp(this._yaw ?? 0, yawTarget, Math.min(1, dt * 3));
    B.LowerBack.rotation.set(lean * 0.5, this._yaw * 0.35, sway * 0.5);
    B.Spine.rotation.set(lean * 0.4, this._yaw * 0.35 + sway * 0.3, sway * 0.5);
    B.Spine1.rotation.set(lean * 0.2, this._yaw * 0.3, sway * 0.3);
    B.Neck1.rotation.set(0.1, 0, 0);
    const lookX = this.handR.mode === "knob" ? 0.4 : hitNext && hitNext._sec - now < 0.25 && hitNext.k !== "hh" ? -0.5 : 0.1;
    this._look = lerp(this._look ?? 0, lookX, Math.min(1, dt * 4));
    B.Head.rotation.set(0.38 - 0.40 * this._whistle + this.headNod * 0.2 * mv.nod * (1 - this._whistle) + Math.sin(this.t * 1.3) * 0.015 + mv.headX, this._look - this._yaw * 0.6 + mv.headY, -sway * 0.5 + mv.headZ);
    this.robotParts.visor.material.emissiveIntensity = 1.6 + this.energy * 1.4 + this.headNod * 2;
    this.robotParts.core.material.emissiveIntensity = 3 + Math.sin(this.t * 3) * 0.6 + this.energy * 2;
    // 肩 (鎖骨と肩甲骨) は動かさない (2026-11-03)。11-02 に「腕を横に上げると肩も上げる」を入れたが、左は向きが逆で最大 3 cm
    // 肩を下げていた (さとるん「実際の演奏では明らかに左肩が変」)。向きを直して上げると、低い太鼓まで腕がのびきってひじの急な動きが
    // 273 → 374〜419 回に増え、見た目の違いは小さかったので外した。右肩を上げると遠いつまみに指が届かなくなった (手とつまみの検査)
    B.LeftShoulder.rotation.z = -0.05; B.RightShoulder.rotation.z = 0.05;
    // つまみを回す間は、右肩 (鎖骨) を前へ出して手を伸ばす (胴は倒さない)。模型の腕では、鍵の 19.5 cm 奥のつまみに腕を伸ばし切っても届かなかった
    this._knobReach = lerp(this._knobReach ?? 0, this.handR.mode === "knob" ? 1 : 0, Math.min(1, dt * 6));
    B.RightShoulder.rotation.y = 0.8 * this._knobReach;
    this.robot.updateMatrixWorld(true);

    // ── 鍵 (シンセ)
    for (const k of Object.values(this.synth.keys)) k.target = 0;
    for (const n of active) { const k = this.synth.keys[n.p]; if (k) k.target = 0.7 + 0.3 * (n.v / 127); }
    for (const k of Object.values(this.synth.keys)) { const prev = k.press; k.press = lerp(k.press, k.target, Math.min(1, dt * (k.target ? 60 : 16))); if (Math.abs(k.press - prev) > 1e-4 || k.press > 1e-3) { k.pivot.rotation.x = Math.atan(KEY_DIP / (k.black ? BLACK_L : WHITE_L)) * k.press; } updateKeyIndicator(k); }
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
    // 手のひらの位置 (鍵盤の座標)。鍵盤の「手のひら」と同じ式 (横は指ごとの鍵の位置から、奥行きは白鍵・黒鍵と指の長さから)
    const palmOf = (arr) => { let x = 0, zs = 0, ws = 0; for (const n of arr) { const fi = FI(n), w = FINGER_Z_WEIGHT[fi]; x += keyXL(n.p) - F_OFF[fi] / KB_SCALE; zs += ((isBlack(n.p) ? -0.085 : -0.040) + F_REACH[fi] / KB_SCALE) * w; ws += w; } return { x: x / arr.length, z: zs / ws - 0.85 * ROBOT_SCALE * HAND_S / KB_SCALE }; };
    if (knobEv) {
      st.mode = "knob";
      const ki = KNOBS.findIndex((k) => k.id === knobEv.param);
      const kb = this.synth.group;
      // 手のひらをつまみの上・少し手前に。指は下向き (pitch)、回す量で手首をひねる (roll)
      const kv = this.knobValues[knobEv.param];
      const there=knobMotion.there;
      // つまむ向きは、つまみの目盛りの向きではなく「回す分」で決める (2026-11-03 さとるん「てくびが 360 度以上回ってしまっている」):
      // 前は手の向きを目盛りの角度 (値 0〜1 で ±135 度) に合わせていたので、ほぼ最大のつまみのあとにほぼ最小のつまみへ移ると手首が約 205 度ねじれ、
      // ねじれが戻らずに積み重なって、メドレーの 16 小節目で 300 度まで回った。今は、回し始めと回し終わりのまん中の値 (ref) で手がまっすぐになり、
      // 回す間は回す分だけ手首をひねる (0.55 動かすつまみで ±74 度)。指はつまみの丸い頭のどこをつまんでもよいので、つまむ所も同じだけずらす。
      // 鍵盤へ戻らずに次のつまみへ移るときは、前のつまみを回し終えた手首の向きから、1 秒あたり 340 度までしか向きを変えない
      // (別の曲で、回し終えて -61 度の手首が 0.05 秒で次のつまみの +74 度へ移り、1 コマで 148 度回っていた)。手首は ±110 度の中
      const midOf=(ev)=>{if(this._knobRefsFor!==this.song.knobs)this._knobRefs();return ev._ref??.5;};
      const geometry=(index,value,lift=0,ref=.5)=>{
        const holder=this.synth.knobs[index].holder;holder.updateWorldMatrix(true,true);
        const angle=-(value-ref)*2*KNOB_ANGLE,centre=holder.getWorldPosition(V(0,0,0));
        const axis=V(0,1,0).applyQuaternion(holder.getWorldQuaternion(new THREE.Quaternion())),turn=new THREE.Quaternion().setFromAxisAngle(axis,-angle);
        // Radius of the actual tapered cap at local y=.004, plus fingertip pad.
        const radius=.0125+(.011-.0125)*(.004+.0065)/.017+TIP/KB_SCALE;
        const targets=[-1,1].map(sign=>holder.localToWorld(V(sign*radius*Math.cos(angle),.004,sign*radius*Math.sin(angle))).add(V(0,lift*.075,0)));
        const palm=kb.localToWorld(V(knobXL(index)+.045*HAND_S/KB_SCALE,KNOB_Y+(.140*HAND_S+lift*.05)/KB_SCALE,KNOB_Z+.10*HAND_S/KB_SCALE)).sub(centre).applyQuaternion(turn).add(centre);
        return {targets,palm,turn};
      };
      const pose=geometry(ki,kv,1-there,midOf(knobEv)),{targets}=pose,palmW=pose.palm,turn=pose.turn;
      if(knobMotion.travel){
        const {from,progress:u}=knobMotion.travel,fi=KNOBS.findIndex(k=>k.id===from.param),prev=geometry(fi,this.knobValues[from.param],0,midOf(from));
        // Smoothly lift between controls; use the whole available gap rather
        // than return to the keys and start a new reach for every gesture.
        const blend=u*u*(3-2*u),lift=Math.sin(Math.PI*u)*.025;
        const next=geometry(ki,kv,0,midOf(knobEv));palmW.copy(prev.palm).lerp(next.palm,blend).add(V(0,lift,0));
        turn.copy(prev.turn).slerp(next.turn,blend);
        const rotation=turn.clone().multiply(prev.turn.clone().invert());
        for(let i=0;i<2;i++)targets[i].copy(prev.targets[i]).sub(prev.palm).applyQuaternion(rotation).add(palmW);
      }
      // 鍵盤の手の位置 (st.x, st.z) は上書きしない: つまみから戻る先が飛ばないように (2026-11-02)
      st.knobX=knobXL(ki);
      hand.bone.position.copy(hand.restPos);
      const orientation={yaw:KB_YAW,pitch:.45,roll:0,pole:V(.7,-.6,.5)};
      this._solveArm("Right",palmW,orientation);
      orientation.quaternion=turn.clone().multiply(hand.bone.getWorldQuaternion(new THREE.Quaternion()));
      // 手を伸ばす間・戻す間は、鍵盤の上の手の位置と向きから、つまみの上へつなぐ (前は 1 コマで 50 cm 飛んでいた)
      const reach=knobMotion.travel?1:there, e=reach*reach*(3-2*reach);
      // 戻るときは、つまみへ行く前の手の位置ではなく、次に弾く音の手の位置へ戻る (2026-11-03)。戻る時間を 0.15 → 0.225 秒にのばしたら、
      // 前の位置へ戻ってから次の音まで動く時間がなくなり、ほかの曲で鍵の外れが増えた (ネオン 2 → 6・オーバードライブ 5 → 8)
      if(!knobMotion.travel&&there<1&&now>=beatToSec(knobEv.s+knobEv.d)&&st.keysQ){const nx=S.synth.filter(n=>{const a=beatToSec(n.s)-now;return a>0&&a<0.8;});
        if(nx.length){const s0=Math.min(...nx.map(n=>beatToSec(n.s))),P=palmOf(nx.filter(n=>beatToSec(n.s)-s0<=0.03));st.x=P.x;st.z=P.z;
          st.keysPalm=kb.localToWorld(V(P.x,0.044*HAND_S/KB_SCALE,P.z+0.85*ROBOT_SCALE*HAND_S/KB_SCALE));}}
      if(e<.999&&st.keysPalm){const knobPalm=palmW.clone();palmW.copy(st.keysPalm).lerp(knobPalm,e).add(V(0,.04*Math.sin(Math.PI*e),0));orientation.quaternion=st.keysQ.clone().slerp(orientation.quaternion,e);}
      this._solveArm("Right",palmW,orientation);
      hand.fingers.forEach((f,i)=>{f.exactPose=null;if(i>1){f.root.rotation.set(0,-hand.sgn*.50*e, -hand.sgn*2.25*e);f.joint.rotation.set(0,0,-hand.sgn*.90*e);}});
      for(let pass=0;pass<12&&e>=.999;pass++) {
        const err=V(0,0,0);let worst=0;
        for(let i=0;i<2;i++){const e=placeContact(hand,hand.fingers[i],targets[i],hand.fingers[i].contactPose);err.add(e);worst=Math.max(worst,e.length());}
        if(worst<.0002) break;
        palmW.add(err.multiplyScalar(.5)); this._solveArm("Right",palmW,orientation);
      }
      this.knobContacts=targets;

    } else {
      // 鍵盤。piano/scene.js と同じ段取り (1 本の手)
      // 弾く音の組を決める (時刻 t の、鳴っている音 act・すぐ次の音 ld・その先の音 upc から)。音の頭のすぐあとの組も同じ決め方で読む (notesAt)
      const pickList = (t, act, ld, upc) => { const mean = (arr) => arr.reduce((a, n) => a + keyXL(n.p), 0) / arr.length; const up = ld.filter((n) => !act.includes(n)); const soon = ld.filter((n) => { const ds = beatToSec(n.s) - t; return ds >= -0.12 && ds <= 0.06; });
        let kept = act; if (soon.length) { const cx = mean(soon); kept = act.filter((n) => Math.abs(keyXL(n.p) - cx) <= 0.12); }
        if (kept.length) { const cx = mean(kept); return kept.concat(up.filter((n) => Math.abs(keyXL(n.p) - cx) <= 0.12)); }
        const src = up.length ? up : upc; if (!src.length) return []; const s0 = Math.min(...src.map((n) => beatToSec(n.s))); return src.filter((n) => beatToSec(n.s) - s0 <= 0.03); };
      const notesAt = (t) => { const act = [], ld = [], upc = []; for (const n of S.synth) { const s = beatToSec(n.s), e = beatToSec(n.s + n.d); if (e < t - 0.3) continue; if (s > t + LOOK + 0.2) break; if (s <= t + 0.004 && t < Math.max(e, s + 0.09)) { act.push(n); ld.push(n); } else if (s > t && s <= t + LEAD) { ld.push(n); upc.push(n); } else if (s > t && s <= t + LOOK) upc.push(n); } return pickList(t, act, ld, upc); };
      let list = pickList(now, active, lead, upcoming), early = false;
      // 次の音で手のひらが 5 cm 以上動くときは、距離に合わせた時間 (0.8 m/秒・0.08〜0.25 秒) だけ前に今の音から手を離して動き始める (2026-11-02)。
      // 前は今の音が離れる (次の音の 0.01 秒前) まで待ち、1 コマで 14〜23 cm 飛んでいた (メドレーのオクターブの跳び)。
      // 手のひらの位置で比べる: 鍵が隣でも、小指から親指へ替わると手のひらは 10 cm 以上動く
      { const cur = list.filter((n) => beatToSec(n.s) <= now + 0.004), nxt = upcoming.filter((n) => beatToSec(n.s) > now + 0.004);
        if (cur.length && nxt.length) { const s0 = Math.min(...nxt.map((n) => beatToSec(n.s))), grp = nxt.filter((n) => beatToSec(n.s) - s0 <= 0.03);
          const cx = (arr) => arr.reduce((a, n) => a + keyXL(n.p) - F_OFF[clamp((n.f ?? 3) - 1, 0, 4)] / KB_SCALE, 0) / arr.length, dist = Math.abs(cx(grp) - cx(cur));
          const held = now - Math.max(...cur.map((n) => beatToSec(n.s)));   // 鳴らしてから 0.05 秒は離れない (鍵を押した所を見せる)
          if (dist > 0.05 && held >= 0.05 && s0 - now <= clamp(dist / 0.8, 0.08, 0.25)) { list = grp; early = true; } } }
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
        const P0 = palmOf(list); palmX = P0.x; palmZ = P0.z;
      } else { st.mode = playing ? "keys" : "idle"; palmX = lerp(st.x, keyXL(62), 0.002); palmZ = 0.05; }
      // 和音の一部の音が先に離れただけ (新しい音が無い) のときは、手のひらを動かさない。残った指は鍵に置いたまま (2026-11-03)。
      // 前は、残った音だけで手のひらを計算し直し、1 コマで最大 4.4 cm 寄っていた (トルコ行進曲の 2 回目のオクターブの上の音が先に離れる所)
      if (list.length) { const ref = st.palmRef; if (ref && ref.notes && list.every((n) => ref.notes.has(n))) { palmX = ref.x; palmZ = ref.z; } else st.palmRef = { notes: new Set(list), x: palmX, z: palmZ }; }
      else st.palmRef = null;
      // 次の音の頭で手のひらの位置が変わるときは、その前から動かしておく (2026-11-03 さとるん「手がワープしているように見えます」)。
      // 前は、今の音と次の音のまん中に手を置いたまま、音の頭で今の音が離れた 1 コマに 次の音の位置へ最大 4.5 cm 飛んでいた (メドレーで 40 か所ほど)。
      // 音の頭のすぐあとの組を同じ決め方で読み、その手のひらへ、距離に合わせた時間 (0.7 m/秒・0.06〜0.25 秒) でなめらかに寄せる。
      // 寄せ始めは今の音を鳴らしてから 0.05 秒あと。押している指は鍵に残る (指を鍵に合わせる計算が、手を最大 4.5 cm ずらして届かせる)
      // 寄せる道は「寄せ始めたコマの手の位置 → 次の音の手のひら」で決めて、途中で変えない (弾く音の組は、指の割りあての調整で
      // 音の頭の直前に 1 コマだけ入れかわることがあり、組から計算した位置を元にすると、寄せる途中でも 7 cm 飛んだ)
      let glide = false;
      if (list.length) { const nx = upcoming.filter((n) => beatToSec(n.s) > now + 0.004);
        if (nx.length) { const s0 = Math.min(...nx.map((n) => beatToSec(n.s))), L1 = notesAt(s0 + 0.006);
          if (L1.length) { const P1 = palmOf(L1), g0 = st.glide?.s0 === s0 ? st.glide : null, d = g0 ? 1 : Math.hypot(P1.x - st.x, P1.z - st.z);
            if (d > 0.003) { const lastS = Math.max(...list.map((n) => Math.min(beatToSec(n.s), now))), T = clamp(d / 0.7, 0.06, 0.25);
              const start = Math.min(Math.max(s0 - T, lastS + 0.05), s0 - 0.034);
              if (g0 || now > start || early) { const g = g0 ?? (st.glide = { s0, x: st.x, z: st.z, t0: now - dt });
                const u = clamp((now - g.t0) / (s0 - g.t0), 0, 1), w = u * u * (3 - 2 * u); palmX = lerp(g.x, P1.x, w); palmZ = lerp(g.z, P1.z, w); glide = true; } } } } }
      if (!glide) st.glide = null;
      // 次の音が鳴る時刻ちょうどに着くよう、残りの距離を残りの時間で割って進む (2026-11-02)。
      // 前は lerp(dt*55) で 1 コマに 9 割進み、和音が変わるたびに手が飛んでいた。鳴っている音だけなら今までどおりすぐ合わせる
      const onsets = list.map((n) => beatToSec(n.s) - now).filter((x) => x > 0.004);
      const arrive = onsets.length ? Math.min(...onsets) : 0;
      const struck = list.some((n) => { const a = now - beatToSec(n.s); return a >= -0.004 && a < 0.05; });   // 鳴り始めの音は今までどおりすぐ合わせる
      const k = glide ? 1 : list.length ? Math.max(arrive > dt ? dt / arrive : onsets.length ? 1 : 0, struck || !onsets.length ? Math.min(1, dt * 55) : 0) : Math.min(1, dt * 22);
      st.x = lerp(st.x, palmX, k); if (Math.abs(st.x - palmX) < 0.0004) st.x = palmX;
      st.z = lerp(st.z, palmZ, list.length ? k : Math.min(1, dt * 12)); if (Math.abs(st.z - palmZ) < 0.0004) st.z = palmZ;
      // 手の寸法 (m) は、鍵盤の中の座標では KB_SCALE で割る (シンセだけ大きくしたので)
      const palmY = 0.044 * HAND_S / KB_SCALE;
      const palmW = this.synth.group.localToWorld(V(st.x, palmY, st.z + 0.85 * ROBOT_SCALE * HAND_S / KB_SCALE));
      hand.bone.position.copy(hand.restPos);
      this._solveArm("Right", palmW, { yaw: KB_YAW, pole: new THREE.Vector3(0.7, -0.75, 0.55) });
      st.keysPalm = palmW.clone(); st.keysQ = hand.bone.getWorldQuaternion(new THREE.Quaternion());
      const pressing = new Map(); for (const n of active) if (inList.has(n)) pressing.set(FI(n), n);
      const ready = new Map(); for (const n of lead) { if (!inList.has(n)) continue; const i = FI(n); if (!pressing.has(i) && !ready.has(i)) ready.set(i, n); }
      const nextByF = new Map(); for (const n of upcoming) { const i = FI(n); if (!nextByF.has(i)) nextByF.set(i, n); }
      const exactList = [];
      hand.fingers.forEach((f, i) => {
        const n = pressing.get(i) ?? ready.get(i) ?? nextByF.get(i);
        const p = pressing.has(i) ? 1 : ready.has(i) ? 0.4 : nextByF.has(i) ? 0.2 : 0;
        f.press = lerp(f.press, p, Math.min(1, dt * (p === 1 ? 70 : 18)));
        const keyTop = n && isBlack(n.p) ? BLACK_TOP : 0;
        const restDrop = clamp(((palmY - keyTop) * KB_SCALE - 0.018 * HAND_S) / f.lenM, 0, 0.95), pressDrop = clamp(((palmY - keyTop) * KB_SCALE + 0.006 * HAND_S) / f.lenM, 0, 0.98);
        const ang = Math.asin(lerp(restDrop, pressDrop, f.press));
        f.root.rotation.z = hand.sgn * -(ang * 0.75); f.joint.rotation.z = hand.sgn * -(ang * 0.45 + 0.1);
        let shift = 0; if (n) shift = (keyXL(n.p) - (st.x + F_OFF[i] / KB_SCALE)) * KB_SCALE;
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
    // つまみへ出入りするコマだけ (鍵盤の上では音の時刻に指を合わせるので、つながない)
    // つまみを回している間は指をつまみに合わせるのが先なので、つながない。時刻が飛んだ (頭出し・検査) ときも前の形を捨てる
    const turning = knobEv && knobMotion.there === 1 && !knobMotion.travel;
    const continuous = this._lastNow != null && Math.abs(now - this._lastNow - dt) < dt * 0.5;
    if (!turning && continuous && (st.mode === "knob" || st.prevMode === "knob" || this._armSmooth?.Right?.blend)) this._smoothArm("Right", dt);
    else if (this._armSmooth) this._armSmooth.Right = turning && continuous ? this._armSnapshot("Right") : null;
    st.prevMode = st.mode; this._lastNow = now;

    // ── 左手: スティック
    {
      const ss = this.stickState; const hitR = 0.09;
      const padPoint = (k) => { const d = DRUMS[k]; return d.pos.clone().add(new THREE.Vector3(0, 0, d.kind === "cymbal" ? d.r * 0.55 : d.r * 0.35).applyAxisAngle(new THREE.Vector3(1, 0, 0), d.tilt)); };   // 打点: 手前寄り
      // 構え (叩く前・叩き終わったあと) はスネアの 10 cm 上。腕を短くしたら、前の (-0.42, 0.98, 0.16) に 3 mm 届かなかった。
      // 体へ寄せすぎても、スティックが長いので届かない (体寄りに 6 cm で 57 mm 足りなかった。2026-11-03)
      // 振り上げの高さと構えの高さは、腕の長さの比 ARM_K (模型の腕は前の体の 0.6 倍) を掛ける (2026-11-03: 前の寸法のままでは、
      // スティックの先が頭のあたりまで上がり、腕が追いつかなかった・握りの検査で 4,028 件)
      const ARM_K = (ARM.upper + ARM.fore) / (5.4 + 4.9);
      const restTip = padPoint("sn").add(V(0, 0.10 * ARM_K, 0));
      // 先の位置は時刻だけで決める (2026-11-02): 前の打点から山なりに振り上げ、次の打の時刻ちょうどに打点へ着く。
      // 前は lerp(dt*60) で、打つ直前に 1 コマで目標へ飛んでいた (チンパンジーの腕では瞬間移動に見えた)
      const ease = (u) => u * u * u * (u * (u * 6 - 15) + 10);
      // 打ったあと DWELL 秒は先を打面に留める: 振り上げを大きくしたら、打った直後のコマで先がもう 5〜6 cm 上がっていて、
      // 画面 (1 コマ 1/60 秒) に打面に当たったコマが写らなかった (叩きの検査で外れ 23〜59 個。2026-11-03)
      const DWELL = 0.02;
      const P0 = hitPrev ? padPoint(hitPrev.k) : restTip, t0 = hitPrev ? hitPrev._sec : -Infinity;
      // 先の位置 = 打点を結ぶ道 (ss.tip) を、ひじを中心に前腕を振って上げる分 foreLift と、手首のスナップで上げる分 wristLift。
      // 2026-11-03 さとるん「腕全体を振るんじゃなく、手首のスナップ、前腕の振りで叩く。ひじは叩く位置まで移動するが、ひじの動きで叩くんじゃない。
      // 強く叩くときはひじを支点に前腕を曲げて叩く」: ひじは打点へ移るだけで、叩く動きでは動かさない (前はひじを最大 22 cm 上下させていた)
      // - 高さは次の打の強さで決める (腕の長さの比 ARM_K を掛ける前で、弱いハイハット約 16 cm・スネア約 33 cm・強いクラッシュ約 51 cm)。
      //   打と打の間が短いほど小さく (8 分音符で 8 割・16 分音符で 4 割。アクセントは小さくしすぎない)
      // - 手首と前腕の分け方は太鼓ごと (ハイハット 手首 75%・スネア 50%・タム 45%・クラッシュ 40%)。強い太鼓ほど前腕を使う
      // - 前腕は早めに頂点に来て先に下り、手首は遅れて上がって最後に振り下ろす (前腕が先、手首があとのムチの動き)
      const WRIST = { hh: 0.75, sn: 0.5, t1: 0.45, t2: 0.45, t3: 0.45, cr: 0.4 };
      // 振り下ろしは、打つ瞬間がいちばん速くなるように加速する (2026-11-03 さとるん「クラッシュを叩く時に、チョンってするだけの感じ。
      // 大事なところはもっと上から叩きつけるように。スネアも強く叩くところはパンって」「腕が等速で動いていく感じに迫力ない」)。
      // 前は前腕の山 u (1 - u)^1.5 と手首の sin で、打つ直前に先がゆっくりになっていた。
      // 1 打 = 打ったあと跳ね返って構え → 振りかぶる → 頂点で一瞬ためる → 加速して振り下ろす。
      // - 強い打 (アクセント: 強さ 100 を超えるクラッシュ・スネア・タム。116 で最大。ハイハットは除く) ほど高く振りかぶり、頂点でためる時間を長く
      // - ふつうの打は、前腕が先に下りて打つ少し前に止まり、最後は手首のスナップで打つ (手首の位置は、打つ瞬間に急に向きを変えない)
      const accentOf = (n) => (n && n.k !== "hh" ? clamp(((n.v ?? 90) - 100) / 16, 0, 1) : 0);
      const height = (n) => (0.10 + 0.30 * clamp(((n.v ?? 90) - 70) / 50, 0, 1) + 0.20 * accentOf(n)) * ARM_K;
      const smooth = (u) => u * u * (3 - 2 * u);
      let foreLift = 0, wristLift = 0; const strokeK = hitNext?.k ?? hitPrev?.k;
      if (hitNext) {
        const P1 = padPoint(hitNext.k), t1 = hitNext._sec, gap = Math.max(1e-3, t1 - t0), acc = accentOf(hitNext);
        const tA = Number.isFinite(t0) ? t0 + DWELL : t1 - 1.2, span = Math.max(1e-3, t1 - tA);
        const H = height(hitNext) * clamp(gap / (0.28 - 0.06 * acc), 0.4 + 0.2 * acc, 1);
        const ws = (WRIST[hitNext.k] ?? 0.55) * (1 - 0.2 * acc), HW = H * ws, HF = H - HW;
        // 時刻: tRise から振りかぶり、tPeak で頂点、tTop まで溜めて、t1 へ振り下ろす
        const down = Math.min(span * 0.42, 0.075 + 0.05 * acc), tTop = t1 - down;
        const hold = Math.max(0, Math.min(0.03 + 0.07 * acc, (tTop - tA) * 0.3)), tPeak = tTop - hold;
        const riseDur = Math.max(1e-3, Math.min(tPeak - tA, 0.30 + 0.15 * acc)), tRise = tPeak - riseDur;
        const ready = tRise > tA + 0.1 ? Math.min(H, 0.05 * ARM_K) : 0, r = ready / Math.max(H, 1e-6);   // 間が長いときに、打ったあと跳ね返って待つ高さ
        // 手首: 跳ね返りのように速く上がって頂点で溜め、最後は加速して打つ (打つ瞬間がいちばん速い)
        if (now >= tTop) wristLift = HW * (1 - clamp((now - tTop) / down, 0, 1) ** 2.2);
        else if (now >= tPeak) wristLift = HW;
        else if (now >= tRise) wristLift = HW * (r + (1 - r) * (1 - (1 - clamp((now - tRise) / riseDur, 0, 1)) ** 2));
        else wristLift = HW * r * (1 - (1 - clamp((now - tA) / 0.12, 0, 1)) ** 2);
        // 前腕: ゆっくり動き出して上がり、手首より先に下りはじめる。ふつうの打は打つ少し前 (fEnd) に止まる (動き出しと止まりの速さは 0)。
        // アクセントは前腕も打つ瞬間まで加速して振り下ろす (止めると、打つ瞬間の先の速さが 1.6 m/秒にとどまり、叩きつける感じが出なかった)
        // (前腕を手首と同じ速さの形で下ろすと、ひじと手首が 1 コマで最大 14 cm 動き、なめらかさの検査で急な変化が 776 → 2,302 回に増えた)
        const fEnd = t1 - 0.15 * down * (1 - acc), fd = Math.max(1e-3, Math.min((fEnd - tA) * 0.5, down * 2.2)), fStart = fEnd - fd;
        const fDown = (u) => (1 - acc) * smooth(u) + acc * u * u;
        const fRiseDur = Math.max(1e-3, Math.min(fStart - tA, 0.35 + 0.15 * acc)), fRise = fStart - fRiseDur;
        if (now >= fEnd) foreLift = 0;
        else if (now >= fStart) foreLift = HF * (1 - fDown(clamp((now - fStart) / fd, 0, 1)));
        else if (now >= fRise) foreLift = HF * (r + (1 - r) * smooth(clamp((now - fRise) / fRiseDur, 0, 1)));
        else foreLift = HF * r * smooth(clamp((now - tA) / 0.15, 0, 1));
        // 横の移動は振り下ろしの途中までに終える (最後は打面へ上から振り下ろす)
        const tm0 = Math.max(tA, tPeak - 0.6), tm1 = t1 - 0.15 * down;
        ss.tip.copy(P0).lerp(P1, ease(clamp((now - tm0) / Math.max(1e-3, tm1 - tm0), 0, 1)));
      } else {
        const u = clamp((now - t0 - DWELL) / 0.6, 0, 1);
        ss.tip.copy(P0).lerp(restTip, ease(u)); wristLift = 0.06 * ARM_K * Math.sin(Math.PI * u);
      }
      const baseY = ss.tip.y;
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
      // Anticipatory extension, then a small flexion/rebound around each hit.
      // The tip remains the animation's exact contact target throughout.
      const before = hitNext ? hitNext._sec - now : Infinity;
      const after = hitPrev ? now - hitPrev._sec : Infinity;
      // ハイハットは手首で回すので、前後の小さな曲げは入れない。打った瞬間にスティックを打面へ下向きに当てる分 (-.07) だけ残す
      // 打つ前後の前腕の小さな曲げは使わない (2026-11-03): 全部の太鼓を手首で叩くので、打面へ下向きは下の aimDown が受け持つ
      const snap = 0;
      // ひじの位置は打点で決める (叩く動きでは動かさない)
      const grip = drumGripFrame(Sh, ss.tip, this.armLen.upper, this.armLen.fore, ROBOT_SCALE * HAND_S, STICK_LEN, snap + WRIST_COCK, ss.side ?? 0, baseY);
      ss.side = grip.side;
      // 1. 打面へ下向きに当てる (2026-11-02): 肩より高いクラッシュでは、スティックが打面とほぼ平ら (下向き 0.2〜0.8 度) で当たっていた。
      //    スティックの先を中心に手を回して、打面へ 2 度ほど下向きにする (先の位置は変わらない)。
      //    2026-11-03: ひじを下げた形では回す量が大きく、打つ前後 0.15 秒だけ入れると 1 打ごとに手首が大きく動いた (ハイハットを刻む間の
      //    手首の道のりが先の 0.94 倍)。打と打の間ずっと、前の太鼓の向きから次の太鼓の向きへなめらかに移す。手首の返しの前に決める
      //    (返したあとで決めると、返して上げた分を毎コマ打ち消して、手首がもっと動いた)
      let handQ = grip.quaternion, wristPos = grip.wrist, aimScale = 1;
      const aimDown = (k, w) => {
        w *= aimScale;
        if (!k || w <= 0) return;
        const n = V(0, 1, 0).applyAxisAngle(V(1, 0, 0), DRUMS[k].tilt), axis = STICK_AXIS.clone().applyQuaternion(handQ), need = axis.dot(n) + 0.035;
        if (need <= 0) return;
        const r = new THREE.Quaternion().setFromAxisAngle(axis.clone().cross(n).normalize(), -Math.asin(Math.min(1, need)) * w);
        handQ = r.clone().multiply(handQ); wristPos = ss.tip.clone().add(wristPos.clone().sub(ss.tip).applyQuaternion(r));
      };
      const toNext = hitNext && hitPrev ? ease(clamp(after / Math.max(1e-3, after + before), 0, 1)) : hitNext ? 1 : 0;
      // 同じ太鼓を続けるときは 1 回で回す (前と次に分けて足すと、打と打の間で回す量が 1 → 0.75 → 1 と揺れて、手首が動いた)
      const applyAim = () => {
        handQ = grip.quaternion; wristPos = grip.wrist;
        if (hitPrev && hitNext && hitPrev.k === hitNext.k) aimDown(hitNext.k, 1);
        else { aimDown(hitPrev?.k, hitNext ? 1 - toNext : clamp(1 - after / 0.3, 0, 1)); aimDown(hitNext?.k, toNext); }
      };
      applyAim();
      // 回したせいで手首が腕の届く長さを超えるときは、回しを弱める (振りかぶって腕がのびた所で、先が最大 16 mm 道からずれた。2026-11-03)。
      // 打つ瞬間は先の位置が決まっていて届くので、ここには来ない
      const reachMax = (this.armLen.upper + this.armLen.fore) * 0.996;
      if (wristPos.distanceTo(Sh) > reachMax) {
        let lo = 0, hi = 1;
        for (let i = 0; i < 8; i++) { aimScale = (lo + hi) / 2; applyAim(); if (wristPos.distanceTo(Sh) > reachMax) hi = aimScale; else lo = aimScale; }
        aimScale = lo; applyAim();
      }
      // 2. 前腕の振り: ひじを支点に、前腕と手とスティックをまとめて回して、先を foreLift だけ上げる (ひじは動かない)
      if (foreLift > 1e-4) {
        const E = Sh.clone().add(grip.pole), f = wristPos.clone().sub(E), toTip = ss.tip.clone().sub(E), th = Math.hypot(toTip.x, toTip.z);
        const axis = f.clone().cross(V(0, 1, 0)).normalize(), ang = Math.asin(clamp(foreLift / Math.max(th, 1e-3), 0, 0.95));
        const rot = new THREE.Quaternion().setFromAxisAngle(axis, ang);
        handQ = rot.clone().multiply(handQ); wristPos = E.clone().add(f.applyQuaternion(rot)); ss.tip.copy(E).add(toTip.applyQuaternion(rot));
      }
      // 3. 手首のスナップ: 手首の位置はそのまま、スティックを手首のまわりに回して、先を wristLift だけ上げる (先は手首を中心に弧を描く)
      if (wristLift > 1e-4) {
        const v = ss.tip.clone().sub(wristPos), vh = Math.hypot(v.x, v.z);
        const axis = v.clone().cross(V(0, 1, 0)).normalize(), ang = Math.asin(clamp(wristLift / Math.max(vh, 1e-3), 0, 0.95));
        const rot = new THREE.Quaternion().setFromAxisAngle(axis, ang);
        handQ = rot.clone().multiply(handQ);
        ss.tip.copy(wristPos).add(v.applyQuaternion(rot));   // 狙う先 = 手首で回したあとの先 (握りの検査が先の位置を照らす)
      }
      this._solveArm("Left", wristPos, {pole: grip.pole, quaternion: handQ, extension: .998});
      this.drumGrip = {snap, reachError: grip.reachError, foreLift, wristLift, aimScale};
      const hand = this.hands.Left;
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
      const ankle=contact.clone().sub(V(0,-.60,2.5).multiplyScalar(ROBOT_SCALE * FOOT_S).applyQuaternion(fq));
      this._solveLeg("Left",ankle,-boardAng);
      pd.contact=contact;
      if(pd.chain) {
        const a=pd.hinge.localToWorld(V(0,.006,-.235)), b=pd.beater.localToWorld(V(0,.027,.017));
        pd.chain.position.copy(a).add(b).multiplyScalar(.5); pd.chain.scale.y=a.distanceTo(b); pd.chain.quaternion.setFromUnitVectors(V(0,1,0),b.sub(a).normalize());
      }
    }

    // ── 右足: 足鍵盤
    // 足の位置は時刻だけで決める (2026-11-03 さとるん「足がワープしたりせず、ちゃんと滑らかに動くように」)。前は次の鍵へ lerp(dt*32) で
    // 近づくだけだったので、16 分音符では鍵に着く前に次の鍵へ向かい、鍵の上を引きずった。
    // 前の音の鍵を押している → 次の音の時刻から逆算して足を離し、出るときも着くときも速さ 0 の曲線で持ち上げて運び、次の音の時刻ちょうどに
    // 着いて押す。運ぶ時間は距離から決める (1 秒あたり約 1.2 m を超えない)。高さは前の鍵の面から次の鍵の面へ (黒鍵は白鍵より 4 cm 高い) 移し、途中で少し持ち上げる
    {
      const fr = this.footR; const pedals = this.pb.pedals;
      for (const p of Object.values(pedals)) p.target = 0;
      let prevN = null, nextN = null;
      for (const n of S.pedal) { if (beatToSec(n.s) <= now + 0.004) prevN = n; else { nextN = n; break; } }
      const surf = (p, z) => { const pd = pedals[p]; if (!pd) return PB_TOP + 0.012; pd.pivot.updateMatrixWorld(true); return pd.pivot.localToWorld(V(0, .012, z - pd.pivot.position.z)).y; };
      const A = prevN ?? nextN;
      let x = fr.x, z = fr.z, y = PB_TOP + 0.03, press = 0, on = null;
      if (A) {
        const xa = pedalX(A.p), za = TOE_Z(A.p);
        const sounding = prevN && now < beatToSec(prevN.s + prevN.d);
        x = xa; z = za; on = A.p; press = sounding ? 1 : 0;
        y = surf(A.p, za) + (sounding ? 0 : 0.017);
        if (prevN && nextN) {
          const tP = beatToSec(prevN.s), tN = beatToSec(nextN.s), xb = pedalX(nextN.p), zb = TOE_Z(nextN.p);
          const dist = Math.hypot(xb - xa, zb - za), same = prevN.p === nextN.p;
          // 押している時間は短く (16 分音符でも 0.025 秒で離れる)、運ぶ曲線は 3 次 (いちばん速い所が平均の 1.5 倍)。
          // 5 次の曲線と 0.045 秒の押しでは、16 分音符で 12 cm 動くとき 1 コマ 64 mm・急な変化 23 回だった
          const travel = same ? Math.min(0.07, (tN - tP) * 0.45) : clamp(0.05 + dist / 1.2, 0.07, 0.3);
          const tL = Math.max(tP + Math.min(0.025, (tN - tP) * 0.25), tN - travel);
          if (now >= tL) {
            const u = clamp((now - tL) / Math.max(1e-3, tN - tL), 0, 1), e = u * u * (3 - 2 * u);
            const lift = same ? 0.008 : 0.012 + 0.02 * clamp(dist / 0.3, 0, 1);
            const y0 = surf(prevN.p, za) + (tL < beatToSec(prevN.s + prevN.d) ? 0 : 0.017), y1 = surf(nextN.p, zb);
            x = lerp(xa, xb, e); z = lerp(za, zb, e); y = lerp(y0, y1, e) + lift * 16 * u * u * (1 - u) * (1 - u);
            press = 0; on = u > 0.5 ? nextN.p : prevN.p;
          }
        }
        if (press && pedals[A.p]) pedals[A.p].target = 1;
      }
      fr.x = x; fr.z = z; fr.press = press;
      for (const p of Object.values(pedals)) { const prev = p.press; p.press = lerp(p.press, p.target, Math.min(1, dt * (p.target ? 50 : 14))); if (Math.abs(p.press - prev) > 1e-4 || p.press > 1e-3) { p.pivot.rotation.x = 0.05 * p.press; } updateKeyIndicator(p); }
      const pedal = on != null ? pedals[on] : null;
      const contact = V(x, y, z);
      const pitch=-(pedal?.press??0)*.05;
      const fq=new THREE.Quaternion().setFromAxisAngle(V(0,1,0),Math.PI).multiply(new THREE.Quaternion().setFromAxisAngle(V(1,0,0),pitch));
      this._solveLeg("Right",contact.clone().sub(V(0,-.60,2.5).multiplyScalar(ROBOT_SCALE * FOOT_S).applyQuaternion(fq)),pitch);
      this.pedalContact=contact;
    }

    // チンパンジーの指の先の近くの関節を、真ん中の関節に合わせて曲げる (chimp.js addFingerTips)
    this.chimp?.userData.updateFingers?.();

    // ── カメラ
    const eyePos = new THREE.Vector3(); this.robotParts.eye.getWorldPosition(eyePos);
    const eyeTarget = this.handR.mode === "knob" ? this.synth.group.localToWorld(V(this.handR.x, 0, KNOB_Z)) : hitNext && hitNext._sec - now < 0.25 && hitNext.k !== "hh" ? DRUMS[hitNext.k].pos.clone() : this.synth.group.localToWorld(V(clamp(this.handR.x, 0.05, KB_W - 0.05), 0, -0.05));
    this._eyeLook.lerp(eyeTarget, Math.min(1, dt * 3));
    this.camEye.position.set(eyePos.x, eyePos.y + 0.02, eyePos.z + 0.02); this.camEye.lookAt(this._eyeLook); this.camEye.rotateZ(-sway * 0.35);
    // 寄りカメラ: auto は 右手 (鍵盤/つまみ) と ドラム (フィル) を切り替える
    let want = this.closeMode;
    if (want === "auto") want = this._whistle > 0.5 ? "face" : this.handR.mode === "knob" ? "knobs" : drumBurst >= 3 || (hitNext && hitNext._sec - now < 0.3 && (hitNext.k === "cr" || hitNext.k.startsWith("t"))) ? "drums" : "keys";
    // 1 つの寄りは 1.2 秒は続ける (つまみと口笛はすぐ)。2026-11-03: 鍵盤とドラムの間を 1 秒たたずに切りかえることが、夜を追い越してで 20 回あった
    this._closeHeld = (this._closeHeld ?? 0) + dt;
    if (want !== this.closeTarget) { this._closeSwitchT = (this._closeSwitchT ?? 0) + dt; if ((this._closeSwitchT > 0.35 && (this._closeHeld > 1.2 || want === "face")) || want === "knobs") { this.closeTarget = want; this._closeSwitchT = 0; this._closeHeld = 0; this._cp = this._cl = null; } } else this._closeSwitchT = 0;
    // 寄る先を変えるときは、追いかけずに切りかえる (2026-11-02): 鍵盤とドラムの間を追いかけると、カメラがチンパンジーの頭と腕の中を通っていた
    const kb = this.synth.group;
    let cp, cl;
    // カメラの離れ方 (m) は、シンセの中の座標では KB_SCALE で割る。ドラムはドラムを動かした分だけ動かす
    const u = 1 / KB_SCALE;
    if (this.closeTarget === "knobs") { const hx = clamp(this.handR.x, 0.1, KB_W - 0.1); cp = kb.localToWorld(V(hx - 0.26 * u, 0.40 * u, KNOB_Z - 0.28 * u)); cl = kb.localToWorld(V(hx - 0.02 * u, 0.02 * u, KNOB_Z)); }
    else if (this.closeTarget === "drums") { cp = V(-0.05, 1.55, 0.95).add(DRUM_SHIFT); cl = V(-0.42, 0.85, 0.0).add(DRUM_SHIFT); }
    // 口笛の間は、顔とマイクを斜め前から (頭の骨から測る・m)
    // (カメラは頭の向きではなく体の向きで決める: うつむいた頭に合わせると、シンセの裏に入った)
    // 口笛の寄り: 本当の口を、口の高さのやや下の正面から見る (前は上から見ていて、口が鼻の陰に隠れていた。2026-11-03)
    // 口元が大きく写るよう、顔から 30 cm に寄る (目も入るよう、見る先は口の 1 cm 上)
    else if (this.closeTarget === "face") { const hs = this.headset; cl = hs.mouth ? hs.group.localToWorld(hs.mouth.clone()).add(V(0, 0.01, 0)) : this.bones.Head.localToWorld(V(0.03, 0.0, 0.12).divideScalar(ROBOT_SCALE)); cp = cl.clone().add(V(-0.13, -0.01, 0.27).applyQuaternion(this.robot.quaternion)); }
    // 鍵盤: 右手の右上の前寄りから見る (2026-11-03): 椅子を 14 cm 寄せたら、前の肩越しの位置 (0.36 上・0.34 手前) は右腕のすぐ後ろになり、腕で画面がふさがった
    // 体を模型の大きさにしたら (2026-11-03)、チンパンジーが鍵盤のすぐ手前に来て、手前寄りのカメラは右腕の中になった。
    // シンセの奥 (つまみのパネルの向こう) の上から、弾いている指とチンパンジーの顔を正面から見る
    else { const hx = clamp(this.handR.x, 0.08, KB_W - 0.08); cp = kb.localToWorld(V(hx + 0.08 * u, 0.48 * u, KNOB_Z - 0.46 * u)); cl = kb.localToWorld(V(hx, 0.05 * u, 0.04 * u)); }
    // 体の中にカメラを入れない (2026-11-02): チンパンジーの頭は半径約 15 cm で、肩越しの鍵盤のカメラが頭の中に入っていた。
    // ゆっくり追う頭と体の形の外へ、目標の位置を押し出してから追う。速く頭を振ったときのために、追ったあとも頭の外へ出す
    const keep = this._keepOut(dt);
    keep.push(cp, cl, 1);
    this._cp = (this._cp ?? cp.clone()).lerp(cp, Math.min(1, dt * 2.5)); this._cl = (this._cl ?? cl.clone()).lerp(cl, Math.min(1, dt * 2.5));
    keep.push(this._cp, this._cl, 0.75);
    this.camClose.position.copy(this._cp); this.camClose.lookAt(this._cl);
    const o = this.orbit;
    if (o.auto) { o.autoT = (o.autoT ?? 0) + dt; this._autoCamera(beat, o); }
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
        const radius=.0125+(.011-.0125)*(local.y+.0065)/.017,surfaceGap=(Math.hypot(local.x,local.z)-radius)*KB_SCALE-TIP;
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
          const k = this.synth.keys[n.p]; const dip = (k ? k.press : 0) * (KEY_DIP / (black ? BLACK_L : WHITE_L)) * (clamp(L.z, zLo, zHi) - KEY_PIVOT_Z); const dy = (L.y - ((black ? BLACK_TOP : 0) - dip)) * KB_SCALE - TIP;
          if (Math.abs(dx) > (black ? BLACK_W : WHITE_W) / 2 - 0.001 || dz !== 0 || Math.abs(dy) > 0.008) misses.push({ kind: "synth", p: n.p, f: n.f, s: n.s, dx: +dx.toFixed(4), dy: +dy.toFixed(4), dz: +dz.toFixed(4) });
        } else if (c.kind === "drum") {
          const d = DRUMS[c.n.k]; this.stick.tip.getWorldPosition(T); const rel = T.clone().sub(d.pos); const dy = rel.y; const dr = Math.hypot(rel.x, rel.z);
          if (dr > d.r * 0.95 || Math.abs(dy) > 0.05) misses.push({ kind: "drum", k: c.n.k, s: c.n.s, dr: +dr.toFixed(3), dy: +dy.toFixed(3) });
        } else if (c.kind === "pedal") {
          const sole=this.bones.RightFoot.localToWorld(V(0,-.60,2.5));
          const pedal=this.pb.pedals[c.n.p];const local=pedal.pivot.worldToLocal(sole);
          const dx=local.x,dy=local.y-.012,width=isBlack(c.n.p)?PB_BLACK_W:PB_WHITE_W;
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
          const gap=(rel.addScaledVector(STICK_AXIS,-along).length()-.12)*ROBOT_SCALE*HAND_S-TIP;
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
    else if(view==="pedal") {target=V(KICK_POS.x,.15,KICK_POS.z+KICK_DEPTH/2+.20);offset=V(-.62,.22,.46).multiplyScalar(.75);}
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
    else if(view==="bass") {target=V(PB_X0+4*(PB_WHITE_W+PB_GAP),.10,PB_Z_HEEL-PB_LONG/2);offset=V(.44,.42,.60).multiplyScalar(.75);}
    else {target=V(-.10,.80,.06);offset=V(1.7,1.15,2.8);}
    camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateProjectionMatrix();
  }

  /** つまみを回す手首の向きの基準 (ev._ref・この値で手がまっすぐ) を、曲の頭から順に決める (右手のつまみの所の説明を見る) */
  _knobRefs() {
    const K = this.song.knobs, KA = 2 * KNOB_ANGLE, LIM = 1.9, RATE = 6, gapMax = LIMITS.knobBefore + KNOB_BACK;
    let end = 0, prevEnd = -Infinity;   // end = 前のつまみを回し終えた手首の向き (ラジアン)。鍵盤に戻ったら 0
    for (const ev of K) {
      const from = knobStateAt(this.knobDefaults, K, ev.s - 1e-4, (b) => this._b2s(b))[ev.param] ?? .5, T = (ev.to - from) * KA;
      const start = this._b2s(ev.s), gap = start - prevEnd;
      let r0 = T / 2 + KNOB_ROLL0;                                       // 理想: 回す分のまん中で、手が楽な向き (KNOB_ROLL0)
      if (gap <= gapMax) r0 = end + clamp(r0 - end, -RATE * gap, RATE * gap);   // 鍵盤へ戻らずに移る: 前の向きから無理なく
      r0 = clamp(r0, Math.max(-LIM, T - LIM), Math.min(LIM, T + LIM));   // 回し始め r0 も回し終わり r0 - T も ±110 度の中
      ev._ref = from + r0 / KA; end = r0 - T; prevEnd = this._b2s(ev.s + ev.d);
    }
    this._knobRefsFor = K;
  }

  /** つまみのカード (ar.js) が守る所: 右手 (指先まで)・顔とマイク・体・スティックの手・太鼓を、位置と半径 (m) の球で返す */
  arSpheres() {
    const B = this.bones, W = (o, r) => [o.getWorldPosition(new THREE.Vector3()), r];
    const wrist = W(B.RightHand, 0.05), elbow = B.RightForeArm.getWorldPosition(new THREE.Vector3());
    const hand = [wrist, [elbow.lerp(wrist[0], 0.5), 0.04], ...this.hands.Right.fingers.map((f) => W(f.tip, 0.022))];
    const face = [[B.Head.localToWorld(HEAD_CENTER.clone()), 0.11], ...(this.headset.mic ? [[this.headset.group.localToWorld(this.headset.mic.clone()), 0.025]] : [])];
    const body = [W(B.Hips, 0.15), W(B.Spine1, 0.15), wrist];
    const stick = [W(B.LeftHand, 0.06), W(this.stick.tip, 0.03)];
    const drums = Object.values(this.drums.pads).map((p) => [p.holder.getWorldPosition(new THREE.Vector3()), DRUMS[p.idx].r]);
    return { hand, face, body, stick, drums };
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

export { DRUMS, KB_POS, KB_YAW, KB_W, KB_SCALE, HAND_S, FOOT_S, TIP, KICK_R, KICK_DEPTH, KEY_PIVOT_Z, SEAT_X, SEAT_Y, SEAT_Z };
