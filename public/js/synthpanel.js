// ═══════════ シンセ音色パネル (ダイアログ) ═══════════
// PATCH_UI の表からスライダー/セレクトを自動生成する。変えた瞬間に音源を組み直して試聴できる。

import { PRESETS, PATCH_UI, getPath, setPath, clonePatch, normalizePatch } from "./synth.js";
import { patchOf, refreshTrack, previewNote } from "./audio.js";
import { pushUndo, emit } from "./state.js";
import { t } from "./i18n.js";

const $ = (s) => document.querySelector(s);

export function initSynthPanel({ onDesign, log }) {
  const dlg = $("#dlg-synth");
  const body = $("#synth-body");
  const presetSel = $("#synth-preset");
  const aiInput = $("#synth-ai-input");
  let track = null;
  let patch = null;
  let applyTimer = null;

  presetSel.innerHTML = `<option value="">—</option>` + Object.keys(PRESETS).map((k) => `<option value="${k}">${k}</option>`).join("");

  function render() {
    body.innerHTML = "";
    for (const g of PATCH_UI) {
      if (g.path.startsWith("osc.")) {
        const idx = +g.path.split(".")[1];
        if (idx >= (patch.osc?.length ?? 0)) {
          if (idx === (patch.osc?.length ?? 0) && idx < 3) {
            const add = document.createElement("button"); add.className = "gbtn small"; add.textContent = `+ ${g.group}`;
            add.addEventListener("click", () => { patch.osc.push(clonePatch(PRESETS["Poly Stab"].osc[0])); render(); schedule(); });
            body.appendChild(add);
          }
          continue;
        }
      }
      const sec = document.createElement("div"); sec.className = "syn-group";
      sec.innerHTML = `<div class="syn-group-head">${g.group}</div>`;
      const grid = document.createElement("div"); grid.className = "syn-grid";
      for (const f of g.fields) {
        const [name, kind, a, b, c] = f;
        const path = g.path ? `${g.path}.${name}` : name;
        const row = document.createElement("label"); row.className = "syn-field";
        const cur = getPath(patch, path);
        let ctrl;
        if (kind === "select") {
          ctrl = document.createElement("select");
          ctrl.innerHTML = a.map((o) => `<option value="${o}" ${String(o) === String(cur) ? "selected" : ""}>${o}</option>`).join("");
          ctrl.addEventListener("change", () => { const v = typeof a[0] === "number" ? +ctrl.value : ctrl.value; setPath(patch, path, v); schedule(); });
        } else if (kind === "bool") {
          ctrl = document.createElement("input"); ctrl.type = "checkbox"; ctrl.checked = !!cur;
          ctrl.addEventListener("change", () => { setPath(patch, path, ctrl.checked); schedule(); });
        } else if (kind === "log") {
          ctrl = document.createElement("input"); ctrl.type = "range"; ctrl.min = 0; ctrl.max = 1000; ctrl.step = 1;
          const lo = Math.log(a), hi = Math.log(b);
          ctrl.value = Math.round(((Math.log(Math.max(a, Math.min(b, cur ?? a))) - lo) / (hi - lo)) * 1000);
          const val = document.createElement("span"); val.className = "syn-val"; val.textContent = fmt(cur);
          ctrl.addEventListener("input", () => { const v = Math.exp(lo + (ctrl.value / 1000) * (hi - lo)); setPath(patch, path, +v.toPrecision(4)); val.textContent = fmt(v); schedule(); });
          row.append(document.createTextNode(name), ctrl, val); grid.appendChild(row); continue;
        } else {
          ctrl = document.createElement("input"); ctrl.type = "range"; ctrl.min = a; ctrl.max = b; ctrl.step = c ?? 0.01; ctrl.value = cur ?? a;
          const val = document.createElement("span"); val.className = "syn-val"; val.textContent = fmt(cur);
          ctrl.addEventListener("input", () => { setPath(patch, path, +ctrl.value); val.textContent = fmt(+ctrl.value); schedule(); });
          row.append(document.createTextNode(name), ctrl, val); grid.appendChild(row); continue;
        }
        row.append(document.createTextNode(name), ctrl); grid.appendChild(row);
      }
      sec.appendChild(grid); body.appendChild(sec);
    }
    $("#synth-name").value = patch.name ?? "";
    $("#synth-desc").textContent = patch.description ?? "";
  }
  const fmt = (v) => (typeof v === "number" ? (Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(3)) : String(v));

  function schedule() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(apply, 120);
  }
  async function apply() {
    if (!track) return;
    track.patch = normalizePatch(patch);
    track.patch.name = $("#synth-name").value || track.patch.name;
    await refreshTrack(track);
    emit("tracks");
  }

  presetSel.addEventListener("change", () => {
    if (!PRESETS[presetSel.value]) return;
    patch = clonePatch(PRESETS[presetSel.value]);
    render(); schedule(); pushUndo();
  });
  $("#synth-name").addEventListener("change", () => { patch.name = $("#synth-name").value; schedule(); });
  $("#btn-synth-audition").addEventListener("click", async () => {
    if (!track) return;
    await apply();
    const base = track.instrument === "synth-bass" ? 40 : 60;
    for (const [i, p] of [0, 4, 7, 12].entries()) setTimeout(() => previewNote(track, base + p, 100, 0.5), i * 260);
  });
  $("#btn-synth-copy").addEventListener("click", () => { navigator.clipboard?.writeText(JSON.stringify(normalizePatch(patch), null, 1)); });
  $("#btn-synth-ai").addEventListener("click", async () => {
    const desc = aiInput.value.trim();
    if (!desc || !track) return;
    const btn = $("#btn-synth-ai"); btn.disabled = true;
    try {
      const p = await onDesign(track, desc);
      patch = clonePatch(p); render(); await apply(); pushUndo();
    } catch (e) { log?.(`音色設計に失敗: ${e.message}`, "err"); }
    finally { btn.disabled = false; }
  });
  $("#btn-synth-close").addEventListener("click", () => { pushUndo(); dlg.close(); });

  return {
    open(tr) {
      track = tr;
      patch = clonePatch(patchOf(tr));
      presetSel.value = PRESETS[patch.name] ? patch.name : "";
      render();
      dlg.showModal();
    },
    refresh() { if (dlg.open && track) { patch = clonePatch(patchOf(track)); render(); } },
  };
}
