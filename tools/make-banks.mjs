#!/usr/bin/env node
// ═══════════ 即興の手札 (bank) を 20 スタイル分まとめて作る ═══════════
//   node tools/make-banks.mjs [--model claude-fable-5-1] [--server http://localhost:5173] [--only "スタイル名"] [--concurrency 3]
// サーバーの /api/proxy (サーバーの .env のキー) を通して structured outputs で作り、
// public/piano/banks/<id>.json と public/piano/banks/index.json に保存する。
// 手札は度数書きなので、どのキーでも鳴らせる。1 スタイルあたり 進行 12 / 左手 16 / 右手 30 / フィル 8 を頼む (合計 66 パターン × 20 = 1300 超)。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JAM_BANK_SCHEMA, SYSTEM_JAM } from "../public/piano/jam.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = { server: "http://localhost:5173", model: "claude-fable-5-1", concurrency: 3 };
for (let i = 0; i < args.length; i++) { const a = args[i], v = args[i + 1]; if (a === "--model") { opt.model = v; i++; } else if (a === "--server") { opt.server = v; i++; } else if (a === "--only") { (opt.only ??= []).push(v); i++; } else if (a === "--concurrency") { opt.concurrency = +v; i++; } }

export const STYLES = [
  { id: "jazz-ballad", name: "ジャズバラード", tempo: 66, key: "Eb major", desc: "ゆったりした 4 分の歩み、テンションの効いた和音、右手はブロックコードと歌う単音、左手はルート+シェルボイシング。ビル・エヴァンス系の色彩" },
  { id: "swing", name: "スウィング / ビバップ", tempo: 160, key: "F major", desc: "左手はウォーキングベース、右手はスウィングする 8 分のライン、ii-V-I と循環、ブルーノート" },
  { id: "bossa", name: "ボサノバ", tempo: 120, key: "D major", desc: "左手はベース+裏拍の和音 (ボサのパターン)、右手は柔らかい 9th/13th の旋律、ジョビン系の進行" },
  { id: "ragtime", name: "ラグタイム", tempo: 96, key: "C major", desc: "左手はストライド (低音-和音-低音-和音)、右手はシンコペーションの旋律、ジョプリン風。速く弾かない" },
  { id: "blues", name: "ブルース", tempo: 88, key: "G major", desc: "12 小節ブルースと 8 小節ブルース、シャッフル、左手はブギの型、右手はブルーノートとターン" },
  { id: "gospel", name: "ゴスペル / ソウル", tempo: 76, key: "Ab major", desc: "豊かな和音、経過和音の多い進行、左手はオクターブベース、右手はブロックコードと合いの手" },
  { id: "jpop-ballad", name: "J-POP バラード", tempo: 72, key: "C major", desc: "4-5-3-6 や 1-5-6-4、サビで盛り上がる、左手はアルペジオ、右手は歌えるメロディ" },
  { id: "citypop", name: "シティポップ", tempo: 104, key: "Ab major", desc: "メジャー 7th と 9th、ii-V の連続、軽いシンコペーション、左手はオクターブとルート 5 度、都会的" },
  { id: "cinematic", name: "映画音楽 (壮大)", tempo: 84, key: "D minor", desc: "広いアルペジオ、5 度と 8 度の開いた和音、少しずつ盛り上がる、モーダルな進行 (i-VI-III-VII)" },
  { id: "minimal", name: "ミニマル / アンビエント", tempo: 72, key: "A minor", desc: "少ない音で繰り返しをずらす、ペダルで溶かす、add9 と sus、静かな左手の分散和音、間を大切に" },
  { id: "romantic", name: "ロマン派 (ノクターン風)", tempo: 66, key: "Eb major", desc: "左手は広い分散和音、右手は装飾のある歌、半音階的な経過和音、ショパン風のルバート感" },
  { id: "impressionist", name: "印象派 (ドビュッシー風)", tempo: 76, key: "Db major", desc: "全音音階・平行和音・ペンタトニック、色彩的な 9th/11th、ペダルで滲ませる" },
  { id: "baroque", name: "バロック (対位法)", tempo: 100, key: "G minor", desc: "左手は動く低音線 (通奏低音的)、右手は装飾つきの旋律、循環進行、カノン的な模倣" },
  { id: "classical", name: "古典派 (モーツァルト風)", tempo: 112, key: "C major", desc: "アルベルティ・バス、明快な 4 小節楽節、カデンツ、トリルとスケール" },
  { id: "latin", name: "ラテン / サルサ", tempo: 132, key: "C minor", desc: "モントゥーノ (右手のシンコペーション型)、左手はトゥンバオ風のベース、2-3 クラーベ感" },
  { id: "tango", name: "タンゴ", tempo: 120, key: "A minor", desc: "鋭いスタッカートの左手、ハバネラのリズム、ドラマチックな半音下降、ピアソラ風の緊張" },
  { id: "newage", name: "ニューエイジ / ヒーリング", tempo: 68, key: "F major", desc: "澄んだアルペジオ、sus2 と add9、ゆっくりした和声、広い音域、ペダル多め" },
  { id: "pop-rock", name: "ポップス / ロック (8 ビート)", tempo: 118, key: "E major", desc: "左手はオクターブの 8 分刻み、右手はコードのリズムとフック、1-5-6-4、パワーコード的" },
  { id: "lullaby", name: "子守唄 / 童謡風", tempo: 72, key: "G major", desc: "単純で優しい旋律、3 度と 6 度の重なり、I-IV-V 中心、左手はワルツ風でなく 4 拍の揺れ" },
  { id: "wafu", name: "和風 (ペンタトニック)", tempo: 84, key: "D minor", desc: "ヨナ抜き音階と都節音階、空虚 5 度、左手は持続低音と 4 度、静かな装飾" },
];

