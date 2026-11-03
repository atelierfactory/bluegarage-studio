// ═══════════ チンパンジーの体を VESPER の骨に着せる ═══════════
// 演奏の動き (IK・指・スティック) はロボットの骨のまま。見た目だけ、チンパンジーの 1 枚の皮を同じ骨で動かす。
// chimp/chimp.bin: 位置・法線・UV・骨の番号 4 つ・重み 4 つ・面 (chimp/chimp.json の layout の順)。
// 皮の座標: 正面 +z・左 +x・上 +y (m)。ロボットの骨の静止姿勢 (回転なし) も同じ向きなので、
// 骨ごとに「チンパンジーの関節 → ロボットの関節」へ合わせる行列を boneInverses に入れる。
// 骨の向きには長さを合わせ (ロボットの骨の長さ / チンパンジーの骨の長さ)、太さは全体で同じ倍率 K。
import * as THREE from "three";

const BASE = new URL("./chimp/", import.meta.url);
const K = 1 / 0.061;   // 模型の 1 m = ロボットの骨の 1/0.061 単位 = 世界の 1 m (2026-11-03 模型の縮尺に。前は 21.8 で 1.33 倍だった)
// 手と指の太さの倍率。演奏の手を模型の大きさに縮めた (scene.js HAND_S) ので、模型のままの 1
// (前は長さだけ 1.4 倍に引きのばした指を、太さも 1.4 倍にしてごまかしていた)
const HAND_THIN = 1;

/** 静止姿勢のうちに、骨と指の位置を控える (ロボットの骨の単位・this.robot の中の座標) */
export function snapshotRest(bones, hands) {
  const nodes = {}, rest = {};
  for (const [name, b] of Object.entries(bones)) nodes[name] = b;
  for (const [side, h] of Object.entries(hands)) h.fingers.forEach((f, i) => {
    nodes[`${side}F${i}a`] = f.root; nodes[`${side}F${i}b`] = f.joint; nodes[`${side}F${i}t`] = f.tip;
  });
  const hips = bones.Hips;
  // 静止姿勢では骨は回っていないので、親へたどって位置を足す。手と足の骨は縮めてある (scene.js HAND_S・FOOT_S) ので、親の倍率を掛けてから足す
  for (const [name, o] of Object.entries(nodes)) {
    const p = o.position.clone(); let x = o.parent;
    while (x && x !== hips.parent) { p.multiply(x.scale).add(x.position); x = x.parent; }
    rest[name] = p;
  }
  return { nodes, rest };
}

const isHand = (name) => /Hand$|F\d[abc]$/.test(name);
const TORSO = new Set(["Hips", "LowerBack", "Spine", "Spine1", "Neck1"]);

