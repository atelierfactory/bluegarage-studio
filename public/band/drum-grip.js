// Solve the upper arm and a combined forearm + grip + stick link. Solving
// only shoulder -> stick direction folds the wrist back on the forearm.
import * as THREE from 'three';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const STICK_AXIS = V(.42, .12, .90).normalize();
export const STICK_GRIP = V(2, -.66, .30);
// 2026-11-03 (チンパンジー・さとるん「ドラムを叩くとき、肩とひじ両方上がりすぎ」): ひじはスティックの先より ELBOW_DROP 下を
// 目安にし、肩の関節の横の高さより上げない。前はスティックの先より 10.5 cm 上で、叩いている間ずっと上腕がほぼ横に水平
// (平均 77〜107 度・真下 0 度) だった。今は スネア 33 度・ハイハット 27 度・クラッシュ 54 度 (平均)
export const ELBOW_DROP = .25;
export const ELBOW_LIFT_MAX = 0;   // 2026-09-18: .98 → .55、2026-11-03: → 0 (振りかぶる時のひじは elbowLift で上げる)

// prevSide: 前のコマでひじを張り出した向き (±1)。side.x が 0 の近くでは前の向きを保ち、ひじが反対側へ 1 コマで飛ばないようにする
// (2026-11-02: チンパンジーの腕では、この切りかえが 20〜35 cm の瞬間移動に見えた)
export const SIDE_HOLD = .35;
// elbowY: ひじの高さを決める基準の高さ (振り上げる前の打点の高さ)。無ければ先の高さ。先の高さで決めると、振り上げるたびにひじも
// 上下し、手首も先とほぼ同じだけ動いた (2026-11-03・ハイハットの手首の道のりが先の 0.94 倍)
// elbowLift: ひじを、決まった高さからさらに上げる量 (m)。振りかぶるときに使う (2026-11-03)。ひじはいちばん下にぶら下がった所で
// 止まっていることが多く、elbowY を上げるだけではひじが動かなかった (スネアを叩く間のひじの上下 0.8 cm)
// lo と hi の間に収める。端の w の幅は、なめらかに曲げて止める (速さが急に変わらない)
function softClamp(x, lo, hi, w) {
  const smax = (a, c) => (a + c + Math.sqrt((a - c) ** 2 + w * w)) / 2, smin = (a, c) => (a + c - Math.sqrt((a - c) ** 2 + w * w)) / 2;
  return THREE.MathUtils.clamp(smin(smax(x, lo), hi), lo, hi);
}
export function drumGripFrame(shoulder, tip, upper, fore, scale, stickLength, snap = 0, prevSide = 0, elbowY = tip.y, elbowLift = 0) {
  const wristToTip = STICK_GRIP.clone().multiplyScalar(scale).addScaledVector(STICK_AXIS, stickLength);
  // Small flexion on the stroke; local +Y is the actual dorsal surface.
  const foreLocal = V(Math.cos(snap), -Math.sin(snap), 0);
  const combined = wristToTip.clone().addScaledVector(foreLocal, fore);
  const length = combined.length(), delta = tip.clone().sub(shoulder), distance = delta.length();
  const direction = delta.normalize();
  const cosine = THREE.MathUtils.clamp((upper * upper + distance * distance - length * length) / (2 * upper * distance), -1, 1);
  const centre = shoulder.clone().addScaledVector(direction, upper * cosine);
  const radius = upper * Math.sqrt(1 - cosine * cosine);
  const up = V(0,1,0).addScaledVector(direction, -direction.y).normalize();
  const side = direction.clone().cross(up);
  let sideSign = side.x > 0 ? -1 : 1;
  if (prevSide && Math.abs(side.x) < SIDE_HOLD) sideSign = prevSide;
  if (sideSign < 0) side.negate();
  // Keep the grip above the struck surface. A hanging elbow alone can make
  // a straight wrist point the stick up into the underside of a cymbal.
  // The elbow never goes straight up (that reads as a bent-back joint on the crash,
  // where the target sits above the shoulder): cap the lift so it swings outward instead.
  // ひじは肩と先を結ぶ線のまわりの円の上。いちばん下 (-1) の近くでは、少し上げるだけで円の上を横へ大きく回る
  // (打った直後の 1 コマでひじが 11 cm 動いた。2026-11-03)。-0.85 より下には行かない
  // ELBOW_DROP は前の体の上腕 (0.329 m) での値。今の上腕の長さに比例させる (2026-11-03: 体を模型の大きさにしたら、短い腕でひじが 25 cm 下へ引かれ、肩よりうしろへ出た)
  // 上と下の止まりは、角をまるめて止める (2026-11-03: きっちり止めると、クラッシュとスネアを 8 分音符で行き来するとき、止まりに当たったコマで
  // ひじと手首の速さが急に変わり、1 コマで 5〜7 cm 余分に動いた)
  const base = softClamp((elbowY - ELBOW_DROP * upper / 0.329 - centre.y) / Math.max(.0001, radius * up.y), -.85, ELBOW_LIFT_MAX, .12);
  const height = THREE.MathUtils.clamp(base + elbowLift / Math.max(.0001, radius * up.y), -.85, .7);
  const elbow = centre.addScaledVector(up, radius * height)
    .addScaledVector(side, radius * Math.sqrt(1 - height * height));
  const localAxis = combined.normalize(), worldAxis = tip.clone().sub(elbow).normalize();
  const localDorsal = V(0, 1, 0).addScaledVector(localAxis, -localAxis.y).normalize();
  const worldDorsal = V(0, 1, 0).addScaledVector(worldAxis, -worldAxis.y).normalize();
  const localBasis = new THREE.Matrix4().makeBasis(localAxis, localDorsal, localAxis.clone().cross(localDorsal));
  const worldBasis = new THREE.Matrix4().makeBasis(worldAxis, worldDorsal, worldAxis.clone().cross(worldDorsal));
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(worldBasis.multiply(localBasis.invert()));
  const wrist = tip.clone().sub(wristToTip.applyQuaternion(quaternion));
  return {wrist, quaternion, side: sideSign, pole: elbow.sub(shoulder), reachError: Math.max(0, distance - upper - length, Math.abs(length - upper) - distance)};
}
