// ═══════════ オーケストラの楽器と家具 (本物の寸法・m) ═══════════
// 楽器は種類 × 材質ごとに 1 つの InstancedMesh。1 台ずつの「持ち手」(handle.root = Object3D、world・m・描かない) を
// 演奏の担当 (players/*.js) が毎コマ動かし、InstrumentSet.update() がその行列で全部の台を描き直す。
// 椅子・譜面台・ひな壇・ティンパニのように動かない物は、stage.js が 1 つの形にまとめて置く (staticPieces)。
//
// 楽器の中の向き (spec に点の位置がある。どれも楽器の中の m):
//   弦楽器 (violin / viola / cello / bass): 原点 = 胴の下の端 (エンドピン・テールの側) の、表板と裏板の真ん中。
//     +y = ネックの方 (渦巻きへ)、+z = 表板の外 (弦の側)、+x = 高い弦の側 (E / A / G)。弦は -x から +x へ低い順。
//   弓 (bow): 原点 = 毛の元 (毛箱の所、u = 0)、+y = 毛に沿って先へ (u = 1 で hairLen)、+z = 竿の側 (毛の面の外)。
//   管楽器: 原点 = 口に当てる点 (フルートは歌口、オーボエ・クラリネット・ファゴットはリードの先、ホルン・トランペットはマウスピースの縁)。
//     フルート: +y = 足部管の方 (右へ)、+z = 歌口の向き / キーの側。オーボエ・クラリネット: +y = ベルの方、+z = キーの側 (前)、リードは -z。
//     ファゴット: 原点はリードの先、楽器の向きは spec.axis (下の端から上の端へ) と spec.front。トランペット: +y = ベルの方、+z = ピストンのボタンの側 (上)。
//     ホルン: 巻き管は x-y 面 (軸 = z)。+y の逆 (-y) へマウスピースから管が入る。spec.bellAxis がベルの開く向き。
//   マレット: 原点 = 頭 (フェルトの玉) の中心、+y = 柄の方。指揮棒: 原点 = 握りの端、+y = 先へ。
import * as THREE from "three";
import { place, merge, rod, ball, block, ring, setColor, triangles } from "./robot-lite.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ─────────── 材質 ─────────── */
export const IM = {
  // ニスを塗った木 (胴・ネック・駒) と黒檀 (指板・テールピース・あご当て)・弦 (細い灰色)。頂点の色で塗り分ける
  wood: new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.34, metalness: 0.0, clearcoat: 0.85, clearcoatRoughness: 0.16 }),
  // 銀・真鍮・銅・クロム (頂点の色)
  metal: new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.2, metalness: 1.0 }),
  // 黒い木管 (グラナディラ) とリード・コルク (頂点の色)
  wind: new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.3, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  // 弓の竿と毛・マレット・指揮棒 (つやの少ない物)
  matte: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.05 }),
  // 家具 (椅子・譜面台・ひな壇・指揮台)
  furniture: new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.25, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
  drumHead: new THREE.MeshStandardMaterial({ color: 0x7c746a, roughness: 0.78, metalness: 0 }),   // 仔牛の皮。真上のスポットで明るさが上限を超えて白い円になるので、絵 (stage.js の drumHeadTexture) を掛けて反射を下げる
  // 譜面 (紙)。譜面台の小さな灯りに照らされたように、少しだけ自分で光る
  sheet: new THREE.MeshStandardMaterial({ color: 0xf1e7cf, roughness: 0.92, metalness: 0, emissive: 0xffd9a0, emissiveIntensity: 0.22 }),
};
const C = {
  ebony: 0x121010, string: 0xbfc0c2, maple: 0xd8b98a, fhole: 0x070605,
  silver: 0xd6d9dd, brass: 0xd8a84a, copper: 0xb5703c, chrome: 0xe6e8ea, dark: 0x0a0a0b, reed: 0xc9a465, cork: 0xa77d55,
};

/* ─────────── 形の道具 ─────────── */
// 断面の輪郭 [[y の割合, 半幅の割合 (L に対して)]] の間を滑らかにつなぐ
function interp(pts, f) {
  if (f <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [y0, w0] = pts[i], [y1, w1] = pts[i + 1];
    if (f <= y1) {
      const t = (f - y0) / (y1 - y0), wm = (pts[i - 1] ?? pts[i])[1], wp = (pts[i + 2] ?? pts[i + 1])[1];
      const t2 = t * t, t3 = t2 * t;   // Catmull-Rom
      return 0.5 * (2 * w0 + (-wm + w1) * t + (2 * wm - 5 * w0 + 4 * w1 - wp) * t2 + (-wm + 3 * w0 - 3 * w1 + wp) * t3);
    }
  }
  return pts[pts.length - 1][1];
}
// y 軸に沿った回転体 (prof = [[r, y], ...])。center = 軸の位置
function lathe(prof, seg = 12, color = null, { center = null, quat = null } = {}) {
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-5), y)), seg);
  return place(g, { pos: center, quat, color });
}
function tube(points, r, color = null, seg = 24, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : V(...p))));
  return place(new THREE.TubeGeometry(curve, seg, r, radial, false), { color });
}
// y0..y1 で幅と高さが変わる箱 (上面の高さ zTop、厚さ th)
function taperBox(y0, y1, w0, w1, zTop0, zTop1, th0, th1 = th0, color = null) {
  const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) + 0.5, side = p.getZ(i) + 0.5;
    p.setXYZ(i, p.getX(i) * lerp(w0, w1, t), lerp(y0, y1, t), lerp(zTop0, zTop1, t) - (1 - side) * lerp(th0, th1, t));
  }
  g.computeVertexNormals();
  return place(g, { color });
}

/* ─────────── 弦楽器の寸法 ─────────── */
// バイオリンの輪郭 (胴長 356 mm の実測に近い値) を割合にしたもの。チェロも同じ割合 (下の膨らみ 0.58・くびれ 0.31・上の膨らみ 0.46)
const VIOLIN_OUTLINE = [[0, 0], [0.004, 0.032], [0.015, 0.068], [0.04, 0.092], [0.085, 0.1025], [0.125, 0.097], [0.15, 0.084], [0.166, 0.064],
  [0.185, 0.0555], [0.204, 0.06], [0.22, 0.072], [0.245, 0.08], [0.285, 0.0825], [0.32, 0.075], [0.342, 0.053], [0.352, 0.03], [0.356, 0]].map(([y, w]) => [y / 0.356, w / 0.356]);
// コントラバス: なで肩 (上の膨らみの上がネックへ斜めに落ちる)
const BASS_OUTLINE = [[0, 0], [0.008, 0.11], [0.04, 0.215], [0.12, 0.285], [0.24, 0.305], [0.35, 0.282], [0.43, 0.236], [0.5, 0.2], [0.57, 0.205],
  [0.64, 0.226], [0.72, 0.236], [0.79, 0.222], [0.86, 0.178], [0.93, 0.125], [0.975, 0.085], [0.993, 0.05], [1.0, 0]];
