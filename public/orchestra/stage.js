// ═══════════ VESPER ORCHESTRA の 3D 舞台 (three.js) ═══════════
// 48 体の VESPER (弦 34・管 12・ティンパニ 1・指揮者 1) が、楽譜どおりに楽器を構えて演奏する暗いホール。
// 見た目はピアノの舞台 (../piano/scene.js) と同じ: 暗い背景・暖かいスポット・つやのある黒い床・水色に光るロボット。光は動かさない。
// 描く物: ロボットは robot-lite.js (部品ごとの InstancedMesh)、楽器は instruments.js (楽器の部品ごとの InstancedMesh)、
// 椅子・譜面台・ひな壇・指揮台・ティンパニは動かないので 1 つの形にまとめる。
// 動き: 奏者の家族ごとの部品 (players/*.js、作りは players/base.js の先頭に書いた) が毎コマ骨と楽器の持ち手を決める。
//
// 画面は 2 つ: 上 (または左) = 全体 (wide | front | top | conductor)、下 (または右) = 寄り (auto は曲の focus に合わせてカットで切り替え)。
// 注意: scene.matrixWorldAutoUpdate = false (毎コマ three にシーン全体をたどらせないため)。ロボットの骨は updateRig、楽器の持ち手は
// InstrumentSet.update が行列を更新する。あとからシーンに物を足すときは、その物の updateMatrixWorld() を自分で呼ぶ。
import * as THREE from "three";
import { P, makeEnvironment } from "../piano/scene.js";
import { beatToSec, secToBeat } from "../js/state.js";
import { createRig, sit, stand, restPose, setFingers, updateRig, wpos, SIDES } from "./rig.js";
import { RobotCrowd, merge, place, triangles } from "./robot-lite.js";
import { InstrumentSet, IM, BOW_OF, chairPieces, stoolPieces, standPieces, timpaniPieces, podiumPieces } from "./instruments.js";
import { buildLayout, PLAYER_IDS, DEFAULT_PLAYERS, SEAT_TOP, STOOL_TOP, polar } from "./layout.js";
import { notesInSec, hash01 } from "./players/base.js";
import * as base from "./players/base.js";
import * as strings from "./players/strings.js";
import * as winds from "./players/winds.js";
import * as timpani from "./players/timpani.js";
import * as conductor from "./players/conductor.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const UP = V(0, 1, 0);
const now = () => (globalThis.performance ?? Date).now();
const FAMILY = { strings, woodwind: winds, brass: winds, percussion: timpani, conductor };

// 全体の画面 (target のまわりの球面: theta = y 軸まわり (π = 客席の側)、phi = 真上からの角度)
export const VIEWS = {
  wide: { target: [0, 1.0, 3.1], theta: Math.PI, phi: 1.02, radius: 13.6, fov: 36, auto: true },
  front: { target: [0, 1.05, 3.0], theta: Math.PI, phi: 1.465, radius: 11.9, fov: 34 },
  top: { target: [0, 0, 3.0], theta: Math.PI, phi: 0.42, radius: 16.0, fov: 40 },
  conductor: { target: [0, 1.45, 0.05], theta: 0.058, phi: 1.31, radius: 8.95, fov: 17 },   // 楽団の後ろの高い所から指揮者を見る (手前は奏者の背中)
};
// 寄りの画面の名前。ORCHESTRA.md §5 の 6 つ (auto | strings | woodwinds | brass | timpani | conductor) に、部分ごとの寄りを足した
export const CLOSE_SHOTS = ["auto", "strings", "woodwinds", "brass", "timpani", "conductor", "tutti", "violins", "violas", "cellos", "basses", "lowstrings",
  "flute", "oboe", "clarinet", "bassoon", "frontwinds", "backwinds", "horns", "trumpets"];
// 曲の focus.group → 寄りの画面
const FOCUS_SHOT = { conductor: "conductor", tutti: "tutti", strings: "strings", violins: "violins", lowstrings: "lowstrings", woodwinds: "woodwinds",
  flute: "flute", oboe: "oboe", clarinet: "clarinet", bassoon: "bassoon", horns: "horns", trumpets: "trumpets", timpani: "timpani" };
const SHOT_PRIORITY = { tutti: 1, strings: 2, lowstrings: 2, woodwinds: 2, violins: 2, conductor: 3, horns: 3, trumpets: 3, oboe: 3, flute: 3, clarinet: 3, bassoon: 3, timpani: 3 };
export const CUT_MIN_SEC = 6, DRIFT_MAX = 0.08;

// 全曲 2 fps の部品の範囲。各側に 2 cm の余白を加える
const FRAME_BOUNDS = {
  violin: [[[-0.489, -0.02, -0.278], [0.594, 1.679, 0.851]], [[-0.489, 0.289, -0.278], [0.594, 1.679, 0.851]]],
  viola: [[[-0.48, -0.02, -0.285], [0.649, 1.69, 0.844]], [[-0.48, 0.292, -0.285], [0.649, 1.69, 0.844]]],
  cello: [[[-0.731, -0.022, -0.248], [0.851, 1.328, 0.987]], [[-0.731, -0.022, -0.248], [0.851, 1.328, 0.987]]],
  bass: [[[-0.602, -0.022, -0.177], [0.537, 2.061, 1.181]], [[-0.602, -0.022, -0.177], [0.537, 2.061, 1.181]]],
  flute: [[[-0.571, -0.02, -0.161], [0.302, 1.227, 0.625]], [[-0.571, 0.432, -0.161], [0.302, 1.227, 0.544]]],
  oboe: [[[-0.339, -0.02, -0.15], [0.489, 1.225, 0.625]], [[-0.339, 0.432, -0.15], [0.489, 1.225, 0.567]]],
  clarinet: [[[-0.306, -0.02, -0.15], [0.488, 1.225, 0.625]], [[-0.306, 0.432, -0.15], [0.488, 1.225, 0.618]]],
  bassoon: [[[-0.61, -0.02, -0.255], [0.421, 1.436, 0.625]], [[-0.61, 0.139, -0.255], [0.421, 1.436, 0.544]]],
  horn: [[[-0.636, -0.02, -0.301], [0.299, 1.225, 0.821]], [[-0.636, 0.192, -0.301], [0.299, 1.225, 0.821]]],
  trumpet: [[[-0.337, -0.02, -0.154], [0.397, 1.283, 0.655]], [[-0.337, 0.432, -0.154], [0.397, 1.283, 0.655]]],
  timpani: [[[-0.414, -0.02, -0.21], [0.461, 1.596, 0.684]], [[-0.414, 0.43, -0.21], [0.461, 1.596, 0.684]]],
  baton: [[[-0.566, -0.02, -0.207], [0.982, 1.832, 0.924]], [[-0.566, 0.43, -0.207], [0.982, 1.832, 0.924]]],
};

// ホルンの全曲10 fpsの部品を囲む固定の外形。各方向に2 cmの余白
const HORN_FRAME = [
  [-0.6361072, 0.3540846, 0.1432514],
  [-0.4739444, 0.1919218, 0.1432514],
  [-0.6361072, 0.4840172, 0.0133188],
  [-0.4036527, 0.4840172, -0.2191356],
  [-0.4036527, 0.1919218, 0.0729597],
  [-0.6361072, 0.3540846, 0.3446391],
  [-0.4739444, 0.1919218, 0.3446391],
  [-0.6361072, 0.3689169, 0.3594714],
  [-0.3082429, 0.3689169, 0.6873357],
  [-0.3082429, 0.1919218, 0.5103406],
  [-0.6361072, 0.9758548, 0.0133188],
  [-0.5798037, 1.0321583, -0.0429846],
  [-0.3902341, 1.0321583, -0.2325542],
  [-0.3215905, 0.5660793, -0.3011978],
  [-0.3215905, 0.9635148, -0.3011978],
  [-0.6361072, 0.6384742, 0.3594714],
  [-0.6361072, 0.9758548, 0.0220908],
  [-0.1743851, 0.6384742, 0.8211935],
  [-0.1743851, 0.5027748, 0.8211935],
  [-0.3902341, 1.2217279, -0.0429846],
  [-0.3893197, 1.2226422, 0.0220908],
  [-0.3893197, 1.2226422, -0.0420703],
  [-0.0621718, 0.7506875, 0.8211935],
  [-0.0323051, 1.2226422, 0.3791054],
  [-0.0323051, 0.8104209, 0.7913267],
  [-0.0281916, 0.1919218, 0.0729597],
  [-0.0163873, 0.5660793, -0.3011978],
  [-0.0163873, 0.2037261, 0.0611554],
  [-0.0281916, 0.1919218, 0.5103406],
  [-0.0621718, 0.5027748, 0.8211935],
  [0.0402456, 0.2603590, 0.5787777],
  [0.0402456, 0.4003574, 0.7187761],
  [0.0252585, 0.9635148, -0.3011978],
  [0.0252585, 0.6077251, -0.3011978],
  [0.1160943, 1.2226422, -0.0420703],
  [0.1160943, 1.0543505, -0.2103620],
  [0.0223844, 1.2226422, 0.3791054],
  [0.1461181, 1.2226422, -0.0120465],
  [0.1461181, 1.2226422, 0.2553718],
  [0.0223844, 0.8651104, 0.7366372],
  [0.2993440, 0.5194574, 0.0611554],
  [0.2993440, 0.6077251, -0.0271123],
  [0.1802439, 0.4003574, 0.5787777],
  [0.2993440, 0.5194574, 0.4596777],
  [0.2993440, 1.0543505, -0.0271123],
  [0.2993440, 0.8651104, 0.4596777],
  [0.2993440, 1.0694164, -0.0120465],
  [0.2993440, 1.0694164, 0.2553718],
];

