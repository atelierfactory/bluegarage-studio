// ═══════════ 1 体ぶんの骨組み (描かない) と、姿勢を決める道具 ═══════════
// 骨の名前と長さは ../piano/scene.js の SKELETON と同じ (ロボット単位。root の大きさ ROBOT_SCALE で m になる)。
// 見た目は robot-lite.js が、この骨の matrixWorld から 48 体ぶんまとめて描く。
//
// 体の向き (rig.root の中): +z = 前 (顔の向き)、+y = 上、+x = ロボットの左。
// 骨の中の向き:
//   腕 (Left/Right Arm, ForeArm): 骨の向き = 左は +x・右は -x。肘は骨の z 軸まわりの蝶番 (solveArm が決める)
//   手 (Left/Right Hand): 指先 = 左は +x・右は -x、+y = 手の甲、-y = 手のひら、+z = 親指の側 (左右とも)
//   脚 (UpLeg, Leg): 骨の向き = -y、+z = 骨の前 (ひざ頭・すね)。足 (Foot): +z = つま先、+y = 上
//   指 (rig.fingers.Left[i] = {root, joint, tip}): 親指 → 小指。root と joint の z まわりで曲げる (setFingers)
import * as THREE from "three";
import { SKELETON, ROBOT_SCALE } from "../piano/scene.js";
import { FINGERS, FINGER_SPLIT, FINGER_R, SOLE_Y, SEAT_HIPS_Y } from "./robot-lite.js";

export const S = ROBOT_SCALE;
export const ARM = { upper: SKELETON.LeftForeArm[0] * S, fore: SKELETON.LeftHand[0] * S };          // 0.329 / 0.299 m
export const LEG = { thigh: -SKELETON.LeftLeg[1] * S, shin: -SKELETON.LeftFoot[1] * S };             // 0.451 / 0.427 m
export const SOLE = -SOLE_Y * S;                 // 足首 (Foot の骨) から足の裏まで 0.035 m
const PARENT = {
  LowerBack: "Hips", Spine: "LowerBack", Spine1: "Spine", Neck1: "Spine1", Head: "Neck1", HeadEnd: "Head",
  LeftShoulder: "Spine1", LeftArm: "LeftShoulder", LeftForeArm: "LeftArm", LeftHand: "LeftForeArm", LeftHandEnd: "LeftHand",
  RightShoulder: "Spine1", RightArm: "RightShoulder", RightForeArm: "RightArm", RightHand: "RightForeArm", RightHandEnd: "RightHand",
  LeftUpLeg: "Hips", LeftLeg: "LeftUpLeg", LeftFoot: "LeftLeg", LeftToeBase: "LeftFoot", LeftToeEnd: "LeftToeBase",
  RightUpLeg: "Hips", RightLeg: "RightUpLeg", RightFoot: "RightLeg", RightToeBase: "RightFoot", RightToeEnd: "RightToeBase",
};
export const SIDES = ["Left", "Right"];
export const sgnOf = (side) => (side === "Left" ? 1 : -1);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

