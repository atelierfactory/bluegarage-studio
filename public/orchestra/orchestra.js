// ═══════════ VESPER ORCHESTRA — ページ ═══════════
// 左: 総譜のレーン (lanes.js)。右: 48 体の VESPER の舞台 (stage.js、上 = 全体 / 下 = 寄り)。音は engine.js。
// ピアノのページ (../piano/piano.js) と同じ部品の名前・並びで作る (../style.css・../piano/style.css・../phone.css がそのまま効く)。
// piano.js / main.js は読み込まない (読み込むだけで自分の画面を作り始めるため)。曲は state.js の state.song に入れない。
//
// 撮影と確かめの道具のための入口:
//   window.orchReady (準備ができたら解決する Promise)・orchSamplesReady (音の decode まで)・orchLoad(file)・orchShot({view, close, beat})・
//   orchShotEnd()・window.orchShotStatus ({state: loading|posing|ready|error|idle})・URL ?song=&shot=<view>&close=<close>&beat=<n>・
//   window.vesperStage (舞台)・orchEngine・orchLanes・orchAudioStats (鳴らせなかった音の数など)
import { OrchestraStage, VIEWS, CLOSE_SHOTS } from "./stage.js";
import { ConcertoStage } from "./concerto-stage.js";
import { OrchestraEngine, bufferToWav, PREROLL } from "./engine.js";
import { ScoreLanes } from "./lanes.js";
import { t, applyText } from "./ui-text.js";
import { BREAKS } from "./ui-breaks.js";
import { beatToSec, tempoAt } from "../js/state.js";

const $ = (s) => document.querySelector(s);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+x) ? +x : lo));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const PLAY = "▶︎", PAUSE = "❚❚";   // ︎: iPhone で ▶ が青い絵文字にならないように

applyText();
// 長い文はことばのまとまりの間でだけ折る (まとまりは ui-breaks.js。つないだ物が今の文と違えば使わない)
for (const [key, parts] of Object.entries(BREAKS)) {
  if (parts.join("") !== t(key)) continue;
  for (const el of document.querySelectorAll(`[data-ui="${key}"]`)) {
    el.textContent = ""; el.classList.add("phrases");
    parts.forEach((p, i) => { if (i) el.append(document.createElement("wbr")); el.append(p); });
  }
}
// クレジットの中の住所 (example.com/… の形) を押せるリンクにする。音源の作者の頼み: ホームページへリンクする
for (const el of document.querySelectorAll("#dlg-thanks .thanks p.dim")) {
  const s = el.textContent, re = /\b[\w-]+(?:\.[\w-]+)+\/[\w./-]*[\w/]/g;
  if (!re.test(s)) continue;
  re.lastIndex = 0; el.textContent = ""; let i = 0;
  for (const m of s.matchAll(re)) {
    const a = document.createElement("a"); a.href = `https://${m[0]}`; a.target = "_blank"; a.rel = "noopener"; a.textContent = m[0];
    el.append(s.slice(i, m.index), a); i = m.index + m[0].length;
  }
  el.append(s.slice(i));
}

/* ─────────── toast / loader / status (ピアノと同じ) ─────────── */
function toast(msg, isErr = false) { const el = $("#toast"); el.textContent = msg; el.className = isErr ? "show err" : "show"; clearTimeout(el._t); el._t = setTimeout(() => (el.className = ""), 3200); }
function showLoader(text) { $("#loader-text").textContent = text; $("#loader").classList.remove("hidden"); }
function hideLoader() { $("#loader").classList.add("hidden"); }
function status(msg, cls = "") { $("#status-text").innerHTML = `<span class="${cls}">${esc(msg)}</span>`; }

/* ─────────── 部品 ─────────── */
let stage = new OrchestraStage($("#stage-canvas"));
const engine = new OrchestraEngine({ base: "./samples/" });
const lanes = new ScoreLanes($("#lanes"), { onSeek: (beat) => seekTo(beat), label: (k) => t(k) });
window.vesperStage = stage; window.orchEngine = engine; window.orchLanes = lanes;
Object.defineProperty(window, "orchAudioStats", { get: () => engine.stats, configurable: true });
{ const d = document.createElement("div"); d.className = "divider"; $("#stage").appendChild(d); }
window.orchShotStatus = { state: "loading" };

