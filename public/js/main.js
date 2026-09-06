// ═══════════ BLUE GARAGE STUDIO — main ═══════════

import {
  state, on, emit, addTrack, removeTrack, selectedTrack, totalBars, totalBeats,
  INSTRUMENT_DEFS, SYNTH_INSTRUMENTS, PAN_DEFAULTS, defaultFx, defaultMaster, pushUndo, undo, redo, loadLocal, saveLocal, resetSong,
  makeTrack, uid, summarizeTrack, beatToSec, tempoAt,
} from "./state.js";
import * as audio from "./audio.js";
import { PianoRoll } from "./pianoroll.js";
import { Arrange } from "./arrange.js";
import { downloadMidi } from "./midi.js";
import { generateStructured, settings, resolveTransport, MODELS } from "./claude.js";
import { buildBlueprintRequest, buildTrackRequest, buildMixRequest, buildSynthRequest, trackScoreText, INSTRUMENTS } from "./prompts.js";
import { analyzeNotes, describeAnalysis } from "./critic.js";
import { PRESETS, presetFor, mergePatch, normalizePatch } from "./synth.js";
import * as midi from "./midiio.js";
import { t, setLang, detectLang, applyDom, getLang } from "./i18n.js";
import { initSettings } from "./settings.js";
import { initSynthPanel } from "./synthpanel.js";
import { initChat } from "./chat.js";
import { initRack } from "./rack.js";
import { initMixer } from "./mixer.js";
import * as lib from "./library.js";
import { onSave } from "./state.js";

const $ = (sel) => document.querySelector(sel);
const instLabel = (k) => (getLang() === "en" ? INSTRUMENT_DEFS[k]?.en : INSTRUMENT_DEFS[k]?.label) ?? k;

/* ─────────── toast / loader / log ─────────── */
function toast(msg, isErr = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = isErr ? "show err" : "show";
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.className = ""), 3200);
}
function showLoader(text) { $("#loader-text").textContent = text; $("#loader").classList.remove("hidden"); }
function hideLoader() { $("#loader").classList.add("hidden"); }

let chat = null;
const pendingNotes = [];
function log(msg, cls = "") {
  const time = new Date().toLocaleTimeString(getLang() === "en" ? "en-GB" : "ja-JP", { hour12: false });
  const text = `[${time}] ${msg}`;
  if (chat) chat.note(text, cls); else pendingNotes.push([text, cls]);
}

/* ─────────── language ─────────── */
setLang(detectLang(settings.get().lang));
applyDom();

/* ─────────── views ─────────── */
const proll = new PianoRoll($("#proll"), { getSnap: () => parseFloat($("#inp-snap").value) || 0 });
const arrange = new Arrange($("#arrange"));

/* ─────────── track strips ─────────── */
const fxOpen = new Set();
function renderStrips() {
  const wrap = $("#track-strips");
  wrap.innerHTML = "";
  for (const tr of state.song.tracks) {
    const strip = document.createElement("div");
    strip.className = "strip" + (tr.id === state.selectedTrackId ? " selected" : "");
    strip.style.setProperty("--tc", tr.color);
    const isSynth = SYNTH_INSTRUMENTS.has(tr.instrument);
    const fx = tr.fx;
    strip.innerHTML = `
      <div class="s-row1">
        <input class="s-name" value="${escapeHtml(tr.name)}" title="${t("strip.name")}" />
        <span class="s-notecount">${tr.notes.length}♪</span>
        <button class="s-del" title="${t("strip.del")}">✕</button>
      </div>
      <div class="s-row2">
        <select class="s-inst" title="${t("strip.inst")}">${Object.keys(INSTRUMENT_DEFS).map((k) => `<option value="${k}" ${k === tr.instrument ? "selected" : ""}>${instLabel(k)}</option>`).join("")}</select>
        <button class="mini-btn m ${tr.mute ? "on-m" : ""}" title="${t("strip.mute")}">M</button>
        <button class="mini-btn s ${tr.solo ? "on-s" : ""}" title="${t("strip.solo")}">S</button>
      </div>
      <div class="s-row3">
        <span>VOL</span><input class="s-vol" type="range" min="-40" max="6" step="0.5" value="${tr.volume}" />
        <span>PAN</span><input class="s-pan" type="range" min="-1" max="1" step="0.05" value="${tr.pan}" />
      </div>
      <div class="s-row4">
        <button class="mini-btn fx ${fxOpen.has(tr.id) ? "on-fx" : ""}" title="${t("strip.fx.t")}">${t("strip.fx")}</button>
        ${isSynth ? `<button class="mini-btn syn" title="${t("strip.synth.t")}">${t("strip.synth")}</button>` : ""}
        <button class="mini-btn mo ${tr.midiOut?.portId ? "on-mo" : ""}" title="${t("strip.midi.t")}">${t("strip.midi")}</button>
        ${isSynth ? `<span class="s-patch">${escapeHtml(audio.patchOf(tr).name)}</span>` : ""}
      </div>
      <div class="s-fx ${fxOpen.has(tr.id) ? "" : "hidden"}">
        ${[["hpf", t("fx.hpf"), 20, 400, 1], ["eqLow", t("fx.low"), -12, 6, 0.5], ["eqMid", t("fx.mid"), -12, 6, 0.5], ["eqHigh", t("fx.high"), -12, 6, 0.5], ["comp", t("fx.comp"), 0, 1, 0.02], ["hall", t("fx.hall"), 0, 1, 0.02], ["room", t("fx.room"), 0, 1, 0.02]]
          .map(([k, lb, lo, hi, st]) => `<label><span>${lb}</span><input data-fx="${k}" type="range" min="${lo}" max="${hi}" step="${st}" value="${fx[k] ?? 0}" /><em>${fmtFx(k, fx[k] ?? 0)}</em></label>`).join("")}
      </div>
      <textarea class="s-style" rows="2" placeholder="${t("strip.style.ph")}">${escapeHtml(tr.stylePrompt)}</textarea>
    `;
    strip.addEventListener("mousedown", () => {
      if (state.selectedTrackId !== tr.id) { state.selectedTrackId = tr.id; emit("selection"); renderStrips(); arrange.draw(); }
    });
    strip.querySelector(".s-name").addEventListener("change", (e) => { tr.name = e.target.value; pushUndo(); emit("tracks"); });
    strip.querySelector(".s-del").addEventListener("click", (e) => { e.stopPropagation(); if (confirm(t("confirm.deltrack", { name: tr.name }))) removeTrack(tr.id); });
    strip.querySelector(".s-inst").addEventListener("change", (e) => {
      tr.instrument = e.target.value; tr.fx = defaultFx(tr.instrument); tr.pan = PAN_DEFAULTS[tr.instrument] ?? 0; tr.color = INSTRUMENT_DEFS[tr.instrument].color;
      if (!SYNTH_INSTRUMENTS.has(tr.instrument)) tr.patch = null;
      pushUndo(); emit("tracks"); emit("notes"); audio.refreshTrack(tr);
    });
    strip.querySelector(".mini-btn.m").addEventListener("click", (e) => { e.stopPropagation(); tr.mute = !tr.mute; audio.applyMixer(); renderStrips(); arrange.draw(); });
    strip.querySelector(".mini-btn.s").addEventListener("click", (e) => { e.stopPropagation(); tr.solo = !tr.solo; audio.applyMixer(); renderStrips(); arrange.draw(); });
    strip.querySelector(".mini-btn.fx").addEventListener("click", (e) => { e.stopPropagation(); fxOpen.has(tr.id) ? fxOpen.delete(tr.id) : fxOpen.add(tr.id); renderStrips(); });
    strip.querySelector(".mini-btn.syn")?.addEventListener("click", (e) => { e.stopPropagation(); synthPanel.open(tr); });
    strip.querySelector(".mini-btn.mo").addEventListener("click", (e) => { e.stopPropagation(); openMidiOut(tr); });
    strip.querySelector(".s-vol").addEventListener("input", (e) => { tr.volume = parseFloat(e.target.value); audio.applyMixer(); });
    strip.querySelector(".s-pan").addEventListener("input", (e) => { tr.pan = parseFloat(e.target.value); audio.applyMixer(); });
    strip.querySelectorAll("[data-fx]").forEach((inp) => inp.addEventListener("input", (e) => { const k = e.target.dataset.fx; tr.fx[k] = parseFloat(e.target.value); e.target.nextElementSibling.textContent = fmtFx(k, tr.fx[k]); audio.applyMixer(); }));
    strip.querySelectorAll("input[type=range]").forEach((inp) => inp.addEventListener("change", () => pushUndo()));
    strip.querySelector(".s-style").addEventListener("change", (e) => { tr.stylePrompt = e.target.value; saveLocal(); });
    strip.querySelector(".s-style").addEventListener("mousedown", (e) => e.stopPropagation());
    wrap.appendChild(strip);
  }
}
function fmtFx(k, v) { return k === "hpf" ? `${Math.round(v)}Hz` : /^eq/.test(k) ? `${v > 0 ? "+" : ""}${v}dB` : `${Math.round(v * 100)}%`; }
function escapeHtml(s) { return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

on("tracks", renderStrips);
on("selection", () => { renderStrips(); });
on("song", () => { syncTransportFields(); renderStrips(); });

$("#btn-add-track").addEventListener("click", () => {
  addTrack({ instrument: "piano", name: `${getLang() === "en" ? "Track" : "トラック"} ${state.song.tracks.length + 1}` });
});

/* ─────────── transport ─────────── */
function syncTransportFields() {
  $("#inp-tempo").value = state.song.tempo;
  $("#inp-timesig").value = String(state.song.timeSig === 3 ? 3 : state.song.timeSig === 6 ? 6 : 4);
  $("#inp-key").value = state.song.key;
  $("#inp-master").value = state.song.master.volume;
}
$("#inp-tempo").addEventListener("change", (e) => {
  state.song.tempo = Math.max(30, Math.min(300, parseFloat(e.target.value) || 120));
  pushUndo();
  if (state.playing) { audio.stop(); audio.play(); }
});
$("#inp-timesig").addEventListener("change", (e) => { state.song.timeSig = parseInt(e.target.value, 10) || 4; pushUndo(); emit("song"); });
$("#inp-key").addEventListener("change", (e) => { state.song.key = e.target.value; pushUndo(); });

const btnPlay = $("#btn-play");
async function togglePlay() {
  if (state.playing) { audio.stop(); }
  else {
    try { await audio.play(null, (msg) => (msg ? showLoader(msg) : hideLoader())); }
    catch (err) { hideLoader(); console.error(err); toast(`${err.message}`, true); }
  }
}
btnPlay.addEventListener("click", togglePlay);
$("#btn-stop").addEventListener("click", () => audio.stop(true));
$("#btn-rew").addEventListener("click", () => audio.seek(0));
$("#btn-loop").addEventListener("click", (e) => {
  state.loop = !state.loop;
  e.currentTarget.classList.toggle("active", state.loop);
  if (state.playing) { audio.stop(); audio.play(); }
});
$("#btn-rec").addEventListener("click", async () => {
  try { await midi.initMidi(); } catch (e) { toast(e.message, true); return; }
  state.recording = !state.recording;
  $("#btn-rec").classList.toggle("active", state.recording);
  log(state.recording ? `${t("rec.on")} (${midi.inputs().map((i) => i.name).join(", ") || "-"})` : t("rec.off"), state.recording ? "gen" : "");
});

$("#btn-met").addEventListener("click", () => {
  state.metronome = !state.metronome;
  $("#btn-met").classList.toggle("active", state.metronome);
  if (state.playing) { audio.stop(); audio.play(); }
});

on("transport", () => {
  btnPlay.textContent = state.playing ? "❚❚" : "▶";
  btnPlay.classList.toggle("active", state.playing);
});
on("playhead", () => {
  const ts = state.song.timeSig;
  const bar = Math.floor(state.playheadBeat / ts) + 1;
  const beat = Math.floor(state.playheadBeat % ts) + 1;
  $("#pos-display").textContent = `${String(bar).padStart(3, "0")}.${beat}`;
  const sec = beatToSec(state.playheadBeat);
  $("#time-display").textContent = `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, "0")}${state.song.tempoMap?.length ? ` ♩=${Math.round(tempoAt(state.playheadBeat))}` : ""}`;
  if (state.playing) proll.followPlayhead();
});

$("#inp-master").addEventListener("input", (e) => audio.setMasterVolume(parseFloat(e.target.value)));

window.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.key === "Home") audio.seek(0);
  if (e.key === "r" && !e.metaKey && !e.ctrlKey) $("#btn-rec").click();
  if (e.key === "m" && !e.metaKey && !e.ctrlKey) $("#btn-met").click();
  if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.metaKey || e.ctrlKey) && (e.key === "Z" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); redo(); }
});

