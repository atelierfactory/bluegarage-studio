// ═══════════ VESPER BAND — main ═══════════
// 左: 右手のシンセのピアノロール + 下にレーン (ドラム / キック / 足鍵盤 / つまみ) + お題バー。右: VESPER-01 が 1 人で演奏する 3D 舞台。
// 作曲: 設計図 → 2 つの音色 (右手 / 足鍵盤) → 8 小節ずつ 4 本のレーン + つまみ操作 → 体で弾けるかの検査 → 手直し。
// 曲のデータ: tracks = [keys (synth, 右手, notes に f, knobs につまみ操作), pedal (synth-bass, 右足), drums (左手 + 左足 (p=36))]

import {
  state, on, emit, selectedTrack, totalBars, pushUndo, undo, redo, loadLocal, saveLocal, resetSong, onSave,
  makeTrack, uid, beatToSec, tempoAt, defaultSong, totalBeats, configureProjectStorage } from "../js/state.js";
import * as audio from "../js/audio.js";
import { PianoRoll, THEME } from "../js/pianoroll.js";
import { downloadMidi } from "../js/midi.js";
import { generateStructured, settings, resolveTransport, relaySeat, MODELS } from "../js/claude.js";
import { t, setLang, detectLang, applyDom } from "../js/i18n.js";
import { initSettings } from "../js/settings.js";
import * as lib from "../js/library.js";
lib.configureLibrary("vesper-band");
configureProjectStorage("vesper-band.project.v1");
import { BandStage } from "./scene.js";
import { Lanes } from "./lanes.js";
import { SignalHistory, shotSignals } from "./signal.js";
const signalHistory=new SignalHistory();let lastSignalTime=0,shotRevision=0;
import { BAND_DRUM_SAMPLE_GAINS } from "../js/drum-balance.js";
import { buildBandRequest, buildBandBlueprintRequest, buildBandSoundsRequest, DRUM_KEYS, KEY_OF_DRUM, KICK } from "./prompts.js";
import { analyzeBand, describeBand } from "./critic.js";
import { validateBandSong, partsFromSong } from "./model.js";
import { normalizePatch2, knobDefaults, SYNTH2_PRESETS, SYNTH2_DEFAULT_BY_INSTRUMENT, KNOBS } from "../js/synth2.js";

const $ = (s) => document.querySelector(s);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+x) ? +x : lo));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

Object.assign(THEME, {
  rowBlack: "#070707", rowWhite: "#0b0b0b", rowLineC: "#2a2a2a", rowLine: "#151515", gridBar: "#3a3a3a", gridBeat: "#1c1c1c", gridSub: "#121212",
  rulerBg: "#0a0a0a", rulerText: "#9a9a9a", chord: "#cfcfcf", rulerLine: "#3a3a3a",
  keyBlack: "#111", keyWhite: "#ececec", keyLabelOnBlack: "#fff", keyLabelOnWhite: "#000",
  playhead: "#e0b95a", hint: "#8a8a8a", hint2: "#4a4a4a",
  handL: "#8c8c8c", handR: "#f2f2f2", fingerText: "rgba(0,0,0,.85)",
  pedal: "rgba(120,120,120,.30)", pedalEdge: "rgba(200,200,200,.8)", pedalText: "rgba(0,0,0,0)",
  boxFill: "rgba(255,255,255,.08)", boxStroke: "rgba(255,255,255,.6)", selected: "#e0b95a", lit: "#e0b95a",
});

function toast(msg, isErr = false) { const el = $("#toast"); el.textContent = msg; el.className = isErr ? "show err" : "show"; clearTimeout(el._t); el._t = setTimeout(() => (el.className = ""), 3200); }
function showLoader(text) { $("#loader-text").textContent = text; $("#loader").classList.remove("hidden"); }
function hideLoader() { $("#loader").classList.add("hidden"); }
function status(msg, cls = "") { $("#status-text").innerHTML = `<span class="${cls}">${esc(msg)}</span>`; }
function progress(msg) { $("#status-text").innerHTML = `<span class="lit">${esc(msg)}</span>`; }
setLang(detectLang(settings.get().lang)); applyDom();