export const STRING_DIMS = {
  violin: { L: 0.356, outline: VIOLIN_OUTLINE, rib: 0.031, arch: 0.0155, backArch: 0.0145, neck: 0.130, total: 0.59, nutW: 0.024, fbEndW: 0.042, fbLen: 0.270,
    bridgeY: 0.161, bridgeH: 0.033, nutZ: 0.016, spB: 0.0113, spN: 0.0055, fbTh: 0.006, strR: [0.00042, 0.00055], open: [55, 62, 69, 76], names: ["G", "D", "A", "E"],
    top: 0x9a5622, body: 0x7a3a15, tail: 0.11, chin: true, endpin: false, pegbox: 0.07 },
  cello: { L: 0.75, outline: VIOLIN_OUTLINE, rib: 0.12, arch: 0.026, backArch: 0.024, neck: 0.29, total: 1.21, nutW: 0.031, fbEndW: 0.068, fbLen: 0.58,
    bridgeY: 0.35, bridgeH: 0.088, nutZ: 0.046, spB: 0.0165, spN: 0.0078, fbTh: 0.011, strR: [0.0007, 0.00105], open: [36, 43, 50, 57], names: ["C", "G", "D", "A"],
    top: 0x8a4519, body: 0x632a10, tail: 0.23, chin: false, endpin: true, pegbox: 0.12 },
  bass: { L: 1.11, outline: BASS_OUTLINE, rib: 0.19, arch: 0.028, backArch: 0.0, neck: 0.43, total: 1.80, nutW: 0.040, fbEndW: 0.112, fbLen: 0.86,
    bridgeY: 0.48, bridgeH: 0.15, nutZ: 0.07, spB: 0.028, spN: 0.0105, fbTh: 0.015, strR: [0.0011, 0.0019], open: [28, 33, 38, 43], names: ["E", "A", "D", "G"],
    top: 0x6a3417, body: 0x4b230e, tail: 0.36, chin: false, endpin: true, pegbox: 0.2 },
};
export const VIOLA_SCALE = 0.40 / 0.356;         // ビオラ = バイオリンの形を 1.124 倍 (胴長 40 cm、弦長 37 cm)

// 表板の高さ (胴の中の z): 縁は rib/2、真ん中ほど高い
function topZ(d, f, t) { const along = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(f, 0, 1))), 0.45); return d.rib / 2 + d.arch * along * Math.pow(1 - t * t, 0.8); }
function stringSpec(d, k = 1) {
  const h = d.rib / 2, zB = (h + d.arch + d.bridgeH) * k, nutY = (d.L + d.neck) * k, zN = (h + d.nutZ) * k;
  const arc = (x, R) => R - Math.sqrt(Math.max(0, R * R - x * x));
  return d.open.map((open, i) => {
    const xB = (i - 1.5) * d.spB * k, xN = (i - 1.5) * d.spN * k;
    return { name: d.names[i], open, bridge: V(xB, d.bridgeY * k, zB - arc(xB, d.spB * k * 3.6)), nut: V(xN, nutY, zN - arc(xN, d.spN * k * 3.6)), radius: lerp(d.strR[1], d.strR[0], i / 3) * k };
  });
}
function stringZ(spec, y) { const s = spec[1], t = (y - s.bridge.y) / (s.nut.y - s.bridge.y); return lerp(s.bridge.z, s.nut.z, t); }

