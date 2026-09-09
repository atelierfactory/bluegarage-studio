// ═══════════ VESPER PIANO — main (v3) ═══════════
// 左: ピアノ 1 本のピアノロール + お題バー (即興 / 作曲)。右: VESPER-01 が弾く 3D 舞台 (常時)。
// 即興: すぐ弾き始め、弾きながらお題に合う「手札」を Claude が作って差し替える。
// 作曲: 設計図 → 両手・運指・ペダル付きの独奏 → 弾けるかの検査 → 手直し (超作り込みは磨き上げも)。
// 曲は「曲を選ぶ」の一覧に (同梱の名曲 / 作った曲 / MIDI)。

import {
  state, on, emit, selectedTrack, totalBars, pushUndo, undo, redo, loadLocal, saveLocal, resetSong, onSave,
  makeTrack, uid, beatToSec, tempoAt, defaultSong, totalBeats } from "../js/state.js";
import * as audio from "../js/audio.js";
import { PianoRoll, THEME } from "../js/pianoroll.js";
import { downloadMidi } from "../js/midi.js";
import { generateStructured, settings, resolveTransport, MODELS } from "../js/claude.js";
import { buildBlueprintRequest, buildPianoRequest, buildInterpretRequest } from "../js/prompts.js";
import { analyzePiano, describeAnalysis } from "../js/critic.js";
import { t, setLang, detectLang, applyDom } from "../js/i18n.js";
import { initSettings } from "../js/settings.js";
import * as lib from "../js/library.js";
lib.configureLibrary("vesper"); // ピアノ専用の保管庫 (STUDIO とは別)
import { PianoStage } from "./scene.js";
import { parseMidi } from "../js/midiread.js";
import { autoFinger } from "../js/fingering.js";
import { DEFAULT_BANK, Improviser, buildJamBankRequest } from "./jam.js";

const $ = (s) => document.querySelector(s);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+x) ? +x : lo));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 色: 黒・白・銀。点灯 (鳴っている音・再生位置) だけ金
Object.assign(THEME, {
  rowBlack: "#070707", rowWhite: "#0b0b0b", rowLineC: "#2a2a2a", rowLine: "#151515", gridBar: "#3a3a3a", gridBeat: "#1c1c1c", gridSub: "#121212",
  rulerBg: "#0a0a0a", rulerText: "#9a9a9a", chord: "#cfcfcf", rulerLine: "#3a3a3a",
  keyBlack: "#111", keyWhite: "#ececec", keyLabelOnBlack: "#fff", keyLabelOnWhite: "#000",
  playhead: "#e0b95a", hint: "#8a8a8a", hint2: "#4a4a4a",
  handL: "#8c8c8c", handR: "#f2f2f2", fingerText: "rgba(0,0,0,.85)",
  pedal: "rgba(120,120,120,.30)", pedalEdge: "rgba(200,200,200,.8)", pedalText: "rgba(0,0,0,0)",
  boxFill: "rgba(255,255,255,.08)", boxStroke: "rgba(255,255,255,.6)", selected: "#e0b95a", lit: "#e0b95a",
});

/* ─────────── toast / loader / status ─────────── */
function toast(msg, isErr = false) { const el = $("#toast"); el.textContent = msg; el.className = isErr ? "show err" : "show"; clearTimeout(el._t); el._t = setTimeout(() => (el.className = ""), 3200); }
function showLoader(text) { $("#loader-text").textContent = text; $("#loader").classList.remove("hidden"); }
function hideLoader() { $("#loader").classList.add("hidden"); }
const statusLines = [];
function status(msg, cls = "") { statusLines.push({ msg, cls }); while (statusLines.length > 1) statusLines.shift(); $("#status-text").innerHTML = statusLines.map((l) => `<span class="${l.cls}">${esc(l.msg)}</span>`).join("\n"); }
function progress(msg) { $("#status-text").innerHTML = `<span class="lit">${esc(msg)}</span>`; }

setLang(detectLang(settings.get().lang)); applyDom();

/* ─────────── song model: ピアノ 1 本 ─────────── */
function pianoSong() {
  const s = defaultSong();
  s.title = "無題"; s.tempo = 90; s.key = "C major";
  s.sections = [{ name: "A", bars: 8, description: "" }];
  s.tracks = [makeTrack({ name: "Piano", instrument: "piano", role: "piano", pan: 0, volume: -4 })];
  s.tracks[0].fx = { ...s.tracks[0].fx, hall: 0.35, room: 0.15 };
  s.master.hallDecay = 2.8;
  return s;
}
function pianoTrack() {
  let tr = state.song.tracks.find((x) => x.instrument === "piano");
  if (!tr) { tr = makeTrack({ name: "Piano", instrument: "piano", role: "piano" }); state.song.tracks.unshift(tr); }
  state.selectedTrackId = tr.id;
  return tr;
}
function setTitleUi() { $("#proll-title").textContent = state.song.title || "—"; $("#stage-title").textContent = state.song.title || ""; }

/* ─────────── views ─────────── */
// できあがった曲 (同梱の名曲・作曲・即興・読み込んだ曲) に手で音を足したり動かしたりはしない: 見る・聴く・再生位置を選ぶだけ
const proll = new PianoRoll($("#proll"), { getSnap: () => parseFloat($("#inp-snap").value) || 0, editable: false });
on("notes", () => { const tr = selectedTrack(); if (!tr) return; let changed = false; for (const n of tr.notes) if (!n.h) { n.h = $("#inp-hand").value; n.f = n.f ?? 2; changed = true; } if (changed) proll.draw(); stage.setSong(tr.notes, state.song.pedal); });
on("song", () => { syncTransportFields(); setTitleUi(); const tr = selectedTrack(); if (tr) stage.setSong(tr.notes, state.song.pedal); });

