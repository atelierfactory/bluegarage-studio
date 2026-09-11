#!/usr/bin/env node
// ═══════════ Claude Opus 5 の演奏解釈エンジン ═══════════
//   node --experimental-loader ./tools/band-node-loader.mjs tools/opus-interpret.mjs <plan> [--out <file>]
//
// Fable 5.1 の解釈（8 小節ずつ API に投げる）との違い:
//   1. 曲全体を一度に見る → 長い弧（どこが頂点か）を設計でき、8 小節ごとの継ぎ目が無い。
//   2. 楽譜（LilyPond）に書かれた強弱記号を小節番号つきで読み、そこを土台にする（推測しない）。
//   3. tempoMap を書けるので、フェルマータ・リタルダンド・カデンツァを本物の時間の揺れとして作れる
//      （Fable の流れは 1 音あたり ±0.06 拍しか動かせない）。
//   4. 声部（旋律・内声・低音）を時刻ごとに判定し、ピアニストの「バランス」を作る。
//
// 出力: public/piano/repertoire/<name>.vesper.json （既存の形式。interpretation.model = "claude-opus-5"）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMidi } from "../public/js/midiread.js";
import { autoFinger } from "../public/js/fingering.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REP = path.join(__dirname, "..", "public", "piano", "repertoire");
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

/* ── 強弱記号 → 基準の強さ ─────────────────────────────────────── */
export const DYN = { ppp: 24, pp: 33, p: 46, mp: 58, mf: 70, f: 86, ff: 101, fff: 114 };

/* ── LilyPond から強弱記号を小節つきで読む ──────────────────────── */
export function marksFromLy(lyPath, { parts = ["partRH", "partLH"] } = {}) {
  const src = fs.readFileSync(lyPath, "utf8");
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const from = src.indexOf(parts[i]);
    if (from < 0) continue;
    const to = i + 1 < parts.length ? src.indexOf(parts[i + 1]) : -1;
    const text = src.slice(from, to > from ? to : undefined);
    let bar = 1;
    for (const line of text.split("\n")) {
      const c = line.match(/^%%%\s*(\d+)\s*-\s*(\d+)/);
      if (c) { bar = +c[1]; continue; }
      if (/^\s*%/.test(line)) continue;
      const re = /\\(ppp|pp|mp|mf|fff|ff|sfz|sf|fp|p|f)\b|\\(cresc|dim|decresc)\b|\\([<>!])|\|/g;
      let m;
      while ((m = re.exec(line))) {
        if (m[0] === "|") { bar++; continue; }
        out.push({ bar, mark: m[1] ?? m[2] ?? m[3], hand: i === 0 ? "R" : "L" });
      }
    }
  }
  return out.sort((a, b) => a.bar - b.bar);
}

/* ── 強弱の曲線を作る ────────────────────────────────────────────
   記号を順に見て、小節ごとの基準の強さを決める。
   `<` `cresc` は次の実際の記号まで直線で上げ、`>` `dim` は下げる。
   `!` は「ここで山カッコ終わり」。sf/fp はその小節だけの尖り（曲線には入れない）。 */