function buildStringInstrument(kind) {
  const d = STRING_DIMS[kind], h = d.rib / 2, L = d.L;
  const strings = stringSpec(d);
  const nutY = L + d.neck, fbEndY = nutY - d.fbLen;
  const parts = [];
  // ── 胴 (断面を 34 枚つないだ筒。表板は縁から真ん中へ明るいニス、横板と裏板は濃い色)
  const N = 24, K = 6, P = 2 * K + 2;
  const pos = [], col = [], idx = [];
  const cTop = new THREE.Color(d.top), cEdge = new THREE.Color(d.body).lerp(new THREE.Color(d.top), 0.35), cBody = new THREE.Color(d.body), cBack = new THREE.Color(d.body).lerp(new THREE.Color(d.top), 0.25);
  for (let i = 0; i <= N; i++) {
    const f = 0.5 - 0.5 * Math.cos(Math.PI * i / N), y = f * L, w = Math.max(0.0004, interp(d.outline, f) * L);
    const along = Math.pow(Math.max(0, Math.sin(Math.PI * f)), 0.45);
    const loop = [[w, -h, cBody], [w, h, cEdge]];
    for (let k = 1; k < K; k++) { const t = 1 - 2 * k / K; loop.push([w * t, topZ(d, f, t), cEdge.clone().lerp(cTop, Math.pow(1 - Math.abs(t), 0.6) * along)]); }
    loop.push([-w, h, cEdge], [-w, -h, cBody]);
    for (let k = 1; k < K; k++) { const t = -1 + 2 * k / K; loop.push([w * t, -h - d.backArch * along * Math.pow(1 - t * t, 0.8), cBack]); }
    for (const [x, z, c] of loop) { pos.push(x, y, z); col.push(c.r, c.g, c.b); }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < P; j++) {
    const a = i * P + j, b = (i + 1) * P + j, c = (i + 1) * P + (j + 1) % P, e = i * P + (j + 1) % P;
    idx.push(a, b, c, a, c, e);
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); body.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  body.setIndex(idx); body.computeVertexNormals();
  const wood = [body];
  // f 字孔 (表板の上の黒い細い溝。少し斜め)
  const fy = d.bridgeY, fLen = L * 0.2, fx = interp(d.outline, fy / L) * L * 0.62;
  for (const s of [-1, 1]) {
    const z = topZ(d, fy / L, s * 0.62) + 0.0006 * (L / 0.356);
    wood.push(place(new THREE.BoxGeometry(L * 0.016, fLen, 0.0012 * (L / 0.356)), { pos: [s * fx, fy, z], rot: [0, 0, s * 0.14], color: C.fhole }));
  }
  // ── ネック (指板の下) ・糸巻き箱・渦巻き
  const zFbTop = (y) => stringZ(strings, y) - lerp(0.0006, 0.0045, (nutY - y) / d.fbLen) * (L / 0.356);
  const neckTop0 = zFbTop(L - 0.01) - d.fbTh, neckTop1 = zFbTop(nutY) - d.fbTh;
  wood.push(taperBox(L - 0.02, nutY + 0.004, d.fbEndW * 0.62, d.nutW * 0.92, neckTop0, neckTop1, neckTop0 - h * 0.6, d.fbTh * 2.6, d.top));
  // ネックの根元 (ヒール)。玉の上 (中心 + 1.25 r) は指板の下に収める (バイオリン・ビオラで、指板と弦の上へ橙の玉が出ていた)
  const heelR = d.nutW * 0.75, heelZ = Math.min((neckTop0 + h) * 0.5, zFbTop(L - 0.004) - d.fbTh - heelR * 1.25 - 0.001);
  wood.push(ball([0, L - 0.004, heelZ], heelR, 10, 6, d.body, [1, 0.9, 1.25]));
  const pb = d.pegbox, pbW = d.nutW * 0.95, pbH = d.nutW * 0.95, zPb = neckTop1 - pbH * 0.25;
  wood.push(place(new THREE.BoxGeometry(pbW, pb, pbH), { pos: [0, nutY + pb / 2, zPb - pbH / 2 + 0.003], rot: [-0.12, 0, 0], color: d.top }));
  const scrollR = d.nutW * 0.78, scrollY = nutY + pb + scrollR * 0.55, scrollZ = zPb - pbH * 0.65;
  wood.push(place(new THREE.CylinderGeometry(scrollR, scrollR, pbW * 1.15, 14), { pos: [0, scrollY, scrollZ], rot: [0, 0, Math.PI / 2], color: d.top }));
  wood.push(place(new THREE.TorusGeometry(scrollR * 0.55, scrollR * 0.2, 4, 10), { pos: [pbW * 0.6, scrollY, scrollZ], rot: [0, Math.PI / 2, 0], color: d.body }));
  wood.push(place(new THREE.TorusGeometry(scrollR * 0.55, scrollR * 0.2, 4, 10), { pos: [-pbW * 0.6, scrollY, scrollZ], rot: [0, Math.PI / 2, 0], color: d.body }));
  // ── 駒 (楓の色)
  const zTopB = topZ(d, d.bridgeY / L, 0), bW = d.spB * 3 + d.spB * 1.1, bTh = 0.0045 * (L / 0.356);
  wood.push(block([0, d.bridgeY, (zTopB + strings[1].bridge.z) / 2 - 0.0008], [bW, bTh, strings[1].bridge.z - zTopB - 0.0016], null, C.maple));
  // ── 黒檀の部品: 指板・テールピース・あご当て・糸巻き・上駒
  const ebony = [];
  ebony.push(taperBox(fbEndY, nutY, d.fbEndW, d.nutW, zFbTop(fbEndY), zFbTop(nutY), d.fbTh, d.fbTh * 0.8, C.ebony));
  ebony.push(block([0, nutY + 0.002, zFbTop(nutY) + 0.0005], [d.nutW, 0.004 * (L / 0.356), 0.003 * (L / 0.356)], null, C.ebony));
  const tailEnd = d.tail, tz0 = topZ(d, 0.02, 0) + 0.006 * (L / 0.356), tz1 = topZ(d, tailEnd / L, 0) + 0.011 * (L / 0.356);
  ebony.push(taperBox(0.012 * (L / 0.356), tailEnd, d.spB * 1.6, d.spB * 3.9, tz0, tz1, 0.006 * (L / 0.356), 0.006 * (L / 0.356), C.ebony));
  if (d.chin) {
    const cz = topZ(d, 0.09, -0.4) + 0.016;
    ebony.push(place(new THREE.CylinderGeometry(0.034, 0.03, 0.011, 14), { pos: [-0.032, 0.035, cz], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.7], color: C.ebony }));
    ebony.push(block([-0.03, 0.012, (cz + h) / 2], [0.03, 0.012, cz - h], null, C.ebony));
  }
  for (let i = 0; i < 4; i++) {   // 糸巻き: 低い 2 本は -x、高い 2 本は +x へ
    const y = nutY + pb * (0.22 + 0.2 * i), sx = i < 2 ? -1 : 1, len = pbW * 1.4;
    ebony.push(place(new THREE.CylinderGeometry(d.nutW * 0.14, d.nutW * 0.1, len, 8), { pos: [sx * len * 0.5, y, zPb - pbH * 0.45], rot: [0, 0, Math.PI / 2], color: C.ebony }));
    ebony.push(place(new THREE.BoxGeometry(d.nutW * 0.12, d.nutW * 0.65, d.nutW * 0.5), { pos: [sx * len * 1.0, y, zPb - pbH * 0.45], color: C.ebony }));
  }
  if (d.endpin) ebony.push(place(new THREE.CylinderGeometry(d.rib * 0.12, d.rib * 0.14, 0.02, 10), { pos: [0, -0.006, 0], color: C.ebony }));
  // ── 弦 (テールピース → 駒 → 上駒 → 糸巻き箱)
  const str = [];
  strings.forEach((s, i) => {
    const t0 = V(lerp(-1, 1, i / 3) * d.spB * 1.2, tailEnd, tz1 + 0.001);
    str.push(rod(t0, s.bridge, s.radius, s.radius, 3, { color: C.string }));
    str.push(rod(s.bridge, s.nut, s.radius, s.radius, 3, { color: C.string }));
    str.push(rod(s.nut, V(s.nut.x * 0.6, nutY + pb * (0.22 + 0.2 * i), zPb - pbH * 0.3), s.radius, s.radius, 3, { color: C.string }));
  });
  parts.push({ name: "wood", mat: "wood", geo: merge([...wood, ...ebony, ...str]), cast: true });
  const spec = {
    kind, L, total: d.total, rib: d.rib, nutY, fbEndY, bridgeY: d.bridgeY, strings,
    stringLength: strings[0].nut.y - strings[0].bridge.y,
    bowY: d.bridgeY + (fbEndY - d.bridgeY) * 0.32,          // ふつうに弓を当てる所 (駒と指板の端の間、駒寄り)
    points: {
      chin: V(-0.032, 0.035, (d.chin ? topZ(d, 0.09, -0.4) + 0.016 + 0.0055 : 0)),   // あご当ての上面
      tail: V(0, 0, 0), endpin: V(0, 0, 0),
      neck: V(0, nutY - d.fbLen * 0.08, neckTop1 - d.nutW * 0.35),                     // 1 のポジションで左手が包むネックの真ん中
      scroll: V(0, scrollY, scrollZ), bridge: V(0, d.bridgeY, strings[1].bridge.z), bodyCentre: V(0, L * 0.45, 0),
      backCentre: V(0, L * 0.62, -h - d.backArch * 0.9),                               // 裏板の上の方 (チェロ・コントラバスが体に当たる所)
    },
  };
  return { parts, spec, dims: d };
}

// world の点が弦楽器の胴 (表板・横板・裏板の中) にどれだけ深く入っているか (m)。確かめ用 (めり込みの検査)
// + = 中 (いちばん近い面までの長さ)、− = 外 (横・前後・縦のはみ出しを合わせた長さ。players/strings.js の bodySD と同じ測り方)。
// 前は胴の縦の範囲より上か下の点で縦のはみ出しだけを返していたので、遠い点でも 0 に近く、腕の太さを足すと重なって見えた
const _inv = new THREE.Matrix4(), _lp = new THREE.Vector3();
export function bodyDepth(h, p) {
  const d = STRING_DIMS[h.geoName]; if (!d) return -1;
  h.root.updateWorldMatrix(true, false);
  _lp.copy(p).applyMatrix4(_inv.copy(h.root.matrixWorld).invert()).divide(h.scale);
  const f = clamp(_lp.y / d.L, 0, 1), hw = interp(d.outline, f) * d.L, t = clamp(_lp.x / Math.max(1e-6, hw), -1, 1);
  const top = topZ(d, f, t), back = -d.rib / 2 - d.backArch * Math.pow(Math.max(0, Math.sin(Math.PI * f)), 0.45) * Math.pow(1 - t * t, 0.8);
  const ex = Math.abs(_lp.x) - hw, ez = Math.max(_lp.z - top, back - _lp.z), ey = Math.max(-_lp.y, _lp.y - d.L);
  if (ex <= 0 && ez <= 0 && ey <= 0) return -Math.max(ex, ez, ey) * h.scale.x;
  return -Math.hypot(Math.max(0, ex), Math.max(0, ez), Math.max(0, ey)) * h.scale.x;
}

