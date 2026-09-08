// ═══════════ 生成結果の検査と自動修正 (純粋関数・ブラウザ/Node 共通) ═══════════
// Claude が返したノートを「編集者」として検査する:
//   - 空 / 範囲外 / 音域外 / 同音の重なり / 同時発音数の超過 (演奏不能)
//   - 強拍で伸ばす音がコードにもスケールにも無い (ぶつかり)
//   - 役割に対して薄すぎる / 一定ベロシティ
// 機械的に直せるもの (音域・重なり・範囲) はここで直し、音楽的な問題は issues として返す。
// issues が重いときは呼び出し側が Claude に "revise" モードで出し直させる。

import { INSTRUMENT_RANGE, INSTRUMENT_POLY, parseChord, keyScale, noteName } from "./prompts.js";

const ROLE_MIN_DENSITY = { drums: 4, bass: 2, chords: 1.5, arpeggio: 4, melody: 1.2, lead: 1.2, pad: 0.5, "counter-melody": 1, percussion: 1 };

function roleKey(track) {
  const r = String(track.role ?? "").toLowerCase();
  for (const k of Object.keys(ROLE_MIN_DENSITY)) if (r.includes(k)) return k;
  if (track.instrument === "drums") return "drums";
  if (/bass/.test(track.instrument)) return "bass";
  if (/pad/.test(track.instrument)) return "pad";
  return null;
}

// コード進行から「範囲基準の拍 → コード」を引く
function chordLookup(song, range) {
  const ts = song.timeSig;
  const list = (song.chordProgression ?? [])
    .map((c) => ({ beat: c.bar * ts + c.beat - range.startBar * ts, chord: parseChord(c.chord) }))
    .sort((a, b) => a.beat - b.beat);
  return (beat) => { let cur = null; for (const c of list) { if (c.beat <= beat + 1e-6) cur = c.chord; else break; } return cur; };
}

/**
 * @param {Array} rawNotes  Claude の出力 (s は範囲先頭基準)
 * @param {{song, track, range}} ctx
 * @returns {{notes:Array, issues:string[], stats:object, severity:number}}
 *   severity: 0=問題なし 1=軽い 2=出し直し推奨 3=空
 */
