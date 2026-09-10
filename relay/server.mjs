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
const LIM = {
  blueprint: Math.max(0, Number(env.VESPER_SONG_LIMIT ?? 20)),
  track: Math.max(0, Number(env.VESPER_TRACK_LIMIT ?? 300)),
  other: Math.max(0, Number(env.VESPER_OTHER_LIMIT ?? 300)),
  ip: Math.max(1, Number(env.VESPER_IP_PER_MINUTE ?? 20)),
  ipDay: Math.max(1, Number(env.VESPER_IP_PER_DAY ?? 60)),
};
// Origin ヘッダは curl などでは偽れるので、それだけに頼らない: 使えるモデルを絞り、出力の長さに上限を付け、1 日の回数 (全体・IP ごと) で金額を抑える
const MODELS = String(env.VESPER_MODELS ?? "claude-fable-5-1,claude-sonnet-5,claude-opus-5").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_TOKENS_CAP = Math.max(1000, Number(env.MAX_TOKENS_CAP ?? 110000));

/* ── 作曲は一度に 1 人 (さとるん要望 2026-09-10) ──
   作曲 = 設計図 (blueprint) → 8 小節ごとの生成 (piano/polish/revise) が 10 回ほど続く。
   最初の作曲の依頼で「席」を取り、同じ人 (ブラウザごとの番号 x-bluegarage-session、無ければ IP) が続けて使う。
   通信の途中か、最後の通信から BUSY_IDLE 秒以内なら席は埋まったまま。念のため BUSY_MAX 分で必ず空ける。 */
const COMPOSE_KINDS = new Set(["blueprint", "piano", "polish", "revise", "track", "interpret"]);
const BUSY_IDLE = Math.max(10, Number(env.VESPER_BUSY_IDLE_SEC ?? 180)) * 1000;
const BUSY_MAX = Math.max(1, Number(env.VESPER_BUSY_MAX_MIN ?? 90)) * 60 * 1000;
let seat = null;   // { id, since, lastSeen, inflight }
function seatTaken(now = Date.now()) {
  if (!seat) return false;
  if (now - seat.since > BUSY_MAX) { seat = null; return false; }
  if (seat.inflight > 0) return true;
  if (now - seat.lastSeen < BUSY_IDLE) return true;
  seat = null; return false;
}
function seatInfo(now = Date.now()) {
  if (!seatTaken(now)) return { busy: false };
  return { busy: true, minutes: Math.round((now - seat.since) / 60000), idleLeftSec: seat.inflight > 0 ? null : Math.max(0, Math.round((BUSY_IDLE - (now - seat.lastSeen)) / 1000)) };
}
// 席を取る (自分の席ならそのまま)。取れなければ false
function takeSeat(id) {
  const now = Date.now();
  if (seatTaken(now) && seat.id !== id) return false;
  if (!seat || seat.id !== id) seat = { id, since: now, lastSeen: now, inflight: 0 };
  seat.lastSeen = now; seat.inflight++;
  return true;
}
function leaveCall(id) { if (seat && seat.id === id) { seat.inflight = Math.max(0, seat.inflight - 1); seat.lastSeen = Date.now(); } }
const STATE = env.VESPER_STATE ?? "/var/lib/vesper/counters.json";
const PASSCODE = env.VESPER_PASSCODE ?? "";
const TZ_OFF = Number(env.VESPER_TZ_OFFSET ?? 9);

const dayKey = () => new Date(Date.now() + TZ_OFF * 3600 * 1000).toISOString().slice(0, 10);
// 種類 → 上限の箱。blueprint = 曲 1 つ (設計図)、track = 音を作る呼び出し (STUDIO の track/revise、VESPER PIANO の piano/polish/interpret)
const bucketOf = (kind) => (kind === "blueprint" ? "blueprint" : ["track", "revise", "piano", "polish", "interpret"].includes(kind) ? "track" : "other");

/* ── 数え役 (ファイルに残す) ── */
let state = { day: dayKey(), buckets: { blueprint: 0, track: 0, other: 0 }, ip: {} };
try { const s = JSON.parse(fs.readFileSync(STATE, "utf8")); if (s && s.day) state = { ...state, ...s, buckets: { ...state.buckets, ...(s.buckets ?? {}) }, ip: s.ip ?? {} }; } catch {}
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(state)); } catch (e) { console.error("[relay] save:", e.message); } }, 200); }
function rollDay() { const d = dayKey(); if (state.day !== d) { state = { day: d, buckets: { blueprint: 0, track: 0, other: 0 }, ip: {}, ipDay: {} }; save(); } }
function bumpBucket(b) { rollDay(); if (state.buckets[b] >= LIM[b]) return false; state.buckets[b]++; save(); return true; }
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
  res.setHeader("Access-Control-Allow-Headers", "content-type, anthropic-version, x-bluegarage-kind, x-bluegarage-pass");
  res.setHeader("Access-Control-Max-Age", "86400");
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
    return json(res, 200, { ok: true, hasKey: !!env.ANTHROPIC_API_KEY, passcode: !!PASSCODE, counter: true, day: state.day, seat: seatInfo(),
      songs: { used: state.buckets.blueprint, limit: LIM.blueprint, left: Math.max(0, LIM.blueprint - state.buckets.blueprint) },
      tracks: { used: state.buckets.track, limit: LIM.track } });
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
  // 作曲の席 (一度に 1 人)。席が埋まっていたら数に入れずに断る
  const seatId = String(req.headers["x-bluegarage-session"] ?? "") || `ip:${clientIp(req)}`;
  const isCompose = COMPOSE_KINDS.has(kind);
  if (isCompose && !takeSeat(seatId)) {
    const info = seatInfo();
    const idle = BUSY_IDLE >= 60000 ? `${Math.round(BUSY_IDLE / 60000)} 分` : `${Math.round(BUSY_IDLE / 1000)} 秒`;
    return err(res, 409, "busy_error", `今、別の人が作曲中です (始めてから約 ${info.minutes} 分)。その人の作曲が終わって ${idle} たつと作れます。少し待ってからもう一度どうぞ`);
  }
  try {
    if (!bumpIp(clientIp(req))) return err(res, 429, "rate_limit_error", "リクエストが多すぎます。少し待ってください");
    if (!bumpBucket(bucket)) {
      const msg = bucket === "blueprint" ? `今日の曲数の上限 (${LIM.blueprint}曲/日) に達しました。日付が変わると (日本時間 0 時) また作れます`
        : bucket === "track" ? `今日の生成回数の上限 (${LIM.track}回/日) に達しました。日付が変わるとまた作れます`
        : "今日の利用上限に達しました。日付が変わるとまた使えます";
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
    console.log(`[relay] ${state.day} ${bucket} ${kind} ${up.status} ${clientIp(req)} songs=${state.buckets.blueprint}/${LIM.blueprint}${isCompose ? " seat=" + seatId.slice(0, 8) : ""}`);
  } finally { if (isCompose) leaveCall(seatId); }
});
server.listen(PORT, "127.0.0.1", () => console.log(`[relay] http://127.0.0.1:${PORT}  origins=${ORIGINS.join(",")}  limits=${JSON.stringify(LIM)}  key=${env.ANTHROPIC_API_KEY ? "あり" : "なし"}  passcode=${PASSCODE ? "あり" : "なし"}`));