/* ─────────── 弓 ─────────── */
// バイオリンの弓 (全長 0.75 m、毛 0.655 m) を作り、ビオラ・チェロ・コントラバスは長さと太さを変えて使う
export const BOW_DIMS = { violin: { total: 0.75, k: [1, 1, 1] }, viola: { total: 0.74, k: [1.07, 0.987, 1.07] }, cello: { total: 0.72, k: [1.16, 0.96, 1.16] }, bass: { total: 0.66, k: [1.3, 0.88, 1.3] } };
const BOW_HAIR = 0.655;
function buildBow() {
  const g = [];
  // 竿 (ペルナンブコの赤茶): 毛箱の上 (z 0.019) から真ん中で毛に近づき (0.009)、先で頭へ
  const stick = [[0, -0.065, 0.018], [0, -0.02, 0.019], [0, 0.08, 0.0165], [0, 0.25, 0.0118], [0, 0.42, 0.0098], [0, 0.56, 0.0108], [0, 0.635, 0.0128], [0, 0.66, 0.0145]];
  g.push(tube(stick, 0.0041, 0x5c2a14, 18, 5));
  g.push(lathe([[0, 0], [0.0045, 0.002], [0.0045, 0.012], [0.003, 0.014], [0, 0.015]], 8, 0x2a1c14, { center: V(0, -0.078, 0.018) }));   // ねじ
  g.push(block([0, 0.668, 0.0075], [0.0062, 0.016, 0.0155], [0.25, 0, 0], 0xe9e2d2));   // 頭 (象牙色の板)
  g.push(block([0, -0.017, 0.0105], [0.0105, 0.038, 0.017], null, 0x0d0b0a));         // 毛箱 (黒檀)
  g.push(block([0, 0.002, 0.004], [0.0112, 0.005, 0.007], null, 0xc8ccd0));           // 金具 (銀)
  g.push(ball([0.0054, -0.018, 0.012], 0.0026, 8, 6, 0xeef0ff));                      // 目玉 (白蝶貝)
  // 毛 (白い平たい帯)
  g.push(block([0, BOW_HAIR / 2, 0.0004], [0.0095, BOW_HAIR, 0.0008], null, 0xece6d4));
  return { parts: [{ name: "bow", mat: "matte", geo: merge(g) }], spec: { hairLen: BOW_HAIR, hairWidth: 0.0095, grip: V(0, 0.012, 0.02) } };
}

/* ─────────── 木管 ─────────── */
function buildFlute() {
  const m = [], ax = -0.0112, R = 0.0095;
  m.push(lathe([[0, -0.066], [R * 0.9, -0.066], [R * 1.05, -0.06], [R, -0.055], [R, 0.6], [R * 1.02, 0.605], [0, 0.605]], 14, C.silver, { center: V(0, 0, ax) }));
  for (const y of [0.145, 0.52]) m.push(lathe([[R * 1.12, y - 0.006], [R * 1.12, y + 0.006]], 14, C.silver, { center: V(0, 0, ax) }));
  m.push(place(new THREE.CylinderGeometry(0.0135, 0.0135, 0.0018, 16), { pos: [0, 0, -0.0012], rot: [Math.PI / 2, 0, 0], scale: [1.1, 1, 0.9], color: C.silver }));   // 唇当て
  m.push(place(new THREE.CylinderGeometry(0.0045, 0.0045, 0.0006, 12), { pos: [0, 0, -0.0002], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 1.25], color: 0x050505 }));   // 歌口
  const keys = [0.2, 0.226, 0.252, 0.29, 0.318, 0.37, 0.398, 0.426, 0.47, 0.5, 0.548, 0.575];
  for (const y of keys) m.push(place(new THREE.CylinderGeometry(0.0072, 0.0072, 0.0022, 12), { pos: [0, y, ax + R + 0.0016], rot: [Math.PI / 2, 0, 0], color: 0xe4e6ea }));
  m.push(rod(V(0.0088, 0.18, ax + 0.004), V(0.0088, 0.6, ax + 0.004), 0.0012, 0.0012, 5, { color: C.silver }));
  return { parts: [{ name: "flute", mat: "metal", geo: merge(m), cast: false }],
    spec: { length: 0.67, points: { mouth: V(0, 0, 0), headEnd: V(0, -0.066, ax), footEnd: V(0, 0.605, ax), left: V(0, 0.24, ax), right: V(0, 0.4, ax) }, keys } };
}
function buildOboe() {
  const w = [], m = [];
  w.push(place(new THREE.BoxGeometry(0.0072, 0.024, 0.0016), { pos: [0, 0.012, 0], color: C.reed }));
  w.push(lathe([[0.0022, 0.022], [0.0034, 0.03], [0.0052, 0.034], [0.0052, 0.062], [0.0046, 0.066]], 8, C.cork));
  w.push(lathe([[0.0074, 0.066], [0.0082, 0.1], [0.0095, 0.285], [0.0102, 0.295], [0.0102, 0.53], [0.0128, 0.54], [0.0133, 0.6], [0.017, 0.635], [0.0215, 0.65], [0.0195, 0.651], [0.0, 0.651]], 12, 0x141210));
  for (const y of [0.068, 0.29, 0.535]) m.push(lathe([[0.0108, y - 0.004], [0.0112, y + 0.004]], 12, C.silver));
  m.push(rod(V(0.005, 0.09, 0.0092), V(0.005, 0.56, 0.0118), 0.0011, 0.0011, 5, { color: C.silver }));
  m.push(rod(V(-0.005, 0.11, 0.0092), V(-0.0055, 0.52, 0.0118), 0.0011, 0.0011, 5, { color: C.silver }));
  for (const y of [0.12, 0.155, 0.19, 0.235, 0.33, 0.37, 0.41, 0.46]) m.push(place(new THREE.TorusGeometry(0.0045, 0.0011, 4, 10), { pos: [0, y, 0.0104 + 0.0008 * (y > 0.3)], color: C.silver }));
  m.push(block([0, 0.4, -0.012], [0.008, 0.016, 0.004], null, C.silver));   // 親指の掛け金
  return { parts: [{ name: "oboe", mat: "wind", geo: merge(w) }, { name: "oboe.keys", mat: "metal", geo: merge(m) }],
    spec: { length: 0.651, points: { mouth: V(0, 0, 0), bell: V(0, 0.651, 0), left: V(0, 0.19, 0), right: V(0, 0.4, 0) } } };
}
function buildClarinet() {
  const w = [], m = [];
  w.push(place(new THREE.BoxGeometry(0.011, 0.068, 0.0015), { pos: [0, 0.036, -0.0058], rot: [0.06, 0, 0], color: C.reed }));    // リード (下の面)
  w.push(lathe([[0.0035, 0], [0.0085, 0.012], [0.0115, 0.04], [0.0122, 0.085]], 12, 0x101010, { quat: null }).scale(1, 1, 0.82));
  w.push(lathe([[0.0122, 0.085], [0.0158, 0.1], [0.0158, 0.14], [0.0145, 0.15], [0.0142, 0.565], [0.0152, 0.575], [0.018, 0.61], [0.025, 0.64], [0.0345, 0.66], [0.032, 0.661], [0, 0.661]], 14, 0x111010));
  for (const y of [0.05, 0.085, 0.15, 0.37, 0.565]) m.push(lathe([[0.0158 + (y === 0.05 ? -0.002 : 0), y - 0.004], [0.0162 + (y === 0.05 ? -0.002 : 0), y + 0.006]], 14, C.silver));
  m.push(rod(V(0.0065, 0.17, 0.0135), V(0.0065, 0.55, 0.0135), 0.0012, 0.0012, 5, { color: C.silver }));
  m.push(rod(V(-0.0065, 0.18, 0.0135), V(-0.0065, 0.54, 0.0135), 0.0012, 0.0012, 5, { color: C.silver }));
  for (const y of [0.2, 0.24, 0.28, 0.4, 0.44, 0.48]) m.push(place(new THREE.TorusGeometry(0.0055, 0.0012, 4, 10), { pos: [0, y, 0.0146], color: C.silver }));
  m.push(block([0, 0.42, -0.0158], [0.009, 0.018, 0.004], null, C.silver));
  return { parts: [{ name: "clarinet", mat: "wind", geo: merge(w) }, { name: "clarinet.keys", mat: "metal", geo: merge(m) }],
    spec: { length: 0.661, points: { mouth: V(0, 0, 0), bell: V(0, 0.661, 0), left: V(0, 0.24, 0), right: V(0, 0.44, 0) } } };
}
// ファゴット: 下 (ブーツ) から上 (ベル) まで 1.34 m。原点はリードの先
function buildBassoon() {
  const w = [], m = [];
  const maroon = 0x5c2216, base = V(0.0, -0.965, -0.205);   // 下の端 (リードの先から見た位置)
  const at = (x, y, z) => V(x, y, z).add(base);
  // ブーツ (楕円の太い管)
  w.push(place(new THREE.CylinderGeometry(0.036, 0.038, 0.5, 14), { pos: at(-0.004, 0.27, 0), scale: [1, 1, 0.66], color: maroon }));
  m.push(place(new THREE.CylinderGeometry(0.039, 0.039, 0.03, 14), { pos: at(-0.004, 0.02, 0), scale: [1, 1, 0.68], color: C.silver }));
  // ウィング (細い方、リード側 +z の前) とロングジョイント (太い方)・ベル
  w.push(lathe([[0.0185, 0], [0.017, 0.5]], 12, maroon, { center: at(0.016, 0.5, 0.005) }));
  w.push(block(at(0.016, 0.66, 0.018), [0.014, 0.26, 0.016], null, maroon));
  w.push(lathe([[0.0215, 0], [0.022, 0.6]], 12, maroon, { center: at(-0.024, 0.47, -0.006) }));
  w.push(lathe([[0.0225, 0], [0.0245, 0.25], [0.027, 0.27]], 12, maroon, { center: at(-0.024, 1.07, -0.006) }));
  w.push(lathe([[0.0275, 0], [0.0275, 0.012], [0.022, 0.014]], 12, 0xe8dcc0, { center: at(-0.024, 1.328, -0.006) }));   // ベルの白い輪
  for (const y of [0.5, 0.52]) m.push(lathe([[0.0195, 0], [0.0195, 0.008]], 12, C.silver, { center: at(0.016, y + 0.0, 0.005) }));
  m.push(lathe([[0.0235, 0], [0.0235, 0.012]], 12, C.silver, { center: at(-0.024, 1.065, -0.006) }));
  m.push(lathe([[0.04, 0], [0.04, 0.012]], 14, C.silver, { center: at(-0.004, 0.515, 0) }));
  // ボーカル (銀の曲がった管) とリード
  const bocal = [at(0.016, 1.0, 0.005), at(0.016, 1.04, 0.035), at(0.014, 1.045, 0.09), at(0.01, 1.02, 0.15), at(0.006, 0.985, 0.19)];
  m.push(tube(bocal, 0.0038, C.silver, 20, 7));
  const reedBase = bocal[bocal.length - 1], reedDir = reedBase.clone().negate().normalize();
  w.push(place(new THREE.BoxGeometry(0.008, reedBase.length(), 0.0018), { pos: reedBase.clone().multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), reedDir), color: C.reed }));
  // キー
  m.push(rod(at(0.03, 0.15, 0.02), at(0.03, 0.45, 0.022), 0.0016, 0.0016, 5, { color: C.silver }));
  m.push(rod(at(-0.03, 0.12, 0.025), at(-0.03, 0.42, 0.026), 0.0016, 0.0016, 5, { color: C.silver }));
  m.push(rod(at(-0.006, 0.55, 0.026), at(-0.006, 0.95, 0.026), 0.0014, 0.0014, 5, { color: C.silver }));
  for (const y of [0.25, 0.32, 0.39]) m.push(place(new THREE.TorusGeometry(0.006, 0.0013, 4, 10), { pos: at(0.0, y, 0.025), color: C.silver }));
  const axis = V(0, 1, 0), bottom = at(-0.004, 0, 0), top = at(-0.024, 1.34, -0.006);
  return { parts: [{ name: "bassoon", mat: "wind", geo: merge(w), cast: true }, { name: "bassoon.keys", mat: "metal", geo: merge(m) }],
    spec: { length: 1.34, axis, front: V(0, 0, 1), points: { mouth: V(0, 0, 0), bottom, top, left: at(0.016, 0.78, 0.012), right: at(-0.004, 0.33, 0.02), wingTop: at(0.016, 1.0, 0.005) } } };
}

