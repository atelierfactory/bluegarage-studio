// ═══════════ AudioWorkletProcessor "vesper-synth2" ═══════════
// main thread から {type:"patch"|"noteOn"|"noteOff"|"allOff"|"tempo"} を受け取り、
// 絶対時刻 t (AudioContext 秒) をサンプルオフセットに変換して SynthCore に渡す。
// 6 つの k-rate AudioParam (0..1) を毎ブロック core.setKnob に流す。
import { SynthCore } from "../synthcore.js";

const PARAMS = ["cutoff", "resonance", "envAmount", "lfoRate", "lfoDepth", "drive"];

class VesperSynth2 extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return PARAMS.map((name) => ({ name, defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" }));
  }
  constructor() {
    super();
    this.core = new SynthCore(sampleRate);
    this.queue = [];          // {t, kind, p, v} 時刻順
    this.port.onmessage = (e) => this.onMessage(e.data);
  }
  push(ev) {
    const q = this.queue; let i = q.length;
    while (i > 0 && q[i - 1].t > ev.t) i--;   // 安定挿入 (同時刻は到着順)
    q.splice(i, 0, ev);
  }
  onMessage(m) {
    if (!m) return;
    switch (m.type) {
      case "patch": this.core.setPatch(m.patch); break;
      case "tempo": this.push({ t: +m.t || 0, kind: 3, bpm: m.bpm }); break;
      case "noteOn": {
        const t = +m.t || 0, p = m.p | 0, v = m.v ?? 100;
        this.push({ t, kind: 0, p, v });
        if (m.dur != null && m.dur > 0) this.push({ t: t + m.dur, kind: 1, p, v: 0 });
        break;
      }
      case "noteOff": this.push({ t: +m.t || 0, kind: 1, p: m.p | 0, v: 0 }); break;
      case "allOff": this.queue.length = 0; this.push({ t: +m.t || 0, kind: 2, p: 0, v: 0 }); break;
      case "dispose": this.queue.length = 0; this.disposed = true; break;
    }
  }
  process(inputs, outputs, parameters) {
    if (this.disposed) return false;
    const out = outputs[0]; if (!out || out.length < 1) return true;
    const L = out[0], R = out[1] ?? out[0], n = L.length;
    const core = this.core;
    for (const name of PARAMS) { const a = parameters[name]; if (a && a.length) core.setKnob(name, a[0]); }
    // 時刻 → サンプルオフセット。過ぎた分は 0 で鳴らす
    const t0 = currentTime, fs = sampleRate, tEnd = t0 + n / fs;
    const q = this.queue;
    while (q.length && q[0].t < tEnd) {
      const e = q.shift();
      const off = Math.max(0, Math.min(n - 1, Math.round((e.t - t0) * fs)));
      if (e.kind === 0) core.noteOn(e.p, e.v, off); else if (e.kind === 1) core.noteOff(e.p, off); else if (e.kind === 3) core.setTempo(e.bpm); else core.allNotesOff(off);
    }
    core.process(L, R, n);
    return true;
  }
}
registerProcessor("vesper-synth2", VesperSynth2);
