// BLUE GARAGE STUDIO — ローカル用サーバー
// 役割: (1) public/ を配る (2) .env のキーで Claude API を代理で呼ぶ (/api/proxy)
//       (3) 書き出し・プリセットをディスクに保存する
// 配布版 (静的ホスティング) ではこのサーバーは不要: ブラウザがユーザー自身のキーで直接 API を呼ぶ。
// プロンプトや道具の定義は public/js/prompts.js にあり、ブラウザと共有している。
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBlueprintRequest, buildTrackRequest } from "./public/js/prompts.js";
import { analyzeNotes } from "./public/js/critic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "40mb" }));
app.use(express.static(path.join(__dirname, "public")));

const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const DEFAULT_MODEL = process.env.BLUEGARAGE_MODEL || "claude-opus-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/* ---------------------------------- config / proxy ---------------------------------- */

app.get("/api/config", (req, res) => {
  res.json({ hasKey: !!API_KEY, model: DEFAULT_MODEL, static: false, version: "2.0.0" });
});

// Messages API の素通し (ストリーミング)。ブラウザ側 claude.js が SSE をそのまま解析する。
app.post("/api/proxy", async (req, res) => {
  if (!API_KEY) return res.status(401).json({ error: { type: "authentication_error", message: "サーバーに ANTHROPIC_API_KEY がありません (.env)" } });
  const body = req.body ?? {};
  if (!body.model) body.model = DEFAULT_MODEL;
  body.stream = true;
  const ac = new AbortController();
  // クライアントが切ったら上流も止める (req の close は本文を読み終えた時点でも発火するので res 側を見る)
  res.on("close", () => { if (!res.writableFinished) ac.abort(); });
  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (err) {
    if (ac.signal.aborted) return;
    console.error("[proxy] connect:", err?.message);
    return res.status(502).json({ error: { type: "api_error", message: `接続できません: ${err?.message}` } });
  }
  if (!upstream.ok) {
    const text = await upstream.text();
    res.status(upstream.status).type("application/json").send(text);
    return;
  }
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  try {
    for await (const chunk of upstream.body) { if (ac.signal.aborted) break; res.write(chunk); }
  } catch (err) { if (!ac.signal.aborted) console.error("[proxy] stream:", err?.message); }
  res.end();
});

/* ---------------------------------- コマンドライン用 (tools/compose.mjs) ---------------------------------- */
// ブラウザと同じプロンプトで structured outputs を呼び、進捗を SSE で返す。

function sseInit(res) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
}
const sseSend = (res, obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

async function streamStructured({ res, system, userText, schema, label, model }) {
  sseInit(res);
  let closed = false;
  res.on("close", () => { closed = true; });
  if (!API_KEY) { sseSend(res, { type: "error", message: "サーバーに ANTHROPIC_API_KEY がありません (.env)" }); return res.end(); }
  const body = {
    model: model || DEFAULT_MODEL, max_tokens: 100000, stream: true,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: userText }],
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const up = await fetch(ANTHROPIC_URL, { method: "POST", headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify(body) });
      if (!up.ok) {
        const j = await up.json().catch(() => ({}));
        const msg = j?.error?.message ?? `HTTP ${up.status}`;
        if ((up.status === 529 || up.status >= 500 || up.status === 429) && attempt < 3) { await new Promise((r) => setTimeout(r, 2500 * attempt)); continue; }
        sseSend(res, { type: "error", message: `API エラー (${up.status}): ${msg}` }); return res.end();
      }
      const dec = new TextDecoder();
      let buf = "", text = "", chars = 0, notes = 0, lastTick = 0, stop = null, usage = {};
      for await (const chunk of up.body) {
        buf += dec.decode(chunk, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const part = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const line = part.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
            text += ev.delta.text; chars += ev.delta.text.length;
            const m = ev.delta.text.match(/"p"\s*:/g); if (m) notes += m.length;
            const now = Date.now();
            if (!closed && now - lastTick > 250) { lastTick = now; sseSend(res, { type: "progress", label, chars, notes }); }
          } else if (ev.type === "message_start") usage = ev.message?.usage ?? {};
          else if (ev.type === "message_delta") { stop = ev.delta?.stop_reason ?? stop; usage = { ...usage, ...(ev.usage ?? {}) }; }
          else if (ev.type === "error") throw new Error(ev.error?.message ?? "stream error");
        }
      }
      if (stop === "refusal") { sseSend(res, { type: "error", message: "モデルがこのリクエストを拒否しました。" }); return res.end(); }
      if (stop === "max_tokens") { sseSend(res, { type: "error", message: "出力がトークン上限に達しました。範囲を減らしてください。" }); return res.end(); }
      let data; try { data = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error("JSON の解析に失敗"); data = JSON.parse(m[0]); }
      if (!closed) sseSend(res, { type: "done", data, usage: { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 } });
      return res.end();
    } catch (err) {
      console.error(`[${label}] attempt ${attempt}:`, err?.message);
      if (closed) return;
      if (attempt === 3) { sseSend(res, { type: "error", message: `エラー: ${err.message}` }); return res.end(); }
      sseSend(res, { type: "progress", label, chars: 0, notes: 0, retry: attempt });
      await new Promise((r) => setTimeout(r, 2500 * attempt));
    }
  }
}