/* ─────────── stage (VESPER) — 常時表示 ─────────── */
const stage = new PianoStage($("#stage-canvas"));
window.vesperStage = stage; window.vesperRoll = proll;
{ const d = document.createElement("div"); d.className = "divider"; $("#stage").appendChild(d); }
let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const cw = stage.canvas.clientWidth, ch = stage.canvas.clientHeight;
  if (cw > 0 && ch > 0 && (Math.abs(cw - stage.w) > 1 || Math.abs(ch - stage.h) > 1)) stage._resize();
  const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
  const beat = audio.currentBeat();
  stage.update(beat, (b) => beatToSec(b), dt, state.playing);
  stage.render();
  const ts = state.song.timeSig;
  $("#stage-info").textContent = state.playing ? `bar ${Math.floor(beat / ts) + 1} · ♩=${Math.round(tempoAt(beat))}` : "";
}
requestAnimationFrame(frame);
document.querySelectorAll(".vbtn[data-view]").forEach((b) => b.addEventListener("click", () => { stage.setView(b.dataset.view); document.querySelectorAll(".vbtn[data-view]").forEach((x) => x.classList.toggle("on", x === b)); }));
function setFullscreen(on) { document.body.classList.toggle("stage-full", on); stage.setLayout(on ? "side" : "stack"); $("#btn-fullscreen").classList.toggle("on", on); }
$("#btn-fullscreen").addEventListener("click", () => setFullscreen(!document.body.classList.contains("stage-full")));
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("stage-full")) setFullscreen(false); });

/* ─────────── transport ─────────── */
function syncTransportFields() { $("#inp-tempo").value = state.song.tempo; $("#inp-timesig").value = String(state.song.timeSig === 3 ? 3 : state.song.timeSig === 6 ? 6 : 4); $("#inp-key").value = state.song.key; $("#inp-master").value = state.song.master.volume; }
$("#inp-tempo").addEventListener("change", (e) => { state.song.tempo = clamp(e.target.value, 30, 300); pushUndo(); if (state.playing) { audio.stop(); audio.play(); } });
$("#inp-timesig").addEventListener("change", (e) => { state.song.timeSig = parseInt(e.target.value, 10) || 4; pushUndo(); emit("song"); });
$("#inp-key").addEventListener("change", (e) => { state.song.key = e.target.value; pushUndo(); });
$("#inp-master").addEventListener("input", (e) => audio.setMasterVolume(parseFloat(e.target.value)));
const btnPlay = $("#btn-play");
async function play(fromBeat = null) {
  pianoTrack();
  try { await audio.play(fromBeat, (m) => (m ? showLoader(m) : hideLoader())); }
  catch (err) { hideLoader(); console.error(err); toast(err.message, true); }
}
async function togglePlay() { if (state.playing) audio.stop(); else await play(); }
btnPlay.addEventListener("click", togglePlay);
$("#btn-stop").addEventListener("click", () => audio.stop(true));
$("#btn-rew").addEventListener("click", () => { proll.resetFollow(); audio.seek(0); });
$("#btn-loop").addEventListener("click", (e) => { state.loop = !state.loop; e.currentTarget.classList.toggle("active", state.loop); if (state.playing) { audio.stop(); audio.play(); } });
$("#btn-met").addEventListener("click", () => { state.metronome = !state.metronome; $("#btn-met").classList.toggle("active", state.metronome); if (state.playing) { audio.stop(); audio.play(); } });
on("transport", () => { if (state.playing) proll.resetFollow(); btnPlay.textContent = state.playing ? "❚❚" : "▶"; btnPlay.classList.toggle("active", state.playing); if (!state.playing && jam) jamStop(); });
function songEndBeat() { let end = totalBeats(); for (const tr of state.song.tracks) for (const n of tr.notes) end = Math.max(end, n.s + n.d); return end; }
function updateLcd() {
  const ts = state.song.timeSig; const bar = Math.floor(state.playheadBeat / ts) + 1; const beat = Math.floor(state.playheadBeat % ts) + 1;
  $("#pos-display").textContent = `${String(bar).padStart(3, "0")}.${beat}`;
  const sec = beatToSec(state.playheadBeat), total = beatToSec(songEndBeat());
  const mmss = (x, frac) => `${Math.floor(x / 60)}:${frac ? (x % 60).toFixed(1).padStart(4, "0") : String(Math.floor(x % 60)).padStart(2, "0")}`;
  $("#time-display").textContent = `${mmss(sec, true)} / ${mmss(total, false)}`;
  if (state.playing) proll.followPlayhead();
}
on("playhead", updateLcd);
on("song", updateLcd); on("notes", updateLcd);
window.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); return; }
  if (e.key === "Home") { proll.resetFollow(); audio.seek(0); }
  if (e.key === "m" && !e.metaKey && !e.ctrlKey) $("#btn-met").click();
  if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.metaKey || e.ctrlKey) && (e.key === "Z" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); redo(); }
  const tr = selectedTrack(); if (!tr || !proll.selection.size) return;
  const sel = tr.notes.filter((n) => proll.selection.has(n.id));
  if (/^[1-5]$/.test(e.key)) { for (const n of sel) n.f = +e.key; pushUndo(); emit("notes"); }
  if (e.key === "l" || e.key === "L") { for (const n of sel) n.h = "L"; pushUndo(); emit("notes"); }
  if (e.key === "r" || e.key === "R") { for (const n of sel) n.h = "R"; pushUndo(); emit("notes"); }
  if (e.key === "p" || e.key === "P") {
    const s0 = Math.min(...sel.map((n) => n.s)), e1 = Math.max(...sel.map((n) => n.s + n.d));
    const exists = state.song.pedal.findIndex((p) => Math.abs(p.s - s0) < 1e-3 && Math.abs(p.s + p.d - e1) < 1e-3);
    if (exists >= 0) state.song.pedal.splice(exists, 1); else state.song.pedal.push({ s: +s0.toFixed(4), d: +(e1 - s0).toFixed(4) });
    state.song.pedal.sort((a, b) => a.s - b.s); pushUndo(); emit("notes");
  }
});

