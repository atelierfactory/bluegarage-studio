#!/usr/bin/env node
// public/ を「サーバー無しの静的サイト」として配る簡易サーバー (GitHub Pages と同じ条件で試すため)。
//   node tools/static-serve.mjs [port]   → http://localhost:5180/
// /api/* は 404 を返す (claude.js が static と判定し、config.json の同梱キーを使う経路を通る)。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const port = +(process.argv[2] || 5180);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ogg": "audio/ogg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let p = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(p)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log(`static: http://localhost:${port}/ (root ${root})`));
