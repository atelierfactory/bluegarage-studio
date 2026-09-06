#!/usr/bin/env node
// ═══════════ SFZ → BLUE GARAGE サンプルパック変換 ═══════════
// SFZ (v2 + ARIA 拡張の一部) を読み解き、既定 CC 値・キースイッチで静的に評価して
// ブラウザ側の自作サンプラー (public/js/sampler.js) が読む JSON + Opus に変換する。
//
//   node tools/sfz-import.mjs --name piano --sfz "samples_src/salamander/Salamander Grand Piano V3.sfz" \
//        [--out public/samples] [--cc 67=40 --cc 16=127] [--keyswitch 2] [--max-layers 6] [--max-rr 5] \
//        [--max-dur 12] [--bitrate 128k] [--mono] [--no-trim] [--autoloop] [--premix] [--jobs 8] [--dry]
//   --premix: 同じ鍵盤・強さ・連打番号で複数マイクが同時に鳴る region 群 (Naked Drums の DI+OH 等) を
//             変換時に 1 本のステレオファイルへ混ぜ、再生時の声数を減らす
//
// 対応 opcode: lokey/hikey/key, lovel/hivel, pitch_keycenter, pitch_keytrack, transpose, tune,
//   seq_length/seq_position, lorand/hirand, trigger, group/polyphony_group, off_by, off_time, off_mode,
//   note_polyphony, volume(+master/group/global_volume), amplitude, amplitude_onccN, amp_veltrack(+onccN),
//   amp_velcurve_N, xfin/xfout_lovel/hivel, xfin/xfout_loccN/hiccN, pan(+onccN), ampeg_* (+onccN),
//   loop_mode, loop_start/loop_end (or WAV smpl chunk), offset, end, delay, rt_decay,
//   loccN/hiccN, on_loccN/on_hiccN (→ 除外), sw_last/sw_default/sw_lokey, default_path, #include, #define,
//   sample=*silence (チョーク専用) / *noise,*sine (除外), bg_art (自前拡張: 奏法ラベル)
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");

/* ─────────── CLI ─────────── */
const args = process.argv.slice(2);
const opt = { cc: {}, out: "public/samples", bitrate: "128k", jobs: 8, trim: true, maxLayers: 0, maxRR: 0, maxDur: 0 };
for (let i = 0; i < args.length; i++) {
  const a = args[i], v = args[i + 1];
  switch (a) {
    case "--name": opt.name = v; i++; break;
    case "--sfz": opt.sfz = v; i++; break;
    case "--out": opt.out = v; i++; break;
    case "--cc": { const [n, val] = v.split("="); opt.cc[+n] = +val; i++; break; }
    case "--keyswitch": opt.keyswitch = v; i++; break;
    case "--max-layers": opt.maxLayers = +v; i++; break;
    case "--max-rr": opt.maxRR = +v; i++; break;
    case "--max-dur": opt.maxDur = +v; i++; break;
    case "--bitrate": opt.bitrate = v; i++; break;
    case "--jobs": opt.jobs = +v; i++; break;
    case "--mono": opt.mono = true; break;
    case "--no-trim": opt.trim = false; break;
    case "--autoloop": opt.autoloop = true; break;
    case "--premix": opt.premix = true; break;
    case "--dry": opt.dry = true; break;
    case "--label": opt.label = v; i++; break;
    case "--credit": opt.credit = v; i++; break;
    default: throw new Error(`unknown arg ${a}`);
  }
}
if (!opt.name || !opt.sfz) { console.error("usage: --name NAME --sfz FILE.sfz"); process.exit(1); }

