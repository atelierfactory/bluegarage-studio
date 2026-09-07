// ═══════════ Claude API クライアント (ブラウザ直結 or サーバー経由) ═══════════
// 配布版はユーザー自身の API キーでブラウザから直接 api.anthropic.com を呼ぶ (サーバー不要)。
// ローカル開発では server.js の /api/proxy がサーバー側の .env のキーで代わりに呼ぶ。
// どちらも同じ SSE 形式なので、ここで一度だけ解析する。

const LS_KEY = "bluegarage:settings:v1";
export const MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5 (最高品質)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (速い)" },
];
export const DEFAULT_MODEL = "claude-opus-5";

const defaults = { apiKey: "", model: DEFAULT_MODEL, transport: "auto", lang: "" };
let cached = null;
export const settings = {
  get() {
    if (!cached) {
      try { cached = { ...defaults, ...(JSON.parse(localStorage.getItem(LS_KEY) || "{}")) }; } catch { cached = { ...defaults }; }
    }
    return cached;
  },
  set(patch) {
    cached = { ...settings.get(), ...patch };
    try { localStorage.setItem(LS_KEY, JSON.stringify(cached)); } catch {}
    return cached;
  },
};

// サーバーがキーを持っているか (ローカル起動時のみ true)。
// 公開サイトでは、デプロイ時に GitHub Actions の secret から書き出される config.json の
// 「サイト同梱キー」があればそれを使う (キーは git には入らないが、サイトを開いた人には見える)。
let serverInfo = null;
export async function probeServer() {
  if (serverInfo) return serverInfo;
  let info = { hasKey: false, static: true };
  try {
    const r = await fetch("/api/config", { cache: "no-cache" });
    if (r.ok) info = await r.json();
  } catch {}
  if (!info.hasKey) {
    try {
      const r = await fetch("config.json", { cache: "no-cache" }); // 相対パス (サブディレクトリ配信でも動く)
      if (r.ok) {
        const c = await r.json();
        if (c?.anthropicKey) { info.embeddedKey = c.anthropicKey; if (c.model) info.embeddedModel = c.model; }
      }
    } catch {}
  }
  serverInfo = info;
  return serverInfo;
}
export function resetServerProbe() { serverInfo = null; }

// 実際に使う経路: "direct" (自分のキー) / "proxy" (ローカルサーバーのキー) / "embedded" (サイト同梱のキー)
export async function resolveTransport() {
  const s = settings.get();
  const info = await probeServer();
  const fallback = () => (info.hasKey ? "proxy" : info.embeddedKey ? "embedded" : "none");
  if (s.transport === "direct") return s.apiKey ? "direct" : fallback();
  if (s.transport === "proxy") return info.hasKey ? "proxy" : (s.apiKey ? "direct" : fallback());
  if (s.apiKey) return "direct";
  return fallback();
}

export class ClaudeError extends Error {
  constructor(message, { status, type, retryable = false } = {}) { super(message); this.status = status; this.type = type; this.retryable = retryable; }
}

function friendlyError(status, body) {
  const type = body?.error?.type ?? "";
  const msg = body?.error?.message ?? "";
  if (status === 401 || type === "authentication_error") return new ClaudeError("APIキーが無効です。⚙ 設定でキーを確認してください。", { status, type });
  if (status === 403 || type === "permission_error") return new ClaudeError(`このキーでは使えません: ${msg}`, { status, type });
  if (status === 429 || type === "rate_limit_error") return new ClaudeError("レート制限に達しました。少し待って再試行してください。", { status, type, retryable: true });
  if (status === 529 || type === "overloaded_error") return new ClaudeError("API が混み合っています。少し待って再試行してください。", { status, type, retryable: true });
  if (status >= 500) return new ClaudeError(`API エラー (${status}): ${msg}`, { status, type, retryable: true });
  return new ClaudeError(`API エラー (${status}): ${msg || type || "不明"}`, { status, type });
}

/**
 * Messages API を 1 回ストリーミングで呼ぶ。
 * @param {object} o
 * @param {string|Array} o.system
 * @param {Array} o.messages
 * @param {Array} [o.tools]
 * @param {object} [o.schema]  structured outputs の JSON Schema
 * @param {number} [o.maxTokens]
 * @param {(delta:string)=>void} [o.onText]
 * @param {(info:{chars:number,notes:number,attempt:number})=>void} [o.onProgress]
 * @param {AbortSignal} [o.signal]
 * @returns {Promise<{content:Array, stop_reason:string, usage:object, text:string}>}
 */