/* ─────────── 骨組みを作る ─────────── */
export function createRig(index = 0) {
  const root = new THREE.Object3D(); root.name = "robot-" + index; root.scale.setScalar(S);
  const bones = {};
  for (const [name, pos] of Object.entries(SKELETON)) { const b = new THREE.Object3D(); b.name = name; b.position.set(...pos); bones[name] = b; }
  for (const [name, parent] of Object.entries(PARENT)) bones[parent].add(bones[name]);
  root.add(bones.Hips);
  const fingers = {};
  for (const side of SIDES) {
    const sgn = sgnOf(side), H = bones[side + "Hand"];
    fingers[side] = FINGERS.map((f, i) => {
      const r = new THREE.Object3D(); r.position.set(sgn * f.root[0], f.root[1], f.root[2]); H.add(r);
      const j = new THREE.Object3D(); j.position.set(sgn * f.len * FINGER_SPLIT, 0, 0); r.add(j);
      const t = new THREE.Object3D(); t.position.set(sgn * f.len * (1 - FINGER_SPLIT), 0, 0); j.add(t);
      return { root: r, joint: j, tip: t, len: f.len, lenM: f.len * S, radiusM: FINGER_R[1] * S, index: i };
    });
  }
  // 決まった点 (どれも Object3D。world の位置は wpos で読む)
  const point = (bone, x, y, z, name) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); bones[bone].add(o); return o; };
  const points = {
    mouth: point("Head", 0, 0.86, 1.2, "mouth"),          // 口の溝の前 (吹く楽器の歌口・リード・マウスピースを当てる所)
    chin: point("Head", 0, 0.12, 0.85, "chin"),           // あごの下 (バイオリン・ビオラのあご当て)
    jawLeft: point("Head", 0.55, 0.15, 0.6, "jawLeft"),   // あごの左下 (あご当てに乗せる所)
    eye: point("Head", 0, 1.49, 1.25, "eye"),
    collarLeft: point("Spine1", 1.15, 1.75, 0.95, "collarLeft"),   // 左の鎖骨の上 (楽器を乗せる所)
    sternum: point("Spine1", 0, 0.6, 1.5, "sternum"),               // 胸の前 (チェロの背中が当たる所)
  };
  // 手の中の決まった点: grip = 握りこぶしの中 (棒をつかむ所)、palm = 手のひらの真ん中の表面
  for (const side of SIDES) {
    const sgn = sgnOf(side);
    points["grip" + side] = point(side + "Hand", sgn * 1.15, -0.62, 0.12, "grip" + side);
    points["palm" + side] = point(side + "Hand", sgn * 0.9, -0.25, 0, "palm" + side);
  }
  // 毎コマ行列を更新する骨 (親が先)。描く部品が付く骨だけ。決まった点 (points)・指先 (tip)・末端の骨は、wpos で読むときに更新される
  const nodes = [root];
  for (const name of ["Hips", "LowerBack", "Spine", "Spine1", "Neck1", "Head", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot"]) nodes.push(bones[name]);
  for (const side of SIDES) for (const f of fingers[side]) nodes.push(f.root, f.joint);
  const rig = { index, root, bones, fingers, points, nodes };
  restPose(rig);
  return rig;
}
// 描く骨だけの行列を更新する (rig.root.updateMatrixWorld(true) の軽い版。root の親は単位行列の前提)
export function updateRig(rig) {
  const n = rig.nodes;
  const r = n[0]; r.matrix.compose(r.position, r.quaternion, r.scale); r.matrixWorld.copy(r.matrix);
  for (let i = 1; i < n.length; i++) { const o = n[i]; o.matrix.compose(o.position, o.quaternion, o.scale); o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix); }
}

/* ─────────── 読み書きの道具 ─────────── */
export function wpos(obj, out = new THREE.Vector3()) { obj.updateWorldMatrix(true, false); return out.setFromMatrixPosition(obj.matrixWorld); }
export function wquat(obj, out = new THREE.Quaternion()) { obj.updateWorldMatrix(true, false); obj.matrixWorld.decompose(_p, out, _s); return out; }
// 体の向きの中の方向 (+z 前・+x 左) を world の方向に
export function bodyDir(rig, x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyQuaternion(rig.root.quaternion); }
// 体の向きの中の点 (m、rig.root の位置から) を world に
export function bodyPoint(rig, x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyQuaternion(rig.root.quaternion).add(rig.root.position); }
// ローカルの軸 a1 を world の w1 に (ぴったり)、a2 を w2 に (w1 に直交させてから) 向ける回転
export function basisQuat(a1, w1, a2, w2, out = new THREE.Quaternion()) {
  const L = frame(a1, a2), W = frame(w1, w2);
  _m.multiplyMatrices(W, L.transpose());
  return out.setFromRotationMatrix(_m);
}
function frame(a, b) {
  const x = a.clone().normalize(), y = b.clone().addScaledVector(x, -b.dot(x));
  if (y.lengthSq() < 1e-10) { const t = Math.abs(x.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0); y.copy(t).addScaledVector(x, -t.dot(x)); }
  y.normalize(); const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Matrix4().makeBasis(x, y, z);
}
// 骨の world の向きを決める (親の向きを差し引いてローカルに直す)。子の骨の world もその場で更新
export function setWorldQuat(bone, q) {
  wquat(bone.parent, _q);
  bone.quaternion.copy(_q.invert().multiply(q));
  bone.updateMatrixWorld(true);
}
// ローカルの軸 axisLocal が world の dir を向き、secondLocal が second の側を向くように骨を回す
export function aimBone(bone, axisLocal, dir, secondLocal, second) { setWorldQuat(bone, basisQuat(axisLocal, dir, secondLocal, second)); }