async function callStructured({ system, userText, schema, model }) {
  const body = { model, max_tokens: 40000, stream: true, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], output_config: { format: { type: "json_schema", schema } }, messages: [{ role: "user", content: userText }] };
  const res = await fetch(opt.server + "/api/proxy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const dec = new TextDecoder(); let buf = "", text = "", usage = {}, stop = null;
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i; while ((i = buf.indexOf("\n\n")) >= 0) { const part = buf.slice(0, i); buf = buf.slice(i + 2); const line = part.split("\n").find((l) => l.startsWith("data:")); if (!line) continue; let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") text += ev.delta.text; else if (ev.type === "message_start") usage = ev.message?.usage ?? {}; else if (ev.type === "message_delta") { stop = ev.delta?.stop_reason ?? stop; usage = { ...usage, ...(ev.usage ?? {}) }; } else if (ev.type === "error") throw new Error(ev.error?.message ?? "stream error"); }
  }
  if (stop === "max_tokens") throw new Error("max_tokens");
  return { data: JSON.parse(text), usage: { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 } };
}

const outDir = path.join(__dirname, "..", "public", "piano", "banks");
fs.mkdirSync(outDir, { recursive: true });
const todo = STYLES.filter((s) => !opt.only || opt.only.includes(s.id) || opt.only.includes(s.name));
const results = [];
let total = { input: 0, output: 0 };
async function one(s) {
  const file = path.join(outDir, `${s.id}.json`);
  if (fs.existsSync(file) && !opt.only) { console.error(`[banks] skip ${s.id} (exists)`); const j = JSON.parse(fs.readFileSync(file, "utf8")); results.push({ id: s.id, name: s.name, tempo: s.tempo, key: s.key, desc: s.desc, counts: j.counts }); return; }
  const userText = `スタイル: ${s.name} — ${s.desc}\nキー: ${s.key}\nテンポ: ${s.tempo} BPM\n\nこのスタイルで何時間でも即興を続けられる、入魂の手札を作ってください。進行 12 個 (8 小節ずつ、定番と少し凝ったもの)、左手の伴奏型 16 個 (密度も型も違うもの)、右手のモチーフ 30 個 (1 小節と 2 小節を混ぜ、歌える・跳ねる・流れる・問いと答え、休符も)、フィル 8 個。どれもそのスタイルの名演奏家が実際に弾きそうな、生きたリズムと強弱で。`;
  const t0 = Date.now();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data, usage } = await callStructured({ system: SYSTEM_JAM, userText, schema: JAM_BANK_SCHEMA, model: opt.model });
      const counts = { progressions: data.progressions?.length ?? 0, lh: data.lhPatterns?.length ?? 0, rh: data.rhMotifs?.length ?? 0, fills: data.fills?.length ?? 0 };
      if (counts.progressions < 4 || counts.lh < 4 || counts.rh < 8) throw new Error(`too small ${JSON.stringify(counts)}`);
      fs.writeFileSync(file, JSON.stringify({ ...data, id: s.id, name: s.name, tempo: s.tempo, key: s.key, desc: s.desc, model: opt.model, counts, usage, generated: new Date().toISOString() }));
      total.input += usage.input; total.output += usage.output;
      results.push({ id: s.id, name: s.name, tempo: s.tempo, key: s.key, desc: s.desc, counts });
      console.error(`[banks] ${s.id}: ${JSON.stringify(counts)} in ${((Date.now() - t0) / 1000).toFixed(0)}s (in ${usage.input} / out ${usage.output})`);
      return;
    } catch (e) { console.error(`[banks] ${s.id} attempt ${attempt}: ${e.message}`); if (attempt === 3) console.error(`[banks] ${s.id}: GIVE UP`); await new Promise((r) => setTimeout(r, 3000)); }
  }
}
const queue = todo.slice();
await Promise.all(Array.from({ length: opt.concurrency }, async () => { while (queue.length) await one(queue.shift()); }));
results.sort((a, b) => STYLES.findIndex((s) => s.id === a.id) - STYLES.findIndex((s) => s.id === b.id));
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(results, null, 1));
const patterns = results.reduce((a, r) => a + r.counts.progressions + r.counts.lh + r.counts.rh + r.counts.fills, 0);
console.error(`[banks] done: ${results.length} styles, ${patterns} patterns, tokens in ${total.input} / out ${total.output}`);
