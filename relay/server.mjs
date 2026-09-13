// ═══════════ VESPER PIANO の中継 (公開版が Claude を呼ぶための小さな裏方) ═══════════
// ブロックビルダーと同じ Lightsail サーバーで動かす。鍵は /etc/bb.env の ANTHROPIC_API_KEY (systemd の EnvironmentFile) を読む。
//   GET  /health        → { ok, hasKey, passcode, songs:{used,limit,left}, tracks:{used,limit} }
//   POST /v1/messages   → api.anthropic.com/v1/messages にそのまま流す (ストリーミング)
// 守り: Origin の許可一覧 / (任意) アクセスコード / IP ごとに 1 分 N 回 / 1 日の上限 (曲・トラック・その他、日本時間 0 時切替)
// 依存なし (node:http だけ)。数は JSON ファイルに残す (再起動しても今日の分を忘れない)。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const env = process.env;
const PORT = Number(env.VESPER_PORT ?? 8768);
const ANTHROPIC = "https://api.anthropic.com/v1/messages";
const ORIGINS = String(env.VESPER_ORIGINS ?? "https://atelierfactory.jp,https://www.atelierfactory.jp").split(",").map((s) => s.trim()).filter(Boolean);
// 上限は「アプリごと・1 日ごと」(さとるん決定 2026-09-13: ピアノ 5 曲 / シンセ 5 曲、そのかわり同時に作曲してよい)
const LIM = {
  blueprint: Math.max(0, Number(env.VESPER_SONG_LIMIT ?? 5)),      // 曲 (設計図) の数 … アプリごと
  track: Math.max(0, Number(env.VESPER_TRACK_LIMIT ?? 90)),        // 音を作る呼び出し … アプリごと
  other: Math.max(0, Number(env.VESPER_OTHER_LIMIT ?? 60)),        // その他 … アプリごと
  ip: Math.max(1, Number(env.VESPER_IP_PER_MINUTE ?? 30)),
  ipDay: Math.max(1, Number(env.VESPER_IP_PER_DAY ?? 260)),        // 1 人で 5 曲作ると 100 回近く呼ぶので広めに
};
const APPS = ["piano", "band"];
const appOf = (req) => { const a = String(req.headers["x-bluegarage-app"] ?? "").toLowerCase(); return APPS.includes(a) ? a : "other"; };
// Origin ヘッダは curl などでは偽れるので、それだけに頼らない: 使えるモデルを絞り、出力の長さに上限を付け、1 日の回数 (全体・IP ごと) で金額を抑える
const MODELS = String(env.VESPER_MODELS ?? "claude-fable-5-1,claude-sonnet-5,claude-opus-5").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_TOKENS_CAP = Math.max(1000, Number(env.MAX_TOKENS_CAP ?? 110000));

// 2026-09-13: 「作曲は一度に 1 人」の席は外した (さとるん決定: 同時に作曲できる方がよい)。
// そのかわり 1 日の曲数をアプリごと 5 曲に絞って、金額を抑える。
const STATE = env.VESPER_STATE ?? "/var/lib/vesper/counters.json";
const PASSCODE = env.VESPER_PASSCODE ?? "";
const TZ_OFF = Number(env.VESPER_TZ_OFFSET ?? 9);

const dayKey = () => new Date(Date.now() + TZ_OFF * 3600 * 1000).toISOString().slice(0, 10);
// 種類 → 上限の箱。blueprint = 曲 1 つ (設計図)、track = 音を作る呼び出し (STUDIO の track/revise、VESPER PIANO の piano/polish/interpret)
const bucketOf = (kind) => (kind === "blueprint" ? "blueprint" : ["track", "revise", "piano", "polish", "interpret"].includes(kind) ? "track" : "other");

/* ── 数え役 (ファイルに残す) ── */
const emptyBuckets = () => ({ piano: { blueprint: 0, track: 0, other: 0 }, band: { blueprint: 0, track: 0, other: 0 }, other: { blueprint: 0, track: 0, other: 0 } });
let state = { day: dayKey(), buckets: emptyBuckets(), ip: {}, ipDay: {} };
try { const s = JSON.parse(fs.readFileSync(STATE, "utf8")); if (s && s.day) { const b = emptyBuckets(); for (const app of Object.keys(b)) Object.assign(b[app], s.buckets?.[app] ?? {}); state = { ...state, ...s, buckets: b, ip: s.ip ?? {}, ipDay: s.ipDay ?? {} }; } } catch {}
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(state)); } catch (e) { console.error("[relay] save:", e.message); } }, 200); }
function rollDay() { const d = dayKey(); if (state.day !== d) { state = { day: d, buckets: emptyBuckets(), ip: {}, ipDay: {} }; save(); } }
function bumpBucket(app, b) { rollDay(); const c = state.buckets[app] ?? (state.buckets[app] = { blueprint: 0, track: 0, other: 0 }); if (c[b] >= LIM[b]) return false; c[b]++; save(); return true; }
function bumpIp(ip) {
  rollDay();
  const minute = Math.floor(Date.now() / 60000); const k = `${ip}|${minute}`;
  for (const key of Object.keys(state.ip)) if (Number(key.split("|")[1]) < minute - 2) delete state.ip[key];
  const n = (state.ip[k] ?? 0) + 1; state.ip[k] = n;
  state.ipDay ??= {}; const d = (state.ipDay[ip] ?? 0) + 1; state.ipDay[ip] = d;
  save();
  return n <= LIM.ip && d <= LIM.ipDay;
}
// 本文の検査: JSON であること・messages があること・モデルは許可一覧だけ・出力の長さは上限まで
function checkBody(body) {
  let b; try { b = JSON.parse(body); } catch { return { error: "本文が JSON ではありません" }; }
  if (!b || typeof b !== "object" || !Array.isArray(b.messages)) return { error: "messages がありません" };
  if (env.FORCE_MODEL) b.model = env.FORCE_MODEL;
  if (!MODELS.includes(String(b.model ?? ""))) return { error: `このモデルは使えません (${MODELS.join(", ")} のみ)` };
  if (env.EFFORT) b.output_config = { ...(b.output_config ?? {}), effort: env.EFFORT };
  b.max_tokens = Math.min(Number(b.max_tokens ?? 64000) || 64000, MAX_TOKENS_CAP);
  return { body: JSON.stringify(b) };
}

