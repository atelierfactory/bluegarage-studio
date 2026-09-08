// ═══════════ VESPER PIANO — main ═══════════
// 左: ピアノ 1 本のピアノロール。右: 普段はチャット、再生すると VESPER-01 が弾く 3D 舞台。
// 曲づくりは Claude (Opus 5): 設計図 → 両手・運指・ペダル付きのピアノ独奏 → 弾けるかの検査 → 手直し。

import {
  state, on, emit, selectedTrack, totalBars, totalBeats, pushUndo, undo, redo, loadLocal, saveLocal, resetSong, onSave,
  makeTrack, uid, beatToSec, tempoAt, defaultSong, migrateSong, PAN_DEFAULTS,
} from "../js/state.js";
import * as audio from "../js/audio.js";
import { PianoRoll } from "../js/pianoroll.js";
import { Arrange } from "../js/arrange.js";
import { downloadMidi } from "../js/midi.js";
import { generateStructured, settings, resolveTransport, MODELS } from "../js/claude.js";
import { buildBlueprintRequest, buildPianoRequest, PIANO_CHAT_TOOLS, SYSTEM_CHAT_PIANO } from "../js/prompts.js";
import { analyzePiano, describeAnalysis } from "../js/critic.js";
import { t, setLang, detectLang, applyDom, getLang } from "../js/i18n.js";
import { initSettings } from "../js/settings.js";
import { initChat } from "../js/chat.js";
import * as lib from "../js/library.js";
import { PianoStage } from "./scene.js";
import { THEME } from "../js/pianoroll.js";
import { ARR_THEME } from "../js/arrange.js";
import { parseMidi } from "../js/midiread.js";
import { autoFinger } from "../js/fingering.js";
import { DEFAULT_BANK, Improviser, buildJamBankRequest } from "./jam.js";

// 色: 黒・白・銀。点灯 (鳴っている音・再生位置・ペダル ON) だけ金
Object.assign(THEME, {
  rowBlack: "#070707", rowWhite: "#0b0b0b", rowLineC: "#2a2a2a", rowLine: "#151515", gridBar: "#3a3a3a", gridBeat: "#1c1c1c", gridSub: "#121212",
  rulerBg: "#0a0a0a", rulerText: "#9a9a9a", chord: "#cfcfcf", rulerLine: "#3a3a3a",
  keyBlack: "#111", keyWhite: "#ececec", keyLabelOnBlack: "#fff", keyLabelOnWhite: "#000",
  playhead: "#e0b95a", hint: "#8a8a8a", hint2: "#4a4a4a",
  handL: "#8c8c8c", handR: "#f2f2f2", fingerText: "rgba(0,0,0,.85)",
  pedal: "rgba(120,120,120,.35)", pedalEdge: "rgba(200,200,200,.9)", pedalText: "#8a8a8a",
  boxFill: "rgba(255,255,255,.08)", boxStroke: "rgba(255,255,255,.6)", selected: "#e0b95a", lit: "#e0b95a",
});
Object.assign(ARR_THEME, {
  sections: ["rgba(255,255,255,.05)", "rgba(255,255,255,.09)", "rgba(255,255,255,.05)", "rgba(255,255,255,.09)", "rgba(255,255,255,.05)"],
  sectionLine: "rgba(255,255,255,.25)", sectionText: "#e6e6e6", gridMajor: "#2a2a2a", gridMinor: "#171717", barNum: "#7a7a7a", chord: "#9a9a9a", rulerLine: "#3a3a3a",
  laneSel: "rgba(255,255,255,.04)", laneLine: "#1c1c1c", laneText: "#9a9a9a", laneTextSel: "#fff", playhead: "#e0b95a", empty: "#4a4a4a", noteColor: "#d0d0d0",
});

const $ = (s) => document.querySelector(s);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+x) ? +x : lo));

/* ─────────── toast / loader / log ─────────── */
function toast(msg, isErr = false) { const el = $("#toast"); el.textContent = msg; el.className = isErr ? "show err" : "show"; clearTimeout(el._t); el._t = setTimeout(() => (el.className = ""), 3200); }
function showLoader(text) { $("#loader-text").textContent = text; $("#loader").classList.remove("hidden"); }
function hideLoader() { $("#loader").classList.add("hidden"); }
let chat = null; const pendingNotes = [];
function log(msg, cls = "") { const text = `[${new Date().toLocaleTimeString("ja-JP", { hour12: false })}] ${msg}`; if (chat) chat.note(text, cls); else pendingNotes.push([text, cls]); }

setLang(detectLang(settings.get().lang)); applyDom();