export function dynamicCurve(marks, bars, { start = "f", overrides = [] } = {}) {
  const level = new Array(bars + 2).fill(null);
  const spikes = new Map();          // bar -> [mark]
  let cur = DYN[start] ?? 86;
  let hair = null;                    // {fromBar, dir}
  level[1] = cur;
  const points = [];                  // {bar, v}
  for (const m of marks) {
    const b = clamp(m.bar, 1, bars);
    if (["sf", "sfz", "fp"].includes(m.mark)) { (spikes.get(b) ?? spikes.set(b, []).get(b)).push(m.mark); continue; }
    if (m.mark === "<" || m.mark === "cresc") { hair = { fromBar: b, dir: +1 }; continue; }
    if (m.mark === ">" || m.mark === "dim" || m.mark === "decresc") { hair = { fromBar: b, dir: -1 }; continue; }
    if (m.mark === "!") { hair = null; continue; }
    const v = DYN[m.mark];
    if (v == null) continue;
    points.push({ bar: b, v, hair });
    hair = null;
  }
  // 点を順に置き、間を埋める（山カッコがあれば直線、無ければ前の値を保つ＝subito）
  let prev = { bar: 1, v: cur };
  for (const p of points) {
    const from = prev.bar, to = p.bar;
    if (p.hair && to > from) {
      // 山カッコ: 始まりの小節から目標の 1 小節前まで直線で近づく
      const h0 = Math.max(from, p.hair.fromBar);
      for (let b = from; b < h0; b++) level[b] = prev.v;
      for (let b = h0; b < to; b++) level[b] = lerp(prev.v, p.v, (b - h0 + 1) / Math.max(1, to - h0 + 1));
    } else {
      for (let b = from; b < to; b++) level[b] = prev.v;       // subito（急に変わる）
    }
    level[to] = p.v;
    prev = p;
  }
  for (let b = prev.bar; b <= bars + 1; b++) if (level[b] == null) level[b] = prev.v;
  for (let b = 1; b <= bars + 1; b++) if (level[b] == null) level[b] = cur;
  // 手で足す上書き（私の解釈。楽譜に無い所の作り込み）
  for (const o of overrides) {
    const v0 = typeof o.from === "string" ? DYN[o.from] : o.from;
    const v1 = typeof o.to === "string" ? DYN[o.to] : (o.to == null ? v0 : o.to);
    for (let b = o.fromBar; b <= o.toBar; b++) {
      const t = o.toBar === o.fromBar ? 1 : (b - o.fromBar) / (o.toBar - o.fromBar);
      level[clamp(b, 1, bars + 1)] = lerp(v0, v1, t);
    }
  }
  return { level, spikes };
}

/* ── 声部の判定 ──────────────────────────────────────────────────
   時刻ごとに、右手の一番上＝旋律、左手の一番下＝低音、その間＝内声。
   同じ高さの音が刻み続けている（伴奏の反復）なら、さらに引く。 */
function voiceRoles(notes) {
  const byTime = new Map();
  for (const n of notes) { const k = n.s.toFixed(4); (byTime.get(k) ?? byTime.set(k, []).get(k)).push(n); }
  const role = new Map();
  for (const [, group] of byTime) {
    const rh = group.filter((n) => n.h === "R"), lh = group.filter((n) => n.h === "L");
    const top = rh.length ? Math.max(...rh.map((n) => n.p)) : Math.max(...group.map((n) => n.p));
    const bottom = lh.length ? Math.min(...lh.map((n) => n.p)) : Math.min(...group.map((n) => n.p));
    for (const n of group) role.set(n, n.p === top ? "melody" : n.p === bottom ? "bass" : "inner");
  }
  // 反復の伴奏（同じ高さが 3 回以上続けて刻まれる）を見つけて印を付ける
  const seq = notes.slice().sort((a, b) => a.s - b.s || a.p - b.p);
  const runs = new Map();
  for (let i = 0; i < seq.length; i++) {
    const n = seq[i];
    if (role.get(n) === "melody") continue;
    let run = 1;
    for (let j = i + 1; j < seq.length && run < 8; j++) {
      const m = seq[j];
      if (m.p !== n.p || m.h !== n.h) continue;
      if (m.s - n.s > 1.01) break;
      run++;
    }
    if (run >= 3) runs.set(n, true);
  }
  return { role, repeated: runs };
}

/* ── 動機（同じ高さの短い音 3 つ + 長い音）を探す ────────────────── */
function findMotifs(notes, { shortDur = 0.5, minLong = 1.4 } = {}) {
  const byTime = new Map();
  for (const n of notes) { const k = +n.s.toFixed(4); (byTime.get(k) ?? byTime.set(k, []).get(k)).push(n); }
  const times = [...byTime.keys()].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 3 < times.length; i++) {
    const g = [0, 1, 2, 3].map((k) => byTime.get(times[i + k]));
    const tops = g.map((a) => Math.max(...a.map((n) => n.p)));
    const durs = g.map((a) => Math.min(...a.map((n) => n.d)));
    const gaps = [1, 2, 3].map((k) => times[i + k] - times[i + k - 1]);
    if (!gaps.every((x) => Math.abs(x - shortDur) < 1e-6)) continue;
    if (!(tops[0] === tops[1] && tops[1] === tops[2] && tops[3] !== tops[2] && durs[3] >= minLong)) continue;
    out.push({ shorts: [g[0], g[1], g[2]], long: g[3], at: times[i] });
  }
  return out;
}

