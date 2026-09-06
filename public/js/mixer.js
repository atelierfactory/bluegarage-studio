// ═══════════ MIXER: 全トラックのフェーダー・パン・センド・メーターを 1 画面で ═══════════

import { state, pushUndo, emit, on } from "./state.js";
import { applyMixer, setMasterVolume, getLevels } from "./audio.js";
import { makeKnob, makeFader, makeMeter } from "./knob.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (v) => `${Math.round(v * 100)}%`;

export function initMixer() {
  const root = $("#mixer");
  let strips = [];
  let masterMeter = null;
  let raf = null;

  function render() {
    root.innerHTML = "";
    strips = [];
    const done = () => { pushUndo(); emit("tracks"); };
    for (const tr of state.song.tracks) {
      const el = document.createElement("div"); el.className = "mx-strip" + (tr.id === state.selectedTrackId ? " selected" : ""); el.style.setProperty("--tc", tr.color);
      el.addEventListener("mousedown", (e) => { if (e.target.closest("input, button, .knob")) return; state.selectedTrackId = tr.id; emit("selection"); emit("tracks"); });
      const name = document.createElement("div"); name.className = "mx-name"; name.textContent = tr.name; name.title = tr.name;
      const pan = makeKnob({ label: "PAN", min: -1, max: 1, step: 0.05, value: tr.pan, def: 0, size: 36, fmt: (v) => (Math.abs(v) < 0.025 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`), onInput: (v) => { tr.pan = v; applyMixer(); }, onChange: done });
      const hall = makeKnob({ label: "HALL", min: 0, max: 1, step: 0.02, value: tr.fx.hall, def: 0.2, size: 30, fmt: pct, color: "var(--ok)", onInput: (v) => { tr.fx.hall = v; applyMixer(); }, onChange: done });
      const room = makeKnob({ label: "ROOM", min: 0, max: 1, step: 0.02, value: tr.fx.room, def: 0.2, size: 30, fmt: pct, color: "var(--ok)", onInput: (v) => { tr.fx.room = v; applyMixer(); }, onChange: done });
      const comp = makeKnob({ label: "COMP", min: 0, max: 1, step: 0.02, value: tr.fx.comp, def: 0.2, size: 30, fmt: pct, color: "var(--warn)", onInput: (v) => { tr.fx.comp = v; applyMixer(); }, onChange: done });
      const btns = document.createElement("div"); btns.className = "mx-btns";
      const m = document.createElement("button"); m.className = "mini-btn m" + (tr.mute ? " on-m" : ""); m.textContent = "M"; m.addEventListener("click", () => { tr.mute = !tr.mute; applyMixer(); m.classList.toggle("on-m", tr.mute); emit("tracks"); });
      const s = document.createElement("button"); s.className = "mini-btn s" + (tr.solo ? " on-s" : ""); s.textContent = "S"; s.addEventListener("click", () => { tr.solo = !tr.solo; applyMixer(); s.classList.toggle("on-s", tr.solo); emit("tracks"); });
      btns.append(m, s);
      const fader = makeFader({ min: -40, max: 6, step: 0.5, value: tr.volume, def: -6, onInput: (v) => { tr.volume = v; applyMixer(); }, onChange: done });
      const meter = makeMeter();
      const fw = document.createElement("div"); fw.className = "mx-fader"; fw.append(fader.el, meter.el);
      const sends = document.createElement("div"); sends.className = "mx-sends"; sends.append(hall.el, room.el, comp.el);
      el.append(name, pan.el, sends, btns, fw);
      root.appendChild(el);
      strips.push({ id: tr.id, meter });
    }
    // master
    const ms = state.song.master;
    const el = document.createElement("div"); el.className = "mx-strip master";
    const name = document.createElement("div"); name.className = "mx-name"; name.textContent = "MASTER";
    const glue = makeKnob({ label: "GLUE", min: 0, max: 1, step: 0.02, value: ms.glue, def: 0.3, size: 36, fmt: pct, color: "var(--warn)", onInput: (v) => { ms.glue = v; applyMixer(); }, onChange: () => pushUndo() });
    const width = makeKnob({ label: "WIDTH", min: 0.5, max: 1.5, step: 0.05, value: ms.width, def: 1, size: 30, fmt: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { ms.width = v; applyMixer(); }, onChange: () => pushUndo() });
    const lufs = makeKnob({ label: "LUFS", min: -24, max: -6, step: 0.5, value: ms.targetLufs, def: -14, size: 30, fmt: (v) => `${v}`, onInput: (v) => { ms.targetLufs = v; }, onChange: () => pushUndo() });
    const sends = document.createElement("div"); sends.className = "mx-sends"; sends.append(width.el, lufs.el);
    const fader = makeFader({ min: -40, max: 6, step: 0.5, value: ms.volume, def: -4, onInput: (v) => { setMasterVolume(v); $("#inp-master").value = v; }, onChange: () => pushUndo() });
    masterMeter = makeMeter();
    const fw = document.createElement("div"); fw.className = "mx-fader"; fw.append(fader.el, masterMeter.el);
    el.append(name, glue.el, sends, document.createElement("div"), fw);
    root.appendChild(el);
    tick();
  }
  function tick() {
    cancelAnimationFrame(raf);
    const loop = () => {
      if (!root.classList.contains("view-active")) return;
      const lv = getLevels();
      for (const s of strips) { const v = lv.tracks[s.id] ?? [-100, -100]; s.meter.update(v[0], v[1]); }
      if (masterMeter && lv.master) masterMeter.update(lv.master[0], lv.master[1]);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  on("tracks", () => { if (root.classList.contains("view-active")) render(); });
  on("song", () => { if (root.classList.contains("view-active")) render(); });
  return { render, show() { render(); } };
}