/* ─────────── song model: ピアノ 1 本 ─────────── */
function pianoSong() {
  const s = defaultSong();
  s.title = "無題のピアノ曲"; s.tempo = 90; s.key = "C major";
  s.sections = [{ name: "Intro", bars: 4, description: "" }, { name: "A", bars: 8, description: "" }, { name: "B", bars: 8, description: "" }, { name: "Outro", bars: 4, description: "" }];
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

/* ─────────── views ─────────── */
const proll = new PianoRoll($("#proll"), { getSnap: () => parseFloat($("#inp-snap").value) || 0 });
const arrange = new Arrange($("#arrange"));
// 新しく置く音符に手を付ける (ピアノロールの追加は id/p/s/d/v だけなので後から補う)
on("notes", () => { const tr = selectedTrack(); if (!tr) return; let changed = false; for (const n of tr.notes) if (!n.h) { n.h = $("#inp-hand").value; n.f = n.f ?? 2; changed = true; } if (changed) proll.draw(); if (stage) stage.setSong(tr.notes, state.song.pedal); });
on("song", () => { syncTransportFields(); if (stage) { const tr = selectedTrack(); if (tr) stage.setSong(tr.notes, state.song.pedal); $("#stage-title").textContent = state.song.title || ""; } });

/* ─────────── stage (VESPER) ─────────── */
let stage = null;
let stageVisible = false;
function ensureStage() { if (!stage) { stage = new PianoStage($("#stage-canvas")); window.vesperStage = stage; const d = document.createElement("div"); d.className = "divider"; $("#stage").appendChild(d); const j = document.createElement("div"); j.id = "stage-jam"; $("#stage").appendChild(j); const pip = document.createElement("div"); pip.id = "stage-pip"; $("#stage").appendChild(pip); } return stage; }
function showStage(show) {
  stageVisible = show;
  $("#stage").classList.toggle("hidden", !show);
  $("#chatwrap").classList.toggle("hidden", show);
  if (show) { ensureStage(); stage._resize(); const tr = pianoTrack(); stage.setSong(tr.notes, state.song.pedal); $("#stage-title").textContent = state.song.title || ""; }
}
let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (!stage || !stageVisible) return;
  // 表示直後にサイズが取れていないことがあるので、毎フレーム実寸と照らす
  const cw = stage.canvas.clientWidth, ch = stage.canvas.clientHeight;
  if (cw > 0 && ch > 0 && (Math.abs(cw - stage.w) > 1 || Math.abs(ch - stage.h) > 1)) stage._resize();
  const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
  const beat = audio.currentBeat();
  stage.update(beat, (b) => beatToSec(b), dt, state.playing);
  stage.render();
  $("#stage-pedal").classList.toggle("on", stage.pedalDown);
  const ts = state.song.timeSig;
  $("#stage-info").textContent = `bar ${Math.floor(beat / ts) + 1} · ♩=${Math.round(tempoAt(beat))}`;
}
requestAnimationFrame(frame);
$("#btn-stage-show").addEventListener("click", () => showStage(true));

/* ─────────── JAM (即興: 手札を混ぜて弾き続ける) ─────────── */
const JAM_LS = "vesper:jam:banks:v1";
let jam = null;   // { imp, timer, bank, style, ahead }
function loadBanks() { try { return JSON.parse(localStorage.getItem(JAM_LS) || "{}"); } catch { return {}; } }
function saveBank(style, bank) { const b = loadBanks(); b[style] = bank; try { localStorage.setItem(JAM_LS, JSON.stringify(b)); } catch {} }
function bankFor(style) { const b = loadBanks(); return b[style] ?? (Object.values(b)[0] ?? DEFAULT_BANK); }
async function makeBank(style, key, tempo, progress) {
  const req = buildJamBankRequest({ style, key, tempo });
  const { data } = await generateStructured({ ...req, maxTokens: 24000, onProgress: (p) => progress?.(`手札を作り中… ${((p.chars ?? 0) / 1000).toFixed(1)}k`) });
  if (!data.progressions?.length || !data.lhPatterns?.length || !data.rhMotifs?.length) throw new Error("手札が空でした");
  data.fills = data.fills?.length ? data.fills : DEFAULT_BANK.fills;
  saveBank(style, data);
  return data;
}
async function jamStart({ style, key, tempo, density = 1 } = {}) {
  if (jam) jamStop();
  const bank = bankFor(style ?? "default");
  // 今の曲はライブラリに残し、即興は新しい曲として始める
  await lib.saveSong(ensureSongId(), state.song).catch(() => {});
  state.songId = lib.newId();
  const song = pianoSong();
  song.title = `JAM — ${style ?? bank.style ?? "session"}`; song.key = key ?? state.song.key ?? "C major"; song.tempo = tempo ?? state.song.tempo ?? 96;
  song.sections = [{ name: "JAM", bars: 8, description: "" }];
  resetSong(song); const tr = pianoTrack(); emit("selection");
  const imp = new Improviser(bank, { density });
  jam = { imp, bank, style: style ?? bank.style, timer: null, ahead: 0, notesTotal: 0 };
  // 先に 16 小節作る
  for (let i = 0; i < 2; i++) jamAppend(tr, imp.next8(jam.ahead * 4));
  showStage(true);
  await audio.play(0, (m) => (m ? showLoader(m) : hideLoader()));
  $("#btn-jam").classList.add("active");
  $("#stage-jam")?.classList.add("on");
  jam.timer = setInterval(jamTick, 500);
  return `JAM を始めました (${jam.style}, ${song.key}, ${song.tempo} BPM, 手札: 進行 ${bank.progressions.length} / 伴奏 ${bank.lhPatterns.length} / モチーフ ${bank.rhMotifs.length})。止めるときは jam stop`;
}
function jamAppend(tr, part) {
  const notes = part.notes.map((n) => ({ id: uid(), ...n }));
  tr.notes.push(...notes); tr.notes.sort((a, b) => a.s - b.s);
  state.song.pedal.push(...part.pedal);
  state.song.sections[0].bars = (jam.ahead + 8);
  for (const c of part.chords) state.song.chordProgression.push({ bar: Math.floor(c.beat / 4), beat: c.beat % 4, chord: c.sym });
  jam.ahead += 8; jam.notesTotal += notes.length; jam.info = part.info;
  if (state.playing) audio.appendNotes(tr, notes);
  if (stage) stage.setSong(tr.notes, state.song.pedal);
  emit("notes"); emit("tracks");
  const el = $("#stage-jam"); if (el) el.textContent = `JAM · ${part.info}`;
}
function jamTick() {
  if (!jam) return;
  if (!state.playing) { jamStop(); return; }
  const ts = state.song.timeSig;
  const remainBars = jam.ahead - audio.currentBeat() / ts;
  if (remainBars < 10) jamAppend(pianoTrack(), jam.imp.next8(jam.ahead * 4));
}
function jamStop() {
  if (!jam) return;
  clearInterval(jam.timer); jam = null;
  $("#btn-jam").classList.remove("active");
  $("#stage-jam")?.classList.remove("on");
  if (state.playing) audio.stop();
  pushUndo();
}
$("#btn-jam").addEventListener("click", () => { if (jam) jamStop(); else jamStart({ style: pianoTrack().stylePrompt || undefined }).catch((e) => toast(e.message, true)); });
on("transport", () => { if (!state.playing && jam) jamStop(); });
$("#btn-stage-chat").addEventListener("click", () => showStage(false));

