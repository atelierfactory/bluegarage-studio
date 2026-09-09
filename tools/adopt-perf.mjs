#!/usr/bin/env node
// ═══════════ Fable の演奏解釈 (public/presets/<name>.json) を同梱の名曲に取り込む ═══════════
//   node tools/adopt-perf.mjs <preset-name> <repertoire .mid file> <perf file name> [perfBy]
//   例: node tools/adopt-perf.mjs revolutionary-vesper op-10-12-wfi.mid revolutionary.vesper.json "Claude Fable 5.1"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [name, midFile, perfFile, perfBy = "Claude Fable 5.1"] = process.argv.slice(2);
if (!name || !midFile || !perfFile) { console.error("usage: adopt-perf.mjs <preset-name> <mid file> <perf file> [perfBy]"); process.exit(1); }
const src = path.join(__dirname, "..", "public", "presets", `${name}.json`);
const rep = path.join(__dirname, "..", "public", "piano", "repertoire");
const data = JSON.parse(fs.readFileSync(src, "utf8"));
if (!data.song?.tracks?.length) throw new Error("song が無い");
const song = data.song;
song.kind = "repertoire";
const tr = song.tracks[0];
const notes = tr.notes.length, pedal = (song.pedal ?? []).length;
const usage = song.interpretation?.usage ?? {};
fs.writeFileSync(path.join(rep, perfFile), JSON.stringify({ song }, null, 0));
const idxPath = path.join(rep, "index.json");
const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
const item = idx.find((x) => x.file === midFile);
if (!item) throw new Error(`index に ${midFile} が無い`);
item.perf = perfFile; item.perfBy = perfBy;
item.perfNote = `楽譜はそのまま、強弱・間・音の切り方・手と指・ペダルを ${perfBy} が演奏家として決めた版 (${new Date().toISOString().slice(0, 10)})`;
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1));
console.log(`adopted ${name} → ${perfFile}: ${notes} notes, ${pedal} pedal segments, tokens in ${usage.input ?? "?"} / out ${usage.output ?? "?"}, memos ${song.interpretation?.memos?.length ?? "?"}`);
