// Solve the upper arm and a combined forearm + grip + stick link. Solving
// only shoulder -> stick direction folds the wrist back on the forearm.
import * as THREE from 'three';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const STICK_AXIS = V(.42, .12, .90).normalize();
export const STICK_GRIP = V(2, -.66, .30);

export function drumGripFrame(shoulder, tip, upper, fore, scale, stickLength, snap = 0) {
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
  const side = direction.clone().cross(up); if(side.x>0)side.negate();
  // Keep the grip above the struck surface. A hanging elbow alone can make
  // a straight wrist point the stick up into the underside of a cymbal.
  const height = THREE.MathUtils.clamp((tip.y + .105 - centre.y) / Math.max(.0001, radius * up.y), -.98, .98);
  const elbow = centre.addScaledVector(up, radius * height)
    .addScaledVector(side, radius * Math.sqrt(1 - height * height));
  const localAxis = combined.normalize(), worldAxis = tip.clone().sub(elbow).normalize();
  const localDorsal = V(0, 1, 0).addScaledVector(localAxis, -localAxis.y).normalize();
  const worldDorsal = V(0, 1, 0).addScaledVector(worldAxis, -worldAxis.y).normalize();
  const localBasis = new THREE.Matrix4().makeBasis(localAxis, localDorsal, localAxis.clone().cross(localDorsal));
  const worldBasis = new THREE.Matrix4().makeBasis(worldAxis, worldDorsal, worldAxis.clone().cross(worldDorsal));
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(worldBasis.multiply(localBasis.invert()));
  const wrist = tip.clone().sub(wristToTip.applyQuaternion(quaternion));
  return {wrist, quaternion, pole: elbow.sub(shoulder), reachError: Math.max(0, distance - upper - length, Math.abs(length - upper) - distance)};
}
