// ═══════════ 指揮者 (指揮台の上に立ち、楽団を向いて指揮する) ═══════════
// 姿勢は楽譜の時間 (秒) だけから決める (乱数で動かさない。seek しても撮影しても同じ形)。ORCHESTRA.md §6.4:
// ・右手の指揮棒で 1 小節を 1 つに振る (bars[].conduct = 1)。打点 (指揮棒の先がいちばん低く、いちばん速い所) は小節の頭にぴったり。
//   打点のあとは跳ね上がり (少し右へ・少し前へ)、上でふわっと止まり、次の打点へ加速しながら落ちる。
//   大きさは音の大きさに合わせる (全員の音符から小節ごとの大きさを作る。ff は腕ごと大きく、p は手首だけで小さく)。
//   頂点の高さは次の小節の大きさを先に見せる (急に p になる前の振りは、もう小さい)。
// ・最初の音の前は 1 小節ぶんの予備拍。フェルマータを切ったあとは、切る輪と落ちる所が次の打点の予備拍になる。
// ・フェルマータ: 指揮棒を上げて止める (少しずつ高く)。cut のときは終わりで小さな輪を描き、ぴたっと止めて切る。
// ・左手: ff の全員の所では右手と鏡のように動く (フェルマータでは手のひらを上に)、急に p になる所では手のひらを下に向けて押さえる、
//   4 小節以上休んだ部分が入る 0.6 秒前にそちらを指す (顔と体もそちらを向く)、ほかは胸の前で休む。
// ・体: 大きな打点でひざが少し沈み、上体は前へ。8 小節ごとに体重を左右の足へ移す。足の裏は指揮台に付けたまま。
// 曲の前 (ページの数え始めで拍がマイナス) は stage.beat から秒を延ばして読む。止まっていて曲の頭にいるときは構えの姿勢。
import * as THREE from "three";
import { rig as R, V, clamp, lerp, smooth, smoother, Cursor } from "./base.js";

const easeOut = (u) => { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u); };
const easeIn = (u) => { u = clamp(u, 0, 1); return u * u; };
// 窓の重み: a から b まで 1、前は r1 秒、後ろは r2 秒でなめらかに 0 へ
export const win = (t, a, b, r1, r2) => smooth((t - (a - r1)) / r1) * (1 - smooth((t - b) / r2));
const BATON_GRIP = 0.03, BATON_LEN = 0.402;

// 部分 (指す相手) と、その中の奏者
const SECTIONS = { fl: ["fl1", "fl2"], ob: ["ob1", "ob2"], cl: ["cl1", "cl2"], bn: ["bn1", "bn2"], hn: ["hn1", "hn2"], tp: ["tp1", "tp2"], timp: ["timp"],
  vn1: ["vn1"], vn2: ["vn2"], va: ["va"], vc: ["vc"], cb: ["cb"] };
const CUE_PRIORITY = { hn: 3, tp: 2.6, timp: 2.6, ob: 2.4, fl: 2.3, cl: 2.3, bn: 2.2, vn1: 1.8, vn2: 1.8, va: 1.9, vc: 1.9, cb: 1.7 };
// 曲の focus.group → 見る相手 (奏者の id)
const FOCUS_PLAYERS = {
  strings: ["vn1", "vn2", "va", "vc"], violins: ["vn1", "vn2"], lowstrings: ["vc", "cb"], woodwinds: ["fl1", "ob1", "cl1", "bn1"],
  flute: ["fl1", "fl2"], oboe: ["ob1", "ob2"], clarinet: ["cl1", "cl2"], bassoon: ["bn1", "bn2"], horns: ["hn1", "hn2"], trumpets: ["tp1", "tp2"], timpani: ["timp"],
};
// 音の大きさの重み (弦は人数が多いので重く)
const WEIGHT = { vn1: 1.6, vn2: 1.4, va: 1.2, vc: 1.2, cb: 1.0, hn1: 0.7, hn2: 0.7, tp1: 0.7, tp2: 0.7, timp: 0.8 };

/* ─────────── 右手の形 (体の向きの中: x = 左、y = 指揮台の上からの高さ、z = 前、m) ───────────
   x, y, z = 指揮棒の握りの位置、th = 指揮棒の上下の角度 (+ で上)、yaw = 左右の角度 (+ で内側 = 左へ) */
const pose = () => ({ x: 0, y: 0, z: 0, th: 0, yaw: 0 });
const setP = (o, x, y, z, th, yaw) => { o.x = x; o.y = y; o.z = z; o.th = th; o.yaw = yaw; return o; };
const copyP = (o, a) => setP(o, a.x, a.y, a.z, a.th, a.yaw);
const ictusPose = (s, o = pose()) => setP(o, -0.24 - 0.03 * s, 1.27 - 0.06 * s, 0.43 + 0.05 * s, -0.05 - 0.1 * s, 0.3);
const peakY = (s, ict) => ict.y + 0.03 + 0.16 * s;               // 跳ね上がりの頂点 (手の高さ。腕は控えめに、残りは手首で)
const peakTh = (s) => 0.06 + 0.36 * s;                            // 頂点の指揮棒の角度 (手首が上へ返る)
const HOLD = setP(pose(), -0.44, 1.47, 0.55, 0.55, 0.14);           // (腕を前と横へ開いて V の字に上げる)         // フェルマータで止める所
const ATTN = setP(pose(), -0.26, 1.27, 0.48, 0.45, 0.28);          // 始まる前の構え
const WAIT = setP(pose(), -0.23, 1.17, 0.36, 0.1, 0.28);         // 長いフェルマータ (カデンツァ) の途中で下ろして待つ所
const REST = setP(pose(), -0.3, 0.82, 0.1, -1.25, -0.4);          // 曲が終わって腕を下ろした所 (指揮棒は下へ、譜面机の外へ)