/* ─────────── song model ─────────── */
function bandSong() {
  const s = defaultSong();
  s.title = "無題"; s.tempo = 120; s.key = "A minor";
  s.sections = [{ name: "A", bars: 8, description: "" }];
  const keys = makeTrack({ name: "Synth (右手)", instrument: "synth", role: "keys", pan: 0.1, volume: -6 });
  const pick = (inst, re) => SYNTH2_PRESETS[SYNTH2_DEFAULT_BY_INSTRUMENT[inst]] ?? Object.values(SYNTH2_PRESETS).find((p) => re.test(p.name + " " + p.description)) ?? Object.values(SYNTH2_PRESETS)[0];
  keys.synth2 = normalizePatch2(pick("synth", /pluck|lead|stab/i)); keys.knobs = [];
  const pedal = makeTrack({ name: "Bass Pedal (右足)", instrument: "synth-bass", role: "pedal", pan: 0, volume: -5 });
  pedal.synth2 = normalizePatch2(pick("synth-bass", /bass|ベース/i));
  const drums = makeTrack({ name: "Drums (左手 + 左足)", instrument: "drums", role: "drums", pan: 0, volume: -4 });
  drums.drumSampleGains={...BAND_DRUM_SAMPLE_GAINS};
  s.tracks = [keys, pedal, drums];
  s.master.hallDecay = 2.0; s.master.roomDecay = 0.5;
  return s;
}
function trackByRole(role) { return state.song.tracks.find((x) => x.role === role); }
function keysTrack() { let tr = trackByRole("keys"); if (!tr) { tr = bandSong().tracks[0]; state.song.tracks.unshift(tr); } state.selectedTrackId = tr.id; return tr; }
function pedalTrack() { let tr = trackByRole("pedal"); if (!tr) { tr = bandSong().tracks[1]; state.song.tracks.push(tr); } return tr; }
function drumTrack() { let tr = trackByRole("drums"); if (!tr) { tr = bandSong().tracks[2]; state.song.tracks.push(tr); } return tr; }
function ensureTracks() { const k = keysTrack(); k.knobs ??= []; k.synth2 ??= bandSong().tracks[0].synth2; const p = pedalTrack(); p.synth2 ??= bandSong().tracks[1].synth2; drumTrack().drumSampleGains ??= {...BAND_DRUM_SAMPLE_GAINS}; state.selectedTrackId = k.id; return k; }
function parts() { ensureTracks(); return partsFromSong(state.song); }
function setTitleUi() { $("#proll-title").textContent = state.song.title || "—"; $("#stage-title").textContent = state.song.title || ""; const k = trackByRole("keys"); $("#proll-sub").textContent = k?.synth2 ? `右手: ${k.synth2.name} · 足鍵盤: ${trackByRole("pedal")?.synth2?.name ?? ""}` : ""; }
function pushStage() { signalHistory.reset();shotRevision++;stage.setSignal(); const p = parts(); stage.setSong(p, knobDefaults(keysTrack().synth2), keysTrack().synth2.name); }

/* ─────────── views ─────────── */
const proll = new PianoRoll($("#proll"), { getSnap: () => parseFloat($("#inp-snap").value) || 0, editable: false });
proll.scrollY = 84;
const stage = new BandStage($("#stage-canvas"));
const lanes = new Lanes($("#lanes"), proll, parts);
lanes.onSeek = (b) => { proll.resetFollow(); audio.seek(b); };
window.vesperStage = stage; window.vesperRoll = proll;
on("notes", () => { ensureTracks(); pushStage(); lanes.draw(); });
on("song", () => { syncTransportFields(); setTitleUi(); ensureTracks(); pushStage(); lanes.draw(); });
{ const d = document.createElement("div"); d.className = "divider"; $("#stage").appendChild(d); }
let lastFrame = performance.now(), frozenShot = false,lastSignalBeat=-1;
let bootShotPending=new URLSearchParams(location.search).has("shot");
window.bandShotStatus={state:"idle"};
function frame(now) {
  requestAnimationFrame(frame);
  if(bootShotPending)return;
  const cw = stage.canvas.clientWidth, ch = stage.canvas.clientHeight;
  if (cw > 0 && ch > 0 && (Math.abs(cw - stage.w) > 1 || Math.abs(ch - stage.h) > 1)) stage._resize();
  const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
  if(frozenShot){
    if(window.bandShotStatus.state==="ready"&&stage.needsRender)stage.render();
    return;
  }
  const beat = audio.currentBeat();
  if (!frozenShot) stage.update(beat, (b) => beatToSec(b), dt, state.playing);
  if(!frozenShot&&state.playing&&now-lastSignalTime>=50){if(beat<lastSignalBeat||beat-lastSignalBeat>1)signalHistory.reset();lastSignalBeat=beat;lastSignalTime=now;stage.setSignal(signalHistory.update(audio.sampleSynthSignal(keysTrack().id),stage.arChanges));}
  stage.render();
  const ts = state.song.timeSig;
  $("#stage-info").textContent = state.playing ? `bar ${Math.floor(beat / ts) + 1} · ♩=${Math.round(tempoAt(beat))}` : "";
}
requestAnimationFrame(frame);
document.querySelectorAll(".vbtn[data-view]").forEach((b) => b.addEventListener("click", () => { stage.setView(b.dataset.view); document.querySelectorAll(".vbtn[data-view]").forEach((x) => x.classList.toggle("on", x === b)); }));
document.querySelectorAll(".cbtn[data-close]").forEach((b) => b.addEventListener("click", () => { stage.setClose(b.dataset.close); document.querySelectorAll(".cbtn[data-close]").forEach((x) => x.classList.toggle("on", x === b)); }));
function setFullscreen(on) { document.body.classList.toggle("stage-full", on); stage.setLayout(on && innerWidth > 700 ? "side" : "stack"); $("#btn-fullscreen").classList.toggle("on", on); }
$("#btn-fullscreen").addEventListener("click", () => setFullscreen(!document.body.classList.contains("stage-full")));
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("stage-full")) setFullscreen(false); });