/* ─────────── 1. プリプロセス (#include / #define) → フラットなテキスト ─────────── */
const rootDir = path.dirname(path.resolve(opt.sfz));
const defines = new Map();
function substitute(text) {
  if (!text.includes("$") || defines.size === 0) return text;
  // 長い名前から順に置換 ($OFF01 と $OFF010 の衝突回避)
  const names = [...defines.keys()].sort((a, b) => b.length - a.length);
  for (const n of names) text = text.split(n).join(defines.get(n));
  return text;
}
function preprocess(file, depth = 0) {
  if (depth > 20) throw new Error("include too deep: " + file);
  let src;
  try { src = fs.readFileSync(file, "utf8"); }
  catch { throw new Error("include not found: " + file); }
  const out = [];
  for (let line of src.split(/\r?\n/)) {
    line = line.replace(/\/\/.*$/, ""); // コメント除去
    if (!line.trim()) continue;
    // 1行に <group> #include "..." lovel=1 #include "..." が混在するので順に処理
    let rest = line;
    while (rest.length) {
      const m = rest.match(/#(include|define)\s+/);
      if (!m) { out.push(substitute(rest)); break; }
      const before = rest.slice(0, m.index);
      if (before.trim()) out.push(substitute(before));
      rest = rest.slice(m.index + m[0].length);
      if (m[1] === "include") {
        const q = rest.match(/^"([^"]*)"/);
        if (!q) throw new Error("bad #include: " + line);
        rest = rest.slice(q[0].length);
        const rel = substitute(q[1]);
        let p = path.resolve(rootDir, rel);
        if (!fs.existsSync(p)) p = path.resolve(path.dirname(file), rel);
        out.push(...preprocess(p, depth + 1));
      } else {
        const d = rest.match(/^(\$[A-Za-z0-9_]+)\s+(\S+)/);
        if (!d) throw new Error("bad #define: " + line);
        defines.set(d[1], substitute(d[2]));
        rest = rest.slice(d[0].length);
      }
    }
  }
  return out;
}
const flat = preprocess(path.resolve(opt.sfz)).join("\n");

/* ─────────── 2. ヘッダ/opcode パース → 継承済み region 一覧 ─────────── */
const HEADERS = ["control", "global", "master", "group", "region", "curve", "effect", "midi", "sample"];
const tokens = [];
{
  const re = /<(\w+)>|([A-Za-z0-9_$]+)=/g;
  let m, lastOpcode = null, lastIdx = 0;
  const flush = (end) => { if (lastOpcode) { tokens.push({ op: lastOpcode, val: flat.slice(lastIdx, end).trim() }); lastOpcode = null; } };
  while ((m = re.exec(flat))) {
    flush(m.index);
    if (m[1]) tokens.push({ header: m[1].toLowerCase() });
    else { lastOpcode = m[2].toLowerCase(); lastIdx = m.index + m[0].length; }
  }
  flush(flat.length);
}
const ctx = { control: {}, global: {}, master: {}, group: {}, region: null };
let cur = null;
const rawRegions = [];
for (const t of tokens) {
  if (t.header) {
    if (cur === "region" && ctx.region) rawRegions.push({ ...ctx.global, ...ctx.master, ...ctx.group, ...ctx.region });
    cur = t.header;
    if (cur === "global") { ctx.global = {}; ctx.master = {}; ctx.group = {}; }
    if (cur === "master") { ctx.master = {}; ctx.group = {}; }
    if (cur === "group") ctx.group = {};
    if (cur === "region") ctx.region = {};
    continue;
  }
  if (!cur) continue;
  if (cur === "control") ctx.control[t.op] = t.val;
  else if (["global", "master", "group", "region"].includes(cur)) ctx[cur][t.op] = t.val;
}
if (cur === "region" && ctx.region) rawRegions.push({ ...ctx.global, ...ctx.master, ...ctx.group, ...ctx.region });
console.error(`[sfz] ${rawRegions.length} regions parsed (${defines.size} defines)`);