/* ── 返事の道具 ── */
function cors(req, res) {
  const origin = req.headers.origin ?? "";
  if (ORIGINS.includes(origin)) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  // ブラウザが「この見出しを送ってよいか」と聞いてくる (preflight)。使う見出しは全部ここに書く (書き忘れると "Failed to fetch" で止まる)
  res.setHeader("Access-Control-Allow-Headers", "content-type, anthropic-version, x-bluegarage-kind, x-bluegarage-pass, x-bluegarage-session, x-bluegarage-app");
  res.setHeader("Access-Control-Max-Age", "3600");
}
const json = (res, status, obj) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };
const err = (res, status, type, message) => json(res, status, { error: { type, message } });
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > limit) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
const clientIp = (req) => (String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket.remoteAddress || "unknown");

/* ── 本体 ── */
const server = http.createServer(async (req, res) => {
  cors(req, res);
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (req.method === "GET" && url.pathname === "/health") {
    rollDay();
    const appStat = (app) => { const c = state.buckets[app] ?? { blueprint: 0, track: 0, other: 0 };
      return { songs: { used: c.blueprint, limit: LIM.blueprint, left: Math.max(0, LIM.blueprint - c.blueprint) }, tracks: { used: c.track, limit: LIM.track } }; };
    const mine = appStat(appOf(req));
    return json(res, 200, { ok: true, hasKey: !!env.ANTHROPIC_API_KEY, passcode: !!PASSCODE, counter: true, day: state.day,
      concurrent: true,                       // 同時に作曲してよい (席の仕組みは無い)
      apps: { piano: appStat("piano"), band: appStat("band") },
      songs: mine.songs, tracks: mine.tracks });
  }
  if (req.method !== "POST" || url.pathname !== "/v1/messages") return err(res, 404, "not_found_error", "not found");
  const origin = req.headers.origin ?? "";
  if (!ORIGINS.includes(origin)) return err(res, 403, "permission_error", "このサイトからは使えません (origin not allowed)");
  if (PASSCODE && req.headers["x-bluegarage-pass"] !== PASSCODE) return err(res, 401, "access_code_error", "アクセスコードが必要です (access code required)");
  if (!env.ANTHROPIC_API_KEY) return err(res, 500, "api_error", "サーバーに ANTHROPIC_API_KEY が設定されていません");
  // 本文を先に検査 (形の悪い依頼は数に入れない)。数えるのは Claude に流す直前
  let body;
  try { body = await readBody(req, 2_000_000); } catch { return err(res, 413, "invalid_request_error", "request too large"); }
  const checked = checkBody(body);
  if (checked.error) return err(res, 400, "invalid_request_error", checked.error);
  body = checked.body;
  const kind = String(req.headers["x-bluegarage-kind"] ?? "chat").toLowerCase();
  const bucket = bucketOf(kind);
  const app = appOf(req);
  {
    if (!bumpIp(clientIp(req))) return err(res, 429, "rate_limit_error", "リクエストが多すぎます。少し待ってください");
    if (!bumpBucket(app, bucket)) {
      const where = app === "piano" ? "ピアノ" : app === "band" ? "シンセ" : "この画面";
      const msg = bucket === "blueprint" ? `今日の${where}の曲数の上限 (${LIM.blueprint}曲/日) に達しました。日付が変わると (日本時間 0 時) また作れます`
        : bucket === "track" ? `今日の${where}の生成回数の上限 (${LIM.track}回/日) に達しました。日付が変わるとまた作れます`
        : `今日の${where}の利用上限に達しました。日付が変わるとまた使えます`;
      return err(res, 429, "daily_limit_error", msg);
    }
    const ac = new AbortController();
    res.on("close", () => { if (!res.writableFinished) ac.abort(); });
    let up;
    try {
      up = await fetch(ANTHROPIC, { method: "POST", headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body, signal: ac.signal });
    } catch (e) { if (ac.signal.aborted) return; console.error("[relay] connect:", e?.message); return err(res, 502, "api_error", `接続できません: ${e?.message}`); }
    const ct = up.headers.get("content-type") ?? "application/json";
    res.writeHead(up.status, { "content-type": ct, "cache-control": "no-cache", ...(ct.includes("event-stream") ? { "x-accel-buffering": "no" } : {}) });
    try { for await (const chunk of up.body) { if (ac.signal.aborted) break; res.write(chunk); } } catch (e) { if (!ac.signal.aborted) console.error("[relay] stream:", e?.message); }
    res.end();
    console.log(`[relay] ${state.day} ${app} ${bucket} ${kind} ${up.status} ${clientIp(req)} songs=${state.buckets[app]?.blueprint ?? 0}/${LIM.blueprint}`);
  }
});
server.listen(PORT, "127.0.0.1", () => console.log(`[relay] http://127.0.0.1:${PORT}  origins=${ORIGINS.join(",")}  limits=${JSON.stringify(LIM)} (アプリごと・同時作曲 OK)  key=${env.ANTHROPIC_API_KEY ? "あり" : "なし"}  passcode=${PASSCODE ? "あり" : "なし"}`));
