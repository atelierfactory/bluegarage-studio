#!/usr/bin/env node
// ═══════════ WAV フォルダ → SFZ 生成 (VSCO2 CE など SFZ が付属しないライブラリ用) ═══════════
//   node tools/wav-dir-sfz.mjs --out samples_src/generated/strings.sfz --octave 1 \
//     --part "samples_src/vsco2/Strings/Cello Section/susvib|sus|0-59|0" \
//     --part "samples_src/vsco2/Strings/Cello Section/spic|short|0-59|0" ...
// part = "DIR|art|lokey-hikey|gainDb[|release]"。ファイル名は *_<Note>_v<N>[_rr<K>|_<K>].wav 形式を想定。
// art=sus → loop_continuous (変換時に --autoloop でループ点探索), art=short → ワンショット扱いの短い奏法。
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = { parts: [], octave: 0 };
for (let i = 0; i < args.length; i++) {
  const a = args[i], v = args[i + 1];
  if (a === "--out") { opt.out = v; i++; }
  else if (a === "--part") { opt.parts.push(v); i++; }
  else if (a === "--octave") { opt.octave = +v; i++; }
  else throw new Error("unknown arg " + a);
}
const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function noteNum(s) {
  const m = s.match(/^([A-Ga-g])(#?b?)(-?\d+)$/); if (!m) return null;
  return (parseInt(m[3]) + 1) * 12 + NOTE[m[1].toLowerCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + opt.octave * 12;
}
const lines = ["<control>", `default_path=${path.resolve(path.dirname(opt.out))}/`, "<global>", "ampeg_attack=0.003 ampeg_release=0.25 amp_veltrack=60"];
for (const spec of opt.parts) {
  const [dir, art, range, gainDb = "0", release] = spec.split("|");
  const [lo, hi] = range.split("-").map(Number);
  const files = fs.readdirSync(dir).filter((f) => /\.wav$/i.test(f));
  const items = [];
  for (const f of files) {
    const m = f.match(/_([A-Ga-g]#?\d)_v(\d+)(?:_(?:rr|RR)?(\d+))?\.wav$/i);
    if (!m) { console.error("skip (name pattern)", f); continue; }
    const key = noteNum(m[1]); if (key == null) continue;
    items.push({ file: path.join(dir, f), key, vel: +m[2], rr: m[3] ? +m[3] : 1 });
  }
  if (!items.length) { console.error("no files in", dir); continue; }
  const vels = [...new Set(items.map((i) => i.vel))].sort((a, b) => a - b);
  const velRange = (v) => { const i = vels.indexOf(v); return [Math.round((i * 127) / vels.length) + 1, Math.round(((i + 1) * 127) / vels.length)]; };
  const keys = [...new Set(items.map((i) => i.key))].sort((a, b) => a - b);
  const keyRange = (k) => {
    const i = keys.indexOf(k);
    const lokey = i === 0 ? Math.min(k, lo) : Math.floor((keys[i - 1] + k) / 2) + 1;
    const hikey = i === keys.length - 1 ? Math.max(k, hi) : Math.floor((k + keys[i + 1]) / 2);
    return [Math.max(lokey, lo), Math.min(hikey, hi)];
  };
  // RR は (key, vel) ごとに数える (欠けがあると空振りするので seq_length は region ごとに出す)
  const rrOf = new Map();
  for (const it of items) { const k = `${it.key}/${it.vel}`; (rrOf.get(k) ?? rrOf.set(k, []).get(k)).push(it.rr); }
  for (const v of rrOf.values()) v.sort((a, b) => a - b);
  lines.push(`<group> bg_art=${art} volume=${gainDb} ${art === "sus" ? "loop_mode=loop_continuous" : "loop_mode=no_loop"}${release ? ` ampeg_release=${release}` : ""}`);
  let n = 0;
  for (const it of items) {
    const [lk, hk] = keyRange(it.key); if (hk < lk) continue;
    const [lv, hv] = velRange(it.vel);
    const rrs = rrOf.get(`${it.key}/${it.vel}`);
    lines.push(`<region> sample=${path.relative(path.dirname(opt.out), it.file)} lokey=${lk} hikey=${hk} pitch_keycenter=${it.key} lovel=${lv} hivel=${hv} seq_length=${rrs.length} seq_position=${rrs.indexOf(it.rr) + 1}`);
    n++;
  }
  const maxRR = Math.max(...[...rrOf.values()].map((v) => v.length));
  console.error(`[wav-dir] ${dir}: ${n} regions, keys ${keys[0]}..${keys[keys.length - 1]}, vel layers ${vels.length}, rr up to ${maxRR}`);
}
fs.mkdirSync(path.dirname(opt.out), { recursive: true });
fs.writeFileSync(opt.out, lines.join("\n") + "\n");
console.error(`[wav-dir] wrote ${opt.out}`);