let song = null, songFile = null, endBeat = 0, endSec = 0, totalSec = 0, booting = true, frozenShot = false, shotRestore = null, shotRevision = 0, loadRevision = 0, samplesRevision = 0, transportRevision = 0;
let samplesPromise = null, samplesDone = false, wantPlay = false, loadFailed = false, holdZones = [];
// 舞台へ渡す拍 → 秒。頭からの再生の直前 (予備の振り) は負の拍を負の秒のまま渡す (舞台の表は 0 で止まるため)
const toSec = (b) => (b < 0 ? (b * 60) / (song?.tempo ?? 120) : stage.toSec ? stage.toSec(b) : beatToSec(b, song));

/* ─────────── 毎コマ ─────────── */
let lastFrame = performance.now(), lastClose = null, lastCloseMode = null, lastLcd = "", lastInfo = "";
function frame(now) {
  requestAnimationFrame(frame);
  if (booting || !song) return;
  const cw = stage.canvas.clientWidth, ch = stage.canvas.clientHeight;
  if (cw > 0 && ch > 0 && (Math.abs(cw - stage.w) > 1 || Math.abs(ch - stage.h) > 1)) stage._resize();
  const beat = engine.currentBeat(), playing = engine.playing;
  if (frozenShot) {
    if (stage.needsRender) stage.render();
  } else {
    const dt = Math.min(0.25, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
    stage.update(beat, toSec, dt, playing);
    stage.render();
  }
  // 撮影中に画面の並びが変わったときも、再表示された総譜と表示を更新する
  lanes.setHighlight(stage.closeMode === "manual" ? null : stage.closeShot);
  lanes.frame(beat, playing);
  updateLcd(beat);
  const shot = stage.closeMode === "manual" ? "manual" : stage.closeShot;
  if (shot !== lastClose || stage.closeMode !== lastCloseMode) {   // 変わったときだけ画面の文字を触る (毎コマ触ると重い)
    lastClose = shot; lastCloseMode = stage.closeMode;
    document.querySelectorAll(".cbtn[data-close]").forEach((b) => b.classList.toggle("on", b.dataset.close === stage.closeMode));
    $("#stage-label-hands").textContent = t(`shot.${shot}`);
  }
  const info = playing && beat >= 0 ? `bar ${barAt(beat).n} · ♩=${Math.round(writtenTempoAt(beat))}` : "";
  if (info !== lastInfo) { lastInfo = info; $("#stage-info").textContent = info; }
}
requestAnimationFrame(frame);

/* ─────────── 舞台の上のテンポ: 楽譜に書かれたテンポ ─────────── */
// フェルマータを伸ばす所と、切ったあとの間は、tempoMap ではとても遅いテンポ (♩=53・♩=12 など) で長さを作ってある。
// その間は、フェルマータの前のテンポのまま出す。間の終わり = フェルマータの後で、0.25 拍以上続く最初のテンポの区間の頭
function buildHoldZones(sg) {
  const pts = sg.tempoMap ?? [];
  return (sg.fermatas ?? []).map((f) => {
    let e = f.s + f.d;
    for (let i = 0; i < pts.length; i++) if (pts[i].beat >= f.s + f.d - 1e-6 && (pts[i + 1]?.beat ?? Infinity) - pts[i].beat >= 0.25) { e = pts[i].beat; break; }
    return { s: f.s, e, tempo: tempoAt(f.s - 1e-4, sg) };
  });
}
function writtenTempoAt(beat) { for (const z of holdZones) if (beat >= z.s && beat < z.e) return z.tempo; return tempoAt(beat, song); }

/* ─────────── 位置の表示 (印刷された小節番号.拍 と 時間) ─────────── */
function barAt(beat) { const B = song.bars; let lo = 0, hi = B.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (B[m].s <= beat + 1e-9) lo = m; else hi = m - 1; } return B[lo]; }
const mmss = (x, frac) => { x = Math.max(0, x); return `${Math.floor(x / 60)}:${frac ? (x % 60).toFixed(1).padStart(4, "0") : String(Math.floor(x % 60)).padStart(2, "0")}`; };
// 最後の小節を過ぎても (響きが消えるまで再生は続く) 拍と時間は曲の終わりで止める。全体の長さ = 最後の音と最後の小節の遅い方
function updateLcd(beat) {
  const b = clamp(beat, 0, Math.max(0, endBeat - 1e-6)), bar = barAt(b), q = Math.floor(b - bar.s + 1e-6) + 1;
  const pos = `${String(bar.n).padStart(3, "0")}.${q}`, time = `${mmss(Math.min(totalSec, beatToSec(b, song)), true)} / ${mmss(totalSec, false)}`;
  const key = pos + time; if (key === lastLcd) return; lastLcd = key;
  $("#pos-display").textContent = pos; $("#time-display").textContent = time;
}

