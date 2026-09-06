// ═══════════ 多層サンプラー (tools/sfz-import.mjs が出力する index.json を再生) ═══════════
// 素の Web Audio ノード (AudioBufferSourceNode + GainNode + StereoPannerNode) だけで組むので
// Tone.Offline のオフラインコンテキスト内でもそのまま動く。
//
// 対応: ベロシティ層 / ラウンドロビン (seq) / ランダム選択 (rand) / リリースサンプル (rel + rt_decay)
//       チョークグループ (grp / offBy / offTime) / note_polyphony / AHDSR / ループ / 奏法 (art: sus|short)
//       amp_veltrack + amp_velcurve / ベロシティクロスフェード (xf) / パン / チューニング
//
// 使い方:
//   const inst = await SfzInstrument.load("/samples/piano/");       // index.json を読む (バッファはまだ)
//   await inst.preload(ctx, notes);                                   // 曲で使うサンプルだけ decode
//   const out = inst.createOutput(ctx);                               // このコンテキスト用の出力 GainNode
//   inst.noteOn(ctx, out, pitch, time, durationSec, velocity);        // 時刻指定で発音 (note-off も内部で予約)

const bufferCache = new Map();   // url -> AudioBuffer (全コンテキスト共通。AudioBuffer はコンテキストに縛られない)
const loading = new Map();       // url -> Promise<AudioBuffer>
let cacheBytes = 0;
const CACHE_LIMIT = 1.4e9;       // decode 後 PCM の上限 (float32 換算)。超えたら古いものから捨てる
const lru = new Map();           // url -> lastUsed

function noteBytes(buf) { return buf.length * buf.numberOfChannels * 4; }
function touch(url) { lru.delete(url); lru.set(url, performance.now()); }
function evictIfNeeded(keep) {
  if (cacheBytes <= CACHE_LIMIT) return;
  for (const url of lru.keys()) {
    if (keep?.has(url)) continue;
    const b = bufferCache.get(url);
    if (!b) { lru.delete(url); continue; }
    bufferCache.delete(url); lru.delete(url); cacheBytes -= noteBytes(b);
    if (cacheBytes <= CACHE_LIMIT * 0.8) break;
  }
}

async function loadBuffer(decodeCtx, url) {
  if (bufferCache.has(url)) { touch(url); return bufferCache.get(url); }
  if (loading.has(url)) return loading.get(url);
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`sample fetch failed: ${url} (${res.status})`);
    const ab = await res.arrayBuffer();
    const buf = await decodeCtx.decodeAudioData(ab);
    bufferCache.set(url, buf); cacheBytes += noteBytes(buf); touch(url);
    return buf;
  })();
  loading.set(url, p);
  try { return await p; } finally { loading.delete(url); }
}