/* ─────────── transport ─────────── */
function syncTransportFields() { $("#inp-tempo").value = state.song.tempo; $("#inp-timesig").value = String(state.song.timeSig === 3 ? 3 : state.song.timeSig === 6 ? 6 : 4); $("#inp-key").value = state.song.key; $("#inp-master").value = state.song.master.volume; }
$("#inp-tempo").addEventListener("change", (e) => { state.song.tempo = clamp(e.target.value, 30, 300); pushUndo(); if (state.playing) { audio.stop(); audio.play(); } });
$("#inp-timesig").addEventListener("change", (e) => { state.song.timeSig = parseInt(e.target.value, 10) || 4; pushUndo(); emit("song"); });
$("#inp-key").addEventListener("change", (e) => { state.song.key = e.target.value; pushUndo(); });
$("#inp-master").addEventListener("input", (e) => audio.setMasterVolume(parseFloat(e.target.value)));
const btnPlay = $("#btn-play");
async function togglePlay() {
  if (state.playing) { audio.stop(); return; }
  try { pianoTrack(); showStage(true); await audio.play(null, (m) => (m ? showLoader(m) : hideLoader())); }
  catch (err) { hideLoader(); console.error(err); toast(err.message, true); }
}
btnPlay.addEventListener("click", togglePlay);
$("#btn-stop").addEventListener("click", () => audio.stop(true));
$("#btn-rew").addEventListener("click", () => audio.seek(0));
$("#btn-loop").addEventListener("click", (e) => { state.loop = !state.loop; e.currentTarget.classList.toggle("active", state.loop); if (state.playing) { audio.stop(); audio.play(); } });
$("#btn-met").addEventListener("click", () => { state.metronome = !state.metronome; $("#btn-met").classList.toggle("active", state.metronome); if (state.playing) { audio.stop(); audio.play(); } });
on("transport", () => { btnPlay.textContent = state.playing ? "❚❚" : "▶"; btnPlay.classList.toggle("active", state.playing); });
on("playhead", () => {
  const ts = state.song.timeSig; const bar = Math.floor(state.playheadBeat / ts) + 1; const beat = Math.floor(state.playheadBeat % ts) + 1;
  $("#pos-display").textContent = `${String(bar).padStart(3, "0")}.${beat}`;
  const sec = beatToSec(state.playheadBeat);
  $("#time-display").textContent = `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, "0")}`;
  if (state.playing) proll.followPlayhead();
});
window.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); return; }
  if (e.key === "Home") audio.seek(0);
  if (e.key === "m" && !e.metaKey && !e.ctrlKey) $("#btn-met").click();
  if (e.key === "j" && !e.metaKey && !e.ctrlKey) $("#btn-jam").click();
  if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.metaKey || e.ctrlKey) && (e.key === "Z" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); redo(); }
  // 1〜5 = 指, L/R = 手, P = 選択範囲にペダル
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

/* ─────────── humanize / quantize / check ─────────── */
$("#btn-humanize").addEventListener("click", () => { const tr = pianoTrack(); for (const n of tr.notes) { if (n.s > 0.01) n.s = Math.max(0, n.s + (Math.random() - 0.5) * 0.025); n.v = clamp(Math.round(n.v + (Math.random() - 0.5) * 10), 1, 127); } pushUndo(); emit("notes"); });
$("#btn-quantize").addEventListener("click", () => { const tr = pianoTrack(); const snap = parseFloat($("#inp-snap").value) || 0.25; for (const n of tr.notes) n.s = Math.round(n.s / snap) * snap; pushUndo(); emit("notes"); });
function checkNow() {
  const tr = pianoTrack();
  const a = analyzePiano({ notes: tr.notes.map((n) => ({ ...n })), pedal: state.song.pedal }, { song: state.song, range: { startBar: 0, bars: totalBars() } });
  return a;
}
$("#btn-check").addEventListener("click", () => { const a = checkNow(); log(`検査: ${describeAnalysis(a)} (右手 ${a.stats.right} 音 / 左手 ${a.stats.left} 音 / ペダル ${a.stats.pedalSegments} 区間)${a.issues.length ? "\n- " + a.issues.join("\n- ") : ""}`, a.issues.length ? "err" : "ok"); showStage(false); });

/* ─────────── export ─────────── */
function exportMidi() { if (!pianoTrack().notes.length) throw new Error("音符がありません"); downloadMidi(state.song); toast("MIDI を書き出しました (ペダル CC64 付き)"); }
$("#btn-export").addEventListener("click", () => { try { exportMidi(); } catch (e) { toast(e.message, true); } });
$("#btn-save").addEventListener("click", () => { saveLocal(); toast(t("toast.saved")); });
async function exportWav(onProgress) {
  if (!pianoTrack().notes.length) throw new Error("音符がありません");
  if (state.playing) audio.stop();
  const btn = $("#btn-export-wav"); btn.disabled = true;
  try {
    await audio.ensureAudio(); showLoader("WAV…");
    const { buffer, report } = await audio.renderSong((m) => { $("#loader-text").textContent = m; onProgress?.(m); });
    const blob = audio.bufferToWav(buffer);
    const name = (state.song.title || "vesper-piano").replace(/[\\/:*?"<>|]/g, "_");
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name}.wav`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    const msg = `WAV: ${name}.wav (${(blob.size / 1024 / 1024).toFixed(1)}MB) / ${report.lufs.toFixed(1)} LUFS / ピーク ${report.peakDb.toFixed(1)} dBFS`;
    log(msg, "ok"); return msg;
  } finally { hideLoader(); btn.disabled = false; }
}
$("#btn-export-wav").addEventListener("click", () => exportWav().catch((e) => toast(e.message, true)));
$("#btn-export-json").addEventListener("click", () => { const blob = new Blob([JSON.stringify({ song: state.song }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${state.song.title || "piano"}.vesper.json`; a.click(); $("#dlg-menu").close(); });
$("#inp-import-json").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; try { const data = JSON.parse(await f.text()); if (!data?.song?.tracks) throw new Error("形式が違います"); state.songId = lib.newId(); resetSong(data.song); pianoTrack(); toast("OK"); } catch (err) { toast(err.message, true); } $("#dlg-menu").close(); });