/* ─────────── transport ─────────── */
function syncTransportFields() { $("#inp-tempo").value = state.song.tempo; $("#inp-key").value = state.song.key; $("#inp-master").value = state.song.master.volume; }
$("#inp-tempo").addEventListener("change", (e) => {
  const tempo=clamp(e.target.value,30,300), ratio=tempo/state.song.tempo;
  const candidate={...state.song,tempo,tempoMap:(state.song.tempoMap??[]).map(p=>({...p,tempo:p.tempo*ratio}))};
  const a=analyzeBand(parts(),{song:candidate,range:{startBar:0,bars:totalBars()}});
  if(a.stats.fixes.length||a.issues.length){e.target.value=state.song.tempo;toast("この速さでは手足が間に合いません",true);return;}
  const was=state.playing; audio.stop(); state.song.tempo=tempo;state.song.tempoMap=candidate.tempoMap;
  pushUndo();emit("song");if(was) play();
});
$("#inp-master").addEventListener("input", (e) => { audio.setMasterVolume(parseFloat(e.target.value)); saveLocal(); });
const btnPlay = $("#btn-play");
async function play(fromBeat = null) {
  bootShotPending=false;window.bandShotStatus={state:"idle"};delete document.body.dataset.bandShot;shotRevision++;signalHistory.reset();stage.setSignal();frozenShot=false; stage.shotCamera=null; document.body.classList.remove("band-shot");
  ensureTracks();
  try { await audio.play(fromBeat, (m) => (m ? showLoader(m) : hideLoader())); }
  catch (err) { hideLoader(); console.error(err); toast(err.message, true); }
}
let loadingPlay=false;
async function togglePlay() { if(running) return; if (state.playing || loadingPlay) { audio.stop(); hideLoader(); return; } loadingPlay=true; try { await play(); } finally {loadingPlay=false;} }
on("audio-error", (error)=>{hideLoader();toast(error.message,true);});
btnPlay.addEventListener("click", togglePlay);
$("#btn-stop").addEventListener("click", () => { audio.stop(true);hideLoader(); });
$("#btn-load-cancel").addEventListener("click",()=>{audio.stop();hideLoader();});
$("#btn-rew").addEventListener("click", () => { proll.resetFollow(); audio.seek(0); });
$("#btn-loop").addEventListener("click", (e) => { state.loop = !state.loop; e.currentTarget.classList.toggle("active", state.loop); if (state.playing) { audio.stop(); play(); } });
$("#btn-met").addEventListener("click", () => { state.metronome = !state.metronome; $("#btn-met").classList.toggle("active", state.metronome); if (state.playing) { audio.stop(); play(); } });
on("transport", () => { if (state.playing) proll.resetFollow(); btnPlay.textContent = state.playing ? "❚❚" : "▶"; btnPlay.classList.toggle("active", state.playing); });
function songEndBeat() { let end = totalBeats(); for (const tr of state.song.tracks) for (const n of tr.notes) end = Math.max(end, n.s + n.d); return end; }
function updateLcd() {
  const ts = state.song.timeSig; const bar = Math.floor(state.playheadBeat / ts) + 1; const beat = Math.floor(state.playheadBeat % ts) + 1;
  $("#pos-display").textContent = `${String(bar).padStart(3, "0")}.${beat}`;
  const sec = beatToSec(state.playheadBeat), total = beatToSec(songEndBeat());
  const mmss = (x, frac) => `${Math.floor(x / 60)}:${frac ? (x % 60).toFixed(1).padStart(4, "0") : String(Math.floor(x % 60)).padStart(2, "0")}`;
  $("#time-display").textContent = `${mmss(sec, true)} / ${mmss(total, false)}`;
  if (state.playing) proll.followPlayhead();
}
on("playhead", updateLcd); on("song", updateLcd); on("notes", updateLcd);
window.addEventListener("keydown", (e) => {
  if (running || e.target.matches("input, textarea, select, button") || document.querySelector("dialog[open]")) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); return; }
  if (e.key === "Home") { proll.resetFollow(); audio.seek(0); }
  if (e.key === "m" && !e.metaKey && !e.ctrlKey) $("#btn-met").click();
  if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); audio.stop(); undo(); }
  if ((e.metaKey || e.ctrlKey) && (e.key === "Z" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); audio.stop(); redo(); }
});

