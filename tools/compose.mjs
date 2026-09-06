#!/usr/bin/env node
// ═══════════ コマンドラインから曲を丸ごと作る (設計図 → 全トラック生成 (検査・手直し付き) → プリセット保存) ═══════════
//   node tools/compose.mjs --prompt "曲のイメージ" --name my-song [--tempo 120] [--key "D minor"] [--server http://localhost:5173] [--model claude-opus-5]
// ブラウザの UI と同じプロンプト (public/js/prompts.js) と検査 (public/js/critic.js) を使い、生成だけサーバーの /api/track を叩く。
import fs from "node:fs";
import { trackScoreText } from "../public/js/prompts.js";
import { analyzeNotes, describeAnalysis } from "../public/js/critic.js";

const args = process.argv.slice(2);
const opt = { server: "http://localhost:5173" };
for (let i = 0; i < args.length; i++) {
  const a = args[i], v = args[i + 1];
  if (a === "--prompt") { opt.prompt = v; i++; }
  else if (a === "--prompt-file") { opt.prompt = fs.readFileSync(v, "utf8"); i++; }
  else if (a === "--name") { opt.name = v; i++; }
  else if (a === "--tempo") { opt.tempo = +v; i++; }
  else if (a === "--key") { opt.key = v; i++; }
  else if (a === "--server") { opt.server = v; i++; }
  else if (a === "--model") { opt.model = v; i++; }
  else if (a === "--blueprint") { opt.blueprintFile = v; i++; }
  else if (a === "--direction") { opt.direction = v; i++; }
  else if (a === "--song") { opt.songFile = v; i++; }
  else if (a === "--only") { (opt.only ??= []).push(v); i++; }
  else if (a === "--no-revise") opt.noRevise = true;
  else throw new Error("unknown arg " + a);
}
if (!opt.prompt && !opt.blueprintFile && !opt.songFile) throw new Error("--prompt が必要");
if (!opt.name) throw new Error("--name が必要");

let idc = 1;
const uid = () => `id${Date.now().toString(36)}${(idc++).toString(36)}`;
const COLORS = { drums: "#38c3ff", bass: "#2f7bff", piano: "#9fb8ff", epiano: "#7c5cff", organ: "#ff8f5e", "guitar-electric": "#43e6a0", "guitar-electric-mute": "#2fb87e", "guitar-acoustic": "#c3f45e", synth: "#ff9de2", "synth-lead": "#ff7ab8", "synth-pad": "#5ef2e0", "synth-bass": "#6f8cff", strings: "#ffc857", saxophone: "#ffb347", trumpet: "#ffd66e", flute: "#bfe8ff" };
const PAN = { drums: 0, bass: 0, "synth-bass": 0, piano: -0.25, epiano: 0.25, organ: 0.3, "guitar-electric": 0.35, "guitar-electric-mute": -0.35, "guitar-acoustic": -0.3, synth: 0.2, "synth-lead": 0.1, "synth-pad": -0.15, strings: -0.1, saxophone: 0.2, trumpet: 0.15, flute: -0.2 };

async function postSSE(url, body, onProgress) {
  const res = await fetch(opt.server + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok && !(res.headers.get("content-type") ?? "").includes("event-stream")) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", result = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      let ev; try { ev = JSON.parse(line.slice(6)); } catch { continue; }
      if (ev.type === "progress") onProgress?.(ev);
      else if (ev.type === "error") throw new Error(ev.message);
      else if (ev.type === "done") result = ev;
    }
  }
  if (!result) throw new Error("サーバーからの応答が途切れました");
  return result;
}