export class OrchestraStage {
  constructor(canvas, { headless = false } = {}) {
    this.canvas = canvas; this.headless = headless;
    this.scene = new THREE.Scene();
    if (!headless) {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
      this.renderer.setPixelRatio(Math.min(1.5, globalThis.devicePixelRatio || 1));   // 軽さ優先 (Retina でも 1.5 まで)
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = false;   // 影は 1 コマに 1 回だけ (画面が 2 つあっても)
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    }
    this._buildHall();
    this.layout = buildLayout();
    this.seats = this.layout.seats;
    // ── ロボット (48 体) と楽器の持ち手
    this.rigs = this.seats.map((s, i) => createRig(i));
    this.instruments = new InstrumentSet(this.scene);
    this.seats.forEach((s, i) => {
      s.rig = this.rigs[i]; s.hash = (k = 0) => hash01(i + 1, k); s.instrumentKind = s.instrument;
      this.scene.add(s.rig.root);
      if (s.family === "strings") { s.instrument = this.instruments.add(s.instrument, s); s.bow = this.instruments.add(BOW_OF[s.instrumentKind], s); }
      else if (s.family === "woodwind" || s.family === "brass") s.instrument = this.instruments.add(s.instrument, s);
      else if (s.family === "percussion") s.mallets = [this.instruments.add("mallet", s), this.instruments.add("mallet", s)];
      else if (s.family === "conductor") s.baton = this.instruments.add("baton", s);
    });
    for (const h of this.instruments.handles) this.scene.add(h.root);
    this.drums = this.seats.find((s) => s.drums)?.drums ?? [];
    this.conductor = this.layout.conductor;
    this._buildStatic();
    this._basePose();
    this.crowd = new RobotCrowd(this.scene, this.rigs);
    this.instruments.build();
    // ── カメラ
    this.camMain = new THREE.PerspectiveCamera(36, 1, 0.1, 90);
    this.camClose = new THREE.PerspectiveCamera(30, 1, 0.05, 70);
    this.orbit = { target: V(0, 1, 3), theta: Math.PI, phi: 1.2, radius: 13, auto: true, base: null };
    this.view = "wide"; this.closeMode = "auto"; this.layoutMode = "stack";
    this.shots = this._closeShots();
    this.shortShots = this._shortShots();
    this.tightShots = this._tightShots();
    this.handShots = this._handShots();
    this._closePos = V(0, 1.5, 0); this._closeLook = V(0, 1, 3);
    this.setView("wide");
    this.t = 0; this.sec = 0; this.beat = 0; this.checks = []; this.errors = []; this.controllers = [];
    this.cuts = [{ sec: -Infinity, shot: "tutti", pri: 1 }];
    // 行列は自分で更新する (ロボットの骨は updateRig、楽器は InstrumentSet.update)。three に毎回シーン全体をたどらせない
    this.scene.updateMatrixWorld(true);
    this.scene.matrixWorldAutoUpdate = false;
    this._resize();
    if (!headless) { this._bindOrbit(); this._resizeObserver = new ResizeObserver(() => this._resize()); this._resizeObserver.observe(canvas.parentElement); }
    this._updateCameras(0, 0);
  }
  // 高さ180 px以下の通常の寄り。全体は上で見せ、ここでは顔・手・楽器を見せる
  _shortShots() {
    const ids = (players, test = () => true) => this.seats.filter(s => players.includes(s.player) && test(s)).map(s => s.id);
    const desk = s => s.desk === 0;
    const groups = {
      violins: ids(["vn1"], desk), violas: ids(["va"], desk), cellos: ids(["vc"], desk), basses: ids(["cb"], desk),
      strings: ids(["vn1"], desk), lowstrings: ids(["vc"], desk),
      flute: ids(["fl1", "fl2"]), oboe: ids(["ob1"]), frontwinds: ids(["fl1", "ob1"]),
      clarinet: ids(["cl1"]), bassoon: ids(["bn1"]), backwinds: ids(["bn1", "bn2"]), woodwinds: ids(["fl1", "ob1"]),
      horns: ids(["hn1", "hn2"]), trumpets: ids(["tp1", "tp2"]), timpani: ids(["timp"]), conductor: ["conductor"], tutti: ["conductor"],
    };
    const source = { strings: "violins", lowstrings: "cellos", woodwinds: "frontwinds", tutti: "conductor" };
    // [方向, 見下ろし, 画角, 範囲の下を切る割合, 上を切る割合]。高さ 155 px では体全体と弓の先まで入れると主役が 90 px ほどになるので、
    // 弦は顔と楽器に絞る (弓の先は画面から出てよい)
    const angles = {
      violins: [65, 20, 25, 0.3, 0.2],
      violas: [30, 20, 30, 0.3, 0.2],
      cellos: [-30, 20, 30, 0.3, 0.2],
      basses: [0, 30, 40, 0.2, 0.1],
      strings: [45, 15, 25, 0.3, 0.2],
      lowstrings: [60, 20, 30, 0.3, 0.2],
      flute: [0, 35, 30, 0.3, 0.2],
      oboe: [-25, 20, 30, 0.3, 0.2],
      frontwinds: [0, 35, 30, 0.3, 0.2],
      clarinet: [0, 35, 30, 0.3, 0.2],
      bassoon: [0, 35, 30, 0.3, 0.2],
      backwinds: [0, 35, 30, 0.3, 0.2],
      woodwinds: [0, 35, 30, 0.3, 0.2],
      horns: [10, 20, 35],   // 低く寄せて 2 人の顔とベルを大きく (40° の見下ろし・60° では小さかった)
      trumpets: [-20, 20, 30, 0.3, 0.2],
      timpani: [-30, 20, 35, 0.3, 0.2],
      conductor: [0, 15, 35, 0.4, 0.1],   // 全奏 (下) と同じ絵にならないように、指揮者の腕と指揮棒に寄る
      tutti: [0, 25, 50],
    };
    const shots = {};
    for (const [name, subjects] of Object.entries(groups)) {
      const original = this.shots[source[name] ?? name];
      const [angle, elevation, fov, cutLow = 0, cutHigh = 0] = angles[name];
      let frame = name === "timpani" ? original.frame : subjects.flatMap(id => {
        const seat = this.seats.find(s => s.id === id);
        if (seat.instrumentKind === "horn") return HORN_FRAME.map(p => seat.pos.clone().add(V(...p).applyAxisAngle(UP, seat.yaw)));
        const [lo, hi] = FRAME_BOUNDS[seat.instrumentKind][1], points = [];
        for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) points.push(seat.pos.clone().add(V(x, y, z).applyAxisAngle(UP, seat.yaw)));
        return points;
      });
      if (cutLow || cutHigh) {
        const ys = frame.map(p => p.y), y0 = Math.min(...ys), y1 = Math.max(...ys), lo = y0 + cutLow * (y1 - y0), hi = y1 - cutHigh * (y1 - y0);
        frame = frame.map(p => p.clone().setY(clamp(p.y, lo, hi)));
      }
      const look = new THREE.Box3().setFromPoints(frame).getCenter(V(0, 0, 0));
      const f = V(-look.x, 0, -look.z);
      if (name === "conductor" || name === "tutti") f.set(0, 0, 1);
      f.normalize();
      const left = V(f.z, 0, -f.x), a = angle * Math.PI / 180;
      const direction = f.multiplyScalar(Math.cos(a)).addScaledVector(left, Math.sin(a));
      shots[name] = { pos: look.clone().addScaledVector(direction, 2).add(V(0, 2 * Math.tan(elevation * Math.PI / 180), 0)),
        look, frame, subjects, fov, vmin: 0.95, amp: 0.015, side: new THREE.Vector3().crossVectors(direction, UP).normalize() };
    }
    return shots;
  }

  // 引きの間にはさむ 1 人の寄り (_addTight)。範囲を首席 1 人の腰から上と楽器に絞り、横も縮める (弦は弓の先が出てよい)。
  // 向きは、弦と指揮者は shortShots の低い前寄り (1 列目なので手前に人がいない)、管とティンパニはいつもの寄り (手前に人が入らない向きを光線で探した物)。
  // _fitCamera がその向きのまま近づく。高さ 180 px 以下の寄りでは shortShots を使う
  _tightShots() {
    const by = this.layout.byPlayer, first = (id) => (by[id] ?? []).find((s) => s.desk === 0) ?? by[id][0];
    const ONE = { violins: "vn1", violas: "va", cellos: "vc", basses: "cb", flute: "fl1", oboe: "ob1", clarinet: "cl1", bassoon: "bn1", horns: "hn1", trumpets: "tp1", timpani: "timp" };
    const box = (s) => {
      if (s.instrumentKind === "horn") return HORN_FRAME.map((p) => s.pos.clone().add(V(...p).applyAxisAngle(UP, s.yaw)));
      const [lo, hi] = FRAME_BOUNDS[s.instrumentKind][1], points = [];
      for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) points.push(s.pos.clone().add(V(x, y, z).applyAxisAngle(UP, s.yaw)));
      return points;
    };
    const cut = (frame, low, high = 0) => {
      const ys = frame.map((p) => p.y), y0 = Math.min(...ys), y1 = Math.max(...ys), lo = y0 + low * (y1 - y0), hi = y1 - high * (y1 - y0);
      return frame.map((p) => p.clone().setY(clamp(p.y, lo, hi)));
    };
    // 向きを shortShots (低い前寄り) から取る寄り。ほかはいつもの寄りの向き (10-29 に 12 種を両方の向きで撮って選んだ)。
    // チェロは前からだと指揮者の腕が手前を横切り、ビオラは前からだと何人も重なった。バイオリンとコントラバスは真上からだと床の図のようだった
    const SHORT_DIR = new Set(["violins", "basses", "flute", "oboe", "trumpets", "timpani"]);
    const narrow = (frame, k) => {
      const c = new THREE.Box3().setFromPoints(frame).getCenter(V(0, 0, 0));
      return frame.map((p) => V(c.x + k * (p.x - c.x), p.y, c.z + k * (p.z - c.z)));
    };
    const shots = {};
    for (const [name, id] of Object.entries(ONE)) {
      const s = first(id), base = (SHORT_DIR.has(name) ? this.shortShots : this.shots)[name];
      // [下を切る割合, 横の倍率]。バイオリンとビオラは顔・楽器・弓の手、チェロとコントラバスは楽器が低い・長いので切りすぎない
      const [low, k] = { violin: [0.45, 0.55], viola: [0.45, 0.55], cello: [0.3, 0.65], bass: [0.35, 0.65] }[s.instrumentKind] ?? [0.2, 0.8];
      let frame = narrow(cut(box(s), low), k);
      if (name === "timpani") frame = [...cut(box(s), 0.4), ...s.drums.flatMap((d) => [0, 1, 2, 3].map((i) => d.pos.clone().add(V((d.R + 0.03) * Math.cos(i * Math.PI / 2), d.H + 0.04, (d.R + 0.03) * Math.sin(i * Math.PI / 2)))))];
      shots[name] = { ...base, frame, vmin: Math.min(base.vmin ?? 0.62, 0.95) };
      if (base.wide) shots[name].wide = { ...base.wide, frame };
    }
    shots.conductor = { ...this.shortShots.conductor, frame: narrow(cut(box(this.conductor), 0.4, 0.1), 0.8) };
    return shots;
  }

  // 指のアップ (_addTight の hand)。tips = 追う指先 ([手, 指の番号 0 親指 … 4 小指])、dir = カメラを置く向き (奏者の体の中: +x 左・+y 上・+z 前)、
  // r = 指先の真ん中から画面に入れる半径 (m)。カメラは指先の真ん中をゆっくり追う (ポジションを移ると手について行く)
  _handShots() {
    const by = this.layout.byPlayer, first = (id) => (by[id] ?? []).find((s) => s.desk === 0) ?? by[id]?.[0];
    const L = (...i) => i.map((k) => ["Left", k]);
    // 向きは 10-30 に何通りも撮って選んだ: バイオリン・ビオラは上から (渦巻きと指板と 4 本の指)、チェロ・コントラバスは前の左上から (指板の上の指先)
    const HAND = {
      vn1: { tips: L(1, 2, 3, 4), dir: [0, 1, 0.4], r: 0.09 },
      va: { tips: L(1, 2, 3, 4), dir: [0, 1, 0.4], r: 0.1 },
      vc: { tips: L(1, 2, 3, 4), dir: [0.5, 0.8, 0.6], r: 0.12 },
      cb: { tips: L(1, 2, 3, 4), dir: [0.2, 0.5, 1], r: 0.15 },
    };
    const shots = {};
    for (const [id, h] of Object.entries(HAND)) { const seat = first(id); if (seat?.rig) shots[id] = { ...h, seat }; }
    // ティンパニ: マレットと 2 つの太鼓の皮と奏者の胸から上 (動かない点だけで決めるので、打つ速さでカメラは揺れない)
    const timp = first("timp");
    if (timp?.drums) {
      const pts = [];
      for (const d of timp.drums) for (let i = 0; i < 8; i++) pts.push(d.pos.clone().add(V((d.R + 0.03) * Math.cos(i * Math.PI / 4), d.H + 0.04, (d.R + 0.03) * Math.sin(i * Math.PI / 4))));
      for (const p of [[0.25, 1.05, 0], [-0.25, 1.05, 0], [0, 1.45, 0]]) pts.push(timp.pos.clone().add(V(...p).applyAxisAngle(UP, timp.yaw)));
      // 向きは 10-30 に何通りも撮って選んだ: 正面のやや上。横や斜めからはクラリネット・ファゴットの人が、後ろからは奏者の頭が手前に入った。
      // 縦長の画面 (全画面の右) は 2 つの太鼓を左右いっぱいに入れると上半分があくので、少し上から、左右を 0.55 倍に絞る (太鼓の外側は切れる)
      shots.timp = { seat: timp, frame: pts, dir: [0, 0.8, 1], tallDir: [0, 1.2, 1], tallK: 0.55 };
    }
    // クラリネット・ファゴット: 奏者の腰から上と楽器 (後ろの列なので、ふつうの寄りはティンパニが手前に大きく入る)
    // 向きは 10-31 に 10 通りずつ撮って選んだ: 正面の上から (オーボエは譜面台をよけて少し右へ)
    for (const [id, dir] of [["cl1", [0, 1, 1]], ["bn1", [0, 1, 1]], ["ob1", [-0.6, 1, 1]]]) {
      const seat = first(id); if (!seat?.rig) continue;
      const [lo, hi] = FRAME_BOUNDS[seat.instrumentKind][1], pts = [];
      for (const x of [lo[0], hi[0]]) for (const y of [lo[1] + 0.2 * (hi[1] - lo[1]), hi[1]]) for (const z of [lo[2], hi[2]]) pts.push(seat.pos.clone().add(V(x, y, z).applyAxisAngle(UP, seat.yaw)));
      shots[id] = { seat, frame: pts, dir };
    }
    return shots;
  }
  _handCamera(cut, dt) {
    const H = this.handShots[cut.hand], s = H.seat, c = (this._handC ??= V(0, 0, 0)).set(0, 0, 0), tmp = (this._handT ??= V(0, 0, 0));
    if (H.frame) for (const p of H.frame) c.add(p);
    else for (const [side, i] of H.tips) c.add(wpos(s.rig.fingers[side][i].tip, tmp));
    c.divideScalar(H.frame ? H.frame.length : H.tips.length);
    // 入った所と、止めて動かした所 (dt が 0 や大きいとき) はそのまま合わせる。弾いている間は 0.6 秒の遅れで追う
    if (this._handCut !== cut || !(dt > 0 && dt < 0.2)) { this._handCut = cut; (this._handLook ??= V(0, 0, 0)).copy(c); }
    else this._handLook.lerp(c, 1 - Math.exp(-dt / 0.6));
    const cam = this.camClose, a = Math.max(0.3, cam.aspect);
    const look = this._handLook, dir = tmp.set(...(a < 1 && H.tallDir ? H.tallDir : H.dir)).normalize().applyAxisAngle(UP, s.yaw);
    const fov = a >= 16 / 9 ? 28 : 2 * Math.atan(Math.tan(14 * Math.PI / 180) * Math.min(1.25, (16 / 9) / a)) * 180 / Math.PI;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.position.copy(look).addScaledVector(dir, 1); cam.up.set(0, 1, 0); cam.lookAt(look);
    cam.updateMatrixWorld(true);
    const e = cam.matrixWorld.elements, rx = V(e[0], e[1], e[2]), uy = V(e[4], e[5], e[6]);
    // 縦長の画面のティンパニは、左右を tallK 倍に縮めた範囲に合わせる (太鼓の外側は切れてよい。マレットが当たるのは奏者の側)
    const kx = a < 1.3 && H.tallK ? (a < 1 ? H.tallK : 0.8) : 1;
    const pts = H.frame ? H.frame.map((p) => p.clone().addScaledVector(rx, (kx - 1) * rx.dot(tmp.copy(p).sub(look))))
      : [rx, rx.clone().negate(), uy, uy.clone().negate()].map((d) => look.clone().addScaledVector(d, H.r));
    this._closeLook.copy(look);
    this._fitCamera(cam, pts, 0.9, this._closeLook);   // 縦長の画面でも左右に合わせる (上下に合わせると指だけで画面が埋まった)
    cam.lookAt(this._closeLook);
    if (H.tallK && a < 1.3) {
      // 縦長・正方形に近い画面のティンパニ: 下があくと太鼓の手前のファゴットの人が大きく入るので、太鼓の手前のふちが画面の下の端に来るまでカメラを上げる
      cam.updateMatrixWorld(true);
      let lo = 1; for (const p of pts) lo = Math.min(lo, tmp.copy(p).project(cam).y);
      const up = tmp.set(e[4], e[5], e[6]), half = cam.position.distanceTo(this._closeLook) * Math.tan(cam.fov * Math.PI / 360);
      const k = Math.max(0, lo + 0.94) * half;
      cam.position.addScaledVector(up, k); this._closeLook.addScaledVector(up, k); cam.lookAt(this._closeLook);
    }
    this._closePos.copy(cam.position);
  }

  /* ─────────── ホール・光・床 ─────────── */
  _buildHall() {
    const sc = this.scene;
    sc.background = new THREE.Color(0x050505);
    sc.fog = new THREE.Fog(0x050505, 17, 36);
    sc.add(new THREE.HemisphereLight(0x9a9a9a, 0x0a0a0a, 0.28));
    if (!this.headless) sc.environment = makeEnvironment(this.renderer);   // つやのある物の映り込み
    sc.environmentIntensity = 0.5;
    const spot = (color, I, pos, target, angle, pen = 0.6, dist = 34) => {
      const s = new THREE.SpotLight(color, I, dist, angle, pen, 2); s.position.set(...pos); s.target.position.set(...target);
      sc.add(s); sc.add(s.target); return s;
    };
    // 主の光 (影あり): 客席の上の高い所から舞台全体へ
    const key = spot(0xfff1dc, 1700, [0.8, 12.5, -3.2], [0, 0.6, 3.2], 0.6, 0.55, 40);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.025;
    key.shadow.camera.near = 6; key.shadow.camera.far = 26; key.shadow.radius = 3;
    this.keyLight = key;
    // 部分ごとの暖かいスポット (影なし)。弦の左右・木管・金管とティンパニ
    spot(0xffe2c0, 520, [4.6, 8.2, -1.0], [2.3, 0.7, 1.7], 0.5);
    spot(0xffe2c0, 520, [-4.6, 8.2, -1.0], [-2.3, 0.7, 1.7], 0.5);
    spot(0xffe9cc, 640, [0, 9.0, 1.4], [0, 0.9, 4.8], 0.42);
    spot(0xffdcb8, 560, [0, 9.5, 3.4], [0, 1.0, 6.0], 0.5);
    // 後ろからの青白い縁取り (ロボットの肩と頭の輪郭)
    spot(0xbfd8ff, 300, [0, 7.6, 8.0], [0, 1.6, 3.6], 0.62, 0.7, 20);
    // 指揮者を前から照らす小さな光
    spot(0xfff3e0, 45, [0.4, 4.2, 2.6], [0, 1.3, 0], 0.22, 0.7, 4.4);   // 届く距離を 4.4 m に (指揮者の先の床を照らさない)
    // 舞台の床 (つやのある黒)。客席の側はまっすぐ、奥は丸い
    const stageShape = new THREE.Shape();
    stageShape.moveTo(-8.8, 1.8); stageShape.lineTo(8.8, 1.8);
    stageShape.absarc(0, -1.2, 8.8, Math.atan2(3.0, 8.8), Math.PI - Math.atan2(3.0, 8.8), true);
    stageShape.lineTo(-8.8, 1.8);
    const floorGeo = new THREE.ShapeGeometry(stageShape, 48); floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0908, roughness: 0.55, metalness: 0.05, specularIntensity: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.16 });
    const floor = new THREE.Mesh(floorGeo, floorMat); floor.receiveShadow = true; floor.name = "stage-floor"; sc.add(floor);
    // 舞台の前の縁と客席の床 (舞台より 0.9 m 低い)
    const lip = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.9, 0.06), new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 0.7 }));
    lip.position.set(0, -0.45, -1.83); sc.add(lip);
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 0.95 }));
    pit.rotation.x = -Math.PI / 2; pit.position.set(0, -0.9, -21.8); sc.add(pit);
    // 奥の反響板 (暗い木の壁)
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, 7.5, 48, 1, true, -1.25, 2.5),
      new THREE.MeshStandardMaterial({ color: 0x0b0806, roughness: 0.92, metalness: 0.0, side: THREE.BackSide }));
    wall.position.set(0, 3.7, -0.9); wall.name = "shell"; sc.add(wall);
  }

  /* ─────────── 動かない物: 椅子・譜面台・譜面・ひな壇・指揮台・ティンパニ ─────────── */
  _buildStatic() {
    const furn = [], metal = [], heads = [], sheets = [];
    const M = (pos, yaw) => new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(UP, yaw), V(1, 1, 1));
    for (const s of this.seats) {
      if (s.kind === "chair") for (const g of chairPieces({ seatTop: SEAT_TOP })) furn.push(g.applyMatrix4(M(s.pos, strings.chairYaw?.(s) ?? s.yaw)));
      if (s.kind === "stool") for (const g of stoolPieces({ seatTop: STOOL_TOP })) furn.push(g.applyMatrix4(M(s.pos, s.yaw)));
    }
    for (const st of this.layout.stands) {
      const sp = standPieces({ h: st.sheetY - st.floorY, tilt: st.tilt ?? 0.62, w: st.id === "conductor" ? 0.62 : 0.5, deskH: 0.33 });
      const m = M(st.pos.clone().setY(st.floorY), st.yaw);
      for (const g of sp.pieces) furn.push(g.applyMatrix4(m));
      const page = place(new THREE.PlaneGeometry(sp.sheet.w, sp.sheet.h), { pos: sp.sheet.pos, quat: sp.sheet.quat });
      sheets.push(page.applyMatrix4(m));
      st.sheetCentre = sp.sheet.pos.clone().applyMatrix4(m);
    }
    // ひな壇 (扇形の箱)
    for (const r of this.layout.risers) {
      const sh = new THREE.Shape(), a0 = r.a0 * Math.PI / 180, a1 = r.a1 * Math.PI / 180, n = 24;
      const pt = (rad, a) => [-rad * Math.sin(a), -rad * Math.cos(a)];   // 形の (u, v) = (x, -z)
      sh.moveTo(...pt(r.r0, a0));
      for (let i = 0; i <= n; i++) sh.lineTo(...pt(r.r1, a0 + (a1 - a0) * i / n));
      for (let i = n; i >= 0; i--) sh.lineTo(...pt(r.r0, a0 + (a1 - a0) * i / n));
      const g = new THREE.ExtrudeGeometry(sh, { depth: r.top, bevelEnabled: false, curveSegments: 1 }); g.rotateX(-Math.PI / 2);
      furn.push(place(g, { color: 0x161618 }));
      // 前の縁に細い明るい線 (ひな壇の境目が見えるように)
      const edge = [];
      for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; edge.push(V(-(r.r0 - 0.004) * Math.sin(a), r.top - 0.012, (r.r0 - 0.004) * Math.cos(a))); }
      furn.push(place(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 48, 0.008, 4, false), { color: 0x3a3630 }));
    }
    const pod = podiumPieces();
    furn.push(...pod.dark); metal.push(...pod.metal);
    for (const d of this.drums) {
      const t = timpaniPieces({ R: d.R, H: d.H }), m = M(d.pos, d.yaw);
      for (const g of t.metal) metal.push(g.applyMatrix4(m));
      for (const g of t.dark) furn.push(g.applyMatrix4(m));
      heads.push(t.head.applyMatrix4(m));
      d.headY = d.pos.y + d.H;
    }
    const add = (geos, mat, name, cast) => { const mesh = new THREE.Mesh(merge(geos), mat); mesh.name = name; mesh.castShadow = cast; mesh.receiveShadow = true; this.scene.add(mesh); return mesh; };
    add(furn, IM.furniture, "static.furniture", true);
    add(metal, IM.metal, "static.metal", true);
    const headMat = IM.drumHead.clone();
    if (!this.headless) headMat.map = drumHeadTexture();
    add(heads, headMat, "static.drumheads", false);
    const sheetMat = IM.sheet.clone();
    if (!this.headless) { sheetMat.map = sheetTexture(); sheetMat.emissiveMap = sheetMat.map; }
    add(sheets, sheetMat, "static.sheets", false);
  }

  /* ─────────── 座る・立つ (家族の部品が姿勢を決める前の形) ─────────── */
  _basePose() {
    for (const s of this.seats) {
      restPose(s.rig);
      if (s.kind === "chair" || s.kind === "stool") sit(s.rig, s);
      else stand(s.rig, s.pos, s.yaw, s.floorY);
      for (const side of SIDES) setFingers(s.rig, side, [0.4, 0.5, 0.5, 0.5, 0.5], [0.6, 0, 0, 0, 0]);
    }
    // 楽器は床に置いておく (家族の部品が持たないとき)
    for (const h of this.instruments.handles) {
      const s = h.owner; h.floorY = s?.floorY ?? 0;
      h.root.position.copy(s ? s.pos.clone().add(V(0.3, 0.02, 0)) : V(0, -5, 0)); h.root.quaternion.identity();
    }
  }

  /* ─────────── 曲 ─────────── */
  setSong(song) {
    this.song = song;
    const fast = tempoTable(song);
    this.toSec = fast.toSec; this.toBeat = fast.toBeat;
    const T = this.toSec;
    // 拍から秒にした写し (曲の物はそのまま。t0 = 始まりの秒、t1 = 終わりの秒)
    this.bars = (song.bars ?? []).map((b) => ({ ...b, t0: T(b.s), t1: T(b.s + b.len) }));
    this.fermatas = (song.fermatas ?? []).map((f) => ({ ...f, t0: T(f.s), t1: T(f.s + f.d) }));
    this.focus = (song.focus ?? []).map((f) => ({ ...f, t0: T(f.s), t1: T(f.e) })).sort((a, b) => a.t0 - b.t0);
    this.checks = []; this.errors = [];
    this._basePose();
    const specs = new Map((song.players ?? []).map((p) => [p.id, p]));
    this.players = PLAYER_IDS.map((id) => {
      const spec = specs.get(id) ?? { id, ...DEFAULT_PLAYERS[id], notes: [] };
      return { id, spec, notes: notesInSec(spec.notes, T), seats: this.layout.byPlayer[id] ?? [] };
    });
    const unknown = [...specs.keys()].filter((id) => !PLAYER_IDS.includes(id));
    if (unknown.length) this.errors.push({ where: "setSong", error: "unknown players: " + unknown.join(",") });
    this.endSec = Math.max(0, ...this.players.flatMap((p) => p.notes.map((n) => n.t1)), ...this.bars.map((b) => b.t1));
    const all = [...this.players, { id: "conductor", spec: { id: "conductor", family: "conductor", instrument: "baton", notes: [] }, notes: [], seats: [this.conductor] }];
    this.controllers = [];
    for (const p of all) {
      const fam = FAMILY[p.spec.family ?? DEFAULT_PLAYERS[p.id]?.family ?? "conductor"];
      try {
        const c = fam.createPlayers(this, p.spec, p.seats);
        c.id = p.id; c.plan(p.notes); this.controllers.push(c);
      } catch (e) { this.errors.push({ where: p.id + ".plan", error: String(e?.stack ?? e) }); }
    }
    this._planCuts();
    this._planBrass();
    this.sec = 0; this.beat = 0;
    this.update(0, this.toSec, 0, false);
  }
  // 確かめの登録 (players/base.js の先頭に書いた形)
  addCheck(check) { if (!check?.id || typeof check.measure !== "function") throw new Error("check needs id and measure"); this.checks.push(check); return check; }
  get helpers() { return base; }

  /* ─────────── 毎コマ ─────────── */
  update(beat, toSec = this.toSec, dt = 0, playing = false) {
    const t0 = now();
    const sec = toSec ? toSec(beat) : 0;
    this.t += dt; this.beat = beat; this.sec = sec; this.playing = playing;
    for (const c of this.controllers) {
      if (c.broken) continue;
      try { c.pose(sec, dt); } catch (e) { c.broken = true; this.errors.push({ where: c.id + ".pose", sec, error: String(e?.stack ?? e) }); }
    }
    for (const r of this.rigs) updateRig(r);
    this.crowd.update();
    this.instruments.update();
    this._updateCameras(sec, dt);
    this.lastUpdateMs = now() - t0;
    this.needsRender = true;
  }

  /* ─────────── カメラ ─────────── */
  setView(name) {
    const v = VIEWS[name]; if (!v) throw new Error("unknown view " + name);
    this.view = name;
    const o = this.orbit; o.frame = name !== "conductor";
    o.target.set(...v.target); o.theta = v.theta; o.phi = v.phi; o.radius = v.radius; o.auto = !!v.auto; o.base = { theta: v.theta, phi: v.phi };
    this.camMain.fov = v.fov; this.camMain.updateProjectionMatrix();
  }
  setClose(name) {
    if (!CLOSE_SHOTS.includes(name)) throw new Error("unknown close-up " + name);
    this.closeMode = name;
  }
  setLayout(mode) { this.layoutMode = mode; this._resize(); }
  // 寄りの画面の位置 (席の位置から計算。舞台は動かないので最初に 1 回)
  _closeShots() {
    const L = this.layout, by = L.byPlayer;
    const pick = (ids, f = () => true) => ids.flatMap((id) => (by[id] ?? []).filter(f));
    const centre = (list, dy) => { const c = V(0, 0, 0); for (const s of list) c.add(s.pos.clone().setY(s.floorY + dy)); return c.divideScalar(Math.max(1, list.length)); };
    // 主役の正面 (指揮台の方) から、奏者の左へ angle 度回した向きに dist 離れ、床から h の高さ。譜面台の上から見下ろす
    const front = (S, { angle = 0, dist = 2, h = 1.7, fov = 32, drift = 0.08 } = {}, floorY = 0) => {
      const f = V(-S.x, 0, -S.z).normalize(), left = V(f.z, 0, -f.x), a = angle * Math.PI / 180;
      const d = f.multiplyScalar(Math.cos(a)).addScaledVector(left, Math.sin(a));
      const pos = S.clone().addScaledVector(d, dist).setY(floorY + h);
      return { pos, look: S.clone(), fov, side: new THREE.Vector3().crossVectors(d, UP).normalize(), amp: drift };
    };
    const at = (pos, look, fov, drift = 0.14) => { const d = V(...pos).sub(V(...look)).setY(0).normalize(); return { pos: V(...pos), look: V(...look), fov, side: new THREE.Vector3().crossVectors(d, UP).normalize(), amp: drift }; };
    const timp = pick(["timp"])[0], tf = timp.forward;
    // 主役の頭・手・楽器の動く範囲。画面の形が変わっても端に余白を残す
    const frame = (list, whole = false) => list.flatMap((s) => {
      if (!whole && s.instrumentKind === "horn") return HORN_FRAME.map((p) => s.pos.clone().add(V(...p).applyAxisAngle(UP, s.yaw)));
      const [lo, hi] = FRAME_BOUNDS[s.instrumentKind][whole ? 0 : 1], points = [];
      for (const dx of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
        points.push(s.pos.clone().add(V(dx, y, z).applyAxisAngle(UP, s.yaw)));
      }
      return points;
    });
    this._mainFrame = frame(this.seats, true);
    const sh = (ids, dy, opt, f) => { const list = pick(ids, f); return { ...front(centre(list, dy), opt, list[0].floorY), frame: frame(list) }; };
    // フルート2人と木管首席の寄り。上から見下ろし、後列の楽器が頭の後ろを横切らないようにする
    // (横からや低い所からだと、0.8 m 後ろのファゴットが主役の頭と肩の後ろを斜めに横切った)。楽器の先まで入るよう見る所は低め (床から 0.75〜0.78 m)、
    // 携帯の横長の寄りでも楽器の先が切れないよう縦の画角は 0.95 倍より狭めない。狭い画面なので流れは小さく (6〜8 cm)。
    // 縦長の画面 (全画面の右) では縦を 1.2 倍まで (gmax): 広げると主役の頭の上に後ろの列の人とファゴットが入った (ファゴットの寄りは楽器が長いので広げる)
    const solo = (ids, dy, opt, gmax) => ({ ...sh(ids, dy, opt), vmin: 0.95, gmax });
    return {
      // 角度・距離・高さは、主役の頭・胸・両手が手前の人や譜面台に隠れない所を光線で探して決めた (横に流れた両端でも見える)
      violins: sh(["vn1"], 0.98, { angle: 0, dist: 2.0, h: 3.364, fov: 24 }, (s) => s.desk === 0),
      violas: sh(["va"], 1.0, { angle: 65, dist: 2.0, h: 8.464, fov: 22, drift: 0.04 }, (s) => s.desk === 0),
      cellos: sh(["vc"], 0.82, { angle: 85, dist: 2.0, h: 5.109, fov: 32, drift: 0.04 }, (s) => s.desk === 0),
      basses: sh(["cb"], 1.05, { angle: 180, dist: 2.0, h: 3.434, fov: 36, drift: 0.04 }),   // コントラバスは外側から見て、手前の弦を避ける
      strings: sh(["vn1", "vn2"], 0.9, { angle: 0, dist: 2.0, h: 5.189, fov: 38, drift: 0.04 }, (s) => s.row < 2),
      lowstrings: sh(["vc", "cb"], 0.95, { angle: 130, dist: 2.0, h: 2.350, fov: 38, drift: 0.04 }),
      // 2 人を入れていた前の画面では、9 人の頭が入り、ファゴット 2 本が主役のすぐ後ろを横切っていた (オーボエのカデンツァ 268 小節は 1 番だけが吹く)
      flute: solo(["fl1", "fl2"], 0.78, { angle: 0, dist: 2.0, h: 8.244, fov: 27, drift: 0.04 }, 1.2),
      oboe: solo(["ob1"], 0.75, { angle: 0, dist: 2.0, h: 8.214, fov: 27, drift: 0.04 }, 1.2),
      frontwinds: solo(["fl1", "ob1"], 0.78, { angle: 0, dist: 2.0, h: 8.244, fov: 26, drift: 0.04 }),
      // 後ろの列: 前の列 (フルート・オーボエ) の頭の上を越えて見る (低いとクラリネットの先がフルートの人に隠れた)
      clarinet: solo(["cl1"], 0.78, { angle: -85, dist: 2.0, h: 8.244, fov: 28, drift: 0.04 }, 1.2),   // 高い横から、前列の椅子を越えて楽器の先を見る
      bassoon: { ...solo(["bn1"], 0.78, { angle: 0, dist: 2.0, h: 5.069, fov: 27, drift: 0.06 }), vmin: 1.15 },   // 楽器が長いので、横長の寄りでも縦を 1.15 倍まで残す
      backwinds: solo(["cl1", "bn1"], 0.78, { angle: -85, dist: 2.0, h: 8.244, fov: 28, drift: 0.08 }),
      woodwinds: sh(["fl1", "fl2", "ob1", "ob2", "cl1", "cl2", "bn1", "bn2"], 1.0, { angle: 25, dist: 2.0, h: 3.384, fov: 36 }),
      horns: { ...sh(["hn1", "hn2"], 1.0, { angle: 65, dist: 2.0, h: 1.933, fov: 50, drift: 0.02 }),
        wide: sh(["hn1", "hn2"], 1.0, { angle: 20, dist: 2.0, h: 5.289, fov: 10, drift: 0.02 }) },
      trumpets: sh(["tp1", "tp2"], 1.05, { angle: 45, dist: 2.0, h: 8.514, fov: 30, drift: 0.04 }),
      // 金管 (brass) の画面は持たない: ホルンとトランペットは舞台の左右の端にいて 1 つの画面に入らないので、_planBrass が吹いている方の画面を選ぶ
      // ティンパニ: 横後ろから見て、太鼓より手前に木管が入らないようにする
      // 見下ろすので頭から太鼓までが縦に長い。携帯の横長の寄りでも頭と太鼓が両方入るよう、縦の画角は 0.85 倍より狭めない (vmin)
      // 縦長の画面 (全画面の右) では縦を 1.2 倍までしか広げない: 1.67 倍だと画面の下の両すみに、太鼓のすぐ手前のクラリネットとファゴットの後ろ頭が大きく入った
      timpani: { ...front(timp.pos.clone().addScaledVector(tf, 0.4).setY(timp.floorY + 1.08), { angle: 105, dist: 2.0, h: 3.464, fov: 36, drift: 0.04 }, timp.floorY), vmin: 0.85, gmax: 1.2,
        frame: [...frame([timp]), ...timp.drums.flatMap((d) => {
          const points = []; for (let i = 0; i < 16; i++) for (const y of [0.25, d.H + 0.04]) points.push(d.pos.clone().add(V((d.R + 0.03) * Math.cos(i * Math.PI / 8), y, (d.R + 0.03) * Math.sin(i * Math.PI / 8)))); return points;
        })] },
      conductor: { ...at([0, 3.784, 2.0], [0, 1.4, 0], 30, 0.04), frame: frame([this.conductor]) },
      tutti: { ...at([4.9, 6.8, -3.0], [-0.6, 1.0, 3.4], 40, 0.04), frame: this._mainFrame },
    };
  }
  // focus の区間から、カットの予定 (6 秒以上あける・短い大事な区間を優先) を作る
  _planCuts() {
    const cuts = [];
    for (const f of this.focus) {
      const shot = FOCUS_SHOT[f.group] ?? "tutti", pri = f.fixed ? 10 : SHOT_PRIORITY[shot] ?? 1;   // fixed = 楽譜の担当が「必ずここで」と決めた所
      const want = Math.max(0, f.t0 - 0.25), last = cuts[cuts.length - 1];
      if (last?.shot === shot) continue;
      if (!last || want >= last.sec + CUT_MIN_SEC) { cuts.push({ sec: want, shot, pri }); continue; }
      if (f.t1 >= last.sec + CUT_MIN_SEC + 2 && pri <= last.pri) { cuts.push({ sec: last.sec + CUT_MIN_SEC, shot, pri }); continue; }
      const prev2 = cuts[cuts.length - 2];
      if (pri > last.pri && (!prev2 || want >= prev2.sec + CUT_MIN_SEC) && prev2?.shot !== shot) { cuts.pop(); cuts.push({ sec: want, shot, pri }); }
    }
    if (!cuts.length) cuts.push({ sec: 0, shot: "conductor", pri: 3 }, { sec: 8, shot: "tutti", pri: 1 });
    // song.cutList = 拍まで決めたカットの列。その最初の拍から先は自動の予定を捨て、この順に切る (6 秒あける決まりも外す)
    const list = (this.song.cutList ?? []).map((c) => ({ ...c, sec: this.toSec(c.s) - 0.04, pri: 10, list: true }));
    const head = list.length ? cuts.filter((c) => c.sec < list[0].sec - CUT_MIN_SEC) : cuts;
    this.cuts = this._addTight([...head, ...list]);
    this.cuts[0].sec = -Infinity;
  }
  // 見せ場の物差し: id の人が t0〜t1 にどれだけ「目立って弾いているか」。
  //   loud = 音の強さの平均 (0〜1)、rate = 1 秒の音の数、share = その間に鳴っている音の量 (長さ × 強さ²) の全員の中の割合、
  //   rel = 鳴っている人の平均と比べた量 (1 = みんなと同じ)。ティンパニは続けて打つ所 (どどどど・ロール) を、弦は速く動く所を、管は出ている所を高く数える
  showcase(id, t0, t1) {
    const span = t1 - t0, E = {};
    for (const p of this.players) {
      let e = 0;
      for (const n of p.notes) { if (n.t1 <= t0) continue; if (n.t0 >= t1) break; const w = (n.v ?? 80) / 127; e += (Math.min(n.t1, t1) - Math.max(n.t0, t0)) * w * w * (n.art === "short" ? 0.6 : 1); }
      if (e > 0) E[p.id] = e;
    }
    const mine = (this.players.find((p) => p.id === id)?.notes ?? []).filter((n) => n.t0 >= t0 && n.t0 < t1);
    if (!mine.length || !E[id]) return { score: 0 };
    const all = Object.values(E), sum = all.reduce((a, b) => a + b, 0), mean = sum / all.length;
    const loud = mine.reduce((a, n) => a + (n.v ?? 80), 0) / mine.length / 127, rate = mine.length / span, share = E[id] / sum, rel = E[id] / mean;
    let roll = 0;   // ティンパニ: 0.3 秒以内の間で続けて打つ音の数 (ロールは 1 音を 8 打ぶんと数える)
    if (id === "timp") for (let i = 0; i < mine.length; i++) roll += mine[i].art === "roll" ? 8 : (i && mine[i].t0 - mine[i - 1].t0 < 0.3 ? 1 : 0);
    const kind = id === "timp" ? "timp" : /^(vn|va|vc|cb)/.test(id) ? "str" : "wind";
    const act = kind === "timp" ? Math.min(2, roll / 10) : kind === "str" ? Math.min(1.5, rate / 4) : Math.min(1, E[id] / (span * 0.35)) * Math.min(1, mine.length / 3);   // 管: 1 つの音を長くのばすだけの所は低く
    // ティンパニは音が短いので量 (rel) では小さく出る。続けて打つ数だけで数える
    const score = loud * loud * act * (kind === "timp" ? 1.6 : Math.min(2, rel)) * (kind === "wind" ? 1 + 2 * share : 1);
    return { score, loud, rate, share, rel, ...(kind === "timp" ? { roll } : {}), players: all.length };
  }
  // 引きの画面 (全奏・弦・木管) が 13 秒以上続く所に、1 人に寄った画面 (shortShots と同じ絵) を 6 秒だけはさむ。1 つの引きに 1 回まで。
  // 入る所と戻る所は小節の頭。寄る時刻と人は、その引きの中で見せ場の物差し (showcase) がいちばん高い所 (10-30 さとるん「その人がいい感じに演奏してるところ」
  // 「ティンパニーのどどどどのところはそこを映す」)。同じ人に寄るほど選ばれにくく、その引きの楽器の人は少し選ばれやすい。
  // 指揮者は音が無いので、目立つ人がいないとき (どの人も 0.7 未満) に選ぶ
  _addTight(cuts) {
    // 全奏の引きからはオーボエに寄らない (フルートと同じ和音を吹くことが多く、オーボエの寄りは後ろのファゴットと譜面台が重なる。10-30 に並べて見た)
    const POOL = { tutti: ["timp", "vn1", "va", "vc", "cb", "hn1", "tp1", "fl1"], strings: ["vn1", "va", "vc", "cb", "timp", "hn1"], lowstrings: ["vc", "cb", "timp"], woodwinds: ["fl1", "ob1", "hn1", "timp"] };   // クラリネットとファゴットは、どの向きでもティンパニの太鼓が手前に大きく入るので寄らない
    const HOME = { tutti: [], strings: ["vn1", "va", "vc", "cb"], lowstrings: ["vc", "cb"], woodwinds: ["fl1", "ob1"] };
    const SHOT = { conductor: "conductor", timp: "timpani", vn1: "violins", va: "violas", vc: "cellos", cb: "basses", hn1: "horns", tp1: "trumpets", fl1: "flute", ob1: "oboe" };
    const LEN = 6, heads = this.bars.map((b) => b.t0);
    const snap = (t, lo, hi) => { let best = null; for (const h of heads) if (h >= lo && h <= hi && (best == null || Math.abs(h - t) < Math.abs(best - t))) best = h; return best; };
    const count = (id, t0, t1) => (this.players.find((p) => p.id === id)?.notes ?? []).filter((n) => n.t0 >= t0 && n.t0 < t1).length;
    // 指のアップ: 弦の首席が 6 秒に 12 音以上 (指がよく動く所) を弾くとき。続けては入れず、曲に 5 回まで。最初の寄りは人を見せる (lastHand = true で始める)。
    // 管は指を近くから撮ると譜面台や隣の人の腕が手前に入るので入れない (10-30 にフルート・オーボエ・トランペットで撮って決めた)
    const HANDS = new Set(["vn1", "va", "vc", "cb"]);
    // 1) 引きごとに、寄る時刻と人の候補を出す。時刻は引きの始まり (見せ場が引きに切りかわる所から始まるとき) と、6.5 秒あとからの小節の頭
    const segs = [];
    for (let i = 0; i < cuts.length; i++) {
      const c = cuts[i], start = Math.max(0, c.sec), end = cuts[i + 1]?.sec ?? this.endSec;
      if (c.list || !POOL[c.shot] || end - start < 13) continue;
      const cands = [];
      for (const t of [...(isFinite(c.sec) && !cuts[i - 1]?.tight ? [start] : []), ...heads.filter((t) => t >= start + 6.5)]) {
        if (t > end - LEN || (end - t - LEN < 6 && end - t - LEN > 1.5)) continue;   // 戻る引きが 6 秒に足りないなら、次のカットの直前まで寄ったまま
        for (const id of POOL[c.shot]) { const h = this.showcase(id, t, t + LEN); if (h.score > 0) cands.push({ id, t, raw: h.score * (HOME[c.shot].includes(id) ? 1.15 : 1) }); }
      }
      segs.push({ i, start, end, cands, pick: null });
    }
    // 2) 曲の全部で、見せ場の高い順に 1 つの引きに 1 つずつ決める。同じ人は 2 回目から少しずつ選ばれにくく。
    //    どの人も 0.7 に届かない引きは、指揮者 (引きの真ん中より少し前)
    const used = {};
    for (;;) {
      let best = null;
      for (const g of segs) if (!g.pick) for (const k of g.cands) { const s = k.raw / (1 + 0.35 * (used[k.id] ?? 0)); if (k.raw >= 0.7 && (!best || s > best.s)) best = { g, k, s }; }
      if (!best) break;
      best.g.pick = best.k; used[best.k.id] = (used[best.k.id] ?? 0) + 1;
    }
    for (const g of segs) if (!g.pick) { const t = snap(g.start + Math.max(7, 0.45 * (g.end - g.start - LEN)), g.start + 6.5, g.end - LEN); if (t != null) g.pick = { id: "conductor", t, raw: 0 }; }
    // 3) 時刻の順に並べる。指のアップ: 弦の首席が 6 秒に 12 音以上 (指がよく動く所) を弾くとき。前の指のアップから 45 秒あけ、曲に 5 回まで。最初の寄りは人を見せる。
    //    管は指を近くから撮ると譜面台や隣の人の腕が手前に入るので入れない (10-30 にフルート・オーボエ・トランペットで撮って決めた)
    let first = true, lastHandSec = -Infinity, hands = 0;
    const out = [], bySeg = new Map(segs.map((g) => [g.i, g]));
    this.tightPicks = [];
    for (let i = 0; i < cuts.length; i++) {
      const c = cuts[i], g = bySeg.get(i);
      if (!g?.pick) { out.push(c); continue; }
      const { id, t } = g.pick;
      if (t > g.start) out.push(c);
      const hand = HANDS.has(id) && !first && t - lastHandSec >= 45 && hands < 5 && count(id, t, t + LEN) >= 12;
      out.push({ sec: t, shot: SHOT[id], pri: c.pri, tight: true, ...(hand ? { hand: id } : id === "timp" && this.handShots.timp ? { hand: "timp" } : {}) });
      this.tightPicks.push({ sec: t, id, score: g.pick.raw, hand });
      first = false; if (hand) { hands++; lastHandSec = t; }
      const back = snap(t + LEN, t + LEN, t + LEN + 1.5);
      if (back != null && g.end - back >= 6) out.push({ sec: back, shot: c.shot, pri: c.pri });
    }
    return out;
  }
  // 金管のボタン: これから 4 秒に多く吹く方 (ホルン / トランペット) の画面へカットで切り替える。切り替えは 6 秒以上あけ、
  // 今の方より 1.5 倍以上多く吹くときだけ移る (両方が吹く所で行ったり来たりしない)。曲が無いときはホルン
  _planBrass() {
    const step = 0.25, n = Math.ceil((this.endSec + 8) / step) + 1, groups = { horns: ["hn1", "hn2"], trumpets: ["tp1", "tp2"] };
    const sum = {};   // 群ごとの「鳴っている秒」の累積 (step ごと)
    for (const [g, ids] of Object.entries(groups)) {
      const a = new Float64Array(n + 1);
      for (const p of this.players ?? []) if (ids.includes(p.id)) for (const nt of p.notes) for (let k = Math.max(0, Math.floor(nt.t0 / step)); k <= Math.min(n - 1, Math.floor(nt.t1 / step)); k++) a[k + 1] += Math.max(0, Math.min(nt.t1, (k + 1) * step) - Math.max(nt.t0, k * step));
      for (let k = 1; k <= n; k++) a[k] += a[k - 1];
      sum[g] = a;
    }
    const busy = (g, t) => { const a = sum[g], k0 = clamp(Math.floor((t - 0.5) / step), 0, n), k1 = clamp(Math.floor((t + 4) / step), 0, n); return a[k1] - a[k0]; };
    const cuts = [{ sec: -Infinity, shot: busy("trumpets", 0) > 1.5 * busy("horns", 0) + 0.25 ? "trumpets" : "horns" }];
    for (let k = 0; k * step <= this.endSec; k++) {
      const t = k * step, last = cuts[cuts.length - 1], other = last.shot === "horns" ? "trumpets" : "horns";
      if (t >= last.sec + CUT_MIN_SEC && busy(other, t) > 1.5 * busy(last.shot, t) + 0.25) cuts.push({ sec: t, shot: other });
    }
    this.brassCuts = cuts;
  }
  brassAt(sec) { const c = this.brassCuts ?? [{ sec: -Infinity, shot: "horns" }]; let lo = 0, hi = c.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m].sec <= sec) lo = m; else hi = m - 1; } return c[lo].shot; }
  cutAt(sec) { const c = this.cuts; let lo = 0, hi = c.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m].sec <= sec) lo = m; else hi = m - 1; } return c[lo]; }
  // 決まった範囲の中央へ移り、収まる距離に合わせる。音ごとに拡大率を変えない
  // xs: 横の広さを何倍に見なすか (1 より大きいと、範囲の左右がはみ出してよい)
  _fitCamera(cam, points, margin = 0.9, look = null, xs = 1) {
    if (!points?.length) return;
    cam.updateMatrixWorld(true);
    const h = this.shotMode === "main" || this.shotMode === "close" ? this.h : (cam === this.camMain ? this.rects.main[3] : this.rects.close[3]);
    const m = cam.matrixWorld.elements, tangent = Math.tan(cam.fov * Math.PI / 360), tanX = tangent * margin * cam.aspect * xs;
    // 上の曲名・名前と、下のボタンの高さを空ける
    const tanY = tangent * Math.min(margin, Math.max(0.22, 1 - 64 / h)), tanBottom = tanY;
    let lx = -Infinity, ux = Infinity, ly = -Infinity, uy = Infinity, near = -Infinity;
    for (const p of points) {
      const x = p.x - cam.position.x, y = p.y - cam.position.y, z = p.z - cam.position.z;
      const cx = x * m[0] + y * m[1] + z * m[2], cy = x * m[4] + y * m[5] + z * m[6], depth = -(x * m[8] + y * m[9] + z * m[10]);
      lx = Math.max(lx, cx - tanX * depth); ux = Math.min(ux, cx + tanX * depth);
      ly = Math.max(ly, cy - tanY * depth); uy = Math.min(uy, cy + tanBottom * depth);
      near = Math.max(near, cam.near * 2 - depth);
    }
    const pull = Math.max(near, (lx - ux) / (2 * tanX), (ly - uy) / (tanY + tanBottom));
    const dx = (lx + ux) / 2, dy = (ly + uy + (tanBottom - tanY) * pull) / 2;
    const x = m[0] * dx + m[4] * dy, y = m[1] * dx + m[5] * dy, z = m[2] * dx + m[6] * dy;
    cam.position.x += x + m[8] * pull; cam.position.y += y + m[9] * pull; cam.position.z += z + m[10] * pull;
    if (look) { look.x += x; look.y += y; look.z += z; }
  }
  _updateCameras(sec, dt) {
    // 全体: ゆっくり行き来 (1 秒に 0.011 rad まで)
    const o = this.orbit;
    if (o.auto && o.base) { const t = this._shotFrozen ? 0 : this.t; o.theta = o.base.theta + 0.3 * Math.sin(t * 0.035); o.phi = o.base.phi + 0.02 * Math.sin(t * 0.027); }
    // 携帯の縦長の正面は、高い斜めから舞台の奥行きも見せる
    if (this.view === "front" && o.frame) {
      const tall = this.w < 700 && this.h > this.w ? clamp((1.25 - this.camMain.aspect) / 0.45, 0, 1) : 0;
      o.phi = VIEWS.front.phi + (0.45 - VIEWS.front.phi) * tall; o.theta = VIEWS.front.theta + 0.6 * tall;
    }
    const dir = (this._dir ??= V(0, 0, 0)).set(Math.sin(o.phi) * Math.sin(o.theta), Math.cos(o.phi), Math.sin(o.phi) * Math.cos(o.theta));
    // 横に長い画面 (上下に分けたとき) では少し寄る (舞台が小さくならないように)。手で回し始めても同じ (距離が跳ばないように)
    const fit = clamp(1.7 / Math.max(0.5, this.camMain.aspect), 0.66, 1);
    this.camMain.position.copy(o.target).addScaledVector(dir, o.radius * (this.view === "top" || this.view === "conductor" ? 1 : fit));
    this.camMain.up.set(0, 1, 0);
    if (o.phi < 0.2) this.camMain.up.set(0, 0, 1);   // 真上から: 画面の上を舞台の奥に
    this.camMain.lookAt(o.target);
    const mainLook = this._mainLook ??= V(0, 0, 0); mainLook.copy(o.target);
    if (o.frame) this._fitCamera(this.camMain, this._mainFrame, 0.94, mainLook);
    // 寄り: auto はカットの予定から。中では 1 秒に 8 cm 未満でゆっくり横に流れる
    if (this.closeMode === "manual") { this.camClose.position.copy(this._closePos); this.camClose.lookAt(this._closeLook); return; }
    const cut = this.closeMode === "auto" ? this.cutAt(sec) : null, name = cut ? cut.shot : this.closeMode;
    let sh = this.shots[name === "brass" ? this.brassAt(sec) : name] ?? this.shots.tutti;
    const short = this._shortClose();
    if (short) sh = this.shortShots[name === "brass" ? this.brassAt(sec) : name] ?? this.shortShots.tutti;
    else if (cut?.tight) sh = this.tightShots[name] ?? sh;
    // ホルンは縦長で近い斜め、横長では前景を避ける高い正面寄り
    if (sh.wide && this.camClose.aspect >= 1.3) sh = sh.wide;
    this.closeShot = name;
    this.closeFrame = sh.frame;
    this.closeSubjects = short ? sh.subjects : null;
    if (!short && cut?.hand && this.handShots[cut.hand]) { this._handCamera(cut, dt); this.closeDriftMax = 0; return; }
    const ts = this._shotFrozen ? 0 : sec, w = 2 * Math.PI / 26;
    const drift = (this._drift ??= V(0, 0, 0)).copy(sh.side).multiplyScalar(sh.amp * Math.sin(ts * w)); drift.y += 0.03 * Math.sin(ts * 2 * Math.PI / 31);
    this._closePos.copy(sh.pos).add(drift); this._closeLook.copy(sh.look).addScaledVector(drift, 0.5);
    this.camClose.position.copy(this._closePos); this.camClose.lookAt(this._closeLook);
    // 画角: 16:9 で sh.fov になる横の広さを、ほかの形の画面でも保つ。ただし 16:9 より縦長の画面 (全画面の右の寄りなど) では
    // 縦が倍近くに広がって関係ない奏者で埋まるので、縦の広げ方 (tan の倍率) は 1.25 倍か、縦長の度合いの平方根 (横を切る倍率と同じ) まで
    // (gmax = その画面だけの縦の広げ方の上限)
    const a = Math.max(0.3, this.camClose.aspect), tall = (16 / 9) / a, grow = tall <= 1 ? tall : Math.min(sh.gmax ?? Infinity, tall, Math.max(1.25, Math.sqrt(tall)));
    const fov = Math.max(sh.fov * (sh.vmin ?? 0.62), 2 * Math.atan(Math.tan(sh.fov * Math.PI / 360) * grow) * 180 / Math.PI);
    if (Math.abs(this.camClose.fov - fov) > 0.01) { this.camClose.fov = fov; this.camClose.updateProjectionMatrix(); }
    // 寄り (tight) は、縦長の画面でも正方形の画面と同じ大きさまで寄る (横幅に合わせると何人も入って寄りに見えない)。左右ははみ出してよい
    this._fitCamera(this.camClose, sh.frame, 0.9, this._closeLook, cut?.tight && this.camClose.aspect < 1 ? 1 / this.camClose.aspect : 1);
    this._closePos.copy(this.camClose.position);
    this.closeDriftMax = sh.amp * w;   // 流れの速さの最大 (m/s)
  }

  _shortClose() { return this.layoutMode === "stack" && this.shotMode !== "main" && this.shotMode !== "close" && this.rects.close[3] <= 180; }

  /* ─────────── 画面の分け方・マウス ─────────── */
  _resize() {
    // 曲の切替で取り外されたcanvasへの遅い通知は、寸法を読まずに終える。
    if (!this.headless && !this.canvas?.parentElement) return;
    const r = this.headless ? (this.headlessViewport ?? { width: 1430, height: 900 }) : this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(64, Math.floor(r.width)), h = Math.max(64, Math.floor(r.height));
    this.renderer?.setSize(w, h, false);
    this.w = w; this.h = h; this.needsRender = true;
    if (this.layoutMode === "side" && w >= 700) { this.split = Math.round(w * 0.6); this.rects = { main: [0, 0, this.split, h], close: [this.split, 0, w - this.split, h] }; }
    else { this.split = Math.round(h * 0.58); this.rects = { main: [0, h - this.split, w, this.split], close: [0, 0, w, h - this.split] }; }
    const full = this.shotMode === "main" || this.shotMode === "close";
    this.camMain.aspect = full ? w / h : this.rects.main[2] / this.rects.main[3]; this.camMain.updateProjectionMatrix();
    this.camClose.aspect = full ? w / h : this.rects.close[2] / this.rects.close[3]; this.camClose.updateProjectionMatrix();
  }
  _bindOrbit() {
    const cv = this.canvas, o = this.orbit; let drag = null;
    const adoptFrame = () => { o.target.copy(this._mainLook); o.radius = this.camMain.position.distanceTo(o.target) / (this.view === "top" || this.view === "conductor" ? 1 : clamp(1.7 / Math.max(0.5, this.camMain.aspect), 0.66, 1)); o.frame = false; };
    const inMain = (e) => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = this.h - (e.clientY - r.top); const [rx, ry, rw, rh] = this.rects.main; return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh; };
    // 押しただけ (5 px 未満の動き) では何も変えない。動かし始めたときに、全体は自動の行き来を止め、寄りは手動にする
    cv.addEventListener("pointerdown", (e) => {
      drag = { main: inMain(e), x: e.clientX, y: e.clientY, moved: false };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", (e) => {
      if (!drag) return;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
        Object.assign(drag, { moved: true, x: e.clientX, y: e.clientY, theta: o.theta, phi: o.phi, pos: this._closePos.clone(), look: this._closeLook.clone() });
        if (drag.main) { adoptFrame(); o.auto = false; } else this.closeMode = "manual";
      }
      if (drag.main) { o.theta = drag.theta - (e.clientX - drag.x) * 0.005; o.phi = clamp(drag.phi - (e.clientY - drag.y) * 0.004, 0.1, 1.52); }
      else { const dx = -(e.clientX - drag.x) * 0.003, dy = (e.clientY - drag.y) * 0.003, side = new THREE.Vector3().subVectors(drag.look, drag.pos).cross(UP).normalize(); this._closePos.copy(drag.pos).addScaledVector(side, dx).add(V(0, dy, 0)); this._closeLook.copy(drag.look).addScaledVector(side, dx); }
      this.needsRender = true;
    });
    const up = (e) => { if (!drag) return; drag = null; try { cv.releasePointerCapture(e.pointerId); } catch {} };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (inMain(e)) { if (o.frame) adoptFrame(); o.radius = clamp(o.radius * (e.deltaY > 0 ? 1.07 : 0.93), 2.5, 28); o.auto = false; }
      else { this.closeMode = "manual"; this._closePos.sub(this._closeLook).multiplyScalar(e.deltaY > 0 ? 1.07 : 0.93).add(this._closeLook); }
      this.needsRender = true;
    }, { passive: false });
    cv.addEventListener("dblclick", (e) => { if (inMain(e)) this.setView(this.view); else this.setClose("auto"); this.needsRender = true; });
  }

  /* ─────────── 撮影 ─────────── */
  // setShot(view, close): view だけ → 全体の画面を 1 枚で。close だけ → 寄りを 1 枚で。両方 → ふつうの 2 画面。どちらも null → 元に戻す
  setShot(view = null, close = null) {
    if (view && !VIEWS[view] && CLOSE_SHOTS.includes(view)) { close = view; view = null; }
    if (view) this.setView(view);
    if (close) this.setClose(close);
    this.shotMode = view && close ? "both" : view ? "main" : close ? "close" : null;
    this._shotFrozen = !!this.shotMode;
    this._resize();
  }
  // 撮影用の決まった姿勢: その拍の 1.5 秒前から 60 fps で進めて止める
  poseAt(beat, toSec = this.toSec) {
    const sec = toSec(beat), start = Math.max(0, sec - 1.5), toBeat = this.toBeat ?? ((s) => s * 2);
    let prev = null;
    for (let k = 0; k <= 90; k++) {
      const s = start + (sec - start) * k / 90;
      this.update(k === 90 ? beat : toBeat(s), toSec, prev == null ? 1 : s - prev, true); prev = s;
    }
    return { beat, sec, close: this.closeShot };
  }
  // 曲全体を 60 fps で通し、家族の部品が登録した確かめを全部測る
  // 時間は最初の warmup コマ (JIT が温まる前) を除いて数え、除いた分の一番遅いコマは warmupWorstMs に入れる
  // clock = 時間を測る関数 (ms)。省くと壁の時計 (performance.now)。Node では CPU 時間を渡すと、ほかの処理に待たされた時間を数えない
  rehearse(song = this.song, toSec = null, { fps = 60, from = 0, to = null, maxMisses = 400, warmup = 30, clock = now, times = null } = {}) {
    if (song !== this.song) this.setSong(song);
    const T = toSec ?? this.toSec, B = this.toBeat, end = to ?? this.endSec;
    const items = [];
    for (let t = from; t <= end + 1e-9; t += 1 / fps) items.push({ sec: t, k: -1 });
    for (const c of this.checks) (c.times ?? []).forEach((t, k) => { if (t >= from && t <= end) items.push({ sec: t, k, check: c }); });
    items.sort((a, b) => a.sec - b.sec || (a.k === -1 ? -1 : 1));
    const counts = {}, misses = []; let worst = 0, total = 0, frames = 0, prev = null, warm = 0, n = 0;
    const slow = [];
    const record = (c, sec, k, r) => {
      if (!r) return;
      const e = (counts[c.id] ??= { player: c.player, checked: 0, misses: 0, worst: 0 });
      e.checked++; if (Number.isFinite(r.value)) e.worst = Math.max(e.worst, Math.abs(r.value));
      if (!r.ok) { e.misses++; if (misses.length < maxMisses) misses.push({ id: c.id, player: c.player, sec: +sec.toFixed(4), k, value: r.value, info: r.info }); }
    };
    for (const it of items) {
      if (prev === null || it.sec !== prev) {
        const t0 = clock();
        this.update(B(it.sec), T, prev === null ? 1 : it.sec - prev, true);
        const ms = clock() - t0;
        if (it.k === -1) { times?.push(ms); if (n++ < warmup) warm = Math.max(warm, ms); else { worst = Math.max(worst, ms); total += ms; frames++; if (ms > 4) slow.push(+it.sec.toFixed(3)); } }
        prev = it.sec;
      }
      if (it.check) record(it.check, it.sec, it.k, it.check.measure(it.sec, it.k));
      else for (const c of this.checks) if (c.frames) record(c, it.sec, -1, c.measure(it.sec, -1));
    }
    return { counts, misses, worstUpdateMs: worst, meanUpdateMs: total / Math.max(1, frames), warmupWorstMs: warm, slowFrames: slow.length, slowAt: slow.slice(0, 10), frames, checks: this.checks.length, errors: this.errors.slice() };
  }
  // 描く量 (1 コマぶん: 画面 2 つ + 影 1 回)。measured はブラウザで本当に描いたときの数
  stats() {
    let calls = 0, tris = 0, casters = 0, casterTris = 0, instances = 0;
    this.scene.traverseVisible((o) => {
      if (!o.isMesh) return;
      const n = o.isInstancedMesh ? o.count : 1, t = triangles(o.geometry) * n;
      calls++; tris += t; if (o.isInstancedMesh) instances += n;
      if (o.castShadow) { casters++; casterTris += t; }
    });
    let shadowLights = 0; this.scene.traverse((o) => { if (o.isLight && o.castShadow) shadowLights++; });
    const views = this.shotMode === "main" || this.shotMode === "close" ? 1 : 2;
    return { calls: calls * views + casters * shadowLights, triangles: tris * views + casterTris * shadowLights, perView: { calls, triangles: tris },
      shadowCasters: casters, shadowLights, instances, robots: this.rigs.length, measured: this._info ?? null, lastUpdateMs: this.lastUpdateMs };
  }
  render() {
    if (this.headless) return;
    const r = this.renderer;
    this.needsRender = false;
    r.shadowMap.needsUpdate = true;
    r.info.autoReset = false; r.info.reset();
    if (this.shotMode === "main" || this.shotMode === "close") {
      r.setScissorTest(false); r.setViewport(0, 0, this.w, this.h);
      r.render(this.scene, this.shotMode === "main" ? this.camMain : this.camClose);
    } else {
      r.setScissorTest(true);
      const [mx, my, mw, mh] = this.rects.main; r.setViewport(mx, my, mw, mh); r.setScissor(mx, my, mw, mh); r.render(this.scene, this.camMain);
      const [cx, cy, cw, ch] = this.rects.close; r.setViewport(cx, cy, cw, ch); r.setScissor(cx, cy, cw, ch);
      const exposure = r.toneMappingExposure;
      try { if (this._shortClose()) r.toneMappingExposure = exposure * 1.25; r.render(this.scene, this.camClose); }
      finally { r.toneMappingExposure = exposure; }
      r.setScissorTest(false);
    }
    this._info = { calls: r.info.render.calls, triangles: r.info.render.triangles };
  }
}

