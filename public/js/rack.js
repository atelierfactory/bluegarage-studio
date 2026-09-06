// ═══════════ RACK: 楽器とエフェクトを「機材のパネル」として見る・いじる ═══════════
// 選択トラックの音源 (シンセならつまみ全部 / サンプル音源なら中身の情報)、チャンネルストリップ、マスター。

import { state, selectedTrack, pushUndo, emit, on, SYNTH_INSTRUMENTS, INSTRUMENT_DEFS } from "./state.js";
import { PRESETS, clonePatch, normalizePatch } from "./synth.js";
import { patchOf, refreshTrack, previewNote, loadSfz, applyMixer, setMasterVolume, getLevels } from "./audio.js";
import { makeKnob, makeFader, makeMeter } from "./knob.js";
import { t, getLang } from "./i18n.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const WAVES = ["saw", "square", "triangle", "sine", "pulse25", "pulse12", "fm2", "fm3", "fm5", "am"];
const dbFmt = (v) => `${v > 0 ? "+" : ""}${(+v).toFixed(1)}`;
const hzFmt = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
const secFmt = (v) => (v < 1 ? `${Math.round(v * 1000)}ms` : `${(+v).toFixed(2)}s`);
const pct = (v) => `${Math.round(v * 100)}%`;

function module(title, cls = "") {
  const el = document.createElement("section");
  el.className = `rk-module ${cls}`;
  el.innerHTML = `<div class="rk-head"><span class="rk-led"></span>${esc(title)}</div><div class="rk-body"></div>`;
  return { el, body: el.querySelector(".rk-body"), head: el.querySelector(".rk-head") };
}
function buttons(options, current, onPick, labelOf = (x) => x) {
  const row = document.createElement("div"); row.className = "rk-btns";
  for (const o of options) {
    const b = document.createElement("button"); b.className = "rk-btn" + (String(o) === String(current) ? " on" : ""); b.textContent = labelOf(o);
    b.addEventListener("click", () => { row.querySelectorAll(".rk-btn").forEach((x) => x.classList.remove("on")); b.classList.add("on"); onPick(o); });
    row.appendChild(b);
  }
  return row;
}
function toggle(label, current, onPick) {
  const b = document.createElement("button"); b.className = "rk-btn rk-toggle" + (current ? " on" : ""); b.textContent = label;
  b.addEventListener("click", () => { b.classList.toggle("on"); onPick(b.classList.contains("on")); });
  return b;
}
function knobRow(...knobs) { const r = document.createElement("div"); r.className = "rk-knobs"; for (const k of knobs) r.appendChild(k.el ?? k); return r; }

