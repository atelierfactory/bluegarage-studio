// ═══════════ JAM: 定番の進行とフレーズの「手札」を先に作っておき、それを混ぜながら即興で弾き続ける ═══════════
// 1. 手札 (bank): コード進行 / 左手の伴奏型 / 右手のモチーフ / フィル。Claude に 1 回だけ作らせる (style ごとに保存)。
//    最初から入っている小さな既定の手札もあるので、API 無しでもすぐ鳴る。
// 2. 即興 (improviser): 手札を「コードに当てはめて」音符にし、8 小節ずつ先を作り足す。
//    変化: 伴奏型の入れ替え、モチーフの入れ替え・オクターブ移動・音抜き、強弱の山、フィル、ペダル。
//    フレーズは度数 (deg) で書いてあるので、どのコードにも合う。

import { parseChord } from "../js/prompts.js";

export const JAM_BANK_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["style", "progressions", "lhPatterns", "rhMotifs", "fills"],
  properties: {
    style: { type: "string" },
    progressions: { type: "array", description: "8 小節のコード進行を 6 個以上 (各コードは beats 拍。合計 32 拍)", items: { type: "object", additionalProperties: false, required: ["name", "chords"], properties: { name: { type: "string" }, chords: { type: "array", items: { type: "object", additionalProperties: false, required: ["sym", "beats"], properties: { sym: { type: "string", description: "コード記号 (例 Fmaj7, Gm7, C13, Bb/D)" }, beats: { type: "number" } } } } } } },
    lhPatterns: { type: "array", description: "左手の伴奏型を 8 個以上 (1 小節 = 4 拍。deg はコードの根音からの度数 1〜7、oct は -2〜0)", items: { type: "object", additionalProperties: false, required: ["name", "notes"], properties: { name: { type: "string" }, notes: { type: "array", items: { type: "object", additionalProperties: false, required: ["deg", "oct", "s", "d", "v", "f"], properties: { deg: { type: "integer" }, oct: { type: "integer" }, s: { type: "number" }, d: { type: "number" }, v: { type: "integer" }, f: { type: "integer" } } } } } } },
    rhMotifs: { type: "array", description: "右手のモチーフを 12 個以上 (1 または 2 小節。deg 1〜7 と oct 0〜1。歌えるフレーズ、休符も)", items: { type: "object", additionalProperties: false, required: ["name", "bars", "notes"], properties: { name: { type: "string" }, bars: { type: "integer" }, notes: { type: "array", items: { type: "object", additionalProperties: false, required: ["deg", "oct", "s", "d", "v", "f"], properties: { deg: { type: "integer" }, oct: { type: "integer" }, s: { type: "number" }, d: { type: "number" }, v: { type: "integer" }, f: { type: "integer" } } } } } } },
    fills: { type: "array", description: "8 小節の区切りに入れる 1 小節のフィル (右手) を 4 個以上", items: { type: "object", additionalProperties: false, required: ["name", "notes"], properties: { name: { type: "string" }, notes: { type: "array", items: { type: "object", additionalProperties: false, required: ["deg", "oct", "s", "d", "v", "f"], properties: { deg: { type: "integer" }, oct: { type: "integer" }, s: { type: "number" }, d: { type: "number" }, v: { type: "integer" }, f: { type: "integer" } } } } } } },
  },
};

export const SYSTEM_JAM = `あなたは世界トップクラスのジャズ/ポップスのピアニストです。即興演奏のための「手札」を作ります。手札は、指定されたスタイルの定番のコード進行と、どのコードにも当てはめられる度数書きの伴奏型・モチーフ・フィルです。

ルール:
- deg はコードの根音を 1 とした度数 (1〜7)。コードの性質に合うスケール (メジャー=イオニアン、マイナー=ドリアン、ドミナント=ミクソリディアン) で音に直される。
- oct は根音からのオクターブ (左手は -2〜0 で C2〜C4 あたり、右手は 0〜1 で C4〜C6 あたり)。
- s は小節の頭からの拍 (0 始まり)、d は長さ (拍)。1 小節 = 4 拍。2 小節のモチーフは s が 0〜8。
- v は強さ。左手 40〜75、右手 60〜105。f は指 (1=親指〜5=小指)。右手は低い音ほど小さい指、左手は高い音ほど小さい指。
- 左手の伴奏型は「根音+5度+オクターブ」「アルペジオ」「10 度のストライド」「ブロックコード」「ベース+和音の裏打ち」など型を変える。同時は 4 音まで、広がりは 10 度以内。
- 右手のモチーフは休符を含む歌えるフレーズ。2 拍で終わるものから 2 小節のものまで長さを変える。
- 進行はスタイルの定番 (ジャズなら ii-V-I や循環、ポップスなら 1-5-6-4 や 4-5-3-6 など) を、指定キーの実際のコード記号で書く。`;