const noteName = (p) => ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][p % 12] + (Math.floor(p / 12) - 1);
function summarize(t, song) {
  if (!t.notes.length) return "(空)";
  const ps = t.notes.map((n) => n.p);
  const bars = Math.ceil(Math.max(...t.notes.map((n) => n.s + n.d)) / song.timeSig);
  const density = (t.notes.length / Math.max(1, bars)).toFixed(1);
  const avgV = Math.round(t.notes.reduce((a, n) => a + n.v, 0) / t.notes.length);
  return `音域 ${noteName(Math.min(...ps))}〜${noteName(Math.max(...ps))}, ${t.notes.length}ノート, 約${density}ノート/小節, 平均ベロシティ ${avgV}`;
}

/* 1. 設計図 */
let bp;
let song;
if (opt.songFile) {
  song = JSON.parse(fs.readFileSync(opt.songFile, "utf8")).song;
  bp = { title: song.title, tempo: song.tempo, timeSig: song.timeSig, key: song.key, concept: song.concept, sections: song.sections, chordProgression: song.chordProgression, trackPlan: song.tracks, tempoChanges: [] };
} else if (opt.blueprintFile) bp = JSON.parse(fs.readFileSync(opt.blueprintFile, "utf8"));
else {
  process.stderr.write("[compose] 設計図を生成中…\n");
  const r = await postSSE("/api/blueprint", { prompt: opt.prompt, tempo: opt.tempo, key: opt.key, model: opt.model }, (p) => process.stderr.write(`\r[compose] blueprint ${(p.chars / 1000).toFixed(1)}k字`));
  bp = r.data;
  process.stderr.write("\n");
  fs.mkdirSync("exports", { recursive: true });
  fs.writeFileSync(`exports/${opt.name}.blueprint.json`, JSON.stringify(bp, null, 1));
}
const totalBars = bp.sections.reduce((a, s) => a + s.bars, 0);
console.error(`[compose] 「${bp.title}」 ${bp.tempo}BPM ${bp.timeSig}/4 ${bp.key} / ${totalBars}小節 / ${bp.trackPlan.length}トラック`);
for (const s of bp.sections) console.error(`  - ${s.name} (${s.bars}小節): ${s.description}`);
for (const t of bp.trackPlan) console.error(`  * ${t.name} [${t.instrument}] ${t.role}: ${t.stylePrompt}`);

song ??= {
  version: 2, title: bp.title, tempo: bp.tempo, timeSig: bp.timeSig, key: bp.key, concept: bp.concept,
  sections: bp.sections, chordProgression: bp.chordProgression,
  tempoMap: (bp.tempoChanges ?? []).map((p) => ({ beat: p.bar * bp.timeSig + p.beat, tempo: p.tempo })),
  master: { glue: 0.3, hallDecay: 2.4, roomDecay: 0.6, targetLufs: -14, width: 1, volume: -4 },
  tracks: bp.trackPlan.map((p) => ({ id: uid(), name: p.name, instrument: p.instrument, role: p.role, stylePrompt: p.stylePrompt, color: COLORS[p.instrument] ?? "#9fb8ff", volume: -6, pan: PAN[p.instrument] ?? 0, mute: false, solo: false, notes: [] })),
};

/* 2. トラック生成 (リズム隊 → ハーモニー → メロディ)、他トラックの譜面を渡し、検査 → 手直し */
const order = ["drums", "bass", "synth-bass", "guitar-electric", "guitar-electric-mute", "guitar-acoustic", "piano", "epiano", "organ", "synth", "synth-pad", "strings", "synth-lead", "saxophone", "trumpet", "flute"];
const sorted = [...song.tracks].sort((a, b) => order.indexOf(a.instrument) - order.indexOf(b.instrument)).filter((t) => !opt.only || opt.only.includes(t.name));
const range = { startBar: 0, bars: totalBars };
const songInfo = { title: song.title, tempo: song.tempo, timeSig: song.timeSig, key: song.key, concept: song.concept, sections: song.sections, chordProgression: song.chordProgression, tempoMap: song.tempoMap };
const toNotes = (a, ts) => a.notes.map((n) => ({ id: uid(), p: n.p, s: n.s, d: n.d, v: n.v, ...(n.v2 != null ? { v2: n.v2 } : {}) }));

