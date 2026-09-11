// AudioWorklet 用の 1 ファイル版を作る: synthcore.js + worklet/synth2-processor.js → worklet/synth2-processor.bundle.js
// 理由: Tone.js が使う standardized-audio-context の addModule は、モジュールの中身を blob に包んで読み込むので、
//       ES の import 文が使えない (SyntaxError)。import を使わない 1 ファイルにしておけば、その包み方でも動く。
// 使い方: node tools/bundle-worklet.mjs   (synthcore.js / synth2-processor.js を変えたら必ず実行)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = readFileSync(path.join(root, "public/js/synthcore.js"), "utf8");
const proc = readFileSync(path.join(root, "public/js/worklet/synth2-processor.js"), "utf8");

const stripExports = (src) => src
  .replace(/^export\s+(const|let|var|function|class|async function)\s/gm, "$1 ")
  .replace(/^export\s*\{[^}]*\};?\s*$/gm, "")
  .replace(/^export\s+default\s+/gm, "");
const stripImports = (src) => src.replace(/^import\s[^;]*;\s*$/gm, "");

const out = `// ═══════════ 自動生成: node tools/bundle-worklet.mjs (synthcore.js + synth2-processor.js)。手で直さない ═══════════\n` +
  `${stripExports(core)}\n\n/* ───── processor ───── */\n${stripImports(stripExports(proc))}`;
if (/^\s*(import|export)\s/m.test(out)) throw new Error("import/export が残っている");
writeFileSync(path.join(root, "public/js/worklet/synth2-processor.bundle.js"), out);
console.log(`wrote public/js/worklet/synth2-processor.bundle.js (${out.length} bytes)`);
