// ═══════════ ミックスバス (トラック挿入エフェクト・センドリバーブ・マスター) ═══════════
// 各トラック: 楽器 → ローカット → 3 バンド EQ → コンプ → 音量/パン → マスター
//                                                     └→ ホール送り / ルーム送り (ポストフェーダー)
// マスター: 幅 → バスコンプ (glue) → 音量 → リミッター → 出力
// Tone.Offline の中でも同じ関数で組む (createMixGraph をコールバック内で呼ぶ)。

/* global Tone */
import { makeImpulse } from "./ir.js";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+x) ? +x : lo));

export function compressorParams(amount) {
  const a = clamp(amount, 0, 1);
  if (a < 0.02) return { threshold: 0, ratio: 1, attack: 0.05, release: 0.25, knee: 0 };
  return { threshold: -8 - a * 22, ratio: 1.5 + a * 4.5, attack: 0.03 - a * 0.022, release: 0.25 - a * 0.1, knee: 10 };
}

/** マスター + リバーブバス。destination は省略時 Tone.Destination */
export function createMixGraph(master, { destination = null, sampleCtx = null } = {}) {
  const m = { glue: 0.3, hallDecay: 2.4, roomDecay: 0.6, width: 1, volume: -4, ...(master ?? {}) };
  const out = destination ?? Tone.getDestination();
  const limiter = new Tone.Limiter(-1).connect(out);
  const volume = new Tone.Volume(m.volume).connect(limiter);
  const glue = new Tone.Compressor(compressorParams(m.glue * 0.6)).connect(volume);
  const widener = new Tone.StereoWidener(clamp(m.width, 0, 2) / 2).connect(glue);
  const input = new Tone.Gain(1).connect(widener);
  const meter = new Tone.Meter({ channelCount: 2, smoothing: 0.8 }); limiter.connect(meter);

  const ctx = sampleCtx ?? Tone.getContext().rawContext;
  const hallIR = makeImpulse(ctx, { decay: clamp(m.hallDecay, 0.5, 10), preDelay: 0.025, damp: 0.45, early: 0.35, seed: 11 });
  const roomIR = makeImpulse(ctx, { decay: clamp(m.roomDecay, 0.15, 2), preDelay: 0.008, damp: 0.3, early: 0.8, seed: 23 });
  const hall = new Tone.Convolver(new Tone.ToneAudioBuffer(hallIR));
  const hallHp = new Tone.Filter(180, "highpass"); const hallGain = new Tone.Gain(0.9);
  hall.chain(hallHp, hallGain, input);
  const room = new Tone.Convolver(new Tone.ToneAudioBuffer(roomIR));
  const roomHp = new Tone.Filter(120, "highpass"); const roomGain = new Tone.Gain(0.8);
  room.chain(roomHp, roomGain, input);

  const nodes = [limiter, volume, glue, widener, input, hall, hallHp, hallGain, room, roomHp, roomGain, meter];
  return {
    input, hall, room, limiter, volume, glue, widener, meter,
    update(next) {
      Object.assign(m, next ?? {});
      volume.volume.value = m.volume;
      glue.set(compressorParams(m.glue * 0.6));
      widener.width.value = clamp(m.width, 0, 2) / 2;
    },
    setMasterVolume(db) { m.volume = db; volume.volume.value = db; },
    dispose() { for (const n of nodes) { try { n.dispose(); } catch {} } },
  };
}

/** 1 トラック分の挿入チェーン。graph は createMixGraph の戻り値 */
export function createTrackChain(track, graph) {
  const fx = { hpf: 30, eqLow: 0, eqMid: 0, eqHigh: 0, comp: 0, hall: 0, room: 0, ...(track.fx ?? {}) };
  const input = new Tone.Gain(1);
  const hpf = new Tone.Filter({ frequency: clamp(fx.hpf, 10, 1000), type: "highpass", rolloff: -12, Q: 0.7 });
  const eq = new Tone.EQ3({ low: clamp(fx.eqLow, -18, 12), mid: clamp(fx.eqMid, -18, 12), high: clamp(fx.eqHigh, -18, 12), lowFrequency: 250, highFrequency: 2500 });
  const comp = new Tone.Compressor(compressorParams(fx.comp));
  const channel = new Tone.Channel({ volume: track.volume ?? -6, pan: track.pan ?? 0 });
  const hallSend = new Tone.Gain(clamp(fx.hall, 0, 1));
  const roomSend = new Tone.Gain(clamp(fx.room, 0, 1));
  const meter = new Tone.Meter({ channelCount: 2, smoothing: 0.8 });
  input.chain(hpf, eq, comp, channel);
  channel.connect(graph.input);
  channel.connect(meter);
  channel.connect(hallSend); hallSend.connect(graph.hall);
  channel.connect(roomSend); roomSend.connect(graph.room);
  const nodes = [input, hpf, eq, comp, channel, hallSend, roomSend, meter];
  return {
    input, channel, meter,
    update(t, { muted = false } = {}) {
      const f = { ...fx, ...(t.fx ?? {}) };
      Object.assign(fx, f);
      hpf.frequency.value = clamp(f.hpf, 10, 1000);
      eq.low.value = clamp(f.eqLow, -18, 12); eq.mid.value = clamp(f.eqMid, -18, 12); eq.high.value = clamp(f.eqHigh, -18, 12);
      comp.set(compressorParams(f.comp));
      channel.volume.value = t.volume ?? -6;
      channel.pan.value = t.pan ?? 0;
      channel.mute = muted;
      hallSend.gain.value = clamp(f.hall, 0, 1);
      roomSend.gain.value = clamp(f.room, 0, 1);
    },
    dispose() { for (const n of nodes) { try { n.dispose(); } catch {} } },
  };
}