/* ─────────── 2 本の骨の IK ─────────── */
// root から target へ、長さ a・b の 2 本の骨。肘・ひざは pole の側に出る。届かないときは伸ばし切る
export function twoBone(root, target, a, b, pole) {
  const D = target.clone().sub(root);
  let d = D.length(); const maxD = (a + b) * 0.9995;
  const over = d - maxD;
  if (d > maxD) d = maxD;
  d = Math.max(d, Math.abs(a - b) + 1e-4);
  const dir = D.lengthSq() > 1e-12 ? D.normalize() : V(0, -1, 0);
  const cosA = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (perp.lengthSq() < 1e-8) perp.set(0, 1, 0).addScaledVector(dir, -dir.y);
  perp.normalize();
  const mid = root.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * sinA);
  const end = root.clone().addScaledVector(dir, d);
  return { mid, end, over: Math.max(0, over), dir, perp };
}

// 腕: 手首 (手の骨の原点) を wrist へ。pole = 肘を出す向き (world)。hand = {fingers, dorsal} (world の向き) か Quaternion
// 戻り値の over > 0 なら届かなかった長さ (m)
export function solveArm(rig, side, wrist, { pole = null, hand = null } = {}) {
  const sgn = sgnOf(side), B = rig.bones;
  const S0 = wpos(B[side + "Arm"]);
  const P = pole ?? bodyDir(rig, sgn * 0.45, -0.8, -0.4);
  const { mid: E, end: W, over } = twoBone(S0, wrist, ARM.upper, ARM.fore, P);
  const d1 = E.clone().sub(S0).normalize(), d2 = W.clone().sub(E).normalize();
  const h = new THREE.Vector3().crossVectors(d1, d2);
  if (h.lengthSq() < 1e-8) h.crossVectors(d1, P);
  if (h.lengthSq() < 1e-8) h.copy(bodyDir(rig, 0, 1, 0)).cross(d1);
  h.normalize().multiplyScalar(sgn);
  const ax = V(sgn, 0, 0), az = V(0, 0, 1);
  aimBone(B[side + "Arm"], ax, d1, az, h);
  aimBone(B[side + "ForeArm"], ax, d2, az, h);
  if (hand?.isQuaternion) setWorldQuat(B[side + "Hand"], hand);
  else if (hand) setHand(rig, side, hand.fingers, hand.dorsal);
  else setWorldQuat(B[side + "Hand"], wquat(B[side + "ForeArm"]));
  return { over, elbow: E };
}
// 手の向き: 指先の向き fingers と手の甲の向き dorsal (world)
export function setHand(rig, side, fingers, dorsal) {
  aimBone(rig.bones[side + "Hand"], V(sgnOf(side), 0, 0), fingers, V(0, 1, 0), dorsal);
}
// 手の中の点 (point = rig.points.gripLeft など) を world の target に合わせるための手首の位置
export function wristFor(rig, side, handQuat, point, target) {
  const local = point.position.clone().multiplyScalar(S).applyQuaternion(handQuat);   // 手の骨の中の点 (m)
  return target.clone().sub(local);
}
export function handQuatOf(side, fingers, dorsal) { return basisQuat(V(sgnOf(side), 0, 0), fingers, V(0, 1, 0), dorsal); }
// 手の中の点を target に合わせて腕を解く (手の向き fingers・dorsal は world)
export function reachWith(rig, side, point, target, fingers, dorsal, opts = {}) {
  const q = handQuatOf(side, fingers, dorsal);
  const wrist = wristFor(rig, side, q, point, target);
  const r = solveArm(rig, side, wrist, { ...opts, hand: q });
  return r;
}