/* ─────────── check / export ─────────── */
function checkNow() { const tr = pianoTrack(); return analyzePiano({ notes: tr.notes.map((n) => ({ ...n })), pedal: state.song.pedal }, { song: state.song, range: { startBar: 0, bars: totalBars() } }); }
$("#btn-export").addEventListener("click", () => { try { if (!pianoTrack().notes.length) throw new Error("音符がありません"); downloadMidi(state.song); toast("MIDI を書き出しました"); } catch (e) { toast(e.message, true); } });
$("#btn-export-wav").addEventListener("click", async () => {
  try {
    if (!pianoTrack().notes.length) throw new Error("音符がありません");
    if (state.playing) audio.stop();
    await audio.ensureAudio(); showLoader("WAV…");
    const { buffer, report } = await audio.renderSong((m) => { $("#loader-text").textContent = m; });
    const blob = audio.bufferToWav(buffer);
    const name = (state.song.title || "vesper-piano").replace(/[\\/:*?"<>|]/g, "_");
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name}.wav`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    status(`WAV: ${name}.wav (${(blob.size / 1024 / 1024).toFixed(1)}MB) / ${report.lufs.toFixed(1)} LUFS`, "lit");
  } catch (e) { toast(e.message, true); } finally { hideLoader(); }
});
$("#btn-export-json").addEventListener("click", () => { const blob = new Blob([JSON.stringify({ song: state.song }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${state.song.title || "piano"}.vesper.json`; a.click(); $("#dlg-songs").close(); });
$("#inp-import-json").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; try { const data = JSON.parse(await f.text()); if (!data?.song?.tracks) throw new Error("形式が違います"); data.song.kind = data.song.kind === "composed" ? "composed" : "imported"; state.songId = lib.newId(); resetSong(data.song); pianoTrack(); emit("selection"); toast("OK"); } catch (err) { toast(err.message, true); } $("#dlg-songs").close(); e.target.value = ""; });

/* ─────────── MIDI 読み込み・同梱の名曲 ─────────── */
function loadMidiIntoSong(buffer, title, meta = {}) {
  const m = parseMidi(buffer);
  if (!m.notes.length) throw new Error("音符が見つかりません");
  const notes = autoFinger(m.notes.filter((n) => n.p >= 21 && n.p <= 108).map((n) => ({ p: n.p, s: +n.s.toFixed(4), d: +Math.max(0.05, n.d).toFixed(4), v: Math.max(1, Math.min(127, n.v)), track: n.track })), { tracks: m.tracks });
  const song = pianoSong();
  song.title = title; song.tempo = Math.round(m.tempo);
  const ts = m.timeSig.den === 8 ? (m.timeSig.num === 6 ? 6 : 3) : m.timeSig.num; song.timeSig = [3, 4, 6].includes(ts) ? ts : 4;
  const bars = Math.ceil(Math.max(...notes.map((n) => n.s + n.d)) / song.timeSig);
  song.sections = [{ name: title, bars, description: "" }];
  song.tempoMap = m.tempos.length > 1 ? m.tempos.map((x) => ({ beat: x.beat, tempo: Math.round(x.tempo * 10) / 10 })) : [];
  song.pedal = (m.pedal ?? []).map((p) => ({ s: +p.s.toFixed(4), d: +p.d.toFixed(4) }));
  song.concept = meta.credit ?? "";
  song.piece = meta.piece ?? null;
  song.kind = meta.kind ?? "imported";
  song.tracks[0].notes = notes.map((n) => ({ id: uid(), p: n.p, s: n.s, d: n.d, v: n.v, h: n.h, f: n.f }));
  state.songId = lib.newId();
  resetSong(song); pianoTrack(); emit("selection");
  const a = checkNow();
  return `「${title}」(${notes.length}音、${bars}小節、${song.tempo} BPM、ペダル ${song.pedal.length} 区間) 手と指は自動。検査: ${describeAnalysis(a)}`;
}
$("#inp-import-midi").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; try { status(loadMidiIntoSong(await f.arrayBuffer(), f.name.replace(/\.midi?$/i, "")), "lit"); play(0); } catch (err) { toast(err.message, true); } $("#dlg-songs").close(); e.target.value = ""; });
let repertoireCache = null;
async function listRepertoire() { if (repertoireCache) return repertoireCache; try { const r = await fetch("repertoire/index.json", { cache: "no-cache" }); repertoireCache = r.ok ? await r.json() : []; } catch { repertoireCache = []; } return repertoireCache; }
async function playRepertoire(item) {
  if (item.perf) {
    // Fable / Opus が演奏解釈済み (強弱・間・指・ペダル入り) の完成データ
    const r = await fetch(`repertoire/${item.perf}`, { cache: "no-cache" }); if (!r.ok) throw new Error("演奏データが読めません");
    const data = await r.json();
    if (state.playing) audio.stop();
    data.song.kind = "repertoire";
    state.songId = lib.newId(); resetSong(data.song); pianoTrack(); emit("selection");
    return `「${data.song.title}」(${pianoTrack().notes.length}音、${totalBars()}小節) ${item.perfBy ?? ""} の演奏解釈`;
  }
  const r = await fetch(`repertoire/${item.file}`); if (!r.ok) throw new Error("楽譜が読めません");
  return loadMidiIntoSong(await r.arrayBuffer(), `${item.title} — ${item.composer}`, { credit: `${item.license} · ${item.source}`, piece: { title: item.title, composer: item.composer, year: item.year, note: item.note ?? "" }, kind: "repertoire" });
}

