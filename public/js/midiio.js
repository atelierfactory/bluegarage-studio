// ═══════════ Web MIDI (外部音源 / DAW / VST への出力、鍵盤からの入力) ═══════════
// 出力: トラックごとに MIDI ポートとチャンネルを選ぶと、再生時にそのトラックのノートを送る。
//       DAW 側で仮想ポート (macOS の IAC Driver など) を受ければ、DAW に立ち上げた VST/AU で鳴らせる。
// 入力: つないだ鍵盤で選択トラックの音を鳴らし、REC 中は再生位置にノートとして記録する。

let access = null;
let inputHandlers = [];
const listeners = new Set();

export function isSupported() { return typeof navigator !== "undefined" && !!navigator.requestMIDIAccess; }

export async function initMidi() {
  if (access) return access;
  if (!isSupported()) throw new Error("このブラウザは Web MIDI に対応していません (Chrome / Edge を使ってください)");
  access = await navigator.requestMIDIAccess({ sysex: false });
  access.onstatechange = () => { bindInputs(); listeners.forEach((cb) => cb()); };
  bindInputs();
  return access;
}
export function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

export function outputs() { return access ? [...access.outputs.values()].map((o) => ({ id: o.id, name: o.name, manufacturer: o.manufacturer })) : []; }
export function inputs() { return access ? [...access.inputs.values()].map((o) => ({ id: o.id, name: o.name, manufacturer: o.manufacturer })) : []; }

export function findOutput(idOrName) {
  if (!access || !idOrName) return null;
  if (access.outputs.has(idOrName)) return access.outputs.get(idOrName);
  const q = String(idOrName).toLowerCase();
  return [...access.outputs.values()].find((o) => o.name?.toLowerCase().includes(q)) ?? null;
}

function bindInputs() {
  if (!access) return;
  for (const inp of access.inputs.values()) {
    inp.onmidimessage = (e) => {
      const [st, d1, d2] = e.data;
      const type = st & 0xf0, ch = st & 0x0f;
      if (type === 0x90 && d2 > 0) inputHandlers.forEach((h) => h({ type: "on", p: d1, v: d2, ch, port: inp.name, time: e.timeStamp }));
      else if (type === 0x80 || (type === 0x90 && d2 === 0)) inputHandlers.forEach((h) => h({ type: "off", p: d1, v: 0, ch, port: inp.name, time: e.timeStamp }));
      else if (type === 0xb0) inputHandlers.forEach((h) => h({ type: "cc", cc: d1, v: d2, ch, port: inp.name, time: e.timeStamp }));
    };
  }
}
export function onInput(h) { inputHandlers.push(h); return () => { inputHandlers = inputHandlers.filter((x) => x !== h); }; }

/* ─────────── 出力 (時刻指定) ─────────── */
// AudioContext の時刻 → performance.now() 基準 (ms) に変換して MIDIOutput.send に渡す
export function audioTimeToPerf(ctx, audioTime) {
  const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : { contextTime: ctx.currentTime, performanceTime: performance.now() };
  return ts.performanceTime + (audioTime - ts.contextTime) * 1000;
}

export function sendNote(out, ch, p, v, atPerfMs, durMs) {
  if (!out) return;
  const c = ch & 0x0f;
  try {
    out.send([0x90 | c, p & 0x7f, Math.max(1, Math.min(127, v | 0))], atPerfMs);
    out.send([0x80 | c, p & 0x7f, 64], atPerfMs + Math.max(5, durMs));
  } catch (e) { console.warn("[midi] send", e.message); }
}
export function sendCC(out, ch, cc, v, atPerfMs) { try { out?.send([0xb0 | (ch & 0x0f), cc & 0x7f, Math.max(0, Math.min(127, v | 0))], atPerfMs); } catch {} }
export function sendProgram(out, ch, prog) { try { out?.send([0xc0 | (ch & 0x0f), prog & 0x7f]); } catch {} }
export function allNotesOff(out, ch) {
  if (!out) return;
  try { out.send([0xb0 | (ch & 0x0f), 123, 0]); out.send([0xb0 | (ch & 0x0f), 120, 0]); } catch {}
}
export function panicAll() {
  if (!access) return;
  for (const o of access.outputs.values()) for (let c = 0; c < 16; c++) allNotesOff(o, c);
}