// 決定的な乱数 (再生とオフライン書き出しで同じサンプルが選ばれるように)
function hashRand(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class SfzInstrument {
  constructor(baseUrl, index) {
    this.baseUrl = baseUrl;
    this.index = index;
    this.samples = index.samples;
    this.regions = index.regions;
    this.hasShort = this.regions.some((r) => r.art === "short");
    this.resetCounters();
    // キーごとに候補 region を引ける表
    this.byKey = Array.from({ length: 128 }, () => []);
    this.regions.forEach((r, i) => { for (let k = r.k[0]; k <= r.k[1]; k++) this.byKey[k].push(i); });
  }
  static async load(baseUrl) {
    const res = await fetch(baseUrl + "index.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`index.json not found: ${baseUrl}`);
    return new SfzInstrument(baseUrl, await res.json());
  }
  get label() { return this.index.label ?? this.index.name; }
  sampleUrl(r) { return this.baseUrl + this.samples[r.s].f; }

  resetCounters() { this.noteIndex = 0; this.voices = []; }
  allNotesOff(time, fade = 0.08) { for (const v of this.voices) if (!v.ended) v.stop(time, fade); this.voices = []; }

  /* ── region 選択 (noteIdx から決定的に選ぶ: 再生・ループ・オフライン書き出しで同じ結果) ── */
  static famHash(r) { return ((r.k[0] * 131 + r.k[1]) * 131 + r.v[0]) * 131 + r.v[1] + (r.rel ? 7 : 0) + (r.seq ? r.seq[0] * 13 : 0); }
  select(pitch, vel, { release = false, short = false, noteIdx = 0 } = {}) {
    const out = [];
    const wantArt = this.hasShort ? (short ? "short" : "sus") : null;
    for (const i of this.byKey[pitch] ?? []) {
      const r = this.regions[i];
      if (!!r.rel !== release) continue;
      if (vel < r.v[0] || vel > r.v[1]) continue;
      if (wantArt && (r.art ?? "sus") !== wantArt) continue;
      if (r.rand) { const x = hashRand(noteIdx, i); if (x < r.rand[0] || x >= r.rand[1]) continue; }
      if (r.seq) {
        const pos = Math.floor(hashRand(noteIdx * 7919 + 17, SfzInstrument.famHash(r)) * r.seq[0]) + 1;
        if (r.seq[1] !== pos) continue;
      }
      out.push(r);
    }
    return out;
  }

  /* ── 曲で使うサンプルを前もって decode (再生・オフライン共通) ── */
  // notes: [{p, s, d, v, i}] — i は再生時に noteOn へ渡すのと同じ番号 (配列順)
  plan(notes, tempo) {
    const urls = new Set();
    const spb = 60 / tempo;
    notes.forEach((n, idx) => {
      const noteIdx = n.i ?? idx;
      const short = this.hasShort && n.d * spb < 0.35;
      for (const r of this.select(n.p, n.v, { noteIdx, short })) if (r.s >= 0) urls.add(this.sampleUrl(r));
      for (const r of this.select(n.p, n.v, { release: true, noteIdx })) if (r.s >= 0) urls.add(this.sampleUrl(r));
    });
    return urls;
  }
  async preload(decodeCtx, notes, tempo, onProgress) {
    const urls = [...this.plan(notes, tempo)];
    evictIfNeeded(new Set(urls));
    let done = 0;
    const workers = Array.from({ length: 6 }, async () => {
      while (urls.length) {
        const u = urls.shift();
        try { await loadBuffer(decodeCtx, u); } catch (e) { console.warn("[sampler]", u, e.message); }
        done++; onProgress?.(done, done + urls.length);
      }
    });
    await Promise.all(workers);
  }
  async ensure(decodeCtx, pitch, vel, noteIdx = 0) {
    const rs = [...this.select(pitch, vel, { noteIdx }), ...this.select(pitch, vel, { release: true, noteIdx }), ...(this.hasShort ? this.select(pitch, vel, { noteIdx, short: true }) : [])];
    await Promise.all(rs.filter((r) => r.s >= 0).map((r) => loadBuffer(decodeCtx, this.sampleUrl(r)).catch(() => null)));
  }

  createOutput(ctx) { const g = ctx.createGain(); g.gain.value = 1; return g; }

  /* ── ゲイン計算 ── */
  velGain(r, vel) {
    const v = vel / 127;
    let curveVal;
    if (r.vc && r.vc.length) {
      const pts = [[0, 0], ...r.vc]; if (pts[pts.length - 1][0] < 127) pts.push([127, 1]);
      let i = 1; while (i < pts.length - 1 && pts[i][0] < vel) i++;
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      curveVal = x1 === x0 ? y1 : y0 + ((vel - x0) * (y1 - y0)) / (x1 - x0);
    } else curveVal = v * v;
    let g = 1 - r.vt + r.vt * curveVal;
    if (r.xf) {
      const { inLo, inHi, outLo, outHi } = r.xf;
      if (inHi > inLo) g *= Math.min(1, Math.max(0, (vel - inLo) / (inHi - inLo)));
      if (outHi > outLo) g *= 1 - Math.min(1, Math.max(0, (vel - outLo) / (outHi - outLo)));
    }
    return Math.max(0, g);
  }

  /* ── チョーク / ポリフォニー ── */
  choke(group, time, excludeVoice) {
    for (const v of this.voices) {
      if (v === excludeVoice || v.ended) continue;
      if (v.region.offBy === group && v.start < time + 1e-6) v.stop(time, v.region.offTime ?? 0.006);
    }
  }
  limitPolyphony(r, pitch, time, newVoice) {
    if (!r.np) return;
    const same = this.voices.filter((v) => v !== newVoice && !v.ended && v.pitch === pitch && (v.region.grp ?? 0) === (r.grp ?? 0) && !v.region.rel);
    if (same.length >= r.np) same.slice(0, same.length - r.np + 1).forEach((v) => v.stop(time, r.offTime ?? 0.006));
  }
  // 終わった声を捨てる (オフライン書き出しでは onended が来ないので、自然に鳴り終わる時刻でも判定)
  gc(now) { if (this.voices.length > 64) this.voices = this.voices.filter((v) => !v.ended && v.endTime > now - 1 && v.natEnd > now); }

  /* ── 発音 ── */
  startVoice(ctx, out, r, pitch, time, vel, { releaseTrigger = false, heldSec = 0, oneShotDur = null, expr = null } = {}) {
    const buf = r.s >= 0 ? bufferCache.get(this.sampleUrl(r)) : null;
    if (r.choke) { if (r.grp) this.choke(r.grp, time); return null; }
    if (!buf) return null;
    touch(this.sampleUrl(r));
    let g = r.g * this.velGain(r, vel);
    if (releaseTrigger && r.rt) g *= Math.pow(10, (-r.rt * heldSec) / 20);
    if (g < 1e-4) return null;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const semis = (pitch - r.kc) * (r.kt ?? 1) + (r.tune ?? 0) / 100;
    src.playbackRate.value = Math.pow(2, semis / 12);
    if (r.loop && !r.oneShot) { src.loop = true; src.loopStart = r.loop[0]; src.loopEnd = r.loop[1]; }
    const gain = ctx.createGain();
    const e = r.env;
    const t0 = time + (r.delay ?? 0) + (e.delay ?? 0);
    const atk = Math.max(0.001, e.a);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(g, t0 + atk);
    let tHold = t0 + atk + (e.h ?? 0);
    if (e.h) gain.gain.setValueAtTime(g, tHold);
    if (e.d > 0 && e.s < 0.999) gain.gain.setTargetAtTime(g * e.s, tHold, Math.max(0.01, e.d / 4));
    let node = gain;
    if (r.pan) { const p = ctx.createStereoPanner(); p.pan.value = r.pan / 100; gain.connect(p); node = p; }
    // 表情 (v2): 音の途中で膨らむ/しぼむ → 別のゲインで直線ランプ (エンベロープと独立)
    if (expr && !r.oneShot && !releaseTrigger) {
      const ex = ctx.createGain();
      ex.gain.setValueAtTime(1, t0);
      ex.gain.linearRampToValueAtTime(expr.ratio, Math.max(t0 + 0.01, expr.tEnd));
      node.connect(ex); node = ex;
    }
    src.connect(gain); node.connect(out);
    const off = r.off ?? 0;
    const dur = r.end ? r.end - off : undefined;
    src.start(t0, off, r.loop && !r.oneShot ? undefined : dur);

    const natEnd = (r.loop && !r.oneShot) ? Infinity : t0 + (dur ?? buf.duration - off) / src.playbackRate.value;
    const voice = { region: r, pitch, start: t0, ended: false, endTime: Infinity, natEnd, src, gain,
      stop: (t, fade = 0.006) => {
        if (voice.ended) return; voice.ended = true;
        const at = Math.max(t, t0 + 0.001);
        gain.gain.cancelScheduledValues(at);
        gain.gain.setValueAtTime(gain.gain.value || g, at);
        gain.gain.linearRampToValueAtTime(0, at + fade);
        try { src.stop(at + fade + 0.01); } catch {}
        voice.endTime = at + fade;
      },
      release: (t) => {
        if (voice.ended) return; voice.ended = true;
        const rel = Math.max(0.005, e.r);
        gain.gain.cancelScheduledValues(t);
        gain.gain.setTargetAtTime(0, t, rel / 3);
        try { src.stop(t + rel * 1.5 + 0.05); } catch {}
        voice.endTime = t + rel;
      } };
    src.onended = () => { voice.ended = true; try { src.disconnect(); gain.disconnect(); node.disconnect(); } catch {} };
    if (r.grp) this.choke(r.grp, t0, voice);
    this.limitPolyphony(r, pitch, t0, voice);
    this.voices.push(voice);
    return voice;
  }

  noteOn(ctx, out, pitch, time, durSec, vel, noteIdx = null, velEnd = null) {
    this.gc(time);
    const idx = noteIdx ?? this.noteIndex++;
    const short = this.hasShort && durSec < 0.35;
    const regs = this.select(pitch, vel, { noteIdx: idx, short });
    const started = [];
    const tOff = time + Math.max(0.02, durSec);
    // v2 (終わりの強さ): ベロシティ曲線 (v^2) に合わせた比率で、tOff までに到達
    const expr = velEnd != null && velEnd !== vel && durSec >= 0.15
      ? { ratio: Math.max(0.03, Math.min(4, Math.pow(Math.max(1, velEnd) / Math.max(1, vel), 2))), tEnd: tOff }
      : null;
    for (const r of regs) { const v = this.startVoice(ctx, out, r, pitch, time, vel, { expr }); if (v) started.push(v); }
    // ノートオフ: ワンショット以外は指定時間後にリリース
    for (const v of started) if (!v.region.oneShot) v.release(tOff);
    // リリースサンプル
    const relVel = velEnd != null ? velEnd : vel;
    const rels = this.select(pitch, relVel, { release: true, noteIdx: idx });
    for (const r of rels) this.startVoice(ctx, out, r, pitch, tOff, relVel, { releaseTrigger: true, heldSec: durSec });
    return started;
  }
}

export function clearSampleCache() { bufferCache.clear(); lru.clear(); cacheBytes = 0; }
export function sampleCacheStats() { return { files: bufferCache.size, mb: +(cacheBytes / 1e6).toFixed(0) }; }