/* ─────────── 金管 ─────────── */
// ホルン: 巻き管 (直径 0.27 m、2 重) は x-y 面。マウスピースは原点、管は -y へ入る。ベルは直径 0.30 m
function buildHorn() {
  const b = [], lever = [];
  const Cc = V(0.035, -0.255, 0), R = 0.128, tr = 0.0062;
  for (const z of [-0.011, 0.011]) b.push(place(new THREE.TorusGeometry(R, tr, 6, 40), { pos: Cc.clone().setZ(z), color: C.brass }));
  b.push(place(new THREE.TorusGeometry(R * 0.82, tr * 0.9, 6, 34), { pos: Cc.clone().setZ(0), color: C.brass }));
  // マウスピース (銀) と吹き込み管
  b.push(lathe([[0.0045, -0.07], [0.0042, -0.03], [0.007, -0.012], [0.0098, -0.003], [0.0092, 0]], 10, C.silver));
  const lead = [V(0, -0.068, 0), V(-0.006, -0.1, 0.004), V(-0.03, -0.135, 0.012), V(-0.06, -0.155, 0.012), Cc.clone().add(V(-R * 0.86, R * 0.5, 0.011))];
  b.push(tube(lead, 0.0048, C.brass, 16, 7));
  // ロータリーバルブ 3 つ (巻きの左上)
  const valves = [V(-0.05, -0.2, 0.0), V(-0.025, -0.218, 0.0), V(0.0, -0.228, 0.0)];
  for (const p of valves) { b.push(place(new THREE.CylinderGeometry(0.012, 0.012, 0.042, 12), { pos: p, rot: [Math.PI / 2, 0, 0], color: C.brass })); b.push(place(new THREE.CylinderGeometry(0.0135, 0.0135, 0.004, 12), { pos: p.clone().setZ(0.022), rot: [Math.PI / 2, 0, 0], color: C.silver })); }
  // 抜き差し管 (巻きの外の U 字)
  for (const [a, c] of [[V(-0.075, -0.21, -0.01), V(-0.16, -0.24, -0.01)], [V(-0.06, -0.24, 0.01), V(-0.135, -0.305, 0.012)]]) b.push(tube([a, a.clone().lerp(c, 0.5).add(V(-0.02, 0.0, 0)), c, c.clone().add(V(0.02, -0.035, 0)), a.clone().add(V(0.0, -0.05, 0))], 0.0045, C.brass, 16, 6));
  // ベル (巻きの右下から外へ広がる)
  const throat = Cc.clone().add(V(R * 0.55, -R * 0.84, 0)), axis = V(0.86, -0.51, 0).normalize(), BL = 0.36;
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), axis), prof = [];
  for (let i = 0; i <= 16; i++) { const s = i / 16; prof.push([0.0085 + 0.141 * Math.pow(s, 3.6), s * BL]); }
  prof.push([0.15, BL + 0.002], [0.146, BL + 0.004]);
  b.push(lathe(prof, 22, C.brass, { center: throat, quat: q }));
  b.push(place(new THREE.TorusGeometry(0.15, 0.0028, 4, 32), { pos: throat.clone().addScaledVector(axis, BL + 0.002), quat: new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), axis), color: C.brass }));
  b.push(tube([Cc.clone().add(V(R * 0.2, -R * 0.98, 0)), Cc.clone().add(V(R * 0.42, -R * 0.92, 0)), throat], 0.008, C.brass, 8, 7));
  // レバー (左手の指が乗る銀の板)。動かすので別の部品 (nodes.levers の 3 つ)
  lever.push(block([-0.026, 0.0, 0.0], [0.052, 0.008, 0.003], null, C.silver), block([-0.052, 0, 0.003], [0.012, 0.012, 0.004], null, C.silver));
  return { parts: [{ name: "horn", mat: "metal", geo: merge(b), cast: true }, { name: "horn.lever", mat: "metal", geo: merge(lever), node: "levers" }],
    spec: { coilCentre: Cc, coilRadius: R, bellAxis: axis, bellLength: BL,
      points: { mouth: V(0, 0, 0), bell: throat.clone().addScaledVector(axis, BL), hand: throat.clone().addScaledVector(axis, BL * 0.7), throat, valves: valves[1].clone(), left: V(-0.06, -0.19, 0.03) },
      levers: valves.map((p) => p.clone().add(V(-0.012, 0.018, 0.026))) } };
}
// トランペット (C 管・全長 0.48 m)。+y = ベルの方、+z = ピストンのボタン
function buildTrumpet() {
  const b = [], valve = [];
  b.push(lathe([[0.0086, 0], [0.0088, 0.003], [0.007, 0.012], [0.0038, 0.03], [0.0046, 0.085]], 10, C.silver));
  const vy = [0.165, 0.188, 0.211];
  b.push(tube([V(0, 0.085, 0), V(0, 0.2, -0.008), V(0, 0.33, -0.022), V(0, 0.345, -0.035), V(0, 0.335, -0.048), V(0, 0.24, -0.05), V(0, 0.215, -0.046)], 0.0052, C.brass, 24, 7));
  // ベルの管 (上): 後ろの曲がりからベルへ
  b.push(tube([V(0, 0.15, -0.036), V(0, 0.11, -0.035), V(0, 0.082, -0.01), V(0, 0.095, 0.016), V(0, 0.15, 0.02), V(0, 0.27, 0.02)], 0.0053, C.brass, 20, 7));
  const prof = []; for (let i = 0; i <= 14; i++) { const s = i / 14; prof.push([0.0062 + 0.0548 * Math.pow(s, 4.2), s * 0.21]); }
  prof.push([0.0615, 0.212], [0.059, 0.214]);
  b.push(lathe(prof, 20, C.brass, { center: V(0, 0.27, 0.02) }));
  for (const y of vy) {
    b.push(place(new THREE.CylinderGeometry(0.0088, 0.0088, 0.082, 12), { pos: [0, y, -0.006], rot: [Math.PI / 2, 0, 0], color: C.silver }));
    b.push(place(new THREE.CylinderGeometry(0.0095, 0.0095, 0.006, 12), { pos: [0, y, 0.036], rot: [Math.PI / 2, 0, 0], color: C.brass }));
    b.push(place(new THREE.CylinderGeometry(0.0095, 0.0095, 0.006, 12), { pos: [0, y, -0.047], rot: [Math.PI / 2, 0, 0], color: C.brass }));
  }
  b.push(tube([V(0.0, 0.165, -0.04), V(0.014, 0.16, -0.065), V(0.014, 0.12, -0.075), V(0.006, 0.12, -0.05)], 0.0038, C.brass, 12, 6));   // 1 番管
  b.push(tube([V(0.0, 0.211, -0.04), V(-0.014, 0.225, -0.068), V(-0.014, 0.27, -0.072), V(-0.004, 0.27, -0.05)], 0.0038, C.brass, 12, 6));  // 3 番管
  b.push(place(new THREE.TorusGeometry(0.009, 0.0022, 4, 10), { pos: [0.011, 0.115, -0.018], rot: [0, Math.PI / 2, 0], color: C.brass }));   // 小指掛け
  // ピストンのボタン (動く部品)。nodes.valves[k] の原点 = ボタンの軸の下 (上がった位置)
  valve.push(rod(V(0, 0, 0.039), V(0, 0, 0.056), 0.0022, 0.0022, 6, { color: C.silver }));
  valve.push(place(new THREE.CylinderGeometry(0.0085, 0.0085, 0.0045, 12), { pos: [0, 0, 0.058], rot: [Math.PI / 2, 0, 0], color: 0xece8e0 }));
  return { parts: [{ name: "trumpet", mat: "metal", geo: merge(b), cast: true }, { name: "trumpet.valve", mat: "metal", geo: merge(valve), node: "valves" }],
    spec: { length: 0.484, valveTravel: 0.012, points: { mouth: V(0, 0, 0), bell: V(0, 0.484, 0.02), left: V(-0.012, 0.19, -0.02), right: V(0, 0.188, 0.06) }, valves: vy.map((y) => V(0, y, 0)) } };
}

