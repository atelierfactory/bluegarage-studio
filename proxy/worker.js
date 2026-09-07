// ═══════════ BLUE GARAGE STUDIO — API 中継サーバー (Cloudflare Worker) ═══════════
// Anthropic の API キーはこの Worker の secret にだけ置く。ブラウザにはキーを一切渡さない。
// ブラウザ → (この Worker) → api.anthropic.com。応答 (SSE) はそのまま流す。
//
// 守り:
//   1. Origin 制限    … ALLOWED_ORIGINS (wrangler.toml の vars) に無いサイトからは 403
//   2. アクセスコード  … secret PASSCODE が設定されていれば、ヘッダ x-bluegarage-pass が一致しないと 401
//   3. 回数制限       … RATE_LIMITER (ratelimit binding) があれば IP ごとに 1 分あたりの回数を制限
//   4. 1 日の上限     … KV (COUNTERS) で日ごとに数える。曲 (設計図) は SONG_LIMIT 曲/日、
//                       トラック生成は TRACK_LIMIT 回/日、その他 (チャット等) は OTHER_LIMIT 回/日。
//                       上限に達したら 429 (daily_limit_error)。日付は DAILY_TZ_OFFSET 時間ずらして数える (既定 +9 = 日本時間)
//   5. 本文の大きさ   … 2MB まで
// お金の上限は Anthropic Console 側のワークスペースの Spend limit で必ず別途かける。
//
// ブラウザは要求の種類をヘッダ x-bluegarage-kind で伝える (blueprint / track / revise / mix / synth / chat / test)。

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
    "Access-Control-Allow-Headers": "content-type, x-bluegarage-pass, x-bluegarage-kind, anthropic-version",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(obj, headers, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "content-type": "application/json", "cache-control": "no-store" } });
}
const err = (type, message, headers, status) => json({ error: { type, message } }, headers, status);

// 「今日」の日付キー (DAILY_TZ_OFFSET 時間ずらす。既定は日本時間)
function dayKey(env) {
  const off = Number(env.DAILY_TZ_OFFSET ?? 9);
  const d = new Date(Date.now() + off * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
const limits = (env) => {
  const song = Math.max(0, Number(env.SONG_LIMIT ?? 20));
  return { blueprint: song, track: Math.max(0, Number(env.TRACK_LIMIT ?? song * 15)), other: Math.max(0, Number(env.OTHER_LIMIT ?? 3000)) };
};
const bucketOf = (kind) => (kind === "blueprint" ? "blueprint" : (kind === "track" || kind === "revise") ? "track" : "other");

async function readCounts(env) {
  const day = dayKey(env);
  const out = { day, blueprint: 0, track: 0, other: 0 };
  if (!env.COUNTERS) return out;
  for (const b of ["blueprint", "track", "other"]) out[b] = Number((await env.COUNTERS.get(`${day}:${b}`)) ?? 0);
  return out;
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") ?? "";
    const cors = corsHeaders(allowedOrigin(origin, env) ? origin : "null");
    const url = new URL(req.url);
    const lim = limits(env);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/health") {
      const c = await readCounts(env);
      return json({ ok: true, passcode: !!env.PASSCODE, hasKey: !!env.ANTHROPIC_API_KEY, counter: !!env.COUNTERS, day: c.day,
        songs: { used: c.blueprint, limit: lim.blueprint, left: Math.max(0, lim.blueprint - c.blueprint) },
        tracks: { used: c.track, limit: lim.track } }, cors);
    }
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

    // 1 日の上限 (曲 / トラック / その他)。数える仕組み (KV) が無いときは曲作りを通さない (安全側)
    const kind = (req.headers.get("x-bluegarage-kind") ?? "chat").toLowerCase();
    const bucket = bucketOf(kind);
    if (!env.COUNTERS) {
      if (bucket !== "other") return err("api_error", "サーバーの日次カウンタ (KV) が未設定のため、曲の生成は止めています", cors, 503);
    } else {
      const day = dayKey(env);
      const key = `${day}:${bucket}`;
      const used = Number((await env.COUNTERS.get(key)) ?? 0);
      if (used >= lim[bucket]) {
        const msg = bucket === "blueprint" ? `今日の曲数の上限 (${lim.blueprint}曲/日) に達しました。日付が変わると (日本時間 0 時) また作れます`
          : bucket === "track" ? `今日のトラック生成の上限 (${lim.track}回/日) に達しました。日付が変わるとまた作れます`
          : `今日の利用上限に達しました。日付が変わるとまた使えます`;
        return err("daily_limit_error", msg, cors, 429);
      }
      await env.COUNTERS.put(key, String(used + 1), { expirationTtl: 3 * 86400 }); // 3 日で自動消去
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