function bindMatrix(name, meta, rest, Kx) {
  const tail = meta.tail[name];
  const J = new THREE.Vector3(...meta.joints[name]), Jt = new THREE.Vector3(...meta.joints[tail]);
  const R0 = rest[name], R1 = rest[tail];
  const ac = Jt.clone().sub(J), ar = R1.clone().sub(R0);
  const Lc = ac.length(), Lr = ar.length(); ac.normalize(); ar.normalize();
  // 2 つ目の向き: 手と指は「手の甲」(ロボットは上、チンパンジーは外側)、ほかは正面。骨が正面向きなら上
  const sgn = name.startsWith("Left") ? 1 : -1;
  let sc = isHand(name) ? new THREE.Vector3(sgn, 0, 0) : new THREE.Vector3(0, 0, 1);
  let sr = isHand(name) ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  if (!isHand(name) && (Math.abs(ac.z) > 0.8 || Math.abs(ar.z) > 0.8)) { sc = new THREE.Vector3(0, 1, 0); sr = new THREE.Vector3(0, 1, 0); }
  const frame = (a, s) => { const b = s.clone().sub(a.clone().multiplyScalar(s.dot(a))).normalize(); const c = new THREE.Vector3().crossVectors(a, b); return new THREE.Matrix4().makeBasis(a, b, c); };
  const Rc = frame(ac, sc), Rr = frame(ar, sr);
  const rot = Rr.clone().multiply(Rc.clone().transpose());   // チンパンジーの向き → ロボットの向き
  // 骨の向きには Lr/Lc、横には K。ただし胴 (腰〜首) の左右の幅は肩の骨と同じ倍率 Kx にする (2026-11-02):
  // 胴を K (肩の骨より 8% 大きい) で広げると、背中の上の皮が肩の関節より外へはみ出し、腕がその下から生えて見えた
  // 頭はロボットの頭の骨の長さに合わせると縦につぶれるので、全体と同じ倍率のまま
  // 手と指は太さを HAND_THIN 倍に (2026-11-03): チンパンジーの指 (直径約 2.7 cm) が白鍵の幅 (2.3 cm) より太く、どの鍵を弾いているか分からず、
  // つまみも手で覆われていた
  // 腕 (上腕・前腕) は、ロボットの腕の長さに合わせて伸ばした分の 0.75 乗だけ太くする (2026-11-03 さとるん「猿の手が伸びたように感じる」):
  // 長さだけ 1.2〜1.3 倍にして太さはそのままだったので、細長く引きのばされて見えた。チンパンジーの腕はもともと長いので、長くたくましい腕に見せる。
  // 腕を短くする形も試したが、鍵盤の奥のつまみに届かず、椅子を寄せるとひじが肩より後ろへ平均 12〜20 cm 出た
  const L = name === "Head" ? K : Lr / Lc;
  const arm = /^(Left|Right)(Arm|ForeArm)$/.test(name) ? K * Math.max(1, L / K) ** 0.75 : K;
  const ky = isHand(name) ? K * HAND_THIN : arm, bx = TORSO.has(name) ? Kx : ky;
  const along = bx * ar.x * ar.x + ky * (ar.y * ar.y + ar.z * ar.z), s = L - along;
  const S = new THREE.Matrix4().set(
    bx + s * ar.x * ar.x, s * ar.x * ar.y, s * ar.x * ar.z, 0,
    s * ar.y * ar.x, ky + s * ar.y * ar.y, s * ar.y * ar.z, 0,
    s * ar.z * ar.x, s * ar.z * ar.y, ky + s * ar.z * ar.z, 0,
    0, 0, 0, 1);
  return S.multiply(rot).multiply(new THREE.Matrix4().makeTranslation(-J.x, -J.y, -J.z));
}

// 骨を入れ直すページ (rig.html) で動かした、まだ保存していない関節 (皮の座標)。?draft=1 のときだけ演奏ページに使う
export const DRAFT_KEY = "vesperChimpJointsDraft";
function draftJoints() {
  if (!new URLSearchParams(globalThis.location?.search ?? "").has("draft")) return null;
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null"); } catch { return null; }
}