/* ─────────── 3. 既定 CC 値・キースイッチで静的評価 ─────────── */
const cc = new Array(140).fill(0);
cc[7] = 100; cc[10] = 64; cc[11] = 127;
for (const [k, v] of Object.entries(ctx.control)) {
  let m;
  if ((m = k.match(/^set_cc(\d+)$/))) cc[+m[1]] = +v;
  else if ((m = k.match(/^set_hdcc(\d+)$/))) cc[+m[1]] = +v * 127;
}
for (const [k, v] of Object.entries(opt.cc)) cc[k] = v;
const ccNorm = (n) => (n < 128 ? Math.min(1, Math.max(0, cc[n] / 127)) : 0);
function curve(idx, x) { // ARIA 既定カーブの近似
  switch (+idx) {
    case 1: return 2 * x - 1;
    case 2: return 1 - x;
    case 3: return 1 - 2 * x;
    default: return x;
  }
}
const NOTE_RE = /^([A-Ga-g])([#b]?)(-?\d+)$/;
function noteNum(s) {
  if (s == null) return null;
  if (/^-?\d+$/.test(String(s))) return +s;
  const m = String(s).match(NOTE_RE);
  if (!m) return null;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return (parseInt(m[3]) + 1) * 12 + base + acc; // C4 = 60
}
const num = (v, d = 0) => (v == null || v === "" || isNaN(+v) ? d : +v);

// キースイッチ: 明示指定 > sw_default > sw_lokey
let ksSel = null;
{
  const all = rawRegions.map((r) => r.sw_default).filter(Boolean);
  const dflt = all[0];
  ksSel = opt.keyswitch != null ? noteNum(opt.keyswitch) : dflt != null ? noteNum(dflt) : null;
  if (ksSel == null) { const lo = rawRegions.map((r) => r.sw_lokey).filter(Boolean)[0]; if (lo != null) ksSel = noteNum(lo); }
  if (ksSel != null) console.error(`[sfz] keyswitch = ${ksSel}`);
}

const samplesDir = ctx.control.default_path ? path.resolve(rootDir, ctx.control.default_path.replace(/\\/g, "/")) : rootDir;
function resolveSample(p) {
  const rel = p.replace(/\\/g, "/");
  const cand = [path.resolve(samplesDir, rel), path.resolve(rootDir, rel)];
  for (const c of cand) if (fs.existsSync(c)) return c;
  // 大文字小文字違いの救済
  for (const c of cand) {
    const dir = path.dirname(c), base = path.basename(c).toLowerCase();
    if (!fs.existsSync(dir)) continue;
    const hit = fs.readdirSync(dir).find((f) => f.toLowerCase() === base);
    if (hit) return path.join(dir, hit);
  }
  return null;
}

const regions = [];
const dropped = {};
const drop = (why) => { dropped[why] = (dropped[why] ?? 0) + 1; };
for (const r of rawRegions) {
  // --- CC 条件 (loccN/hiccN, on_locc → 除外) ---
  let ok = true;
  for (const k of Object.keys(r)) {
    let m;
    if ((m = k.match(/^on_(lo|hi)(hd)?cc\d+$/))) { ok = false; drop("on_cc"); break; }
    if ((m = k.match(/^lo(hd)?cc(\d+)$/))) { const n = +m[2]; const v = +r[k] * (m[1] ? 127 : 1); if (n < 128 && cc[n] < v) { ok = false; drop("locc"); break; } }
    if ((m = k.match(/^hi(hd)?cc(\d+)$/))) { const n = +m[2]; const v = +r[k] * (m[1] ? 127 : 1); if (n < 128 && cc[n] > v) { ok = false; drop("hicc"); break; } }
  }
  if (!ok) continue;
  // --- キースイッチ ---
  if (r.sw_last != null && ksSel != null && noteNum(r.sw_last) !== ksSel) { drop("keyswitch"); continue; }
  if (r.sw_down != null || r.sw_up != null) { drop("sw_down"); continue; }
  // --- キー/ベロシティ範囲 ---
  const key = r.key != null ? noteNum(r.key) : null;
  const lokey = r.lokey != null ? noteNum(r.lokey) : key ?? 0;
  const hikey = r.hikey != null ? noteNum(r.hikey) : key ?? 127;
  const lovel = num(r.lovel, 1), hivel = num(r.hivel, 127);
  if (hikey < lokey || hivel < lovel || hikey < 0 || hivel < 1) { drop("range"); continue; }
  const keycenter = r.pitch_keycenter != null ? noteNum(r.pitch_keycenter) : key ?? 60;
  // --- サンプル ---
  const sname = r.sample ?? "";
  let choke = false, file = null;
  if (sname === "*silence" || num(r.end, 0) === -1) choke = true;
  else if (sname.startsWith("*") || !sname) { drop("generator"); continue; }
  else { file = resolveSample(sname); if (!file) { drop("missing:" + sname); continue; } }
  // --- ゲイン (静的部分) ---
  let gainDb = num(r.volume) + num(r.master_volume) + num(r.group_volume) + num(r.global_volume) + num(r.region_volume);
  let amp = num(r.amplitude, 100) / 100;
  let ccAmp = 1;
  for (const k of Object.keys(r)) {
    let m;
    if ((m = k.match(/^amplitude_(?:on)?cc(\d+)$/))) {
      const n = +m[1];
      if (n === 7 || n === 10 || n === 11 || n >= 128) continue; // マスター系 CC は無視
      const cv = r[`amplitude_curvecc${n}`];
      ccAmp *= (num(r[k]) / 100) * curve(cv, ccNorm(n));
    }
    if ((m = k.match(/^xfin_lo(hd)?cc(\d+)$/))) {
      const n = +m[2]; if (n >= 128) continue;
      const lo = +r[k] * (m[1] ? 127 : 1), hi = num(r[`xfin_hi${m[1] ? "hd" : ""}cc${n}`], 127) * (m[1] ? 127 : 1);
      ccAmp *= hi <= lo ? 1 : Math.min(1, Math.max(0, (cc[n] - lo) / (hi - lo)));
    }
    if ((m = k.match(/^xfin_hi(hd)?cc(\d+)$/)) && r[`xfin_lo${m[1] ? "hd" : ""}cc${m[2]}`] == null) {
      const n = +m[2]; if (n >= 128) continue;
      const hi = +r[k] * (m[1] ? 127 : 1);
      ccAmp *= Math.min(1, Math.max(0, cc[n] / hi));
    }
    if ((m = k.match(/^xfout_lo(hd)?cc(\d+)$/))) {
      const n = +m[2]; if (n >= 128) continue;
      const lo = +r[k] * (m[1] ? 127 : 1), hi = num(r[`xfout_hi${m[1] ? "hd" : ""}cc${n}`], 127) * (m[1] ? 127 : 1);
      ccAmp *= hi <= lo ? 1 : 1 - Math.min(1, Math.max(0, (cc[n] - lo) / (hi - lo)));
    }
    if ((m = k.match(/^xfout_hi(hd)?cc(\d+)$/)) && r[`xfout_lo${m[1] ? "hd" : ""}cc${m[2]}`] == null) {
      const n = +m[2]; if (n >= 128) continue;
      const hi = +r[k] * (m[1] ? 127 : 1);
      ccAmp *= 1 - Math.min(1, Math.max(0, cc[n] / hi));
    }
  }
  const gain = Math.pow(10, gainDb / 20) * amp * ccAmp;
  if (!choke && gain < 1e-4) { drop("silent"); continue; }
  // --- ベロシティ ---
  let veltrack = num(r.amp_veltrack, 100);
  for (const k of Object.keys(r)) {
    const m = k.match(/^amp_veltrack_(?:on)?cc(\d+)$/);
    if (m && +m[1] < 128) veltrack += num(r[k]) * curve(r[`amp_veltrack_curvecc${m[1]}`], ccNorm(+m[1]));
  }
  const velcurve = [];
  for (const k of Object.keys(r)) { const m = k.match(/^amp_velcurve_(\d+)$/); if (m) velcurve.push([+m[1], +r[k]]); }
  velcurve.sort((a, b) => a[0] - b[0]);
  const xfvel = (r.xfin_lovel != null || r.xfin_hivel != null || r.xfout_lovel != null || r.xfout_hivel != null)
    ? { inLo: num(r.xfin_lovel, 0), inHi: num(r.xfin_hivel, 0), outLo: num(r.xfout_lovel, 128), outHi: num(r.xfout_hivel, 128) } : null;
  // --- パン ---
  let pan = num(r.pan);
  for (const k of Object.keys(r)) {
    const m = k.match(/^pan_(?:on)?cc(\d+)$/);
    if (m && +m[1] < 128) pan += num(r[k]) * curve(r[`pan_curvecc${m[1]}`] ?? 0, ccNorm(+m[1]));
  }
  pan = Math.max(-100, Math.min(100, pan));
  // --- エンベロープ ---
  const env = {};
  for (const [nm, d] of [["attack", 0.001], ["hold", 0], ["decay", 0], ["sustain", 100], ["release", 0.001], ["delay", 0]]) {
    let v = num(r[`ampeg_${nm}`], d);
    for (const k of Object.keys(r)) {
      const m = k.match(new RegExp(`^ampeg_${nm}_?(?:on)?cc(\\d+)$`));
      if (m && +m[1] < 128) v += num(r[k]) * curve(r[`ampeg_${nm}_curvecc${m[1]}`], ccNorm(+m[1]));
    }
    env[nm] = v;
  }
  // --- その他 ---
  const seqLen = num(r.seq_length, 1), seqPos = num(r.seq_position, 1);
  const rand = (r.lorand != null || r.hirand != null) ? [num(r.lorand, 0), num(r.hirand, 1)] : null;
  const trigger = (r.trigger ?? "attack").toLowerCase();
  if (!["attack", "release", "first", "legato", "release_key"].includes(trigger)) { drop("trigger:" + trigger); continue; }
  const loopMode = r.loop_mode ?? r.loopmode ?? null;
  regions.push({
    file, choke, lokey, hikey, keycenter, lovel, hivel,
    keytrack: num(r.pitch_keytrack, 100) / 100,
    tune: num(r.tune) + num(r.transpose) * 100,
    seqLen, seqPos, rand,
    trigger: trigger === "release" || trigger === "release_key" ? "release" : "attack",
    group: num(r.group ?? r.polyphony_group, 0), offBy: num(r.off_by ?? r.offby, 0),
    offTime: num(r.off_time, 0.006), notePoly: r.note_polyphony != null ? num(r.note_polyphony) : 0,
    gain, veltrack: veltrack / 100, velcurve, xfvel, pan, env,
    loopMode, loopStart: r.loop_start != null ? +r.loop_start : r.loopstart != null ? +r.loopstart : null,
    loopEnd: r.loop_end != null ? +r.loop_end : r.loopend != null ? +r.loopend : null,
    offset: num(r.offset), end: r.end != null ? +r.end : null, delay: num(r.delay),
    rtDecay: num(r.rt_decay), art: r.bg_art ?? null, label: r.region_label ?? r.group_label ?? null,
  });
}
console.error(`[sfz] ${regions.length} regions kept; dropped:`, dropped);

/* ─────────── 4. レイヤー間引き / RR 間引き ─────────── */
if (opt.maxRR > 0) {
  const before = regions.length;
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    if (r.seqLen > opt.maxRR) { if (r.seqPos > opt.maxRR) regions.splice(i, 1); else r.seqLen = opt.maxRR; }
  }
  console.error(`[sfz] RR 間引き: ${before} → ${regions.length}`);
}
if (opt.maxLayers > 0) {
  // 同じ (lokey,hikey,trigger,group,seqPos,art) 列の中でベロシティ層が多すぎたら均等に残して範囲を広げる
  const cols = new Map();
  for (const r of regions) {
    if (r.choke || r.trigger !== "attack") continue;
    const k = `${r.lokey}-${r.hikey}-${r.group}-${r.seqPos}-${r.art}-${r.rand?.join(",")}`;
    (cols.get(k) ?? cols.set(k, []).get(k)).push(r);
  }
  const remove = new Set();
  for (const list of cols.values()) {
    const ranges = [...new Set(list.map((r) => `${r.lovel}-${r.hivel}`))].map((s) => s.split("-").map(Number)).sort((a, b) => a[0] - b[0]);
    if (ranges.length <= opt.maxLayers) continue;
    const keep = new Set();
    for (let i = 0; i < opt.maxLayers; i++) keep.add(Math.round(((i + 0.5) * ranges.length) / opt.maxLayers - 0.5));
    const kept = [...keep].sort((a, b) => a - b).map((i) => ranges[i]);
    // 残す層の範囲を隣接まで広げる
    const newRange = kept.map((rg, i) => [i === 0 ? 1 : Math.floor((kept[i - 1][1] + rg[0]) / 2) + 1, i === kept.length - 1 ? 127 : Math.floor((rg[1] + kept[i + 1][0]) / 2)]);
    for (const r of list) {
      const idx = kept.findIndex((rg) => rg[0] === r.lovel && rg[1] === r.hivel);
      if (idx < 0) remove.add(r); else { r.lovel = newRange[idx][0]; r.hivel = newRange[idx][1]; }
    }
  }
  const before = regions.length;
  for (let i = regions.length - 1; i >= 0; i--) if (remove.has(regions[i])) regions.splice(i, 1);
  console.error(`[sfz] レイヤー間引き (max ${opt.maxLayers}): ${before} → ${regions.length}`);
}

/* ─────────── 4b. マイク層のプリミックス ─────────── */
const premixes = new Map(); // 仮想ファイル名 -> [{file, gain, pan}]
if (opt.premix) {
  const groups = new Map();
  for (const r of regions) {
    if (r.choke || !r.file || r.loopMode === "loop_continuous" || r.loopMode === "loop_sustain") continue;
    const k = [r.lokey, r.hikey, r.lovel, r.hivel, r.seqLen, r.seqPos, r.trigger, r.art, r.rand?.join(","), r.keycenter, r.offBy, r.env.attack, r.env.release].join("|");
    (groups.get(k) ?? groups.set(k, []).get(k)).push(r);
  }
  let n = 0;
  const remove = new Set();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const id = `premix:${String(n++).padStart(4, "0")}`;
    premixes.set(id, list.map((r) => ({ file: r.file, gain: r.gain, pan: r.pan })));
    const head = list[0];
    head.file = id; head.gain = 1; head.pan = 0;
    for (const r of list.slice(1)) remove.add(r);
  }
  const before = regions.length;
  for (let i = regions.length - 1; i >= 0; i--) if (remove.has(regions[i])) regions.splice(i, 1);
  console.error(`[sfz] プリミックス: ${before} → ${regions.length} regions (${premixes.size} mixes)`);
}