/* ─────────── 演奏解釈: 楽譜はそのまま、弾き方 (強弱・間・切り方・手・指・ペダル) を Claude が決める ─────────── */
async function interpretSong({ model, bars = 8, extraDirection, onProgress } = {}) {
  const song = state.song; const tr = pianoTrack(); const ts = song.timeSig;
  const piece = song.piece ?? { title: song.title, composer: "", year: "" };
  const total = totalBars();
  const all = tr.notes.slice().sort((a, b) => a.s - b.s || a.p - b.p);
  const usage = { input: 0, output: 0 };
  let prevMemo = "", prevDyn = null; const memos = [];
  const newPedal = [];
  for (let sb = 0; sb < total; sb += bars) {
    if (cancelFlag) throw new Error("止めました");
    const nb = Math.min(bars, total - sb);
    const b0 = sb * ts, b1 = (sb + nb) * ts;
    const idx = []; all.forEach((n, i) => { if (n.s >= b0 - 1e-6 && n.s < b1 - 1e-6) idx.push(i); });
    if (!idx.length) continue;
    const scoreNotes = idx.map((i, k) => { const n = all[i]; return { i: k, p: n.p, s: +(n.s - b0).toFixed(3), d: +n.d.toFixed(3), v0: n.v, h0: n.h ?? null }; });
    const req = buildInterpretRequest({ piece, song: { tempo: song.tempo, timeSig: ts }, range: { startBar: sb, bars: nb }, scoreNotes, previousPerformanceNotes: prevMemo, previousDynamics: prevDyn, extraDirection });
    const label = `[bar ${sb + 1}〜${sb + nb} / ${total}]`;
    const { data, usage: u } = await generateStructured({ ...req, model, maxTokens: 32000, onProgress: (p) => onProgress?.(`${label} 弾き方を考え中… ${((p.chars ?? 0) / 1000).toFixed(1)}k`) });
    usage.input += u.input; usage.output += u.output;
    const byI = new Map((data.notes ?? []).map((x) => [x.i, x]));
    let applied = 0;
    idx.forEach((i, k) => {
      const x = byI.get(k); const n = all[i]; if (!x) return; applied++;
      n.v = clamp(Math.round(x.v), 1, 127);
      if (x.h === "L" || x.h === "R") n.h = x.h;
      if (Number.isFinite(x.f)) n.f = clamp(Math.round(x.f), 1, 5);
      const dt = clamp(x.dt ?? 0, -0.06, 0.06); n.s = +Math.max(0, n.s + dt).toFixed(4);
      const dd = clamp(x.dd ?? 1, 0.25, 1.3); n.d = +Math.max(0.05, n.d * dd).toFixed(4);
    });
    for (const p of data.pedal ?? []) if (Number.isFinite(p.s) && p.d > 0) newPedal.push({ s: +(b0 + Math.max(0, p.s)).toFixed(4), d: +Math.min(p.d, b1 - b0 - Math.max(0, p.s)).toFixed(4) });
    memos.push(data.performanceNotes ?? ""); prevMemo = data.performanceNotes ?? "";
    const vs = idx.slice(-12).map((i) => all[i].v); prevDyn = Math.round(vs.reduce((a, b) => a + b, 0) / Math.max(1, vs.length));
    tr.notes = all.slice().sort((a, b) => a.s - b.s); song.pedal = newPedal.slice().sort((a, b) => a.s - b.s);
    emit("notes"); emit("tracks");
    status(`${label} 決めました (${applied}/${idx.length} 音)。${(data.performanceNotes ?? "").slice(0, 100)}`);
  }
  // 運指の検査で機械的に直せる所は直す
  const a = analyzePiano({ notes: tr.notes.map((n) => ({ ...n })), pedal: song.pedal }, { song, range: { startBar: 0, bars: total } });
  tr.notes = a.notes.map((n) => ({ id: uid(), ...n })); song.pedal = a.pedal;
  tr.performanceNotes = memos.join(" / ");
  song.interpretation = { model, memos, usage, at: new Date().toISOString() };
  pushUndo(); emit("notes"); emit("tracks"); stage.setSong(tr.notes, song.pedal); saveLocal();
  return { usage, memos, analysis: a };
}
window.vesperInterpret = interpretSong;