export function createPlayers(stage, spec, seats) {
  const seat = seats[0], g = seat.rig, baton = seat.baton;
  const B = g.bones;
  let plan = null;
  // 毎コマ使う入れ物 (なるべく物を作らない)
  const rp = pose(), tmpA = pose(), tmpB = pose();
  const vR = V(), vL = V(), vD = V(), vF = V(), vT = V(), vQ = new THREE.Quaternion();

  /* ─────────── 曲から作る物 ─────────── */
  function build() {
    const bars = stage.bars, toSec = stage.toSec;
    const players = stage.players;
    // ── 小節ごとの音の大きさ (0..1) と、全員の ff かどうか
    const nb = bars.length, vmax = players.map(() => new Float32Array(nb));
    const barIndex = (t) => { let lo = 0, hi = nb - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bars[m].t0 <= t + 1e-6) lo = m; else hi = m - 1; } return lo; };
    players.forEach((p, pi) => {
      for (const n of p.notes) {
        const k0 = barIndex(n.t0), k1 = barIndex(Math.max(n.t0, n.t1 - 1e-4));
        for (let k = k0; k <= k1; k++) {
          const mid = (Math.max(n.t0, bars[k].t0) + Math.min(n.t1, bars[k].t1)) / 2;
          const v = n.v2 != null ? lerp(n.v, n.v2, clamp((mid - n.t0) / Math.max(1e-3, n.t1 - n.t0), 0, 1)) : n.v;
          if (v > vmax[pi][k]) vmax[pi][k] = v;
        }
      }
    });
    const w = players.map((p) => WEIGHT[p.id] ?? 0.6), wAll = w.reduce((a, b) => a + b, 0);
    const loud = new Float32Array(nb), tutti = new Uint8Array(nb);
    for (let k = 0; k < nb; k++) {
      let sw = 0, sv = 0;
      players.forEach((p, pi) => { const v = vmax[pi][k]; if (v > 0) { sw += w[pi]; sv += w[pi] * v; } });
      if (!sw) { loud[k] = -1; continue; }
      const dyn = sv / sw, dens = sw / wAll;
      loud[k] = clamp((dyn - 40) / 72, 0, 1) * (0.5 + 0.5 * Math.sqrt(dens));
      tutti[k] = dyn >= 98 && dens >= 0.45 ? 1 : 0;
    }
    for (let k = 0; k < nb; k++) if (loud[k] < 0) loud[k] = 0.6 * Math.min(loud[k - 1] > 0 ? loud[k - 1] : 0.2, loud[k + 1] > 0 ? loud[k + 1] : 0.2);
    // 3 小節の真ん中の値 (ばたつきを消す。急に変わる所はそのまま残る)
    const size = new Float32Array(nb);
    for (let k = 0; k < nb; k++) { const a = loud[Math.max(0, k - 1)], b = loud[k], c = loud[Math.min(nb - 1, k + 1)]; size[k] = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c)); }

    // ── 打点: conduct の数だけ (この曲は 1 小節に 1 つ)。conduct = 0 の小節 (カデンツァ) でも、頭で 3 人以上が鳴らすなら打点を 1 つ出す
    const starters = new Map();   // 拍 (0.01 拍に丸めた) → その拍で始まる奏者の集まり
    for (const p of players) for (const n of p.notes) { const k = Math.round(n.s * 100); (starters.get(k) ?? starters.set(k, new Set()).get(k)).add(p.id); }
    const startsAt = (beat) => starters.get(Math.round(beat * 100))?.size ?? 0;
    const ict = [];
    bars.forEach((b, k) => {
      const n = b.conduct ?? 1;
      // 運命の動機 (小節の頭が休み → 8 分音符 3 つ → 次の小節の頭に全員の長い音): この小節では打たない。ダダダの間に振り上げ、次の頭のジャーンで打つ。
      // 休みの頭で打つと振り下ろしたあとに音が鳴って見え (10-31 さとるん「音が指揮者からずれてる」)、打点を音の入りへ動かすと拍の間隔が 0.72 / 0.43 秒にばらついた
      const nx = bars[k + 1], upbeat = n === 1 && nx && startsAt(b.s) <= 2 && startsAt(b.s + 0.5) >= 6 && startsAt(nx.s) >= 6;
      if (upbeat) return;
      if (n >= 1) for (let j = 0; j < n; j++) ict.push({ t: j ? toSec(b.s + j * b.len / n) : b.t0, bar: k, size: size[k], conducted: true });
      else if (startsAt(b.s) >= 3) ict.push({ t: b.t0, bar: k, size: size[k], conducted: false });
    });
    // ── フェルマータ: 打点と打点の間に入る物をまとめて「止める区間」に
    const holds = [];
    for (let i = 0; i < ict.length; i++) {
      const a = ict[i].t, b = ict[i + 1]?.t ?? Infinity;
      const fs = stage.fermatas.filter((f) => f.t0 >= a - 0.01 && f.t0 < b - 0.01);
      if (fs.length) holds[i] = { h0: Math.min(...fs.map((f) => f.t0)), h1: Math.max(...fs.map((f) => f.t1)), cut: fs[fs.length - 1].cut !== false };
    }
    // ── 区間を並べる (時間の順にすき間なく)
    const segs = [];
    const P0 = ict.length > 1 ? ict[1].t - ict[0].t : 0.6;
    const first = ict[0] ?? { t: 0, size: 0.5 };
    const tPrep = first.t - clamp(P0, 0.45, 0.9);   // 最初の打点の前の振り上げ (動機で打点が 1 つ飛ぶと P0 が長くなるので 0.9 秒まで)
    segs.push({ type: "attn", t0: -Infinity, t1: tPrep });
    segs.push({ type: "prep", t0: tPrep, t1: first.t, size: first.size, B: ictusPose(first.size) });
    for (let i = 0; i + 1 < ict.length; i++) {
      const a = ict[i], b = ict[i + 1], A = ictusPose(a.size), Bp = ictusPose(b.size);
      const h = holds[i];
      if (h) {
        const caes = b.t - h.h1, Pn = ict[i + 2] ? ict[i + 2].t - b.t : P0;
        const loopDur = h.cut ? clamp(Pn - caes, 0.26, 0.42) : 0;
        const rise = clamp(Math.max(0.4, h.h0 - a.t + 0.22), 0.3, 0.7);
        segs.push({ type: "hold", t0: a.t, t1: b.t, A, B: Bp, h0: h.h0, h1: h.h1, cut: h.cut, rise, loop: loopDur, size: a.size, long: h.h1 - h.h0 > 5 });
      } else {
        const s = 0.35 * a.size + 0.65 * b.size;
        const P = b.t - a.t;
        // 動機で 1 小節飛ばした所は時間が長いので、そのぶん高く上げる (同じ高さのままだと遅く弱く見える)
        const far = clamp((P - 0.8) / 0.4, 0, 1);
        segs.push({ type: "beat", t0: a.t, t1: b.t, A, B: Bp, tp: a.t + P * (0.5 + 0.04 * (1 - s)), py: peakY(s, A) + 0.16 * far * s, pth: peakTh(s) + 0.18 * far * s, s });
      }
    }
    const last = ict[ict.length - 1] ?? first;
    segs.push({ type: "end", t0: last.t, t1: Infinity, A: ictusPose(last.size), size: last.size });

    // ── 左手が鏡になる所 (全員の ff が 2 小節以上続く所・構えと予備拍・フェルマータ・終わり)
    const mirror = [];
    for (let k = 0; k < nb;) {
      if (!tutti[k]) { k++; continue; }
      let e = k; while (e + 1 < nb && tutti[e + 1]) e++;
      if (e - k >= 1) mirror.push([bars[k].t0 - 0.3, bars[e].t1 - 0.15]);
      k = e + 1;
    }
    mirror.push([-Infinity, first.t + 0.2]);
    for (const sg of segs) if (sg.type === "hold") mirror.push([sg.t0 + 0.05, sg.h1 + 0.02]);
    mirror.push([last.t - 0.1, Infinity]);
    mirror.sort((a, b) => a[0] - b[0]);
    const holdsW = segs.filter((s) => s.type === "hold").map((s) => [s.t0 + 0.1, s.h1 - (s.loop || 0) * 0.5]);

    // ── 急に p になる所: 手のひらを下に (フェルマータを切った直後なら、切ってから)
    const palms = [];
    for (let k = 2; k < nb; k++) {
      if (size[k] <= 0.32 && Math.max(size[k - 1], size[k - 2]) >= 0.58) {
        const t = bars[k].t0, h = segs.find((s) => s.type === "hold" && s.h1 <= t + 1e-6 && s.t1 >= t - 1e-6);
        const a = h ? Math.max(t - 0.45, h.h1 + 0.02) : t - 0.45;
        if (!palms.length || a > palms[palms.length - 1].b + 0.8) palms.push({ a, b: t + 1.3, t });
      }
    }
    // ── 部分の場所 (席の真ん中・座った頭の高さ)
    const seatsOf = (ids) => ids.flatMap((id) => stage.layout.byPlayer[id] ?? []);
    const centre = (ids) => {
      const ss = seatsOf(ids); if (!ss.length) return V(0, 1.2, 3);
      const c = V(); for (const s of ss) c.add(s.pos); c.multiplyScalar(1 / ss.length);
      c.y = ss[0].kind === "standing" ? ss[0].floorY + 1.35 : (ss[0].seatTop ?? ss[0].floorY + 0.5) + 0.62;
      return c;
    };
    const where = {};
    for (const [k, ids] of Object.entries(SECTIONS)) where[k] = centre(ids);
    // ── 合図: 4 小節以上休んだ部分が入る所
    const entries = [];
    for (const [sec, ids] of Object.entries(SECTIONS)) {
      const ns = players.filter((p) => ids.includes(p.id)).flatMap((p) => p.notes).sort((a, b) => a.t0 - b.t0);
      let end = -Infinity, endBar = -99;
      for (const n of ns) {
        const k = barIndex(n.t0);
        if (n.t0 > 1 && k - endBar >= 5) entries.push({ t: n.t0, sec, v: n.v, bar: k });
        if (n.t1 > end) { end = n.t1; endBar = barIndex(Math.max(n.t0, n.t1 - 1e-3)); }
      }
    }
    // ひとりで出る所 (曲の focus がその部分を指していて、前後 0.35 秒にほかの部分の入りが無い。例: 59 小節のホルン)
    const secOf = Object.fromEntries(Object.entries(SECTIONS).flatMap(([k, ids]) => ids.map((id) => [id, k])));
    const onsets = players.flatMap((p) => p.notes.map((n) => ({ t: n.t0, sec: secOf[p.id] }))).sort((a, b) => a.t - b.t);
    // t の前後 r 秒に、sec 以外の部分の音の始まりがあるか (並べた表を 2 分探索)
    const othersNear = (t, sec, r) => {
      let lo = 0, hi = onsets.length; while (lo < hi) { const m = (lo + hi) >> 1; if (onsets[m].t < t - r) lo = m + 1; else hi = m; }
      for (let i = lo; i < onsets.length && onsets[i].t < t + r; i++) if (onsets[i].sec !== sec && onsets[i].t > t - r) return true;
      return false;
    };
    for (const [sec, ids] of Object.entries(SECTIONS)) {
      const ns = players.filter((p) => ids.includes(p.id)).flatMap((p) => p.notes).sort((a, b) => a.t0 - b.t0);
      let end = -Infinity;
      for (const n of ns) {
        const fids = FOCUS_PLAYERS[stage.focus.find((f) => n.t0 >= f.t0 - 1 && n.t0 < f.t1)?.group] ?? [];
        if (n.t0 > 1 && n.t0 - end >= 0.35 && ids.some((id) => fids.includes(id)) && !entries.some((e) => e.sec === sec && Math.abs(e.t - n.t0) < 0.01)
          && !othersNear(n.t0, sec, 0.35)) entries.push({ t: n.t0, sec, v: n.v + 40, bar: barIndex(n.t0), solo: true });
        end = Math.max(end, n.t1);
      }
    }
    entries.sort((a, b) => a.t - b.t);
    // 同じ時に 4 部分以上入るのは全員の入り (打点そのものが合図。左手で指さない)
    const crowd = (e) => entries.filter((x) => Math.abs(x.t - e.t) < 0.08).length;
    const focusAt = (t) => stage.focus.find((f) => t >= f.t0 && t < f.t1)?.group;
    const cand = entries.filter((e) => crowd(e) < 4).map((e) => {
      const ids = FOCUS_PLAYERS[focusAt(e.t)] ?? [];
      return { ...e, pri: (CUE_PRIORITY[e.sec] ?? 1) + (SECTIONS[e.sec].some((id) => ids.includes(id)) ? 1 : 0) + e.v / 254 };
    });
    const inHold = (t) => segs.some((s) => s.type === "hold" && t > s.t0 - 0.3 && t < s.h1 + 0.25);
    const inPalm = (t) => palms.some((p) => t > p.a - 1.0 && t < p.b + 0.4);
    const cues = [];
    for (const c of cand.slice().sort((a, b) => b.pri - a.pri || a.t - b.t)) {
      if (inHold(c.t) || inPalm(c.t)) continue;
      if (cues.some((x) => Math.abs(x.t - c.t) < 1.9)) continue;
      // 同じ時に入るほかの部分があれば、指す先を少しそちらへ寄せる
      const with2 = cand.filter((x) => x !== c && Math.abs(x.t - c.t) < 0.08).slice(0, 1);
      const tgt = where[c.sec].clone(); for (const x of with2) tgt.lerp(where[x.sec], 0.35);
      cues.push({ t: c.t, sec: c.sec, target: tgt, also: with2.map((x) => x.sec), solo: !!c.solo });
    }
    cues.sort((a, b) => a.t - b.t);
    // ── 見る先: 曲の focus の部分 (切り替えは 1 秒かけて)
    const looks = stage.focus.map((f) => ({ t0: f.t0, t1: f.t1, target: f.group === "conductor" || f.group === "tutti" ? V(0, 1.2, 3.1) : centre(FOCUS_PLAYERS[f.group] ?? []) }));
    // ── 体重を移す: 8 小節ごと (楽句の区切り) に左右の足へ
    const shifts = [];
    for (let k = 0; k < nb; k += 8) shifts.push({ t: bars[k].t0, side: ((k / 8) % 2 ? 1 : -1) });
    // カデンツァ (conduct = 0) の間はオーボエを見る
    const cadenza = bars.filter((b) => (b.conduct ?? 1) === 0).map((b) => ({ t0: b.t0, t1: b.t1, target: where.ob }));
    // 足首の位置 (立った姿勢から。毎コマここへ足を戻す)
    const ankles = R.SIDES.map((sd) => R.wpos(B[sd + "Foot"]).clone());
    const hipsBase = B.Hips.position.clone();
    return { ict, segs, mirror, holdsW, palms, cues, looks, shifts, cadenza, size, first, last, ankles, hipsBase, where, entries,
      segCur: new Cursor(segs), ictCur: new Cursor(ict, "t") };
  }

  /* ─────────── 右手 (指揮棒) の形を時間から ─────────── */
  function rightAt(T, o) {
    const sg = plan.segs[plan.segCur.at(T)] ?? plan.segs[0];
    switch (sg.type) {
      case "attn": {
        // 構え。予備拍の 0.6 秒前に息を吸う (手と肩が少し上がる)
        copyP(o, ATTN); o.y += 0.015 * smooth((T - (sg.t1 - 0.6)) / 0.6);
        return o;
      }
      case "prep": {
        // 予備拍: 構えから上へ (止まった所から動き出す)、頂点から打点へ加速して落ちる
        const P = sg.t1 - sg.t0, tp = sg.t0 + 0.48 * P, Bp = sg.B;
        const big = smooth((sg.size - 0.5) / 0.4);   // 強い出だしは大きく振り上げる (運命の冒頭: 指揮棒の先で 12 cm しか上がらず、何もしていないように見えた)
        const py = ATTN.y + 0.045 + 0.07 * sg.size + 0.3 * big, pth = ATTN.th + 0.12 * sg.size + 0.3 * big;
        if (T < tp) { const u = smooth((T - sg.t0) / (tp - sg.t0)); o.y = lerp(ATTN.y + 0.015, py, u); o.th = lerp(ATTN.th, pth, u); }
        else { const u = easeIn((T - tp) / (sg.t1 - tp)); o.y = lerp(py, Bp.y, u); o.th = lerp(pth, Bp.th, u); }
        const u = smooth((T - sg.t0) / P);
        o.x = lerp(ATTN.x, Bp.x, u) - 0.02 * Math.sin(Math.PI * u); o.z = lerp(ATTN.z, Bp.z, u); o.yaw = lerp(ATTN.yaw, Bp.yaw, u);
        return o;
      }
      case "beat": return beatAt(sg, T, o);
      case "hold": return holdAt(sg, T, o);
      case "end": {
        // 最後の打点: 跳ね上がって止め (音を切る)、1.6 秒待ってから腕を下ろす
        const A = sg.A, s = sg.size, fy = peakY(s, A) + 0.01, fth = peakTh(s) + 0.05;
        const r = 0.34;
        if (T < sg.t0 + r) { const u = easeOut((T - sg.t0) / r), v = smooth((T - sg.t0) / r); return setP(o, lerp(A.x, A.x - 0.04, v), lerp(A.y, fy, u), lerp(A.z, A.z - 0.03, v), lerp(A.th, fth, u), A.yaw); }
        setP(tmpA, A.x - 0.04, fy, A.z - 0.03, fth, A.yaw);
        // 下ろすときは先に外へ開いてから下げる (指揮棒が譜面机をかすめない)
        const u = smoother((T - (sg.t0 + 1.9)) / 1.7), ux = smoother((T - (sg.t0 + 1.9)) / 0.9);
        return setP(o, lerp(tmpA.x, REST.x, ux), lerp(tmpA.y, REST.y, u), lerp(tmpA.z, REST.z, u), lerp(tmpA.th, REST.th, u), lerp(tmpA.yaw, REST.yaw, ux));
      }
    }
    return copyP(o, ATTN);
  }
  // ふつうの 1 小節: 打点 A → 跳ね上がり (減速) → 頂点 → 落ちる (加速) → 打点 B
  function beatAt(sg, T, o) {
    const A = sg.A, Bp = sg.B, P = sg.t1 - sg.t0, u = clamp((T - sg.t0) / P, 0, 1);
    if (T < sg.tp) { const r = easeOut((T - sg.t0) / (sg.tp - sg.t0)); o.y = lerp(A.y, sg.py, r); o.th = lerp(A.th, sg.pth, r); }
    else { const f = easeIn((T - sg.tp) / (sg.t1 - sg.tp)); o.y = lerp(sg.py, Bp.y, f); o.th = lerp(sg.pth, Bp.th, f); }
    // 跳ね上がりは少し右 (外) へ・少し前へ、落ちるときに戻る (細い輪になる)
    const s = sg.s, sm = smooth(u);
    o.x = lerp(A.x, Bp.x, sm) - (0.018 + 0.045 * s) * Math.sin(Math.PI * Math.pow(u, 0.72));
    o.z = lerp(A.z, Bp.z, sm) + (0.01 + 0.06 * s) * Math.sin(Math.PI * Math.pow(u, 0.85));
    o.yaw = lerp(A.yaw, Bp.yaw, sm) - 0.06 * s * Math.sin(Math.PI * u);
    return o;
  }
  // フェルマータ: 打点 A → 上げて止める (少しずつ高く) → [輪を描いて切る] → 次の打点 B へ落ちる (= 予備拍)
  function holdPose(sg, t, out) {
    const tr = sg.t0 + sg.rise, tl = sg.h1 - sg.loop;
    const prog = clamp((t - tr) / Math.max(0.2, tl - tr), 0, 1);
    setP(out, HOLD.x, HOLD.y + 0.05 * smooth(prog), HOLD.z + 0.02 * prog, HOLD.th + 0.06 * prog, HOLD.yaw);
    if (sg.long) {   // カデンツァ: いったん下ろして待ち、切る前にまた上げる
      const d = win(t, tr + 1.2, sg.h1 - 1.6 - sg.loop, 0.9, 1.0);
      out.x = lerp(out.x, WAIT.x, d); out.y = lerp(out.y, WAIT.y, d); out.z = lerp(out.z, WAIT.z, d); out.th = lerp(out.th, WAIT.th, d); out.yaw = lerp(out.yaw, WAIT.yaw, d);
    }
    return out;
  }
  function holdAt(sg, T, o) {
    const A = sg.A, Bp = sg.B, tr = sg.t0 + sg.rise, tl = sg.h1 - sg.loop;
    if (T < tr) {
      // 跳ね上がりながら止める所へ (高さは減速、横と角度はなめらかに)
      holdPose(sg, tr, tmpA);
      const r = easeOut((T - sg.t0) / sg.rise), v = smooth((T - sg.t0) / sg.rise);
      o.y = lerp(A.y, tmpA.y, r); o.th = lerp(A.th, tmpA.th, r);
      o.x = lerp(A.x, tmpA.x, v) - 0.02 * Math.sin(Math.PI * v); o.z = lerp(A.z, tmpA.z, v); o.yaw = lerp(A.yaw, tmpA.yaw, v);
      return o;
    }
    if (T < tl) return holdPose(sg, T, o);
    if (T < sg.h1) return loopAt(sg, holdPose(sg, tl, tmpA), (T - tl) / sg.loop, o);
    // 切ったあと (または止めたまま) 次の打点へ落ちる
    const C = sg.loop ? loopAt(sg, holdPose(sg, tl, tmpA), 1, tmpB) : holdPose(sg, sg.h1, tmpB);
    const t0 = sg.loop ? sg.h1 : Math.max(sg.h1, sg.t1 - 0.45);
    if (T < t0) return copyP(o, C);
    const f = easeIn((T - t0) / (sg.t1 - t0)), v = smooth((T - t0) / (sg.t1 - t0));
    return setP(o, lerp(C.x, Bp.x, v), lerp(C.y, Bp.y, f), lerp(C.z, Bp.z, v), lerp(C.th, Bp.th, f), lerp(C.yaw, Bp.yaw, v));
  }
  // 切る輪: 止めた所 (輪のいちばん下) から、指揮者から見て時計回りに 1 周と少し。だんだん速くなり、最後は内側 (左) へ払って止める
  function loopAt(sg, H, u, o) {
    const rho = 0.03 + 0.012 * sg.size, e = Math.pow(clamp(u, 0, 1), 1.5);
    const a = -Math.PI / 2 - 2 * Math.PI * 1.08 * e;
    // 指揮者から見た向き: 右 = -x、上 = +y
    return setP(o, H.x - rho * Math.cos(a), H.y + rho + rho * Math.sin(a), H.z + 0.015 * Math.sin(Math.PI * e), H.th - 0.1 * e, H.yaw);
  }
  const sizeAt = (T) => {
    const i = plan.ictCur.at(T), a = plan.ict[Math.max(0, i)], b = plan.ict[i + 1];
    if (!a) return plan.first.size;
    if (!b || T < a.t) return a.size;
    return lerp(a.size, b.size, smooth((T - a.t) / (b.t - a.t)));
  };
  // 打点の沈み: 打点の 0.12 秒前から沈み始めて打点でいちばん深く、0.16 秒で戻る (前と次の打点の大きい方。途中で飛ばない)
  const pulseAt = (T) => {
    const i = plan.ictCur.at(T); let p = 0;
    for (let k = Math.max(0, i); k <= i + 1; k++) { const a = plan.ict[k]; if (!a) continue; const x = T - a.t; p = Math.max(p, a.size * (x < 0 ? smooth(1 + x / 0.12) ** 2 : Math.exp(-x / 0.16))); }
    return p;
  };
  const sumWin = (list, T, r1, r2) => { let w = 0; for (const [a, b] of list) { if (a - r1 > T) break; if (b + r2 < T) continue; w = Math.max(w, win(T, a, b, r1, r2)); } return w; };

  /* ─────────── 見る先 ───────────
     点の座標で混ぜると、右のバイオリンから左のチェロへ移るとき点が指揮者の真後ろ近くを通り、向きが一瞬で裏返る
     (胸 96 度/秒・頭 169 度/秒。10-31 さとるん「指揮者がいきなりずれてたり」)。左右の角度・距離・高さで混ぜ、
     向き直りはかならず正面を通す。曲全体の表を先に作り、前後からならして使う */
  const LOOK_MAX = 1.15, LOOK_RATE = 60, LOOK_TAU = 0.24;
  const polar = (v) => { const dx = v.x - g.root.position.x, dz = v.z - g.root.position.z; return { a: clamp(Math.atan2(dx, dz) - g.root.rotation.y, -LOOK_MAX, LOOK_MAX), r: Math.hypot(dx, dz), y: v.y }; };
  function lookRaw(T, q, base) {
    const p = plan;
    let wHead = 0, cueH = null, wCad = 0, cad = null;
    for (const c of p.cues) { if (c.t - 1.6 > T) break; if (c.t + 1.3 < T) continue; const h = win(T, c.t - 0.75, c.t + 0.45, 0.3, 0.55); if (h > wHead) { wHead = h; cueH = c; } }
    // カデンツァの間はオーボエを見る (指さない)
    for (const c of p.cadenza) { const x = win(T, c.t0 + 0.6, c.t1 - 1.2, 0.8, 0.8); if (x > wCad) { wCad = x; cad = c; } }
    const mix = (o, w) => { q.a = lerp(q.a, o.a, w); q.r = lerp(q.r, o.r, w); q.y = lerp(q.y, o.y, w); };
    // 見る先 (曲の focus をなめらかに。合図のときはその部分)
    q.a = base.a; q.r = base.r; q.y = base.y;
    for (const L of p.looks) { if (L.t0 - 0.5 > T) break; if (L.t1 + 0.5 < T) continue; mix(L.polar ??= polar(L.target), 0.55 * win(T, L.t0, L.t1, 0.5, 0.5)); }
    if (cueH) mix(cueH.polar ??= polar(cueH.target), wHead);
    if (cad) mix(cad.polar ??= polar(cad.target), wCad);
    const wHold = sumWin(p.holdsW, T, 0.3, 0.45);
    if (wHold > 0) q.y += 0.25 * wHold;
    return q;
  }
  function lookTrack(p) {
    const t0 = -4, n = Math.ceil((p.last.t + 12 - t0) * LOOK_RATE), a = new Float32Array(n * 3), q = { a: 0, r: 0, y: 0 }, base = polar(V(0, 1.2, 3.1));
    for (let i = 0; i < n; i++) { lookRaw(t0 + i / LOOK_RATE, q, base); a[i * 3] = q.a; a[i * 3 + 1] = q.r; a[i * 3 + 2] = q.y; }
    const k = 1 - Math.exp(-1 / (LOOK_RATE * LOOK_TAU));
    for (let pass = 0; pass < 2; pass++) for (let c = 0; c < 3; c++) {
      for (let i = 1; i < n; i++) a[i * 3 + c] = a[(i - 1) * 3 + c] + k * (a[i * 3 + c] - a[(i - 1) * 3 + c]);
      for (let i = n - 2; i >= 0; i--) a[i * 3 + c] = a[(i + 1) * 3 + c] + k * (a[i * 3 + c] - a[(i + 1) * 3 + c]);
    }
    return { t0, n, a };
  }
  function lookAt(T, out) {
    const tr = plan.lookTrack ??= lookTrack(plan);
    const x = clamp((T - tr.t0) * LOOK_RATE, 0, tr.n - 1.001), i = Math.floor(x), f = x - i, t = tr.a;
    const a = lerp(t[i * 3], t[i * 3 + 3], f) + g.root.rotation.y, r = lerp(t[i * 3 + 1], t[i * 3 + 4], f);
    return out.set(g.root.position.x + r * Math.sin(a), lerp(t[i * 3 + 2], t[i * 3 + 5], f), g.root.position.z + r * Math.cos(a));
  }

  /* ─────────── 1 コマ ─────────── */
  function poseAll(T) {
    const p = plan;
    rightAt(T, rp);
    const S = sizeAt(T);
    // ── 左手の重み
    const wMir = sumWin(p.mirror, T, 0.35, 0.4);
    const wHold = sumWin(p.holdsW, T, 0.3, 0.45);
    let wPalm = 0, palm = null;
    for (const pm of p.palms) { if (pm.a - 0.3 > T) break; const x = win(T, pm.a, pm.b, 0.28, 0.55); if (x > wPalm) { wPalm = x; palm = pm; } }
    wPalm *= 1 - smooth(wHold);   // フェルマータで上へ向けた手のひらが下へ戻ってから (2 つを混ぜると手が逆へ回る)
    let wCue = 0, cue = null;
    for (const c of p.cues) {
      if (c.t - 1.6 > T) break; if (c.t + 1.3 < T) continue;
      const x = win(T, c.t - 0.6, c.t + 0.2, 0.35, 0.5); if (x > wCue) { wCue = x; cue = c; }
    }

    // ── 体: 前かがみ (大きいほど)・打点でうなずく・ひざが沈む・体重の移動
    const pulse = pulseAt(T);
    let side = 0;
    for (const sh of p.shifts) { if (sh.t - 0.8 > T) break; side = lerp(side, sh.side, smooth((T - sh.t + 0.8) / 1.6)); }
    const look = lookAt(T, vT);
    // 首と体の向き: 見る先の左右の角度の 4 割を背中で回す
    const yawTo = Math.atan2(look.x - g.root.position.x, look.z - g.root.position.z) - g.root.rotation.y;
    const endDown = T > p.last.t + 1.9 ? smoother((T - p.last.t - 1.9) / 1.7) : 0;
    const pitch = 0.035 + 0.05 * S + 0.03 * pulse - 0.02 * wHold + 0.06 * endDown;
    R.setSpine(g, pitch, clamp(yawTo * 0.4, -0.3, 0.3), -0.025 * side);
    // 腰: 体重を移す (横に 2 cm)・打点でひざが沈む・フェルマータで伸び上がる
    B.Hips.position.set(p.hipsBase.x + (0.02 * side) / R.S, p.hipsBase.y + (-0.014 * pulse + 0.008 * wHold - 0.004 * S) / R.S, p.hipsBase.z + (0.006 * S) / R.S);
    B.Hips.rotation.set(0, clamp(yawTo * 0.15, -0.1, 0.1), 0.012 * side);
    g.root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const sd = R.SIDES[i], sgn = R.sgnOf(sd);
      R.solveLeg(g, sd, p.ankles[i], { knee: R.bodyDir(g, sgn * 0.12, 0, 1), foot: { fwd: R.bodyDir(g, sgn * 0.16, 0, 1), up: V(0, 1, 0) } });
    }
    R.lookAt(g, look, 0.85, 0);
    // ── 右手と指揮棒、左手
    placeBaton(rp);
    leftHand(T, wMir, wHold, wPalm, palm, wCue, cue);
  }

  // 体の向きの中の点・向き → world
  const bp = (x, y, z, out) => R.bodyPoint(g, x, y, z, out);
  const bd = (x, y, z, out) => R.bodyDir(g, x, y, z, out);
  // 右手: 指揮棒の向きから手の向きを決め、握りの点を目標へ (腕は IK)。そのあと指揮棒を本当の手に合わせて置く
  const B_LOCAL = V(-0.88, -0.08, 0.47).normalize();   // 手の中の指揮棒の向き (人さし指の付け根に沿って、指先の向きから親指の側へ 28 度。右手)
  const qH = new THREE.Quaternion(), qW = new THREE.Quaternion(), qTmp = new THREE.Quaternion(), vG = V(), vP = V(), vX = V(), X = V(1, 0, 0), Y = V(0, 1, 0);
  function placeBaton(o) {
    const ct = Math.cos(o.th);
    bd(Math.sin(o.yaw) * ct, Math.sin(o.th), Math.cos(o.yaw) * ct, vD).normalize();
    const target = bp(o.x, o.y, o.z, vG), pole = bd(-0.35, -0.8, -0.45, vP);
    holdQuat(g, "Right", B_LOCAL, vD, g.points.gripRight, target, pole, qH);
    const wrist = R.wristFor(g, "Right", qH, g.points.gripRight, target);
    R.solveArm(g, "Right", wrist, { pole, hand: qH });
    // 握り: 親指と人さし指 (少しだけ曲げて指揮棒に沿わせる) ではさみ、残りの指は柄の玉を手のひらに包む
    R.setFingers(g, "Right", [[0.45, 0.4], [0.45, 0.35], [1.15, 1.05], [1.3, 1.15], [1.35, 1.2]], [0.75, 0.05, 0, -0.05, -0.1]);
    // 指揮棒を本当の手の握りに置く
    R.wquat(B.RightHand, qW);
    vD.copy(B_LOCAL).applyQuaternion(qW);
    const grip = R.wpos(g.points.gripRight, vR);
    baton.root.quaternion.copy(R.basisQuat(Y, vD, X, vX.copy(X).applyQuaternion(qW), qTmp));
    baton.root.position.copy(grip).addScaledVector(vD, -BATON_GRIP);
    baton.root.updateMatrixWorld(true);
  }

  // 左手: 休む → 鏡 → 手のひらを下に → 指す、の順に重ねる
  const L_REST = V(0.15, 1.15, 0.3);
  const lPos = V(), lFing = V(), lDors = V(), tP = V(), tF = V(), tD = V(), shL = V(), fW = V(), dW = V();
  const qLH = new THREE.Quaternion(), qLT = new THREE.Quaternion();
  function leftHand(T, wMir, wHold, wPalm, palm, wCue, cue) {
    // 休む: 胸の前・手のひらは体の方へ
    // 手の向きは回転 (クォータニオン) で混ぜる。指先と甲の向きを別々に混ぜると、手のひらを上 → 下へ返すような所で途中の向きが決まらず、1 コマで手が回る
    lPos.copy(L_REST); R.basisQuat(X_L, lFing.set(-0.6, -0.15, 0.75).normalize(), Y_L, lDors.set(0.5, 0.1, 0.85).normalize(), qLH);
    let curl = 0.42;
    const mix = (pos, fing, dors, c, w) => { if (w <= 0) return; lPos.lerp(pos, w); qLH.slerp(R.basisQuat(X_L, fing, Y_L, dors, qLT), w); curl = lerp(curl, c, w); };
    if (wMir > 0) {
      // 鏡: 右手の握りの左右を入れかえた所。手のひらは下 (フェルマータでは上へ向けて「保つ」)
      tP.set(-rp.x + 0.02, rp.y - 0.03, rp.z - 0.02);
      tF.set(-0.35, 0.15 + 0.3 * Math.max(0, rp.th), 1).normalize();
      tD.set(0.35, 1, 0).normalize();
      if (wHold > 0) {
        // フェルマータ: 手のひらを上へ返す。甲の向きを混ぜると途中で向きが決まらず手が一瞬で回るので、指先の向きを軸に回す
        // (左手は親指が上を通って外へ。約 165 度)
        tF.lerp(fW.set(-0.3, 0.35, 1).normalize(), wHold).normalize();
        tD.addScaledVector(tF, -tD.dot(tF)).normalize().applyAxisAngle(tF, -0.92 * Math.PI * wHold);
      }
      mix(tP, tF, tD, lerp(0.3, 0.15, wHold), wMir);
    }
    if (wPalm > 0) {
      // 手のひらを下に: 体の左前へ出し (胸に重ならない)、少し押し下げる
      const press = smooth((T - palm.t + 0.1) / 0.6);
      tP.set(0.31, 1.25 - 0.08 * press, 0.47); tF.set(0.02, 0.1, 1).normalize(); tD.set(0.05, 1, -0.12).normalize();
      mix(tP, tF, tD, 0.06, wPalm);
    }
    if (wCue > 0) {
      // 指す: 左肩からその部分への向きへ腕を伸ばし、入る瞬間に小さく打つ
      R.wpos(B.LeftArm, shL);
      const dir = tF.copy(cue.target).sub(shL); const L = dir.length(); dir.y = clamp(dir.y, -0.4 * L, 0.25 * L); dir.normalize();
      dir.applyQuaternion(vQ.copy(g.root.quaternion).invert());   // world → 体の向き
      const base = tP.set(0.19, 1.34, 0.02).addScaledVector(dir, 0.6);
      base.x = Math.max(base.x, -0.2); base.y -= 0.04 + 0.03 * Math.exp(-Math.pow((T - cue.t) / 0.09, 2));
      tD.set(0.35, 1, -0.1).normalize();
      mix(base, dir, tD, 0.08, wCue);
    }
    const target = bp(lPos.x, lPos.y, lPos.z, vL);
    lFing.copy(X_L).applyQuaternion(qLH); lDors.copy(Y_L).applyQuaternion(qLH);
    R.reachWith(g, "Left", g.points.palmLeft, target, bd(lFing.x, lFing.y, lFing.z, fW), bd(lDors.x, lDors.y, lDors.z, dW), { pole: bd(0.35, -0.8, -0.45, vP) });
    const c = curl;
    R.setFingers(g, "Left", [[c * 0.6, c * 0.5], [c * 0.8, c * 0.7], [c, c * 0.9], [c * 1.1, c], [c * 1.2, c * 1.1]], [0.55, 0.08, 0, -0.07, -0.14]);
  }

  /* ─────────── 確かめ (rehearse) ─────────── */
  const tip = V(), prevTip = V(), gripW = V(), pt = V();
  function tipAt(T) { poseAll(T); return baton.point("tip", tip); }
  function registerChecks() {
    const p = plan;
    const ictTimes = p.ict.map((x) => x.t);
    // 打点: 指揮棒の先が打点の ±0.15 秒でいちばん低くなる時刻と、いちばん速い時刻 (本物の形を 5 ms ごとに作って測る)
    stage.addCheck({ id: "conductor.ictus", player: "conductor", times: ictTimes, measure: (sec, k) => {
      const t0 = ictTimes[k];
      let best = Infinity, bestT = 0, y0 = 0, y1 = 0, vmax = 0, vmaxT = 0;
      for (let j = -30; j <= 30; j++) {
        const t = t0 + j * 0.005, y = tipAt(t).y;
        if (j === -30) y0 = y; if (j === 30) y1 = y;
        if (y < best) { best = y; bestT = t; }
        if (j > -30) { const v = tip.distanceTo(prevTip) / 0.005; if (v > vmax) { vmax = v; vmaxT = t - 0.0025; } }
        prevTip.copy(tip);
      }
      poseAll(sec);
      const depth = Math.min(y0, y1) - best, dt = bestT - t0;
      const ok = Math.abs(dt) <= 0.03 && depth > 0.004 && Math.abs(vmaxT - t0) <= 0.035;
      return { ok, value: dt, info: { depth: +depth.toFixed(4), speed: +vmax.toFixed(2), speedAt: +(vmaxT - t0).toFixed(4), conducted: p.ict[k].conducted } };
    } });
    // 指揮棒が手の中にある (指揮棒の握りの点と手の握りの点の距離)
    stage.addCheck({ id: "conductor.baton-grip", player: "conductor", frames: true, measure: () => {
      const d = R.wpos(g.points.gripRight, gripW).distanceTo(baton.point("grip", pt));
      return { ok: d < 0.01, value: d };
    } });
    // 手と指揮棒が体 (胸・背骨・腰・頭) に入っていない
    stage.addCheck({ id: "conductor.body", player: "conductor", frames: true, measure: () => {
      let worst = 0, what = "";
      for (const sd of R.SIDES) for (const [nm, o] of handPoints(g, sd)) { const d = bodyDepth(g, R.wpos(o, pt), true); if (d > worst) { worst = d; what = sd + "." + nm; } }
      for (let i = 1; i <= 4; i++) { const d = bodyDepth(g, baton.local(pt.set(0, BATON_LEN * i / 4, 0), pt), false); if (d > worst) { worst = d; what = "baton" + i; } }
      return { ok: worst < 0.005, value: worst, info: what };
    } });
    // 手の回る速さ: 毎コマ 1500 度/秒 (26 rad/s) 以下 (手の向きが 1 コマで飛ばない)
    const prevQ = [new THREE.Quaternion(), new THREE.Quaternion()], qq = new THREE.Quaternion(); let prevQs = null;
    stage.addCheck({ id: "conductor.hand-turn", player: "conductor", frames: true, measure: (sec) => {
      const cont = prevQs != null && sec > prevQs && sec - prevQs < 0.04;
      let w = 0;
      R.SIDES.forEach((sd, h) => { R.wquat(B[sd + "Hand"], qq); if (cont) w = Math.max(w, qq.angleTo(prevQ[h]) / (sec - prevQs)); prevQ[h].copy(qq); });
      prevQs = sec;
      return cont ? { ok: w <= 26, value: w } : null;
    } });
    // 指揮棒と手が譜面机に当たらない
    const desk = stage.layout.stands.find((s) => s.id === "conductor");
    stage.addCheck({ id: "conductor.desk", player: "conductor", frames: true, measure: () => {
      let worst = 0;
      for (let i = 0; i <= 4; i++) worst = Math.max(worst, deskDepth(desk, baton.local(pt.set(0, BATON_LEN * i / 4, 0), pt)));
      for (const sd of R.SIDES) worst = Math.max(worst, deskDepth(desk, R.wpos(B[sd + "Hand"], pt)));
      return { ok: worst < 0.003, value: worst };
    } });
    // 足の裏は指揮台の上
    stage.addCheck({ id: "conductor.feet", player: "conductor", frames: true, measure: () => {
      let worst = 0;
      for (const sd of R.SIDES) worst = Math.max(worst, Math.abs(R.wpos(B[sd + "Foot"], pt).y - R.SOLE - seat.floorY));
      return { ok: worst < 0.01, value: worst };
    } });
  }

  return {
    plan(notes) {
      plan = build();
      this.planInfo = plan;
      registerChecks();
    },
    pose(sec, dt) {
      // 曲の前 (ページの数え始め) は拍がマイナスになる。秒は 0 で止まるので、拍から延ばして読む
      let T = sec;
      const b = stage.beat;
      if (sec <= 0 && Number.isFinite(b) && b < 0) T = b * 60 / (stage.song?.tempo || 120);
      // 止まっていて曲の頭にいるときは構えの姿勢 (打点の形で待たない)
      else if (sec <= 0 && !stage.playing) T = plan.segs[0].t1 - 0.7;
      poseAll(T);
    },
    // 調べる用: 時刻 T (秒・マイナス可) の指揮棒の先 (world)。姿勢も T の形になる
    tipAt: (T) => tipAt(T).clone(),
  };
}