export function initRack({ onDesign, log }) {
  const root = $("#rack");
  let track = null;
  let patch = null;
  let applyTimer = null;
  let master = null;
  let meters = { track: null, master: null };
  let raf = null;

  function scheduleApply() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(async () => { if (!track) return; track.patch = normalizePatch(patch); await refreshTrack(track); emit("tracks"); }, 120);
  }
  const commit = () => { clearTimeout(applyTimer); if (track) { track.patch = normalizePatch(patch); refreshTrack(track).then(() => { pushUndo(); emit("tracks"); }); } };

  /* ── シンセのパネル ── */
  function synthPanels(container) {
    const p = patch;
    // ヘッダー: プリセット・名前・AI
    const top = document.createElement("div"); top.className = "rk-top";
    const sel = document.createElement("select"); sel.innerHTML = `<option value="">— preset —</option>` + Object.keys(PRESETS).map((k) => `<option value="${k}" ${p.name === k ? "selected" : ""}>${k}</option>`).join("");
    sel.addEventListener("change", () => { if (PRESETS[sel.value]) { patch = clonePatch(PRESETS[sel.value]); commit(); render(); } });
    const name = document.createElement("input"); name.type = "text"; name.value = p.name; name.placeholder = "patch name";
    name.addEventListener("change", () => { patch.name = name.value; commit(); });
    const ai = document.createElement("input"); ai.type = "text"; ai.placeholder = t("syn.ai");
    const aiBtn = document.createElement("button"); aiBtn.className = "gbtn small accent"; aiBtn.textContent = t("syn.ai.go");
    aiBtn.addEventListener("click", async () => {
      if (!ai.value.trim()) return; aiBtn.disabled = true; const label = aiBtn.textContent;
      try { const np = await onDesign(track, ai.value.trim(), (m) => (aiBtn.textContent = m)); patch = clonePatch(np); commit(); render(); }
      catch (e) { log?.(`${e.message}`, "err"); } finally { aiBtn.disabled = false; aiBtn.textContent = label; }
    });
    const aud = document.createElement("button"); aud.className = "gbtn small"; aud.textContent = t("syn.audition");
    aud.addEventListener("click", () => { const base = track.instrument === "synth-bass" ? 40 : 60; [0, 4, 7, 12].forEach((iv, i) => setTimeout(() => previewNote(track, base + iv, 100, 0.5), i * 260)); });
    top.append(sel, name, ai, aiBtn, aud);
    container.appendChild(top);
    if (p.description) { const d = document.createElement("p"); d.className = "dim rk-desc"; d.textContent = p.description; container.appendChild(d); }

    const grid = document.createElement("div"); grid.className = "rk-grid";
    // OSC
    p.osc.forEach((o, i) => {
      const m = module(`OSC ${i + 1}`, "osc");
      m.body.appendChild(buttons(WAVES, o.wave, (w) => { o.wave = w; scheduleApply(); }));
      m.body.appendChild(knobRow(
        makeKnob({ label: "OCT", min: -2, max: 2, step: 1, value: o.octave, def: 0, onInput: (v) => { o.octave = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "SEMI", min: -12, max: 12, step: 1, value: o.semi, def: 0, onInput: (v) => { o.semi = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "DETUNE", min: -50, max: 50, step: 1, value: o.detune, def: 0, fmt: (v) => `${v}c`, onInput: (v) => { o.detune = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "LEVEL", min: 0, max: 1, step: 0.01, value: o.level, def: 0.7, fmt: pct, onInput: (v) => { o.level = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "UNISON", min: 1, max: 7, step: 1, value: o.unison, def: 1, onInput: (v) => { o.unison = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "SPREAD", min: 0, max: 60, step: 1, value: o.spread, def: 0, fmt: (v) => `${v}c`, onInput: (v) => { o.spread = v; scheduleApply(); }, onChange: commit }),
      ));
      if (p.osc.length > 1) { const rm = document.createElement("button"); rm.className = "rk-btn rk-rm"; rm.textContent = "✕"; rm.title = "remove"; rm.addEventListener("click", () => { p.osc.splice(i, 1); commit(); render(); }); m.head.appendChild(rm); }
      grid.appendChild(m.el);
    });
    if (p.osc.length < 3) { const add = document.createElement("button"); add.className = "rk-btn rk-add"; add.textContent = `+ OSC ${p.osc.length + 1}`; add.addEventListener("click", () => { p.osc.push(clonePatch(PRESETS["Poly Stab"].osc[0])); commit(); render(); }); grid.appendChild(add); }
    // SUB / NOISE
    { const m = module("SUB / NOISE");
      m.body.appendChild(buttons(["sine", "square", "triangle"], p.sub.wave, (w) => { p.sub.wave = w; scheduleApply(); }));
      m.body.appendChild(buttons(["white", "pink", "brown"], p.noise.type, (w) => { p.noise.type = w; scheduleApply(); }));
      m.body.appendChild(knobRow(
        makeKnob({ label: "SUB", min: 0, max: 1, step: 0.01, value: p.sub.level, def: 0, fmt: pct, onInput: (v) => { p.sub.level = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "NOISE", min: 0, max: 1, step: 0.01, value: p.noise.level, def: 0, fmt: pct, onInput: (v) => { p.noise.level = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "N.DECAY", min: 0.005, max: 4, log: true, value: p.noise.decay, def: 0.05, fmt: secFmt, onInput: (v) => { p.noise.decay = v; scheduleApply(); }, onChange: commit }),
      ));
      grid.appendChild(m.el); }
    // FILTER
    { const m = module("FILTER", "filter");
      m.body.appendChild(buttons(["lowpass", "highpass", "bandpass"], p.filter.type, (w) => { p.filter.type = w; scheduleApply(); }, (x) => ({ lowpass: "LP", highpass: "HP", bandpass: "BP" }[x])));
      m.body.appendChild(knobRow(
        makeKnob({ label: "CUTOFF", min: 20, max: 18000, log: true, value: p.filter.cutoff, def: 2000, fmt: hzFmt, size: 56, onInput: (v) => { p.filter.cutoff = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "RESO", min: 0.1, max: 12, step: 0.1, value: p.filter.q, def: 1, onInput: (v) => { p.filter.q = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "ENV AMT", min: 0, max: 6, step: 0.1, value: p.filter.envAmount, def: 1, fmt: (v) => `${v.toFixed(1)}oct`, onInput: (v) => { p.filter.envAmount = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "KEY TRK", min: 0, max: 1, step: 0.05, value: p.filter.keyTrack, def: 0.5, fmt: pct, onInput: (v) => { p.filter.keyTrack = v; scheduleApply(); }, onChange: commit }),
      ));
      grid.appendChild(m.el); }
    // ENVs
    for (const [key, title] of [["ampEnv", "AMP ENV"], ["filterEnv", "FILTER ENV"]]) {
      const e = p[key]; const m = module(title, "env");
      m.body.appendChild(knobRow(
        makeKnob({ label: "A", min: 0.001, max: 10, log: true, value: e.a, def: 0.01, fmt: secFmt, onInput: (v) => { e.a = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "D", min: 0.001, max: 10, log: true, value: e.d, def: 0.3, fmt: secFmt, onInput: (v) => { e.d = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "S", min: 0, max: 1, step: 0.01, value: e.s, def: 0.7, fmt: pct, onInput: (v) => { e.s = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "R", min: 0.005, max: 20, log: true, value: e.r, def: 0.3, fmt: secFmt, onInput: (v) => { e.r = v; scheduleApply(); }, onChange: commit }),
      ));
      grid.appendChild(m.el);
    }
    // LFO
    { const m = module("LFO", "lfo");
      m.body.appendChild(buttons(["none", "filter", "pitch", "amp", "pan"], p.lfo.target, (w) => { p.lfo.target = w; scheduleApply(); }));
      m.body.appendChild(buttons(["sine", "triangle", "square", "sawtooth"], p.lfo.wave, (w) => { p.lfo.wave = w; scheduleApply(); }, (x) => x.slice(0, 3)));
      m.body.appendChild(knobRow(
        makeKnob({ label: "RATE", min: 0.05, max: 20, log: true, value: p.lfo.rate, def: 5, fmt: (v) => `${(+v).toFixed(2)}Hz`, onInput: (v) => { p.lfo.rate = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "DEPTH", min: 0, max: 1, step: 0.01, value: p.lfo.depth, def: 0, fmt: pct, onInput: (v) => { p.lfo.depth = v; scheduleApply(); }, onChange: commit }),
      ));
      grid.appendChild(m.el); }
    // FX
    { const f = p.fx;
      const m = module("DRIVE / CHORUS", "fx");
      m.body.appendChild(knobRow(
        makeKnob({ label: "DRIVE", min: 0, max: 1, step: 0.01, value: f.drive, def: 0, fmt: pct, onInput: (v) => { f.drive = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "CHO MIX", min: 0, max: 1, step: 0.01, value: f.chorus.mix, def: 0, fmt: pct, onInput: (v) => { f.chorus.mix = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "CHO RATE", min: 0.05, max: 8, log: true, value: f.chorus.rate, def: 1, fmt: (v) => `${(+v).toFixed(2)}Hz`, onInput: (v) => { f.chorus.rate = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "CHO DEP", min: 0, max: 1, step: 0.01, value: f.chorus.depth, def: 0.3, fmt: pct, onInput: (v) => { f.chorus.depth = v; scheduleApply(); }, onChange: commit }),
      ));
      grid.appendChild(m.el);
      const d = module("DELAY", "fx");
      d.body.appendChild(buttons([0.125, 0.25, 0.333, 0.375, 0.5, 0.667, 0.75, 1, 1.5, 2], f.delay.time, (v) => { f.delay.time = +v; scheduleApply(); }, (x) => ({ 0.125: "1/32", 0.25: "1/16", 0.333: "1/8T", 0.375: "1/16.", 0.5: "1/8", 0.667: "1/4T", 0.75: "1/8.", 1: "1/4", 1.5: "1/4.", 2: "1/2" }[x])));
      const row = knobRow(
        makeKnob({ label: "MIX", min: 0, max: 1, step: 0.01, value: f.delay.mix, def: 0, fmt: pct, onInput: (v) => { f.delay.mix = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "FEEDBK", min: 0, max: 0.9, step: 0.01, value: f.delay.feedback, def: 0.3, fmt: pct, onInput: (v) => { f.delay.feedback = v; scheduleApply(); }, onChange: commit }),
      );
      row.appendChild(toggle("PING-PONG", f.delay.pingpong, (v) => { f.delay.pingpong = v; scheduleApply(); }));
      d.body.appendChild(row);
      grid.appendChild(d.el);
      const r = module("REVERB", "fx");
      r.body.appendChild(knobRow(
        makeKnob({ label: "MIX", min: 0, max: 1, step: 0.01, value: f.reverb.mix, def: 0, fmt: pct, onInput: (v) => { f.reverb.mix = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "DECAY", min: 0.2, max: 10, log: true, value: f.reverb.decay, def: 1.5, fmt: secFmt, onInput: (v) => { f.reverb.decay = v; scheduleApply(); }, onChange: commit }),
      ));
      grid.appendChild(r.el); }
    // VOICE
    { const m = module("VOICE", "voice");
      const row = knobRow(
        makeKnob({ label: "GLIDE", min: 0, max: 0.5, step: 0.005, value: p.glide, def: 0, fmt: secFmt, onInput: (v) => { p.glide = v; scheduleApply(); }, onChange: commit }),
        makeKnob({ label: "LEVEL", min: -30, max: 6, step: 0.5, value: p.level, def: -10, fmt: dbFmt, onInput: (v) => { p.level = v; scheduleApply(); }, onChange: commit }),
      );
      row.prepend(toggle("MONO", p.mono, (v) => { p.mono = v; scheduleApply(); }));
      m.body.appendChild(row);
      grid.appendChild(m.el); }
    container.appendChild(grid);
  }

  /* ── サンプル音源のパネル ── */
  async function instrumentPanel(container) {
    const m = module(`INSTRUMENT — ${INSTRUMENT_DEFS[track.instrument]?.[getLang() === "en" ? "en" : "label"] ?? track.instrument}`, "inst");
    const info = document.createElement("div"); info.className = "rk-info"; info.textContent = "…";
    m.body.appendChild(info);
    container.appendChild(m.el);
    const kb = document.createElement("div"); kb.className = "rk-keys";
    const base = track.instrument === "drums" ? 36 : track.instrument === "bass" ? 40 : 60;
    for (let i = 0; i < 13; i++) { const k = document.createElement("button"); k.className = "rk-key" + ([1, 3, 6, 8, 10].includes(i % 12) ? " black" : ""); k.addEventListener("mousedown", () => previewNote(track, base + i, 100, 0.6)); kb.appendChild(k); }
    m.body.appendChild(kb);
    if (track.instrument === "organ") { info.textContent = getLang() === "en" ? "Drawbar organ synthesized in Tone.js (9 harmonics + Leslie)." : "Tone.js で合成したドローバーオルガン (9 本の倍音 + レスリー)。"; return; }
    const sfz = await loadSfz(track.instrument);
    if (!sfz) { info.textContent = getLang() === "en" ? "Local samples not found → CDN / synth fallback" : "ローカル音源なし → CDN / シンセの予備音源"; return; }
    const layers = new Set(sfz.regions.map((r) => `${r.v[0]}-${r.v[1]}`)).size;
    const rr = Math.max(1, ...sfz.regions.map((r) => r.seq?.[0] ?? 1));
    const rel = sfz.regions.filter((r) => r.rel).length;
    const keys = sfz.byKey.filter((a) => a.length).length;
    info.innerHTML = `<b>${esc(sfz.label)}</b><br>${sfz.regions.length} regions / ${sfz.samples.length} samples / ${keys} keys<br>velocity layers ${layers} · round robin ×${rr}${rel ? ` · release samples ${rel}` : ""}${sfz.hasShort ? " · sus/short articulations" : ""}`;
  }

  /* ── チャンネルストリップ ── */
  function channelPanel(container) {
    const tr = track; const f = tr.fx;
    const m = module("CHANNEL STRIP", "channel");
    const chg = () => { applyMixer(); };
    const done = () => { pushUndo(); emit("tracks"); };
    const row = knobRow(
      makeKnob({ label: "LO-CUT", min: 20, max: 400, log: true, value: f.hpf, def: 60, fmt: hzFmt, onInput: (v) => { f.hpf = v; chg(); }, onChange: done }),
      makeKnob({ label: "LOW", min: -12, max: 6, step: 0.5, value: f.eqLow, def: 0, fmt: dbFmt, onInput: (v) => { f.eqLow = v; chg(); }, onChange: done }),
      makeKnob({ label: "MID", min: -12, max: 6, step: 0.5, value: f.eqMid, def: 0, fmt: dbFmt, onInput: (v) => { f.eqMid = v; chg(); }, onChange: done }),
      makeKnob({ label: "HIGH", min: -12, max: 6, step: 0.5, value: f.eqHigh, def: 0, fmt: dbFmt, onInput: (v) => { f.eqHigh = v; chg(); }, onChange: done }),
      makeKnob({ label: "COMP", min: 0, max: 1, step: 0.02, value: f.comp, def: 0.2, fmt: pct, color: "var(--warn)", onInput: (v) => { f.comp = v; chg(); }, onChange: done }),
      makeKnob({ label: "HALL", min: 0, max: 1, step: 0.02, value: f.hall, def: 0.2, fmt: pct, color: "var(--ok)", onInput: (v) => { f.hall = v; chg(); }, onChange: done }),
      makeKnob({ label: "ROOM", min: 0, max: 1, step: 0.02, value: f.room, def: 0.2, fmt: pct, color: "var(--ok)", onInput: (v) => { f.room = v; chg(); }, onChange: done }),
      makeKnob({ label: "PAN", min: -1, max: 1, step: 0.05, value: tr.pan, def: 0, fmt: (v) => (Math.abs(v) < 0.025 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`), onInput: (v) => { tr.pan = v; chg(); }, onChange: done }),
    );
    const fader = makeFader({ min: -40, max: 6, step: 0.5, value: tr.volume, def: -6, onInput: (v) => { tr.volume = v; chg(); }, onChange: done });
    const meter = makeMeter(); meters.track = meter;
    const right = document.createElement("div"); right.className = "rk-fader-wrap"; right.append(fader.el, meter.el);
    const label = document.createElement("div"); label.className = "k-label"; label.textContent = "VOL"; right.appendChild(label);
    m.body.classList.add("rk-strip"); m.body.append(row, right);
    container.appendChild(m.el);
  }

  /* ── マスター ── */
  function masterPanel(container) {
    const ms = state.song.master;
    const m = module("MASTER", "master");
    const chg = () => applyMixer();
    const done = () => pushUndo();
    const row = knobRow(
      makeKnob({ label: "GLUE", min: 0, max: 1, step: 0.02, value: ms.glue, def: 0.3, fmt: pct, color: "var(--warn)", onInput: (v) => { ms.glue = v; chg(); }, onChange: done }),
      makeKnob({ label: "HALL", min: 0.5, max: 8, log: true, value: ms.hallDecay, def: 2.4, fmt: secFmt, color: "var(--ok)", onInput: (v) => { ms.hallDecay = v; }, onChange: () => { chg(); done(); } }),
      makeKnob({ label: "ROOM", min: 0.15, max: 2, log: true, value: ms.roomDecay, def: 0.6, fmt: secFmt, color: "var(--ok)", onInput: (v) => { ms.roomDecay = v; }, onChange: () => { chg(); done(); } }),
      makeKnob({ label: "WIDTH", min: 0.5, max: 1.5, step: 0.05, value: ms.width, def: 1, fmt: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { ms.width = v; chg(); }, onChange: done }),
      makeKnob({ label: "LUFS", min: -24, max: -6, step: 0.5, value: ms.targetLufs, def: -14, fmt: (v) => `${v}`, onInput: (v) => { ms.targetLufs = v; }, onChange: done }),
    );
    const fader = makeFader({ min: -40, max: 6, step: 0.5, value: ms.volume, def: -4, onInput: (v) => { setMasterVolume(v); $("#inp-master").value = v; }, onChange: done });
    const meter = makeMeter(); meters.master = meter;
    const right = document.createElement("div"); right.className = "rk-fader-wrap"; right.append(fader.el, meter.el);
    const label = document.createElement("div"); label.className = "k-label"; label.textContent = "OUT"; right.appendChild(label);
    m.body.classList.add("rk-strip"); m.body.append(row, right);
    container.appendChild(m.el);
    master = m;
  }

  function render() {
    track = selectedTrack();
    root.innerHTML = "";
    meters = { track: null, master: null };
    if (!track) { root.innerHTML = `<p class="dim" style="padding:20px">${getLang() === "en" ? "Select a track." : "トラックを選んでください。"}</p>`; return; }
    const head = document.createElement("div"); head.className = "rk-title"; head.style.setProperty("--tc", track.color);
    head.innerHTML = `<span class="rk-dot"></span><b>${esc(track.name)}</b><span class="dim">${esc(INSTRUMENT_DEFS[track.instrument]?.[getLang() === "en" ? "en" : "label"] ?? track.instrument)}${track.midiOut?.portId ? ` · MIDI OUT → ${esc(track.midiOut.portName)}` : ""}</span>`;
    root.appendChild(head);
    const wrap = document.createElement("div"); wrap.className = "rk-wrap";
    if (SYNTH_INSTRUMENTS.has(track.instrument)) { patch = clonePatch(patchOf(track)); synthPanels(wrap); }
    else instrumentPanel(wrap);
    channelPanel(wrap);
    masterPanel(wrap);
    root.appendChild(wrap);
    tick();
  }
  function tick() {
    cancelAnimationFrame(raf);
    const loop = () => {
      if (!root.classList.contains("view-active")) return;
      if (meters.track || meters.master) {
        const lv = getLevels();
        if (meters.track && track) { const v = lv.tracks[track.id] ?? [-100, -100]; meters.track.update(v[0], v[1]); }
        if (meters.master && lv.master) meters.master.update(lv.master[0], lv.master[1]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  on("selection", () => { if (root.classList.contains("view-active")) render(); });
  on("song", () => { if (root.classList.contains("view-active")) render(); });
  return { render, refresh: render, show() { render(); } };
}
