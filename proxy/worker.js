// ═══════════ BLUE GARAGE STUDIO — API 中継サーバー (Cloudflare Worker) ═══════════
// Anthropic の API キーはこの Worker の secret にだけ置く。ブラウザにはキーを一切渡さない。
// ブラウザ → (この Worker) → api.anthropic.com。応答 (SSE) はそのまま流す。
//
// 守り:
//   1. Origin 制限   … ALLOWED_ORIGINS (wrangler.toml の vars) に無いサイトからは 403
//   2. アクセスコード … secret PASSCODE が設定されていれば、ヘッダ x-bluegarage-pass が一致しないと 401
//   3. 回数制限      … RATE_LIMITER (wrangler.toml の ratelimit binding) があれば IP ごとに制限
//   4. 本文の大きさ  … 2MB まで
// お金の上限は Anthropic Console 側のワークスペースの Spend limit で必ず別途かける。

const ANTHROPIC = "https://api.anthropic.com/v1/messages";

function allowedOrigin(origin, env) {
  const list = String(env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) return true;                 // 未設定なら制限しない (開発用)
  return list.includes(origin);
}
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-bluegarage-pass, anthropic-version",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(obj, headers, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "content-type": "application/json" } });
}
const err = (type, message, headers, status) => json({ error: { type, message } }, headers, status);

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") ?? "";
    const cors = corsHeaders(allowedOrigin(origin, env) ? origin : "null");
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/health") return json({ ok: true, passcode: !!env.PASSCODE, hasKey: !!env.ANTHROPIC_API_KEY }, cors);
    if (req.method !== "POST" || url.pathname !== "/v1/messages") return err("not_found_error", "not found", cors, 404);

    if (!allowedOrigin(origin, env)) return err("permission_error", "このサイトからは使えません (origin not allowed)", cors, 403);
    if (env.PASSCODE && req.headers.get("x-bluegarage-pass") !== env.PASSCODE) return err("access_code_error", "アクセスコードが必要です (access code required)", cors, 401);
    if (!env.ANTHROPIC_API_KEY) return err("api_error", "サーバーに ANTHROPIC_API_KEY が設定されていません", cors, 500);

    if (env.RATE_LIMITER) {
      const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
      try {
        const { success } = await env.RATE_LIMITER.limit({ key: ip });
        if (!success) return err("rate_limit_error", "リクエストが多すぎます。少し待ってください", cors, 429);
      } catch {}
    }

    const body = await req.text();
    if (body.length > 2_000_000) return err("invalid_request_error", "request too large", cors, 413);

    const up = await fetch(ANTHROPIC, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body,
    });
    const headers = new Headers(cors);
    headers.set("content-type", up.headers.get("content-type") ?? "application/json");
    headers.set("cache-control", "no-store");
    return new Response(up.body, { status: up.status, headers });
  },
};