/* ─────────── 再生 ─────────── */
const btnPlay = $("#btn-play");
function syncTransport() { btnPlay.textContent = engine.playing ? PAUSE : PLAY; btnPlay.classList.toggle("active", engine.playing); }
engine.onEnd = () => { syncTransport(); };
async function play(fromBeat = null) {
  if (!song) return;
  window.orchShotEnd();
  const revision = ++transportRevision; wantPlay = true;
  try {
    // 指で押した瞬間に AudioContext を作る (iPhone は押した中でないと音が出ない)
    const state = await engine.ensureContext();
    if (revision !== transportRevision) return;
    if (state !== "running") throw new Error(t("audio.blocked"));
    // 前の読み込みで取れなかった物 (バンクの目次・録音) があれば、▶ でもう一度取りに行く (取れている物は取り直さない)。位置はそのまま
    if (loadFailed) fromBeat = retryLoad(fromBeat ?? engine.playhead);
    if (!samplesDone) { showLoader(lastLoadText || "…"); await samplesPromise; }
    if (revision !== transportRevision) return;
    hideLoader(); wantPlay = false;
    await engine.play(fromBeat ?? engine.playhead);
    if (revision !== transportRevision) return;
    stage.poseAt(Math.max(0, engine.playhead), toSec);
  } catch (err) { if (revision !== transportRevision) return; hideLoader(); wantPlay = false; console.error(err); toast(err.code === "blocked" ? t("audio.blocked") : err.loadFailed ? t("load.failed", { count: err.failures ?? "?" }) : err.message, true); }
  syncTransport();
}
function pause() { transportRevision++; if (wantPlay) hideLoader(); wantPlay = false; engine.pause(); syncTransport(); }
async function togglePlay() { if (engine.playing || wantPlay) pause(); else await play(); }
function seekTo(beat) {
  transportRevision++; if (wantPlay) hideLoader(); wantPlay = false;
  window.orchShotEnd();
  const b = clamp(beat, 0, endBeat);
  if (engine.playing) engine.seek(b).then(syncTransport).catch((e) => toast(e.message, true));
  else { engine.seek(b); stage.poseAt(b, toSec); lanes.frame(b, false); updateLcd(b); }
}
btnPlay.addEventListener("click", togglePlay);
$("#btn-stop").addEventListener("click", () => { window.orchShotEnd(); pause(); engine.stop(); syncTransport(); stage.poseAt(0, toSec); });
$("#btn-rew").addEventListener("click", () => seekTo(0));
$("#inp-master").addEventListener("input", (e) => engine.setVolume(parseFloat(e.target.value)));
window.addEventListener("keydown", (e) => {
  if (e.target.matches?.("input, textarea, select")) return;
  if (document.querySelector("dialog[open]")) return;   // 窓 (曲を選ぶ・クレジット) が開いている間は、窓のボタンと Esc に任せる
  if (e.code === "Space") { e.preventDefault(); togglePlay(); return; }
  if (e.key === "Home") seekTo(0);
  if (e.key === "Escape") { window.orchShotEnd(); if (document.body.classList.contains("stage-full")) setFullscreen(false); }
});

/* ─────────── 舞台のボタン ─────────── */
function markView() { document.querySelectorAll(".vbtn[data-view]").forEach((x) => x.classList.toggle("on", x.dataset.view === stage.view)); }
document.querySelectorAll(".vbtn[data-view]").forEach((b) => b.addEventListener("click", () => { window.orchShotEnd(); stage.setView(b.dataset.view); markView(); }));
document.querySelectorAll(".cbtn[data-close]").forEach((b) => b.addEventListener("click", () => { window.orchShotEnd(); stage.setClose(b.dataset.close); }));
function setFullscreen(on) { document.body.classList.toggle("stage-full", on); stage.setLayout(on ? "side" : "stack"); $("#btn-fullscreen").classList.toggle("on", on); }
$("#btn-fullscreen").addEventListener("click", () => { if (frozenShot) { window.orchShotEnd(); return; } setFullscreen(!document.body.classList.contains("stage-full")); });