/* ─────────── export / import ─────────── */
$("#btn-export").addEventListener("click", () => { try { if (!keysTrack().notes.length && !drumTrack().notes.length) throw new Error("音符がありません"); downloadMidi(state.song); toast("MIDI を書き出しました"); } catch (e) { toast(e.message, true); } });
$("#btn-export-json").addEventListener("click", () => { const blob = new Blob([JSON.stringify({ song: state.song }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${state.song.title || "band"}.band.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); $("#dlg-songs").close(); });
function installSong(song, id = lib.newId(), {validate=true}={}) {
  if(validate) { const errors=validateBandSong(song); if(errors.length) throw new Error(`この曲は読み込めません: ${errors.slice(0,3).join(" / ")}`); }
  clearTimeout(libTimer);
  if(saveable()) lib.saveSong(ensureSongId(),structuredClone(state.song)).catch(()=>{});
  if(window.bandShotStatus.state==="measuring")bootShotPending=false;
  window.bandShotStatus={state:"idle"};delete document.body.dataset.bandShot;
  audio.releaseSongEngines(); frozenShot=false;stage.shotCamera=null;document.body.classList.remove("band-shot");
  state.songId=id; resetSong(song);ensureTracks();emit("selection");audio.seek(0);proll.resetFollow();
}
$("#inp-import-json").addEventListener("change", async (e) => {
  const f=e.target.files[0];if(!f||running)return;const revision=++openRevision;
  try { if(f.size>8*1024*1024)throw new Error("曲のファイルが大きすぎます");const data=JSON.parse(await f.text());if(running||revision!==openRevision)return;
    const errors=validateBandSong(data.song);if(errors.length)throw new Error(errors.slice(0,3).join(" / "));
    const a=analyzeBand(partsFromSong(data.song),{song:data.song,range:{startBar:0,bars:data.song.sections.reduce((n,s)=>n+s.bars,0)}});
    if(a.stats.fixes.length||a.issues.length)throw new Error(`手足が届かない部分があります: ${[...a.stats.fixes,...a.issues].slice(0,2).join(" / ")}`);
    ++openRevision;data.song.kind="imported";installSong(data.song);toast("曲を読み込みました");dlg.close();
  } catch(error) {toast(error.message,true);} finally {e.target.value="";}
});

/* ─────────── 同梱の曲 / 作った曲 ─────────── */
let repertoireCache = null, openRevision=0;
async function listRepertoire() {
  if(repertoireCache)return repertoireCache;
  const r=await fetch("repertoire/index.json",{cache:"no-cache"});if(!r.ok)throw new Error("曲目を読めません");
  const list=await r.json();if(!Array.isArray(list))throw new Error("曲目の形式が違います");
  repertoireCache=list;return list;
}
async function openRepertoire(item) {
  if(running)throw new Error("作曲中です");
  if(!/^[a-z0-9-]+\.band\.json$/.test(item.file))throw new Error("曲の名前が不正です");
  const revision=++openRevision;
  const r=await fetch(`repertoire/${item.file}`,{cache:"no-cache"});if(!r.ok)throw new Error("曲のデータが読めません");
  const data=await r.json();if(revision!==openRevision)return "読み込みを切り替えました";
  if(!data.song)throw new Error("曲がありません");data.song.kind="repertoire";installSong(data.song);
  return `「${data.song.title}」(${totalBars()} 小節、${item.composer??""})`;
}

const dlg = $("#dlg-songs");
let libTimer = null;
function ensureSongId() { if (!state.songId) state.songId = lib.newId(); return state.songId; }
const SAVE_KINDS = new Set(["composed", "imported", "draft"]);
function saveable() { return SAVE_KINDS.has(state.song.kind) && Array.isArray(state.song.tracks) && state.song.tracks.some((x) => Array.isArray(x?.notes) && x.notes.length); }
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
  head("同梱の曲 (このアプリで作ったオリジナル曲)");
  const rep = await listRepertoire();
  if (!rep.length) { const p = document.createElement("p"); p.className = "dim"; p.textContent = "まだありません"; el.appendChild(p); }
  for (const it of rep) el.appendChild(row(it.title, `${it.composer ?? it.by ?? ""} · ${it.tempo ?? ""} BPM · ${it.bars ?? ""} 小節 · ${it.note ?? ""} · ${it.license ?? ""}`, "選択", async () => { try { status(await openRepertoire(it) + "。▶ で再生", "lit"); dlg.close(); audio.seek(0); } catch (err) { toast(err.message, true); } }));
  const all = await lib.listSongs().catch(()=>{toast("保存した曲を読めません。保存場所の空きを確かめてください",true);return [];});
  head("作った曲 (作曲したもの)");
  if (!all.length) { const p = document.createElement("p"); p.className = "dim"; p.textContent = "まだありません。「作曲」で作った曲がここに残ります。"; el.appendChild(p); }
  for (const m of all) {
    el.appendChild(row(`${m.title}${m.id === state.songId ? " (開いている曲)" : ""}`, `${m.tempo ?? "-"} BPM · ${m.key ?? ""} · ${m.bars} 小節 · ${new Date(m.updatedAt ?? 0).toLocaleString()}`, "選択",
      async () => { try { await openFromLibrary(m.id); dlg.close(); status(`「${state.song.title}」を選びました。▶ で再生`, "lit"); } catch(e) { toast(e.message,true); } },
      [["名前", async () => { const name = prompt("曲の名前", m.title); if (!name) return; const song = await lib.loadSong(m.id); if (!song) return; song.title = name; await lib.saveSong(m.id, song); if (m.id === state.songId) { state.song.title = name; setTitleUi(); saveLocal(); } renderSongs(); }],
       ["削除", async () => { if (!confirm(`「${m.title}」を消しますか?`)) return; await lib.deleteSong(m.id); if (m.id === state.songId) state.songId = null; renderSongs(); }, "danger"]]));
  }
}
async function openFromLibrary(id) { if(running)return; const revision=++openRevision;const song=await lib.loadSong(id);if(revision!==openRevision)return;if(!song)throw new Error("曲が見つかりません");installSong(song,id); }
$("#btn-songs").addEventListener("click", async () => {try {if(saveable())await lib.saveSong(ensureSongId(),state.song);await renderSongs();if(!dlg.open)dlg.showModal();}catch(e){toast(e.message,true);} });

$("#btn-songs-close").addEventListener("click", () => dlg.close());
$("#btn-thanks").addEventListener("click", () => $("#dlg-thanks").showModal());
$("#btn-thanks-close").addEventListener("click", () => $("#dlg-thanks").close());

/* ─────────── 作曲 ─────────── */
let cancelFlag = false, composeController=null;
const checkCancelled=()=>{if(cancelFlag||composeController?.signal.aborted)throw new Error("止めました");};
const COMPOSE_MODEL = "claude-fable-5-1";
function applyBlueprint(bp) {
  const song = state.song;
  song.title = bp.title; song.tempo = clamp(bp.tempo, 60, 180); song.timeSig = [3, 4].includes(bp.timeSig) ? bp.timeSig : 4; song.key = bp.key; song.concept = bp.concept;
  if(!Array.isArray(bp.sections)||!bp.sections.length||bp.sections.some(s=>!Number.isInteger(s.bars)||s.bars<1)||bp.sections.reduce((n,s)=>n+s.bars,0)>128)throw new Error("曲の構成が不正です");
  song.sections = bp.sections; song.chordProgression = bp.chordProgression;
  song.tempoMap = [];
  const k = keysTrack(), p = pedalTrack(), d = drumTrack();
  k.notes = []; p.notes = []; d.notes = []; k.knobs = [];
  const plan = bp.trackPlan ?? [];
  const find = (inst, role) => plan.find((x) => x.instrument === inst) ?? plan.find((x) => (x.role ?? "").includes(role));
  k.stylePrompt = find("synth", "keys")?.stylePrompt ?? find("synth-lead", "lead")?.stylePrompt ?? "";
  p.stylePrompt = find("synth-bass", "pedal")?.stylePrompt ?? find("bass", "bass")?.stylePrompt ?? "";
  d.stylePrompt = find("drums", "drum")?.stylePrompt ?? "";
  pushUndo(); emit("song"); emit("tracks"); emit("selection");
}
async function generateBand({ model, onProgress, knobPlan }) {
  const song = state.song; const ts = song.timeSig; const total = totalBars();
  const k = keysTrack(), p = pedalTrack(), d = drumTrack();
  const gen = (req, label, maxTokens = 60000) => generateStructured({ ...req, signal:composeController?.signal, model, maxTokens, onProgress: (pr) => onProgress?.(`${label} ${((pr.chars ?? 0) / 1000).toFixed(1)}k${pr.retry ? " (retry)" : ""}`) });
  const BARS = 8; const chunks = []; for (let b = 0; b < total; b += BARS) chunks.push({ startBar: b, bars: Math.min(BARS, total - b) });
  let previous = null, prevMemo = "", knobState = { ...knobDefaults(k.synth2) };
  const memos = [], reports = [];
  const base = { song: { title: song.title, tempo: song.tempo, timeSig: ts, key: song.key, concept: song.concept, sections: song.sections, chordProgression: song.chordProgression }, keysStyle: `${k.synth2?.name ?? ""} — ${k.stylePrompt}`, bassStyle: `${p.synth2?.name ?? ""} — ${p.stylePrompt}`, drumStyle: d.stylePrompt, extraDirection: knobPlan ? `つまみの方針: ${knobPlan}` : undefined };
  for (const [ci, chunk] of chunks.entries()) {
    if (cancelFlag) throw new Error("止めました");
    const range = { startBar: chunk.startBar, bars: chunk.bars }; const sb = chunk.startBar * ts;
    const label = `[${ci + 1}/${chunks.length} bar ${chunk.startBar + 1}〜${chunk.startBar + chunk.bars}]`;
    const mode = ci === 0 ? "new" : "continue";
    let { data } = await gen(buildBandRequest({ ...base, range, mode, previous, previousPerformanceNotes: prevMemo, knobState }), `${label} 演奏を考え中…`);
    checkCancelled();
    let a = analyzeBand(data, { song, range }); let memo = data.performanceNotes ?? "";
    const passes = [describeBand(a)];
    if (a.severity === 3) { const r2 = await gen(buildBandRequest({ ...base, range, mode, previous, previousPerformanceNotes: prevMemo, knobState, extraDirection: `${base.extraDirection ?? ""}\n前回は演奏が空だった。必ず 4 本のレーンを書く。` }), `${label} 演奏を考え中 (2)…`); a = analyzeBand(r2.data, { song, range }); memo = r2.data.performanceNotes ?? memo; passes.push(describeBand(a)); }
    if (a.issues.length && a.stats.count > 0) {
      try {
        const r3 = await gen(buildBandRequest({ ...base, range, mode: "revise", issues: a.issues, revised: { synth: a.synth, pedal: a.pedal, drums: a.drums.map((x) => ({ k: x.k, s: x.s, v: x.v })), kick: a.kick.map((x) => ({ s: x.s, v: x.v })), knobs: a.knobs } }), `${label} 手直し中…`);
        const a3 = analyzeBand(r3.data, { song, range });
        if (a3.stats.count > 0 && a3.severity <= a.severity && a3.issues.length <= a.issues.length) { a = a3; memo = r3.data.performanceNotes ?? memo; passes.push(`手直し後: ${describeBand(a3)}`); } else passes.push("手直し案は不採用");
      } catch (e) { passes.push(`手直し失敗: ${e.message}`); }
    }
    checkCancelled();
    if(a.issues.length||!a.stats.count)throw new Error(`${label} 弾ける形にできませんでした: ${a.issues.join(" / ")}`);
    k.notes.push(...a.synth.map((n) => ({ id: uid(), p: n.p, s: +(sb + n.s).toFixed(4), d: n.d, v: n.v, h: "R", f: n.f })));
    p.notes.push(...a.pedal.map((n) => ({ id: uid(), p: n.p, s: +(sb + n.s).toFixed(4), d: n.d, v: n.v })));
    d.notes.push(...a.drums.map((n) => ({ id: uid(), p: n.p, k: n.k, s: +(sb + n.s).toFixed(4), d: 0.25, v: n.v })), ...a.kick.map((n) => ({ id: uid(), p: KICK, s: +(sb + n.s).toFixed(4), d: 0.25, v: n.v })));
    k.knobs.push(...a.knobs.map((x) => ({ param: x.param, s: +(sb + x.s).toFixed(4), d: x.d, to: x.to })));
    for (const x of a.knobs) knobState[x.param] = x.to;
    for (const tr of [k, p, d]) tr.notes.sort((x, y) => x.s - y.s || x.p - y.p);
    memos.push(memo); reports.push({ range, analysis: a, passes }); prevMemo = memo;
    previous = { bars: chunk.bars, synth: a.synth.slice(-120), pedal: a.pedal.slice(-40), drums: a.drums.slice(-64), kick: a.kick.slice(-32), knobs: a.knobs };
    emit("notes"); emit("tracks");
    status(`${label} ${passes.join(" → ")}`);
  }
  k.performanceNotes = memos.join(" / ");
  pushUndo(); emit("notes"); emit("tracks"); pushStage();
  return { reports, memo: k.performanceNotes };
}
async function compose(theme, { model }) {
  audio.releaseSongEngines();
  if (saveable()) await lib.saveSong(ensureSongId(), state.song).catch(() => {});
  state.songId = lib.newId();
  const fresh = bandSong(); fresh.kind = "draft-working"; fresh.title = "作曲中…";
  resetSong(fresh); ensureTracks(); emit("selection");
  status("作曲を始めます (数分かかります)");
  const bp = await generateStructured({ ...buildBandBlueprintRequest({ theme, deep: true }), signal:composeController?.signal, model, maxTokens: 16000, onProgress: (p) => progress(`設計図を考え中… ${((p.chars ?? 0) / 1000).toFixed(1)}k`) });
  if (cancelFlag) throw new Error("止めました");
  applyBlueprint(bp.data);
  const k = keysTrack(), p = pedalTrack();
  status(`「${bp.data.title}」の音色を作っています`);
  const snd = await generateStructured({ ...buildBandSoundsRequest({ song: state.song, keysStyle: k.stylePrompt, bassStyle: p.stylePrompt }), signal:composeController?.signal, model, maxTokens: 20000, onProgress: (pr) => progress(`音色を設計中… ${((pr.chars ?? 0) / 1000).toFixed(1)}k`) });
  if (cancelFlag) throw new Error("止めました");
  if (!snd.data?.keys || typeof snd.data.keys !== "object" || !snd.data?.pedal || typeof snd.data.pedal !== "object") throw new Error("音色の返事の形が違いました (keys / pedal がありません)");
  k.synth2 = normalizePatch2(snd.data.keys); p.synth2 = normalizePatch2(snd.data.pedal);
  setTitleUi(); emit("tracks");
  status(`「${bp.data.title}」を作っています (${totalBars()} 小節、右手: ${k.synth2.name} / 足鍵盤: ${p.synth2.name})`);
  const r = await generateBand({ model, onProgress: progress, knobPlan: snd.data.knobPlan });
  checkCancelled();
  const complete=analyzeBand(parts(),{song:state.song,range:{startBar:0,bars:totalBars()}});
  if(complete.issues.length)throw new Error(`曲のつなぎ目に問題があります: ${complete.issues.join(" / ")}`);
  let seamNote="";
  if(complete.stats.fixes.length) {
    // 8 小節ずつのつなぎ目で体の限界を超えた音を、検査が直した (落とした・短くした)。直せた形をそのまま曲に使う (1 音のために曲全体を捨てない)
    const d=drumTrack();
    k.notes=complete.synth.map((n)=>({id:uid(),p:n.p,s:+n.s.toFixed(4),d:n.d,v:n.v,h:"R",f:n.f}));
    p.notes=complete.pedal.map((n)=>({id:uid(),p:n.p,s:+n.s.toFixed(4),d:n.d,v:n.v}));
    d.notes=[...complete.drums.map((n)=>({id:uid(),p:n.p,k:n.k,s:+n.s.toFixed(4),d:0.25,v:n.v})),...complete.kick.map((n)=>({id:uid(),p:KICK,s:+n.s.toFixed(4),d:0.25,v:n.v}))];
    k.knobs=complete.knobs.map((x)=>({param:x.param,s:+x.s.toFixed(4),d:x.d,to:x.to}));
    for(const tr of [k,p,d])tr.notes.sort((x,y)=>x.s-y.s||x.p-y.p);
    emit("notes");emit("tracks");pushStage();
    const again=analyzeBand(parts(),{song:state.song,range:{startBar:0,bars:totalBars()}});
    if(again.stats.fixes.length||again.issues.length)throw new Error(`曲のつなぎ目を直しきれませんでした: ${[...again.stats.fixes,...again.issues].join(" / ")}`);
    seamNote=`。つなぎ目で ${complete.stats.fixes.join(" / ")}`;
  }
  await lib.saveSong(ensureSongId(),{...state.song,kind:"composed"});
  state.song.kind="composed";saveLocal();
  const pt = parts();
  status(`「${bp.data.title}」ができました (右手 ${pt.synth.length}音 / 足鍵盤 ${pt.pedal.length}音 / ドラム ${pt.drums.length}打 / バスドラ ${pt.kick.length}打 / つまみ ${pt.knobs.length}回)${seamNote}。「曲を選ぶ」の「作った曲」にも残ります`, "lit");

}

/* ─────────── お題バー ─────────── */
let mode = "play";
function applyMode() {
  document.querySelectorAll(".mtab").forEach((x) => x.classList.toggle("on", x.dataset.mode === mode));
  const play = mode === "play";
  $("#btn-songs").classList.toggle("hidden", !play); $("#play-hint").classList.toggle("hidden", !play);
  $("#inp-theme").classList.toggle("hidden", play); $("#btn-go").classList.toggle("hidden", play);
}
document.querySelectorAll(".mtab").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; applyMode(); }));
$("#sel-model").innerHTML = MODELS.map((m) => `<option value="${m.id}">${m.label}</option>`).join("");
applyMode();
let running = false;
function setGoUi(busy) {
  running=busy;state.generating=busy;if(busy)++openRevision;
  for(const el of document.querySelectorAll("#btn-go, #btn-songs, #inp-import-json, #inp-tempo, #btn-play, #btn-rew, #btn-loop, #btn-met, .mtab"))el.disabled=busy;
  $("#btn-cancel").classList.toggle("hidden",!busy);
}
$("#btn-go").addEventListener("click", async () => {
  if(running)return;
  const theme=$("#inp-theme").value.trim();if(!theme){toast("お題を入れてください",true);return;}
  const backup=structuredClone(state.song), backupId=state.songId;
  cancelFlag=false;composeController=new AbortController();setGoUi(true);
  let made=false;
  try {
    const transport=await resolveTransport();checkCancelled();
    if(transport==="none"){await settingsUi.openIfNoKey();if(await resolveTransport()==="none")throw new Error("作曲の接続が設定されていません");}
    const seat=await relaySeat();checkCancelled();if(seat?.busy)throw new Error("今、別の人が作曲中です。しばらくしてからもう一度どうぞ");
    await compose(theme,{model:COMPOSE_MODEL});made=true;
  } catch(error) {
    let saved=false;
    if(state.song!==backup && state.song.kind==="draft-working" && state.song.tracks.some(t=>t.notes.length)) {
      const draft=structuredClone(state.song);draft.kind="draft";draft.title+="（作曲途中）";
      draft.generationError=cancelFlag?"中止":error.message;
      try {await lib.saveSong(ensureSongId(),draft);saved=true;}catch{}
    }
    if(state.song.kind==="draft-working")installSong(backup,backupId,{validate:false});
    status(`${cancelFlag?"作曲を止めました":`作曲できませんでした: ${error.message}`}${saved?"。作りかけは「曲を選ぶ」に残しました":""}`);
  } finally {setGoUi(false);composeController=null;}
  if(made)await play(0);
});
$("#btn-cancel").addEventListener("click",()=>{cancelFlag=true;composeController?.abort();status("作曲を止めています…");});

