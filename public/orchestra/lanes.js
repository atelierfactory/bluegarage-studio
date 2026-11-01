// ═══════════ 総譜のレーン (左の面) ═══════════
// 指揮者の総譜と同じ並び: 上から木管 (Fl Ob Cl Bn)・金管 (Hn Tp)・ティンパニ・弦 (Vn I Vn II Va Vc Cb)。
// 1 行 = 1 つの楽器 (2 人の管は同じ行)。行の高さの中は、その楽器がこの曲で使う音域だけの小さなピアノロール。
// 横は拍 (小節の幅がそろう = 楽譜と同じ見え方。フェルマータでは再生位置がゆっくり進む)。
// 音の明るさ = 強さ (pp は暗く ff は白く、v2 のある音は途中で明るさが変わる)。いま鳴っている音と再生位置だけ金色。
// 押すと、その小節の頭へ移る。横になぞると前後を見られる (再生中は少しのあいだ追いかけを止める)。
const GOLD = "#e0b95a";
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export const LANE_ROWS = [
  { key: "fl", ids: ["fl1", "fl2"], fam: "woodwind" },
  { key: "ob", ids: ["ob1", "ob2"], fam: "woodwind" },
  { key: "cl", ids: ["cl1", "cl2"], fam: "woodwind" },
  { key: "bn", ids: ["bn1", "bn2"], fam: "woodwind" },
  { key: "hn", ids: ["hn1", "hn2"], fam: "brass" },
  { key: "tp", ids: ["tp1", "tp2"], fam: "brass" },
  { key: "timp", ids: ["timp"], fam: "percussion", weight: 0.55 },
  { key: "vn1", ids: ["vn1"], fam: "strings" },
  { key: "vn2", ids: ["vn2"], fam: "strings" },
  { key: "va", ids: ["va"], fam: "strings" },
  { key: "vc", ids: ["vc"], fam: "strings" },
  { key: "cb", ids: ["cb"], fam: "strings" },
];
// 寄りの画面の名前 → 明るくする行
const SHOT_ROWS = {
  tutti: ["fl", "ob", "cl", "bn", "hn", "tp", "timp", "vn1", "vn2", "va", "vc", "cb"],
  strings: ["vn1", "vn2", "va", "vc", "cb"], violins: ["vn1", "vn2"], violas: ["va"], cellos: ["vc"], basses: ["cb"], lowstrings: ["vc", "cb"],
  woodwinds: ["fl", "ob", "cl", "bn"], flute: ["fl"], oboe: ["ob"], clarinet: ["cl"], bassoon: ["bn"], frontwinds: ["fl", "ob"], backwinds: ["cl", "bn"],
  brass: ["hn", "tp"], horns: ["hn"], trumpets: ["tp"], timpani: ["timp"],
};

export class ScoreLanes {
  constructor(canvas, { onSeek = null, label = (k) => k } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.onSeek = onSeek; this.label = label;
    this.song = null; this.rows = []; this.bars = []; this.fermatas = [];
    this.scroll = 0; this.beat = 0; this.playing = false; this.highlight = null;
    this.manualUntil = 0; this.dirty = true; this.drawCount = 0; this._key = "";
    this._resize();
    if (globalThis.ResizeObserver) new ResizeObserver(() => { this._resize(); this.dirty = true; }).observe(canvas.parentElement ?? canvas);
    this._bind();
  }