/* ─────────── 打楽器のばち・指揮棒 ─────────── */
function buildMallet() {
  const g = [];
  g.push(rod(V(0, 0.012, 0), V(0, 0.37, 0), 0.0052, 0.0058, 7, { color: 0xc49a62 }));
  g.push(ball([0, 0, 0], 0.021, 12, 9, 0xeee6d6, [1, 0.92, 1]));
  g.push(lathe([[0.0064, 0.35], [0.0064, 0.372], [0, 0.374]], 8, 0x2a2420));
  return { parts: [{ name: "mallet", mat: "matte", geo: merge(g) }], spec: { length: 0.374, headR: 0.021, points: { head: V(0, 0, 0), grip: V(0, 0.3, 0) } } };
}
function buildBaton() {
  const g = [];
  g.push(lathe([[0, 0], [0.0075, 0.004], [0.0095, 0.025], [0.0085, 0.05], [0.0055, 0.065]], 10, 0xb5865a));
  g.push(lathe([[0.0042, 0.064], [0.0034, 0.15], [0.0012, 0.4], [0, 0.402]], 7, 0xf4f1ea));
  return { parts: [{ name: "baton", mat: "matte", geo: merge(g) }], spec: { length: 0.402, points: { tip: V(0, 0.402, 0), grip: V(0, 0.03, 0) } } };
}