/** chimp.json と皮の形・材質を読む (演奏ページと rig.html で同じ物を使う) */
export async function readChimp({ reload = false } = {}) {
  const init = reload ? { cache: "reload" } : undefined;
  const [meta, buf] = await Promise.all([
    fetch(new URL("chimp.json", BASE), init).then((r) => r.json()),
    fetch(new URL("chimp.bin", BASE), init).then((r) => r.arrayBuffer()),
  ]);
  const n = meta.count; let o = 0;
  const take = (Type, len) => { const a = new Type(buf, o, len); o += len * Type.BYTES_PER_ELEMENT; return a; };
  const pos = take(Float32Array, n * 3), nrm = take(Float32Array, n * 3), uv = take(Float32Array, n * 2);
  const si = take(Uint8Array, n * 4); o = Math.ceil(o / 4) * 4;
  const sw = take(Float32Array, n * 4), idx = take(Uint32Array, meta.index);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("skinIndex", new THREE.BufferAttribute(new Uint16Array(si), 4));
  g.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const tl = new THREE.TextureLoader();
  const tex = (f, srgb) => { const t = tl.load(new URL(f, BASE).href); t.flipY = false; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  // Tripo のざらつきの絵 (rm.jpg) は毛にしてはつるつる (0.65) で、舞台の強いスポットで銀色に光るので使わない
  const mat = new THREE.MeshStandardMaterial({ map: tex("basecolor.jpg", true), normalMap: tex("normal.jpg", false), normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.92, metalness: 0 });
  return { meta, g, mat, pos, si, sw };
}

/** チンパンジーを読み込み、ロボットの骨に着せた SkinnedMesh を返す */
export async function loadChimp({ nodes, rest }, robotGroup) {
  const { meta, g, mat, pos, si, sw } = await readChimp();
  faceToHead(meta, g, pos, si);
  const draft = draftJoints(); if (draft) Object.assign(meta.joints, draft);
  const fingers = addFingerTips(meta, nodes, rest);
  const bones = meta.bones.map((name) => nodes[name]);
  // 肩幅の倍率: ロボットの肩の骨の長さ / チンパンジーの肩の骨の長さ (左右の平均)
  const seg = (a, b, P) => P(b).distanceTo(P(a)), J = (n) => new THREE.Vector3(...meta.joints[n]), Rr = (n) => rest[n];
  const Kx = ["Left", "Right"].reduce((acc, sd) => acc + seg(sd + "Shoulder", sd + "Arm", Rr) / seg(sd + "Shoulder", sd + "Arm", J), 0) / 2;
  const inverses = meta.bones.map((name) => bindMatrix(name, meta, rest, Kx));
  const skeleton = new THREE.Skeleton(bones, inverses);
  const mesh = new THREE.SkinnedMesh(g, mat);
  mesh.bindMode = THREE.DetachedBindMode;
  // 皮の座標 → ロボットの骨の単位 → 世界: 骨の matrixWorld にロボットの大きさと置き場所が入っているので、皮は単位行列で結ぶ
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = "chimp";
  addMouth(g, mesh, pos, meta, si, sw);
  if (FUR.layers) addFur(mesh, g, mat, skeleton, meta, pos, si, sw);
  mesh.userData.updateFingers = fingers;
  return mesh;
}

/* ── 指の先の近くの関節 (2026-11-02): チンパンジーの指は 3 本の骨 (付け根 a・真ん中 b・先の近く c)。演奏の計算 (ロボットの指) は
   2 本 (root → joint → tip) なので、ロボットの joint → tip の 1 本を、チンパンジーの b と c の 2 本に分ける。
   B: joint に付けた、b を動かす点。D: B の子で、b と c の長さの比 s の所 (= c の付け根)。
   先の近くの関節は、真ん中の関節の曲がりの 0.6 倍だけ同じ向きに曲げる (人やチンパンジーの指は、この 2 つが一緒に曲がる)。
   B を φ だけ戻して、b と c をつないだ先が、ロボットの指先 (joint → tip の向き) の上に来るようにする。鍵盤や太鼓に当たる所は変わらない ── */
const DIP_RATIO = 0.6;
function addFingerTips(meta, nodes, rest) {
  const list = [];
  for (const side of ["Left", "Right"]) for (let i = 0; i < 5; i++) {
    const nb = `${side}F${i}b`, nc = `${side}F${i}c`, nt = `${side}F${i}t`;
    if (!meta.bones.includes(nc) || !nodes[nb] || !nodes[nt]) continue;
    const joint = nodes[nb], tip = nodes[nt];
    const Jb = new THREE.Vector3(...meta.joints[nb]), Jc = new THREE.Vector3(...meta.joints[nc]), Jt = new THREE.Vector3(...meta.joints[nt]);
    const l1 = Jc.distanceTo(Jb), l2 = Jt.distanceTo(Jc), s = l1 / (l1 + l2);
    const B = new THREE.Object3D(), D = new THREE.Object3D(); B.name = nb + "_chimp"; D.name = nc + "_chimp";
    joint.add(B); B.add(D); D.position.copy(tip.position).multiplyScalar(s);
    nodes[nb] = B; nodes[nc] = D;
    rest[nc] = rest[nb].clone().lerp(rest[nt], s);
    list.push({ joint, B, D, s });
  }
  return () => {
    for (const { joint, B, D, s } of list) {
      const beta = THREE.MathUtils.clamp(DIP_RATIO * joint.rotation.z, -0.35, 1.3);
      const phi = Math.atan2((1 - s) * Math.sin(beta), s + (1 - s) * Math.cos(beta));
      B.rotation.z = -phi; D.rotation.z = beta;
    }
  };
}

/* ── 顔は頭の骨だけで動かす (2026-11-03): 皮の自動の重みでは、口のまわりが 頭 54%・首 26%・胸 12%・肩 8% についていて、
   口笛で頭を上げると唇が頭の半分ほどしかついてこず、頭に付けたマイクと口笛の穴が唇から 2〜3 cm ずれた。
   顔の前半分 (前 0.05 m より前) で、あごの下の端 (高さ 0.765〜0.79) より上を、頭の骨へなめらかに付け直す。
   ただし、もとから頭の骨に 25〜45% 以上ついていた点で、顔の幅 (左右 8.5〜10.5 cm) の内側だけ。
   (2026-11-03 さとるん「猿の肩に出るこの影は何」: 最初はこの 2 つの条件が無く、肩の上の皮 1,232 点 (もとの頭の重み 0.2 未満・
   肩と腕と胸の骨についていた) まで頭に付けてしまい、頭や右肩を動かすと肩の皮が板のように引き出されて黒く写った) ── */
function faceToHead(meta, g, pos, si8) {
  const H = meta.bones.indexOf("Head"), si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array;
  const step = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < meta.count; i++) {
    let hw = 0; for (let k = 0; k < 4; k++) if (si[i * 4 + k] === H) hw += sw[i * 4 + k];
    const b = step(0.765, 0.79, pos[i * 3 + 1]) * step(0.0, 0.05, pos[i * 3 + 2]) * step(0.25, 0.45, hw) * (1 - step(0.085, 0.105, Math.abs(pos[i * 3])));
    if (b <= 0) continue;
    const w = new Map();
    for (let k = 0; k < 4; k++) { const j = si[i * 4 + k], v = sw[i * 4 + k] * (1 - b); if (v > 0) w.set(j, (w.get(j) ?? 0) + v); }
    w.set(H, (w.get(H) ?? 0) + b);
    const top = [...w].sort((p, q) => q[1] - p[1]).slice(0, 4), sum = top.reduce((a, p) => a + p[1], 0);
    for (let k = 0; k < 4; k++) { const [j, v] = top[k] ?? [0, 0]; si[i * 4 + k] = j; si8[i * 4 + k] = j; sw[i * 4 + k] = v / sum; }
  }
}