/* ─────────── 道具を持つ手の向き (timpani.js も使う) ─────────── */
// 道具 (指揮棒・マレット) の向き dir (world) を手の中の向き aLocal にぴったり合わせ、手のひねりは前腕と同じにする
// (手の甲 = 前腕の甲の側。手首は曲がってよいが、ねじれない)。前腕の向きと甲の側は、手首の位置を見積もって肘を
// 2 本の骨の IK (solveArm と同じ式) で出して決める (骨は動かさない)。見積もりは 2 回くり返す。
// 前は「指先を前腕の続きへ」で決めていたが、道具が前腕とほぼ同じ向きになると (マレットを高く振り上げたときなど)
// ひねりが決まらず、1 コマで手が 100 度以上回った。前腕の甲の側は道具の向きとほぼ直交するので、いつも決まる
const _s0 = V(), _w = V(), _d1 = V(), _d2 = V(), _h = V(), _y = V(), X_L = V(1, 0, 0), Y_L = V(0, 1, 0);
function forearmDorsal(g, side, S0, wrist, pole, out) {
  const { mid } = R.twoBone(S0, wrist, R.ARM.upper, R.ARM.fore, pole);
  _d1.copy(mid).sub(S0).normalize(); _d2.copy(wrist).sub(mid).normalize();
  _h.crossVectors(_d1, _d2);
  if (_h.lengthSq() < 1e-8) _h.crossVectors(_d1, pole);
  _h.normalize().multiplyScalar(R.sgnOf(side));
  return out.crossVectors(_h, _d2.multiplyScalar(R.sgnOf(side))).normalize();   // 前腕の骨の y 軸 (= 手の甲の側)
}
export function holdQuat(g, side, aLocal, dir, point, target, pole, out = new THREE.Quaternion()) {
  const S0 = R.wpos(g.bones[side + "Arm"], _s0);
  // 1 回目: 手首は握りの 8 cm 手前 (肩の側) と見積もる
  _w.copy(target).sub(S0).normalize().multiplyScalar(-0.08).add(target);
  R.basisQuat(aLocal, dir, Y_L, forearmDorsal(g, side, S0, _w, pole, _y), out);
  // 2 回目: その手の向きで本当の手首の位置を出して、もう一度
  _w.copy(R.wristFor(g, side, out, point, target));
  return R.basisQuat(aLocal, dir, Y_L, forearmDorsal(g, side, S0, _w, pole, _y), out);
}

