// ═══════════ 舞台の配置 (アメリカ式) ═══════════
// 単位は m、y が上。客席は -z にあり +z を向いて見る。指揮台の中心が (0, 0, 0)、指揮者は +z (楽団) を向く。
// 角度は docs/ORCHESTRA.md §5 のとおり、0 度 = 指揮者の正面 (+z)、マイナス = 客席から見て左、プラス = 右。
// three.js の右手系で、客席 (-z) から +z を見ると左は +x になる。なので x = -r·sin(角度)、z = r·cos(角度)。
// (§5 の「left = −x」の書き方は、この向きの取り方と逆になっている。絵として客席から見て第 1 バイオリンが左に来る方を取った)
import * as THREE from "three";
import { PODIUM } from "./instruments.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RAD = Math.PI / 180;
export const polar = (r, deg, y = 0) => V(-r * Math.sin(deg * RAD), y, r * Math.cos(deg * RAD));
export const yawToward = (from, to = V(0, 0, 0)) => Math.atan2(to.x - from.x, to.z - from.z);

// 奏者の並び (ORCHESTRA.md §2 の id。順番 = ロボットの番号の順。指揮者は最後)
export const PLAYER_IDS = ["fl1", "fl2", "ob1", "ob2", "cl1", "cl2", "bn1", "bn2", "hn1", "hn2", "tp1", "tp2", "timp", "vn1", "vn2", "va", "vc", "cb"];
export const DEFAULT_PLAYERS = {
  fl1: { family: "woodwind", instrument: "flute" }, fl2: { family: "woodwind", instrument: "flute" },
  ob1: { family: "woodwind", instrument: "oboe" }, ob2: { family: "woodwind", instrument: "oboe" },
  cl1: { family: "woodwind", instrument: "clarinet" }, cl2: { family: "woodwind", instrument: "clarinet" },
  bn1: { family: "woodwind", instrument: "bassoon" }, bn2: { family: "woodwind", instrument: "bassoon" },
  hn1: { family: "brass", instrument: "horn" }, hn2: { family: "brass", instrument: "horn" },
  tp1: { family: "brass", instrument: "trumpet" }, tp2: { family: "brass", instrument: "trumpet" },
  timp: { family: "percussion", instrument: "timpani" },
  vn1: { family: "strings", instrument: "violin", seats: 10 }, vn2: { family: "strings", instrument: "violin", seats: 8 },
  va: { family: "strings", instrument: "viola", seats: 6 }, vc: { family: "strings", instrument: "cello", seats: 6 }, cb: { family: "strings", instrument: "bass", seats: 4 },
};
// ひな壇: 内側の半径・外側の半径・角度の範囲・高さ
export const RISERS = [
  { name: "flute-oboe", r0: 3.85, r1: 4.75, a0: -24, a1: 24, top: 0.2 },
  { name: "clarinet-bassoon", r0: 4.75, r1: 5.55, a0: -21, a1: 21, top: 0.4 },
  { name: "horns", r0: 5.12, r1: 6.08, a0: -41, a1: -22, top: 0.4 },
  { name: "trumpets", r0: 5.42, r1: 6.38, a0: 21.5, a1: 33, top: 0.6 },
  { name: "timpani", r0: 5.75, r1: 7.0, a0: -9, a1: 9, top: 0.6 },
];
export const ROWS = [2.25, 3.45, 4.65];
// 弦は列間に通路を空け、同じ譜面台の2人にも弓を動かす幅を残す
// pair = 席の弧の長さ、gap = 譜面台の間。半径と中心角を全列でそろえて決める
const STRING_SECTORS = {
  vn1: { a0: -95, a1: -65, desks: [1, 2, 2], pair: 0.95, gap: 0.85, shift: [-5, 0, -12] },
  vn2: { a0: -48, a1: -20, desks: [1, 1, 2], pair: 0.95, gap: 0.85, shift: [0, 0, -13] },
  va: { a0: 20, a1: 50, desks: [1, 1, 1], pair: 0.98, gap: 0.85, shift: [0, 0, 0] },
  vc: { a0: 75, a1: 105, desks: [1, 1, 1], pair: 1.05, gap: 0.85, shift: [5, 0, 0] },
};
const WINDS = {
  fl2: { r: 4.3, a: -15 }, fl1: { r: 4.3, a: -5 }, ob1: { r: 4.3, a: 5 }, ob2: { r: 4.3, a: 15 },
  cl2: { r: 5.1, a: -13.2 }, cl1: { r: 5.1, a: -4.4 }, bn1: { r: 5.1, a: 4.4 }, bn2: { r: 5.1, a: 13.2 },
  hn1: { r: 5.6, a: -27 }, hn2: { r: 5.6, a: -35.5 }, tp1: { r: 5.9, a: 24 }, tp2: { r: 5.9, a: 30.5 },
};
const WIND_PAIRS = [["fl2", "fl1"], ["ob1", "ob2"], ["cl2", "cl1"], ["bn1", "bn2"], ["hn2", "hn1"], ["tp1", "tp2"]];
export const SEAT_TOP = 0.46, STOOL_TOP = 0.70;
export const TIMPANI = { drums: [{ pitch: 43, R: 0.37, x: -0.4 }, { pitch: 48, R: 0.33, x: 0.36 }], H: 0.85, ahead: 0.8 };

