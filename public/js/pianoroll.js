// ═══════════ piano roll (canvas) ═══════════

import { state, selectedTrack, totalBeats, pushUndo, emit, on, uid, chordAtBeat } from "./state.js";
import { previewNote, seek } from "./audio.js";

const GM_DRUM_NAMES = {
  35: "Kick 2", 36: "Kick", 37: "SideStick", 38: "Snare", 39: "Clap", 40: "Snare 2",
  41: "F.Tom 2", 42: "HH Close", 43: "F.Tom", 44: "HH Pedal", 45: "L.Tom", 46: "HH Open",
  47: "M.Tom", 48: "H.Tom", 49: "Crash", 50: "H.Tom 2", 51: "Ride", 53: "RideBell",
  54: "Tamb", 55: "Splash", 56: "Cowbell", 57: "Crash 2", 59: "Ride 2",
};
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACK = new Set([1, 3, 6, 8, 10]);
function hexA(hex, a) { const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); if (!m) return hex; return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})`; }

export class PianoRoll {
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.getSnap = opts.getSnap ?? (() => 0.25);
    this.keyW = 64;
    this.rulerH = 26;
    this.pxPerBeat = 42;
    this.rowH = 13;
    this.scrollX = 0;   // beats
    this.scrollY = 72;  // top pitch (MIDI)
    this.selection = new Set();
    this.drag = null;
    this.hoverNote = null;
    this._bindEvents();
    on("playhead", () => this.draw());
    on("song", () => this.draw());
    on("selection", () => { this.selection.clear(); this.autoScroll(); this.draw(); });
    on("notes", () => this.draw());
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas.parentElement);
    this.resize();
  }

  resize() {
    const r = this.cv.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = Math.max(100, r.width); this.h = Math.max(100, r.height);
    this.cv.width = this.w * dpr; this.cv.height = this.h * dpr;
    this.cv.style.width = this.w + "px"; this.cv.style.height = this.h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  /* ── coordinate helpers ── */
  beatToX(b) { return this.keyW + (b - this.scrollX) * this.pxPerBeat; }
  xToBeat(x) { return (x - this.keyW) / this.pxPerBeat + this.scrollX; }
  pitchToY(p) { return this.rulerH + (this.scrollY - p) * this.rowH; }
  yToPitch(y) { return Math.round(this.scrollY - (y - this.rulerH) / this.rowH + 0.0); }

  snapBeat(b, floor = true) {
    const s = this.getSnap();
    if (!s) return b;
    return (floor ? Math.floor(b / s) : Math.round(b / s)) * s;
  }

  autoScroll() {
    const t = selectedTrack();
    if (!t || !t.notes.length) { this.scrollY = t?.instrument === "drums" ? 52 : 72; return; }
    let lo = 127, hi = 0;
    for (const n of t.notes) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); }
    this.scrollY = Math.min(120, Math.max(24, Math.round((lo + hi) / 2) + Math.floor((this.h - this.rulerH) / this.rowH / 2)));
  }

  noteAt(x, y) {
    const t = selectedTrack();
    if (!t) return null;
    const b = this.xToBeat(x), p = this.yToPitch(y);
    // 逆順(上に描かれたもの優先)
    for (let i = t.notes.length - 1; i >= 0; i--) {
      const n = t.notes[i];
      if (n.p === p && b >= n.s && b <= n.s + Math.max(n.d, 0.12)) return n;
    }
    return null;
  }

  /* ── events ── */
  _bindEvents() {
    const cv = this.cv;
    cv.addEventListener("contextmenu", (e) => e.preventDefault());

    cv.addEventListener("mousedown", (e) => {
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const t = selectedTrack();
      if (!t) return;

      // ルーラー: シーク
      if (y < this.rulerH && x > this.keyW) {
        seek(Math.max(0, this.xToBeat(x)));
        return;
      }
      // 鍵盤: 試聴
      if (x < this.keyW) {
        const p = this.yToPitch(y);
        if (p >= 0 && p <= 127) previewNote(t, p);
        return;
      }

      const n = this.noteAt(x, y);
      // 削除 (alt+クリック / 右クリック)
      if (n && (e.altKey || e.button === 2)) {
        t.notes = t.notes.filter((m) => m !== n);
        this.selection.delete(n.id);
        pushUndo(); emit("notes"); emit("tracks");
        return;
      }
      if (e.button === 2) return;

      if (n) {
        // 選択 & ドラッグ開始
        if (e.shiftKey) {
          this.selection.has(n.id) ? this.selection.delete(n.id) : this.selection.add(n.id);
        } else if (!this.selection.has(n.id)) {
          this.selection.clear(); this.selection.add(n.id);
        }
        const nearRight = x > this.beatToX(n.s + n.d) - 6;
        this.drag = {
          mode: nearRight ? "resize" : "move",
          startX: x, startY: y,
          orig: [...this.selection].map((id) => {
            const note = t.notes.find((m) => m.id === id);
            return note ? { note, s: note.s, p: note.p, d: note.d } : null;
          }).filter(Boolean),
          moved: false,
        };
        previewNote(t, n.p, n.v);
      } else {
        // 新規ノート追加
        const b = this.snapBeat(this.xToBeat(x));
        const p = this.yToPitch(y);
        if (b < 0 || p < 0 || p > 127) return;
        const snap = this.getSnap() || 0.25;
        const dur = t.instrument === "drums" ? Math.min(0.25, snap) : Math.max(snap, 0.25);
        const note = { id: uid(), p, s: b, d: dur, v: 96 };
        t.notes.push(note);
        this.selection.clear(); this.selection.add(note.id);
        this.drag = { mode: "resize", startX: x, startY: y, orig: [{ note, s: note.s, p: note.p, d: note.d }], moved: false, isNew: true };
        previewNote(t, p);
        emit("notes"); emit("tracks");
      }
      this.draw();
    });

    window.addEventListener("mousemove", (e) => {
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (!this.drag) {
        const n = this.noteAt(x, y);
        const resizing = n && x > this.beatToX(n.s + n.d) - 6;
        cv.style.cursor = y < this.rulerH ? "pointer" : n ? (resizing ? "ew-resize" : "grab") : x < this.keyW ? "pointer" : "cell";
        if (n !== this.hoverNote) { this.hoverNote = n; this.draw(); }
        return;
      }
      const d = this.drag;
      const t = selectedTrack(); if (!t) return;
      const dBeat = (x - d.startX) / this.pxPerBeat;
      const dPitch = Math.round(-(y - d.startY) / this.rowH);
      const snap = this.getSnap();

      if (d.mode === "move") {
        for (const o of d.orig) {
          let ns = o.s + dBeat;
          if (snap) ns = Math.round(ns / snap) * snap;
          o.note.s = Math.max(0, ns);
          o.note.p = Math.max(0, Math.min(127, o.p + dPitch));
        }
      } else {
        for (const o of d.orig) {
          let nd = o.d + dBeat;
          if (snap) nd = Math.max(snap, Math.round(nd / snap) * snap);
          o.note.d = Math.max(0.05, nd);
        }
      }
      d.moved = true;
      this.draw();
    });

    window.addEventListener("mouseup", () => {
      if (this.drag) {
        if (this.drag.moved || this.drag.isNew) { pushUndo(); emit("tracks"); }
        this.drag = null;
        emit("notes");
      }
    });

    // ホイール: スクロール / ⌘=ズーム / ノート上=ベロシティ
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;

      if (e.metaKey || e.ctrlKey) {
        const beforeBeat = this.xToBeat(x);
        this.pxPerBeat = Math.max(8, Math.min(160, this.pxPerBeat * (e.deltaY < 0 ? 1.12 : 0.9)));
        this.scrollX += beforeBeat - this.xToBeat(x);
        this.draw();
        return;
      }
      const n = this.noteAt(x, y);
      if (n && this.selection.has(n.id)) {
        const dv = e.deltaY < 0 ? 4 : -4;
        const t = selectedTrack();
        for (const id of this.selection) {
          const m = t.notes.find((q) => q.id === id);
          if (m) m.v = Math.max(1, Math.min(127, m.v + dv));
        }
        emit("notes"); this.draw();
        return;
      }
      if (e.shiftKey) {
        this.scrollX = Math.max(0, this.scrollX + e.deltaY / this.pxPerBeat);
      } else {
        this.scrollY = Math.max(12, Math.min(126, this.scrollY + (e.deltaY > 0 ? -2 : 2)));
        this.scrollX = Math.max(0, this.scrollX + e.deltaX / this.pxPerBeat);
      }
      this.draw();
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea, select")) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        const t = selectedTrack();
        if (!t || !this.selection.size) return;
        t.notes = t.notes.filter((n) => !this.selection.has(n.id));
        this.selection.clear();
        pushUndo(); emit("notes"); emit("tracks");
        this.draw();
      }
      if (e.key === "a" && (e.metaKey || e.ctrlKey)) {
        const t = selectedTrack(); if (!t) return;
        e.preventDefault();
        this.selection = new Set(t.notes.map((n) => n.id));
        this.draw();
      }
    });
  }

  /* ── drawing ── */
  draw() {
    const { ctx, w, h } = this;
    const t = selectedTrack();
    const ts = state.song.timeSig;
    ctx.clearRect(0, 0, w, h);

    // 背景の行
    const isDrum = t?.instrument === "drums";
    for (let p = this.scrollY; p >= this.yToPitch(h); p--) {
      if (p < 0 || p > 127) continue;
      const y = this.pitchToY(p);
      const pc = p % 12;
      ctx.fillStyle = BLACK.has(pc) ? "#0a1120" : "#0d1526";
      if (isDrum && GM_DRUM_NAMES[p]) ctx.fillStyle = "#0f1c33";
      ctx.fillRect(this.keyW, y, w - this.keyW, this.rowH);
      ctx.strokeStyle = pc === 11 ? "#1d3054" : "#111c30";
      ctx.beginPath(); ctx.moveTo(this.keyW, y + this.rowH + 0.5); ctx.lineTo(w, y + this.rowH + 0.5); ctx.stroke();
    }

    // 拍/小節グリッド
    const beat0 = Math.floor(this.scrollX);
    const beatN = Math.ceil(this.xToBeat(w));
    for (let b = beat0; b <= beatN; b++) {
      if (b < 0) continue;
      const x = this.beatToX(b);
      const isBar = b % ts === 0;
      ctx.strokeStyle = isBar ? "#27407a" : "#15233f";
      ctx.lineWidth = isBar ? 1.4 : 1;
      ctx.beginPath(); ctx.moveTo(x + 0.5, this.rulerH); ctx.lineTo(x + 0.5, h); ctx.stroke();
      // サブディビジョン
      const snap = this.getSnap();
      if (snap && this.pxPerBeat * snap > 7 && snap < 1) {
        ctx.strokeStyle = "#0f1a30";
        for (let sb = snap; sb < 1; sb += snap) {
          const sx = this.beatToX(b + sb);
          ctx.beginPath(); ctx.moveTo(sx + 0.5, this.rulerH); ctx.lineTo(sx + 0.5, h); ctx.stroke();
        }
      }
    }
    ctx.lineWidth = 1;

    // ノート
    if (t) {
      const color = t.color || "#38c3ff";
      for (const n of t.notes) {
        const x = this.beatToX(n.s), y = this.pitchToY(n.p);
        const nw = Math.max(4, n.d * this.pxPerBeat - 1);
        if (x + nw < this.keyW || x > w || y < this.rulerH - this.rowH || y > h) continue;
        const sel = this.selection.has(n.id);
        const alpha = 0.35 + (n.v / 127) * 0.65;
        ctx.fillStyle = sel ? "#ffffff" : color;
        if (!sel && n.v2 != null && n.v2 !== n.v && nw > 6) {
          // v2 (終わりの強さ): 濃さのグラデーションで表示
          const g = ctx.createLinearGradient(x, 0, x + nw, 0);
          const a2 = 0.35 + (n.v2 / 127) * 0.65;
          g.addColorStop(0, hexA(color, alpha)); g.addColorStop(1, hexA(color, a2));
          ctx.fillStyle = g; ctx.globalAlpha = 1;
        } else ctx.globalAlpha = sel ? 0.95 : alpha;
        ctx.beginPath();
        ctx.roundRect(x, y + 1, nw, this.rowH - 2, 2.5);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (sel) { ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1; }
        // ベロシティバー
        if (nw > 10) {
          ctx.fillStyle = "rgba(0,0,0,.45)";
          ctx.fillRect(x + 2, y + this.rowH - 4, (nw - 4) * (n.v / 127), 2);
        }
      }
    }

    // ルーラー
    ctx.fillStyle = "#0a1224";
    ctx.fillRect(0, 0, w, this.rulerH);
    ctx.strokeStyle = "#27407a";
    ctx.beginPath(); ctx.moveTo(0, this.rulerH + 0.5); ctx.lineTo(w, this.rulerH + 0.5); ctx.stroke();
    ctx.font = "10px 'IBM Plex Mono'";
    for (let b = beat0; b <= beatN; b++) {
      if (b < 0 || b % ts !== 0) continue;
      const x = this.beatToX(b);
      ctx.fillStyle = "#7d93bd";
      ctx.fillText(String(b / ts + 1), x + 4, 11);
      // コード名
      const ch = chordAtBeat(b);
      if (ch) {
        const prev = b - ts >= 0 ? chordAtBeat(b - ts) : null;
        ctx.fillStyle = "#ffc857";
        // 同じコードが続く場合も小節頭に薄く表示
        ctx.globalAlpha = ch === prev ? 0.35 : 1;
        ctx.fillText(ch, x + 4, 23);
        ctx.globalAlpha = 1;
      }
    }
    // 拍単位のコードチェンジ(小節頭以外)
    for (const c of state.song.chordProgression ?? []) {
      if (c.beat > 0) {
        const b = c.bar * ts + c.beat;
        if (b >= beat0 && b <= beatN) {
          ctx.fillStyle = "#ffc857"; ctx.globalAlpha = 0.8;
          ctx.fillText(c.chord, this.beatToX(b) + 2, 23);
          ctx.globalAlpha = 1;
        }
      }
    }

    // 鍵盤
    ctx.fillStyle = "#0d1526";
    ctx.fillRect(0, this.rulerH, this.keyW, h - this.rulerH);
    for (let p = this.scrollY; p >= this.yToPitch(h); p--) {
      if (p < 0 || p > 127) continue;
      const y = this.pitchToY(p);
      const pc = p % 12;
      if (isDrum) {
        const name = GM_DRUM_NAMES[p];
        ctx.fillStyle = name ? "#14264a" : "#0a1120";
        ctx.fillRect(0, y, this.keyW - 1, this.rowH - 1);
        if (name) {
          ctx.fillStyle = "#9db8e8"; ctx.font = "8.5px 'IBM Plex Mono'";
          ctx.fillText(name, 4, y + this.rowH - 4);
        }
      } else {
        ctx.fillStyle = BLACK.has(pc) ? "#1a2846" : "#dfe9fb";
        ctx.fillRect(0, y, this.keyW - 1, this.rowH - 1);
        if (pc === 0) {
          ctx.fillStyle = BLACK.has(pc) ? "#fff" : "#0a1224";
          ctx.font = "9px 'IBM Plex Mono'";
          ctx.fillText(`C${Math.floor(p / 12) - 1}`, this.keyW - 22, y + this.rowH - 4);
        }
      }
    }
    ctx.strokeStyle = "#27407a";
    ctx.beginPath(); ctx.moveTo(this.keyW + 0.5, 0); ctx.lineTo(this.keyW + 0.5, h); ctx.stroke();

    // プレイヘッド
    const px = this.beatToX(state.playheadBeat);
    if (px >= this.keyW && px <= w) {
      ctx.strokeStyle = "#38c3ff"; ctx.lineWidth = 1.5;
      ctx.shadowColor = "#38c3ff"; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
      ctx.shadowBlur = 0; ctx.lineWidth = 1;
    }

    // 空トラックのヒント
    if (!t) {
      ctx.fillStyle = "#7d93bd"; ctx.font = "13px 'Zen Kaku Gothic New'";
      ctx.fillText("トラックを選択してください", this.keyW + 30, this.rulerH + 40);
    } else if (!t.notes.length) {
      ctx.fillStyle = "#3c5580";
      ctx.font = "12px 'Zen Kaku Gothic New'";
      ctx.fillText("クリックでノートを置くか、右のAIパネルから生成 →", this.beatToX(this.scrollX) + 30, this.rulerH + 40);
    }
  }

  // プレイヘッド追従
  followPlayhead() {
    const px = this.beatToX(state.playheadBeat);
    if (px > this.w - 60 || px < this.keyW) {
      this.scrollX = Math.max(0, state.playheadBeat - 2);
      this.draw();
    }
  }
}