/* ─────────── 曲を選ぶ (同梱の名曲 / 作った曲) ─────────── */
const dlg = $("#dlg-songs");
let libTimer = null;
function ensureSongId() { if (!state.songId) state.songId = lib.newId(); return state.songId; }
const SAVE_KINDS = new Set(["composed", "imported"]);
function saveable() { return SAVE_KINDS.has(state.song.kind) && state.song.tracks.some((x) => x.notes.length); }
onSave(() => { clearTimeout(libTimer); libTimer = setTimeout(() => { if (saveable()) lib.saveSong(ensureSongId(), state.song).catch(() => {}); }, 600); });
function row(title, meta, btnLabel, onOpen, extra = []) {
  const el = document.createElement("div"); el.className = "lib-row";
  el.innerHTML = `<div><div class="lib-title">${esc(title)}</div><div class="lib-meta">${esc(meta)}</div></div><button class="gbtn small lib-open">${esc(btnLabel)}</button>`;
  el.querySelector(".lib-open").addEventListener("click", onOpen);
  for (const [label, fn, cls] of extra) { const b = document.createElement("button"); b.className = `gbtn small ${cls ?? ""}`; b.textContent = label; b.addEventListener("click", fn); el.appendChild(b); }
  while (el.children.length < 5) el.appendChild(document.createElement("span"));
  return el;
}
async function renderSongs() {
  const el = $("#lib-list"); el.innerHTML = "";
  const head = (txt) => { const h = document.createElement("div"); h.className = "lib-head"; h.textContent = txt; el.appendChild(h); };
  head("同梱の曲 (著作権切れの名曲 = Mutopia Project の Public Domain 版、と このアプリで作ったオリジナル曲)");
  for (const it of await listRepertoire()) el.appendChild(row(it.title, `${it.composer} · ${it.year} · ${it.license}`, "弾く", async () => { try { status(await playRepertoire(it), "lit"); dlg.close(); play(0); } catch (err) { toast(err.message, true); } }));
  const all = await lib.listSongs();
  const groups = [["作った曲 (作曲したもの)", all.filter((m) => m.kind === "composed")], ["読み込んだ曲 (自分の MIDI / JSON)", all.filter((m) => m.kind === "imported")]];
  for (const [title, list] of groups) {
  head(title);
  if (!list.length) { const p = document.createElement("p"); p.className = "dim"; p.textContent = title.startsWith("作った") ? "まだありません。「作曲」で作った曲がここに残ります。" : "まだありません。上の「MIDI 読み込み」で読めます。"; el.appendChild(p); }
  for (const m of list) {
    el.appendChild(row(`${m.title}${m.id === state.songId ? " (開いている曲)" : ""}`, `${m.tempo ?? "-"} BPM · ${m.key ?? ""} · ${m.bars} 小節 · ${m.notes} 音 · ${new Date(m.updatedAt ?? 0).toLocaleString()}`, "弾く",
      async () => { await openFromLibrary(m.id); dlg.close(); play(0); },
      [["名前", async () => { const name = prompt("曲の名前", m.title); if (!name) return; const song = await lib.loadSong(m.id); if (!song) return; song.title = name; await lib.saveSong(m.id, song); if (m.id === state.songId) { state.song.title = name; setTitleUi(); saveLocal(); } renderSongs(); }],
       ["削除", async () => { if (!confirm(`「${m.title}」を消しますか?`)) return; await lib.deleteSong(m.id); if (m.id === state.songId) state.songId = null; renderSongs(); }, "danger"]]));
  }
  }
}
async function openFromLibrary(id) { const song = await lib.loadSong(id); if (!song) throw new Error("not found"); if (state.playing) audio.stop(); state.songId = id; resetSong(song); pianoTrack(); emit("selection"); }
$("#btn-songs").addEventListener("click", async () => { if (saveable()) await lib.saveSong(ensureSongId(), state.song).catch(() => {}); await renderSongs(); dlg.showModal(); });
$("#btn-songs-close").addEventListener("click", () => dlg.close());
$("#btn-new-song").addEventListener("click", () => { if (state.playing) audio.stop(); state.songId = lib.newId(); resetSong(pianoSong()); pianoTrack(); emit("selection"); dlg.close(); });
$("#btn-save-as").addEventListener("click", async () => { const name = prompt("曲の名前", `${state.song.title} (copy)`); if (!name) return; const copy = JSON.parse(JSON.stringify(state.song)); copy.title = name; copy.kind = copy.kind === "composed" ? "composed" : "imported"; const id = lib.newId(); await lib.saveSong(id, copy); state.songId = id; state.song.title = name; state.song.kind = copy.kind; setTitleUi(); saveLocal(); renderSongs(); });
$("#btn-thanks").addEventListener("click", () => $("#dlg-thanks").showModal());
$("#btn-thanks-close").addEventListener("click", () => $("#dlg-thanks").close());


