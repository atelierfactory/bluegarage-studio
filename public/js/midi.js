// ═══════════ Standard MIDI File (Type-1) writer ═══════════
// 依存なしの自前実装。DAW (Pro Tools / Cubase / Logic / Ableton) にそのまま読み込める。
// テンポマップ (リタルダンド等) はテンポイベントの列に、v2 (音の終わりの強さ) は CC11 (Expression) のランプに書く。

import { INSTRUMENT_DEFS, tempoAt } from "./state.js";

const TPQ = 480; // ticks per quarter note

function vlq(n) {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) { bytes.unshift((n & 0x7f) | 0x80); n >>= 7; }
  return bytes;
}
function str(s) { return [...new TextEncoder().encode(s)]; }
function u32(n) { return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]; }
function u16(n) { return [(n >>> 8) & 0xff, n & 0xff]; }
function metaEvent(delta, type, data) { return [...vlq(delta), 0xff, type, ...vlq(data.length), ...data]; }
function trackChunk(events) {
  const body = [...events, ...metaEvent(0, 0x2f, [])];
  return [...str("MTrk"), ...u32(body.length), ...body];
}
function tempoBytes(bpm) { const uspq = Math.round(60000000 / Math.max(1, bpm)); return [(uspq >> 16) & 0xff, (uspq >> 8) & 0xff, uspq & 0xff]; }

export function songToMidi(song) {
  const chunks = [];
  const ts = song.timeSig;
  const totalBeats = Math.max(...song.tracks.map((t) => Math.max(0, ...t.notes.map((n) => n.s + n.d))), (song.sections ?? []).reduce((a, s) => a + s.bars, 0) * ts);

  // ── conductor track: title, time sig, tempo (map), markers
  const conductor = [];
  const meta = [];
  meta.push({ tick: 0, bytes: metaEvent(0, 0x03, str(song.title || "BLUE GARAGE STUDIO")).slice(1) });
  meta.push({ tick: 0, bytes: metaEvent(0, 0x58, [ts, 2, 24, 8]).slice(1) });
  if ((song.tempoMap ?? []).length) {
    // 変化点の間は 1/4 拍ごとにテンポを書く (直線ランプを段階で近似)
    const pts = song.tempoMap.slice().sort((a, b) => a.beat - b.beat);
    let last = null;
    const step = 0.25;
    for (let b = 0; b <= totalBeats + 1e-6; b += step) {
      const tempo = tempoAt(b, song);
      const inRamp = pts.some((p, i) => i > 0 && b > pts[i - 1].beat - 1e-6 && b < p.beat + 1e-6 && Math.abs(p.tempo - pts[i - 1].tempo) > 0.01);
      const isPoint = pts.some((p) => Math.abs(p.beat - b) < 1e-6);
      if (last == null || isPoint || (inRamp && Math.abs(tempo - last) > 0.05)) {
        meta.push({ tick: Math.round(b * TPQ), bytes: metaEvent(0, 0x51, tempoBytes(tempo)).slice(1) });
        last = tempo;
      }
    }
  } else {
    meta.push({ tick: 0, bytes: metaEvent(0, 0x51, tempoBytes(song.tempo)).slice(1) });
  }
  let bar = 0;
  for (const sec of song.sections ?? []) {
    meta.push({ tick: Math.round(bar * ts * TPQ), bytes: metaEvent(0, 0x06, str(sec.name)).slice(1) });
    bar += sec.bars;
  }
  meta.sort((a, b) => a.tick - b.tick);
  let lastTick = 0;
  for (const m of meta) { conductor.push(...vlq(m.tick - lastTick), ...m.bytes); lastTick = m.tick; }
  chunks.push(trackChunk(conductor));

  // ── note tracks
  for (const track of song.tracks) {
    if (!track.notes.length) continue;
    const def = INSTRUMENT_DEFS[track.instrument] ?? { gm: 0, channel: 0 };
    const ch = track.instrument === "drums" ? 9 : (track.midiOut?.channel ?? def.channel) % 16;
    const ev = [];
    ev.push(...metaEvent(0, 0x03, str(track.name)));
    if (track.instrument !== "drums") ev.push(...vlq(0), 0xc0 | ch, def.gm & 0x7f);
    // 初期値: 音量 (CC7) をトラック音量から、パン (CC10)、Expression (CC11) = 127
    const vol = Math.round(Math.max(0, Math.min(127, 100 * Math.pow(10, (track.volume ?? -6) / 40))));
    const msgs = [];
    msgs.push({ tick: 0, type: 0xb0, p: 7, v: vol });
    msgs.push({ tick: 0, type: 0xb0, p: 10, v: Math.round(64 + (track.pan ?? 0) * 63) });
    msgs.push({ tick: 0, type: 0xb0, p: 11, v: 127 });
    let exprActive = false;
    for (const n of track.notes) {
      const on = Math.max(0, Math.round(n.s * TPQ));
      const off = Math.max(on + 1, Math.round((n.s + n.d) * TPQ));
      const p = Math.max(0, Math.min(127, Math.round(n.p)));
      const v = Math.max(1, Math.min(127, Math.round(n.v)));
      msgs.push({ tick: on, type: 0x90, p, v });
      msgs.push({ tick: off, type: 0x80, p, v: 64 });
      // v2: CC11 を 1/8 拍ごとに直線で
      if (n.v2 != null && n.v2 !== n.v && n.d >= 0.5) {
        const steps = Math.max(2, Math.round(n.d * 8));
        for (let k = 0; k <= steps; k++) {
          const tick = on + Math.round((off - on) * k / steps);
          const val = Math.round(127 * Math.max(0.05, Math.min(1.5, (n.v + (n.v2 - n.v) * k / steps) / n.v)));
          msgs.push({ tick: Math.min(off, tick), type: 0xb0, p: 11, v: Math.min(127, val), order: -1 });
        }
        msgs.push({ tick: off + 1, type: 0xb0, p: 11, v: 127, order: 1 });
        exprActive = true;
      }
    }
    // 同 tick: CC (0xb0) → note-off (0x80) → note-on (0x90)
    msgs.sort((a, b) => a.tick - b.tick || (a.order ?? 0) - (b.order ?? 0) || a.type - b.type);
    let last = 0;
    for (const m of msgs) { ev.push(...vlq(m.tick - last), m.type | ch, m.p, m.v); last = m.tick; }
    chunks.push(trackChunk(ev));
  }

  const header = [...str("MThd"), ...u32(6), ...u16(1), ...u16(chunks.length), ...u16(TPQ)];
  return new Uint8Array([...header, ...chunks.flat()]);
}

export function downloadMidi(song) {
  const bytes = songToMidi(song);
  const blob = new Blob([bytes], { type: "audio/midi" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(song.title || "bluegarage").replace(/[\\/:*?"<>|]/g, "_")}.mid`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