/* ─────────── MIDI 入力: 試聴 + 録音 ─────────── */
const held = new Map();
midi.onInput((ev) => {
  const tr = selectedTrack();
  if (!tr) return;
  if (ev.type === "on") {
    audio.previewNote(tr, ev.p, ev.v, 1.5);
    if (state.recording && state.playing) held.set(ev.p, { s: audio.currentBeat(), v: ev.v });
  } else if (ev.type === "off") {
    const h = held.get(ev.p);
    if (h) {
      held.delete(ev.p);
      const end = audio.currentBeat();
      const d = Math.max(0.05, end - h.s);
      tr.notes.push({ id: uid(), p: ev.p, s: +h.s.toFixed(3), d: +d.toFixed(3), v: h.v });
      tr.notes.sort((a, b) => a.s - b.s);
      emit("notes"); emit("tracks");
      pushUndo();
    }
  }
});

/* ─────────── humanize / quantize ─────────── */
$("#btn-humanize").addEventListener("click", () => {
  const tr = selectedTrack();
  if (!tr || !tr.notes.length) return toast(t("toast.needtrack"), true);
  for (const n of tr.notes) { if (n.s > 0.01) n.s = Math.max(0, n.s + (Math.random() - 0.5) * 0.03); n.v = Math.max(1, Math.min(127, Math.round(n.v + (Math.random() - 0.5) * 12))); }
  pushUndo(); emit("notes"); emit("tracks");
});
$("#btn-quantize").addEventListener("click", () => {
  const tr = selectedTrack();
  if (!tr || !tr.notes.length) return toast(t("toast.needtrack"), true);
  const snap = parseFloat($("#inp-snap").value) || 0.25;
  for (const n of tr.notes) n.s = Math.round(n.s / snap) * snap;
  pushUndo(); emit("notes"); emit("tracks");
});

/* ─────────── export / project ─────────── */
function exportMidi() {
  if (!state.song.tracks.some((tr) => tr.notes.length)) throw new Error(getLang() === "en" ? "No notes to export" : "書き出すノートがありません");
  downloadMidi(state.song);
  toast(t("toast.midi"));
}
$("#btn-export").addEventListener("click", () => { try { exportMidi(); } catch (e) { toast(e.message, true); } });
$("#btn-save").addEventListener("click", () => { saveLocal(); toast(t("toast.saved")); });