export function analyzeNotes(rawNotes, { song, track, range }) {
  const ts = song.timeSig;
  const totalBeats = range.bars * ts;
  const isDrum = track.instrument === "drums";
  const issues = [];
  const fixes = [];
  let notes = (rawNotes ?? []).filter((n) => Number.isFinite(n.p) && n.p >= 0 && n.p <= 127 && Number.isFinite(n.s) && Number.isFinite(n.d) && Number.isFinite(n.v));

  if (!notes.length) return { notes: [], issues: ["ノートが 1 つも無い (空の演奏)"], stats: { count: 0 }, severity: 3 };

  // 1. 範囲・値のクランプ
  let outOfRange = 0;
  notes = notes.filter((n) => { if (n.s < -1e-6 || n.s >= totalBeats - 1e-6) { outOfRange++; return false; } return true; })
    .map((n) => ({
      p: Math.max(0, Math.min(127, Math.round(n.p))),
      s: +Math.max(0, n.s).toFixed(4),
      d: +Math.max(0.05, Math.min(n.d || 0.1, totalBeats - n.s)).toFixed(4),
      v: Math.max(1, Math.min(127, Math.round(n.v))),
      ...(n.v2 != null && Number.isFinite(n.v2) ? { v2: Math.max(1, Math.min(127, Math.round(n.v2))) } : {}),
    }));
  if (outOfRange) fixes.push(`範囲外の ${outOfRange} 音を削除`);
  if (!notes.length) return { notes: [], issues: ["全ノートが生成範囲の外"], stats: { count: 0 }, severity: 3 };

  // 2. 音域 (オクターブ移動で直す)
  const [lo, hi] = INSTRUMENT_RANGE[track.instrument] ?? [0, 127];
  let moved = 0;
  if (!isDrum) {
    for (const n of notes) {
      let guard = 0;
      while (n.p < lo && guard++ < 6) { n.p += 12; moved++; }
      while (n.p > hi && guard++ < 12) { n.p -= 12; moved++; }
    }
    if (moved) fixes.push(`音域外の ${moved} 音をオクターブ移動`);
  } else {
    // ドラムは GM 範囲外を近いキットに寄せない (そのまま。再生側で扱う)
  }

  // 3. 同音の重なり (前の音を次の音の頭で切る) と完全重複の除去
  notes.sort((a, b) => a.s - b.s || a.p - b.p);
  const seen = new Set();
  let dup = 0, trimmed = 0;
  notes = notes.filter((n) => { const k = `${n.p}@${n.s.toFixed(3)}`; if (seen.has(k)) { dup++; return false; } seen.add(k); return true; });
  if (!isDrum) {
    const lastByPitch = new Map();
    for (const n of notes) {
      const prev = lastByPitch.get(n.p);
      if (prev && prev.s + prev.d > n.s + 1e-4) { prev.d = +Math.max(0.05, n.s - prev.s - 0.01).toFixed(4); trimmed++; }
      lastByPitch.set(n.p, n);
    }
  }
  if (dup) fixes.push(`完全重複 ${dup} 音を削除`);
  if (trimmed) fixes.push(`同音の重なり ${trimmed} 箇所を短縮`);

  // 4. 同時発音数 (演奏不能) — 単音楽器で和音になっていたら上の音だけ残す
  const maxPoly = INSTRUMENT_POLY[track.instrument] ?? 16;
  if (!isDrum && maxPoly <= 2) {
    const groups = new Map();
    for (const n of notes) { const k = n.s.toFixed(2); (groups.get(k) ?? groups.set(k, []).get(k)).push(n); }
    let cut = 0;
    const keep = new Set();
    for (const arr of groups.values()) {
      arr.sort((a, b) => b.p - a.p);
      arr.slice(0, maxPoly).forEach((n) => keep.add(n));
      cut += Math.max(0, arr.length - maxPoly);
    }
    if (cut) { notes = notes.filter((n) => keep.has(n)); fixes.push(`単音楽器の和音 ${cut} 音を間引き`); }
  }

  // 5. コードとのぶつかり (強拍・長い音・非和声音でスケール外)
  const chordAt = chordLookup(song, range);
  const scale = keyScale(song.key);
  let clashes = 0, strongChecked = 0;
  const clashList = [];
  if (!isDrum) {
    for (const n of notes) {
      const beatInBar = ((n.s % ts) + ts) % ts;
      const strong = Math.abs(beatInBar - Math.round(beatInBar)) < 0.07 && (Math.round(beatInBar) % 2 === 0);
      if (!strong || n.d < 0.75) continue;
      const ch = chordAt(n.s);
      if (!ch) continue;
      strongChecked++;
      const pc = ((n.p % 12) + 12) % 12;
      const inChord = ch.tones.has(pc);
      const inScale = scale ? scale.has(pc) : true;
      // コードトーンでもスケールでも無い音、または長い音 (2 拍以上) でコードトーンでない
      if (!inChord && (!inScale || n.d >= 2)) {
        clashes++;
        if (clashList.length < 12) clashList.push(`bar ${Math.floor(n.s / ts)} beat ${+beatInBar.toFixed(2)}: ${noteName(n.p)} (${n.d}拍) は ${ch.sym} に合わない`);
      }
    }
  }
  if (clashes) issues.push(`強拍で伸ばす音がコードにぶつかる箇所が ${clashes} 箇所 (検査 ${strongChecked} 箇所中): ${clashList.join(" / ")}`);

  // 6. 密度 (役割に対して薄い)
  const rk = roleKey(track);
  const density = notes.length / range.bars;
  const minDensity = rk ? ROLE_MIN_DENSITY[rk] : 0.8;
  const sparse = density < minDensity && range.bars >= 4;
  if (sparse) issues.push(`密度が薄い: 1 小節あたり ${density.toFixed(1)} 音 (役割 ${track.role ?? track.instrument} の目安は ${minDensity} 音以上)。特に主役の楽器なら歌えるフレーズをもっと置く`);

  // 7. 空の小節が多い (範囲の 40% 超)
  const barsWithNotes = new Set(notes.map((n) => Math.floor(n.s / ts)));
  const emptyBars = range.bars - barsWithNotes.size;
  if (emptyBars > range.bars * 0.4 && rk !== "pad") issues.push(`${range.bars} 小節中 ${emptyBars} 小節が無音。休符が意図なら可、そうでなければ埋める`);

  // 8. ベロシティが機械的
  const vs = notes.map((n) => n.v);
  const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
  const sd = Math.sqrt(vs.reduce((a, b) => a + (b - mean) ** 2, 0) / vs.length);
  if (vs.length >= 8 && sd < 3) issues.push(`ベロシティがほぼ一定 (平均 ${mean.toFixed(0)}, ばらつき ${sd.toFixed(1)})。アクセントとゴーストで抑揚を付ける`);

  // 9. 大きすぎる同時発音 (ピアノ 10 音超など)
  if (!isDrum && maxPoly > 2) {
    const groups = new Map();
    for (const n of notes) { const k = n.s.toFixed(2); groups.set(k, (groups.get(k) ?? 0) + 1); }
    const over = [...groups.values()].filter((c) => c > maxPoly).length;
    if (over) issues.push(`同時発音が ${maxPoly} 音を超える箇所が ${over} 箇所 (演奏不能)`);
  }

  const ps = notes.map((n) => n.p);
  const stats = { count: notes.length, density: +density.toFixed(2), lo: Math.min(...ps), hi: Math.max(...ps), meanVel: Math.round(mean), velSd: +sd.toFixed(1), clashes, strongChecked, emptyBars, fixes };

  let severity = 0;
  if (issues.length) severity = 1;
  if (sparse || (clashes >= 3 && clashes / Math.max(1, strongChecked) > 0.08) || emptyBars > range.bars * 0.4 && rk !== "pad") severity = 2;
  return { notes, issues, stats, severity };
}

