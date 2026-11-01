// ═══════════ ティンパニ奏者 (立って 2 つの太鼓を叩く) ═══════════
// 太鼓は 2 つ: 大きい G2 が奏者の左、小さい C3 が右 (layout.js の seat.drums)。姿勢は楽譜の時間 (秒) だけから決める。ORCHESTRA.md §6.3:
// ・1 打ごとに、マレットの頭が音の始まりの瞬間にぴったり皮に当たる。振り下ろしは 0.12〜0.18 秒 (加速しながら)、
//   当たったら 0.1 秒で跳ね返る (減速しながら)。振り上げの高さは強さ (velocity) に比例。
// ・手は交互に。同じ手で続けるのは間が 0.3 秒以上あるときだけ。どちらの手で叩くかは曲の最初から最後までまとめて決める
//   (腕が交差しない・速い所で太鼓をまたがない・左手は左の太鼓、右手は右の太鼓が少し楽、の点数がいちばん良い並び)。
// ・roll (トレモロ) は両手で交互に 1 秒に約 9 回、小さく。音符の終わりまで。
// ・フェルマータで切ったロールのあと、しばらく叩かないなら、空いている手の指で皮を押さえて響きを止める。
// ・長く休む所はマレットを下げて楽にし、譜面台と指揮者を見る。入る前に構え直す。
// 叩く所は皮の縁から内側へ約 10 cm (奏者の側)。左手は少し左、右手は少し右を叩く。
import * as THREE from "three";
import { rig as R, V, clamp, lerp, smooth, smoother, Cursor } from "./base.js";
import { handPoints, bodyDepth, win, holdQuat } from "./conductor.js";

const easeOut = (u) => { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u); };
const easeIn = (u) => { u = clamp(u, 0, 1); return u * u; };
const SIDE = ["Left", "Right"];
const GRIP = 0.3;            // マレットの頭の中心から握りまで (instruments.js の mallet の grip)
// 1 打の形: 打つ深さ φ (0 = 皮に当たった瞬間、1 = いちばん大きな振り上げ)。φ が増えると、手首が返ってマレットが手のまわりに回り
// (当たるとき 22 度下向き → 55 度上向き)、前腕も少し上がり (10 cm)、手は少し手前へ (6 cm)。頭は上と手前へ弧を描く
const ANG0 = 0.384, ANG1 = -0.96, LIFT = 0.24, BACK = -0.12, INWARD = 0.33;   // 10-31 さとるん「叩く様子にダイナミックさがない」: 腕も大きく上げる (前は 10 cm で手首だけに見えた)
const DY0 = LIFT + GRIP * Math.cos(ANG0) * (ANG0 - ANG1);   // 当たる瞬間の、φ あたりの頭の高さの変わり方 (m)
const READY = 0.16;          // 構えたときの φ (頭は皮の上 約 8 cm)
const SPEED = 8;             // 頭がいちばん速い所の上限 (m/s)
const PHI_PER_SEC = SPEED / (2 * DY0);   // 振り下ろし t 秒で出せる φ の上限 = PHI_PER_SEC · t

// 強さ → 振り上げの φ
function amplitude(v, acc) { return 0.1 + 0.8 * Math.pow(clamp((v - 40) / 74, 0, 1), 1.2) + (acc ? 0.08 : 0); }