async function exportWav(onProgress) {
  if (!state.song.tracks.some((tr) => tr.notes.length)) throw new Error(getLang() === "en" ? "No notes to export" : "書き出すノートがありません");
  if (state.playing) audio.stop();
  const btn = $("#btn-export-wav");
  btn.disabled = true;
  try {
    await audio.ensureAudio();
    showLoader("WAV…");
    const { buffer, report } = await audio.renderSong((msg) => { $("#loader-text").textContent = msg; onProgress?.(msg); });
    const blob = audio.bufferToWav(buffer);
    const name = (state.song.title || "bluegarage").replace(/[\\/:*?"<>|]/g, "_");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    fetch(`/api/save-audio?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: blob }).catch(() => {});
    const msg = `WAV: ${name}.wav (${(blob.size / 1024 / 1024).toFixed(1)}MB) / ${report.lufs.toFixed(1)} LUFS (目標 ${state.song.master.targetLufs}, 調整 ${report.gainDb >= 0 ? "+" : ""}${report.gainDb.toFixed(1)}dB${report.limited ? ", リミッター作動" : ""}) / ピーク ${report.peakDb.toFixed(1)} dBFS / レンジ ${report.lra.toFixed(1)} LU`;
    log(msg, "ok");
    toast(t("toast.wav"));
    return msg;
  } finally {
    hideLoader();
    btn.disabled = false;
  }
}
$("#btn-export-wav").addEventListener("click", () => exportWav().catch((err) => { console.error(err); toast(`WAV: ${err.message}`, true); }));

/* ─────────── 曲のライブラリ (複数の曲をブラウザに保存) ─────────── */
const dlg = $("#dlg-menu");
let librarySaveTimer = null;
function ensureSongId() { if (!state.songId) state.songId = lib.newId(); return state.songId; }
// 自動保存: state.saveLocal() のたびにライブラリにも書く (少し間引く)
onSave(() => { clearTimeout(librarySaveTimer); librarySaveTimer = setTimeout(() => lib.saveSong(ensureSongId(), state.song).catch(() => {}), 600); });
async function listPresets() {
  try { const r = await fetch("presets/index.json", { cache: "no-cache" }); if (r.ok) return await r.json(); } catch {}
  return [];
}
async function renderLibrary() {
  const list = await lib.listSongs();
  const el = $("#lib-list");
  el.innerHTML = "";
  // 同梱のデモ曲 (配布版でも出る)
  const presets = await listPresets();
  if (presets.length) {
    const head = document.createElement("div"); head.className = "lib-head"; head.textContent = getLang() === "en" ? "Demo songs (bundled)" : "デモ曲 (同梱)"; el.appendChild(head);
    for (const p of presets) {
      const row = document.createElement("div"); row.className = "lib-row demo";
      row.innerHTML = `<div><div class="lib-title">${escapeHtml(p.title)}</div><div class="lib-meta">${p.tempo} BPM · ${escapeHtml(p.key ?? "")} · ${p.tracks} tracks · ${p.notes} notes</div></div><button class="gbtn small lib-open">${t("lib.open")}</button><span></span><span></span><span></span>`;
      row.querySelector(".lib-open").addEventListener("click", async () => { await loadDemo(p.name); dlg.close(); });
      el.appendChild(row);
    }
    const head2 = document.createElement("div"); head2.className = "lib-head"; head2.textContent = getLang() === "en" ? "My songs (this browser)" : "自分の曲 (このブラウザに保存)"; el.appendChild(head2);
  }
  if (!list.length) { const p = document.createElement("p"); p.className = "dim"; p.textContent = t("lib.empty"); el.appendChild(p); return; }
  for (const m of list) {
    const row = document.createElement("div"); row.className = "lib-row" + (m.id === state.songId ? " current" : "");
    const when = new Date(m.updatedAt ?? 0).toLocaleString(getLang() === "en" ? "en-GB" : "ja-JP");
    row.innerHTML = `<div><div class="lib-title">${escapeHtml(m.title)}${m.id === state.songId ? ` <span class="dim">(${t("lib.current")})</span>` : ""}</div><div class="lib-meta">${m.tempo ?? "-"} BPM · ${escapeHtml(m.key ?? "")} · ${m.bars} bars · ${m.tracks} tracks · ${m.notes} notes · ${when}</div></div>
      <button class="gbtn small lib-open">${t("lib.open")}</button><button class="gbtn small lib-rename">${t("lib.rename")}</button><button class="gbtn small lib-dup">${t("lib.saveas")}</button><button class="gbtn small danger lib-del">${t("lib.delete")}</button>`;
    row.querySelector(".lib-open").addEventListener("click", async () => { await openFromLibrary(m.id); dlg.close(); });
    row.querySelector(".lib-rename").addEventListener("click", async () => { const name = prompt(t("lib.prompt.name"), m.title); if (!name) return; const song = await lib.loadSong(m.id); if (!song) return; song.title = name; await lib.saveSong(m.id, song); if (m.id === state.songId) { state.song.title = name; saveLocal(); } renderLibrary(); });
    row.querySelector(".lib-dup").addEventListener("click", async () => { const song = await lib.loadSong(m.id); if (!song) return; const name = prompt(t("lib.prompt.name"), `${m.title} (copy)`); if (!name) return; const copy = JSON.parse(JSON.stringify(song)); copy.title = name; await lib.saveSong(lib.newId(), copy); renderLibrary(); });
    row.querySelector(".lib-del").addEventListener("click", async () => { if (!confirm(t("lib.confirm.delete", { name: m.title }))) return; await lib.deleteSong(m.id); if (m.id === state.songId) state.songId = null; renderLibrary(); });
    el.appendChild(row);
  }
}
async function openFromLibrary(id) {
  const song = await lib.loadSong(id);
  if (!song) throw new Error("not found");
  if (state.playing) audio.stop();
  state.songId = id;
  resetSong(song);
  toast(`「${song.title}」`);
}
async function saveAsNew(name) {
  const copy = JSON.parse(JSON.stringify(state.song));
  copy.title = name || `${state.song.title} (copy)`;
  const id = lib.newId();
  await lib.saveSong(id, copy);
  state.songId = id; state.song.title = copy.title; saveLocal(); emit("song");
  return id;
}
$("#btn-menu").addEventListener("click", async () => { await lib.saveSong(ensureSongId(), state.song).catch(() => {}); await renderLibrary(); dlg.showModal(); });
$("#btn-menu-close").addEventListener("click", () => dlg.close());
$("#btn-new-song").addEventListener("click", () => {
  if (!confirm(t("confirm.new"))) return;
  state.songId = lib.newId();
  resetSong(); addDefaultTracks(); dlg.close();
});
$("#btn-save-as").addEventListener("click", async () => { const name = prompt(t("lib.prompt.name"), `${state.song.title} (copy)`); if (!name) return; await saveAsNew(name); renderLibrary(); });
$("#btn-export-json").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ song: state.song }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${state.song.title || "project"}.bluegarage.json`;
  a.click();
  dlg.close();
});
$("#inp-import-json").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data?.song?.tracks) throw new Error("invalid format");
    state.songId = lib.newId();
    resetSong(data.song);
    toast("OK");
  } catch (err) { toast(`${err.message}`, true); }
  dlg.close();
});
$("#btn-demo").addEventListener("click", () => { loadDemo(); dlg.close(); });

/* ─────────── master / mix dialog ─────────── */
const dlgMaster = $("#dlg-master");
function fillMaster() {
  const m = state.song.master;
  $("#mx-glue").value = m.glue; $("#mx-hall").value = m.hallDecay; $("#mx-room").value = m.roomDecay; $("#mx-lufs").value = m.targetLufs; $("#mx-width").value = m.width;
  dlgMaster.querySelectorAll("input[type=range]").forEach((i) => (i.nextElementSibling.textContent = i.value));
  const ts = state.song.timeSig;
  $("#mx-tempomap").value = (state.song.tempoMap ?? []).map((p) => `${Math.floor(p.beat / ts) + 1}.${+(p.beat % ts).toFixed(2)}=${p.tempo}`).join(" ");
}
$("#btn-mixer").addEventListener("click", () => { fillMaster(); dlgMaster.showModal(); });
$("#btn-master-close").addEventListener("click", () => { pushUndo(); dlgMaster.close(); });
for (const [id, key] of [["mx-glue", "glue"], ["mx-hall", "hallDecay"], ["mx-room", "roomDecay"], ["mx-lufs", "targetLufs"], ["mx-width", "width"]]) {
  $("#" + id).addEventListener("input", (e) => { state.song.master[key] = parseFloat(e.target.value); e.target.nextElementSibling.textContent = e.target.value; });
  $("#" + id).addEventListener("change", () => audio.applyMixer());
}
$("#btn-master-reset").addEventListener("click", () => { state.song.master = { ...defaultMaster(), volume: state.song.master.volume }; fillMaster(); audio.applyMixer(); });
$("#btn-master-automix").addEventListener("click", async () => {
  const b = $("#btn-master-automix"); b.disabled = true;
  try { const r = await actions.auto_mix({}, (p) => (b.textContent = p)); log(r, "ok"); fillMaster(); }
  catch (e) { toast(e.message, true); }
  finally { b.disabled = false; b.textContent = t("mx.automix"); }
});
$("#btn-tempomap-apply").addEventListener("click", () => {
  const ts = state.song.timeSig;
  const pts = [];
  for (const tok of $("#mx-tempomap").value.trim().split(/\s+/).filter(Boolean)) {
    const m = tok.match(/^(\d+)(?:\.(\d+(?:\.\d+)?))?=(\d+(?:\.\d+)?)$/);
    if (!m) { toast(`? ${tok}`, true); return; }
    pts.push({ beat: (+m[1] - 1) * ts + (+(m[2] ?? 0)), tempo: +m[3] });
  }
  setTempoMap(pts);
  toast("OK");
});
function setTempoMap(points) {
  state.song.tempoMap = points.filter((p) => p.tempo > 0).sort((a, b) => a.beat - b.beat);
  pushUndo(); emit("song");
  if (state.playing) { audio.stop(); audio.play(); }
}

/* ─────────── MIDI out dialog ─────────── */
const dlgMidi = $("#dlg-midi");
let midiTrack = null;
async function openMidiOut(tr) {
  midiTrack = tr;
  try { await midi.initMidi(); } catch (e) { toast(e.message, true); return; }
  const sel = $("#midi-port");
  sel.innerHTML = `<option value="">${t("midi.none")}</option>` + midi.outputs().map((o) => `<option value="${o.id}" ${tr.midiOut?.portId === o.id ? "selected" : ""}>${escapeHtml(o.name)}</option>`).join("");
  $("#midi-ch").value = (tr.midiOut?.channel ?? (INSTRUMENT_DEFS[tr.instrument]?.channel ?? 0)) + 1;
  $("#midi-silent").checked = !!tr.midiOut?.silent;
  $("#midi-track-name").textContent = tr.name;
  dlgMidi.showModal();
}
$("#btn-midi-ok").addEventListener("click", () => {
  const id = $("#midi-port").value;
  const out = midi.findOutput(id);
  midiTrack.midiOut = id && out ? { portId: out.id, portName: out.name, channel: Math.max(0, Math.min(15, (+$("#midi-ch").value || 1) - 1)), silent: $("#midi-silent").checked } : null;
  pushUndo(); renderStrips(); audio.applyMixer();
  if (state.playing) { audio.stop(); audio.play(); }
  dlgMidi.close();
});
$("#btn-midi-close").addEventListener("click", () => dlgMidi.close());

/* ─────────── AI: blueprint ─────────── */
function applyBlueprint(bp, { replaceTracks = true } = {}) {
  const song = state.song;
  if (replaceTracks && song.tracks.some((x) => x.notes.length)) state.songId = lib.newId(); // 前の曲はライブラリに残す
  song.title = bp.title; song.tempo = bp.tempo; song.timeSig = bp.timeSig; song.key = bp.key; song.concept = bp.concept;
  song.sections = bp.sections; song.chordProgression = bp.chordProgression;
  song.tempoMap = (bp.tempoChanges ?? []).map((p) => ({ beat: p.bar * bp.timeSig + p.beat, tempo: p.tempo })).filter((p) => p.tempo > 0).sort((a, b) => a.beat - b.beat);
  if (replaceTracks) {
    song.tracks = [];
    for (const p of bp.trackPlan) song.tracks.push(makeTrack({ name: p.name, instrument: p.instrument, role: p.role, stylePrompt: p.stylePrompt, pan: PAN_DEFAULTS[p.instrument] ?? 0 }));
    state.selectedTrackId = song.tracks[0]?.id ?? null;
  } else {
    for (const p of bp.trackPlan) { const tr = song.tracks.find((x) => x.instrument === p.instrument && !x.stylePrompt); if (tr) { tr.stylePrompt = p.stylePrompt; tr.role = p.role; } }
  }
  pushUndo();
  emit("song"); emit("tracks"); emit("selection");
}

/* ─────────── AI: track generation (文脈 → 生成 → 検査 → 手直し) ─────────── */
const CHUNK_MAX_BARS = 24;
function planChunks(startBar, numBars) {
  if (numBars <= CHUNK_MAX_BARS) return [{ startBar, bars: numBars }];
  // セクション境界で切り、各チャンクを CHUNK_MAX_BARS 以下にする
  const bounds = [];
  let b = 0;
  for (const s of state.song.sections ?? []) { b += s.bars; if (b > startBar && b < startBar + numBars) bounds.push(b); }
  const chunks = [];
  let cur = startBar;
  const end = startBar + numBars;
  while (cur < end) {
    let next = Math.min(end, cur + CHUNK_MAX_BARS);
    const cands = bounds.filter((x) => x > cur + 4 && x <= cur + CHUNK_MAX_BARS);
    if (cands.length && next < end) next = cands[cands.length - 1];
    chunks.push({ startBar: cur, bars: next - cur });
    cur = next;
  }
  return chunks;
}
const CONTEXT_PRIORITY = ["drums", "bass", "synth-bass", "piano", "epiano", "organ", "guitar-electric", "guitar-electric-mute", "guitar-acoustic", "synth", "synth-pad", "strings", "synth-lead", "saxophone", "trumpet", "flute"];
function otherTracksContext(track, range) {
  const song = state.song;
  const others = song.tracks.filter((x) => x.id !== track.id && x.notes.length).sort((a, b) => CONTEXT_PRIORITY.indexOf(a.instrument) - CONTEXT_PRIORITY.indexOf(b.instrument));
  const TOTAL = 30000;
  const per = Math.max(2500, Math.floor(TOTAL / Math.max(1, others.length)));
  return others.map((x, i) => ({
    name: x.name, instrument: x.instrument, role: x.role, summary: summarizeTrack(x),
    score: trackScoreText(x, song, range, i < 3 ? Math.max(per, 8000) : per),
    performanceNotes: x.performanceNotes ? String(x.performanceNotes).slice(0, 400) : "",
  }));
}

async function generateTrack(track, { startBar, numBars, mode, extraDirection, onProgress }) {
  const song = state.song;
  const ts = song.timeSig;
  const chunks = planChunks(startBar, numBars);
  const songInfo = { title: song.title, tempo: song.tempo, timeSig: ts, key: song.key, concept: song.concept, sections: song.sections, chordProgression: song.chordProgression, tempoMap: song.tempoMap };
  const trackInfo = { name: track.name, instrument: track.instrument, role: track.role, stylePrompt: track.stylePrompt };
  const startBeatAll = startBar * ts, endBeatAll = (startBar + numBars) * ts;
  const kept = track.notes.filter((n) => n.s < startBeatAll - 1e-6 || n.s >= endBeatAll - 1e-6);
  let allAdded = [];
  const memos = [];
  const reports = [];
  let usage = { input: 0, output: 0 };
  let prevChunkNotes = null, prevMemo = "";

  for (const [ci, chunk] of chunks.entries()) {
    const range = { startBar: chunk.startBar, bars: chunk.bars };
    const startBeat = chunk.startBar * ts, endBeat = (chunk.startBar + chunk.bars) * ts;
    const label = chunks.length > 1 ? ` [${ci + 1}/${chunks.length}: bar ${chunk.startBar + 1}〜${chunk.startBar + chunk.bars}]` : "";
    let chunkMode = mode;
    let existingNotes;
    if (mode === "variation") existingNotes = track.notes.filter((n) => n.s >= startBeat && n.s < endBeat).map((n) => ({ p: n.p, s: +(n.s - startBeat).toFixed(3), d: n.d, v: n.v }));
    else if (mode === "continue" && ci === 0) existingNotes = track.notes.filter((n) => n.s < startBeat).slice(-200).map((n) => ({ p: n.p, s: +(n.s - startBeat).toFixed(3), d: n.d, v: n.v }));
    else if (ci > 0) { chunkMode = "continue"; existingNotes = prevChunkNotes; }

    const otherTracks = otherTracksContext(track, range);
    const req = buildTrackRequest({ song: songInfo, track: trackInfo, range, otherTracks, mode: chunkMode, existingNotes, extraDirection, previousPerformanceNotes: prevMemo });
    const prog = (stage) => (p) => onProgress?.(`${track.name}${label}: ${stage} ${p.notes ?? 0}♪ (${((p.chars ?? 0) / 1000).toFixed(1)}k)${p.retry ? ` (retry ${p.attempt})` : ""}`);
    let { data, usage: u } = await generateStructured({ ...req, onProgress: prog(t("gen.track")) });
    usage.input += u.input; usage.output += u.output;
    onProgress?.(`${track.name}${label}: ${t("gen.check")}`);
    let a = analyzeNotes(data.notes, { song, track, range });
    let memo = data.performanceNotes ?? "";
    let passes = [describeAnalysis(a)];

    // 空 → 1 回だけ作り直し
    if (a.severity === 3) {
      const req2 = buildTrackRequest({ song: songInfo, track: trackInfo, range, otherTracks, mode: chunkMode, existingNotes, previousPerformanceNotes: prevMemo, extraDirection: `${extraDirection ? extraDirection + "\n" : ""}前回の出力は notes が空だった。この範囲は必ず演奏する (休符だけにしない)。` });
      ({ data, usage: u } = await generateStructured({ ...req2, onProgress: prog(t("gen.track") + " (2)") }));
      usage.input += u.input; usage.output += u.output;
      a = analyzeNotes(data.notes, { song, track, range }); memo = data.performanceNotes ?? memo;
      passes.push(describeAnalysis(a));
    }
    // 音楽的な問題が重い → エディター役に手直しさせる (1 回)
    if (a.severity === 2 && a.stats.count > 0) {
      onProgress?.(`${track.name}${label}: ${t("gen.revise")}`);
      const req3 = buildTrackRequest({ song: songInfo, track: trackInfo, range, otherTracks, mode: "revise", issues: a.issues, previousNotes: a.notes, extraDirection });
      try {
        const r3 = await generateStructured({ ...req3, onProgress: prog(t("gen.revise")) });
        usage.input += r3.usage.input; usage.output += r3.usage.output;
        const a3 = analyzeNotes(r3.data.notes, { song, track, range });
        if (a3.stats.count > 0 && a3.severity <= a.severity && (a3.stats.clashes <= a.stats.clashes || a3.issues.length < a.issues.length)) { a = a3; memo = r3.data.performanceNotes ?? memo; passes.push(`手直し後: ${describeAnalysis(a3)}`); }
        else passes.push(`手直し案は採用せず (${describeAnalysis(a3)})`);
      } catch (e) { passes.push(`手直し失敗: ${e.message}`); }
    }

    const added = a.notes.map((n) => ({ id: uid(), p: n.p, s: +(startBeat + n.s).toFixed(4), d: n.d, v: n.v, ...(n.v2 != null ? { v2: n.v2 } : {}) }));
    allAdded = allAdded.concat(added);
    memos.push(memo);
    reports.push({ range, analysis: a, passes });
    prevChunkNotes = a.notes.slice(-200).map((n) => ({ p: n.p, s: n.s, d: n.d, v: n.v }));
    prevMemo = memo;
    // 途中経過を画面に反映
    track.notes = [...kept, ...allAdded].sort((x, y) => x.s - y.s);
    emit("notes"); emit("tracks");
  }
  track.notes = [...kept, ...allAdded].sort((x, y) => x.s - y.s);
  track.performanceNotes = memos.join(" / ");
  pushUndo();
  emit("notes"); emit("tracks");
  return { count: allAdded.length, performanceNotes: track.performanceNotes, usage, reports };
}

const GEN_ORDER = ["drums", "bass", "synth-bass", "guitar-electric", "guitar-electric-mute", "guitar-acoustic", "piano", "epiano", "organ", "synth", "synth-pad", "strings", "synth-lead", "saxophone", "trumpet", "flute"];

/* ─────────── AI: mix / sound design ─────────── */
async function autoMix(direction, progress) {
  const song = state.song;
  const tracks = song.tracks.map((x) => ({ name: x.name, instrument: x.instrument, role: x.role, summary: summarizeTrack(x), stylePrompt: x.stylePrompt, patchName: SYNTH_INSTRUMENTS.has(x.instrument) ? audio.patchOf(x).name : "" }));
  const req = buildMixRequest({ song, tracks, direction });
  const { data } = await generateStructured({ ...req, maxTokens: 8000, onProgress: (p) => progress?.(`${t("gen.mix")} ${((p.chars ?? 0) / 1000).toFixed(1)}k`) });
  const lines = [];
  for (const m of data.tracks ?? []) {
    const tr = findTrack(m.name); if (!tr) continue;
    tr.volume = clamp(m.volume, -40, 6); tr.pan = clamp(m.pan, -1, 1);
    tr.fx = { ...tr.fx, hpf: clamp(m.hpf, 20, 400), eqLow: clamp(m.eqLow, -12, 6), eqMid: clamp(m.eqMid, -12, 6), eqHigh: clamp(m.eqHigh, -12, 6), comp: clamp(m.comp, 0, 1), hall: clamp(m.hall, 0, 1), room: clamp(m.room, 0, 1) };
    lines.push(`「${tr.name}」 vol ${tr.volume}dB pan ${tr.pan} locut ${tr.fx.hpf}Hz EQ ${tr.fx.eqLow}/${tr.fx.eqMid}/${tr.fx.eqHigh} comp ${tr.fx.comp} hall ${tr.fx.hall} room ${tr.fx.room} — ${m.reason}`);
  }
  const ms = data.master ?? {};
  song.master = { ...song.master, glue: clamp(ms.glue, 0, 1), hallDecay: clamp(ms.hallDecay, 0.5, 10), roomDecay: clamp(ms.roomDecay, 0.15, 2), targetLufs: clamp(ms.targetLufs, -24, -6), width: clamp(ms.width, 0.5, 1.5) };
  pushUndo(); renderStrips(); audio.applyMixer(); arrange.draw();
  return `ミックスを適用しました (変更済み)。${data.concept}\n${lines.join("\n")}\nマスター: glue ${song.master.glue}, hall ${song.master.hallDecay}s, room ${song.master.roomDecay}s, 目標 ${song.master.targetLufs} LUFS, 幅 ${song.master.width}`;
}
async function designSound(tr, description, progress) {
  const ps = tr.notes.map((n) => n.p);
  const req = buildSynthRequest({ description, track: { name: tr.name, instrument: tr.instrument, role: tr.role, range: ps.length ? `${Math.min(...ps)}-${Math.max(...ps)}` : "" }, song: state.song, current: tr.patch });
  const { data } = await generateStructured({ ...req, maxTokens: 6000, onProgress: (p) => progress?.(`${t("gen.synth")} ${((p.chars ?? 0) / 1000).toFixed(1)}k`) });
  return normalizePatch(data);
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+x) ? +x : lo));

/* ─────────── defaults / demo ─────────── */
function addDefaultTracks() {
  const defs = [
    { instrument: "drums", name: getLang() === "en" ? "Drums" : "ドラム" },
    { instrument: "bass", name: getLang() === "en" ? "Bass" : "ベース" },
    { instrument: "guitar-electric", name: getLang() === "en" ? "Guitar" : "ギター" },
    { instrument: "piano", name: getLang() === "en" ? "Keys" : "キーボード" },
  ];
  for (const d of defs) addTrack({ ...d, pan: PAN_DEFAULTS[d.instrument] ?? 0 });
  state.selectedTrackId = state.song.tracks[0].id;
  emit("selection");
}

async function loadDemo(name = "neon-overdrive") {
  try {
    const res = await fetch(`presets/${encodeURIComponent(name)}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.songId = lib.newId();
    resetSong(data.song);
    toast(`「${data.song.title}」`);
    log(`preset「${data.song.title}」 (${data.song.tracks.reduce((a, x) => a + x.notes.length, 0)} notes)`, "ok");
  } catch (err) { toast(`demo: ${err.message}`, true); }
}

