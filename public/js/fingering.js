// ═══════════ 自動運指 (ルールで手と指を決める) ═══════════
// 読み込んだ MIDI など、手 (h) と指 (f) が無い音符に付ける。
// 手: 2 トラック以上あれば「高い方の平均音の高いトラック = 右手」。1 トラックなら中央 (60) を境に、
//     同時に鳴る音の塊ごとに「下から続く音は左手・上は右手」と切り分け、片手 10 度を超えないようにする。
// 指: 和音は音の順に振る (右手は下から 1→5、左手は上から 1→5)。単音の流れは音程で決める
//     (2 度 = 隣の指、3 度 = 1 つ飛ばし、跳躍 = 親指か小指、下降/上昇の折り返しで親指くぐり)。

export function autoFinger(notes, { tracks = [] } = {}) {
  const out = notes.map((n) => ({ ...n }));
  if (!out.length) return out;
  // 1. 手
  const byTrack = new Map();
  for (const n of out) if (n.track != null) (byTrack.get(n.track) ?? byTrack.set(n.track, []).get(n.track)).push(n);
  const noteTracks = [...byTrack.entries()].filter(([, arr]) => arr.length > 0);
  const needHand = out.some((n) => n.h !== "L" && n.h !== "R");
  if (needHand) {
    if (noteTracks.length >= 2) {
      const avg = (arr) => arr.reduce((a, n) => a + n.p, 0) / arr.length;
      const sorted = noteTracks.sort((a, b) => avg(b[1]) - avg(a[1]));
      const rightIds = new Set(sorted.slice(0, Math.max(1, Math.floor(sorted.length / 2))).map(([id]) => id));
      for (const n of out) n.h = rightIds.has(n.track) ? "R" : "L";
    } else {
      // 同時の塊ごとに分ける
      out.sort((a, b) => a.s - b.s || a.p - b.p);
      let i = 0;
      while (i < out.length) {
        let j = i; while (j < out.length && out[j].s - out[i].s < 0.05) j++;
        const g = out.slice(i, j).sort((a, b) => a.p - b.p);
        if (g.length === 1) g[0].h = g[0].p < 60 ? "L" : "R";
        else {
          // 一番大きい隙間で切る (ただし片手 16 半音以内)。隙間が無ければ 60 で切る
          let cut = -1, best = 0;
          for (let k = 1; k < g.length; k++) { const gap = g[k].p - g[k - 1].p; if (gap > best && gap >= 5) { best = gap; cut = k; } }
          if (cut < 0) cut = g.findIndex((n) => n.p >= 60); if (cut < 0) cut = g.length;
          if (cut === 0 && g[g.length - 1].p - g[0].p <= 16 && g[0].p < 58) cut = g.length;
          g.forEach((n, k) => (n.h = k < cut ? "L" : "R"));
          // 片手が 10 度を超えるなら真ん中で切り直す
          for (const h of ["L", "R"]) { const hs = g.filter((n) => n.h === h); if (hs.length && hs[hs.length - 1].p - hs[0].p > 16) { const mid = Math.floor(g.length / 2); g.forEach((n, k) => (n.h = k < mid ? "L" : "R")); } }
        }
        i = j;
      }
    }
  }
  // 1b. 片手で同時に 15 半音 (10 度) を超えて広がる塊は、楽譜の段の都合なので、届く方の手に端の音を移す
  {
    const srt = out.slice().sort((a, b) => a.s - b.s || a.p - b.p);
    let i = 0;
    while (i < srt.length) {
      let j = i; while (j < srt.length && srt[j].s - srt[i].s < 0.05) j++;
      const g = srt.slice(i, j);
      for (const h of ["L", "R"]) {
        const other = h === "L" ? "R" : "L";
        for (let guard = 0; guard < 6; guard++) {
          const hs = g.filter((n) => n.h === h).sort((a, b) => a.p - b.p);
          if (hs.length < 2 || hs[hs.length - 1].p - hs[0].p <= 15) break;
          const os = g.filter((n) => n.h === other).map((n) => n.p);
          const cand = h === "L" ? hs[hs.length - 1] : hs[0];   // 左手なら一番高い音、右手なら一番低い音
          const fits = !os.length || (Math.max(...os, cand.p) - Math.min(...os, cand.p) <= 15);
          if (!fits) break;
          cand.h = other;
        }
      }
      i = j;
    }
  }
  // 2. 指
  for (const h of ["L", "R"]) {
    const hs = out.filter((n) => n.h === h).sort((a, b) => a.s - b.s || a.p - b.p);
    let prev = null;   // 直前の単音 {p, f}
    let i = 0;
    while (i < hs.length) {
      let j = i; while (j < hs.length && hs[j].s - hs[i].s < 0.05) j++;
      const g = hs.slice(i, j).sort((a, b) => a.p - b.p);
      if (g.length > 1) {
        const order = h === "R" ? g : g.slice().reverse();
        const pick = g.length === 2 ? [1, 5] : g.length === 3 ? [1, 3, 5] : g.length === 4 ? [1, 2, 4, 5] : [1, 2, 3, 4, 5];
        // 2 音で 3 度以内なら 1-2 / 2-3、4〜5 度なら 1-3
        if (g.length === 2) { const iv = g[1].p - g[0].p; pick[1] = iv <= 4 ? 2 : iv <= 7 ? 3 : iv <= 9 ? 4 : 5; }
        order.forEach((n, k) => { if (n.f == null) n.f = pick[Math.min(k, pick.length - 1)]; });
        prev = { p: order[order.length - 1].p, f: order[order.length - 1].f, top: g[g.length - 1].p, bottom: g[0].p };
      } else {
        const n = g[0];
        if (n.f == null) {
          if (!prev) n.f = h === "R" ? 2 : 2;
          else {
            const iv = n.p - prev.p;                               // 上昇 +、下降 -
            const up = h === "R" ? iv > 0 : iv < 0;                 // 「指番号が増える方向」への動き
            const a = Math.abs(iv);
            let f;
            if (a === 0) f = prev.f;                                 // 同音連打は同じ指 (遅ければ可)
            else if (a <= 2) f = up ? prev.f + 1 : prev.f - 1;      // 2 度
            else if (a <= 4) f = up ? prev.f + 2 : prev.f - 2;      // 3 度
            else if (a <= 7) f = up ? prev.f + 3 : prev.f - 3;      // 4〜5 度
            else f = up ? 5 : 1;                                     // 跳躍
            if (f > 5) f = up && a <= 2 ? 1 : 5;                    // 親指くぐり (上へ続くなら親指へ戻す)
            if (f < 1) f = !up && a <= 2 ? 3 : 1;                   // 指越え
            // 黒鍵に親指は避ける
            if (f === 1 && [1, 3, 6, 8, 10].includes(n.p % 12) && a <= 4) f = 2;
            n.f = f;
          }
        }
        prev = { p: n.p, f: n.f };
      }
      i = j;
    }
  }
  return out;
}