/* ── 口笛の口 (2026-11-03 さとるん「口が動かないので口笛を吹いてるってわからない。もっと口笛っぽい形に変え、リズムに合わせて口の形が多少変わるように」)
   皮には口の中もあごの骨も無いので、唇のまわりの点を動かす形 (モーフ) を 2 つ足す。皮の座標 (m・正面 +z・左 +x) で、色の絵の暗い線から測った口:
   唇の合わせ目は顔のまん中で高さ 0.822・前 0.124、口の端は左右 4.5 cm で 1.3 cm 下がる (高さ 0.809・前 0.092)。
   合わせ目の上 (0.823〜0.85) の明るくふくらんだ所が上唇。前に 0.853 の くぼみを合わせ目とみなしたのはまちがいで、鼻の下だった
   0: すぼめ (口笛の形) = 口の端を内へ寄せて持ち上げ、唇を前へ 2.4 cm 出し、まん中を少し開く。1: 丸 = すぼめより少しゆるい O の形。
   唇は前へ突き出した筒の形 (まん中の幅 3 割は同じだけ前へ出し、外はなめらかに戻す。合わせ目のまわりの輪は さらに前へ巻く)。
   前はまん中ほど前へ出るドームの形で、黒い円盤を貼った丸い ふくらみに見えた (2026-11-03 さとるん「口がただの丸になっているのもっとリアルに」)。
   すぼめた唇は、合わせ目のまわりをチンパンジーの唇の暗いくすんだ色にする (lipMask・強さは scene.js が userData.lip に入れる)。
   つやは出さない (11-03 夕さとるん「口のすぼみのほくろみたいなのが目立ってしまう」: つやの白い光が上のふちに三日月の形に出て、明るいピンクの輪と赤黒い穴の丸と重なり、ほくろに見えた)。
   穴は皮の色だけでは出ないので、scene.js が唇の奥に、奥行きのある短い筒 (headset.hole) を置く ── */
