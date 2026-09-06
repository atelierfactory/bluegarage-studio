// ═══════════ ラウドネス計測 (ITU-R BS.1770-4 の K 重み付け + ゲート) と簡易リミッター ═══════════
// WAV 書き出しのとき、曲全体を測って目標 LUFS に合わせる。依存なし・純粋計算。

// 2 段のバイクワッド係数 (48kHz 用の定数を fs に合わせて再計算)
function kWeightCoeffs(fs) {
  // stage 1: high shelf (+4dB @ ~1681Hz), stage 2: high-pass (~38Hz)
  const f0 = 1681.974450955533, G = 3.999843853973347, Q1 = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q1 + K * K;
  const s1 = {
    b0: (Vh + Vb * K / Q1 + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q1 + K * K) / a0,
    a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q1 + K * K) / a0,
  };
  const f2 = 38.13547087602444, Q2 = 0.5003270373238773;
  const K2 = Math.tan((Math.PI * f2) / fs);
  const d0 = 1 + K2 / Q2 + K2 * K2;
  const s2 = { b0: 1 / d0, b1: -2 / d0, b2: 1 / d0, a1: 2 * (K2 * K2 - 1) / d0, a2: (1 - K2 / Q2 + K2 * K2) / d0 };
  return [s1, s2];
}
function biquad(x, c) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = c.b0 * xi + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi; y[i] = yi;
  }
  return y;
}

/** 統合ラウドネス (LUFS)、ラウドネスレンジの目安、サンプルピーク (dBFS) */
export function measureLoudness(buffer) {
  const fs = buffer.sampleRate;
  const nch = Math.min(2, buffer.numberOfChannels);
  const [c1, c2] = kWeightCoeffs(fs);
  const chans = [];
  let peak = 0;
  for (let c = 0; c < nch; c++) {
    const x = buffer.getChannelData(c);
    for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; }
    chans.push(biquad(biquad(x, c1), c2));
  }
  const block = Math.round(0.4 * fs), hop = Math.round(0.1 * fs);
  const blocks = [];
  for (let start = 0; start + block <= chans[0].length; start += hop) {
    let sum = 0;
    for (const y of chans) { let s = 0; for (let i = start; i < start + block; i++) s += y[i] * y[i]; sum += s / block; }
    blocks.push(-0.691 + 10 * Math.log10(sum + 1e-12));
  }
  if (!blocks.length) return { lufs: -70, lra: 0, peakDb: peak > 0 ? 20 * Math.log10(peak) : -120 };
  const abs = blocks.filter((l) => l > -70);
  const meanPow = (arr) => arr.reduce((a, l) => a + Math.pow(10, (l + 0.691) / 10), 0) / Math.max(1, arr.length);
  const gate1 = -0.691 + 10 * Math.log10(meanPow(abs) + 1e-12);
  const rel = abs.filter((l) => l > gate1 - 10);
  const lufs = rel.length ? -0.691 + 10 * Math.log10(meanPow(rel) + 1e-12) : -70;
  // LRA (簡易): 3 秒短期ではなく 400ms ブロックの 10〜95 パーセンタイル
  const sorted = rel.slice().sort((a, b) => a - b);
  const lra = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] - sorted[Math.floor(sorted.length * 0.1)] : 0;
  return { lufs, lra, peakDb: peak > 0 ? 20 * Math.log10(peak) : -120 };
}

/**
 * ゲインを掛けて目標 LUFS に合わせ、ピークが天井を超える分は簡易ルックアヘッドリミッターで抑える。
 * buffer は書き換える。返り値は適用したゲイン (dB) と最終計測。
 */
export function normalizeLoudness(buffer, { targetLufs = -14, ceilingDb = -1 } = {}) {
  const before = measureLoudness(buffer);
  const gainDb = targetLufs - before.lufs;
  const g = Math.pow(10, Math.min(30, gainDb) / 20);
  const ceil = Math.pow(10, ceilingDb / 20);
  const nch = buffer.numberOfChannels;
  const chans = Array.from({ length: nch }, (_, c) => buffer.getChannelData(c));
  const n = chans[0].length;
  const fs = buffer.sampleRate;
  const look = Math.round(0.005 * fs), rel = Math.exp(-1 / (0.08 * fs));
  // 1. ゲイン
  for (const x of chans) for (let i = 0; i < n; i++) x[i] *= g;
  // 2. ピークが天井を超えるなら、ルックアヘッド付きゲインリダクション
  let peak = 0;
  for (const x of chans) for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; }
  let limited = false;
  if (peak > ceil) {
    limited = true;
    const env = new Float32Array(n);
    // 必要な減衰量 (絶対値の最大 / 天井) を look 分だけ先読みして滑らかに
    for (let i = 0; i < n; i++) { let m = 0; for (const x of chans) { const a = Math.abs(x[i]); if (a > m) m = a; } env[i] = m > ceil ? ceil / m : 1; }
    const red = new Float32Array(n);
    let cur = 1;
    for (let i = 0; i < n; i++) {
      let want = 1;
      const end = Math.min(n, i + look);
      for (let j = i; j < end; j++) if (env[j] < want) want = env[j];
      cur = want < cur ? want : cur + (want - cur) * (1 - rel);
      red[i] = cur;
    }
    for (const x of chans) for (let i = 0; i < n; i++) { x[i] *= red[i]; if (x[i] > ceil) x[i] = ceil; else if (x[i] < -ceil) x[i] = -ceil; }
  }
  const after = measureLoudness(buffer);
  return { gainDb, before, after, limited };
}