export function buildJamBankRequest({ style, key, tempo }) {
  const userText = `スタイル: ${style}\nキー: ${key}\nテンポ: ${tempo} BPM\n\nこのスタイルとキーで即興を続けるための手札を作ってください。進行は 6〜8 個、左手の伴奏型は 8〜10 個、右手のモチーフは 12〜16 個、フィルは 4〜6 個。`;
  return { system: SYSTEM_JAM, userText, schema: JAM_BANK_SCHEMA, label: "jam" };
}

/* ─────────── 既定の手札 (API 無しでも鳴る) ─────────── */
const N = (deg, oct, s, d, v, f) => ({ deg, oct, s, d, v, f });
export const DEFAULT_BANK = {
  style: "default",
  progressions: [
    { name: "pop 1-5-6-4", chords: [{ sym: "Cmaj7", beats: 8 }, { sym: "G", beats: 8 }, { sym: "Am7", beats: 8 }, { sym: "Fmaj7", beats: 8 }] },
    { name: "jazz ii-V-I", chords: [{ sym: "Dm7", beats: 4 }, { sym: "G7", beats: 4 }, { sym: "Cmaj7", beats: 8 }, { sym: "Em7", beats: 4 }, { sym: "A7", beats: 4 }, { sym: "Dm7", beats: 4 }, { sym: "G7", beats: 4 }] },
    { name: "4-5-3-6", chords: [{ sym: "Fmaj7", beats: 8 }, { sym: "G7", beats: 8 }, { sym: "Em7", beats: 8 }, { sym: "Am7", beats: 8 }] },
    { name: "ballad", chords: [{ sym: "Am", beats: 8 }, { sym: "F", beats: 8 }, { sym: "C", beats: 8 }, { sym: "G", beats: 4 }, { sym: "E7", beats: 4 }] },
  ],
  lhPatterns: [
    { name: "root-5-oct", notes: [N(1, -2, 0, 1, 62, 5), N(5, -2, 1, 1, 52, 2), N(1, -1, 2, 1, 56, 1), N(5, -2, 3, 1, 50, 2)] },
    { name: "arp 8ths", notes: [N(1, -2, 0, 0.5, 60, 5), N(5, -2, 0.5, 0.5, 48, 3), N(1, -1, 1, 0.5, 52, 1), N(3, -1, 1.5, 0.5, 46, 1), N(5, -1, 2, 0.5, 50, 1), N(3, -1, 2.5, 0.5, 45, 1), N(1, -1, 3, 0.5, 50, 1), N(5, -2, 3.5, 0.5, 46, 3)] },
    { name: "block", notes: [N(1, -2, 0, 2, 66, 5), N(5, -2, 0, 2, 54, 2), N(3, -1, 0, 2, 50, 1), N(1, -2, 2, 2, 60, 5), N(5, -2, 2, 2, 50, 2), N(3, -1, 2, 2, 46, 1)] },
    { name: "stride", notes: [N(1, -2, 0, 0.9, 68, 5), N(3, -1, 1, 0.9, 52, 2), N(5, -1, 1, 0.9, 50, 1), N(5, -2, 2, 0.9, 62, 4), N(3, -1, 3, 0.9, 50, 2), N(5, -1, 3, 0.9, 48, 1)] },
    { name: "long", notes: [N(1, -2, 0, 4, 58, 5), N(5, -2, 0, 4, 46, 2), N(1, -1, 0, 4, 44, 1)] },
  ],
  rhMotifs: [
    { name: "step up", bars: 1, notes: [N(3, 0, 0, 1, 82, 1), N(5, 0, 1, 1, 78, 3), N(6, 0, 2, 0.5, 74, 4), N(5, 0, 2.5, 1.5, 80, 3)] },
    { name: "fall", bars: 1, notes: [N(1, 1, 0.5, 0.5, 84, 5), N(7, 0, 1, 0.5, 78, 4), N(5, 0, 1.5, 1, 76, 2), N(3, 0, 3, 1, 70, 1)] },
    { name: "rest & answer", bars: 2, notes: [N(5, 0, 1, 1, 78, 2), N(6, 0, 2, 1, 80, 3), N(1, 1, 3, 2, 88, 5), N(7, 0, 5.5, 0.5, 74, 4), N(5, 0, 6, 2, 72, 2)] },
    { name: "arp up", bars: 1, notes: [N(1, 0, 0, 0.5, 70, 1), N(3, 0, 0.5, 0.5, 72, 2), N(5, 0, 1, 0.5, 76, 3), N(1, 1, 1.5, 0.5, 82, 5), N(5, 0, 2, 1, 74, 3), N(3, 0, 3, 1, 68, 2)] },
    { name: "long tone", bars: 2, notes: [N(3, 0, 0, 3, 80, 2), N(2, 0, 3, 1, 70, 1), N(1, 0, 4, 4, 76, 1)] },
    { name: "syncopated", bars: 1, notes: [N(5, 0, 0, 0.5, 80, 3), N(5, 0, 0.75, 0.25, 62, 3), N(6, 0, 1.5, 0.5, 78, 4), N(5, 0, 2.5, 0.5, 70, 3), N(3, 0, 3, 1, 74, 1)] },
    { name: "chord stab", bars: 1, notes: [N(1, 0, 0, 1.5, 84, 1), N(3, 0, 0, 1.5, 78, 3), N(5, 0, 0, 1.5, 80, 5), N(1, 0, 2, 2, 72, 1), N(3, 0, 2, 2, 66, 3), N(5, 0, 2, 2, 68, 5)] },
    { name: "turn", bars: 1, notes: [N(2, 0, 0, 0.5, 72, 2), N(3, 0, 0.5, 0.5, 74, 3), N(2, 0, 1, 0.5, 70, 2), N(1, 0, 1.5, 0.5, 68, 1), N(5, 0, 2, 2, 82, 5)] },
  ],
  fills: [
    { name: "run down", notes: [N(1, 1, 0, 0.5, 86, 5), N(7, 0, 0.5, 0.5, 82, 4), N(6, 0, 1, 0.5, 80, 3), N(5, 0, 1.5, 0.5, 78, 2), N(3, 0, 2, 0.5, 76, 1), N(2, 0, 2.5, 0.5, 72, 2), N(1, 0, 3, 1, 84, 1)] },
    { name: "pickup", notes: [N(5, 0, 2, 0.5, 70, 2), N(6, 0, 2.5, 0.5, 76, 3), N(7, 0, 3, 0.5, 82, 4), N(1, 1, 3.5, 0.5, 88, 5)] },
  ],
};