/* ─────────── MIDI 読み込み・レパートリー・感謝 ─────────── */
function loadMidiIntoSong(buffer, title) {
  const m = parseMidi(buffer);
  if (!m.notes.length) throw new Error("音符が見つかりません");
  const notes = autoFinger(m.notes.filter((n) => n.p >= 21 && n.p <= 108).map((n) => ({ p: n.p, s: +n.s.toFixed(4), d: +Math.max(0.05, n.d).toFixed(4), v: Math.max(1, Math.min(127, n.v)), track: n.track })), { tracks: m.tracks });
  const song = pianoSong();
  song.title = title; song.tempo = Math.round(m.tempo); song.timeSig = m.timeSig.den === 8 ? (m.timeSig.num === 6 ? 6 : 3) : m.timeSig.num;
  song.timeSig = [3, 4, 6].includes(song.timeSig) ? song.timeSig : 4;
  const bars = Math.ceil(Math.max(...notes.map((n) => n.s + n.d)) / song.timeSig);
  song.sections = [{ name: title, bars, description: "" }];
  song.tempoMap = m.tempos.length > 1 ? m.tempos.map((t) => ({ beat: t.beat, tempo: Math.round(t.tempo * 10) / 10 })) : [];
  song.pedal = [];
  song.tracks[0].notes = notes.map((n) => ({ id: uid(), p: n.p, s: n.s, d: n.d, v: n.v, h: n.h, f: n.f }));
  state.songId = lib.newId();
  resetSong(song); pianoTrack(); emit("selection");
  const a = checkNow();
  return `「${title}」を読み込みました (${notes.length}音、${bars}小節、${song.tempo} BPM)。手と指は自動で付けました。検査: ${describeAnalysis(a)}`;
}
$("#inp-import-midi").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; try { const msg = loadMidiIntoSong(await f.arrayBuffer(), f.name.replace(/\.midi?$/i, "")); log(msg, "ok"); toast("OK"); } catch (err) { toast(err.message, true); } $("#dlg-menu").close(); e.target.value = ""; });
let repertoireCache = null;
async function listRepertoire() { if (repertoireCache) return repertoireCache; try { const r = await fetch("repertoire/index.json", { cache: "no-cache" }); repertoireCache = r.ok ? await r.json() : []; } catch { repertoireCache = []; } return repertoireCache; }
async function playRepertoire(item) {
  const r = await fetch(`repertoire/${item.file}`); if (!r.ok) throw new Error("楽譜が読めません");
  const msg = loadMidiIntoSong(await r.arrayBuffer(), `${item.title} — ${item.composer}`);
  return msg;
}
async function renderRepertoire() {
  const list = await listRepertoire(); const el = $("#rep-list"); el.innerHTML = "";
  for (const it of list) {
    const row = document.createElement("div"); row.className = "lib-row";
    row.innerHTML = `<div><div class="lib-title">${esc(it.title)}</div><div class="lib-meta">${esc(it.composer)} · ${esc(it.year)} · ${esc(it.license)}</div></div><button class="gbtn small lib-open">弾く</button><span></span><span></span><span></span>`;
    row.querySelector(".lib-open").addEventListener("click", async () => { try { log(await playRepertoire(it), "ok"); $("#dlg-repertoire").close(); showStage(true); await audio.play(0, (m) => (m ? showLoader(m) : hideLoader())); } catch (err) { toast(err.message, true); } });
    el.appendChild(row);
  }
}
$("#btn-repertoire").addEventListener("click", async () => { await renderRepertoire(); $("#dlg-repertoire").showModal(); });
$("#btn-rep-close").addEventListener("click", () => $("#dlg-repertoire").close());
$("#btn-thanks").addEventListener("click", () => $("#dlg-thanks").showModal());
$("#btn-thanks-close").addEventListener("click", () => $("#dlg-thanks").close());