export const MOUTH = new THREE.Vector3(0, 0.822, 0.124), PUCKER_Z = 0.024, ROUND_Z = 0.014;
const MOUTH_RX = 0.062, MOUTH_RY = 0.034;
const lipLine = (x) => MOUTH.y - 0.013 * Math.min(1, (x / 0.045) ** 2);   // 唇の合わせ目の高さ (口の端ほど下がる)
const smooth01 = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function addMouth(g, mesh, pos, meta, si, sw) {
  const n = meta.count, H = meta.bones.indexOf("Head"), pucker = new Float32Array(n * 3), round = new Float32Array(n * 3), lip = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let hw = 0; for (let k = 0; k < 4; k++) if (si[i * 4 + k] === H) hw += sw[i * 4 + k];
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], dy = y - MOUTH.y;
    const r2 = (x / MOUTH_RX) ** 2 + (dy / MOUTH_RY) ** 2;
    // 口の端を寄せる量 gw は広く効かせる (w のままでは口の端 4.5 cm で 0.5 cm しか寄らず、すぼめても横に広い口だった)。
    // どちらも、前 0.06〜0.10 m でなめらかに 0 へ落とす (きっちり切ると、動かす点と動かさない点の境で皮が裂けたように見えた)
    const g2 = (x / 0.075) ** 2 + (dy / MOUTH_RY) ** 2;
    if (hw < 0.3 || z < 0.06 || (r2 >= 1 && g2 >= 1)) continue;
    const fz = Math.min(1, (z - 0.06) / 0.04), front = fz * fz * (3 - 2 * fz);
    const w = Math.max(0, 1 - r2) ** 2 * front, gw = Math.max(0, 1 - g2) ** 1.2 * front, line = lipLine(x), toLine = y - line, lift = MOUTH.y - line;
    // まん中の穴: 合わせ目のすぐ上の唇は上へ、すぐ下は下へ開き、合わせ目は奥へ引く (奥に置いた筒が見える すき間になる)
    const hole = Math.exp(-((x / 0.010) ** 2) - (toLine / 0.006) ** 2), side = Math.sign(toLine);
    // 前へ出す量: 筒 (tube) + 唇のふちの輪 (rim)。どちらも front で後ろへ行くほど 0
    const rho = Math.sqrt(r2), tube = rho < 1 ? 1 - smooth01(0.3, 1, rho) : 0, rim = Math.exp(-(((rho - 0.2) / 0.09) ** 2));
    // 唇の色の印: 合わせ目のまわりの輪は 0.7 まで、引っこめたまん中 (穴の奥に見える皮) は 1 (シェーダーで暗い口の中の色に)
    lip[i] = front * Math.max(0.85 * (1 - smooth01(0.2, 1, Math.hypot(x / 0.04, toLine / 0.02))), hole);
    pucker[i * 3] = -x * 0.55 * gw;
    // 寄せた口の端は、まん中の高さまで持ち上げる (寄せる量と同じ gw で。w で持ち上げると V の字の口になった)
    pucker[i * 3 + 1] = -toLine * 0.35 * w + lift * 0.9 * gw + side * 0.0035 * hole;
    pucker[i * 3 + 2] = PUCKER_Z * (0.8 * tube + 0.3 * rim) * front - 0.008 * hole;
    round[i * 3] = -x * 0.3 * gw;
    round[i * 3 + 1] = -toLine * 0.12 * w + lift * 0.6 * gw + side * 0.006 * hole;
    round[i * 3 + 2] = ROUND_Z * (0.8 * tube + 0.3 * rim) * front - 0.009 * hole;
  }
  g.morphAttributes.position = [new THREE.BufferAttribute(pucker, 3), new THREE.BufferAttribute(round, 3)];
  g.morphTargetsRelative = true;
  mesh.updateMorphTargets();
  // 唇の色: lipMask × すぼめの強さ で、暗く赤みのある色へ (合わせ目のまわりほど暗い)。つやも少し
  g.setAttribute("lipMask", new THREE.BufferAttribute(lip, 1));
  const lipU = { value: 0 }; mesh.userData.lip = lipU;
  mesh.material.onBeforeCompile = (sh) => {
    sh.uniforms.lipPucker = lipU;
    sh.vertexShader = "attribute float lipMask;\nvarying float vLip;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vLip = lipMask;");
    sh.fragmentShader = "uniform float lipPucker;\nvarying float vLip;\n" + sh.fragmentShader
      .replace("#include <map_fragment>", "#include <map_fragment>\n  { float m = vLip * lipPucker; diffuseColor.rgb *= mix(vec3(1.0), vec3(0.065, 0.05, 0.046), smoothstep(0.0, 0.45, m)) * mix(1.0, 0.4, smoothstep(0.75, 1.0, vLip) * smoothstep(0.1, 0.5, lipPucker)); }");
  };
  mesh.material.customProgramCacheKey = () => "chimp-lip";
}

/* ── 毛 (2026-11-02): 焼き込んだ毛の絵だけだと硬く見えるので、毛の生えた所に薄い層 (シェル) を重ねて、外の層ほど毛の本数を減らす。
   層は骨で動いたあとの面を、その面の向きへ押し出す (世界の m)。毛の場所は体の決まった位置 (皮の座標) で決まるので、動いてもちらつかない。
   顔・耳・手・足には生やさない。?fur=0 で層なし、?fur=N で層の数 ── */
const FUR = (() => { const q = new URLSearchParams(globalThis.location?.search ?? ""); const touch = globalThis.matchMedia?.("(pointer: coarse)").matches;
  const n = q.has("fur") ? Math.max(0, Math.min(24, +q.get("fur") || 0)) : touch ? 4 : 6; return { layers: n, length: 0.010, density: 900 }; })();