// 脚: 足首 (Foot の骨) を ankle へ。knee = ひざを出す向き (world)。foot = {fwd, up}
export function solveLeg(rig, side, ankle, { knee = null, foot = null } = {}) {
  const B = rig.bones, sgn = sgnOf(side);
  const H = wpos(B[side + "UpLeg"]);
  const fwd = bodyDir(rig, 0, 0, 1);
  const K = knee ?? bodyDir(rig, sgn * 0.12, 0, 1);
  const { mid: Kp, end: A, over } = twoBone(H, ankle, LEG.thigh, LEG.shin, K);
  const d1 = Kp.clone().sub(H).normalize(), d2 = A.clone().sub(Kp).normalize();
  let f1 = d2.clone().negate().addScaledVector(d1, d2.dot(d1));      // ももの前 = すねの逆向きの、ももに直交する成分
  if (f1.lengthSq() < 0.02) f1.copy(fwd); f1.normalize();
  let f2 = d1.clone().addScaledVector(d2, -d1.dot(d2));               // すねの前 = ももの向きの、すねに直交する成分
  if (f2.lengthSq() < 0.02) f2.copy(fwd); f2.normalize();
  const ay = V(0, -1, 0), az = V(0, 0, 1);
  aimBone(B[side + "UpLeg"], ay, d1, az, f1);
  aimBone(B[side + "Leg"], ay, d2, az, f2);
  aimBone(B[side + "Foot"], az, foot?.fwd ?? fwd, V(0, 1, 0), foot?.up ?? V(0, 1, 0));
  return { over, knee: Kp };
}

/* ─────────── 指 ─────────── */
// curl[i] = 指 i (親指 → 小指) の曲げ (rad、付け根と先の節に半分ずつ。[付け根, 先] の組でもよい)、
// spread[i] = 開き (rad、+ で親指の側へ)。親指は spread で手のひらの前へ回り、curl で手のひらへ倒れる
export function setFingers(rig, side, curl, spread = null) {
  const sgn = sgnOf(side);
  rig.fingers[side].forEach((f, i) => {
    const c = curl[i] ?? curl[curl.length - 1], [c0, c1] = Array.isArray(c) ? c : [c * 0.5, c * 0.5];
    const sp = spread?.[i] ?? 0;
    f.root.rotation.set(0, -sgn * sp, -sgn * c0, "YZX");
    f.joint.rotation.set(0, 0, -sgn * c1);
  });
}
// 指先 (先の節の端の、手のひら側の面) の world の位置
export function fingerTip(rig, side, i, out = new THREE.Vector3()) {
  const f = rig.fingers[side][i];
  return wpos(f.tip, out);
}