/* ─────────── AI: 作曲 (設計図 → 区間ごとに両手 → 検査 → 手直し → 磨き上げ) ─────────── */
let cancelFlag = false;
const CHUNK_BARS = 16;
function planChunks(startBar, numBars, maxBars = CHUNK_BARS) {
  if (numBars <= maxBars) return [{ startBar, bars: numBars }];
  const bounds = []; let b = 0;
  for (const s of state.song.sections ?? []) { b += s.bars; if (b > startBar && b < startBar + numBars) bounds.push(b); }
  const chunks = []; let cur = startBar; const end = startBar + numBars;
  while (cur < end) { let next = Math.min(end, cur + maxBars); const c = bounds.filter((x) => x > cur + 4 && x <= cur + maxBars); if (c.length && next < end) next = c[c.length - 1]; chunks.push({ startBar: cur, bars: next - cur }); cur = next; }
  return chunks;
}
async function generatePiano({ startBar, numBars, mode = "new", direction, model, deep = false, onProgress }) {
  const song = state.song; const ts = song.timeSig; const tr = pianoTrack();
  const songInfo = { title: song.title, tempo: song.tempo, timeSig: ts, key: song.key, concept: song.concept, sections: song.sections, chordProgression: song.chordProgression, tempoMap: song.tempoMap };
  const chunks = planChunks(startBar, numBars, deep ? 8 : CHUNK_BARS);
  const b0 = startBar * ts, b1 = (startBar + numBars) * ts;
  const kept = tr.notes.filter((n) => n.s < b0 - 1e-6 || n.s >= b1 - 1e-6);
  const keptPedal = (song.pedal ?? []).filter((p) => p.s + p.d <= b0 + 1e-6 || p.s >= b1 - 1e-6);
  let added = [], addedPedal = [], memos = [], reports = [];
  let prevNotes = null, prevPedal = null, prevMemo = "";
  const gen = (req, label) => generateStructured({ ...req, model, onProgress: (p) => onProgress?.(`${label} ${p.notes ?? 0}♪ (${((p.chars ?? 0) / 1000).toFixed(1)}k)${p.retry ? " (retry)" : ""}`) });
  for (const [ci, chunk] of chunks.entries()) {
    if (cancelFlag) throw new Error("止めました");
    const range = { startBar: chunk.startBar, bars: chunk.bars };
    const sb = chunk.startBar * ts;
    const label = chunks.length > 1 ? `[${ci + 1}/${chunks.length} bar ${chunk.startBar + 1}〜${chunk.startBar + chunk.bars}]` : "";
    let m = mode, previousNotes = prevNotes;
    if (mode === "variation" && ci === 0) previousNotes = tr.notes.filter((n) => n.s >= sb && n.s < sb + chunk.bars * ts).map((n) => ({ p: n.p, s: +(n.s - sb).toFixed(3), d: n.d, v: n.v, h: n.h, f: n.f }));
    else if (ci > 0) m = "continue";
    const base = { song: songInfo, range, stylePrompt: tr.stylePrompt, extraDirection: direction };
    let { data } = await gen(buildPianoRequest({ ...base, mode: m, previousNotes, previousPedal: prevPedal, previousPerformanceNotes: prevMemo }), `${label} 生成中…`);
    let a = analyzePiano(data, { song, range });
    let memo = data.performanceNotes ?? "";
    const passes = [describeAnalysis(a)];
    if (a.severity === 3) {
      const r2 = await gen(buildPianoRequest({ ...base, mode: m, previousNotes, previousPedal: prevPedal, previousPerformanceNotes: prevMemo, extraDirection: `${direction ? direction + "\n" : ""}前回は notes が空だった。必ず演奏を書く。` }), `${label} 生成中 (2)…`);
      a = analyzePiano(r2.data, { song, range }); memo = r2.data.performanceNotes ?? memo; passes.push(describeAnalysis(a));
    }
    if (a.severity === 2 && a.stats.count > 0) {
      try {
        const r3 = await gen(buildPianoRequest({ ...base, mode: "revise", issues: a.issues, revisedNotes: { notes: a.notes, pedal: a.pedal } }), `${label} 手直し中…`);
        const a3 = analyzePiano(r3.data, { song, range });
        if (a3.stats.count > 0 && a3.severity <= a.severity && a3.issues.length <= a.issues.length) { a = a3; memo = r3.data.performanceNotes ?? memo; passes.push(`手直し後: ${describeAnalysis(a3)}`); } else passes.push("手直し案は不採用");
      } catch (e) { passes.push(`手直し失敗: ${e.message}`); }
    }
    if (deep && a.stats.count > 0) {
      try {
        const r4 = await gen(buildPianoRequest({ ...base, mode: "polish", revisedNotes: { notes: a.notes, pedal: a.pedal } }), `${label} 磨き上げ中…`);
        const a4 = analyzePiano(r4.data, { song, range });
        if (a4.stats.count >= a.stats.count * 0.6 && a4.severity <= Math.max(1, a.severity)) { a = a4; memo = r4.data.performanceNotes ?? memo; passes.push(`磨き上げ: ${describeAnalysis(a4)}`); } else passes.push("磨き上げ案は不採用");
      } catch (e) { passes.push(`磨き上げ失敗: ${e.message}`); }
    }
    added = added.concat(a.notes.map((n) => ({ id: uid(), p: n.p, s: +(sb + n.s).toFixed(4), d: n.d, v: n.v, h: n.h, f: n.f })));
    addedPedal = addedPedal.concat(a.pedal.map((p) => ({ s: +(sb + p.s).toFixed(4), d: p.d })));
    memos.push(memo); reports.push({ range, analysis: a, passes });
    prevNotes = a.notes.slice(-160); prevPedal = a.pedal.slice(-8); prevMemo = memo;
    tr.notes = [...kept, ...added].sort((x, y) => x.s - y.s); song.pedal = [...keptPedal, ...addedPedal].sort((x, y) => x.s - y.s);
    emit("notes"); emit("tracks");
  }
  tr.performanceNotes = memos.join(" / ");
  pushUndo(); emit("notes"); emit("tracks");
  stage.setSong(tr.notes, song.pedal);
  return { count: added.length, reports, memo: tr.performanceNotes };
}
function applyBlueprint(bp) {
  const song = state.song;
  song.title = bp.title; song.tempo = bp.tempo; song.timeSig = bp.timeSig; song.key = bp.key; song.concept = bp.concept;
  song.sections = bp.sections; song.chordProgression = bp.chordProgression;
  song.tempoMap = (bp.tempoChanges ?? []).map((p) => ({ beat: p.bar * bp.timeSig + p.beat, tempo: p.tempo })).filter((p) => p.tempo > 0).sort((a, b) => a.beat - b.beat);
  song.pedal = [];
  const tr = pianoTrack(); tr.notes = [];
  const plan = (bp.trackPlan ?? []).find((p) => p.instrument === "piano") ?? bp.trackPlan?.[0];
  if (plan?.stylePrompt) tr.stylePrompt = plan.stylePrompt;
  song.tracks = [tr];
  pushUndo(); emit("song"); emit("tracks"); emit("selection");
}
async function compose(theme, { model, deep }) {
  if (state.playing) audio.stop();
  if (jam) jamStop();
  if (saveable()) await lib.saveSong(ensureSongId(), state.song).catch(() => {});
  state.songId = lib.newId();
  const fresh = pianoSong(); fresh.kind = "composed"; fresh.title = "作曲中…";
  resetSong(fresh); pianoTrack(); emit("selection");
  status(`作曲を始めます (数分かかります)`);
  const req = buildBlueprintRequest({ prompt: `${theme}\n\n※ ピアノ独奏 (1 台のピアノ、両手) の曲。trackPlan は piano 1 本だけにし、stylePrompt に演奏スタイル (奏法・タッチ・ペダル・参考ピアニスト) を書く。${deep ? "構成は 24〜40 小節で、各セクションの役割と山場を具体的に書く。" : "構成は 16〜32 小節。"}` });
  const { data } = await generateStructured({ ...req, model, maxTokens: 16000, onProgress: (p) => progress(`設計図を考え中… ${((p.chars ?? 0) / 1000).toFixed(1)}k`) });
  if (cancelFlag) throw new Error("止めました");
  applyBlueprint(data); state.song.kind = "composed";
  status(`「${data.title}」を作っています (${totalBars()} 小節)`);
  const r = await generatePiano({ startBar: 0, numBars: totalBars(), mode: "new", model, deep, onProgress: progress });
  const issues = r.reports.flatMap((x) => x.analysis.issues);
  saveLocal();
  status(`「${data.title}」ができました (${r.count}音)。「曲を選ぶ」の「作った曲」にも残ります`, "lit");
  await play(0);
}