/* ─────────── 動かない物 (stage.js が 1 つにまとめる) ─────────── */
// 椅子: 座面の上 0.46 m (座る人の床から)。原点 = 座面の中心の真下の床、+z = 前
export function chairPieces({ seatTop = 0.46, depth = 0.42, width = 0.44 } = {}) {
  const f = [], frame = 0x1a1b1e, pad = 0x26262a;
  f.push(place(new THREE.BoxGeometry(width, 0.05, depth), { pos: [0, seatTop - 0.025, 0], color: pad }));
  f.push(place(new THREE.BoxGeometry(width + 0.01, 0.018, depth + 0.01), { pos: [0, seatTop - 0.06, 0], color: frame }));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.push(rod(V(x * width * 0.44, 0, z * depth * 0.42), V(x * width * 0.44, seatTop - 0.06, z * depth * 0.42), 0.011, 0.011, 6, { color: frame }));
  f.push(rod(V(-width * 0.44, seatTop - 0.06, -depth * 0.42), V(-width * 0.42, seatTop + 0.42, -depth * 0.56), 0.011, 0.011, 6, { color: frame }));
  f.push(rod(V(width * 0.44, seatTop - 0.06, -depth * 0.42), V(width * 0.42, seatTop + 0.42, -depth * 0.56), 0.011, 0.011, 6, { color: frame }));
  f.push(place(new THREE.BoxGeometry(width * 0.92, 0.2, 0.035), { pos: [0, seatTop + 0.3, -depth * 0.53], rot: [-0.14, 0, 0], color: pad }));
  return f;
}
// コントラバスの高い椅子 (座面 0.76 m・足掛けの輪 0.32 m)
export function stoolPieces({ seatTop = 0.76 } = {}) {
  const f = [], frame = 0x1a1b1e, pad = 0x26262a;
  f.push(place(new THREE.CylinderGeometry(0.175, 0.17, 0.055, 18), { pos: [0, seatTop - 0.0275, 0], color: pad }));
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; f.push(rod(V(Math.cos(a) * 0.12, seatTop - 0.055, Math.sin(a) * 0.12), V(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22), 0.012, 0.012, 6, { color: frame })); }
  f.push(place(new THREE.TorusGeometry(0.19, 0.009, 5, 24), { pos: [0, 0.32, 0], rot: [Math.PI / 2, 0, 0], color: frame }));
  return f;
}
// 譜面台: 原点 = 足の中心の床、+z = 読む人の方。譜面の真ん中の高さ h
export function standPieces({ h = 1.02, tilt = 0.42, w = 0.52, deskH = 0.36 } = {}) {
  const f = [], c = 0x101012, top = h + deskH * 0.5 * Math.cos(tilt);
  f.push(place(new THREE.CylinderGeometry(0.2, 0.21, 0.018, 18), { pos: [0, 0.009, 0], color: c }));
  f.push(rod(V(0, 0.018, 0), V(0, h - deskH * 0.35, 0), 0.012, 0.014, 8, { color: c }));
  const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -tilt);
  const desk = place(new THREE.BoxGeometry(w, deskH, 0.008), { quat: q, pos: [0, h, -0.01], color: c });
  const lip = place(new THREE.BoxGeometry(w, 0.012, 0.04), { quat: q, pos: V(0, -deskH / 2, 0.018).applyQuaternion(q).add(V(0, h, -0.01)), color: c });
  f.push(desk, lip);
  return { pieces: f, top, sheet: { pos: V(0, h + 0.012, 0.0).add(V(0, 0, 0.006).applyQuaternion(q)), quat: q, w: w * 0.9, h: deskH * 0.88 } };
}
// ティンパニ 1 台: 皮の高さ H、半径 R。原点 = 真下の床、+z = 叩く人の側
export function timpaniPieces({ R = 0.37, H = 0.85 } = {}) {
  const metal = [], dark = [];
  const bowl = [[R * 1.0, H - 0.028], [R * 0.995, H - 0.11], [R * 0.95, H - 0.24], [R * 0.82, H - 0.36], [R * 0.58, H - 0.45], [R * 0.25, H - 0.5], [0.0, H - 0.51]];
  metal.push(lathe(bowl.slice().reverse().map(([r, y]) => [r, y]), 28, C.copper));
  metal.push(place(new THREE.TorusGeometry(R + 0.011, 0.0095, 6, 40), { pos: [0, H + 0.002, 0], rot: [Math.PI / 2, 0, 0], color: C.chrome }));
  metal.push(place(new THREE.TorusGeometry(R + 0.004, 0.006, 5, 40), { pos: [0, H - 0.03, 0], rot: [Math.PI / 2, 0, 0], color: C.chrome }));
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * Math.PI / 4, x = Math.cos(a) * (R + 0.026), z = Math.sin(a) * (R + 0.026);
    metal.push(rod(V(x, H + 0.012, z), V(x, H - 0.19, z), 0.0042, 0.0042, 6, { color: C.chrome }));
    metal.push(rod(V(x - Math.sin(a) * 0.022, H + 0.026, z + Math.cos(a) * 0.022), V(x + Math.sin(a) * 0.022, H + 0.026, z - Math.cos(a) * 0.022), 0.0038, 0.0038, 5, { color: C.chrome }));
    metal.push(rod(V(x, H + 0.012, z), V(x, H + 0.026, z), 0.004, 0.004, 5, { color: C.chrome }));
  }
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i + 0.5) * Math.PI * 2 / 3;
    dark.push(rod(V(Math.cos(a) * R * 0.95, 0.06, Math.sin(a) * R * 0.95), V(Math.cos(a) * R * 0.7, H - 0.36, Math.sin(a) * R * 0.7), 0.014, 0.012, 6, { color: 0x1c1c1f }));
    dark.push(ball([Math.cos(a) * R * 0.95, 0.03, Math.sin(a) * R * 0.95], 0.03, 8, 6, 0x111113));
  }
  dark.push(place(new THREE.TorusGeometry(R * 0.95, 0.012, 5, 30), { pos: [0, 0.06, 0], rot: [Math.PI / 2, 0, 0], color: 0x1c1c1f }));
  dark.push(place(new THREE.BoxGeometry(0.12, 0.035, 0.3), { pos: [0, 0.065, R * 0.82], rot: [-0.32, 0, 0], color: 0x18181a }));
  const head = place(new THREE.CircleGeometry(R + 0.004, 40), { pos: [0, H, 0], rot: [-Math.PI / 2, 0, 0] });
  return { metal, dark, head };
}
// 指揮台 (0.9 m 角・高さ 0.22 m) と、客席側の手すり
export const PODIUM = { size: 0.9, top: 0.22 };
export function podiumPieces() {
  const dark = [], metal = [], s = PODIUM.size, t = PODIUM.top;
  dark.push(place(new THREE.BoxGeometry(s, t - 0.012, s), { pos: [0, (t - 0.012) / 2, 0], color: 0x141416 }));
  dark.push(place(new THREE.BoxGeometry(s - 0.04, 0.012, s - 0.04), { pos: [0, t - 0.006, 0], color: 0x2a1e1c }));
  const rail = [];
  for (let i = 0; i <= 10; i++) { const a = Math.PI + (i / 10 - 0.5) * Math.PI * 0.9; rail.push(V(Math.sin(a) * s * 0.5, t + 0.92, Math.cos(a) * s * 0.5 * 0.92)); }
  metal.push(tube(rail, 0.012, C.chrome, 30, 8));
  for (const i of [0, 5, 10]) metal.push(rod(rail[i].clone().setY(t), rail[i], 0.011, 0.011, 8, { color: C.chrome }));
  return { dark, metal };
}