/* ─────────── 確かめの道具 (timpani.js も使う) ─────────── */
// 手の中の点 (手首・握り・手のひら・指先)
export function handPoints(g, side) {
  const out = [["wrist", g.bones[side + "Hand"]], ["grip", g.points["grip" + side]], ["palm", g.points["palm" + side]]];
  g.fingers[side].forEach((f, i) => out.push(["tip" + i, f.tip]));
  return out;
}
const _l = V(), _m = new THREE.Matrix4();
// 点が体 (胸の箱・背骨・腰の箱・頭の球) のどれだけ内側にあるか (m、外なら 0 以下)。arm = true なら肩の近く (腕の付け根) は数えない
export function bodyDepth(g, p, arm) {
  const S = R.S, B = g.bones;
  const local = (bone) => { bone.updateWorldMatrix(true, false); return _l.copy(p).applyMatrix4(_m.copy(bone.matrixWorld).invert()); };
  let d = -Infinity;
  // 胸 (Spine1): 箱 (4.4 × 3.4 × 3.0、ロボット単位) の中心 (0, 0.3, 0.05)
  let l = local(B.Spine1);
  if (!(arm && Math.abs(l.x) > 1.9)) d = Math.max(d, Math.min(2.2 - Math.abs(l.x), 1.7 - Math.abs(l.y - 0.3), 1.5 - Math.abs(l.z - 0.05)) * S);
  // 背骨の筒 (Spine・LowerBack)
  for (const [bone, len, r] of [[B.Spine, 2.3, 1.1], [B.LowerBack, 2.0, 1.0]]) {
    l = local(bone); d = Math.max(d, Math.min(r - Math.hypot(l.x, l.z), l.y, len - l.y) * S);
  }
  // 腰の箱
  l = local(B.Hips); d = Math.max(d, Math.min(1.3 - Math.abs(l.x), 0.75 - Math.abs(l.y + 0.65), 1.0 - Math.abs(l.z)) * S);
  // 頭の球
  l = local(B.Head); d = Math.max(d, (1.2 - Math.hypot(l.x / 0.95, (l.y - 1.32) / 1.08, l.z - 0.05)) * S);
  return d;
}
// 譜面机 (指揮者の前の低い机) の板に入った深さ (m、板の厚み + 1.6 cm の余裕の中なら正)
function deskDepth(desk, p) {
  if (!desk) return 0;
  const dx = p.x - desk.pos.x, dz = p.z - desk.pos.z, c = Math.cos(desk.yaw), s = Math.sin(desk.yaw);
  const lx = c * dx - s * dz, lz = s * dx + c * dz, ly = p.y - desk.floorY;   // 机の向きの中 (+z = 読む人の側)
  const h = desk.sheetY - desk.floorY, tilt = desk.tilt ?? 0.62, deskH = 0.33;
  const uy = Math.cos(tilt), uz = -Math.sin(tilt);       // 板の上下の向き
  const ny = Math.sin(tilt), nz = Math.cos(tilt);        // 板の表の向き
  const ry = ly - h, rz = lz + 0.01;
  const along = ry * uy + rz * uz, normal = ry * ny + rz * nz;
  if (Math.abs(lx) > 0.33 || Math.abs(along) > deskH / 2 + 0.02) return 0;
  return Math.max(0, 0.02 - Math.abs(normal));
}
