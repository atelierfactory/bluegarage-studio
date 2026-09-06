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
