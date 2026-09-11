// ═══════════ レーン表示: ドラム (左手) / バスドラ (左足) / 足鍵盤 (右足) / つまみ (右手) ═══════════
// ピアノロール (右手のシンセ) の下に置き、横スクロールと拍の幅はピアノロールに合わせる。

import { state } from "../js/state.js";
import { THEME } from "../js/pianoroll.js";
import { DRUM_LABEL, KEY_OF_DRUM } from "./prompts.js";
import { KNOBS, knobDefaults } from "../js/synth2.js";
import { noteName } from "../js/prompts.js";
import { KNOB_MEANINGS } from "./ar.js";

const DRUM_ROWS = ["cr", "t1", "t2", "t3", "sn", "hh"];
const ROW_LABEL = { cr: "CRASH", t1: "TOM 1", t2: "TOM 2", t3: "F.TOM", sn: "SNARE", hh: "HI-HAT" };

export class Lanes {
  constructor(canvas, proll, getParts) {
    this.cv = canvas; this.ctx = canvas.getContext("2d"); this.proll = proll; this.getParts = getParts;
    this.rowH = 14; this.gap = 6;
    const ro = new ResizeObserver(() => this.resize()); ro.observe(canvas.parentElement);
    this.resize();
    canvas.addEventListener("pointerdown", (e) => { const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left; if (x < proll.keyW) return; const b = proll.xToBeat(x); if (this.onSeek) this.onSeek(Math.max(0, b)); });
    canvas.addEventListener("pointermove", e => {
      const x=e.clientX-canvas.getBoundingClientRect().left, beat=proll.xToBeat(x);
      const event=this.knobRows?.find(n=>beat>=n.s&&beat<=n.s+n.d);
      canvas.title=event?`${event.label}：${KNOB_MEANINGS[event.param]?.name??""} ${Math.round(event.from*100)} → ${Math.round(event.to*100)}`:"";
    });
    let last = null;
    const tick = () => { requestAnimationFrame(tick); const key = `${proll.scrollX}|${proll.pxPerBeat}|${state.playheadBeat}`; if (key !== last) { last = key; this.draw(); } };
    requestAnimationFrame(tick);
  }
  resize() {
    const r = this.cv.parentElement.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    this.w = Math.max(100, r.width); this.h = Math.max(60, r.height);
    this.cv.width = this.w * dpr; this.cv.height = this.h * dpr; this.cv.style.width = this.w + "px"; this.cv.style.height = this.h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.draw();
  }
  draw() {
    const { ctx, w, h, proll } = this; const ts = state.song.timeSig; const keyW = proll.keyW;
    const parts = this.getParts();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = THEME.rowWhite; ctx.fillRect(0, 0, w, h);
    const rows = [];
    let y = 4;
    for (const k of DRUM_ROWS) { rows.push({ id: k, y, label: ROW_LABEL[k], kind: "drum" }); y += this.rowH; }
    rows.push({ id: "kick", y: y + 2, label: "KICK", kind: "kick" }); y += this.rowH + 2;
    rows.push({ id: "pedal", y: y + this.gap, label: "PEDAL", kind: "pedal", h: this.rowH + 4 }); y += this.rowH + 4 + this.gap;
    rows.push({ id: "knob", y: y + this.gap, label: "KNOBS", kind: "knob", h: 34 }); y += this.rowH + 4 + this.gap;
    // 行の背景と線
    for (const r of rows) { const rh = r.h ?? this.rowH; ctx.fillStyle = r.kind === "drum" ? THEME.rowBlack : THEME.rowWhite; ctx.fillRect(keyW, r.y, w - keyW, rh); ctx.strokeStyle = THEME.rowLine; ctx.beginPath(); ctx.moveTo(keyW, r.y + rh + 0.5); ctx.lineTo(w, r.y + rh + 0.5); ctx.stroke(); }
    // 拍と小節
    const beat0 = Math.floor(proll.scrollX), beatN = Math.ceil(proll.xToBeat(w));
    for (let b = beat0; b <= beatN; b++) { if (b < 0) continue; const x = proll.beatToX(b); const isBar = b % ts === 0; ctx.strokeStyle = isBar ? THEME.gridBar : THEME.gridBeat; ctx.lineWidth = isBar ? 1.4 : 1; ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
    ctx.lineWidth = 1;
    const lit = (s, d) => THEME.lit && state.playing && state.playheadBeat >= s && state.playheadBeat < s + Math.max(d, 0.12);
    // ドラム / キック
    const drawHit = (row, n) => { const x = proll.beatToX(n.s); if (x < keyW - 4 || x > w) return; const on = lit(n.s, 0.1); const a = 0.4 + (n.v / 127) * 0.6; ctx.fillStyle = on ? THEME.lit : row.kind === "kick" ? "#cfcfcf" : "#f2f2f2"; ctx.globalAlpha = on ? 1 : a; ctx.beginPath(); ctx.roundRect(x - 1, row.y + 2, Math.max(4, proll.pxPerBeat * 0.12), this.rowH - 4, 2); ctx.fill(); ctx.globalAlpha = 1; };
    for (const n of parts.drums) { const k = n.k ?? KEY_OF_DRUM[n.p]; const row = rows.find((r) => r.id === k); if (row) drawHit(row, n); }
    { const row = rows.find((r) => r.id === "kick"); for (const n of parts.kick) drawHit(row, n); }
    // 足鍵盤: 音の名前つきのブロック
    { const row = rows.find((r) => r.id === "pedal"); const rh = row.h;
      for (const n of parts.pedal) { const x = proll.beatToX(n.s), nw = Math.max(4, n.d * proll.pxPerBeat - 1); if (x + nw < keyW || x > w) continue; const on = lit(n.s, n.d); ctx.fillStyle = on ? THEME.lit : "#8c8c8c"; ctx.globalAlpha = on ? 1 : 0.5 + (n.v / 127) * 0.5; ctx.beginPath(); ctx.roundRect(x, row.y + 2, nw, rh - 4, 2.5); ctx.fill(); ctx.globalAlpha = 1; if (nw > 18) { ctx.fillStyle = "#000"; ctx.font = "bold 9px 'IBM Plex Mono'"; ctx.fillText(noteName(n.p), x + 3, row.y + rh - 5); } } }
    // Label and direction stay above the exact-duration strip; clip before the next label.
    { const row=rows.find(r=>r.id==="knob"), values=knobDefaults(state.song.tracks.find(t=>t.role==="keys")?.synth2);
      this.knobRows=parts.knobs.map(k=>{const from=values[k.param]??.5;values[k.param]=k.to;return {...k,from,label:KNOBS.find(q=>q.id===k.param)?.label??k.param};});
      this.knobRows.forEach((k,i)=>{
        const x=proll.beatToX(k.s),nw=Math.max(6,k.d*proll.pxPerBeat-1),endX=this.knobRows[i+1]?proll.beatToX(this.knobRows[i+1].s)-3:w;
        if(endX<keyW||x>w)return;
        ctx.save();ctx.beginPath();ctx.rect(Math.max(keyW,x),row.y,Math.max(0,Math.min(w,endX)-Math.max(keyW,x)),row.h);ctx.clip();
        ctx.fillStyle=lit(k.s,k.d)?"#f1d798":"#c6a35c";ctx.fillRect(x,row.y+19,nw,10);
        const arrow=k.to>=k.from?"↑":"↓";ctx.fillStyle="#e4c67f";ctx.font="11px 'IBM Plex Mono', monospace";
        ctx.fillText(`${k.label} ${arrow} ${Math.round(k.from*100)}→${Math.round(k.to*100)}`,x+1,row.y+13);
        ctx.fillStyle="#0a0906";ctx.font="10px sans-serif";if(nw>55)ctx.fillText(KNOB_MEANINGS[k.param]?.name??"",x+3,row.y+28);else ctx.fillText(arrow,x+3,row.y+28);
        ctx.restore();
      });
    }
    // 再生位置
    const px = proll.beatToX(state.playheadBeat); if (px >= keyW) { ctx.strokeStyle = THEME.playhead; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px + 0.5, 0); ctx.lineTo(px + 0.5, h); ctx.stroke(); ctx.lineWidth = 1; }
    // 左の名札
    ctx.fillStyle = THEME.rulerBg; ctx.fillRect(0, 0, keyW, h); ctx.strokeStyle = THEME.rulerLine; ctx.beginPath(); ctx.moveTo(keyW + 0.5, 0); ctx.lineTo(keyW + 0.5, h); ctx.stroke();
    ctx.font = "9px 'IBM Plex Mono'";
    for (const r of rows) { const rh = r.h ?? this.rowH; ctx.fillStyle = r.kind === "knob" ? "#e0b95a" : THEME.rulerText; ctx.fillText(r.label, 6, r.y + rh - 4); }
    ctx.fillStyle = "#4a4a4a"; ctx.font = "8px 'IBM Plex Mono'";
    ctx.fillText("L HAND", keyW - 34, 12); ctx.fillText("L FOOT", keyW - 34, rows.find((r) => r.id === "kick").y + this.rowH - 4 - 10 + 10);
  }
}