function addFur(mesh, g, baseMat, skeleton, meta, pos, si, sw) {
  const n = meta.count, len = new Float32Array(n);
  const bare = new Set(meta.bones.map((b, i) => (/Hand$|F\d[abc]$|Foot$|ToeBase$/.test(b) ? i : -1)).filter((i) => i >= 0));
  for (let i = 0; i < n; i++) {
    let w = 0; for (let k = 0; k < 4; k++) if (bare.has(si[i * 4 + k])) w += sw[i * 4 + k];
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const face = y > 0.76 && y < 0.93 && z > 0.02 ? Math.min(1, (z - 0.02) / 0.03) : 0;   // 顔 (前に出た所)
    const ear = y > 0.80 && y < 0.92 && Math.abs(x) > 0.085 ? 1 : 0;
    len[i] = Math.max(0, 1 - w * 1.6) * (1 - face) * (1 - ear);
  }
  g.setAttribute("furLen", new THREE.BufferAttribute(len, 1));
  // 層は毛の生えた三角形だけで作る (顔・手・足を描かない分だけ軽い)。1 層およそ 0.9 ミリ秒 (1600×900・2 画面)
  const src = g.index.array, keep = [];
  for (let t = 0; t < src.length; t += 3) if (len[src[t]] > 0.05 || len[src[t + 1]] > 0.05 || len[src[t + 2]] > 0.05) keep.push(src[t], src[t + 1], src[t + 2]);
  const gf = new THREE.BufferGeometry(); for (const [k, v] of Object.entries(g.attributes)) gf.setAttribute(k, v);   // 点は同じものを使う
  gf.setIndex(new THREE.BufferAttribute(new Uint32Array(keep), 1));
  for (let L = 1; L <= FUR.layers; L++) {
    const h = L / FUR.layers;
    const m = baseMat.clone();
    m.onBeforeCompile = (sh) => {
      sh.uniforms.furH = { value: h }; sh.uniforms.furLenM = { value: FUR.length }; sh.uniforms.furD = { value: FUR.density };
      sh.vertexShader = "attribute float furLen;\nuniform float furH;\nuniform float furLenM;\nvarying vec3 vRest;\nvarying float vFur;\n" + sh.vertexShader
        .replace("#include <skinning_vertex>", "#include <skinning_vertex>\n  vRest = position; vFur = furLen;\n  transformed += normalize(objectNormal) * furLen * furLenM * furH;");
      sh.fragmentShader = "uniform float furH;\nuniform float furD;\nvarying vec3 vRest;\nvarying float vFur;\nfloat furHash(vec3 p){p=fract(p*0.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}\n" + sh.fragmentShader
        .replace("#include <map_fragment>", `#include <map_fragment>
  {
    if (vFur < 0.05) discard;
    vec3 c = vRest * furD; vec3 cell = floor(c);
    float r = furHash(cell);
    vec3 f = fract(c) - 0.5 - (vec3(furHash(cell + 7.1), furHash(cell + 3.7), furHash(cell + 1.3)) - 0.5) * 0.5;
    // 耳・手のひらなどのピンクの肌には生やさない (毛の色は赤と青がほぼ同じ)
    float pink = smoothstep(0.035, 0.09, diffuseColor.r - diffuseColor.b);
    // 毛 1 本 = 升目の中の細い丸。外の層ほど細く、短い毛 (r が小さい) から先に消える
    float reach = r * vFur * (1.0 - pink); if (reach < furH) discard;
    float rad = 0.42 * (1.0 - furH / max(reach, 1e-3)) + 0.08; if (dot(f, f) > rad * rad) discard;
    diffuseColor.rgb *= mix(0.72, 1.02, furH);   // 根元は影で暗く、先は明るく
  }`);
    };
    m.customProgramCacheKey = () => "fur" + L;
    const shell = new THREE.SkinnedMesh(gf, m);
    shell.bindMode = THREE.DetachedBindMode; shell.bind(skeleton, new THREE.Matrix4());
    shell.frustumCulled = false; shell.castShadow = false; shell.receiveShadow = true; shell.name = "chimp-fur";
    mesh.add(shell);
  }
}

/** ロボットの部品を隠す (スティックは残す) */
export function hideRobot(robotGroup, keep) {
  const kept = new Set(); keep?.traverse((x) => kept.add(x));
  robotGroup.traverse((x) => { if (x.isMesh && !kept.has(x)) x.visible = false; });
}