/* ─────────── JAM (即興): すぐ弾き始め、弾きながらお題の手札を作って差し替える ─────────── */
const JAM_LS = "vesper:jam:banks:v1";
let jam = null;
function loadBanks() { try { return JSON.parse(localStorage.getItem(JAM_LS) || "{}"); } catch { return {}; } }
function saveBank(style, bank) { const b = loadBanks(); b[style] = bank; try { localStorage.setItem(JAM_LS, JSON.stringify(b)); } catch {} }
async function makeBank(style, key, tempo, model) {
  const req = buildJamBankRequest({ style, key, tempo });
  const { data } = await generateStructured({ ...req, model, maxTokens: 24000, onProgress: (p) => progress(`お題に合う手札を作り中… ${((p.chars ?? 0) / 1000).toFixed(1)}k (その間は既定の手札で弾いています)`) });
  if (!data.progressions?.length || !data.lhPatterns?.length || !data.rhMotifs?.length) throw new Error("手札が空でした");
  data.fills = data.fills?.length ? data.fills : DEFAULT_BANK.fills;
  saveBank(style, data);
  return data;
}
// 同梱の手札 (public/piano/banks/*.json: 20 スタイル・1000 パターン超)。お題に一番近いスタイルを選ぶ
let bankIndex = null;
async function listBankStyles() { if (bankIndex) return bankIndex; try { const r = await fetch("banks/index.json", { cache: "no-cache" }); bankIndex = r.ok ? await r.json() : []; } catch { bankIndex = []; } return bankIndex; }
async function loadBankFile(id) { const r = await fetch(`banks/${id}.json`, { cache: "no-cache" }); if (!r.ok) throw new Error("手札が読めません"); return await r.json(); }
const STYLE_WORDS = {
  "jazz-ballad": ["ジャズ", "バラード", "jazz", "しっとり", "夜", "バー"], swing: ["スウィング", "swing", "ビバップ", "bebop", "ジャズ", "軽快"], bossa: ["ボサ", "bossa", "ブラジル", "夏", "海"], ragtime: ["ラグ", "rag", "ジョプリン", "レトロ", "陽気"],
  blues: ["ブルース", "blues", "渋い"], gospel: ["ゴスペル", "ソウル", "gospel", "soul", "教会"], "jpop-ballad": ["j-pop", "jpop", "ポップ", "切ない", "バラード", "泣ける", "卒業"], citypop: ["シティポップ", "city", "都会", "夜景", "80"],
  cinematic: ["映画", "壮大", "冒険", "ドラマ", "エピック", "cinema"], minimal: ["ミニマル", "アンビエント", "静か", "雨", "坂本", "久石", "透明", "余韻"], romantic: ["ロマン", "ショパン", "ノクターン", "夜想", "甘い"], impressionist: ["印象", "ドビュッシー", "月", "水", "光"],
  baroque: ["バロック", "バッハ", "対位", "教会", "厳か"], classical: ["古典", "モーツァルト", "明るい", "軽やか", "上品"], latin: ["ラテン", "サルサ", "熱い", "踊"], tango: ["タンゴ", "情熱", "ピアソラ"],
  newage: ["ヒーリング", "癒", "リラックス", "眠", "瞑想", "朝"], "pop-rock": ["ロック", "元気", "アップテンポ", "疾走", "8ビート"], lullaby: ["子守", "童謡", "優しい", "赤ちゃん", "眠り"], wafu: ["和", "日本", "桜", "侍", "琴", "祭"],
};
async function pickStyle(theme, model) {
  const styles = await listBankStyles();
  if (!styles.length) return null;
  if (!theme) return styles[Math.floor(Math.random() * styles.length)];
  const q = theme.toLowerCase();
  let best = null, bestScore = 0;
  for (const s of styles) { const words = [...(STYLE_WORDS[s.id] ?? []), s.name]; const score = words.reduce((a, w) => a + (q.includes(w.toLowerCase()) ? 1 : 0), 0); if (score > bestScore) { best = s; bestScore = score; } }
  if (best) return best;
  // 言葉が当たらなければ Claude に選ばせる (小さな呼び出し)
  try {
    const schema = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", enum: styles.map((s) => s.id) } } };
    const { data } = await generateStructured({ system: "お題に一番近いスタイルを 1 つ選ぶ。", userText: `お題: ${theme}\nスタイル: ${styles.map((s) => `${s.id}=${s.name} (${s.desc})`).join(" / ")}`, schema, model: "claude-sonnet-5", maxTokens: 200 });
    return styles.find((s) => s.id === data.id) ?? styles[0];
  } catch { return styles[Math.floor(Math.random() * styles.length)]; }
}
async function jamStart(theme, { model } = {}) {
  if (jam) jamStop();
  if (state.playing) audio.stop();
  await lib.saveSong(ensureSongId(), state.song).catch(() => {});
  state.songId = lib.newId();
  const style = await pickStyle(theme, model);
  let bank = DEFAULT_BANK;
  if (style) { try { bank = await loadBankFile(style.id); } catch {} }
  const key = style?.key ?? state.song.key ?? "C major", tempo = style?.tempo ?? state.song.tempo ?? 96;
  const song = pianoSong();
  song.title = `即興 — ${style?.name ?? "セッション"}${theme ? ` (${theme.slice(0, 30)})` : ""}`; song.key = key; song.tempo = tempo;
  song.sections = [{ name: "JAM", bars: 8, description: "" }]; song.kind = "jam";
  resetSong(song); const tr = pianoTrack(); emit("selection");
  const imp = new Improviser(bank, { density: 1 });
  jam = { imp, timer: null, ahead: 0, theme };
  for (let i = 0; i < 2; i++) jamAppend(tr, imp.next8(jam.ahead * 4));
  await play(0);
  jam.timer = setInterval(jamTick, 500);
  status(`即興: ${style?.name ?? "既定の手札"} (${key}, ${tempo} BPM)。■ で止まります`, "lit");
}
function jamAppend(tr, part) {
  const notes = part.notes.map((n) => ({ id: uid(), ...n }));
  tr.notes.push(...notes); tr.notes.sort((a, b) => a.s - b.s);
  state.song.pedal.push(...part.pedal);
  state.song.sections[0].bars = jam.ahead + 8;
  for (const c of part.chords) state.song.chordProgression.push({ bar: Math.floor(c.beat / 4), beat: c.beat % 4, chord: c.sym });
  jam.ahead += 8;
  if (state.playing) audio.appendNotes(tr, notes);
  stage.setSong(tr.notes, state.song.pedal);
  emit("notes"); emit("tracks");
}
function jamTick() {
  if (!jam) return;
  if (!state.playing) { jamStop(); return; }
  const remainBars = jam.ahead - audio.currentBeat() / state.song.timeSig;
  if (remainBars < 10) jamAppend(pianoTrack(), jam.imp.next8(jam.ahead * 4));
}
function jamStop() { if (!jam) return; clearInterval(jam.timer); jam = null; if (state.playing) audio.stop(); pushUndo(); setGoUi(false); }