// 拍 ⇄ 秒 (../js/state.js の beatToSec / secToBeat と同じ決まり: 点の間はテンポが直線で変わる・最初の点の前は song.tempo)。
// 区間を最初に 1 回だけ作り、毎回の計算で物を作らない (毎コマ・曲全体の確かめで何万回も呼ぶため)。state.js と同じ値になることは
// tools/orchestra/stage-headless.mjs が確かめる
export function tempoTable(song) {
  const pts = (song.tempoMap ?? []).filter((p) => Number.isFinite(p.beat) && p.tempo > 0).slice().sort((a, b) => a.beat - b.beat);
  const segs = []; let b = 0, T = song.tempo;
  for (const p of pts) { if (p.beat > b) segs.push({ b0: b, b1: p.beat, T0: T, T1: p.beat === pts[0].beat ? T : p.tempo }); b = Math.max(b, p.beat); T = p.tempo; }
  segs.push({ b0: b, b1: Infinity, T0: T, T1: T });
  let t = 0;
  for (const s of segs) {
    s.ramp = !(s.b1 === Infinity || Math.abs(s.T1 - s.T0) < 1e-6); s.k = s.ramp ? (s.T1 - s.T0) / (s.b1 - s.b0) : 0;
    s.t0 = t; s.dur = s.b1 === Infinity ? Infinity : s.ramp ? (60 / s.k) * Math.log(s.T1 / s.T0) : 60 * (s.b1 - s.b0) / s.T0; t += s.dur;
  }
  const find = (key, v) => { let lo = 0, hi = segs.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (segs[m][key] <= v) lo = m; else hi = m - 1; } return segs[lo]; };
  const toSec = (beat) => {
    if (!(beat > 0)) return 0;
    const s = find("b0", beat), len = beat - s.b0;
    if (!s.ramp) return s.t0 + 60 * len / s.T0;
    return s.t0 + (60 / s.k) * Math.log((s.T0 + s.k * len) / s.T0);
  };
  const toBeat = (sec) => {
    const s = sec > 0 ? find("t0", sec) : segs[0], dt = sec - s.t0;
    if (!s.ramp) return s.b0 + dt * s.T0 / 60;
    return s.b0 + (s.T0 / s.k) * (Math.exp(dt * s.k / 60) - 1);
  };
  return { toSec, toBeat };
}