/* ─────────── library ─────────── */
const dlg = $("#dlg-menu");
let libTimer = null;
function ensureSongId() { if (!state.songId) state.songId = lib.newId(); return state.songId; }
onSave(() => { clearTimeout(libTimer); libTimer = setTimeout(() => lib.saveSong(ensureSongId(), state.song).catch(() => {}), 600); });
async function renderLibrary() {
  const list = (await lib.listSongs()).filter((m) => true);
  const el = $("#lib-list"); el.innerHTML = "";
  if (!list.length) { el.innerHTML = `<p class="dim">${t("lib.empty")}</p>`; return; }
  for (const m of list) {
    const row = document.createElement("div"); row.className = "lib-row" + (m.id === state.songId ? " current" : "");
    row.innerHTML = `<div><div class="lib-title">${esc(m.title)}${m.id === state.songId ? ` <span class="dim">(${t("lib.current")})</span>` : ""}</div><div class="lib-meta">${m.tempo ?? "-"} BPM · ${esc(m.key ?? "")} · ${m.bars} bars · ${m.notes} notes · ${new Date(m.updatedAt ?? 0).toLocaleString()}</div></div>
      <button class="gbtn small lib-open">${t("lib.open")}</button><button class="gbtn small lib-rename">${t("lib.rename")}</button><button class="gbtn small lib-dup">${t("lib.saveas")}</button><button class="gbtn small danger lib-del">${t("lib.delete")}</button>`;
    row.querySelector(".lib-open").addEventListener("click", async () => { await openFromLibrary(m.id); dlg.close(); });
    row.querySelector(".lib-rename").addEventListener("click", async () => { const name = prompt(t("lib.prompt.name"), m.title); if (!name) return; const song = await lib.loadSong(m.id); if (!song) return; song.title = name; await lib.saveSong(m.id, song); if (m.id === state.songId) { state.song.title = name; saveLocal(); } renderLibrary(); });
    row.querySelector(".lib-dup").addEventListener("click", async () => { const song = await lib.loadSong(m.id); if (!song) return; const name = prompt(t("lib.prompt.name"), `${m.title} (copy)`); if (!name) return; const copy = JSON.parse(JSON.stringify(song)); copy.title = name; await lib.saveSong(lib.newId(), copy); renderLibrary(); });
    row.querySelector(".lib-del").addEventListener("click", async () => { if (!confirm(t("lib.confirm.delete", { name: m.title }))) return; await lib.deleteSong(m.id); if (m.id === state.songId) state.songId = null; renderLibrary(); });
    el.appendChild(row);
  }
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
async function openFromLibrary(id) { const song = await lib.loadSong(id); if (!song) throw new Error("not found"); if (state.playing) audio.stop(); state.songId = id; resetSong(song); pianoTrack(); emit("selection"); toast(`「${song.title}」`); }
async function saveAsNew(name) { const copy = JSON.parse(JSON.stringify(state.song)); copy.title = name || `${state.song.title} (copy)`; const id = lib.newId(); await lib.saveSong(id, copy); state.songId = id; state.song.title = copy.title; saveLocal(); emit("song"); return id; }
$("#btn-menu").addEventListener("click", async () => { await lib.saveSong(ensureSongId(), state.song).catch(() => {}); await renderLibrary(); dlg.showModal(); });
$("#btn-menu-close").addEventListener("click", () => dlg.close());
$("#btn-new-song").addEventListener("click", () => { if (!confirm(t("confirm.new"))) return; state.songId = lib.newId(); resetSong(pianoSong()); pianoTrack(); emit("selection"); dlg.close(); });
$("#btn-save-as").addEventListener("click", async () => { const name = prompt(t("lib.prompt.name"), `${state.song.title} (copy)`); if (!name) return; await saveAsNew(name); renderLibrary(); });

/* ─────────── AI: 作曲パイプライン (設計図 → 区間ごとに両手を生成 → 検査 → 手直し) ─────────── */
const CHUNK_BARS = 16;
function planChunks(startBar, numBars) {
  if (numBars <= CHUNK_BARS) return [{ startBar, bars: numBars }];
  const bounds = []; let b = 0;
  for (const s of state.song.sections ?? []) { b += s.bars; if (b > startBar && b < startBar + numBars) bounds.push(b); }
  const chunks = []; let cur = startBar; const end = startBar + numBars;
  while (cur < end) { let next = Math.min(end, cur + CHUNK_BARS); const c = bounds.filter((x) => x > cur + 4 && x <= cur + CHUNK_BARS); if (c.length && next < end) next = c[c.length - 1]; chunks.push({ startBar: cur, bars: next - cur }); cur = next; }
  return chunks;
}
async function generatePiano({ startBar, numBars, mode = "new", direction, onProgress }) {
  const song = state.song; const ts = song.timeSig; const tr = pianoTrack();
  const songInfo = { title: song.title, tempo: song.tempo, timeSig: ts, key: song.key, concept: song.concept, sections: song.sections, chordProgression: song.chordProgression, tempoMap: song.tempoMap };
  const chunks = planChunks(startBar, numBars);
  const b0 = startBar * ts, b1 = (startBar + numBars) * ts;
  const kept = tr.notes.filter((n) => n.s < b0 - 1e-6 || n.s >= b1 - 1e-6);
  const keptPedal = (song.pedal ?? []).filter((p) => p.s + p.d <= b0 + 1e-6 || p.s >= b1 - 1e-6);
  let added = [], addedPedal = [], memos = [], reports = [];
  let prevNotes = null, prevPedal = null, prevMemo = "";
  for (const [ci, chunk] of chunks.entries()) {
    const range = { startBar: chunk.startBar, bars: chunk.bars };
    const sb = chunk.startBar * ts;
    const label = chunks.length > 1 ? ` [${ci + 1}/${chunks.length}: bar ${chunk.startBar + 1}〜${chunk.startBar + chunk.bars}]` : "";
    let m = mode, previousNotes = prevNotes;
    if (mode === "variation" && ci === 0) previousNotes = tr.notes.filter((n) => n.s >= sb && n.s < sb + chunk.bars * ts).map((n) => ({ p: n.p, s: +(n.s - sb).toFixed(3), d: n.d, v: n.v, h: n.h, f: n.f }));
    else if (ci > 0) m = "continue";
    const prog = (stage) => (p) => onProgress?.(`${stage}${label} ${p.notes ?? 0}♪ (${((p.chars ?? 0) / 1000).toFixed(1)}k)${p.retry ? ` (retry)` : ""}`);
    const req = buildPianoRequest({ song: songInfo, range, mode: m, previousNotes, previousPedal: prevPedal, previousPerformanceNotes: prevMemo, extraDirection: direction, stylePrompt: tr.stylePrompt });
    let { data } = await generateStructured({ ...req, onProgress: prog("生成中…") });
    let a = analyzePiano(data, { song, range });
    let memo = data.performanceNotes ?? "";
    const passes = [describeAnalysis(a)];
    if (a.severity === 3) {
      const r2 = await generateStructured({ ...buildPianoRequest({ song: songInfo, range, mode: m, previousNotes, previousPedal: prevPedal, previousPerformanceNotes: prevMemo, stylePrompt: tr.stylePrompt, extraDirection: `${direction ? direction + "\n" : ""}前回は notes が空だった。必ず演奏を書く。` }), onProgress: prog("生成中 (2)…") });
      a = analyzePiano(r2.data, { song, range }); memo = r2.data.performanceNotes ?? memo; passes.push(describeAnalysis(a));
    }
    if (a.severity === 2 && a.stats.count > 0) {
      onProgress?.(`手直し中…${label}`);
      try {
        const r3 = await generateStructured({ ...buildPianoRequest({ song: songInfo, range, mode: "revise", issues: a.issues, revisedNotes: { notes: a.notes, pedal: a.pedal }, stylePrompt: tr.stylePrompt }), onProgress: prog("手直し中…") });
        const a3 = analyzePiano(r3.data, { song, range });
        if (a3.stats.count > 0 && a3.severity <= a.severity && a3.issues.length <= a.issues.length) { a = a3; memo = r3.data.performanceNotes ?? memo; passes.push(`手直し後: ${describeAnalysis(a3)}`); }
        else passes.push(`手直し案は不採用 (${describeAnalysis(a3)})`);
      } catch (e) { passes.push(`手直し失敗: ${e.message}`); }
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
  if (stage) stage.setSong(tr.notes, song.pedal);
  return { count: added.length, reports, memo: tr.performanceNotes };
}
function applyBlueprint(bp) {
  const song = state.song;
  if (song.tracks.some((x) => x.notes.length)) state.songId = lib.newId();
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

/* ─────────── chat tools ─────────── */
function songStateText() {
  const song = state.song; const tr = pianoTrack(); const bars = totalBars();
  const lines = [`タイトル「${song.title}」 / ${song.tempo} BPM / ${song.timeSig}/4 / キー ${song.key} / ${bars}小節 / ${state.playing ? "再生中" : "停止中"} (bar ${Math.floor(state.playheadBeat / song.timeSig) + 1})`];
  if (song.concept) lines.push(`コンセプト: ${song.concept.slice(0, 200)}`);
  if (song.sections?.length) lines.push(`セクション: ${song.sections.map((s) => `${s.name}(${s.bars})`).join(" → ")}`);
  if (song.chordProgression?.length) lines.push(`コード(先頭16): ${song.chordProgression.slice(0, 16).map((c) => `${c.bar + 1}.${Math.floor(c.beat) + 1}:${c.chord}`).join(" ")}`);
  if (song.tempoMap?.length) lines.push(`テンポ変化: ${song.tempoMap.map((p) => `bar${Math.floor(p.beat / song.timeSig) + 1}.${+(p.beat % song.timeSig).toFixed(1)}=${p.tempo}`).join(" ")}`);
  const L = tr.notes.filter((n) => n.h === "L").length, R = tr.notes.filter((n) => n.h === "R").length;
  lines.push(`ピアノ: ${tr.notes.length}音 (右手 ${R} / 左手 ${L}) / ペダル ${song.pedal?.length ?? 0} 区間${tr.stylePrompt ? ` / スタイル: ${tr.stylePrompt.slice(0, 100)}` : ""}`);
  return lines.join("\n");
}
const actions = {
  getSongState: songStateText,
  async compose_piano({ prompt, tempo, key }, progress) {
    const req = buildBlueprintRequest({ prompt: `${prompt}\n\n※ ピアノ独奏 (1 台のピアノ、両手) の曲。trackPlan は piano 1 本だけにし、stylePrompt に演奏スタイル (奏法・タッチ・ペダル・参考ピアニスト) を書く。`, tempo, key });
    const { data } = await generateStructured({ ...req, maxTokens: 16000, onProgress: (p) => progress?.(`設計図を考え中… ${((p.chars ?? 0) / 1000).toFixed(1)}k`) });
    applyBlueprint(data);
    log(`設計図: "${data.title}" ${data.tempo}BPM ${data.key}`, "ok");
    const r = await generatePiano({ startBar: 0, numBars: totalBars(), mode: "new", onProgress: progress });
    const issues = r.reports.flatMap((x) => x.analysis.issues);
    saveLocal();
    return `「${data.title}」を作りました (${data.tempo}BPM ${data.key} / ${totalBars()}小節 / ${r.count}音)。\n検査: ${r.reports.map((x) => x.passes.join(" → ")).join(" | ")}${issues.length ? `\n残った指摘: ${issues.slice(0, 3).join(" / ")}` : ""}\n演奏メモ: ${r.memo.slice(0, 400)}\n(再生すると VESPER が弾きます: transport play)`;
  },
  async regenerate({ startBar, bars, direction, mode = "new" }, progress) {
    const sb = Math.max(0, (startBar ?? 1) - 1); const nb = Math.max(1, Math.min(96, bars ?? Math.max(1, totalBars() - sb)));
    const r = await generatePiano({ startBar: sb, numBars: nb, mode, direction, onProgress: progress });
    const issues = r.reports.flatMap((x) => x.analysis.issues);
    saveLocal();
    return `bar ${sb + 1}〜${sb + nb} を作り直しました (${r.count}音)。検査: ${r.reports.map((x) => x.passes.join(" → ")).join(" | ")}${issues.length ? `\n残った指摘: ${issues.slice(0, 3).join(" / ")}` : ""}\n演奏メモ: ${r.memo.slice(0, 300)}`;
  },
  async update_song({ title, tempo, key, timeSig, stylePrompt }) {
    const song = state.song; const changed = [];
    if (title != null) { changed.push(`タイトル: ${song.title} → ${title}`); song.title = title; }
    if (tempo != null) { const v = clamp(tempo, 30, 300); changed.push(`テンポ: ${song.tempo} → ${v}`); song.tempo = v; }
    if (key != null) { changed.push(`キー: ${song.key} → ${key}`); song.key = key; }
    if (timeSig != null) { changed.push(`拍子: ${song.timeSig}/4 → ${timeSig}/4`); song.timeSig = +timeSig; }
    if (stylePrompt != null) { pianoTrack().stylePrompt = stylePrompt; changed.push("スタイル指示を更新"); }
    pushUndo(); syncTransportFields(); emit("song"); emit("tracks"); if (state.playing) { audio.stop(); audio.play(); }
    return changed.length ? `変更済み: ${changed.join(", ")}` : "変更なし";
  },
  async edit_notes({ action, amount, hand, startBar, bars }) {
    const tr = pianoTrack(); const ts = state.song.timeSig;
    const b0 = startBar != null ? (startBar - 1) * ts : -Infinity, b1 = bars != null ? b0 + bars * ts : Infinity;
    const inR = (n) => n.s >= b0 && n.s < b1 && (!hand || n.h === hand);
    let count = 0; const sorted = tr.notes.slice().sort((a, b) => a.s - b.s);
    switch (action) {
      case "transpose": for (const n of tr.notes) if (inR(n)) { n.p = clamp(n.p + Math.round(amount ?? 0), 21, 108); count++; } break;
      case "velocity_scale": for (const n of tr.notes) if (inR(n)) { n.v = clamp(Math.round(n.v * (amount ?? 1)), 1, 127); count++; } break;
      case "velocity_add": for (const n of tr.notes) if (inR(n)) { n.v = clamp(Math.round(n.v + (amount ?? 0)), 1, 127); count++; } break;
      case "humanize": for (const n of tr.notes) if (inR(n)) { if (n.s > 0.01) n.s = Math.max(0, n.s + (Math.random() - 0.5) * 0.025); n.v = clamp(Math.round(n.v + (Math.random() - 0.5) * 10), 1, 127); count++; } break;
      case "quantize": { const q = amount || 0.25; for (const n of tr.notes) if (inR(n)) { n.s = Math.round(n.s / q) * q; count++; } break; }
      case "shift": for (const n of tr.notes) if (inR(n)) { n.s = Math.max(0, n.s + (amount ?? 0)); count++; } break;
      case "clear": { const before = tr.notes.length; tr.notes = tr.notes.filter((n) => !inR(n)); count = before - tr.notes.length; break; }
      case "legato": for (let i = 0; i < sorted.length; i++) { const n = sorted[i]; if (!inR(n)) continue; const next = sorted.slice(i + 1).find((m) => m.h === n.h && m.s > n.s + 1e-6); if (next) { n.d = +Math.max(0.05, next.s - n.s - 0.01).toFixed(3); count++; } } break;
      case "staccato": for (const n of tr.notes) if (inR(n)) { n.d = +Math.max(0.05, n.d * (amount ?? 0.5)).toFixed(3); count++; } break;
      default: throw new Error(`未対応: ${action}`);
    }
    tr.notes.sort((a, b) => a.s - b.s); pushUndo(); emit("notes"); emit("tracks");
    return `${count} 音に ${action}${amount != null ? `(${amount})` : ""} を適用しました`;
  },
  async set_pedal({ mode, segments }) {
    const ts = state.song.timeSig;
    const segs = (segments ?? []).map((s) => ({ s: +((s.bar - 1) * ts + (s.beat ?? 0)).toFixed(4), d: +Math.max(0.1, s.lengthBeats).toFixed(4) }));
    if (mode === "clear") state.song.pedal = []; else if (mode === "replace") state.song.pedal = segs; else state.song.pedal = [...state.song.pedal, ...segs];
    state.song.pedal.sort((a, b) => a.s - b.s); pushUndo(); emit("notes");
    if (stage) stage.setSong(pianoTrack().notes, state.song.pedal);
    return `ペダル区間: ${state.song.pedal.length} 個 (変更済み)`;
  },
  async set_tempo_map({ points }) {
    const ts = state.song.timeSig;
    state.song.tempoMap = (points ?? []).map((p) => ({ beat: Math.max(0, p.bar - 1) * ts + (p.beat ?? 0), tempo: +p.tempo })).filter((p) => p.tempo > 0).sort((a, b) => a.beat - b.beat);
    pushUndo(); emit("song"); if (state.playing) { audio.stop(); audio.play(); }
    return state.song.tempoMap.length ? `テンポ変化を設定しました (変更済み)` : "一定テンポにしました";
  },
  async transport({ action, bar, loop }) {
    if (loop != null) { state.loop = !!loop; $("#btn-loop").classList.toggle("active", state.loop); }
    if (action === "stop") { audio.stop(); return "停止しました"; }
    if (action === "seek") { audio.seek(((bar ?? 1) - 1) * state.song.timeSig); return `bar ${bar ?? 1} へ`; }
    if (action === "play") { if (state.playing) audio.stop(); pianoTrack(); showStage(true); await audio.play(bar != null ? (bar - 1) * state.song.timeSig : null, (m) => (m ? showLoader(m) : hideLoader())); return `bar ${bar ?? Math.floor(state.playheadBeat / state.song.timeSig) + 1} から再生。VESPER が弾いています`; }
    throw new Error(`未対応: ${action}`);
  },
  async export_file({ format }, progress) {
    if (format === "midi") { exportMidi(); return "MIDI をダウンロードしました (ペダル CC64 付き)"; }
    if (format === "wav") return await exportWav(progress);
    if (format === "json") { $("#btn-export-json").click(); return "JSON をダウンロードしました"; }
    throw new Error(`未対応: ${format}`);
  },
  async project({ action, name }) {
    if (action === "list") { const list = await lib.listSongs(); return list.length ? list.map((m) => `- 「${m.title}」 ${m.tempo}BPM ${m.key} ${m.bars}小節 ${m.notes}音${m.id === state.songId ? " (開いている曲)" : ""}`).join("\n") : "保存された曲はまだありません"; }
    if (action === "open") { const m = await lib.findByTitle(name); if (!m) throw new Error(`「${name}」は無い`); await openFromLibrary(m.id); return `「${state.song.title}」を開きました`; }
    if (action === "save_as") { await saveAsNew(name); return `「${state.song.title}」として保存しました`; }
    if (action === "rename") { const before = state.song.title; state.song.title = name; pushUndo(); emit("song"); return `曲名: ${before} → ${name}`; }
    if (action === "delete") { const m = await lib.findByTitle(name); if (!m) throw new Error(`「${name}」は無い`); if (m.id === state.songId) throw new Error("開いている曲は消せません"); await lib.deleteSong(m.id); return `「${m.title}」を削除しました`; }
    if (action === "new") { state.songId = lib.newId(); resetSong(pianoSong()); pianoTrack(); emit("selection"); return "新しい空のピアノ曲にしました"; }
    throw new Error(`未対応: ${action}`);
  },
  async repertoire({ action, name }) {
    const list = await listRepertoire();
    if (action === "list" || !name) return list.length ? "同梱の曲 (すべてパブリックドメイン):\n" + list.map((it) => `- ${it.title} — ${it.composer} (${it.year})`).join("\n") + "\n自分の MIDI は ☰ → MIDI 読み込み。" : "同梱の曲はありません";
    const q = String(name).toLowerCase();
    const it = list.find((x) => x.title.toLowerCase().includes(q) || x.composer.toLowerCase().includes(q)) ?? list.find((x) => q.includes(x.title.toLowerCase().split(" ")[0]));
    if (!it) throw new Error(`「${name}」は同梱されていません (著作権のある曲は弾けません)。あるのは: ${list.map((x) => x.title).join(" / ")}`);
    const msg = await playRepertoire(it);
    showStage(true); await audio.play(0, (m) => (m ? showLoader(m) : hideLoader()));
    return `${msg}\n再生中 (VESPER が弾いています)`;
  },
  async jam({ action, style, key, tempo, density }, progress) {
    if (action === "stop") { jamStop(); return "JAM を止めました (曲はライブラリに残っています)"; }
    if (action === "new_bank") { const st = style || "jazz ballad"; await makeBank(st, key ?? state.song.key, tempo ?? state.song.tempo, progress); return `「${st}」の手札を作りました。jam start で始められます`; }
    const st = style || "default";
    if (style && !loadBanks()[style]) { progress?.("手札を作り中…"); try { await makeBank(style, key ?? state.song.key, tempo ?? state.song.tempo, progress); } catch (e) { log(`手札の生成に失敗: ${e.message} → 既定の手札で始めます`, "err"); } }
    return await jamStart({ style: st, key, tempo, density });
  },
  async get_song_details() {
    const song = state.song; const tr = pianoTrack(); const out = [songStateText()];
    if (song.sections?.length) out.push("セクション:\n" + song.sections.map((s, i) => `${i + 1}. ${s.name} (${s.bars}小節): ${s.description ?? ""}`).join("\n"));
    if (song.chordProgression?.length) out.push("コード進行: " + song.chordProgression.map((c) => `${c.bar + 1}.${Math.floor(c.beat) + 1}:${c.chord}`).join(" "));
    if (tr.performanceNotes) out.push(`演奏メモ: ${tr.performanceNotes}`);
    const a = checkNow(); out.push(`検査: ${describeAnalysis(a)}${a.issues.length ? "\n" + a.issues.map((i) => `- ${i}`).join("\n") : ""}`);
    const ts = song.timeSig; const byBar = new Map(); for (const n of tr.notes) { const b = Math.floor(n.s / ts) + 1; byBar.set(b, (byBar.get(b) ?? 0) + 1); }
    out.push("小節ごとの音数: " + [...byBar.entries()].sort((x, y) => x[0] - y[0]).map(([b, c]) => `${b}:${c}`).join(" "));
    return out.join("\n\n");
  },
};

/* ─────────── settings / boot ─────────── */
const settingsUi = initSettings({ onLangChange: () => applyDom(), toast });
async function boot() {
  const hasSaved = loadLocal();
  if (!hasSaved || !state.song.tracks.some((x) => x.instrument === "piano")) { state.songId = lib.newId(); resetSong(pianoSong()); }
  pianoTrack();
  syncTransportFields(); emit("song"); emit("selection");
  const tr = await resolveTransport();
  $(".ai-badge").textContent = MODELS.find((m) => m.id === settings.get().model)?.label.split(" (")[0] ?? settings.get().model;
  log(`VESPER PIANO (${tr === "direct" ? "your API key" : tr === "proxy" ? "server key" : "no key"})`);
  if (state.song.tracks.some((x) => x.notes.length)) lib.saveSong(ensureSongId(), state.song).catch(() => {});
}
boot().then(async () => {
  chat = initChat(actions, { tools: PIANO_CHAT_TOOLS, system: SYSTEM_CHAT_PIANO, storageKey: "vesper:chat:v1", welcome: "曲のイメージを話しかけてください。設計図 → 両手・運指・ペダル付きのピアノ独奏 → 弾けるかの検査、まで一気に作り、▶ を押すと VESPER が弾きます。例:「雨の日の午後、静かで少し切ないピアノ曲。坂本龍一みたいに」「もっと華やかに」「最後をゆっくり」" });
  for (const [m, c] of pendingNotes) chat.note(m, c); pendingNotes.length = 0;
  if (await settingsUi.openIfNoKey()) chat.note(t("nokey"), "err");
});
