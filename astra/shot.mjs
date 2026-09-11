// Claude の確認用: Chromium を DevTools で動かし、PIANO / BAND の「ready」を待って保存する。
// (chrome-headless-shell の --screenshot は読み込み直後に写すので、準備待ちの撮影だと真っ黒になる)
//   node astra/shot.mjs <出力.png> <URL> [<出力.png> <URL> ...]
//   node astra/shot.mjs --size=390x844 --page <出力.png> <PIANOの通常画面URL>
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const BIN = "/Users/satorun/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const PORT = 9333;
const args=process.argv.slice(2),sizeArg=args.find(a=>a.startsWith('--size=')),pageMode=args.includes('--page');
const size=(sizeArg?.slice(7)??'1600x900').match(/^(\d{3,4})x(\d{3,4})$/);
if(!size)throw new Error('size must be WIDTHxHEIGHT');
const width=Number(size[1]),height=Number(size[2]),positional=args.filter(a=>!a.startsWith('--'));
const pairs = [];
for (let i = 0; i + 1 < positional.length; i += 2) pairs.push([positional[i], positional[i + 1]]);
if (!pairs.length) { console.error("usage: node astra/shot.mjs out.png URL [out.png URL ...]"); process.exit(2); }

const chrome = spawn(BIN, [`--remote-debugging-port=${PORT}`, `--window-size=${width},${height}`, "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page"); } catch {} }
  if (!target) throw new Error("Chromium の DevTools に繋がりません");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, ng) => { ws.onopen = ok; ws.onerror = ng; });
  let seq = 0; const waiting = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
  const send = (method, params = {}) => new Promise((ok) => { const id = ++seq; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  for (const [out, url] of pairs) {
    const t0 = Date.now();
    await send("Page.navigate", { url });
    let status = null;
    for (let i = 0; i < 240; i++) {   // 最大 60 秒
      await sleep(250);
      status = await evaluate(pageMode?"window.pianoReady ? window.pianoReady.then(async r => { await document.fonts.ready; await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))); return JSON.stringify(r?.error ? {state:'error',error:r.error} : {state:'ready',page:true}); }) : null":"JSON.stringify(window.pianoShotStatus ?? window.bandShotStatus ?? null)").catch(() => null);
      const s = status ? JSON.parse(status) : null;
      if (s?.state === "ready" || s?.state === "error") break;
    }
    const ready = status ? JSON.parse(status) : null;
    if (ready?.state !== "ready") throw new Error(`撮影の準備が完了しませんでした: ${status}`);
    await sleep(400);   // 最後の描画を待つ
    const shot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(out, Buffer.from(shot.result.data, "base64"));
    console.log(`${out}  ${((Date.now() - t0) / 1000).toFixed(1)}s  status=${status}`);
  }
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}