/* ─────────── 5. サンプル変換 (ffmpeg → Opus) ─────────── */
const files = [...new Set(regions.filter((r) => r.file).map((r) => r.file))];
console.error(`[sfz] ${files.length} unique sample files`);
if (opt.dry) {
  const att = regions.filter((r) => !r.choke && r.trigger === "attack");
  const keys = new Map();
  for (const r of att) for (let k = r.lokey; k <= r.hikey; k++) keys.set(k, (keys.get(k) ?? 0) + 1);
  const ks = [...keys.keys()].sort((a, b) => a - b);
  const layers = new Set(att.map((r) => `${r.lovel}-${r.hivel}`));
  console.log(JSON.stringify({
    regions: regions.length, attack: att.length, release: regions.filter((r) => r.trigger === "release").length,
    choke: regions.filter((r) => r.choke).length, files: files.length, dropped,
    keyRange: ks.length ? [ks[0], ks[ks.length - 1]] : null, keysCovered: ks.length,
    regionsPerKey: ks.slice(0, 40).map((k) => `${k}:${keys.get(k)}`).join(" "),
    velLayers: [...layers].sort((a, b) => +a.split("-")[0] - +b.split("-")[0]),
    maxSeq: Math.max(...att.map((r) => r.seqLen)), arts: [...new Set(att.map((r) => r.art))],
    sampleExample: att[0]?.file,
  }, null, 1));
  process.exit(0);
}

