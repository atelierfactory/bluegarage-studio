// ═══════════ VESPER BAND — 検査 (体で弾けるか)。機械的に直せる所は直し、残りは issues に書く ═══════════
// 入力: BAND_SCHEMA の形 (s は範囲先頭からの拍)。出力: 正規化済みの synth/pedal/drums/kick/knobs と issues/stats/severity。
// テンポが変わる曲は最速部分の速さで保守的に検査する。

import { LIMITS, NEAR_PAIRS, SYNTH_LOW, SYNTH_HIGH, PEDAL_LOW, PEDAL_HIGH, DRUM_KEYS } from "./prompts.js";
import { KNOBS } from "../js/synth2.js";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);
const HAND_SPAN_MAX = 16;

export function analyzeBand(raw, { song, range }) {
  const ts = song.timeSig || 4;
  const total = range.bars * ts;
  const spb = 60 / Math.max(song.tempo || 120, ...(song.tempoMap ?? []).map((p) => p.tempo || 0));
  const toBeat = (sec) => sec / spb;
  const issues = [], fixes = [];
  const inRange = (s) => s >= -1e-6 && s < total - 1e-6;
  const stats = {};

  // ── 右手のシンセ
  let synth = (raw?.synth ?? []).filter((n) => Number.isFinite(+n.p) && Number.isFinite(+n.s) && inRange(+n.s))
    .map((n) => ({ p: Math.round(clamp(+n.p, SYNTH_LOW, SYNTH_HIGH)), s: +Math.max(0, +n.s).toFixed(4), d: +clamp(num(n.d, 0.5), 0.05, total).toFixed(4), v: Math.round(clamp(num(n.v, 90), 1, 127)), h: "R", f: Number.isFinite(+n.f) ? Math.round(clamp(+n.f, 1, 5)) : null }));
  let clipped = 0;
  for (const n of synth) { if (n.s + n.d > total) { n.d = +(total - n.s).toFixed(4); clipped++; } }
  if (clipped) fixes.push(`範囲外に伸びる右手の音 ${clipped} 個を切った`);
  const rawSynthPitches = (raw?.synth ?? []).filter((n) => +n.p < SYNTH_LOW || +n.p > SYNTH_HIGH).length;
  if (rawSynthPitches) fixes.push(`鍵盤の外の音 ${rawSynthPitches} 個を鍵盤内へ`);
  synth.sort((a, b) => a.s - b.s || a.p - b.p);
  // 同じ音の重なりを切る
  { const last = new Map(); let cut = 0; for (const n of synth) { const prev = last.get(n.p); if (prev && prev.s + prev.d > n.s + 1e-6) { prev.d = +Math.max(0.05, n.s - prev.s).toFixed(4); cut++; } last.set(n.p, n); } if (cut) fixes.push(`同じ鍵の重なり ${cut} 箇所を切った`); }
  // 同時 (0.06 拍以内) の和音: 5 音まで、広がり、指順
  const groups = [];
  for (const n of synth) { const g = groups[groups.length - 1]; if (g && n.s - g.s <= 0.06) g.notes.push(n); else groups.push({ s: n.s, notes: [n] }); }
  let over5 = 0, spanBig = 0, reF = 0, dupF = 0;
  const drop = new Set();
  for (const g of groups) {
    const hand = g.notes.slice().sort((a, b) => a.p - b.p);
    if (hand.length > 5) { over5++; hand.slice(0, hand.length - 5).forEach((n) => drop.add(n)); }   // 低い方から落として上 5 音を残す
    const keep = hand.filter((n) => !drop.has(n));
    const span = keep[keep.length - 1].p - keep[0].p;
    if (span > HAND_SPAN_MAX) { spanBig++; }
    const fs = keep.map((n) => n.f);
    const ok = fs.every((f, i) => f != null && (i === 0 || f > fs[i - 1]));
    if (!ok) { const k = keep.length; const pick = k === 1 ? [k === 1 && keep[0].f ? keep[0].f : 2] : k === 2 ? [1, 5] : k === 3 ? [1, 3, 5] : k === 4 ? [1, 2, 4, 5] : [1, 2, 3, 4, 5]; keep.forEach((n, i) => { n.f = pick[Math.min(i, pick.length - 1)]; }); if (k > 1) reF++; }
    const seen = new Set(); for (const n of keep) { if (seen.has(n.f)) dupF++; seen.add(n.f); }
  }
  if (drop.size) { synth = synth.filter((n) => !drop.has(n)); fixes.push(`同時 6 音以上の和音を 5 音に減らした (${over5} 箇所)`); }
  if (reF) fixes.push(`指番号を ${reF} 箇所並べ直し`);
  if (spanBig) issues.push(`右手の同時の広がりが 16 半音を超える箇所が ${spanBig} 箇所 (届かない)`);
  // 同じ指の速い連打
  { let run = 1, rep = 0; for (let i = 1; i < synth.length; i++) { const a = synth[i - 1], b = synth[i]; if (a.f === b.f && a.p !== b.p && b.s - a.s < 0.2 && b.s > a.s + 1e-6) { run++; if (run === 4) rep++; } else run = 1; } if (rep) issues.push(`右手で同じ指を速く連続して違う鍵に使う箇所が ${rep} 箇所 (指を回す)`); }

  // ── 右足の足鍵盤 (単音)
  let pedal = (raw?.pedal ?? []).filter((n) => Number.isFinite(+n.p) && Number.isFinite(+n.s) && inRange(+n.s))
    .map((n) => ({ p: Math.round(clamp(+n.p, PEDAL_LOW, PEDAL_HIGH)), s: +Math.max(0, +n.s).toFixed(4), d: +clamp(num(n.d, 0.5), 0.05, total).toFixed(4), v: Math.round(clamp(num(n.v, 100), 1, 127)) }))
    .sort((a, b) => a.s - b.s || a.p - b.p);
  { const outP = (raw?.pedal ?? []).filter((n) => +n.p < PEDAL_LOW || +n.p > PEDAL_HIGH).length; if (outP) fixes.push(`足鍵盤の外のベース音 ${outP} 個を C1〜C2 へ (オクターブは寄せた)`); }
  // オクターブは寄せる (クランプでなく折り返し)
  for (const n of pedal) { /* clamp 済み: 端に張り付いた音を折り返す */ }
  {
    let mono = 0, tooFast = 0, jump = 0, overlap = 0, clipped = 0;
    const out = [];
    for (const n of pedal) {
      const prev = out[out.length - 1];
      if (prev) {
        if (Math.abs(n.s - prev.s) < 1e-3) { if (n.p < prev.p) { out[out.length - 1] = n; } mono++; continue; }   // 同時 → 低い方を残す
        const gap = toBeat(Math.abs(n.p - prev.p) > 5 ? LIMITS.pedalJumpGap : LIMITS.pedalGap);
        if (n.s - prev.s < gap - 1e-6) { if (Math.abs(n.p - prev.p) > 5) jump++; else tooFast++; continue; }   // 速すぎる → 落とす
        if (prev.s + prev.d > n.s + 1e-6) { prev.d = +(n.s - prev.s).toFixed(4); overlap++; }
      }
      if (n.s + n.d > total) { n.d = +(total - n.s).toFixed(4); clipped++; }
      out.push(n);
    }
    pedal = out;
    if (overlap) fixes.push(`足鍵盤の重なり ${overlap} 箇所を切った`);
    if (clipped) fixes.push(`範囲外に伸びる足鍵盤 ${clipped} 個を切った`);
    if (mono) fixes.push(`足鍵盤の同時音 ${mono} 個を 1 音に`);
    if (tooFast) fixes.push(`足鍵盤で速すぎる音 ${tooFast} 個を落とした`);
    if (jump) fixes.push(`足鍵盤で大きく飛ぶのに時間が無い音 ${jump} 個を落とした`);
    if (tooFast + jump >= 4) issues.push(`足鍵盤が速すぎる (落とした音 ${tooFast + jump} 個)。次の音まで ${LIMITS.pedalGap} 秒、大きく飛ぶなら ${LIMITS.pedalJumpGap} 秒あける`);
  }

  // ── 左手のスティック (1 度に 1 打)
  let drums = (raw?.drums ?? []).filter((n) => DRUM_KEYS[n.k] && Number.isFinite(+n.s) && inRange(+n.s))
    .map((n) => ({ k: n.k, p: DRUM_KEYS[n.k], s: +Math.max(0, +n.s).toFixed(4), d: 0.25, v: Math.round(clamp(num(n.v, 100), 1, 127)) }))
    .sort((a, b) => a.s - b.s || b.v - a.v);
  {
    let same = 0, near = 0, far = 0, dbl = 0;
    const out = [];
    for (const n of drums) {
      const prev = out[out.length - 1];
      if (prev) {
        const dt = n.s - prev.s;
        if (dt < 1e-3) { dbl++; if (n.v > prev.v || (n.k !== "hh" && prev.k === "hh")) out[out.length - 1] = n; continue; }   // 同時 2 打 → スネア/タム優先、次に強い方
        const kind = n.k === prev.k ? "same" : NEAR_PAIRS.has(`${prev.k}|${n.k}`) ? "near" : "far";
        const need = toBeat(kind === "same" ? LIMITS.stickSame : kind === "near" ? LIMITS.stickNear : LIMITS.stickFar);
        if (dt < need - 1e-6) {
          // 速すぎる: 弱い方 (ハイハット) を落とす。同じ太鼓なら後の方を落とす
          if (n.k !== prev.k && prev.k === "hh") { out[out.length - 1] = n; }
          if (kind === "same") same++; else if (kind === "near") near++; else far++;
          continue;
        }
      }
      out.push(n);
    }
    drums = out;
    if (dbl) fixes.push(`左手の同時 2 打 ${dbl} 箇所を 1 打に (スティックは 1 本)`);
    if (same + near + far) fixes.push(`左手が間に合わない打 ${same + near + far} 個を落とした (連打 ${same}・隣 ${near}・遠い ${far})`);
    if (same + near + far >= 6) issues.push(`左手のドラムが速すぎる / 持ち替えの時間が無い (落とした打 ${same + near + far} 個)。ハイハット刻みの中でスネアの瞬間はハイハットを休む`);
  }

  // ── 左足のバスドラ
  let kick = (raw?.kick ?? []).filter((n) => Number.isFinite(+n.s) && inRange(+n.s)).map((n) => ({ p: 36, s: +Math.max(0, +n.s).toFixed(4), d: 0.25, v: Math.round(clamp(num(n.v, 110), 1, 127)) })).sort((a, b) => a.s - b.s);
  { let fast = 0; const out = []; for (const n of kick) { const prev = out[out.length - 1]; if (prev && n.s - prev.s < toBeat(LIMITS.kick) - 1e-6) { fast++; continue; } out.push(n); } kick = out; if (fast) fixes.push(`バスドラの速すぎる打 ${fast} 個を落とした`); }

  // ── つまみ (右手): 右手の音と重ならない区間だけ残す。重なるものは前後の空きへずらし、無理なら落とす
  let knobs = (raw?.knobs ?? []).filter((k) => KNOBS.some((x) => x.id === k.param) && Number.isFinite(+k.s) && inRange(+k.s))
    .map((k) => ({ param: k.param, s: +Math.max(0, +k.s).toFixed(4), d: +Math.max(toBeat(LIMITS.knobMin), num(k.d, 1)).toFixed(4), to: +clamp(num(k.to, 0.5), 0, 1).toFixed(3) }))
    .sort((a, b) => a.s - b.s);
  {
    const before = toBeat(LIMITS.knobBefore), after = toBeat(LIMITS.knobAfter);
    const busy = (s0, s1) => synth.some((n) => n.s < s1 && n.s + n.d > s0);
    const out = []; let moved = 0, dropped = 0, overlap = 0;
    for (const k of knobs) {
      let s = k.s;
      const last = out[out.length - 1];
      if (last && s < last.s + last.d) { s = +(last.s + last.d).toFixed(4); overlap++; }
      if (s + k.d > total + 1e-6) { dropped++; continue; }
      if (!busy(s - before, s + k.d + after)) { out.push({ ...k, s }); continue; }
      // 近くの空きを探す (前後 2 拍、0.25 刻み)
      let found = null;
      for (let off = 0.25; off <= 2 && found == null; off += 0.25) {
        for (const cand of [s - off, s + off]) { if (cand < 0 || cand + k.d > total) continue; if (last && cand < last.s + last.d) continue; if (!busy(cand - before, cand + k.d + after)) { found = cand; break; } }
      }
      if (found != null) { out.push({ ...k, s: +found.toFixed(4) }); moved++; } else dropped++;
    }
    knobs = out;
    if (overlap) fixes.push(`同時に 2 つのつまみを回していた ${overlap} 箇所を順番に`);
    if (moved) fixes.push(`右手が鍵盤の上にある間のつまみ操作 ${moved} 箇所を空きへずらした`);
    if (dropped) { fixes.push(`右手が空かないつまみ操作 ${dropped} 箇所を落とした`); if (dropped >= 2) issues.push(`つまみを回す前後に右手を空けていない箇所が ${dropped} 箇所 (回す前 ${LIMITS.knobBefore} 秒・後 ${LIMITS.knobAfter} 秒は右手の音を置かない)`); }
  }

  // Sustained notes also occupy fingers and hand span, even with different onsets.
  let held = [], collisions = 0;
  for (const n of synth) {
    held = held.filter((p) => p.s + p.d > n.s + 1e-6);
    if (held.some((p) => p.f === n.f && p.p !== n.p)) collisions++;
    held.push(n);
    if (held.length > 5 || Math.max(...held.map((p) => p.p)) - Math.min(...held.map((p) => p.p)) > HAND_SPAN_MAX) collisions++;
  }
  if (collisions) issues.push(`伸ばしている音と次の音で右手が届かない・指を取り合う箇所が ${collisions} 箇所`);
  if (!synth.length && !pedal.length && !drums.length && !kick.length) issues.push("演奏が空です");
  Object.assign(stats, { synth: synth.length, pedal: pedal.length, drums: drums.length, kick: kick.length, knobs: knobs.length, fixes, over5, spanBig, dupF, count: synth.length + pedal.length + drums.length + kick.length });
  let severity = issues.length ? 1 : 0;
  if (stats.count === 0) severity = 3;
  else if (spanBig >= 4 || issues.length >= 3) severity = 2;
  return { synth, pedal, drums, kick, knobs, issues, stats, severity };
}

export function describeBand(a) {
  const parts = [`右手 ${a.stats.synth}音 / 足鍵盤 ${a.stats.pedal}音 / ドラム ${a.stats.drums}打 / バスドラ ${a.stats.kick}打 / つまみ ${a.stats.knobs}回`];
  if (a.stats.fixes?.length) parts.push(`自動修正: ${a.stats.fixes.join("、")}`);
  if (a.issues.length) parts.push(`指摘: ${a.issues.length}件`);
  return parts.join(" / ");
}