/* ─────────── チャットから使える道具 (prompts.js の CHAT_TOOLS と対応) ─────────── */
const findTrack = (name) => {
  const tracks = state.song.tracks;
  if (!name) return null;
  return tracks.find((x) => x.name === name) ?? tracks.find((x) => x.name.toLowerCase().includes(String(name).toLowerCase())) ?? tracks.find((x) => (INSTRUMENT_DEFS[x.instrument]?.label ?? "") === name || (INSTRUMENT_DEFS[x.instrument]?.en ?? "").toLowerCase() === String(name).toLowerCase()) ?? null;
};
const mustTrack = (name) => { const tr = findTrack(name); if (!tr) throw new Error(`トラック「${name}」が見つかりません。今あるトラック: ${state.song.tracks.map((x) => x.name).join(" / ")}`); return tr; };
const noteRange = (tr) => { if (!tr.notes.length) return "空"; const ps = tr.notes.map((n) => n.p); return `${tr.notes.length}ノート, 音域 MIDI ${Math.min(...ps)}-${Math.max(...ps)}`; };

function songStateText() {
  const song = state.song;
  const bars = totalBars();
  const lines = [];
  lines.push(`タイトル「${song.title || "(無題)"}」 / ${song.tempo} BPM / ${song.timeSig}/4 / キー ${song.key} / ${bars}小節 / ${state.playing ? "再生中" : "停止中"} (再生位置 bar ${Math.floor(state.playheadBeat / song.timeSig) + 1})`);
  if (song.concept) lines.push(`コンセプト: ${song.concept.slice(0, 200)}`);
  if (song.sections?.length) lines.push(`セクション: ${song.sections.map((s) => `${s.name}(${s.bars}小節)`).join(" → ")}`);
  if (song.chordProgression?.length) lines.push(`コード(先頭16個): ${song.chordProgression.slice(0, 16).map((c) => `${c.bar + 1}.${Math.floor(c.beat) + 1}:${c.chord}`).join(" ")}${song.chordProgression.length > 16 ? " …" : ""}`);
  if (song.tempoMap?.length) lines.push(`テンポ変化: ${song.tempoMap.map((p) => `bar${Math.floor(p.beat / song.timeSig) + 1}.${+(p.beat % song.timeSig).toFixed(1)}=${p.tempo}`).join(" ")}`);
  const m = song.master;
  lines.push(`マスター: 音量 ${m.volume}dB glue ${m.glue} hall ${m.hallDecay}s room ${m.roomDecay}s 目標 ${m.targetLufs}LUFS 幅 ${m.width}`);
  lines.push(`トラック (${song.tracks.length}本):`);
  song.tracks.forEach((x, i) => {
    const f = x.fx ?? {};
    lines.push(`${i + 1}. 「${x.name}」 instrument=${x.instrument} role=${x.role ?? "-"} vol=${x.volume}dB pan=${x.pan}${x.mute ? " MUTE" : ""}${x.solo ? " SOLO" : ""} | mix: locut ${f.hpf}Hz eq ${f.eqLow}/${f.eqMid}/${f.eqHigh} comp ${f.comp} hall ${f.hall} room ${f.room}${SYNTH_INSTRUMENTS.has(x.instrument) ? ` | 音色: ${audio.patchOf(x).name}` : ""}${x.midiOut?.portId ? ` | MIDI OUT: ${x.midiOut.portName} ch${x.midiOut.channel + 1}${x.midiOut.silent ? " (内蔵音源OFF)" : ""}` : ""} | ${summarizeTrack(x)}${x.stylePrompt ? ` | スタイル: ${x.stylePrompt.slice(0, 80)}${x.stylePrompt.length > 80 ? "…" : ""}` : ""}`);
  });
  if (state.selectedTrackId) { const x = song.tracks.find((y) => y.id === state.selectedTrackId); if (x) lines.push(`選択中のトラック: 「${x.name}」`); }
  lines.push(`シンセのプリセット名: ${Object.keys(PRESETS).join(", ")}`);
  return lines.join("\n");
}

