// 押した鍵の印: 鍵の上面の色はそのまま (黒鍵は黒・白鍵は象牙色)。手前の小口に細い明るい線を出す。
// 軽さ優先 (2026-09-11 さとるん「キラキラより安定」): 鍵ごとに部品 1 つ、影を落とさない、半透明を使わない、
// 押していないときは非表示 (描画されない)。明るさは線の高さ (押し込みの量) で表す。
import * as THREE from 'three';

const LIP_MAT = new THREE.MeshBasicMaterial({ color: 0xdde5e9, toneMapped: false });

export function addKeyIndicator(mesh) {
  mesh.material.emissive.setHex(0);
  mesh.material.emissiveIntensity = 0;
  mesh.geometry.computeBoundingBox();
  const b = mesh.geometry.boundingBox, width = (b.max.x - b.min.x) * .56;
  const depth = .0012, height = .0013;
  const light = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), LIP_MAT);
  light.name = 'key-press-indicator';
  light.position.set((b.min.x + b.max.x) / 2, b.max.y - height / 2 + .0002, b.max.z - depth / 2 + .0005);
  light.castShadow = false; light.receiveShadow = false; light.visible = false;
  mesh.add(light);
  return { group: light, light, width, height, depth };
}

export function updateKeyIndicator(key) {
  const light = key.indicator.light;
  const p = Math.min(1, Math.max(0, key.press));
  light.visible = p > .015;
  light.scale.y = .25 + .75 * p;
}
