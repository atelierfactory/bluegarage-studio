// ═══════════ Standard MIDI File を読む (Type 0 / 1) ═══════════
// 依存なし。ノート (p, s, d, v, track, ch)、テンポ変化、拍子、トラック名を取り出す。s と d は拍 (4 分音符 = 1)。

function readVlq(bytes, pos) { let v = 0, b; do { b = bytes[pos++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return [v, pos]; }
const str = (bytes, a, b) => new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(a, b));

export function parseMidi(buffer) {
  const bytes = new Uint8Array(buffer);
  const u32 = (i) => (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
  const u16 = (i) => (bytes[i] << 8) | bytes[i + 1];
  if (str(bytes, 0, 4) !== "MThd") throw new Error("MIDI ファイルではありません");
  const format = u16(8), nTracks = u16(10), division = u16(12);
  if (division & 0x8000) throw new Error("SMPTE 形式の MIDI には対応していません");
  const tpq = division;
  let pos = 14;
  const tracks = [];
  const tempos = [];      // {tick, uspq}
  const ccEvents = [];    // {tick, cc, v, ch}
  let timeSig = null;
  for (let t = 0; t < nTracks && pos + 8 <= bytes.length; t++) {
    if (str(bytes, pos, pos + 4) !== "MTrk") { pos += 8 + u32(pos + 4); continue; }
    const len = u32(pos + 4); const end = pos + 8 + len; pos += 8;
    let tick = 0, running = 0, name = "";
    const on = new Map(); // key ch:p → {tick, v}
    const notes = [];
    while (pos < end) {
      let delta; [delta, pos] = readVlq(bytes, pos); tick += delta;
      let status = bytes[pos];
      if (status < 0x80) status = running; else pos++;
      if (status === 0xff) {
        const type = bytes[pos++]; let l; [l, pos] = readVlq(bytes, pos);
        if (type === 0x51) tempos.push({ tick, uspq: (bytes[pos] << 16) | (bytes[pos + 1] << 8) | bytes[pos + 2] });
        else if (type === 0x58) timeSig ??= { num: bytes[pos], den: Math.pow(2, bytes[pos + 1]) };
        else if (type === 0x03 && !name) name = str(bytes, pos, pos + l);
        pos += l;
      } else if (status === 0xf0 || status === 0xf7) { let l; [l, pos] = readVlq(bytes, pos); pos += l; }
      else {
        running = status;
        const type = status & 0xf0, ch = status & 0x0f;
        const d1 = bytes[pos++]; const d2 = type === 0xc0 || type === 0xd0 ? 0 : bytes[pos++];
        if (type === 0xb0) ccEvents.push({ tick, cc: d1, v: d2, ch });
        if (type === 0x90 && d2 > 0) { const k = `${ch}:${d1}`; if (on.has(k)) { const o = on.get(k); notes.push({ p: d1, tick: o.tick, dur: Math.max(1, tick - o.tick), v: o.v, ch }); } on.set(k, { tick, v: d2 }); }
        else if (type === 0x80 || (type === 0x90 && d2 === 0)) { const k = `${ch}:${d1}`; const o = on.get(k); if (o) { notes.push({ p: d1, tick: o.tick, dur: Math.max(1, tick - o.tick), v: o.v, ch }); on.delete(k); } }
      }
    }
    for (const [k, o] of on) { const p = +k.split(":")[1]; notes.push({ p, tick: o.tick, dur: tpq, v: o.v, ch: +k.split(":")[0] }); }
    tracks.push({ name, notes, index: t });
    pos = end;
  }
  tempos.sort((a, b) => a.tick - b.tick);
  const bpm0 = tempos.length ? 60000000 / tempos[0].uspq : 120;
  const out = [];
  for (const tr of tracks) for (const n of tr.notes) out.push({ p: n.p, s: n.tick / tpq, d: n.dur / tpq, v: n.v, track: tr.index, ch: n.ch, trackName: tr.name });
  out.sort((a, b) => a.s - b.s || a.p - b.p);
  // サスティンペダル (CC64): 踏んでいる区間に
  const pedal = [];
  let down = null;
  for (const e of ccEvents.filter((x) => x.cc === 64).sort((a, b) => a.tick - b.tick)) {
    if (e.v >= 64 && down == null) down = e.tick;
    else if (e.v < 64 && down != null) { if (e.tick > down) pedal.push({ s: down / tpq, d: (e.tick - down) / tpq }); down = null; }
  }
  return { format, tpq, pedal, tempo: Math.round(bpm0 * 100) / 100, tempos: tempos.map((t) => ({ beat: t.tick / tpq, tempo: 60000000 / t.uspq })), timeSig: timeSig ?? { num: 4, den: 4 }, tracks: tracks.map((t) => ({ index: t.index, name: t.name, count: t.notes.length })), notes: out };
}