export async function streamMessage(o) {
  const s = settings.get();
  const transport = await resolveTransport();
  if (transport === "none") throw new ClaudeError("API キーが設定されていません。右上の ⚙ から Anthropic の API キーを入れてください。", { type: "no_key" });
  const body = {
    model: o.model ?? s.model ?? DEFAULT_MODEL,
    max_tokens: o.maxTokens ?? 64000,
    stream: true,
    messages: o.messages,
  };
  if (o.system) body.system = typeof o.system === "string" ? [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }] : o.system;
  if (o.tools) body.tools = o.tools;
  if (o.schema) body.output_config = { format: { type: "json_schema", schema: o.schema } };

  const MAX_ATTEMPTS = 4;
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptOnce(body, transport, transport === "embedded" ? (await probeServer()).embeddedKey : s.apiKey, o, attempt);
    } catch (e) {
      lastErr = e;
      if (o.signal?.aborted) throw e;
      const retryable = e instanceof ClaudeError ? e.retryable : /network|fetch|socket|terminated|ECONN|ETIMEDOUT|Load failed/i.test(String(e?.message));
      if (!retryable || attempt === MAX_ATTEMPTS) throw e;
      o.onProgress?.({ chars: 0, notes: 0, attempt: attempt + 1, retry: true });
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

async function attemptOnce(body, transport, apiKey, o, attempt) {
  const url = transport === "proxy" ? "/api/proxy" : "https://api.anthropic.com/v1/messages";
  const headers = { "Content-Type": "application/json" };
  if (transport !== "proxy") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: o.signal });
  if (!res.ok) {
    let j = null; try { j = await res.json(); } catch {}
    throw friendlyError(res.status, j);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const content = [];
  let stop_reason = null, usage = {};
  let chars = 0, notes = 0, lastTick = 0;
  const partialJson = new Map();
  const handle = (ev) => {
    switch (ev.type) {
      case "message_start": usage = { ...(ev.message?.usage ?? {}) }; break;
      case "content_block_start":
        content[ev.index] = { ...ev.content_block };
        if (ev.content_block.type === "tool_use") partialJson.set(ev.index, "");
        if (ev.content_block.type === "text") content[ev.index].text = ev.content_block.text ?? "";
        if (ev.content_block.type === "thinking") { content[ev.index].thinking = ev.content_block.thinking ?? ""; content[ev.index].signature = ev.content_block.signature ?? ""; }
        break;
      case "content_block_delta": {
        const d = ev.delta;
        if (d.type === "text_delta") {
          content[ev.index].text += d.text;
          chars += d.text.length;
          const m = d.text.match(/"p"\s*:/g); if (m) notes += m.length;
          o.onText?.(d.text);
          const now = Date.now();
          if (now - lastTick > 250) { lastTick = now; o.onProgress?.({ chars, notes, attempt }); }
        } else if (d.type === "input_json_delta") {
          partialJson.set(ev.index, (partialJson.get(ev.index) ?? "") + d.partial_json);
        } else if (d.type === "thinking_delta") {
          // 拡張思考: 会話履歴に戻すとき thinking + signature が必要なので保持する
          content[ev.index].thinking = (content[ev.index].thinking ?? "") + (d.thinking ?? "");
        } else if (d.type === "signature_delta") {
          content[ev.index].signature = (content[ev.index].signature ?? "") + (d.signature ?? "");
        }
        break;
      }
      case "content_block_stop": {
        const b = content[ev.index];
        if (b?.type === "tool_use") { const js = partialJson.get(ev.index) ?? ""; try { b.input = js ? JSON.parse(js) : {}; } catch { b.input = {}; } }
        break;
      }
      case "message_delta": stop_reason = ev.delta?.stop_reason ?? stop_reason; usage = { ...usage, ...(ev.usage ?? {}) }; break;
      case "error": throw new ClaudeError(ev.error?.message ?? "stream error", { type: ev.error?.type, retryable: /overloaded/.test(ev.error?.type ?? "") });
      default: break;
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const dataLines = chunk.split("\n").filter((l) => l.startsWith("data:"));
      if (!dataLines.length) continue;
      const raw = dataLines.map((l) => l.slice(5).trim()).join("");
      if (!raw || raw === "[DONE]") continue;
      let ev; try { ev = JSON.parse(raw); } catch { continue; }
      handle(ev);
    }
  }
  if (!stop_reason && !content.length) throw new ClaudeError("応答が途中で切れました", { retryable: true });
  const text = content.filter((b) => b?.type === "text").map((b) => b.text).join("");
  return { content: content.filter(Boolean), stop_reason, usage: { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 }, text };
}

/** structured outputs で JSON を 1 つもらう */
export async function generateStructured({ system, userText, schema, label, onProgress, maxTokens, signal, model }) {
  const r = await streamMessage({ system, messages: [{ role: "user", content: userText }], schema, maxTokens: maxTokens ?? 100000, onProgress, signal, model });
  if (r.stop_reason === "refusal") throw new ClaudeError("モデルがこのリクエストを拒否しました。プロンプトを変えて再試行してください。");
  if (r.stop_reason === "max_tokens") throw new ClaudeError("出力がトークン上限に達しました。生成範囲(小節数)を減らして再試行してください。");
  let data;
  try { data = JSON.parse(r.text); } catch {
    const m = r.text.match(/\{[\s\S]*\}/);
    if (!m) throw new ClaudeError(`JSON の解析に失敗しました (${label ?? ""})`);
    data = JSON.parse(m[0]);
  }
  return { data, usage: r.usage };
}

/** 接続テスト (設定画面用) */
export async function testConnection() {
  const r = await streamMessage({ messages: [{ role: "user", content: "Reply with the single word OK." }], maxTokens: 16, model: "claude-sonnet-5" });
  return r.text.trim();
}