/** 検査結果を人が読める 1 行に */
export function describeAnalysis(a) {
  const parts = [`${a.stats.count}音`];
  if (a.stats.fixes?.length) parts.push(`自動修正: ${a.stats.fixes.join("、")}`);
  if (a.issues.length) parts.push(`指摘: ${a.issues.length}件`);
  return parts.join(" / ");
}

/* ================================ PIANO: 運指・両手・ペダルの検査 ================================ */
// analyzeNotes の上に、ピアノ独奏ならではの「人の手で弾けるか」を足す。機械的に直せるものは直す。
const HAND_SPAN_MAX = 16;   // 半音 (10 度)
const HAND_SPAN_WARN = 14;  // 9 度を超えたら数える

export function analyzePiano(raw, { song, range }) {
  const track = { instrument: "piano", role: "piano" };
  const base = analyzeNotes((raw?.notes ?? []).map((n) => ({ ...n })), { song, track, range });
  // 手と指を元の配列から引き継ぐ (analyzeNotes は p/s/d/v だけ残す)
  const srcByKey = new Map();
  for (const n of raw?.notes ?? []) if (Number.isFinite(n.p) && Number.isFinite(n.s)) srcByKey.set(`${Math.round(n.p)}@${(+n.s).toFixed(3)}`, n);
  const notes = base.notes.map((n) => { const src = srcByKey.get(`${n.p}@${n.s.toFixed(3)}`) ?? {}; return { ...n, h: src.h === "L" || src.h === "R" ? src.h : null, f: Number.isFinite(src.f) ? Math.max(1, Math.min(5, Math.round(src.f))) : null }; });
  const issues = [...base.issues];
  const fixes = [...(base.stats.fixes ?? [])];
  if (!notes.length) return { ...base, notes, pedal: [], issues, severity: 3 };

  // 1. 手が無い音 → 中央 (60) を境に割り振り
  let assignedH = 0;
  for (const n of notes) if (!n.h) { n.h = n.p < 60 ? "L" : "R"; assignedH++; }
  if (assignedH) fixes.push(`手の指定が無い ${assignedH} 音を音域で振り分け`);

  // 2. 同時 (0.06 拍以内) の和音ごとに: 片手 5 音超、指の順、指の重複、広がり、交差
  const sorted = notes.slice().sort((a, b) => a.s - b.s || a.p - b.p);
  const groups = [];
  for (const n of sorted) { const g = groups[groups.length - 1]; if (g && n.s - g.s <= 0.06) g.notes.push(n); else groups.push({ s: n.s, notes: [n] }); }
  let over5 = 0, spanBig = 0, cross = 0, reFingered = 0, dupF = 0;
  const spanList = [];
  for (const g of groups) {
    for (const h of ["L", "R"]) {
      const hand = g.notes.filter((n) => n.h === h).sort((a, b) => a.p - b.p);
      if (!hand.length) continue;
      if (hand.length > 5) over5++;
      const span = hand[hand.length - 1].p - hand[0].p;
      if (span > HAND_SPAN_WARN) { spanBig++; if (spanList.length < 8) spanList.push(`bar ${Math.floor(g.s / song.timeSig)}: ${h} 手 ${span} 半音`); }
      // 指順: 右手は低→高で 1→5、左手は高→低で 1→5。崩れていたら並べ直す
      const order = h === "R" ? hand : hand.slice().reverse();
      const fs = order.map((n) => n.f);
      const okOrder = fs.every((f, i) => f != null && (i === 0 || f > fs[i - 1]));
      if (!okOrder && hand.length > 1) {
        const n = hand.length;
        const pick = n === 1 ? [1] : n === 2 ? [1, 5] : n === 3 ? [1, 3, 5] : n === 4 ? [1, 2, 4, 5] : [1, 2, 3, 4, 5];
        order.forEach((x, i) => { x.f = pick[Math.min(i, pick.length - 1)]; });
        reFingered++;
      } else if (hand.length === 1 && hand[0].f == null) { hand[0].f = hand[0].p % 12 && [1, 3, 6, 8, 10].includes(hand[0].p % 12) ? 3 : 2; reFingered++; }
      const seen = new Set();
      for (const x of hand) { if (seen.has(x.f)) dupF++; seen.add(x.f); }
    }
    const L = g.notes.filter((n) => n.h === "L"), R = g.notes.filter((n) => n.h === "R");
    if (L.length && R.length && Math.max(...L.map((n) => n.p)) > Math.min(...R.map((n) => n.p))) cross++;
  }
  if (reFingered) fixes.push(`指番号を ${reFingered} 箇所並べ直し`);
  if (over5) issues.push(`片手で同時に 6 音以上押している箇所が ${over5} 箇所 (弾けない)`);
  if (dupF) issues.push(`同じ手の同じ指を同時に 2 鍵に使っている箇所が ${dupF} 箇所`);
  if (spanBig) issues.push(`片手の広がりが 9 度を超える箇所が ${spanBig} 箇所: ${spanList.join(" / ")}`);
  if (cross) issues.push(`左手が右手より高い音を弾いている (交差) 箇所が ${cross} 箇所`);

  // 3. 同じ手・同じ指の速い連打 (0.2 拍未満で 4 回以上続く)
  let repeat = 0;
  for (const h of ["L", "R"]) {
    const hs = sorted.filter((n) => n.h === h);
    let run = 1;
    for (let i = 1; i < hs.length; i++) { if (hs[i].f === hs[i - 1].f && hs[i].p !== hs[i - 1].p && hs[i].s - hs[i - 1].s < 0.2 && hs[i].s > hs[i - 1].s + 1e-6) { run++; if (run === 4) repeat++; } else run = 1; }
  }
  if (repeat) issues.push(`同じ指で違う鍵を速く連続して弾く箇所が ${repeat} 箇所 (指を回す)`);

  // 4. ペダル区間: 範囲内にクランプ、重なりを結合
  const totalBeats = range.bars * song.timeSig;
  let pedal = (raw?.pedal ?? []).filter((p) => Number.isFinite(p.s) && Number.isFinite(p.d) && p.d > 0).map((p) => ({ s: +Math.max(0, p.s).toFixed(4), d: +Math.min(p.d, totalBeats - Math.max(0, p.s)).toFixed(4) })).filter((p) => p.d > 0.05 && p.s < totalBeats).sort((a, b) => a.s - b.s);
  const merged = [];
  for (const p of pedal) { const last = merged[merged.length - 1]; if (last && p.s < last.s + last.d - 1e-6) last.d = +Math.max(last.d, p.s + p.d - last.s).toFixed(4); else merged.push({ ...p }); }
  pedal = merged;

  const stats = { ...base.stats, fixes, over5, spanBig, cross, dupF, repeat, pedalSegments: pedal.length, left: notes.filter((n) => n.h === "L").length, right: notes.filter((n) => n.h === "R").length };
  let severity = issues.length ? 1 : 0;
  if (base.severity >= 2 || over5 >= 2 || dupF >= 3 || spanBig >= 4 || cross >= 4) severity = 2;
  return { notes, pedal, issues, stats, severity };
}
