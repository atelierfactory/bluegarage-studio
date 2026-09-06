// ═══════════ インパルス応答 (リバーブ用) を計算で作る ═══════════
// Tone.Reverb は内部で Offline レンダリングを使うため Tone.Offline の中で使えない。
// ここでは減衰するノイズを直接計算して AudioBuffer にする (再生とオフライン書き出しで同じ響き)。
// AudioBuffer はコンテキストに縛られないので、1 回作れば両方で使える。

const cache = new Map();

function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * @param {BaseAudioContext} ctx  decode 用 (sampleRate を取る)
 * @param {{decay:number, preDelay?:number, damp?:number, width?:number, early?:number}} o
 *   decay: 残響時間 (-60dB まで) 秒 / damp: 高域の減衰 0..1 / early: 初期反射の強さ 0..1
 */
export function makeImpulse(ctx, { decay = 2, preDelay = 0.015, damp = 0.4, early = 0.5, seed = 1 } = {}) {
  const fs = ctx.sampleRate;
  const key = `${fs}|${decay.toFixed(2)}|${preDelay}|${damp}|${early}|${seed}`;
  if (cache.has(key)) return cache.get(key);
  const len = Math.max(1, Math.round((preDelay + decay) * fs));
  const buf = ctx.createBuffer(2, len, fs);
  const pre = Math.round(preDelay * fs);
  const tau = decay / 6.91; // e^-t/tau で -60dB at decay
  // 減衰する白色ノイズ + 高域を落とすワンポールローパス (時間とともに暗く)
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    const rnd = mulberry(seed * 7919 + c * 131);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / fs;
      const env = Math.exp(-t / tau);
      // 立ち上がりを少し滑らかに (初期の密度を上げる)
      const rise = Math.min(1, t / 0.01);
      const n = (rnd() * 2 - 1);
      // 時間が経つほど暗く: カットオフを下げる
      const a = Math.min(0.995, damp * 0.6 + (t / (decay + 0.001)) * damp * 0.4);
      lp = lp + (n - lp) * (1 - a);
      data[i] = lp * env * rise;
    }
    // 初期反射 (少数の離散エコー)
    if (early > 0) {
      const taps = [0.011, 0.019, 0.027, 0.036, 0.048, 0.061];
      taps.forEach((tp, k) => {
        const idx = pre + Math.round(tp * fs * (c ? 1.07 : 1));
        if (idx < len) data[idx] += early * 0.5 * Math.pow(0.7, k) * (k % 2 ? -1 : 1);
      });
    }
  }
  // 正規化 (エネルギーが decay で暴れないように)
  let peak = 0;
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i])); }
  const norm = peak > 0 ? 0.5 / peak : 1;
  // 長い残響ほど総エネルギーが増えるので、それも軽く補正
  const energyComp = 1 / Math.sqrt(Math.max(0.3, decay));
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] *= norm * energyComp; }
  cache.set(key, buf);
  return buf;
}
