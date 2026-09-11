// Astra の会話で本当に使った量と、金額の目安を出す。
//   node astra/cost.mjs <会話の番号>
// codex の出力の最後の "tokens used" は使った量の全部ではない (使い回しの読み込みを含まない) ので、
// Codex の会話記録 (~/.codex/sessions/**/rollout-*<会話の番号>.jsonl) の最後の token_count から数える。
// 料金は GPT-6 Astra の公表値 (100 万トークンあたり 入力 10・使い回し 1・使い回しの保存 12.5・出力 50 ドル)。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const sid = process.argv[2];
if (!sid) { console.error("usage: node astra/cost.mjs <session id>"); process.exit(2); }
const find = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const r = find(p); if (r) return r; }
    else if (e.name.includes(sid) && e.name.endsWith(".jsonl")) return p;
  }
  return null;
};
const file = find(join(homedir(), ".codex", "sessions"));
if (!file) { console.error(`会話の記録が見つかりません: ${sid}`); process.exit(1); }
const last = readFileSync(file, "utf8").split("\n").filter((l) => l.includes('"token_count"')).at(-1);
const u = last ? JSON.parse(last).payload?.info?.total_token_usage ?? {} : {};
const i = u.input_tokens ?? 0, c = u.cached_input_tokens ?? 0, w = u.cache_write_input_tokens ?? 0, o = u.output_tokens ?? 0;
const usd = (Math.max(0, i - c - w) * 10 + c * 1 + w * 12.5 + o * 50) / 1e6;
const M = (n) => (n / 1e6).toFixed(2) + "M";
console.log(`会話の合計: 読んだ ${M(i)} (使い回し ${M(c)}・保存 ${M(w)}) / 書いた ${M(o)} → 約 ${usd.toFixed(1)} ドル`);
