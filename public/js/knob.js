// ═══════════ ハードウェア風のつまみ (回転ノブ) と縦フェーダー ═══════════
// マウス/タッチで上下にドラッグ、ホイール、ダブルクリックで既定値。log=true で対数スケール。

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

/**
 * @param {object} o
 *   label, min, max, step, value, def(既定値), log(bool), fmt(v)=>string, size(px), color,
 *   onInput(v) ドラッグ中, onChange(v) 離したとき
 */
export function makeKnob(o) {
  const size = o.size ?? 44;
  const el = document.createElement("div");
  el.className = "knob";
  el.style.width = `${size + 16}px`;
  const min = o.min, max = o.max, log = !!o.log;
  const toPos = (v) => log ? (Math.log(clamp(v, min, max)) - Math.log(min)) / (Math.log(max) - Math.log(min)) : (clamp(v, min, max) - min) / (max - min);
  const fromPos = (p) => { let v = log ? Math.exp(Math.log(min) + clamp(p, 0, 1) * (Math.log(max) - Math.log(min))) : min + clamp(p, 0, 1) * (max - min); if (o.step) v = Math.round(v / o.step) * o.step; return clamp(+v.toFixed(6), min, max); };
  let value = o.value ?? o.def ?? min;
  const r = size / 2, cx = r, cy = r;
  const a0 = 135, a1 = 405; // 度: 左下 → 右下 (270°)
  const arc = (from, to) => {
    const p = (a) => [cx + (r - 4) * Math.cos((a * Math.PI) / 180), cy + (r - 4) * Math.sin((a * Math.PI) / 180)];
    const [x1, y1] = p(from), [x2, y2] = p(to);
    return `M ${x1} ${y1} A ${r - 4} ${r - 4} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const color = o.color ?? "var(--blue-neon)";
  el.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <path class="k-track" d="${arc(a0, a1)}" />
      <path class="k-val" d="" style="stroke:${color}" />
      <circle class="k-cap" cx="${cx}" cy="${cy}" r="${r - 9}" />
      <line class="k-ptr" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - (r - 12)}" style="stroke:${color}" />
    </svg>
    <div class="k-label">${o.label ?? ""}</div>
    <div class="k-value"></div>`;
  const valPath = el.querySelector(".k-val"), ptr = el.querySelector(".k-ptr"), valEl = el.querySelector(".k-value");
  const fmt = o.fmt ?? ((v) => (Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(2)));
  function render() {
    const p = toPos(value);
    const ang = a0 + p * (a1 - a0);
    // 中心が 0 のつまみ (パン, EQ) は中央から描く
    const bipolar = o.bipolar ?? (min < 0 && max > 0);
    const from = bipolar ? (a0 + a1) / 2 : a0;
    valPath.setAttribute("d", Math.abs(ang - from) < 0.5 ? "" : arc(Math.min(from, ang), Math.max(from, ang)));
    ptr.setAttribute("transform", `rotate(${ang + 90} ${cx} ${cy})`);
    valEl.textContent = fmt(value);
  }
  function set(v, fire = false) { value = clamp(v, min, max); render(); if (fire) { o.onInput?.(value); } }
  let dragging = false, startY = 0, startPos = 0;
  el.addEventListener("pointerdown", (e) => { dragging = true; startY = e.clientY; startPos = toPos(value); el.setPointerCapture(e.pointerId); e.preventDefault(); });
  el.addEventListener("pointermove", (e) => { if (!dragging) return; const dy = startY - e.clientY; const fine = e.shiftKey ? 0.25 : 1; set(fromPos(startPos + (dy / 160) * fine), true); });
  const end = (e) => { if (!dragging) return; dragging = false; try { el.releasePointerCapture(e.pointerId); } catch {} o.onChange?.(value); };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  el.addEventListener("wheel", (e) => { e.preventDefault(); set(fromPos(toPos(value) - Math.sign(e.deltaY) * 0.03), true); clearTimeout(el._w); el._w = setTimeout(() => o.onChange?.(value), 300); }, { passive: false });
  el.addEventListener("dblclick", () => { if (o.def != null) { set(o.def, true); o.onChange?.(value); } });
  el.title = o.title ?? o.label ?? "";
  render();
  return { el, get value() { return value; }, set: (v) => set(v, false) };
}

/** 縦フェーダー (ミキサー用) */
export function makeFader(o) {
  const el = document.createElement("div");
  el.className = "fader";
  const inp = document.createElement("input");
  inp.type = "range"; inp.min = o.min; inp.max = o.max; inp.step = o.step ?? 0.5; inp.value = o.value ?? 0;
  const val = document.createElement("div"); val.className = "f-value";
  const fmt = o.fmt ?? ((v) => `${v > 0 ? "+" : ""}${(+v).toFixed(1)}`);
  val.textContent = fmt(inp.value);
  inp.addEventListener("input", () => { val.textContent = fmt(inp.value); o.onInput?.(+inp.value); });
  inp.addEventListener("change", () => o.onChange?.(+inp.value));
  inp.addEventListener("dblclick", () => { if (o.def != null) { inp.value = o.def; val.textContent = fmt(o.def); o.onInput?.(o.def); o.onChange?.(o.def); } });
  el.append(inp, val);
  return { el, set: (v) => { inp.value = v; val.textContent = fmt(v); } };
}

/** レベルメーター (dB → 縦バー)。update(dbL, dbR) で描画 */
export function makeMeter() {
  const el = document.createElement("div");
  el.className = "meter";
  el.innerHTML = `<div class="m-bar"><i></i></div><div class="m-bar"><i></i></div><div class="m-peak"></div>`;
  const bars = el.querySelectorAll(".m-bar i"), peakEl = el.querySelector(".m-peak");
  let peak = -100, peakT = 0;
  return {
    el,
    update(l, r) {
      const vals = [l, r ?? l];
      vals.forEach((db, i) => { const p = clamp((db + 60) / 60, 0, 1); bars[i].style.height = `${p * 100}%`; bars[i].style.background = db > -3 ? "var(--danger)" : db > -12 ? "var(--warn)" : "var(--ok)"; });
      const m = Math.max(...vals);
      const now = performance.now();
      if (m > peak || now - peakT > 1500) { peak = m; peakT = now; }
      peakEl.textContent = peak > -60 ? peak.toFixed(0) : "";
      peakEl.style.color = peak > -1 ? "var(--danger)" : "var(--txt-dim)";
    },
  };
}