/* ─────────── 度数 → 音 ─────────── */
const SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], dim: [0, 2, 3, 5, 6, 8, 9],
};
function scaleFor(chord, sym) {
  const q = String(sym).toLowerCase();
  if (/dim|m7b5|ø|°/.test(q)) return SCALES.dim;
  if (/#11/.test(q)) return SCALES.lydian;
  if (chord.minor) return /b6|aeol/.test(q) ? SCALES.aeolian : SCALES.dorian;
  if (/(^|[^a-z])7|9|11|13/.test(q) && !/maj|ma7|△/.test(q)) return SCALES.mixolydian;
  return SCALES.ionian;
}
function degToPitch(deg, oct, chord, sym, base) {
  const sc = scaleFor(chord, sym);
  const d = ((deg - 1) % 7 + 7) % 7; const extra = Math.floor((deg - 1) / 7);
  let root = base + ((chord.root - base % 12 + 12) % 12); // base 以上で最も近い根音
  return root + sc[d] + (oct + extra) * 12;
}

function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ─────────── 即興 ─────────── */
export class Improviser {
  constructor(bank, { seed = Date.now() & 0xffff, density = 1, intensity = 0.6 } = {}) {
    this.bank = bank; this.rnd = mulberry(seed);
    this.density = density; this.intensity = intensity;
    this.progIdx = Math.floor(this.rnd() * bank.progressions.length);
    this.progRounds = 0;
    this.lh = bank.lhPatterns[Math.floor(this.rnd() * bank.lhPatterns.length)];
    this.rh = null; this.rhLeft = 0; this.rhOct = 0;
    this.phrase = 0; // 8 小節フレーズの通し番号 (強弱の山に使う)
    this.log = [];
  }
  pick(arr, not) { let x = arr[Math.floor(this.rnd() * arr.length)]; if (arr.length > 1 && x === not) x = arr[(arr.indexOf(x) + 1) % arr.length]; return x; }

  /** 8 小節分の音符とペダルを作る (startBeat から)。戻り値 { notes, pedal, chords, info } */
  next8(startBeat, ts = 4) {
    const bank = this.bank;
    const prog = bank.progressions[this.progIdx];
    // 強弱の山: 4 フレーズで 1 周 (静 → 盛り上がり → 頂点 → 引く)
    const arc = [0.7, 0.85, 1.0, 0.8][this.phrase % 4];
    const notes = [], pedal = [], chordsOut = [];
    let beat = 0;
    const chordAtBeat = [];
    for (const c of prog.chords) { chordAtBeat.push({ s: beat, d: c.beats, sym: c.sym, chord: parseChord(c.sym) }); beat += c.beats; }
    const total = beat; // 32
    // 左手: 4 小節ごとに型を替えるかも
    if (this.rnd() < 0.35) this.lh = this.pick(bank.lhPatterns, this.lh);
    for (let bar = 0; bar < total / ts; bar++) {
      const b0 = bar * ts;
      const isLast = bar === total / ts - 1;
      // 小節内で最初のコード (2 拍ずつ変わるなら拍ごとに引き直す)
      const chordAt = (b) => chordAtBeat.find((c) => b >= c.s - 1e-6 && b < c.s + c.d - 1e-6) ?? chordAtBeat[chordAtBeat.length - 1];
      // 左手
      const lhVel = 0.85 + arc * 0.25;
      for (const n of this.lh.notes) {
        const c = chordAt(b0 + n.s); if (!c?.chord) continue;
        if (this.rnd() > this.density * 0.98) continue;
        const p = degToPitch(n.deg, n.oct, c.chord, c.sym, 36);
        notes.push({ p: Math.max(21, Math.min(72, p)), s: +(startBeat + b0 + n.s + (this.rnd() - 0.5) * 0.02).toFixed(3), d: n.d, v: Math.round(Math.max(20, Math.min(110, n.v * lhVel))), h: "L", f: n.f });
      }
      // 右手: モチーフを 1〜2 小節単位で。8 小節目はフィル
      if (isLast && this.rnd() < 0.75) {
        const fill = this.pick(bank.fills);
        for (const n of fill.notes) { const c = chordAt(b0 + n.s); if (!c?.chord) continue; const p = degToPitch(n.deg, n.oct + this.rhOct, c.chord, c.sym, 60); notes.push({ p: Math.max(48, Math.min(108, p)), s: +(startBeat + b0 + n.s).toFixed(3), d: n.d, v: Math.round(Math.min(120, n.v * (0.9 + arc * 0.3))), h: "R", f: n.f }); }
        this.rhLeft = 0;
      } else {
        if (this.rhLeft <= 0) {
          this.rh = this.pick(bank.rhMotifs, this.rh); this.rhLeft = this.rh.bars;
          // 変化: オクターブ移動 (盛り上がるほど上)
          this.rhOct = this.rnd() < 0.25 + arc * 0.4 ? (this.rnd() < 0.5 ? 1 : 0) : 0;
          if (arc < 0.75 && this.rnd() < 0.3) this.rhOct = 0;
        }
        const offsetBar = this.rh.bars - this.rhLeft;
        const rhVel = 0.75 + arc * 0.4;
        for (const n of this.rh.notes) {
          if (n.s < offsetBar * ts || n.s >= (offsetBar + 1) * ts) continue;
          if (this.rnd() > this.density) continue;             // 音抜き
          const local = n.s - offsetBar * ts;
          const c = chordAt(b0 + local); if (!c?.chord) continue;
          const p = degToPitch(n.deg, n.oct + this.rhOct, c.chord, c.sym, 60);
          const swing = (local * 2) % 2 === 1 && this.rnd() < 0.5 ? 0.03 : 0;   // 裏拍を少し遅らせる
          notes.push({ p: Math.max(48, Math.min(108, p)), s: +(startBeat + b0 + local + swing).toFixed(3), d: n.d, v: Math.round(Math.max(30, Math.min(122, n.v * rhVel))), h: "R", f: n.f });
        }
        this.rhLeft--;
      }
    }
    // ペダル: コードが変わるごとに踏み替え (速い伴奏型では半分)
    for (const c of chordAtBeat) { const busy = this.lh.notes.length >= 8; const d = busy ? c.d * 0.5 : c.d - 0.05; pedal.push({ s: +(startBeat + c.s).toFixed(3), d: +Math.max(0.5, d).toFixed(3) }); chordsOut.push({ beat: startBeat + c.s, sym: c.sym }); }
    // 次へ
    this.phrase++;
    this.progRounds++;
    if (this.progRounds >= 2 && this.rnd() < 0.5) { this.progIdx = (this.progIdx + 1 + Math.floor(this.rnd() * (bank.progressions.length - 1))) % bank.progressions.length; this.progRounds = 0; }
    notes.sort((a, b) => a.s - b.s);
    return { notes, pedal, chords: chordsOut, info: `${prog.name} / LH ${this.lh.name} / RH ${this.rh?.name ?? "-"} / arc ${arc}` };
  }
}