export function createPlayers(stage, spec, seats) {
  const seat = seats[0], g = seat.rig, B = g.bones, drums = seat.drums, mallets = seat.mallets;
  const headR = mallets[0].spec.headR * 0.96;    // 頭の中心から皮までの距離 (頭は少しつぶれた球)
  let P = null;

  /* ─────────── 曲から作る物 ─────────── */
  function build(notes) {
    const drumOf = (p) => { let best = 0; drums.forEach((d, k) => { if (Math.abs(d.pitch - p) < Math.abs(drums[best].pitch - p)) best = k; }); return best; };
    // ── 1 打ずつの表 (ロールは細かい打に分ける)
    const strokes = [];
    for (const n of notes) {
      const d = drumOf(n.p);
      if (n.art === "roll") {
        const f = 8.6 + 1.0 * clamp(n.v / 127, 0, 1), dur = n.t1 - n.t0, k = Math.max(2, Math.floor(dur * f));
        for (let j = 0; j < k; j++) {
          const t = n.t0 + j * dur / k, v = n.v2 != null ? lerp(n.v, n.v2, j / k) : n.v;
          strokes.push({ t, d, v, roll: true, first: j === 0, last: j === k - 1, note: n.i, rollEnd: n.t1 });
        }
      } else strokes.push({ t: n.t0, d, v: n.v, acc: n.acc, roll: false, note: n.i });
    }
    strokes.sort((a, b) => a.t - b.t);
    assignHands(strokes);
    // ── 手ごとの表と、1 打ごとの振りの形
    const hands = [[], []];
    for (const s of strokes) hands[s.h].push(s);
    for (const H of hands) {
      // 振り下ろしの長さと高さ
      H.forEach((s, i) => {
        const prev = H[i - 1], gap = prev ? s.t - prev.t : Infinity;
        if (s.roll) { s.A = (s.first ? 0.16 : 0.09) + 0.14 * clamp(s.v / 127, 0, 1); s.dn = Math.min(0.1, 0.5 * gap); }
        else { s.A = amplitude(s.v, s.acc); s.dn = Math.min(0.12 + 0.06 * clamp((s.A - 0.05) / 0.22, 0, 1), 0.6 * gap); }
      });
      // 跳ね返り: 次の振り下ろしまで 0.16 秒もないなら、そのまま次の高さまで上がる
      H.forEach((s, i) => {
        const n = H[i + 1];
        const avail = n ? n.t - n.dn - s.t : Infinity;
        if (avail <= 0.16) { s.up = avail; s.direct = true; }
        else { s.up = 0.1; s.direct = false; }
      });
      // 速さの上限 (振り下ろしと、その前の跳ね上がりの両方)
      H.forEach((s, i) => { const p = H[i - 1]; const t = Math.min(s.dn, p?.direct ? p.up : Infinity); s.A = Math.min(s.A, PHI_PER_SEC * t); });
      H.forEach((s, i) => { const n = H[i + 1]; s.RB = s.direct ? n.A : Math.min(0.55 * s.A + 0.03, n ? Math.max(n.A, READY) : Infinity); });
    }
    // 腕を交差させる打 (もう片方の手がまだ反対の太鼓の上にいる。交互の決まりで避けられない所だけ。この曲では 418 小節の 1 回)。
    // ・もう片方の手も次に同じ太鼓を叩くなら、交差させずに両手を一緒に移す (もう片方の手は打った直後に動き出し、9 cm の間をあけたまま並んで移る)。
    // ・そうでなければ本当に交差させる: その手は、もう片方の手が打ったあとに、もう片方のマレットの上を越えて移る
    { const last = [0, 1], lastS = [null, null];
      for (const s of strokes) {
        const o = 1 - s.h;
        if ((s.h === 0 && s.d === 1 && last[o] === 0) || (s.h === 1 && s.d === 0 && last[o] === 1)) {
          const n2 = hands[o].find((x) => x.t > s.t), po = lastS[o], ph = lastS[s.h];
          if (n2 && n2.d === s.d && po) {
            const a = Math.max(po.t + 0.25 * Math.min(po.up, 0.1), ph ? ph.t + 0.25 * Math.min(ph.up, 0.1) : -Infinity), b = s.t - 0.35 * s.dn;
            s.shiftWin = n2.shiftWin = [a, b];
          } else { s.cross = true; s.otherT = po ? po.t : -Infinity; }
        }
        last[s.h] = s.d; lastS[s.h] = s;
      } }
    // ── 響きを止める: フェルマータで切ったロール・長い音のあと、その太鼓を 1.5 秒以上叩かないとき
    const damps = [];
    const cutEnds = stage.fermatas.filter((f) => f.cut).map((f) => f.t1);
    for (const n of notes) {
      if (!(n.art === "roll" || n.d >= 1)) continue;
      if (!cutEnds.some((t) => Math.abs(t - n.t1) < 0.02)) continue;
      const d = drumOf(n.p), next = strokes.find((s) => s.t > n.t1 - 1e-6);
      if (next && next.t - n.t1 < 1.5) continue;
      // 押さえる手: その太鼓の側の手 (G2 は左手、C3 は右手) が空いていればその手、だめならもう片方。
      // 時間の割り振り: 最後の打の 0.05 秒後から動き出し (マレットを指の中で立てながら手を上げる)、音を切って 0.1 秒後に指が皮に触れる。
      // 押さえたまま少し待ち、先に手を上げてからマレットを戻す。その手の次の打の構えより前に終える
      const planFor = (h) => {
        const lastOwn = hands[h].filter((x) => x.t < n.t1 + 1e-6).pop(), nx = hands[h].find((x) => x.t > n.t1 + 1e-6);
        const tA = Math.max(n.t1 - 0.35, (lastOwn?.t ?? -Infinity) + 0.05), tTouch = Math.max(n.t1 + 0.15, tA + 0.62);
        const latest = nx ? nx.t - nx.dn - 0.55 : Infinity, hold = Math.min(0.7, latest - 0.7 - tTouch);
        return hold >= 0.25 ? { t: n.t1, d, h, tA, tTouch, tLift: tTouch + hold, tEnd: tTouch + hold + 0.7 } : null;
      };
      const dp = planFor(d) ?? planFor(1 - d);
      if (dp) damps.push(dp);
    }
    // ── 休み (2 打の間が長い所) の見る先
    const ankles = R.SIDES.map((sd) => R.wpos(B[sd + "Foot"]).clone());
    const hipsBase = B.Hips.position.clone();
    // 叩く所 (太鼓・手ごと、world)
    const toPlayer = drums.map((d) => seat.pos.clone().sub(d.pos).setY(0).normalize());
    const leftDir = R.bodyDir(g, 1, 0, 0);
    const spots = drums.map((d, k) => [0, 1].map((h) => d.pos.clone().addScaledVector(toPlayer[k], d.R - 0.1).addScaledVector(leftDir, h === 0 ? 0.045 : -0.045).setY(d.pos.y + d.H)));
    const membrane = drums.map((d) => d.pos.y + d.H);
    return { strokes, hands, damps, ankles, hipsBase, toPlayer, spots, membrane, leftDir, cur: [new Cursor(hands[0], "t"), new Cursor(hands[1], "t")],
      conductorEye: V(0, (stage.conductor?.floorY ?? 0.22) + 1.5, 0), standEye: seat.stand ? V(seat.stand.pos.x, seat.stand.sheetY, seat.stand.pos.z) : null };
  }

  // 手の振り分け (前から順に、状態 = 今の手・左手の太鼓・右手の太鼓 の 8 通りで点数のいちばん良い並び)
  function assignHands(strokes) {
    const N = strokes.length;
    if (!N) return;
    // dp[i][state] = {c, tL, tR, prev}
    const key = (h, dL, dR) => h * 4 + dL * 2 + dR;
    let cur = new Array(8).fill(null);
    const back = [];
    const step = (from, i) => {
      const s = strokes[i], out = new Array(8).fill(null);
      for (let st = 0; st < 8; st++) {
        const f = from[st]; if (!f) continue;
        const ph = st >> 2, dLast = [(st >> 1) & 1, st & 1];
        for (let h = 0; h < 2; h++) {
          const lastT = h ? f.tR : f.tL, gap = s.t - lastT;
          if (gap < 0.09) continue;
          if (f.i >= 0 && h === ph && s.t - strokes[f.i].t < 0.3) continue;    // 同じ手で続けるのは 0.3 秒以上あいたときだけ
          let c = f.c;
          if (f.i >= 0 && h === ph) c += s.t - strokes[f.i].t < 0.7 ? 0.35 : 0.05;
          if (dLast[h] !== s.d) c += gap < 0.22 ? 6 : gap < 0.4 ? 1 : 0.2;     // 太鼓をまたぐ
          const other = dLast[1 - h];
          if ((h === 0 && s.d === 1 && other === 0) || (h === 1 && s.d === 0 && other === 1)) c += 10;   // 腕が交差する
          if ((h === 0 && s.d === 1) || (h === 1 && s.d === 0)) c += 0.25;
          const dL = h === 0 ? s.d : dLast[0], dR = h === 1 ? s.d : dLast[1], k = key(h, dL, dR);
          if (!out[k] || c < out[k].c) out[k] = { c, tL: h === 0 ? s.t : f.tL, tR: h === 1 ? s.t : f.tR, i, prev: st, h };
        }
      }
      return out;
    };
    cur[key(0, 0, 1)] = { c: 0, tL: -Infinity, tR: -Infinity, i: -1, prev: -1, h: 1 };
    for (let i = 0; i < N; i++) {
      let nx = step(cur, i);
      if (nx.every((x) => !x)) {   // どの手も間に合わない (起きないはず): 交互の決まりを外して続ける
        const relaxed = cur.map((f) => f && { ...f, i: -1 });
        nx = step(relaxed, i);
      }
      back.push(nx); cur = nx;
    }
    let st = cur.reduce((b, x, k) => (x && (b < 0 || x.c < cur[b].c) ? k : b), -1);
    for (let i = N - 1; i >= 0; i--) { const e = back[i][st]; strokes[i].h = e.h; st = e.prev; }
  }

  /* ─────────── 手ごとの振り (時間から) ─────────── */
  // out: {y: 打つ深さ φ, d0, d1, lat: 太鼓 d0 → d1 の割合, rest: 休む姿勢の割合,
  //       damp: 押さえる動きの重み (体の傾き・指)、lift: 手を上げた割合、wr: マレットを指の中で立てた割合、wp: 手を皮へ下ろした割合、dd: 押さえる太鼓}
  function handAt(h, t, out) {
    const H = P.hands[h], i = P.cur[h].at(t), s = H[i], n = H[i + 1];
    out.rest = 0; out.damp = 0; out.lift = 0; out.wr = 0; out.wp = 0; out.dd = 0;
    if (!s) {
      // 最初の打の前: 休む → 構える → 振り上げ
      if (!n) { out.y = READY; out.d0 = out.d1 = h; out.lat = 0; out.rest = 1; return out; }
      const td = n.t - n.dn;
      out.d0 = out.d1 = n.d; out.lat = 0;
      if (t >= td) out.y = n.A * (1 - easeIn((t - td) / n.dn));
      else out.y = lerp(READY, n.A, smooth((t - (td - 0.4)) / 0.4));
      out.rest = 1 - smooth((t - (td - 1.6)) / 1.2);
      return out;
    }
    out.d0 = s.d; out.d1 = n ? n.d : s.d;
    // 太鼓をまたぐ動き: 次の振り下ろしの少し前までに (長くても 0.7 秒で) 移る
    let arc = 0;
    if (n && n.d !== s.d) {
      const la = s.t + 0.25 * Math.min(s.up, 0.1), lb = n.t - 0.35 * n.dn;
      // 交差するときは、もう片方の手が打ったあとに速く移り、マレットを高く上げて上を越える
      const [a, b] = n.shiftWin ?? [n.cross ? Math.max(la, Math.min(lb - 0.12, n.otherT + 0.04)) : Math.max(la, lb - 0.7), lb];
      out.lat = smooth((t - a) / Math.max(1e-3, b - a));
      if (n.cross) arc = 0.45 * Math.sin(Math.PI * out.lat);
    } else out.lat = 0;
    if (t < s.t + s.up) { out.y = s.RB * easeOut((t - s.t) / s.up); }
    else if (n && t >= n.t - n.dn) { out.y = n.A * (1 - easeIn((t - (n.t - n.dn)) / n.dn)); }
    else {
      const a = s.t + s.up, b = n ? n.t - n.dn : Infinity, tau = b - a;
      if (tau <= 0.9) out.y = lerp(s.RB, n.A, smooth((t - a) / tau));
      else {
        out.y = lerp(s.RB, READY, smooth((t - a) / 0.35));
        if (n) out.y = lerp(out.y, n.A, smooth((t - (b - 0.4)) / 0.4));
        if (tau > 2.6) out.rest = win(t, a + 0.6, b - 1.0, 0.6, 0.6);   // 跳ね上がりが終わった所から 0.6 秒で休む姿勢へ
      }
    }
    out.y += arc;
    // 響きを止める: 近づく (手を上げる → マレットを握りのまわりに立てる → 皮へ下ろす)・押さえる・離す (皮から上げる → マレットを戻す → 手を下ろす)
    for (const dp of P.damps) {
      if (dp.h !== h || t <= dp.tA || t >= dp.tEnd) continue;
      if (t < dp.tTouch) { const u = (t - dp.tA) / (dp.tTouch - dp.tA); out.lift = smooth(u / 0.4); out.wr = smooth((u - 0.1) / 0.6); out.wp = smoother((u - 0.45) / 0.55); }
      else if (t < dp.tLift) { out.lift = out.wr = out.wp = 1; }
      else { const v = (t - dp.tLift) / (dp.tEnd - dp.tLift); out.wp = 1 - smooth(v / 0.4); out.wr = 1 - smooth((v - 0.25) / 0.55); out.lift = 1 - smooth((v - 0.55) / 0.45); }
      out.damp = Math.max(out.wp, 0.45 * out.wr); out.dd = dp.d;
    }
    return out;
  }

  /* ─────────── 1 コマ ─────────── */
  const st = [{}, {}];
  const vS = V(), vDir = V(), vG = V(), vUp = V(0, 1, 0), vOut = V(), vTP = V(), vDors = V(), vP = V(), vM = V(), vLook = V(), vX = V();
  const X = V(1, 0, 0), Y = V(0, 1, 0);
  const qH = new THREE.Quaternion(), qW = new THREE.Quaternion(), qM = new THREE.Quaternion(), vAL = V();
  // 手の中のマレットの向き (握り → 頭)。親指と人さし指の間から出て、前腕の続きに近い向き
  const A_LOCAL = [V(0.85, -0.1, 0.53).normalize(), V(-0.85, -0.1, 0.53).normalize()];   // 指先の向きから親指の側へ 32 度
  const X_SIDE = [V(1, 0, 0), V(-1, 0, 0)];   // 手の中の指先の向き
  // 響きを止めるときのマレットの向き (手の中: 手の甲の側へ立て、少し手首の方と外へ)
  const A_DAMP = [V(-0.35, 0.85, -0.25).normalize(), V(0.35, 0.85, -0.25).normalize()];
  const DAMP_PALM = 0.133, DAMP_TILT = 0.78;   // 押さえるときの手のひらの点の高さ (皮の上 m) と、指先の下向きの角度
  function poseAll(t) {
    const p = P;
    for (let h = 0; h < 2; h++) handAt(h, t, st[h]);
    // 体: 叩く太鼓の側へ少し回る・前かがみ・強い打で沈む
    // 2 つの手の叩く所の、体の左右 (+ が奏者の左) の位置の平均
    let meanLeft = 0;
    for (let h = 0; h < 2; h++) { const s = st[h]; vS.copy(p.spots[s.d0][h]).lerp(p.spots[s.d1][h], s.lat).sub(seat.pos); meanLeft += 0.5 * vS.dot(p.leftDir); }
    const rest = Math.min(st[0].rest, st[1].rest);
    // 強い打で体が少し沈む (振り下ろしと一緒に沈み、当たった瞬間がいちばん深く、0.15 秒で戻る。前と次の打の大きい方なので途中で飛ばない)
    let pulse = 0;
    for (let h = 0; h < 2; h++) {
      const H = p.hands[h], i = p.cur[h].at(t);
      for (let k = Math.max(0, i); k <= i + 1; k++) { const s = H[k]; if (!s || s.roll) continue; const x = t - s.t; pulse = Math.max(pulse, s.A * (x < 0 ? smooth(1 + x / s.dn) ** 2 : Math.exp(-x / 0.15))); }
    }
    const energy = 0.5 * (st[0].y + st[1].y) * (1 - rest);
    const yaw = clamp(Math.atan2(meanLeft, 0.55) * 1.3, -0.52, 0.52) * (1 - 0.6 * rest);   // 片方の太鼓だけを叩く所では上体ごとそちらを向く (最大 30 度。少ないと両手で打つとき腕が胸の前で交差した)
    // 響きを止めるときは、皮へ手が届くように上体を前へ倒し、ひざを少し曲げる
    const damp = smooth(Math.max(st[0].damp, st[1].damp));
    // 振り上げた手の側へ肩を引き、打つ手の側へ返す。強い打では上体ごと前へ打ち込む
    const twist = clamp(0.3 * (st[1].y - st[0].y), -0.2, 0.2) * (1 - rest);
    R.setSpine(g, 0.14 + 0.1 * energy + 0.2 * pulse - 0.05 * rest + 0.3 * damp, yaw + twist, 0);
    B.Hips.position.set(p.hipsBase.x + (0.4 * meanLeft * (1 - rest)) / R.S, p.hipsBase.y + (-0.06 * pulse - 0.04 * damp) / R.S, p.hipsBase.z + (-0.03 * damp) / R.S);
    B.Hips.rotation.set(0, yaw * 0.55, 0);
    g.root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const sd = R.SIDES[i], sgn = R.sgnOf(sd);
      R.solveLeg(g, sd, p.ankles[i], { knee: R.bodyDir(g, sgn * 0.12, 0, 1), foot: { fwd: R.bodyDir(g, sgn * 0.18, 0, 1), up: Y } });
    }
    // 見る先: ふだんは指揮者 (少し太鼓の方へ下げる)。長く休むときは譜面台、入る 2.5 秒前から指揮者
    vLook.copy(p.conductorEye);
    const play = 1 - rest;
    vS.copy(p.spots[st[0].d0][0]).lerp(p.spots[st[1].d0][1], 0.5);
    vLook.lerp(vS, 0.25 * play);
    if (p.standEye) vLook.lerp(p.standEye, 0.7 * smooth((rest - 0.5) / 0.5));
    R.lookAt(g, vLook, 0.8, 0);
    for (let h = 0; h < 2; h++) placeMallet(h, st[h]);
  }

  function placeMallet(h, s) {
    const p = P, side = SIDE[h], sgn = h === 0 ? 1 : -1, m = mallets[h];
    // 当たる所 (頭の中心)。休むときは自分の側の太鼓 (左手は G2、右手は C3) の上で少し手前
    vS.copy(p.spots[s.d0][h]).lerp(p.spots[s.d1][h], s.lat).lerp(p.spots[h][h], s.rest);
    vTP.copy(p.toPlayer[s.d0]).lerp(p.toPlayer[s.d1], s.lat).lerp(p.toPlayer[h], s.rest).normalize();
    vS.addScaledVector(vUp, headR).addScaledVector(vTP, 0.05 * s.rest);
    const ph = lerp(s.y, 0.12, s.rest);
    // マレットの横の向き: 太鼓の方へ、内側へ 19 度 (両手のマレットが前で V の字)
    vOut.copy(p.leftDir).multiplyScalar(sgn);
    vM.copy(vTP).multiplyScalar(-Math.cos(INWARD)).addScaledVector(vOut, -Math.sin(INWARD)).setY(0).normalize();
    // 当たったときの握り = 当たる所から柄の向きに 0.3 m 戻った所。φ のぶん前腕を上げ、手前へ引き、手首を返す
    vDir.copy(vM).multiplyScalar(Math.cos(ANG0)).addScaledVector(vUp, -Math.sin(ANG0));          // 握り → 頭 (当たるとき)
    vG.copy(vS).addScaledVector(vDir, -GRIP).addScaledVector(vUp, LIFT * ph).addScaledVector(vTP, BACK * ph);
    const ang = lerp(ANG0, ANG1, ph);
    vDir.copy(vM).multiplyScalar(-Math.cos(ang)).addScaledVector(vUp, Math.sin(ang));            // 頭 → 柄の端
    // 響きを止める: 指をそろえて皮の縁の近くに置き、マレットは親指と人さし指の間で手首の上へ立てて持つ
    const aL = vAL.copy(A_LOCAL[h]);
    if (s.lift > 0 || s.wr > 0 || s.wp > 0) {
      const d = drums[s.dd], tp = p.toPlayer[s.dd];
      const palmTarget = vS.copy(d.pos).setY(p.membrane[s.dd] + DAMP_PALM).addScaledVector(tp, d.R - 0.07).addScaledVector(vOut, 0.03);
      const fingers = vX.copy(tp).multiplyScalar(-Math.cos(DAMP_TILT)).addScaledVector(vUp, -Math.sin(DAMP_TILT));   // 指先は向こうの少し下へ
      const qD = R.handQuatOf(side, fingers, vDors.copy(vUp).addScaledVector(tp, 0.3));
      const wristD = R.wristFor(g, side, qD, g.points["palm" + side], palmTarget);
      // マレットは握り (親指と人さし指) を軸に回して立てる: 手の向きを変えても握りの点はふだんの所 vG のまま。そのあと手を皮へ下ろす
      const q0 = handQuat(h, vDir, vG);
      qH.copy(q0).slerp(qD, s.wr);
      aL.lerp(A_DAMP[h], s.wr).normalize();
      const wristN = R.wristFor(g, side, qH, g.points["grip" + side], vG).addScaledVector(vUp, 0.14 * s.lift);
      R.solveArm(g, side, wristN.lerp(wristD, s.wp), { pole: R.bodyDir(g, sgn * 0.4, -0.8, -0.35, vP), hand: qH });
    } else {
      const q = handQuat(h, vDir, vG);
      const wrist = R.wristFor(g, side, q, g.points["grip" + side], vG);
      R.solveArm(g, side, wrist, { pole: R.bodyDir(g, sgn * 0.75, -0.6, -0.3, vP), hand: q });   // ひじは外へ
    }
    const d = Math.max(s.wp, 0.6 * s.wr);
    R.setFingers(g, side, [[lerp(0.6, 0.25, d), lerp(0.5, 0.25, d)], [lerp(1.0, 0.15, d), lerp(0.9, 0.1, d)], [lerp(1.2, 0.12, d), lerp(1.1, 0.08, d)], [lerp(1.3, 0.12, d), lerp(1.2, 0.08, d)], [lerp(1.35, 0.15, d), lerp(1.25, 0.1, d)]], [0.9, 0.05, 0, -0.05, -0.1]);
    // マレットを本当の手の握りに置く (頭は握りから柄の向きに 0.3 m)
    R.wquat(B[side + "Hand"], qW);
    vM.copy(aL).applyQuaternion(qW);                           // 握り → 頭
    const grip = R.wpos(g.points["grip" + side], vG);
    m.root.quaternion.copy(R.basisQuat(Y, vX.copy(vM).negate(), X, vDors.copy(X).applyQuaternion(qW), qM));
    m.root.position.copy(grip).addScaledVector(vM, GRIP);
    m.root.updateMatrixWorld(true);
  }
  // マレットの向き (頭 → 柄の端 = dir) と握りの目標 grip から手の向き (指先は前腕の続き。手首を折らない)
  function handQuat(h, dir, grip) {
    const sgn = h === 0 ? 1 : -1;
    return holdQuat(g, SIDE[h], A_LOCAL[h], vX.copy(dir).negate(), g.points["grip" + SIDE[h]], grip, R.bodyDir(g, sgn * 0.4, -0.8, -0.35, vP), h === 0 ? qL : qR);
  }
  const qL = new THREE.Quaternion(), qR = new THREE.Quaternion();

  /* ─────────── 確かめ (rehearse) ─────────── */
  const pt = V(), pt2 = V(), gw = V();
  function registerChecks() {
    const p = P;
    // 打つ瞬間: その手のマレットの頭が皮の上 1 cm 以内 (太鼓の内側)
    stage.addCheck({ id: "timp.contact", player: "timp", times: p.strokes.map((s) => s.t), measure: (sec, k) => {
      const s = p.strokes[k], d = drums[s.d], head = mallets[s.h].point("head", pt);
      const gap = head.y - headR - p.membrane[s.d], r = Math.hypot(head.x - d.pos.x, head.z - d.pos.z);
      return { ok: Math.abs(gap) < 0.01 && r < d.R - 0.02, value: gap, info: { hand: SIDE[s.h], drum: s.d, r: +r.toFixed(3), roll: s.roll } };
    } });
    // 皮を突き抜けない・打つとき以外に皮に触れない・柄が太鼓の胴に入らない・2 本のマレットがぶつからない
    stage.addCheck({ id: "timp.membrane", player: "timp", frames: true, measure: (sec) => {
      let worst = 0, info = null;
      for (let h = 0; h < 2; h++) {
        const m = mallets[h], head = m.point("head", pt);
        drums.forEach((d, k) => {
          const r = Math.hypot(head.x - d.pos.x, head.z - d.pos.z), gap = head.y - headR - p.membrane[k];
          if (r < d.R + 0.01) {
            if (-gap > 0.002 && -gap > worst) { worst = -gap; info = { hand: SIDE[h], what: "through head" }; }
            if (Math.abs(gap) < 0.003) {
              const H = p.hands[h], i = p.cur[h].at(sec + 0.06), near = [H[i], H[i + 1], H[i - 1]].some((s) => s && Math.abs(s.t - sec) <= 0.06);
              if (!near && 0.003 - Math.abs(gap) > worst) { worst = 0.003 - Math.abs(gap); info = { hand: SIDE[h], what: "touch without a stroke" }; }
            }
          }
          // 柄 (握りの先から頭の手前まで) が太鼓の胴 (皮より下) に入らない
          for (let j = 1; j <= 4; j++) {
            m.local(pt2.set(0, 0.02 + 0.33 * j / 4, 0), pt2);
            const rr = Math.hypot(pt2.x - d.pos.x, pt2.z - d.pos.z), below = p.membrane[k] + 0.012 - pt2.y;
            if (rr < d.R + 0.015 && below > 0) { const dep = Math.min(below, d.R + 0.015 - rr); if (dep > worst) { worst = dep; info = { hand: SIDE[h], what: "shaft in drum" }; } }
          }
        });
      }
      const a0 = mallets[0].point("head", pt), a1 = mallets[0].point("grip", pt2), b0 = mallets[1].point("head", gw), b1 = mallets[1].point("grip", V());
      const dm = stage.helpers.distSegments(a0, a1, b0, b1).d;
      if (dm < 0.014 && 0.014 - dm > worst) { worst = 0.014 - dm; info = { what: "mallets touch" }; }
      return { ok: worst < 0.002, value: worst, info };
    } });
    // 2 本の腕が重ならない: 前腕どうし (肘 → 手首 → 手のひら) は 6.5 cm 以上、マレットともう片方の前腕は 4 cm 以上 (前腕の太さ 3 cm)
    const fa = [[V(), V(), V()], [V(), V(), V()]], mh = [V(), V()], mt = [V(), V()];
    stage.addCheck({ id: "timp.arms", player: "timp", frames: true, measure: () => {
      for (let h = 0; h < 2; h++) { const sd = SIDE[h]; R.wpos(B[sd + "ForeArm"], fa[h][0]); R.wpos(B[sd + "Hand"], fa[h][1]); R.wpos(g.points["palm" + sd], fa[h][2]); mallets[h].point("head", mh[h]); mallets[h].local(pt.set(0, 0.374, 0), mt[h]); }
      const D = stage.helpers.distSegments;
      let ff = Infinity, mf = Infinity;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) ff = Math.min(ff, D(fa[0][i], fa[0][i + 1], fa[1][j], fa[1][j + 1]).d);
      for (let h = 0; h < 2; h++) for (let i = 0; i < 2; i++) mf = Math.min(mf, D(mh[h], mt[h], fa[1 - h][i], fa[1 - h][i + 1]).d);
      return { ok: ff >= 0.065 && mf >= 0.04, value: Math.min(ff, mf), info: { forearms: +ff.toFixed(3), malletArm: +mf.toFixed(3) } };
    } });
    // マレットの頭の速さ: 毎コマ 12 m/s 以下 (いちばん強い打の振り下ろしで約 8 m/s。それより速いのは形が飛んだとき)
    const prevHead = [V(), V()]; let prevSec = null;
    stage.addCheck({ id: "timp.speed", player: "timp", frames: true, measure: (sec) => {
      const cont = prevSec != null && sec > prevSec && sec - prevSec < 0.04;
      let v = 0;
      for (let h = 0; h < 2; h++) { const q = mallets[h].point("head", pt); if (cont) v = Math.max(v, q.distanceTo(prevHead[h]) / (sec - prevSec)); prevHead[h].copy(q); }
      prevSec = sec;
      return cont ? { ok: v <= 12, value: v } : null;
    } });
    // 手の回る速さ: 毎コマ 1500 度/秒 (26 rad/s) 以下 (強い打で手首を返しても約 900 度/秒。それより速いのは手の向きが飛んだとき)
    const prevQ = [new THREE.Quaternion(), new THREE.Quaternion()], qq = new THREE.Quaternion(); let prevQs = null;
    stage.addCheck({ id: "timp.hand-turn", player: "timp", frames: true, measure: (sec) => {
      const cont = prevQs != null && sec > prevQs && sec - prevQs < 0.04;
      let w = 0;
      for (let h = 0; h < 2; h++) { R.wquat(B[SIDE[h] + "Hand"], qq); if (cont) w = Math.max(w, qq.angleTo(prevQ[h]) / (sec - prevQs)); prevQ[h].copy(qq); }
      prevQs = sec;
      return cont ? { ok: w <= 26, value: w } : null;
    } });
    // 響きを止める: 押さえている間 (指が触れた直後と、離す直前)、いちばん低い指の腹が皮の上 ±1.2 cm、マレットの頭は皮から 2 cm 以上
    const dampTimes = p.damps.flatMap((d) => [d.tTouch + 0.02, d.tLift - 0.02]);
    stage.addCheck({ id: "timp.damp", player: "timp", times: dampTimes, measure: (sec, j) => {
      const k = j >> 1;
      const dp = p.damps[k], fs = g.fingers[SIDE[dp.h]];
      let low = Infinity; for (const f of fs) low = Math.min(low, R.wpos(f.tip, pt).y - f.radiusM - p.membrane[dp.d]);
      const head = mallets[dp.h].point("head", pt2).y - headR - p.membrane[dp.d];
      return { ok: Math.abs(low) < 0.012 && head > 0.02, value: low, info: { mallet: +head.toFixed(3) } };
    } });
    // マレットが手の中にある
    stage.addCheck({ id: "timp.grip", player: "timp", frames: true, measure: () => {
      let worst = 0;
      for (let h = 0; h < 2; h++) worst = Math.max(worst, R.wpos(g.points["grip" + SIDE[h]], gw).distanceTo(mallets[h].point("grip", pt)));
      return { ok: worst < 0.01, value: worst };
    } });
    // 手とマレットが体に入らない
    stage.addCheck({ id: "timp.body", player: "timp", frames: true, measure: () => {
      let worst = 0, what = "";
      for (const sd of R.SIDES) for (const [nm, o] of handPoints(g, sd)) { const d = bodyDepth(g, R.wpos(o, pt), true); if (d > worst) { worst = d; what = sd + "." + nm; } }
      for (let h = 0; h < 2; h++) for (let j = 0; j <= 3; j++) { const d = bodyDepth(g, mallets[h].local(pt.set(0, 0.374 * j / 3, 0), pt), false); if (d > worst) { worst = d; what = "mallet" + h; } }
      return { ok: worst < 0.005, value: worst, info: what };
    } });
    // 足の裏は床 (ひな壇の上)
    stage.addCheck({ id: "timp.feet", player: "timp", frames: true, measure: () => {
      let worst = 0;
      for (const sd of R.SIDES) worst = Math.max(worst, Math.abs(R.wpos(B[sd + "Foot"], pt).y - R.SOLE - seat.floorY));
      return { ok: worst < 0.01, value: worst };
    } });
  }

  return {
    plan(notes) {
      P = build(notes);
      this.planInfo = P;
      registerChecks();
    },
    pose(sec, dt) { poseAll(sec); },
  };
}