for (const [i, track] of sorted.entries()) {
  const otherTracks = song.tracks.filter((t) => t.id !== track.id && t.notes.length)
    .sort((a, b) => order.indexOf(a.instrument) - order.indexOf(b.instrument))
    .map((t, k) => ({ name: t.name, instrument: t.instrument, role: t.role, summary: summarize(t, song), score: trackScoreText(t, song, range, k < 3 ? 8000 : 4000), performanceNotes: (t.performanceNotes ?? "").slice(0, 400) }));
  const trackInfo = { name: track.name, instrument: track.instrument, role: track.role, stylePrompt: track.stylePrompt };
  const body = { song: songInfo, track: trackInfo, range, otherTracks, mode: "new", extraDirection: opt.direction, model: opt.model };
  process.stderr.write(`[compose] (${i + 1}/${sorted.length}) ${track.name} [${track.instrument}] 生成中…\n`);
  const t0 = Date.now();
  const call = async (b, label) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { return await postSSE("/api/track", b, (p) => process.stderr.write(`\r[compose]   ${label} ${p.notes}ノート (${(p.chars / 1000).toFixed(1)}k字, ${((Date.now() - t0) / 1000).toFixed(0)}s)`)); }
      catch (e) { process.stderr.write(`\n[compose]   失敗 (${attempt}/3): ${e.message}\n`); if (attempt === 3) throw e; }
    }
  };
  let r = await call(body, "");
  process.stderr.write("\n");
  let a = analyzeNotes(r.data.notes, { song, track, range });
  let memo = r.data.performanceNotes ?? "";
  console.error(`[compose]   検査: ${describeAnalysis(a)}${a.issues.length ? "\n" + a.issues.map((x) => `[compose]     - ${x}`).join("\n") : ""}`);
  if (a.severity === 3) {
    r = await call({ ...body, extraDirection: `${opt.direction ? opt.direction + "\n" : ""}前回の出力は notes が空だった。この範囲は必ず演奏する (休符だけにしない)。` }, "(再生成)");
    process.stderr.write("\n");
    a = analyzeNotes(r.data.notes, { song, track, range }); memo = r.data.performanceNotes ?? memo;
    console.error(`[compose]   再生成の検査: ${describeAnalysis(a)}`);
  }
  if (a.severity === 2 && a.stats.count > 0 && !opt.noRevise) {
    const r3 = await call({ ...body, mode: "revise", issues: a.issues, previousNotes: a.notes }, "(手直し)");
    process.stderr.write("\n");
    const a3 = analyzeNotes(r3.data.notes, { song, track, range });
    if (a3.stats.count > 0 && a3.severity <= a.severity && (a3.stats.clashes <= a.stats.clashes || a3.issues.length < a.issues.length)) { a = a3; memo = r3.data.performanceNotes ?? memo; console.error(`[compose]   手直し後: ${describeAnalysis(a3)}`); }
    else console.error(`[compose]   手直し案は採用せず (${describeAnalysis(a3)})`);
  }
  track.notes = toNotes(a, song.timeSig);
  track.performanceNotes = memo;
  console.error(`[compose]   → ${track.notes.length}ノート / ${summarize(track, song)}\n[compose]   演奏メモ: ${memo}`);
  fs.mkdirSync("exports", { recursive: true });
  fs.writeFileSync(`exports/${opt.name}.song.json`, JSON.stringify({ song }, null, 1));
}

/* 3. プリセット保存 */
const res = await fetch(opt.server + "/api/save-preset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: opt.name, song }) });
console.error(`[compose] 保存: ${JSON.stringify(await res.json())}`);
console.log(JSON.stringify({ title: song.title, tempo: song.tempo, key: song.key, bars: totalBars, tracks: song.tracks.map((t) => [t.name, t.instrument, t.notes.length]) }));