// 譜面の紙 (左右 2 ページ・五線と音符の点)。描くのはブラウザのときだけ
// 仔牛の皮: 大きなまだら・細かい繊維・背骨の筋・ふちの濃い輪・打つ所の使い込んだ跡
function drumHeadTexture() {
  const S = 1024, cv = document.createElement("canvas"); cv.width = cv.height = S;
  const c = cv.getContext("2d");
  let seed = 4817; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  c.fillStyle = "#ead9b4"; c.fillRect(0, 0, S, S);
  const blot = (x, y, r, rgb, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); };
  for (let i = 0; i < 300; i++) blot(rnd() * S, rnd() * S, 40 + rnd() * 170, rnd() < 0.62 ? "150,112,68" : "255,244,214", 0.05 + rnd() * 0.09);
  // 繊維: 同じ向きにゆるく流れる短い線
  c.lineCap = "round";
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * S, y = rnd() * S, a = 0.35 + Math.sin(y * 0.006) * 0.3 + (rnd() - 0.5) * 0.5, L = 16 + rnd() * 54;
    c.strokeStyle = rnd() < 0.55 ? `rgba(120,86,48,${0.04 + rnd() * 0.08})` : `rgba(255,246,222,${0.03 + rnd() * 0.07})`;
    c.lineWidth = 0.7 + rnd() * 1.1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); c.stroke();
  }
  // 背骨の筋: 皮の中ほどを横切る、ぼんやり濃い帯
  for (let i = 0; i < 26; i++) { const t = i / 25, x = S * (0.08 + 0.84 * t), y = S * (0.56 - 0.17 * t + Math.sin(t * 5) * 0.015); blot(x, y, 62 + rnd() * 42, "128,92,54", 0.07); }
  // 打つ所 (手前のふちから 1/4 ほど内側): 使い込んで少し濃い
  for (let i = 0; i < 40; i++) blot(S * (0.5 + (rnd() - 0.5) * 0.3), S * (0.76 + (rnd() - 0.5) * 0.12), 26 + rnd() * 46, "92,66,40", 0.05 + rnd() * 0.05);
  // ふち: たわみの当たる輪を濃く
  const g = c.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, "rgba(96,66,38,0)"); g.addColorStop(0.72, "rgba(96,66,38,0.16)"); g.addColorStop(0.93, "rgba(70,46,26,0.46)"); g.addColorStop(1, "rgba(52,34,20,0.72)");
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

function sheetTexture() {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 256;
  const c = cv.getContext("2d");
  c.fillStyle = "#efe4c8"; c.fillRect(0, 0, 512, 256);
  c.fillStyle = "#d9cdb0"; c.fillRect(254, 0, 4, 256);
  c.strokeStyle = "#3a332a"; c.fillStyle = "#2a241d"; c.lineWidth = 1;
  for (const x0 of [16, 272]) for (let sys = 0; sys < 8; sys++) {
    const y0 = 18 + sys * 29;
    for (let l = 0; l < 5; l++) { c.beginPath(); c.moveTo(x0, y0 + l * 3.4); c.lineTo(x0 + 224, y0 + l * 3.4); c.stroke(); }
    for (let k = 0; k < 18; k++) { const x = x0 + 14 + k * 11.8, y = y0 + ((k * 7 + sys * 3) % 9) * 1.7; c.beginPath(); c.ellipse(x, y, 2.2, 1.6, -0.4, 0, Math.PI * 2); c.fill(); }
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
