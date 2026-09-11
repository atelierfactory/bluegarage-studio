// 公開前の確認用: 手元のサーバー (5173) の前に立ち、会社サイト atelierfactory.jp/device/jukebox/ と同じ
// Content-Security-Policy を付けて返す。これで「会社サイトで開いたとき」に止められる物を手元で見られる。
//   node astra/csp-proxy.mjs [port=5190]
import http from "node:http";

const PORT = Number(process.argv[2] ?? 5190);
const UPSTREAM = { host: "127.0.0.1", port: 5173 };
// 2026-09-11 に https://atelierfactory.jp/device/jukebox/piano/ から取った値そのまま
// 3 つ目の引数に blob を付けると、script-src に blob: を足した案で返す (node astra/csp-proxy.mjs 5191 blob)
const SCRIPT_SRC = "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'" + (process.argv[3] === "blob" ? " blob:" : "") + " https://cdnjs.cloudflare.com";
const CSP = "default-src 'self'; " + SCRIPT_SRC + "; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://block.atelierfactory.jp; font-src 'self'; connect-src 'self' https://block.atelierfactory.jp; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

http.createServer((req, res) => {
  const up = http.request({ ...UPSTREAM, path: req.url, method: req.method, headers: { ...req.headers, host: `${UPSTREAM.host}:${UPSTREAM.port}` } }, (r) => {
    const headers = { ...r.headers };
    if (String(headers["content-type"] ?? "").includes("text/html")) headers["content-security-policy"] = CSP;
    res.writeHead(r.statusCode ?? 502, headers);
    r.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}).listen(PORT, () => console.log(`csp-proxy: http://localhost:${PORT} → 5173 (CSP = atelierfactory.jp)`));