/* ─────────── 書き出し (WAV) ─────────── */
$("#btn-export-wav").addEventListener("click", async () => {
  if (!song) return;
  try {
    pause();
    showLoader(t("wav.prepare"));
    if (loadFailed) retryLoad(engine.playhead);
    await samplesPromise;
    const { buffer, report, stats } = await engine.renderWav({ onProgress: (phase, pct) => { $("#loader-text").textContent = phase === "render" ? `${t("wav.render")} ${pct}%` : t("wav.normalize"); } });
    if (stats.missing) console.warn("[orchestra] missing voices", stats.missingList);
    const blob = bufferToWav(buffer);
    const name = `${song.composer} - ${song.title}`.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ");
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name}.wav`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    status(t("wav.done", { file: `${name}.wav`, mb: (blob.size / 1024 / 1024).toFixed(1), lufs: report.lufs.toFixed(1) }), "lit");
  } catch (e) { console.error(e); toast(e.message, true); } finally { hideLoader(); }
});

/* ─────────── 曲を選ぶ・この楽器について ─────────── */
let repertoire = null;
// 公開サイトは途中に CDN が挟まり古い一覧を返すことがあるので、毎回違う番号を付けて取る (小さいファイル)
async function listRepertoire() { if (repertoire) return repertoire; try { const r = await fetch(`repertoire/index.json?v=${Date.now()}`, { cache: "no-cache" }); repertoire = r.ok ? await r.json() : []; } catch { repertoire = []; } return repertoire; }
function renderSongs(list) {
  const el = $("#lib-list"); el.innerHTML = "";
  const h = document.createElement("div"); h.className = "lib-head"; h.textContent = t("songs.head"); el.appendChild(h);
  for (const it of list) {
    const row = document.createElement("div"); row.className = "lib-row" + (it.file === songFile ? " current" : "");
    row.innerHTML = `<div><div class="lib-title">${esc(it.title)}</div><div class="lib-meta">${esc(`${it.composer} · ${it.year} · ${it.license}`)}</div></div><button class="gbtn small lib-open">${esc(t("songs.open"))}</button>`;
    row.querySelector(".lib-open").addEventListener("click", async () => { try { $("#dlg-songs").close(); await openSong(it.file); } catch (err) { toast(err.message, true); } });
    el.appendChild(row);
  }
}
$("#btn-songs").addEventListener("click", async () => { renderSongs(await listRepertoire()); $("#dlg-songs").showModal(); });
$("#btn-songs-close").addEventListener("click", () => $("#dlg-songs").close());
$("#btn-thanks").addEventListener("click", () => $("#dlg-thanks").showModal());
$("#btn-thanks-close").addEventListener("click", () => $("#dlg-thanks").close());

/* ─────────── 曲を開く ─────────── */
let lastLoadText = "";
async function openSong(file, revision = ++loadRevision) {
  window.orchShotEnd();
  pause();
  const r = await fetch(`repertoire/${file}?v=${Date.now()}`, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${file}: ${r.status}`);
  const data = await r.json();
  if (data.song.solo?.planFile) {
    try { const plan = await fetch(`repertoire/${data.song.solo.planFile}`, { cache: "no-cache" }); if (plan.ok) data.song.solo.motionPlan = await plan.json(); } catch {}
  }
  if (revision !== loadRevision) return null;
  song = data.song; songFile = file;
  // 人数は曲の座席から。交響曲の表示も曲を戻すと元へ戻る。
  const robotCount=song.robotCount??song.players.reduce((n,p)=>n+p.seats,1),logoSub=document.querySelector('.logo-sub');
  if(logoSub)logoSub.textContent=`${robotCount} ROBOTS · ORCHESTRA`;
  endSec = Math.max(...song.players.flatMap((p) => p.notes.map((n) => beatToSec(n.s + n.d, song))), 0);
  endBeat = Math.max(...song.bars.map((b) => b.s + b.len));
  totalSec = Math.max(endSec, beatToSec(endBeat, song)) + (song.ending?.hallTail ?? 0);
  holdZones = buildHoldZones(song);
  if (!!stage.isConcerto !== (song.layout === "concerto")) {
    const old = stage, canvas = old.canvas.cloneNode(false);
    old._resizeObserver?.disconnect(); old.canvas.replaceWith(canvas); old.renderer?.dispose();
    stage = song.layout === "concerto" ? new ConcertoStage(canvas) : new OrchestraStage(canvas);
    window.vesperStage = stage; stage.setLayout(document.body.classList.contains("stage-full") ? "side" : "stack");
  }
  document.body.classList.toggle("concerto", !!song.solo);
  for (const b of document.querySelectorAll("[data-concerto-close]")) b.remove();
  if (song.solo) for (const key of ["piano-hands", "piano-top", "piano-profile", "piano-strings", "conductor-piano", "trombones"]) {
    const b = document.createElement("button"); b.className = "cbtn vbtn"; b.dataset.close = key; b.dataset.concertoClose = key; b.textContent = t(`close.${key}`);
    b.addEventListener("click", () => { window.orchShotEnd(); stage.setClose(key); }); $("#stage-close").appendChild(b);
  }
  const credits = $("#dlg-thanks .dlg-body") ?? $("#dlg-thanks");
  document.querySelector("#concerto-credit")?.remove();
  if (song.solo && credits) { const p = document.createElement("p"); p.id = "concerto-credit"; p.textContent = `${song.source.edition} · ${song.source.url} · ${song.source.license} · PDMX / Zenodo 15571083 (dataset CC BY 4.0) · Salamander Grand: Alexander Holm / kinwie, author public-domain declaration (2022).`; credits.appendChild(p); }
  stage.setSong(song);
  lanes.setSong(song);
  // 舞台の上は短く (調と作品番号を除く: "Symphony No. 5 — I. Allegro con brio")。全部の題名はレーンの見出しと title に
  const short = song.title.replace(/\s+in [A-G](?:[♭♯#b]|-flat|-sharp)? (?:major|minor)/i, "").replace(/,\s*Op\.\s*\d+[a-z]?/i, "");
  $("#proll-title").textContent = song.title; $("#stage-title").textContent = short; $("#stage-title").title = song.title;
  $("#play-hint").textContent = `${song.composer} · ${song.year}`;
  stage.poseAt(0, toSec);
  lanes.frame(0, false); updateLcd(0);
  // 音は裏で読み始める (▶ を押したときに待たないように)。進み具合は下の 1 行に
  startLoad(revision);
  return song;
}
// 取れなかった物をもう一度取りに行く。engine.load() は位置を頭に戻すので、at に戻して返す
function retryLoad(at) { const b = Math.max(0, at ?? 0); startLoad(); engine.playhead = b; return b; }
// 音の読み込み。取れなかった物があれば loadFailed を立て、その数を下の 1 行にも残す (読み込み中の行のまま止まらないように)。
// もう一度呼ぶと、engine.load は持っていないバンクと decode できていない録音だけを取りに行く
function startLoad(revision = loadRevision) {
  const current = ++samplesRevision;
  samplesDone = false; loadFailed = false;
  samplesPromise = engine.load(song, { onProgress: (p) => {
    if (current !== samplesRevision || revision !== loadRevision) return;
    lastLoadText = p.phase === "bank" ? t("load.bank", { name: p.name }) : t("load.samples", { name: p.name, done: p.done, total: p.total });
    if (!frozenShot) status(lastLoadText);
    if (wantPlay) $("#loader-text").textContent = lastLoadText;
  } }).then((res) => {
    if (current !== samplesRevision || revision !== loadRevision || res.cancelled) return { cancelled: true };
    samplesDone = true; loadFailed = res.failures > 0;
    if (res.failures) { const msg = t("load.failed", { count: res.failures }); toast(msg, true); if (revision === loadRevision && !frozenShot) status(msg); }
    else if (revision === loadRevision) status(t("status.opened", { title: song.title }), "lit");
    return res;
  }).catch((e) => {
    if (current !== samplesRevision || revision !== loadRevision) return { cancelled: true };
    samplesDone = false; loadFailed = true; console.error(e);
    const msg = t("load.failed", { count: e.failures ?? "?" });
    toast(msg, true); if (revision === loadRevision && !frozenShot) status(msg);
    throw Object.assign(e, { loadFailed: true });
  });
  samplesPromise.catch(() => {});   // 待っている人がいなくても「受け取られない失敗」にしない (失敗は上で知らせた)
  window.orchSamplesReady = samplesPromise;
  return samplesPromise;
}
window.orchLoad = async (file) => { const s = await openSong(file); return s ? { title: s.title, notes: s.players.reduce((a, p) => a + p.notes.length, 0) } : { cancelled: true }; };

/* ─────────── 撮影 (音は止め、決まった拍の姿勢で 1 枚) ─────────── */
window.orchShotEnd = () => {
  shotRevision++;
  if (frozenShot) {
    frozenShot = false; document.body.classList.remove("orchestra-shot", "piano-shot");
    stage.setShot(null, null);
    if (shotRestore) {
      const s = shotRestore; shotRestore = null; setFullscreen(s.fullscreen); stage.setView(s.view);
      Object.assign(stage.orbit, s.orbit); stage.orbit.target.copy(s.target);
      stage.closeMode = s.close; stage._closePos.copy(s.closePos); stage._closeLook.copy(s.closeLook);
      stage.camClose.fov = s.closeFov; stage.camClose.updateProjectionMatrix(); stage.t = s.time; markView();
    }
  }
  window.orchShotStatus = { state: "idle" };
  lastFrame = performance.now();
};
window.orchShot = (options = {}) => (window.orchShotReady = captureShot(options));
async function captureShot({ view = "wide", close = null, beat = 0 } = {}) {
  if (view && !VIEWS[view] && !CLOSE_SHOTS.includes(view)) throw new Error(`view: ${view}`);
  if (close && !CLOSE_SHOTS.includes(close) && !(song?.solo && ["piano-hands","piano-top","piano-profile","piano-strings","conductor-piano","trombones"].includes(close))) throw new Error(`close: ${close}`);
  if (!Number.isFinite(+beat)) throw new Error("beat");
  const revision = ++shotRevision, started = performance.now();
  // 手で動かしたカメラも、撮影の前の位置と向きへ戻す
  if (!frozenShot) shotRestore = {
    fullscreen: document.body.classList.contains("stage-full"), view: stage.view, close: stage.closeMode,
    orbit: { ...stage.orbit, base: stage.orbit.base ? { ...stage.orbit.base } : null }, target: stage.orbit.target.clone(),
    closePos: stage._closePos.clone(), closeLook: stage._closeLook.clone(), closeFov: stage.camClose.fov, time: stage.t,
  };
  pause();
  const b = clamp(+beat, 0, endBeat);
  engine.seek(b);
  frozenShot = true; setFullscreen(true); document.body.classList.add("orchestra-shot", "piano-shot");
  window.orchShotStatus = { state: "posing", view, close, beat: b };
  try {
    await document.fonts.ready;
    if (revision !== shotRevision) return { cancelled: true };
    stage._resize(); stage.setShot(view, close); const r = stage.poseAt(b, toSec); stage.render();
    lanes.frame(b, false); updateLcd(b);
    window.orchShotStatus = { state: "ready", view, close: r.close, beat: b, ms: Math.round(performance.now() - started), stats: stage.stats() };
    return window.orchShotStatus;
  } catch (error) { if (revision === shotRevision) window.orchShotStatus = { state: "error", view, beat: b, error: error.message }; throw error; }
}
window.addEventListener("pagehide", () => { pause(); engine.release(); syncTransport(); });

/* ─────────── 起動 ─────────── */
async function boot() {
  const q = new URLSearchParams(location.search);
  const list = await listRepertoire();
  const file = q.get("song") ?? list[0]?.file ?? "beethoven-5-1.orch.json";
  await openSong(file);
  status(t("status.opened", { title: song.title }), "lit");
  booting = false;
  if (q.has("shot") || q.has("close")) await window.orchShot({ view: q.get("shot") || null, close: q.get("close") || null, beat: q.has("beat") ? Number(q.get("beat")) : 0 });
  else window.orchShotStatus = { state: "idle" };
  return { title: song.title, file, notes: song.players.reduce((a, p) => a + p.notes.length, 0), bars: song.bars.length, endSec, preroll: PREROLL };
}
window.orchReady = boot().catch((error) => {
  booting = false; window.orchShotStatus = { state: "error", error: error.message };
  status(t("status.openFailed", { message: error.message })); console.error(error);
  return { error: error.message };
});