const outDir = path.resolve(opt.out, opt.name);
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (/\.(ogg|m4a|json)$/.test(f)) fs.unlinkSync(path.join(outDir, f)); // 前回の残骸を消す
const sampleInfo = new Map(); // file -> {id, sr, ch, dur, loops:[...]}

function readWavMeta(file) {
  try {
    const fd = fs.openSync(file, "r");
    const head = Buffer.alloc(12); fs.readSync(fd, head, 0, 12, 0);
    if (head.toString("ascii", 0, 4) !== "RIFF") { fs.closeSync(fd); return null; }
    const size = fs.fstatSync(fd).size;
    let off = 12; const meta = { loops: [] };
    const hdr = Buffer.alloc(8);
    while (off + 8 <= size) {
      fs.readSync(fd, hdr, 0, 8, off);
      const id = hdr.toString("ascii", 0, 4), sz = hdr.readUInt32LE(4);
      if (id === "fmt ") { const b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, off + 8); meta.ch = b.readUInt16LE(2); meta.sr = b.readUInt32LE(4); meta.bits = b.readUInt16LE(14); }
      else if (id === "data") meta.dataBytes = sz;
      else if (id === "smpl") {
        const b = Buffer.alloc(sz); fs.readSync(fd, b, 0, sz, off + 8);
        const n = b.readUInt32LE(28);
        for (let i = 0; i < n; i++) { const o = 36 + i * 24; if (o + 24 <= sz) meta.loops.push([b.readUInt32LE(o + 8), b.readUInt32LE(o + 12)]); }
      }
      off += 8 + sz + (sz & 1);
    }
    fs.closeSync(fd);
    return meta;
  } catch { return null; }
}

