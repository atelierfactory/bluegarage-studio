#!/usr/bin/env node
// ═══════════ VESPER PIANO を「HTML 1 枚」に詰める (ダブルクリックで開ける配布用) ═══════════
//   node tools/build-single.mjs <repertoire の perf ファイル名> <出力 .html> [タイトル]
//   例: node tools/build-single.mjs revolutionary.vesper.json ~/Desktop/VESPER_PIANO_革命.html
// 中身: piano/index.html + CSS + フォント (data:) + Tone.js + esbuild で 1 本にした JS (three.js 込み)
//       + 曲データ + その曲で使う音源だけ (base64)。fetch() を差し替えて、埋め込んだファイルを返す (file:// でも動く)。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { SfzInstrument } from "../public/js/sampler.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(__dirname, "..", "public");
const [perfFile, outFile, titleArg] = process.argv.slice(2);
if (!perfFile || !outFile) { console.error("usage: build-single.mjs <perf.json> <out.html> [title]"); process.exit(1); }
const rd = (p) => fs.readFileSync(path.join(PUB, p));
const b64 = (p) => rd(p).toString("base64");

// 1. 曲と、その曲で使う音源
const perf = JSON.parse(rd(`piano/repertoire/${perfFile}`));
const song = perf.song;
const repIndex = JSON.parse(rd("piano/repertoire/index.json"));
const item = repIndex.find((x) => x.perf === perfFile);
if (!item) throw new Error(`index.json に ${perfFile} が無い`);
const sfzIndex = JSON.parse(rd("samples/piano/index.json"));
const inst = new SfzInstrument("samples/piano/", sfzIndex);
const notes = song.tracks[0].notes.map((n, i) => ({ ...n, i }));
const sampleUrls = [...inst.plan(notes, song.tempo)];
// 使わない音源の項目は index から外す (無いファイルを探しに行かないように)
const usedSampleIdx = new Set(sfzIndex.regions.filter((r) => r.s >= 0 && sampleUrls.includes("samples/piano/" + sfzIndex.samples[r.s].f)).map((r) => r.s));
const slimIndex = { ...sfzIndex, regions: sfzIndex.regions.filter((r) => r.s < 0 || usedSampleIdx.has(r.s)) };

// 2. 埋め込みファイル表 (VFS)
const vfs = {};
vfs["samples/piano/index.json"] = { t: "application/json", s: JSON.stringify(slimIndex) };
for (const u of sampleUrls) vfs[u] = { t: "audio/ogg", b: b64(u) };
vfs["repertoire/index.json"] = { t: "application/json", s: JSON.stringify([item]) };
vfs[`repertoire/${perfFile}`] = { t: "application/json", s: JSON.stringify(perf) };
vfs["banks/index.json"] = { t: "application/json", s: "[]" };

// 3. JS を 1 本に (three.js は "three" の別名、audio.js の音源の場所は仮の住所に)
const result = await build({
  entryPoints: [path.join(PUB, "piano/piano.js")],
  bundle: true, format: "iife", write: false, minify: true, legalComments: "none", target: "es2022", charset: "utf8",
  alias: { three: path.join(PUB, "vendor/three/three.module.js") },
  plugins: [{ name: "vfs-paths", setup(b) {
    b.onLoad({ filter: /public\/js\/audio\.js$/ }, (a) => ({ contents: fs.readFileSync(a.path, "utf8").replace('new URL("../samples/", import.meta.url).href', '"vfs://samples/"'), loader: "js" }));
  } }],
  logLevel: "warning",
});
// inline の <script> の中に "</script>" が現れると、そこで HTML が切れてしまう → 文字列の中の物はエスケープする
const noClose = (t) => t.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
const js = noClose(result.outputFiles[0].text);

// 4. CSS (フォントは data: に)
let fontsCss = rd("vendor/fonts/fonts.css").toString();
fontsCss = fontsCss.replace(/url\(([^)]+\.woff2)\)/g, (m, f) => `url(data:font/woff2;base64,${b64("vendor/fonts/" + f)})`);
const css = `${fontsCss}\n${rd("style.css")}\n${rd("piano/style.css")}`;

// 5. HTML
let html = rd("piano/index.html").toString();
html = html.replace(/<link rel="stylesheet"[^>]*>\s*/g, "").replace(/<script src="\.\.\/vendor\/Tone\.js"><\/script>\s*/, "").replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, "").replace(/<script type="module" src="piano\.js"><\/script>/, "<!--APP-->");
if (titleArg) html = html.replace(/<title>[^<]*<\/title>/, `<title>${titleArg}</title>`);
const loader = `
<script>
// 埋め込んだファイル (音源・曲・設定) を fetch() の代わりに返す。file:// で開いても動く。
(() => {
  const VFS = ${noClose(JSON.stringify(vfs))};
  const keys = Object.keys(VFS);
  const bytesOf = (s) => { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
  const orig = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const key = keys.find((k) => url === k || url.endsWith("/" + k));
    if (!key) return orig(input, init).catch(() => new Response("", { status: 404 }));
    const e = VFS[key];
    const body = e.s != null ? e.s : bytesOf(e.b);
    return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": e.t } }));
  };
})();
</script>`;
// 注意: replace の置き換え文字列は "$&" "$'" などを特別扱いするので、必ず関数で渡す (JS の中の $ が壊れる)
const headExtra = `<style>\n${css}\n</style>\n${loader}\n<script>\n${noClose(rd("vendor/Tone.js").toString())}\n</script>\n</head>`;
html = html.replace("</head>", () => headExtra);
html = html.replace("<!--APP-->", () => `<script>\n${js}\n</script>`);
fs.writeFileSync(outFile, html);
console.log(`wrote ${outFile}: ${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB (samples ${sampleUrls.length} files, js ${(js.length / 1e6).toFixed(2)} MB)`);