/* ─────────── お題バー ─────────── */
const COMPOSE_MODEL = "claude-fable-5-1"; // 作曲は Fable 5.1 の超作り込み一本 (さとるん決定)
let mode = "play";
function applyMode() {
  document.querySelectorAll(".mtab").forEach((x) => x.classList.toggle("on", x.dataset.mode === mode));
  const play = mode === "play";
  $("#btn-songs").classList.toggle("hidden", !play); $("#play-hint").classList.toggle("hidden", !play);
  $("#inp-theme").classList.toggle("hidden", play); $("#btn-go").classList.toggle("hidden", play);
  $("#btn-go").textContent = mode === "compose" ? "♪ 作曲する (数分)" : "▶ 即興を始める";
  $("#inp-theme").placeholder = mode === "compose" ? "お題 (例: 雨の日の午後、静かで少し切ない曲)" : "お題 (空でもすぐ始まります。例: ジャズバラード)";
}
document.querySelectorAll(".mtab").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; applyMode(); }));
$("#sel-model").innerHTML = MODELS.map((m) => `<option value="${m.id}">${m.label}</option>`).join("");
$("#sel-model").value = settings.get().model ?? MODELS[0].id;
applyMode();
let running = false;
function setGoUi(busy) { running = busy; $("#btn-go").disabled = busy; $("#btn-cancel").classList.toggle("hidden", !busy); }
$("#btn-go").addEventListener("click", async () => {
  const theme = $("#inp-theme").value.trim();
  const model = $("#sel-model").value;
  const tr = await resolveTransport();
  if (tr === "none" && (mode === "compose" || theme)) { await settingsUi.openIfNoKey(); if ((await resolveTransport()) === "none") { status(t("nokey")); return; } }
  cancelFlag = false;
  try {
    if (mode === "jam") { setGoUi(true); await jamStart(theme, { model }); }
    else { if (!theme) { toast("お題を入れてください", true); return; } setGoUi(true); await compose(theme, { model: COMPOSE_MODEL, deep: true }); setGoUi(false); }
  } catch (e) { status(`失敗: ${e.message}`); setGoUi(false); }
});
$("#btn-cancel").addEventListener("click", () => { cancelFlag = true; if (jam) jamStop(); else status("止めています…"); });
$("#inp-theme").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btn-go").click(); });

/* ─────────── settings / boot ─────────── */
const settingsUi = initSettings({ onLangChange: () => applyDom(), toast });
async function boot() {
  // v4: 一度だけ、以前の「開いていた曲」を捨てる (即興や検証用の曲が残らないように)
  let hasSaved = false;
  try { if (!localStorage.getItem("vesper:reset:v4")) { localStorage.removeItem("bluegarage.project.v1"); localStorage.setItem("vesper:reset:v4", "1"); } else hasSaved = loadLocal(); } catch { hasSaved = loadLocal(); }
  if (!hasSaved || !state.song.tracks.some((x) => x.instrument === "piano") || !SAVE_KINDS.has(state.song.kind)) {
    // 何も無ければ、同梱の名曲の 1 曲目 (エンターテイナー) を開いておく
    state.songId = lib.newId(); resetSong(pianoSong());
    try { const list = await listRepertoire(); if (list[0]) await playRepertoire(list[0]); } catch {}
  }
  pianoTrack();
  syncTransportFields(); setTitleUi(); emit("song"); emit("selection");
  const tr = await resolveTransport();
  status(tr === "none" ? "API キーが未設定です (⚙ から入れてください)" : "「曲を選ぶ」で曲を選ぶか、即興・作曲でお題を入れてください");
  if (saveable()) lib.saveSong(ensureSongId(), state.song).catch(() => {});
}
boot();