$("#inp-theme").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btn-go").click(); });

/* ─────────── 開発用: 手打ちのデモ (API 無しで動きを確かめる) ─────────── */
export function demoSong() {
  const s = bandSong(); s.title = "DEMO — 8 beat"; s.tempo = 112; s.key = "A minor"; s.kind = "repertoire";
  s.sections = [{ name: "A", bars: 8, description: "" }];
  const [k, p, d] = s.tracks;
  const chords = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]];
  for (let bar = 0; bar < 8; bar++) {
    const ch = chords[bar % 4];
    // 右手: 1・2.5・4 拍に和音のスタブ (bar 3, 7 はつまみを回すので 4 拍目を空ける)
    for (const [beat, dur] of [[0, 0.9], [1.5, bar % 4 === 3 ? 0.4 : 0.9], [3, 0.9]]) { if (bar % 4 === 3 && beat === 3) continue; ch.forEach((pp, i) => k.notes.push({ id: uid(), p: pp + 12, s: bar * 4 + beat, d: dur, v: 88 - i * 6, h: "R", f: [1, 3, 5][i] })); }
    if (bar % 4 === 3) k.knobs.push({ param: bar === 3 ? "cutoff" : "resonance", s: bar * 4 + 2.8, d: 0.7, to: bar === 3 ? 0.85 : 0.6 });
    // 足鍵盤: ルートを 8 分で、3.5 拍目に 5 度
    const root = ch[0] - 24; const fifth = root + 2 > 36 ? root - 2 : root + 2;
    for (const b of [0, 1, 2, 3]) p.notes.push({ id: uid(), p: root, s: bar * 4 + b, d: 0.45, v: 105 });
    p.notes.push({ id: uid(), p: fifth, s: bar * 4 + 3.5, d: 0.4, v: 98 });
    // 左手: 8 分のハイハット、2・4 拍はスネア。8 小節目はタム回し + 頭にクラッシュ
    for (let e = 0; e < 8; e++) { const b = e / 2; const isSn = b === 1 || b === 3; if (bar === 7 && b >= 2) continue; d.notes.push({ id: uid(), p: isSn ? DRUM_KEYS.sn : DRUM_KEYS.hh, k: isSn ? "sn" : "hh", s: bar * 4 + b, d: 0.25, v: isSn ? 110 : e % 2 ? 60 : 78 }); }
    if (bar === 7) for (const [b, kk] of [[2, "t1"], [2.5, "t1"], [3, "t2"], [3.5, "t3"]]) d.notes.push({ id: uid(), p: DRUM_KEYS[kk], k: kk, s: bar * 4 + b, d: 0.25, v: 108 });
    if (bar === 0 || bar === 4) { d.notes = d.notes.filter((n) => !(n.s === bar * 4 && n.k === "hh")); d.notes.push({ id: uid(), p: DRUM_KEYS.cr, k: "cr", s: bar * 4, d: 0.25, v: 115 }); }
    // 左足: 1 拍・2.5 拍・3 拍
    for (const b of [0, 2.5, 3]) d.notes.push({ id: uid(), p: KICK, s: bar * 4 + b, d: 0.25, v: 112 });
  }
  for (const tr of s.tracks) tr.notes.sort((a, b) => a.s - b.s || a.p - b.p);
  return s;
}
window.bandDemo = () => { if(running)throw new Error("作曲中です"); installSong(demoSong()); status("デモを開きました。▶ で再生","lit"); };
window.bandLoad = async (file) => { const list=await listRepertoire();const item=list.find(x=>x.file===file);if(!item)throw new Error("同梱曲が見つかりません");await openRepertoire(item);return state.song.title; };
window.bandRehearse = () => { audio.stop();const result=stage.rehearse(b=>beatToSec(b));stage.poseAt(state.playheadBeat,b=>beatToSec(b));return result; };
// A capture is published atomically after both measured traces are ready. The
// animation loop never renders the frozen scene while measuring, or afterwards.
window.bandShot = (options={}) => (window.bandShotReady=captureShot(options));
async function captureShot({view="full",beat=state.playheadBeat}={}) {
  if(running)throw new Error("作曲中です");
  if(!["full","stick","pedal","knob","keys","bass","crash","synth","ar"].includes(view))throw new Error("撮影の向きが不正です");
  if(!Number.isFinite(+beat))throw new Error("撮影の拍は数で指定してください");
  const started=performance.now();
  audio.stop();beat=clamp(+beat,0,songEndBeat());audio.seek(beat);frozenShot=true;setFullscreen(true);
  window.bandShotStatus={state:"measuring",view,beat};document.body.dataset.bandShot="measuring";
  document.body.classList.add("band-shot");stage._resize();stage.poseAt(beat,b=>beatToSec(b));stage.setShot(view);
  const revision=++shotRevision,song=state.song,changes=stage.arChanges.map(e=>({...e}));
  try {
    const measured=await shotSignals(song,beat,changes);await document.fonts.ready;
    if(revision!==shotRevision||!frozenShot||song!==state.song)return {cancelled:true,view,beat};
    stage.setSignal(measured);stage.render();bootShotPending=false;
    window.bandShotStatus={state:"ready",view,beat,ms:Math.round(performance.now()-started)};
    document.body.dataset.bandShot="ready";
    return {...window.bandShotStatus,...stage.debugPose()};
  } catch(error){
    if(revision===shotRevision){bootShotPending=false;window.bandShotStatus={state:"error",view,beat,error:error.message};document.body.dataset.bandShot="error";toast(`音の測定: ${error.message}`,true);}
    throw error;
  }
}
window.bandShotEnd = () => {bootShotPending=false;window.bandShotStatus={state:"idle"};delete document.body.dataset.bandShot;shotRevision++;frozenShot=false;signalHistory.reset();stage.setSignal();stage.shotCamera=null;document.body.classList.remove("band-shot");setFullscreen(false);};
window.addEventListener("keydown",e=>{if(e.key==="Escape"&&frozenShot)window.bandShotEnd();});
window.addEventListener("resize",()=>{if(document.body.classList.contains("stage-full"))stage.setLayout(innerWidth>700?"side":"stack");});
window.addEventListener("pagehide",()=>{composeController?.abort();audio.releaseSongEngines();});

/* ─────────── boot ─────────── */
const settingsUi = initSettings({ onLangChange: () => applyDom(), toast });
async function boot() {
  const query=new URLSearchParams(location.search), requested=query.get("song");
  let hasSaved=loadLocal();
  if(hasSaved && (validateBandSong(state.song).length || !SAVE_KINDS.has(state.song.kind)))hasSaved=false;
  if(requested) {await window.bandLoad(requested);}
  else if(!hasSaved) {const list=await listRepertoire();if(list[0])await openRepertoire(list[0]);else installSong(demoSong());}
  ensureTracks();syncTransportFields();setTitleUi();emit("song");emit("selection");
  status(`「${state.song.title}」を開きました。▶ で再生できます`,"lit");
  if(query.has("shot")) {await document.fonts.ready;const view=query.get("shot"),beat=query.has("beat")?Number(query.get("beat")):state.song.shots?.[view]??0;await window.bandShot({view,beat});}
  return {title:state.song.title,shots:state.song.shots??{}};
}
window.bandReady=boot().catch(error=>{bootShotPending=false;if(validateBandSong(state.song).length)resetSong(bandSong());ensureTracks();emit("song");status(`曲を開けませんでした: ${error.message}`);console.error(error);return {error:error.message};});