export function riserTop(r, deg) {
  let top = 0;
  for (const s of RISERS) if (r >= s.r0 - 1e-6 && r <= s.r1 + 1e-6 && deg >= s.a0 - 1e-6 && deg <= s.a1 + 1e-6) top = Math.max(top, s.top);
  return top;
}

// 全員の席を作る。players = { id: {seats, family, instrument} } (曲の players から。無い所は DEFAULT_PLAYERS)
export function buildLayout(players = {}) {
  const seats = [], stands = [], byPlayer = {};
  const spec = (id) => ({ ...DEFAULT_PLAYERS[id], ...(players[id] ?? {}) });
  const seat = (o) => { o.robot = seats.length; seats.push(o); (byPlayer[o.player] ??= []).push(o); return o; };
  // ── 弦: 列ごとに扇の真ん中から譜面台を並べる
  for (const id of ["vn1", "vn2", "va", "vc"]) {
    const sp = STRING_SECTORS[id], s = spec(id), want = s.seats ?? DEFAULT_PLAYERS[id].seats;
    const mid0 = (sp.a0 + sp.a1) / 2, sgnOut = mid0 < 0 ? -1 : 1;   // 外側 (客席に近い側) = 角度の絶対値が大きい方
    let n = 0, desk = 0;
    ROWS.forEach((r, row) => {
      const mid = mid0 + (sp.shift?.[row] ?? 0);
      const desks = sp.desks[row], pair = Math.max(sp.pair, (sp.knee ?? 0) * r / (r - 0.45));
      for (let d = 0; d < desks && n < want; d++, desk++) {
        const centre = (d - (desks - 1) / 2) * (pair + sp.gap);          // 弧の長さ (m)
        const standPos = polar(r - (s.instrument === "cello" ? 0.68 : 0.58), mid + (centre / r) / RAD, 0);
        const st = { id: `${id}.desk${desk}`, pos: standPos, yaw: yawToward(standPos, polar(r, mid + (centre / r) / RAD)), floorY: 0, sheetY: s.instrument === "cello" ? 0.9 : 0.93, players: [] };
        stands.push(st);
        for (const part of ["outside", "inside"]) {
          if (n >= want) break;
          const off = centre + (part === "outside" ? 1 : -1) * sgnOut * pair / 2, a = mid + (off / r) / RAD;
          const pos = polar(r, a, 0);
          const o = seat({ id: `${id}.${n}`, player: id, index: n, family: s.family, instrument: s.instrument, desk, part, row, r, angle: a,
            pos, yaw: yawToward(pos), floorY: 0, seatTop: SEAT_TOP, kind: "chair", stand: st });
          st.players.push(o.id); n++;
        }
      }
    });
  }
  // ── コントラバス: チェロの後ろの半径6 mに高い椅子。楽器が左前へ張り出すので、となりとは1.05 m離す
  //    (0.62 m では、弓と右の前腕・手が、右どなりの奏者のコントラバスの胴に入っていた。1.0 m でも 951 拍で手首が 10 mm 入った)
  {
    const s = spec("cb"), want = s.seats ?? 4, r = 6.0, a0 = 50, a1 = 75, mid = (a0 + a1) / 2, step = 1.05;
    for (let n = 0; n < want; n++) {
      const off = (n - (want - 1) / 2) * step, a = mid + (off / r) / RAD, desk = Math.floor(n / 2);
      const pos = polar(r, a, 0);
      let st = stands.find((x) => x.id === `cb.desk${desk}`);
      if (!st) {
        const da = mid + (((desk * 2 + 0.5) - (want - 1) / 2) * step / r) / RAD, sp = polar(r - 0.72, da, 0);
        st = { id: `cb.desk${desk}`, pos: sp, yaw: yawToward(sp, polar(r, da)), floorY: 0, sheetY: 1.2, players: [] }; stands.push(st);
      }
      const o = seat({ id: `cb.${n}`, player: "cb", index: n, family: s.family, instrument: s.instrument, desk, part: n % 2 ? "inside" : "outside", row: 3, r, angle: a,
        pos, yaw: yawToward(pos), floorY: 0, seatTop: STOOL_TOP, kind: "stool", stand: st });
      st.players.push(o.id);
    }
  }
  // ── 管: ひな壇の上の椅子。2 人で 1 つの譜面台
  for (const [a, b] of WIND_PAIRS) {
    const pa = WINDS[a], pb = WINDS[b], r = (pa.r + pb.r) / 2, mid = (pa.a + pb.a) / 2;
    const top = riserTop(r, mid), sf = riserTop(r - 0.56, mid), sp = polar(r - (a === "hn2" ? 0.80 : 0.56), mid, sf);
    const st = { id: `${a}-${b}`, pos: sp, yaw: yawToward(sp, polar(r, mid)), floorY: sf, sheetY: top + 0.93, players: [] };
    stands.push(st);
    for (const id of [a, b]) {
      const w = WINDS[id], s = spec(id), floorY = riserTop(w.r, w.a), pos = polar(w.r, w.a, floorY);
      const o = seat({ id: `${id}.0`, player: id, index: 0, family: s.family, instrument: s.instrument, desk: 0, part: "solo", row: 4, r: w.r, angle: w.a,
        pos, yaw: yawToward(pos), floorY, seatTop: floorY + SEAT_TOP, kind: "chair", stand: st });
      st.players.push(o.id);
    }
  }
  // ── ティンパニ: 立って叩く。太鼓は奏者の前 (指揮台の側)、大きい方 (G2) が奏者の左
  {
    const r = 6.4, floorY = riserTop(r, 0), pos = polar(r, 0, floorY), yaw = yawToward(pos), s = spec("timp");
    const fwd = V(Math.sin(yaw), 0, Math.cos(yaw)), right = V(fwd.z, 0, -fwd.x).negate();   // 奏者の右 (= +x)
    const drums = TIMPANI.drums.map((d) => ({ ...d, pos: pos.clone().addScaledVector(fwd, TIMPANI.ahead).addScaledVector(right, d.x).setY(floorY), yaw: yaw + Math.PI, H: TIMPANI.H }));
    const sp = pos.clone().addScaledVector(right, 1.0).addScaledVector(fwd, 0.35);
    const st = { id: "timp", pos: sp.setY(floorY), yaw: yawToward(sp, pos), floorY, sheetY: floorY + 1.22, players: [] }; stands.push(st);
    const o = seat({ id: "timp.0", player: "timp", index: 0, family: s.family, instrument: "timpani", desk: 0, part: "solo", row: 5, r, angle: 0,
      pos, yaw, floorY, seatTop: null, kind: "standing", stand: st, drums });
    st.players.push(o.id);
  }
  // ── 指揮者: 指揮台の上に立つ。前に低い譜面机
  const podiumSeat = seat({ id: "conductor", player: "conductor", index: 0, family: "conductor", instrument: "baton", desk: 0, part: "solo", row: -1, r: 0, angle: 0,
    pos: V(0, PODIUM.top, 0), yaw: 0, floorY: PODIUM.top, seatTop: null, kind: "podium", stand: null });
  const desk = { id: "conductor", pos: V(0, PODIUM.top, 0.4), yaw: Math.PI, floorY: PODIUM.top, sheetY: PODIUM.top + 0.86, tilt: 1.05, players: ["conductor"] };
  stands.push(desk); podiumSeat.stand = desk;
  for (const s of seats) s.forward = V(Math.sin(s.yaw), 0, Math.cos(s.yaw));
  return { seats, stands, byPlayer, risers: RISERS, podium: PODIUM, conductor: podiumSeat };
}
