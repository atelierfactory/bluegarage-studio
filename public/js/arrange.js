// ═══════════ arrangement overview (canvas) ═══════════

import { state, totalBars, on, emit, sectionAtBar } from "./state.js";
import { seek } from "./audio.js";

export const ARR_THEME = {
  sections: ["rgba(47,123,255,.16)", "rgba(56,195,255,.10)", "rgba(124,92,255,.14)", "rgba(67,230,160,.10)", "rgba(255,200,87,.10)"],
  sectionLine: "rgba(47,123,255,.4)", sectionText: "#bcd4ff", gridMajor: "#1d3054", gridMinor: "#12203a", barNum: "#5f77a3", chord: "#ffc857", rulerLine: "#27407a",
  laneSel: "rgba(47,123,255,.10)", laneLine: "#15233f", laneText: "#8ba3cc", laneTextSel: "#fff", playhead: "#38c3ff", empty: "#3c5580", noteColor: null,
};
export class Arrange {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.rulerH = 34;
    this.laneGap = 3;
    this._bind();
    on("song", () => this.draw());
    on("tracks", () => this.draw());
    on("notes", () => this.draw());
    on("selection", () => this.draw());
    on("playhead", () => this.draw());
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas.parentElement);
    this.resize();
  }

  resize() {
    const r = this.cv.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = Math.max(100, r.width); this.h = Math.max(80, r.height);
    this.cv.width = this.w * dpr; this.cv.height = this.h * dpr;
    this.cv.style.width = this.w + "px"; this.cv.style.height = this.h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  pxPerBar() { return Math.max(10, (this.w - 10) / totalBars()); }

  _bind() {
    this.cv.addEventListener("mousedown", (e) => {
      const rect = this.cv.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const bar = x / this.pxPerBar();
      if (y <= this.rulerH) {
        seek(Math.max(0, bar * state.song.timeSig));
        return;
      }
      // レーンクリックでトラック選択
      const tracks = state.song.tracks;
      if (!tracks.length) return;
      const laneH = (this.h - this.rulerH) / tracks.length;
      const idx = Math.floor((y - this.rulerH) / laneH);
      if (tracks[idx]) {
        state.selectedTrackId = tracks[idx].id;
        emit("selection");
        emit("tracks");
      }
    });
  }

  draw() {
    const { ctx, w, h } = this;
    const song = state.song;
    const bars = totalBars();
    const ppb = this.pxPerBar();
    ctx.clearRect(0, 0, w, h);

    // ── セクション帯
    let bar = 0;
    const secColors = ARR_THEME.sections;
    (song.sections ?? []).forEach((s, i) => {
      const x = bar * ppb, sw = s.bars * ppb;
      ctx.fillStyle = secColors[i % secColors.length];
      ctx.fillRect(x, 0, sw, h);
      ctx.strokeStyle = ARR_THEME.sectionLine;
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
      ctx.fillStyle = ARR_THEME.sectionText;
      ctx.font = "900 11px 'Zen Kaku Gothic New'";
      ctx.fillText(s.name, x + 6, 14);
      bar += s.bars;
    });

    // ── バーグリッド + 番号
    ctx.font = "9px 'IBM Plex Mono'";
    for (let b = 0; b <= bars; b++) {
      const x = b * ppb;
      const major = b % 4 === 0;
      ctx.strokeStyle = major ? ARR_THEME.gridMajor : ARR_THEME.gridMinor;
      ctx.beginPath(); ctx.moveTo(x + 0.5, this.rulerH); ctx.lineTo(x + 0.5, h); ctx.stroke();
      if (major && ppb > 4) {
        ctx.fillStyle = ARR_THEME.barNum;
        ctx.fillText(String(b + 1), x + 3, this.rulerH - 12);
      }
    }

    // ── コード(ルーラー下段)
    ctx.font = "9px 'IBM Plex Mono'";
    ctx.fillStyle = ARR_THEME.chord;
    for (const c of song.chordProgression ?? []) {
      const x = (c.bar + c.beat / song.timeSig) * ppb;
      if (ppb >= 18 || c.beat === 0) ctx.fillText(c.chord, x + 2, this.rulerH - 2);
    }
    ctx.strokeStyle = ARR_THEME.rulerLine;
    ctx.beginPath(); ctx.moveTo(0, this.rulerH + 0.5); ctx.lineTo(w, this.rulerH + 0.5); ctx.stroke();

    // ── トラックレーン
    const tracks = song.tracks;
    if (tracks.length) {
      const laneH = (h - this.rulerH) / tracks.length;
      tracks.forEach((t, i) => {
        const ly = this.rulerH + i * laneH;
        const sel = t.id === state.selectedTrackId;
        if (sel) {
          ctx.fillStyle = ARR_THEME.laneSel;
          ctx.fillRect(0, ly, w, laneH);
        }
        ctx.strokeStyle = ARR_THEME.laneLine;
        ctx.beginPath(); ctx.moveTo(0, ly + laneH + 0.5); ctx.lineTo(w, ly + laneH + 0.5); ctx.stroke();

        // ノートのミニブロック
        const ts = song.timeSig;
        let lo = 127, hi = 0;
        for (const n of t.notes) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); }
        const span = Math.max(12, hi - lo + 1);
        ctx.fillStyle = ARR_THEME.noteColor ?? t.color;
        ctx.globalAlpha = t.mute ? 0.25 : 0.85;
        const noteH = Math.max(1.5, Math.min(4, (laneH - 8) / span));
        for (const n of t.notes) {
          const x = (n.s / ts) * ppb;
          const nw = Math.max(1.5, (n.d / ts) * ppb);
          const ny = ly + 4 + (1 - (n.p - lo) / span) * (laneH - 10);
          ctx.fillRect(x, ny, nw, noteH);
        }
        ctx.globalAlpha = 1;

        // レーンラベル
        ctx.fillStyle = sel ? ARR_THEME.laneTextSel : ARR_THEME.laneText;
        ctx.font = `${sel ? "900" : "500"} 10px 'Zen Kaku Gothic New'`;
        ctx.fillText(t.name, 6, ly + 12);
        if (t.mute) { ctx.fillStyle = "#ffc857"; ctx.fillText("M", w - 16, ly + 12); }
        if (t.solo) { ctx.fillStyle = "#43e6a0"; ctx.fillText("S", w - 28, ly + 12); }
      });
    } else {
      ctx.fillStyle = ARR_THEME.empty; ctx.font = "12px 'Zen Kaku Gothic New'";
      ctx.fillText("トラックがありません。左の「+ 追加」か、右のAIパネルで設計図から始めてください。", 20, this.rulerH + 30);
    }

    // ── プレイヘッド
    const px = (state.playheadBeat / song.timeSig) * ppb;
    ctx.strokeStyle = ARR_THEME.playhead; ctx.lineWidth = 1.5;
    ctx.shadowColor = ARR_THEME.playhead; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineWidth = 1;
  }
}