function run(cmd, argv, { stdin, capture } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: [stdin ? "pipe" : "ignore", capture ? "pipe" : "ignore", "pipe"] });
    const err = []; const out = [];
    p.stderr.on("data", (d) => err.push(d));
    if (capture) p.stdout.on("data", (d) => out.push(d));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, stderr: Buffer.concat(err).toString(), stdout: capture ? Buffer.concat(out) : null }));
  });
}
function parseProbe(stderr) {
  const times = [...stderr.matchAll(/time=(\d+):(\d+):([\d.]+)/g)];
  const d = times.length ? times[times.length - 1] : stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const s = stderr.match(/Stream #0:0[^\n]*Audio: ([^,]+), (\d+) Hz, (mono|stereo|(\d+) channels)/);
  return {
    dur: d ? (+d[1]) * 3600 + (+d[2]) * 60 + (+d[3]) : null,
    sr: s ? +s[2] : null,
    ch: s ? (s[3] === "mono" ? 1 : s[3] === "stereo" ? 2 : +s[4]) : null,
  };
}

// 自動ループ点探索 (持続音用): 粗探索 (1/16 間引き) → 精密探索
async function autoloop(file, sr) {
  const r = await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", file, "-ac", "1", "-f", "f32le", "-"], { capture: true });
  if (r.code !== 0) return null;
  const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
  const N = x.length; if (N < sr * 2) return null;
  const D = 16; const M = Math.floor(N / D); const y = new Float32Array(M);
  for (let i = 0; i < M; i++) { let s = 0; for (let j = 0; j < D; j++) s += x[i * D + j]; y[i] = s / D; }
  const W = 256; let best = { score: Infinity, s: 0, e: 0 };
  const eLo = Math.floor(M * 0.7), eHi = Math.floor(M * 0.92), sLo = Math.floor(M * 0.25), sHi = Math.floor(M * 0.55);
  for (let e = eLo; e < eHi; e += 2) for (let s = sLo; s < sHi; s += 2) {
    let sc = 0; for (let i = -W; i < W; i += 2) { const d = y[e + i] - y[s + i]; sc += d * d; }
    if (sc < best.score) best = { score: sc, s, e };
  }
  // 精密探索
  const W2 = 2048; let fine = { score: Infinity, s: best.s * D, e: best.e * D };
  for (let e = best.e * D - D * 2; e <= best.e * D + D * 2; e += 1) for (let s = best.s * D - D * 2; s <= best.s * D + D * 2; s += 1) {
    if (s - W2 < 0 || e + W2 >= N) continue;
    let sc = 0; for (let i = -W2; i < W2; i += 4) { const d = x[e + i] - x[s + i]; sc += d * d; }
    if (sc < fine.score) fine = { score: sc, s, e };
  }
  return [fine.s, fine.e];
}

async function convertOne(file, idx) {
  const id = String(idx).padStart(4, "0");
  const dst = path.join(outDir, `${id}.ogg`);
  const mix = premixes.get(file);
  const wav = mix ? readWavMeta(mix[0].file) : readWavMeta(file);
  const needLoop = !mix && regions.some((r) => r.file === file && (r.loopMode === "loop_continuous" || r.loopMode === "loop_sustain" || (r.loopMode == null && (wav?.loops?.length || r.loopStart != null))));
  const af = [];
  if (opt.trim && !needLoop) af.push("areverse", "silenceremove=start_periods=1:start_threshold=-78dB:start_silence=0.08", "areverse");
  if (opt.maxDur > 0 && !needLoop) af.push(`atrim=0:${opt.maxDur}`, `afade=t=out:st=${Math.max(0, opt.maxDur - 1.5)}:d=1.5`);
  const argv = ["-hide_banner", "-y"];
  if (mix) {
    // 各マイクを ゲイン+パン (等パワー) でステレオ化して足す
    for (const m of mix) argv.push("-i", m.file);
    const parts = mix.map((m, i) => {
      const th = ((m.pan / 100 + 1) * Math.PI) / 4;
      const L = (Math.cos(th) * m.gain).toFixed(5), R = (Math.sin(th) * m.gain).toFixed(5);
      const meta = readWavMeta(m.file);
      const stereo = (meta?.ch ?? 1) >= 2 || /\.flac$/i.test(m.file) && !meta; // FLAC は不明 → 後段で aformat が吸収
      return `[${i}:a]aformat=channel_layouts=stereo,pan=stereo|c0=${L}*c0|c1=${R}*c1[m${i}]`;
    });
    const chain = `${parts.join(";")};${mix.map((_, i) => `[m${i}]`).join("")}amix=inputs=${mix.length}:normalize=0:duration=longest${af.length ? "," + af.join(",") : ""}[out]`;
    argv.push("-filter_complex", chain, "-map", "[out]");
  } else {
    argv.push("-i", file);
    if (af.length) argv.push("-af", af.join(","));
  }
  if (opt.mono) argv.push("-ac", "1");
  argv.push("-c:a", "libopus", "-b:a", opt.bitrate, "-vbr", "on", "-compression_level", "10", "-application", "audio", "-ar", "48000", dst);
  let r = await run(FFMPEG, argv);
  if (r.code !== 0) throw new Error(`ffmpeg failed for ${file}\n${r.stderr.slice(-800)}`);
  let probe = parseProbe(r.stderr);
  // 無音トリムで中身が消えた (ごく小さい音のサンプル) → トリム無しで撮り直す
  if (!mix && af.length && (probe.dur == null || probe.dur < 0.05 || fs.statSync(dst).size < 600)) {
    const argv2 = argv.filter((a, i) => !(a === "-af" || argv[i - 1] === "-af"));
    r = await run(FFMPEG, argv2);
    if (r.code !== 0) throw new Error(`ffmpeg failed for ${file}\n${r.stderr.slice(-800)}`);
    probe = parseProbe(r.stderr);
    console.error(`\n[sfz] トリム無しで再変換: ${path.basename(file)}`);
  }
  const sr = wav?.sr ?? probe.sr ?? 44100;
  const info = { id, src: mix ? file : path.relative(process.cwd(), file), sr, ch: mix ? 2 : (probe.ch ?? wav?.ch ?? 2), dur: probe.dur ?? 0 };
  // ループ点 (サンプル単位 → 秒): 1) opcode 2) WAV smpl 3) autoloop
  const rr = regions.find((r) => r.file === file && r.loopStart != null);
  if (rr) info.loop = [rr.loopStart / sr, rr.loopEnd / sr];
  else if (wav?.loops?.length) info.loop = [wav.loops[0][0] / sr, wav.loops[0][1] / sr];
  else if (needLoop && opt.autoloop) { const lp = await autoloop(file, sr); if (lp) info.loop = [lp[0] / sr, lp[1] / sr]; }
  sampleInfo.set(file, info);
  return info;
}

let done = 0;
const t0 = Date.now();
const queue = files.map((f, i) => [f, i]);
async function worker() {
  while (queue.length) {
    const [f, i] = queue.shift();
    await convertOne(f, i);
    done++;
    if (done % 50 === 0 || done === files.length) process.stderr.write(`\r[sfz] ${done}/${files.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
}
await Promise.all(Array.from({ length: Math.min(opt.jobs, files.length) }, worker));
process.stderr.write("\n");

/* ─────────── 6. JSON 出力 ─────────── */
const sampleList = files.map((f) => sampleInfo.get(f));
const fileIndex = new Map(files.map((f, i) => [f, i]));
const outRegions = regions.map((r) => {
  const si = r.file ? fileIndex.get(r.file) : -1;
  const info = si >= 0 ? sampleList[si] : null;
  const sr = info?.sr ?? 44100;
  const o = {
    s: si, k: [r.lokey, r.hikey], kc: r.keycenter, v: [r.lovel, r.hivel],
    g: +r.gain.toFixed(5), vt: +r.veltrack.toFixed(3), env: { a: +r.env.attack.toFixed(4), h: +r.env.hold.toFixed(3), d: +r.env.decay.toFixed(3), s: +(r.env.sustain / 100).toFixed(3), r: +r.env.release.toFixed(3) },
  };
  if (r.choke) o.choke = true;
  if (r.trigger === "release") o.rel = true;
  if (r.keytrack !== 1) o.kt = r.keytrack;
  if (r.tune) o.tune = r.tune;
  if (r.seqLen > 1) o.seq = [r.seqLen, r.seqPos];
  if (r.rand) o.rand = r.rand;
  if (r.group) o.grp = r.group;
  if (r.offBy) o.offBy = r.offBy;
  if (r.offTime !== 0.006) o.offTime = r.offTime;
  if (r.notePoly) o.np = r.notePoly;
  if (r.velcurve.length) o.vc = r.velcurve;
  if (r.xfvel) o.xf = r.xfvel;
  if (r.pan) o.pan = r.pan;
  if (r.loopMode === "one_shot") o.oneShot = true;
  if (info?.loop && r.loopMode !== "no_loop" && r.loopMode !== "one_shot") o.loop = info.loop.map((x) => +x.toFixed(5));
  if (r.offset) o.off = +(r.offset / sr).toFixed(5);
  if (r.end != null && r.end > 0) o.end = +(r.end / sr).toFixed(5);
  if (r.delay) o.delay = r.delay;
  if (r.rtDecay) o.rt = r.rtDecay;
  if (r.art) o.art = r.art;
  return o;
});
const index = {
  name: opt.name, label: opt.label ?? opt.name, credit: opt.credit ?? null, source: path.relative(process.cwd(), opt.sfz),
  generated: new Date().toISOString(), format: "ogg/opus 48k",
  samples: sampleList.map((s) => ({ f: `${s.id}.ogg`, sr: s.sr, ch: s.ch, dur: +s.dur.toFixed(3) })),
  regions: outRegions,
};
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index));
const bytes = sampleList.reduce((a, s) => a + fs.statSync(path.join(outDir, `${s.id}.ogg`)).size, 0);
console.error(`[sfz] wrote ${outDir}/index.json: ${outRegions.length} regions, ${sampleList.length} files, ${(bytes / 1e6).toFixed(1)} MB`);