/* ── ペダル ──────────────────────────────────────────────────────
   低音（左手の一番下）が変わったら踏み替える。style で長さと濃さを変える。 */
function makePedal(notes, curveBar, plan, TS) {
  const out = [];
  const styleAt = (bar) => {
    for (const s of plan.sections ?? []) if (bar >= s.from && bar <= s.to) return s.pedal ?? "harmonic";
    return "harmonic";
  };
  const seq = notes.slice().sort((a, b) => a.s - b.s);
  const lows = [];
  const byTime = new Map();
  for (const n of seq) { const k = +n.s.toFixed(4); (byTime.get(k) ?? byTime.set(k, []).get(k)).push(n); }
  for (const [t, g] of [...byTime.entries()].sort((a, b) => a[0] - b[0])) {
    const lh = g.filter((n) => n.h === "L");
    const low = Math.min(...(lh.length ? lh : g).map((n) => n.p));
    if (!lows.length || lows[lows.length - 1].p !== low) lows.push({ s: t, p: low });
  }
  const endBeat = Math.max(...seq.map((n) => n.s + n.d));
  for (let i = 0; i < lows.length; i++) {
    const s = lows[i].s, next = i + 1 < lows.length ? lows[i + 1].s : endBeat;
    const bar = Math.floor(s / TS) + 1;
    const style = styleAt(bar);
    if (style === "dry") continue;                      // 踏まない（動機・刻みの所）
    let d = next - s;
    if (style === "short") d = Math.min(d, TS * 0.5);
    if (style === "long") d = Math.min(next - s + TS * 0.25, TS * 2);
    d -= 0.03;                                          // 次の和音の前に上げる（濁らせない）
    if (d > 0.08) out.push({ s: +s.toFixed(4), d: +d.toFixed(4) });
  }
  return out.sort((a, b) => a.s - b.s);
}

/* ── テンポの地図（フェルマータ・リタルダンド・カデンツァ） ──────── */
function makeTempoMap(plan, TS) {
  const pts = [];
  const push = (beat, tempo) => pts.push({ beat: +beat.toFixed(4), tempo: +tempo.toFixed(2) });
  const base = plan.tempo;
  push(0, base);
  for (const r of plan.rubato ?? []) {
    const b0 = (r.fromBar - 1) * TS + (r.fromBeat ?? 0);
    const b1 = (r.toBar - 1) * TS + (r.toBeat ?? TS);
    if (r.shape === "hold") {                            // フェルマータ: その場で大きく伸ばす
      push(b0 - 0.001, base * (r.before ?? 1));
      push(b0, base * r.amount);
      push(b1, base * r.amount);
      push(b1 + 0.001, base * (r.after ?? 1));
    } else if (r.shape === "rit") {                      // だんだん遅く
      push(b0, base * (r.before ?? 1));
      push(b1, base * r.amount);
      if (r.after !== null) push(b1 + 0.001, base * (r.after ?? 1));
    } else if (r.shape === "accel") {
      push(b0, base * (r.before ?? 1));
      push(b1, base * r.amount);
      if (r.after !== null) push(b1 + 0.001, base * (r.after ?? 1));
    } else if (r.shape === "tempo") {                    // その区間だけ別のテンポ
      push(b0, base * r.amount);
      push(b1, base * r.amount);
      if (r.after !== null) push(b1 + 0.001, base * (r.after ?? 1));
    }
  }
  return pts.sort((a, b) => a.beat - b.beat).filter((p, i, a) => i === 0 || p.beat !== a[i - 1].beat || p.tempo !== a[i - 1].tempo);
}