  setSong(song) {
    this.song = song;
    const byId = new Map(song.players.map((p) => [p.id, p]));
    const defs = song.solo ? LANE_ROWS.flatMap(def => def.key === "hn" ? [def, { key: "hn34", ids: ["hn3", "hn4"], fam: "brass" }] : def.key === "timp" ? [{ key: "tb", ids: ["tb1", "tb2", "tb3"], fam: "brass" }, def, { key: "pianoR", ids: [song.solo.player], hand: "R", fam: "solo", weight: 2 }, { key: "pianoL", ids: [song.solo.player], hand: "L", fam: "solo", weight: 2 }] : [def]) : LANE_ROWS;
    this.rows = defs.map((def) => {
      const notes = def.ids.flatMap((id) => (byId.get(id)?.notes ?? []).filter(n => !def.hand || (n.hand ?? n.h) === def.hand).map((n) => ({ s: n.s, e: n.s + n.d, p: n.p, v: n.v, v2: n.v2 ?? null, v2d: n.v2d ?? null })));
      notes.sort((a, b) => a.s - b.s || a.p - b.p);
      let lo = Infinity, hi = -Infinity, maxD = 0;
      for (const n of notes) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); maxD = Math.max(maxD, n.e - n.s); }
      if (!notes.length) { lo = 60; hi = 72; }
      return { ...def, notes, lo: lo - 1, hi: hi + 1, maxD, name: this.label(`lane.${def.key}`) };
    });
    this.bars = song.bars ?? [];
    this.fermatas = song.fermatas ?? [];
    this.endBeat = Math.max(...this.bars.map((b) => b.s + b.len), ...this.rows.flatMap((r) => r.notes.map((n) => n.e)), 1);
    // 繰り返し (提示部の 2 回目) の始まり
    this.repeats = this.bars.filter((b, i) => i > 0 && b.n < this.bars[i - 1].n).map((b) => b.s);
    this.scroll = 0; this.beat = 0; this.dirty = true;
    this._layoutRows();
  }
  setHighlight(shot) { if (shot !== this.highlight) { this.highlight = shot; this.dirty = true; } }

  /* ─────────── 寸法 ─────────── */
  _resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    this.w = Math.max(50, r.width); this.h = Math.max(50, r.height); this.dpr = dpr;
    const W = Math.round(this.w * dpr), H = Math.round(this.h * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    this.gutter = this.w < 520 ? 44 : 52;   // 携帯でも「Vn II」が左の端に付かない幅
    this.ruler = 20;
    // 横の縮尺: 見える幅に 36 小節 (72 拍) ほど。狭い画面でも 8 分音符が 3 px より細くならないように
    this.ppb = clamp((this.w - this.gutter) / 72, 6, 20);
    this._layoutRows();
    this.dirty = true;
  }
  _layoutRows() {
    if (!this.rows.length) return;
    const top = this.ruler + 4, bottom = this.h - 3, famGap = 5, rowGap = 1;
    let gaps = 0; for (let i = 1; i < this.rows.length; i++) gaps += this.rows[i].fam !== this.rows[i - 1].fam ? famGap : rowGap;
    const total = this.rows.reduce((a, r) => a + (r.weight ?? 1), 0), unit = Math.max(4, (bottom - top - gaps) / total);
    let y = top;
    this.rows.forEach((r, i) => {
      if (i) y += r.fam !== this.rows[i - 1].fam ? famGap : rowGap;
      r.y = y; r.hgt = unit * (r.weight ?? 1); y += r.hgt;
      r.semi = r.hgt / Math.max(1, r.hi - r.lo + 1);
      r.nh = clamp(r.semi * 1.7, 2.6, 6);
    });
  }
  get visibleBeats() { return (this.w - this.gutter) / this.ppb; }
  beatToX(b) { return this.gutter + (b - this.scroll) * this.ppb; }
  xToBeat(x) { return this.scroll + (x - this.gutter) / this.ppb; }
  barAt(beat) { const B = this.bars; let lo = 0, hi = B.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (B[m].s <= beat + 1e-9) lo = m; else hi = m - 1; } return B[lo]; }

  /* ─────────── 押す・なぞる ─────────── */
  _bind() {
    const cv = this.canvas; let drag = null;
    cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, scroll: this.scroll, moved: false, id: e.pointerId }; });
    cv.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 5 && Math.abs(dx) > Math.abs(e.clientY - drag.y)) { drag.moved = true; try { cv.setPointerCapture(drag.id); } catch {} }
      if (drag.moved) { this.scroll = clamp(drag.scroll - dx / this.ppb, -2, this.endBeat); this.manualUntil = performance.now() + 4000; this.dirty = true; }
    });
    const up = (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      try { cv.releasePointerCapture(d.id); } catch {}
      if (d.moved || e.type === "pointercancel" || !this.bars.length) return;
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left;
      if (x < this.gutter) return;
      const bar = this.barAt(clamp(this.xToBeat(x), 0, this.endBeat - 1e-3));
      this.manualUntil = 0;
      this.onSeek?.(bar.s, bar);
    };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", (e) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      this.scroll = clamp(this.scroll + d / this.ppb, -2, this.endBeat); this.manualUntil = performance.now() + 4000; this.dirty = true;
    }, { passive: false });
  }

  /* ─────────── 毎コマ ─────────── */
  // beat: いま聞こえている拍 (舞台と同じ値)。描き直しが要るときだけ描く
  frame(beat, playing) {
    // 最後の音のあとの響きの間も、再生位置の線は曲の終わりで止める
    const b = clamp(beat, 0, this.endBeat);
    this.playing = playing; this.beat = b;
    const vis = this.visibleBeats;
    if (performance.now() > this.manualUntil) {
      // 再生中: 再生位置を左から 1/4 の所に置いて譜面を流す。止まっているとき: 再生位置が見えないときだけ寄せる
      if (playing) this.scroll = b - vis * 0.25;
      else if (b < this.scroll || b > this.scroll + vis * 0.92) this.scroll = b - vis * 0.25;
    }
    this.scroll = clamp(this.scroll, -2, Math.max(-2, this.endBeat - vis * 0.5));
    const key = `${this.scroll.toFixed(3)}|${b.toFixed(3)}|${this.highlight}|${this.w}|${this.h}`;
    if (!this.dirty && key === this._key) return;
    this._key = key; this.dirty = false;
    this.draw();
  }

  draw() {
    const c = this.ctx, dpr = this.dpr, W = this.w, H = this.h, G = this.gutter, R = this.ruler;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#050505"; c.fillRect(0, 0, W, H);
    if (!this.rows.length) return;
    const px = (x) => Math.round(x * dpr) / dpr + 0.5 / dpr;   // 線を画素にそろえる (高い密度の画面でもにじまない)
    const b0 = this.scroll, b1 = this.scroll + this.visibleBeats, beat = this.beat;
    const lit = new Set(this.highlight ? SHOT_ROWS[this.highlight] ?? [] : []);
    // 行の地
    for (const r of this.rows) {
      c.fillStyle = lit.has(r.key) ? "#121212" : "#0a0a0a";
      c.fillRect(G, r.y, W - G, r.hgt);
    }
    // 小節線 (5 小節ごとに少し濃く)
    c.save(); c.beginPath(); c.rect(G, 0, W - G, H); c.clip();
    const bars = this.bars;
    let i0 = 0; { let lo = 0, hi = bars.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bars[m].s <= b0) lo = m; else hi = m - 1; } i0 = lo; }
    const barPx = 2 * this.ppb, every = barPx >= 34 ? 1 : 5;
    c.font = "500 9.5px 'IBM Plex Mono', monospace"; c.textBaseline = "middle"; c.textAlign = "left";
    for (let i = i0; i < bars.length && bars[i].s < b1 + 1; i++) {
      const bar = bars[i], x = px(this.beatToX(bar.s));
      const major = bar.n % 5 === 0 || bar.n === 1;
      c.strokeStyle = major ? "rgba(255,255,255,.085)" : "rgba(255,255,255,.04)"; c.lineWidth = 1 / dpr;
      c.beginPath(); c.moveTo(x, R); c.lineTo(x, H); c.stroke();
      c.strokeStyle = "rgba(255,255,255,.25)"; c.beginPath(); c.moveTo(x, R - (major ? 6 : 3)); c.lineTo(x, R); c.stroke();
      if ((major && every === 5) || every === 1) {
        c.fillStyle = major ? "#9a9a9a" : "#5a5a5a";
        c.fillText(String(bar.n), x + 2.5, R / 2 - 1);
      }
    }
    // 繰り返しの記号 (提示部の 2 回目の頭と曲の頭): 太い線 + 細い線
    for (const s of [0, ...this.repeats]) {
      const x = this.beatToX(s); if (x < G - 4 || x > W + 4) continue;
      c.fillStyle = "rgba(255,255,255,.28)"; c.fillRect(x - 3, R, 2, H - R);
      c.fillRect(x + 1, R, 1 / dpr, H - R);
    }
    // フェルマータ (小節番号の帯の右寄りに小さな弧と点)
    c.strokeStyle = "#8a8a8a"; c.fillStyle = "#8a8a8a"; c.lineWidth = 1.1;
    for (const f of this.fermatas) {
      const x = this.beatToX(f.s + f.d * 0.5); if (x < G || x > W) continue;
      c.beginPath(); c.arc(x, R - 2, 4.2, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      c.beginPath(); c.arc(x, R - 3.6, 0.9, 0, Math.PI * 2); c.fill();
    }
    // 音符
    // pp (34) = 灰 108、ff (114) = 白に近い 236。暗い所でも pp の音が見える明るさから始める
    const shade = (v) => { const k = Math.pow(clamp((v - 20) / 107, 0, 1), 1.15); const L = Math.round(96 + 159 * k); return `rgb(${L},${L},${L})`; };
    this.litRows = new Set();
    for (const r of this.rows) {
      const N = r.notes; if (!N.length) continue;
      let lo = 0, hi = N.length; const from = b0 - r.maxD;
      while (lo < hi) { const m = (lo + hi) >> 1; if (N[m].s < from) lo = m + 1; else hi = m; }
      c.save(); c.beginPath(); c.rect(G, r.y, W - G, r.hgt); c.clip();
      for (let k = lo; k < N.length && N[k].s < b1; k++) {
        const n = N[k]; if (n.e < b0) continue;
        const x0 = this.beatToX(n.s), x1 = this.beatToX(n.e);
        const w = Math.max(1.4, x1 - x0 - (x1 - x0 > 4 ? 1 : 0.3));
        const y = r.y + (r.hi - n.p + 0.5) * r.semi - r.nh / 2;
        const on = n.s <= beat && beat < n.e;
        if (on) { c.fillStyle = GOLD; this.litRows.add(r.key); }
        else if (n.v2 != null && w > 6) {
          const g = c.createLinearGradient(x0, 0, x1, 0), xe = n.v2d != null ? clamp(n.v2d / (n.e - n.s), 0.02, 1) : 1;
          g.addColorStop(0, shade(n.v)); g.addColorStop(xe, shade(n.v2)); g.addColorStop(1, shade(n.v2));
          c.fillStyle = g;
        } else c.fillStyle = shade(n.v);
        c.fillRect(x0, y, w, r.nh);
      }
      c.restore();
    }
    // 再生位置
    const xp = this.beatToX(beat);
    if (xp >= G - 1 && xp <= W + 1) { c.fillStyle = GOLD; c.fillRect(Math.round(xp * dpr) / dpr - 0.75, 0, 1.5, H); }
    c.restore();
    // 左の楽器名 (鳴っている行は金、寄りの画面に映っている行は白)
    c.fillStyle = "#070707"; c.fillRect(0, 0, G, H);
    c.strokeStyle = "#262626"; c.lineWidth = 1 / dpr; c.beginPath(); c.moveTo(px(G) - 1 / dpr, 0); c.lineTo(px(G) - 1 / dpr, H); c.stroke();
    c.beginPath(); c.moveTo(0, px(R)); c.lineTo(W, px(R)); c.stroke();
    c.textAlign = "right"; c.textBaseline = "middle";
    for (const r of this.rows) {
      const size = r.hgt < 15 ? 9 : 10.5;
      c.font = `600 ${size}px 'IBM Plex Mono', monospace`;
      c.fillStyle = this.litRows.has(r.key) ? GOLD : lit.has(r.key) ? "#f0f0f0" : "#8a8a8a";
      if(this.song?.solo)c.fillText(r.name, G - 7, r.y + r.hgt / 2, G - 11);
      else c.fillText(r.name, G - 7, r.y + r.hgt / 2);
    }
    this.drawCount++;
  }
}