/* ─────────── 楽器の台をまとめて描く ─────────── */
const BUILDERS = {
  violin: () => buildStringInstrument("violin"), cello: () => buildStringInstrument("cello"), bass: () => buildStringInstrument("bass"),
  bow: buildBow, flute: buildFlute, oboe: buildOboe, clarinet: buildClarinet, bassoon: buildBassoon, horn: buildHorn, trumpet: buildTrumpet,
  mallet: buildMallet, baton: buildBaton,
};
// 持ち手の種類 → 形の種類と大きさ
const KINDS = {
  violin: { geo: "violin" }, viola: { geo: "violin", scale: [VIOLA_SCALE, VIOLA_SCALE, VIOLA_SCALE], open: [48, 55, 62, 69], names: ["C", "G", "D", "A"] },
  cello: { geo: "cello", endpin: true }, bass: { geo: "bass", endpin: true },
  bowViolin: { geo: "bow", scale: BOW_DIMS.violin.k }, bowViola: { geo: "bow", scale: BOW_DIMS.viola.k }, bowCello: { geo: "bow", scale: BOW_DIMS.cello.k }, bowBass: { geo: "bow", scale: BOW_DIMS.bass.k },
  flute: { geo: "flute" }, oboe: { geo: "oboe" }, clarinet: { geo: "clarinet" }, bassoon: { geo: "bassoon" }, horn: { geo: "horn" }, trumpet: { geo: "trumpet" },
  mallet: { geo: "mallet" }, baton: { geo: "baton" },
};
export const BOW_OF = { violin: "bowViolin", viola: "bowViola", cello: "bowCello", bass: "bowBass" };
const scalePoint = (p, k) => (p.isVector3 ? p.clone().multiply(k) : p);
function scaledSpec(spec, k, extra) {
  if (!k) return spec;
  const out = JSON.parse(JSON.stringify(spec, (key, v) => (v?.isVector3 ? { __v: [v.x, v.y, v.z] } : v)), (key, v) => (v?.__v ? V(...v.__v) : v));
  const walk = (o) => { for (const [key, v] of Object.entries(o)) { if (v?.isVector3) o[key] = v.multiply(k); else if (v && typeof v === "object") walk(v); else if (typeof v === "number" && ["L", "total", "rib", "nutY", "fbEndY", "bridgeY", "bowY", "stringLength", "radius", "hairLen", "hairWidth", "length"].includes(key)) o[key] = v * (key === "hairLen" || key === "length" ? k.y : key === "hairWidth" ? k.x : k.y); } };
  walk(out);
  if (extra?.open) out.strings.forEach((s, i) => { s.open = extra.open[i]; s.name = extra.names[i]; });
  return out;
}

export class InstrumentSet {
  constructor(scene) { this.scene = scene; this.handles = []; this.geos = {}; this.meshes = []; this._m = new THREE.Matrix4(); this._v = V(0, 0, 0); this._e = V(0, 0, 0); }
  geo(name) { return (this.geos[name] ??= BUILDERS[name]()); }
  // 1 台ぶんの持ち手を作る (build の前に呼ぶ)
  add(kind, owner = null) {
    const K = KINDS[kind]; if (!K) throw new Error("unknown instrument " + kind);
    const g = this.geo(K.geo), k = K.scale ? V(...K.scale) : null;
    const root = new THREE.Object3D(); root.name = kind;
    const h = { kind, geoName: K.geo, root, owner, spec: scaledSpec(g.spec, k, K), scale: k ?? V(1, 1, 1), nodes: {}, floorY: 0, visible: true };
    if (K.endpin) { const e = new THREE.Object3D(); e.name = "endpin"; root.add(e); h.nodes.endpin = e; h.endpinLength = 0.3; }
    for (const part of g.parts) if (part.node && !h.nodes[part.node]) {
      const pts = g.spec[part.node] ?? [];
      h.nodes[part.node] = pts.map((p) => { const o = new THREE.Object3D(); o.position.copy(p).multiply(h.scale); root.add(o); return o; });
    }
    // world の点 (spec.points の名前)・弦の上の点 (i = 弦、t = 0 駒 → 1 上駒)・弓の毛の上の点 (u = 0 毛箱 → 1 先)
    h.point = (name, out = V(0, 0, 0)) => { root.updateWorldMatrix(true, false); return out.copy(h.spec.points[name]).applyMatrix4(root.matrixWorld); };
    h.local = (p, out = V(0, 0, 0)) => { root.updateWorldMatrix(true, false); return out.copy(p).applyMatrix4(root.matrixWorld); };
    h.stringPoint = (i, t, out = V(0, 0, 0)) => { const s = h.spec.strings[i]; return h.local(out.copy(s.bridge).lerp(s.nut, t), out); };
    h.hairPoint = (u, out = V(0, 0, 0)) => h.local(out.set(0, u * h.spec.hairLen, 0), out);
    this.handles.push(h);
    return h;
  }
  build() {
    const byGeo = new Map();
    for (const h of this.handles) (byGeo.get(h.geoName) ?? byGeo.set(h.geoName, []).get(h.geoName)).push(h);
    this.groups = [];
    for (const [name, list] of byGeo) {
      const g = this.geo(name);
      for (const part of g.parts) {
        const per = part.node ? (list[0].nodes[part.node]?.length ?? 0) : 1;
        if (!per) continue;
        const mesh = new THREE.InstancedMesh(part.geo, IM[part.mat], list.length * per);
        mesh.name = "inst." + name + "." + part.name; mesh.frustumCulled = false; mesh.castShadow = !!part.cast; mesh.receiveShadow = true;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(mesh); this.meshes.push(mesh);
        this.groups.push({ mesh, list, part, per });
      }
      if (list.some((h) => h.nodes.endpin)) {
        const pin = merge([rod(V(0, 0, 0), V(0, -1, 0), 1, 0.7, 8, { color: C.chrome })]);
        const mesh = new THREE.InstancedMesh(pin, IM.metal, list.length);
        mesh.name = "inst." + name + ".endpin"; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(mesh); this.meshes.push(mesh);
        this.groups.push({ mesh, list, part: { name: "endpin", node: "endpin" }, per: 1, endpin: true });
      }
    }
    this.update();
  }
  // エンドピンの長さを、楽器の -y の向きで床 (h.floorY) に届くように決める
  _endpin(h) {
    const e = h.nodes.endpin; if (!e) return;
    h.root.updateMatrixWorld(true);
    const base = this._v.setFromMatrixPosition(h.root.matrixWorld), dir = this._e.set(0, -1, 0).transformDirection(h.root.matrixWorld);
    const len = dir.y < -0.15 ? (base.y - h.floorY) / -dir.y : 0.06;
    h.endpinLength = clamp(len, 0.02, 0.9);
    const r = (h.geoName === "bass" ? 0.0065 : 0.0045);
    e.scale.set(r, h.endpinLength, r);
  }
  update() {
    const m = this._m;
    for (const h of this.handles) { if (h.nodes.endpin) this._endpin(h); h.root.updateMatrixWorld(true); }
    const S = this._S ??= new THREE.Matrix4();
    for (const G of this.groups) {
      const arr = G.mesh.instanceMatrix.array; let k = 0;
      for (const h of G.list) {
        if (G.endpin) { m.copy(h.nodes.endpin.matrixWorld); if (!h.visible) m.makeScale(0, 0, 0); m.toArray(arr, (k++) * 16); continue; }
        S.makeScale(h.scale.x, h.scale.y, h.scale.z);
        if (G.part.node) for (const n of h.nodes[G.part.node]) { m.multiplyMatrices(n.matrixWorld, S); if (!h.visible) m.makeScale(0, 0, 0); m.toArray(arr, (k++) * 16); }
        else { m.multiplyMatrices(h.root.matrixWorld, S); if (!h.visible) m.makeScale(0, 0, 0); m.toArray(arr, (k++) * 16); }
      }
      G.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
export { merge, triangles, place };