const actions = {
  getSongState: songStateText,

  async create_blueprint({ prompt, tempo, key }, progress) {
    const req = buildBlueprintRequest({ prompt, tempo, key });
    const { data, usage } = await generateStructured({ ...req, maxTokens: 16000, onProgress: (p) => progress?.(`${t("gen.blueprint")} ${((p.chars ?? 0) / 1000).toFixed(1)}k`) });
    applyBlueprint(data, { replaceTracks: true });
    log(`blueprint: "${data.title}" ${data.tempo}BPM ${data.key} / ${data.sections.length} sections (${usage.output}tok)`, "ok");
    return `設計図を適用しました: 「${data.title}」 ${data.tempo}BPM ${data.timeSig}/4 ${data.key} / ${totalBars()}小節\nセクション: ${data.sections.map((s) => `${s.name}(${s.bars})`).join(" → ")}\nトラック: ${data.trackPlan.map((x) => `「${x.name}」[${x.instrument}]`).join(", ")}${data.tempoChanges?.length ? `\nテンポ変化: ${data.tempoChanges.map((p) => `bar${p.bar + 1}.${p.beat}=${p.tempo}`).join(" ")}` : ""}\nコンセプト: ${data.concept}\n(ノートはまだ空。generate_tracks で生成してください)`;
  },

  async generate_tracks({ trackNames, startBar, bars, mode = "new", direction }, progress) {
    const all = state.song.tracks;
    if (!all.length) throw new Error("トラックがありません。先に create_blueprint か add_track を");
    let targets = trackNames?.length ? trackNames.map(mustTrack) : [...all];
    targets = targets.sort((a, b) => GEN_ORDER.indexOf(a.instrument) - GEN_ORDER.indexOf(b.instrument));
    const sb = Math.max(0, (startBar ?? 1) - 1);
    const nb = Math.max(1, Math.min(96, bars ?? Math.max(1, totalBars() - sb)));
    const results = [];
    for (const [i, track] of targets.entries()) {
      state.selectedTrackId = track.id; emit("selection");
      progress?.(`(${i + 1}/${targets.length}) ${track.name}…`);
      const r = await generateTrack(track, { startBar: sb, numBars: nb, mode, extraDirection: direction, onProgress: (m) => progress?.(`(${i + 1}/${targets.length}) ${m}`) });
      const issues = r.reports.flatMap((rp) => rp.analysis.issues);
      const passes = r.reports.map((rp) => rp.passes.join(" → ")).join(" | ");
      log(`(${i + 1}/${targets.length})「${track.name}」: ${r.count}♪ (${passes})`, "ok");
      results.push(`「${track.name}」: ${r.count}ノート生成 (${noteRange(track)}) / 検査: ${passes}${issues.length ? `\n  残った指摘: ${issues.slice(0, 3).join(" / ")}` : ""}${r.performanceNotes ? `\n  演奏メモ: ${r.performanceNotes.slice(0, 300)}` : ""}`);
      // シンセ系で音色未設定 → スタイル指示から自動設計
      if (SYNTH_INSTRUMENTS.has(track.instrument) && !track.patch && (track.stylePrompt || track.role)) {
        try {
          progress?.(`(${i + 1}/${targets.length}) ${track.name}: ${t("gen.synth")}`);
          track.patch = await designSound(track, `${track.stylePrompt || ""} (役割: ${track.role || track.instrument}, 曲: ${state.song.concept || ""})`, (m) => progress?.(`(${i + 1}/${targets.length}) ${m}`));
          await audio.refreshTrack(track); renderStrips();
          results.push(`  音色「${track.patch.name}」を自動設計: ${track.patch.description}`);
        } catch (e) { results.push(`  音色の自動設計に失敗: ${e.message}`); }
      }
    }
    saveLocal();
    return `bar ${sb + 1}〜${sb + nb} を生成しました (${mode})\n${results.join("\n")}`;
  },

  async update_song({ title, tempo, key, timeSig }) {
    const song = state.song; const changed = [];
    if (title != null) { changed.push(`タイトル: ${song.title} → ${title}`); song.title = title; }
    if (tempo != null) { const v = Math.max(30, Math.min(300, +tempo)); changed.push(`テンポ: ${song.tempo} → ${v}`); song.tempo = v; }
    if (key != null) { changed.push(`キー: ${song.key} → ${key}`); song.key = key; }
    if (timeSig != null) { changed.push(`拍子: ${song.timeSig}/4 → ${timeSig}/4`); song.timeSig = +timeSig; }
    pushUndo(); syncTransportFields(); emit("song"); emit("tracks");
    if (state.playing) { audio.stop(); audio.play(); }
    return changed.length ? `変更済み: ${changed.join(", ")} (現在の値に反映済み)` : "変更なし";
  },

  async update_track({ trackName, newName, instrument, volume, pan, mute, solo, stylePrompt, role }) {
    const tr = mustTrack(trackName); const changed = [];
    if (newName != null) { changed.push(`名前: ${tr.name} → ${newName}`); tr.name = newName; }
    if (instrument != null) {
      if (!INSTRUMENT_DEFS[instrument]) throw new Error(`楽器 ${instrument} は無い。使えるのは ${INSTRUMENTS.join(", ")}`);
      changed.push(`楽器: ${tr.instrument} → ${instrument}`); tr.instrument = instrument; tr.color = INSTRUMENT_DEFS[instrument].color; tr.fx = defaultFx(instrument);
      if (!SYNTH_INSTRUMENTS.has(instrument)) tr.patch = null;
    }
    if (volume != null) { const v = Math.max(-40, Math.min(6, +volume)); changed.push(`音量: ${tr.volume}dB → ${v}dB`); tr.volume = v; }
    if (pan != null) { const v = Math.max(-1, Math.min(1, +pan)); changed.push(`パン: ${tr.pan} → ${v}`); tr.pan = v; }
    if (mute != null) { changed.push(`ミュート: ${tr.mute ? "ON" : "OFF"} → ${mute ? "ON" : "OFF"}`); tr.mute = !!mute; }
    if (solo != null) { changed.push(`ソロ: ${tr.solo ? "ON" : "OFF"} → ${solo ? "ON" : "OFF"}`); tr.solo = !!solo; }
    if (stylePrompt != null) { tr.stylePrompt = stylePrompt; changed.push("スタイル指示を更新"); }
    if (role != null) { tr.role = role; changed.push(`役割: → ${role}`); }
    pushUndo(); renderStrips(); emit("tracks"); audio.applyMixer(); arrange.draw();
    if (instrument != null) await audio.refreshTrack(tr);
    return changed.length ? `「${tr.name}」変更済み: ${changed.join(", ")} (現在の値に反映済み)` : `「${tr.name}」は変更なし`;
  },

  async add_track({ name, instrument, role, stylePrompt }) {
    if (!INSTRUMENT_DEFS[instrument]) throw new Error(`楽器 ${instrument} は無い。使えるのは ${INSTRUMENTS.join(", ")}`);
    const tr = addTrack({ name, instrument, role, stylePrompt, pan: PAN_DEFAULTS[instrument] ?? 0 });
    return `トラック「${tr?.name ?? name}」[${instrument}] を追加しました (ノートは空)`;
  },

  async remove_track({ trackName }) {
    const tr = mustTrack(trackName);
    removeTrack(tr.id);
    return `トラック「${tr.name}」を削除しました`;
  },

  async edit_notes({ trackName, action, amount, startBar, bars }) {
    const tr = mustTrack(trackName);
    const ts = state.song.timeSig;
    const b0 = startBar != null ? (startBar - 1) * ts : -Infinity;
    const b1 = bars != null ? b0 + bars * ts : Infinity;
    const inRange = (n) => n.s >= b0 && n.s < b1;
    let count = 0;
    const sorted = tr.notes.slice().sort((a, b) => a.s - b.s);
    switch (action) {
      case "transpose": for (const n of tr.notes) if (inRange(n)) { n.p = Math.max(0, Math.min(127, n.p + Math.round(amount ?? 0))); count++; } break;
      case "velocity_scale": for (const n of tr.notes) if (inRange(n)) { n.v = Math.max(1, Math.min(127, Math.round(n.v * (amount ?? 1)))); if (n.v2 != null) n.v2 = Math.max(1, Math.min(127, Math.round(n.v2 * (amount ?? 1)))); count++; } break;
      case "velocity_add": for (const n of tr.notes) if (inRange(n)) { n.v = Math.max(1, Math.min(127, Math.round(n.v + (amount ?? 0)))); count++; } break;
      case "humanize": for (const n of tr.notes) if (inRange(n)) { if (n.s > 0.01) n.s = Math.max(0, n.s + (Math.random() - 0.5) * 0.03); n.v = Math.max(1, Math.min(127, Math.round(n.v + (Math.random() - 0.5) * 12))); count++; } break;
      case "quantize": { const q = amount || 0.25; for (const n of tr.notes) if (inRange(n)) { n.s = Math.round(n.s / q) * q; count++; } break; }
      case "shift": for (const n of tr.notes) if (inRange(n)) { n.s = Math.max(0, n.s + (amount ?? 0)); count++; } break;
      case "clear": { const before = tr.notes.length; tr.notes = tr.notes.filter((n) => !inRange(n)); count = before - tr.notes.length; break; }
      case "legato": for (let i = 0; i < sorted.length; i++) { const n = sorted[i]; if (!inRange(n)) continue; const next = sorted.slice(i + 1).find((m) => m.s > n.s + 1e-6); if (next) { n.d = +Math.max(0.05, next.s - n.s - 0.01).toFixed(3); count++; } } break;
      case "staccato": for (const n of tr.notes) if (inRange(n)) { n.d = +Math.max(0.05, n.d * (amount ?? 0.5)).toFixed(3); count++; } break;
      case "swell": for (const n of tr.notes) if (inRange(n) && n.d >= 1) { n.v2 = Math.max(1, Math.min(127, Math.round(n.v * (amount ?? 1.4)))); count++; } break;
      default: throw new Error(`未対応の action: ${action}`);
    }
    tr.notes.sort((a, b) => a.s - b.s);
    pushUndo(); emit("notes"); emit("tracks");
    return `「${tr.name}」の ${count} ノートに ${action}${amount != null ? `(${amount})` : ""} を適用しました`;
  },

  async transport({ action, bar, loop }) {
    if (loop != null) { state.loop = !!loop; $("#btn-loop").classList.toggle("active", state.loop); }
    if (action === "stop") { audio.stop(); return "停止しました"; }
    if (action === "seek") { audio.seek(((bar ?? 1) - 1) * state.song.timeSig); return `bar ${bar ?? 1} に移動しました`; }
    if (action === "play") {
      if (state.playing) audio.stop();
      await audio.play(bar != null ? (bar - 1) * state.song.timeSig : null, (msg) => (msg ? showLoader(msg) : hideLoader()));
      return `bar ${bar ?? Math.floor(state.playheadBeat / state.song.timeSig) + 1} から再生を始めました`;
    }
    throw new Error(`未対応: ${action}`);
  },

  async export_file({ format }, progress) {
    if (format === "midi") { exportMidi(); return "MIDIファイルをダウンロードしました (テンポ変化・CC11 表情付き)"; }
    if (format === "wav") return await exportWav(progress);
    if (format === "json") { $("#btn-export-json").click(); return "プロジェクトJSONをダウンロードしました"; }
    throw new Error(`未対応の形式: ${format}`);
  },

  async project({ action, name }) {
    if (action === "save") { saveLocal(); return "ブラウザに保存しました"; }
    if (action === "new") { resetSong(); addDefaultTracks(); return "新規プロジェクトにしました (ドラム/ベース/ギター/キーボードの空トラック)"; }
    if (action === "list_presets") { const list = await listPresets(); return list.length ? "同梱のデモ曲 (load_preset の name):\n" + list.map((p) => `- ${p.name}: 「${p.title}」 ${p.tempo}BPM ${p.tracks}トラック ${p.notes}音`).join("\n") : "デモ曲はありません"; }
    if (action === "load_preset") { await loadDemo(name || "neon-overdrive"); return `プリセット ${name || "neon-overdrive"} を読み込みました: 「${state.song.title}」`; }
    if (action === "list") { const list = await lib.listSongs(); return list.length ? "保存されている曲:\n" + list.map((m) => `- 「${m.title}」 ${m.tempo}BPM ${m.key} ${m.bars}小節 ${m.tracks}トラック ${m.notes}音${m.id === state.songId ? " (開いている曲)" : ""}`).join("\n") : "保存された曲はまだありません"; }
    if (action === "open") { const m = await lib.findByTitle(name); if (!m) throw new Error(`「${name}」という曲は無い。project list で一覧を見て`); await openFromLibrary(m.id); return `「${state.song.title}」を開きました`; }
    if (action === "save_as") { await saveAsNew(name); return `「${state.song.title}」として別の曲で保存しました (以後はこちらが開いている曲)`; }
    if (action === "rename") { if (!name) throw new Error("name が必要"); const before = state.song.title; state.song.title = name; pushUndo(); emit("song"); return `曲名: ${before} → ${name} (変更済み)`; }
    if (action === "delete") { const m = await lib.findByTitle(name); if (!m) throw new Error(`「${name}」という曲は無い`); if (m.id === state.songId) throw new Error("開いている曲は消せません。別の曲を開いてから"); await lib.deleteSong(m.id); return `「${m.title}」を削除しました`; }
    if (action === "save_preset") {
      const safe = (name || state.song.title || "song").replace(/[^a-z0-9\-_]/gi, "-").slice(0, 60);
      const res = await fetch("/api/save-preset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: safe, song: state.song }) });
      if (!res.ok) throw new Error("プリセット保存はローカルサーバーでだけ使えます。代わりに export_file json を使ってください");
      const r = await res.json();
      return `プリセットとして保存しました: ${r.file} (URL: /?preset=${safe})`;
    }
    throw new Error(`未対応: ${action}`);
  },

  async get_song_details({ trackName }) {
    const song = state.song; const out = [songStateText()];
    if (song.sections?.length) out.push("セクション詳細:\n" + song.sections.map((s, i) => `${i + 1}. ${s.name} (${s.bars}小節): ${s.description ?? ""}`).join("\n"));
    if (song.chordProgression?.length) out.push("コード進行: " + song.chordProgression.map((c) => `${c.bar + 1}.${Math.floor(c.beat) + 1}:${c.chord}`).join(" "));
    for (const x of song.tracks) if (x.stylePrompt || x.performanceNotes) out.push(`「${x.name}」スタイル指示: ${x.stylePrompt}${x.performanceNotes ? `\n  演奏メモ: ${x.performanceNotes}` : ""}`);
    if (trackName) {
      const x = mustTrack(trackName);
      const ts = song.timeSig;
      const byBar = new Map();
      for (const n of x.notes) { const b = Math.floor(n.s / ts) + 1; byBar.set(b, (byBar.get(b) ?? 0) + 1); }
      out.push(`「${x.name}」小節ごとのノート数: ` + [...byBar.entries()].sort((a, b) => a[0] - b[0]).map(([b, c]) => `${b}:${c}`).join(" "));
      out.push(`先頭40ノート: ` + x.notes.slice(0, 40).map((n) => `p${n.p}@${n.s.toFixed(2)}x${n.d.toFixed(2)}v${n.v}${n.v2 != null ? `→${n.v2}` : ""}`).join(" "));
      if (SYNTH_INSTRUMENTS.has(x.instrument)) out.push(`音色 JSON: ${JSON.stringify(audio.patchOf(x))}`);
      const a = analyzeNotes(x.notes.map((n) => ({ ...n })), { song, track: x, range: { startBar: 0, bars: totalBars() } });
      out.push(`検査: ${describeAnalysis(a)}${a.issues.length ? "\n" + a.issues.map((i) => `- ${i}`).join("\n") : ""}`);
    }
    return out.join("\n\n");
  },

  async auto_mix({ direction }, progress) { return autoMix(direction, progress); },

  async set_mix({ trackName, hpf, eqLow, eqMid, eqHigh, comp, hall, room }) {
    const tr = mustTrack(trackName); const changed = [];
    const set = (k, v, lo, hi) => { if (v != null) { const nv = clamp(v, lo, hi); changed.push(`${k}: ${tr.fx[k]} → ${nv}`); tr.fx[k] = nv; } };
    set("hpf", hpf, 20, 400); set("eqLow", eqLow, -12, 6); set("eqMid", eqMid, -12, 6); set("eqHigh", eqHigh, -12, 6); set("comp", comp, 0, 1); set("hall", hall, 0, 1); set("room", room, 0, 1);
    pushUndo(); renderStrips(); audio.applyMixer();
    return changed.length ? `「${tr.name}」ミックス変更済み: ${changed.join(", ")}` : "変更なし";
  },

  async set_master({ glue, hallDecay, roomDecay, targetLufs, width, volume }) {
    const m = state.song.master; const changed = [];
    const set = (k, v, lo, hi) => { if (v != null) { const nv = clamp(v, lo, hi); changed.push(`${k}: ${m[k]} → ${nv}`); m[k] = nv; } };
    set("glue", glue, 0, 1); set("hallDecay", hallDecay, 0.5, 10); set("roomDecay", roomDecay, 0.15, 2); set("targetLufs", targetLufs, -24, -6); set("width", width, 0.5, 1.5); set("volume", volume, -40, 6);
    pushUndo(); syncTransportFields(); audio.applyMixer();
    return changed.length ? `マスター変更済み: ${changed.join(", ")}` : "変更なし";
  },

  async design_sound({ trackName, description }, progress) {
    const tr = mustTrack(trackName);
    if (!SYNTH_INSTRUMENTS.has(tr.instrument)) { tr.instrument = "synth"; tr.fx = defaultFx("synth"); tr.color = INSTRUMENT_DEFS.synth.color; }
    tr.patch = await designSound(tr, description, progress);
    pushUndo(); await audio.refreshTrack(tr); renderStrips(); synthPanel.refresh();
    return `「${tr.name}」の音色を設計して適用しました (変更済み): 「${tr.patch.name}」 — ${tr.patch.description}\n${JSON.stringify(tr.patch)}`;
  },

  async set_synth({ trackName, preset, patch }) {
    const tr = mustTrack(trackName);
    if (!SYNTH_INSTRUMENTS.has(tr.instrument)) { tr.instrument = "synth"; tr.fx = defaultFx("synth"); tr.color = INSTRUMENT_DEFS.synth.color; }
    if (preset) { const key = Object.keys(PRESETS).find((k) => k.toLowerCase() === String(preset).toLowerCase()) ?? Object.keys(PRESETS).find((k) => k.toLowerCase().includes(String(preset).toLowerCase())); if (!key) throw new Error(`プリセット ${preset} は無い。あるのは ${Object.keys(PRESETS).join(", ")}`); tr.patch = normalizePatch(PRESETS[key]); }
    if (patch && typeof patch === "object") tr.patch = mergePatch(audio.patchOf(tr), patch);
    pushUndo(); await audio.refreshTrack(tr); renderStrips(); synthPanel.refresh();
    return `「${tr.name}」の音色を変更済み: 「${tr.patch.name}」 ${JSON.stringify(tr.patch)}`;
  },

  async set_tempo_map({ points }) {
    const ts = state.song.timeSig;
    setTempoMap((points ?? []).map((p) => ({ beat: Math.max(0, (p.bar - 1)) * ts + (p.beat ?? 0), tempo: +p.tempo })));
    return state.song.tempoMap.length ? `テンポ変化を設定しました (変更済み): ${state.song.tempoMap.map((p) => `bar${Math.floor(p.beat / ts) + 1}.${+(p.beat % ts).toFixed(1)}=${p.tempo}`).join(" ")}` : "テンポ変化を消して一定テンポにしました";
  },

  async midi_out({ trackName, port, channel, silent }) {
    const tr = mustTrack(trackName);
    try { await midi.initMidi(); } catch (e) { throw new Error(`Web MIDI が使えません: ${e.message}`); }
    const outs = midi.outputs();
    if (!port || port === "list") return outs.length ? `使える MIDI 出力ポート: ${outs.map((o) => o.name).join(" / ")}\n入力: ${midi.inputs().map((o) => o.name).join(" / ") || "なし"}${tr.midiOut ? `\n「${tr.name}」の現在: ${tr.midiOut.portName} ch${tr.midiOut.channel + 1}` : ""}` : "MIDI 出力ポートが見つかりません (macOS は Audio MIDI 設定で IAC ドライバを有効に、Windows は loopMIDI 等)";
    if (port === "" || port === "none" || port === "off") { tr.midiOut = null; pushUndo(); renderStrips(); audio.applyMixer(); return `「${tr.name}」の MIDI 出力を解除しました`; }
    const out = midi.findOutput(port);
    if (!out) throw new Error(`ポート「${port}」が無い。あるのは ${outs.map((o) => o.name).join(" / ")}`);
    tr.midiOut = { portId: out.id, portName: out.name, channel: Math.max(0, Math.min(15, ((channel ?? (tr.midiOut?.channel ?? 0) + 1) | 0) - 1)), silent: silent ?? tr.midiOut?.silent ?? false };
    pushUndo(); renderStrips(); audio.applyMixer();
    if (state.playing) { audio.stop(); audio.play(); }
    return `「${tr.name}」を ${out.name} ch${tr.midiOut.channel + 1} に送ります (変更済み)${tr.midiOut.silent ? "。内蔵音源は鳴らしません" : ""}`;
  },
};

/* ─────────── view tabs (PIANO ROLL / RACK / MIXER) ─────────── */
const rack = initRack({ onDesign: (tr, desc, prog) => designSound(tr, desc, prog), log });
const mixer = initMixer();
const VIEWS = { proll: $("#proll-wrap"), rack: $("#rack"), mixer: $("#mixer") };
function showView(name) {
  for (const [k, el] of Object.entries(VIEWS)) el.classList.toggle("view-active", k === name);
  document.querySelectorAll(".vtab").forEach((b) => b.classList.toggle("on", b.dataset.view === name));
  $("#proll-hint").style.visibility = name === "proll" ? "visible" : "hidden";
  if (name === "proll") proll.resize();
  if (name === "rack") rack.show();
  if (name === "mixer") mixer.show();
  try { localStorage.setItem("bluegarage:view", name); } catch {}
}
document.querySelectorAll(".vtab").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

/* ─────────── panels ─────────── */
const synthPanel = initSynthPanel({ onDesign: (tr, desc) => designSound(tr, desc, (m) => ($("#btn-synth-ai").textContent = m)).finally(() => ($("#btn-synth-ai").textContent = t("syn.ai.go"))), log });
const settingsUi = initSettings({ onLangChange: () => { applyDom(); renderStrips(); proll.draw(); }, toast });

/* ─────────── boot ─────────── */
async function boot() {
  const hasSaved = loadLocal();
  const hasNotes = state.song.tracks.some((x) => x.notes.length);
  syncTransportFields();
  renderStrips();
  emit("song"); emit("selection");
  const tr = await resolveTransport();
  $(".ai-badge").textContent = MODELS.find((m) => m.id === settings.get().model)?.label.split(" (")[0] ?? settings.get().model;
  log(`BLUE GARAGE STUDIO v2 (${tr === "direct" ? "your API key" : tr === "proxy" ? "server key" : "no key"})`);
  try { const v = localStorage.getItem("bluegarage:view"); if (v && VIEWS[v] && v !== "proll") showView(v); } catch {}
  // 開いている曲をライブラリに登録 (初回はここで ID が付く)
  if (state.song.tracks.some((x) => x.notes.length)) lib.saveSong(ensureSongId(), state.song).catch(() => {});
  const presetParam = new URLSearchParams(location.search).get("preset");
  if (presetParam) { await loadDemo(presetParam); return; }
  if (!hasNotes) {
    await loadDemo();
    if (!hasSaved && !state.song.tracks.length) addDefaultTracks();
  }
}
boot().then(async () => {
  chat = initChat(actions);
  for (const [m, c] of pendingNotes) chat.note(m, c);
  pendingNotes.length = 0;
  if (await settingsUi.openIfNoKey()) chat.note(t("nokey"), "err");
});