/* ── 本体 ───────────────────────────────────────────────────────── */
export function interpret(plan) {
  const buf = fs.readFileSync(path.join(REP, plan.midi));
  const midi = parseMidi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const TS = plan.timeSig ?? (midi.timeSig.den === 8 ? (midi.timeSig.num === 6 ? 6 : 3) : midi.timeSig.num);
  const raw = midi.notes.filter((n) => n.p >= 21 && n.p <= 108)
    .map((n) => ({ p: n.p, s: +n.s.toFixed(4), d: +Math.max(0.05, n.d).toFixed(4), v: n.v, track: n.track }));
  const notes = autoFinger(raw, { tracks: midi.tracks });
  const endBeat = Math.max(...notes.map((n) => n.s + n.d));
  const bars = Math.ceil(endBeat / TS);

  const marks = plan.ly ? marksFromLy(plan.ly, plan.lyParts ? { parts: plan.lyParts } : undefined) : (plan.marks ?? []);
  const { level, spikes } = dynamicCurve(marks, bars, { start: plan.startDynamic ?? "f", overrides: plan.dynamics ?? [] });
  const { role, repeated } = voiceRoles(notes);
  const motifs = plan.motif === false ? [] : findMotifs(notes, plan.motif ?? {});
  const inMotif = new Map();
  for (const m of motifs) {
    m.shorts.forEach((g, i) => g.forEach((n) => inMotif.set(n, { kind: "short", i })));
    m.long.forEach((n) => inMotif.set(n, { kind: "long" }));
  }

  const sectionAt = (bar) => (plan.sections ?? []).find((s) => bar >= s.from && bar <= s.to) ?? {};

  // 小節の中の位置（強拍か裏拍か）
  const stressOf = (s) => {
    const inBar = ((s / TS) % 1) * TS;                   // 0 = 小節の頭
    if (Math.abs(inBar) < 1e-6) return 1;                 // 強拍
    if (Math.abs(inBar - Math.round(inBar)) < 1e-6) return 0.45;  // 拍の頭
    return 0;                                             // 拍の裏
  };

  for (const n of notes) {
    const bar = Math.floor(n.s / TS) + 1;
    const sec = sectionAt(bar);
    let v = level[clamp(bar, 1, bars + 1)] ?? 70;

    // 声部のバランス（ここがピアニストらしさ）
    const r = role.get(n);
    const bal = sec.balance ?? {};
    if (r === "melody") v += bal.melody ?? 8;
    else if (r === "bass") v += bal.bass ?? 1;
    else v += bal.inner ?? -11;
    if (repeated.get(n) && r !== "melody") v += bal.repeated ?? -5;

    // 拍の重み
    const st = stressOf(n.s);
    v += (sec.stress ?? 3) * (st === 1 ? 1 : st === 0.45 ? 0.1 : -0.8);

    // 動機（タタタ・ター）
    const mo = inMotif.get(n);
    if (mo) {
      if (mo.kind === "short") v += [-5, -2.5, 0][mo.i] + (sec.motif ?? 0);
      else v += (sec.motifLong ?? 5);
    }

    // 楽譜の sf / fp
    const sp = spikes.get(bar);
    if (sp && st >= 0.45) {
      if (sp.includes("fp")) v = (r === "melody" ? v + 16 : v + 8);
      else v += (r === "melody" ? 16 : 9);
    }

    // 私が足す強調（頂点の音など）
    for (const a of plan.accents ?? []) {
      if (bar >= a.fromBar && bar <= (a.toBar ?? a.fromBar) && (a.role == null || a.role === r)) v += a.v;
    }

    n.v = clamp(Math.round(v), 1, 127);

    // 音の切り方
    let dd = sec.articulation ?? 0.88;
    if (mo?.kind === "short") dd = sec.motifShort ?? 0.62;
    if (mo?.kind === "long") dd = 1.0;
    if (r === "melody" && (sec.articulation ?? 0.88) >= 0.95) dd = 1.0;
    for (const o of plan.articulation ?? []) if (bar >= o.fromBar && bar <= o.toBar) dd = o.dd;
    n.d = +Math.max(0.05, n.d * dd).toFixed(4);
  }

  // 旋律を少しだけ先に出す（ピアニストの癖。和音の中で旋律が 8ms 早い）
  const lead = plan.melodyLead ?? 0.012;
  if (lead > 0) {
    const byTime = new Map();
    for (const n of notes) { const k = n.s.toFixed(4); (byTime.get(k) ?? byTime.set(k, []).get(k)).push(n); }
    for (const [, g] of byTime) {
      if (g.length < 2) continue;
      const mel = g.find((n) => role.get(n) === "melody");
      if (!mel) continue;
      for (const n of g) if (n !== mel) n.s = +(n.s + lead).toFixed(4);
    }
  }

  const pedal = makePedal(notes, level, plan, TS);
  const tempoMap = makeTempoMap(plan, TS);

  notes.sort((a, b) => a.s - b.s || a.p - b.p);
  const vs = notes.map((n) => n.v).sort((a, b) => a - b);
  const song = {
    version: 2,
    title: plan.title,
    tempo: plan.tempo,
    timeSig: TS,
    key: plan.key ?? "C major",
    concept: plan.concept ?? "",
    sections: [{ name: plan.title, bars, description: "" }],
    chordProgression: [],
    tempoMap,
    pedal,
    master: { glue: 0.3, hallDecay: 2.8, roomDecay: 0.6, targetLufs: -14, width: 1, volume: -4 },
    tracks: [{
      id: "opus-piano", name: "Piano", instrument: "piano", role: "piano", stylePrompt: "",
      color: "#e0b95a", volume: -4, pan: 0, mute: false, solo: false,
      fx: { hall: 0.35, room: 0.15, drive: 0, filter: 0 }, patch: null, midiOut: null,
      notes: notes.map((n, i) => ({ id: `o${i}`, p: n.p, s: n.s, d: n.d, v: n.v, h: n.h, f: n.f })),
      performanceNotes: plan.performanceNotes ?? "",
    }],
    piece: { title: plan.pieceTitle ?? plan.title, composer: plan.composer, year: plan.year, note: plan.note ?? "" },
    kind: "repertoire",
    interpretation: {
      model: "claude-opus-5",
      at: new Date().toISOString(),
      method: "全曲を一度に設計。楽譜 (LilyPond) の強弱記号を小節つきで読み、声部のバランス・動機の形・拍の重み・ペダル・テンポの揺れを決めた。",
      memos: plan.memos ?? [],
      stats: { notes: notes.length, bars, velocity: [vs[0], vs[vs.length - 1]], levels: new Set(vs).size, pedal: pedal.length, tempoPoints: tempoMap.length },
    },
  };
  return { song, bars, marks };
}

/* ── 実行 ───────────────────────────────────────────────────────── */
if (process.argv[1] && process.argv[1].endsWith("opus-interpret.mjs")) {
  const name = process.argv[2];
  if (!name) { console.error("usage: opus-interpret.mjs <plan name>"); process.exit(2); }
  const { PLANS } = await import("./opus-plans.mjs");
  const plan = PLANS[name];
  if (!plan) { console.error(`plan not found: ${name}. ある物: ${Object.keys(PLANS).join(", ")}`); process.exit(2); }
  const { song, bars } = interpret(plan);
  const out = path.join(REP, plan.out);
  fs.writeFileSync(out, JSON.stringify({ song }));
  const s = song.interpretation.stats;
  console.log(`${plan.title}: ${s.notes} 音 / ${bars} 小節 / 強さ ${s.velocity[0]}〜${s.velocity[1]} (${s.levels} 段) / ペダル ${s.pedal} 区間 / テンポの点 ${s.tempoPoints}`);
  console.log(`→ ${path.relative(path.join(__dirname, ".."), out)}`);
}