/* ─────────── 頭と背骨 ─────────── */
// 背中の曲げ: pitch (+ で前へ)、yaw (+ でロボットの左へ回る)、roll (+ で左へ傾く) を 3 つの骨に分ける
export function setSpine(rig, pitch = 0, yaw = 0, roll = 0) {
  const B = rig.bones;
  for (const [name, k] of [["LowerBack", 0.25], ["Spine", 0.35], ["Spine1", 0.4]]) B[name].rotation.set(pitch * k, yaw * k, roll * k, "YXZ");
}
// 首と頭を world の点 target に向ける (amount 0..1)。tilt = 頭の左右の傾き (rad、+ で左へ)
export function lookAt(rig, target, amount = 1, tilt = 0) {
  const B = rig.bones;
  B.Neck1.rotation.set(0, 0, 0); B.Head.rotation.set(0, 0, 0);
  B.Neck1.updateMatrixWorld(true);
  const eye = wpos(rig.points.eye), d = target.clone().sub(eye);
  const inv = wquat(B.Neck1).invert();
  d.applyQuaternion(inv);
  const yaw = Math.atan2(d.x, d.z) * amount, pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z)) * amount;
  B.Neck1.rotation.set(pitch * 0.4, yaw * 0.4, tilt * 0.4, "YXZ");
  B.Head.rotation.set(pitch * 0.6, yaw * 0.6, tilt * 0.6, "YXZ");
  B.Neck1.updateMatrixWorld(true);
}

/* ─────────── 基本の姿勢 ─────────── */
export function restPose(rig) {
  for (const b of Object.values(rig.bones)) b.quaternion.identity();
  for (const side of SIDES) setFingers(rig, side, [0.3, 0.25, 0.25, 0.25, 0.25], [0.6, 0, 0, 0, 0]);
  rig.root.updateMatrixWorld(true);
}
// 椅子に座る。seat = layout.js の席 ({pos, yaw, floorY, seatTop})。腰を座面に乗せ、足の裏を床に付ける
// opts: forward (腰の前後 m)、feet: {Left:{x,z}, Right:{x,z}} (体の向きの中、腰の真下から m)、kneeOut
export function sit(rig, seat, { forward = 0.02, feet = null, footY = null, lift = 0 } = {}) {
  const B = rig.bones;
  rig.root.position.set(seat.pos.x, seat.floorY, seat.pos.z);
  rig.root.rotation.set(0, seat.yaw, 0);
  for (const name of ["Hips", "LowerBack", "Spine", "Spine1", "Neck1", "Head"]) B[name].quaternion.identity();
  B.Hips.position.set(0, (seat.seatTop - seat.floorY + lift) / S + SEAT_HIPS_Y, forward / S);
  rig.root.updateMatrixWorld(true);
  const fy = footY ?? seat.floorY;
  for (const side of SIDES) {
    const sgn = sgnOf(side), f = feet?.[side] ?? { x: sgn * 0.13, z: 0.4 };
    const ankle = bodyPoint(rig, f.x, 0, forward + f.z); ankle.y = fy + SOLE + (f.lift ?? 0);
    solveLeg(rig, side, ankle, { knee: bodyDir(rig, sgn * (f.knee ?? 0.15), 0.1, 1) });
  }
  rig.root.updateMatrixWorld(true);
}
// 立つ。足の裏を floorY に、腰は脚がほぼ伸びる高さ
export function stand(rig, pos, yaw, floorY, { bend = 0.035, spread = 0.13, ahead = 0 } = {}) {
  const B = rig.bones;
  rig.root.position.set(pos.x, floorY, pos.z); rig.root.rotation.set(0, yaw, 0);
  for (const name of ["Hips", "LowerBack", "Spine", "Spine1", "Neck1", "Head"]) B[name].quaternion.identity();
  const legLen = LEG.thigh + LEG.shin, hip = -SKELETON.LeftUpLeg[1] * S;
  B.Hips.position.set(0, (SOLE + hip + legLen * (1 - bend)) / S, 0);
  rig.root.updateMatrixWorld(true);
  for (const side of SIDES) {
    const sgn = sgnOf(side);
    const ankle = bodyPoint(rig, sgn * spread, 0, ahead + (side === "Left" ? 0.02 : -0.02)); ankle.y = floorY + SOLE;
    solveLeg(rig, side, ankle, { knee: bodyDir(rig, sgn * 0.1, 0, 1), foot: { fwd: bodyDir(rig, sgn * 0.18, 0, 1) } });
  }
  rig.root.updateMatrixWorld(true);
}
export { SEAT_HIPS_Y };