app.post("/api/blueprint", async (req, res) => {
  const { prompt, tempo, key, existing, model } = req.body ?? {};
  if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "prompt は必須です" });
  const r = buildBlueprintRequest({ prompt, tempo, key, existing });
  await streamStructured({ res, ...r, model });
});

app.post("/api/track", async (req, res) => {
  const { song, track, range, otherTracks, mode, existingNotes, extraDirection, issues, previousNotes, previousPerformanceNotes, model } = req.body ?? {};
  if (!song || !track || !range) return res.status(400).json({ error: "song / track / range は必須です" });
  const r = buildTrackRequest({ song, track, range, otherTracks, mode, existingNotes, extraDirection, issues, previousNotes, previousPerformanceNotes });
  await streamStructured({ res, ...r, model });
});

// 検査だけ (compose.mjs 用)
app.post("/api/analyze", (req, res) => {
  const { notes, song, track, range } = req.body ?? {};
  if (!song || !track || !range) return res.status(400).json({ error: "song / track / range は必須です" });
  res.json(analyzeNotes(notes ?? [], { song, track, range }));
});

/* ---------------------------------- files ---------------------------------- */

app.post("/api/save-audio", express.raw({ type: ["audio/wav", "application/octet-stream"], limit: "400mb" }), async (req, res) => {
  const name = String(req.query.name ?? "export").replace(/[^a-z0-9\-_ぁ-んァ-ヶ一-龠ー]/gi, "-").slice(0, 60);
  if (!req.body?.length) return res.status(400).json({ error: "音声データが空です" });
  const fs = await import("node:fs/promises");
  const dir = path.join(__dirname, "exports");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.wav`);
  await fs.writeFile(file, req.body);
  res.json({ ok: true, file: `exports/${name}.wav`, bytes: req.body.length });
});

app.post("/api/save-preset", async (req, res) => {
  const { name, song } = req.body ?? {};
  if (!name || !song?.tracks) return res.status(400).json({ error: "name / song は必須です" });
  const safe = String(name).replace(/[^a-z0-9\-_]/gi, "-").slice(0, 60);
  const fs = await import("node:fs/promises");
  const dir = path.join(__dirname, "public", "presets");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${safe}.json`), JSON.stringify({ song }, null, 1), "utf8");
  res.json({ ok: true, file: `presets/${safe}.json` });
});

app.get("/api/presets", async (req, res) => {
  const fs = await import("node:fs/promises");
  const dir = path.join(__dirname, "public", "presets");
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    const out = [];
    for (const f of files) {
      try { const j = JSON.parse(await fs.readFile(path.join(dir, f), "utf8")); out.push({ name: f.replace(/\.json$/, ""), title: j.song?.title ?? "", tracks: j.song?.tracks?.length ?? 0 }); } catch {}
    }
    res.json(out);
  } catch { res.json([]); }
});

/* ---------------------------------- start ---------------------------------- */

const PORT = process.env.PORT || 5173;
app.listen(PORT, () => {
  console.log(`BLUE GARAGE STUDIO -> http://localhost:${PORT}`);
  if (!API_KEY) console.warn("NOTE: .env に ANTHROPIC_API_KEY がありません。ブラウザの ⚙ 設定で各自のキーを入れれば動きます。");
});
