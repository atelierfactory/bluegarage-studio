// ═══════════ Claude Opus 5 の演奏の設計図 ═══════════
// ここに書くのは「私がこの曲をどう弾くか」。opus-interpret.mjs がこれを音符に落とす。
// 小節番号は楽譜のもの。強弱記号は LilyPond から自動で読むので、ここには「楽譜に書いていない事」を書く。
const LY = "/private/tmp/claude-501/-Users-satorun-Documents-agent-product-toys-music-app/ce9f24c2-4c18-4043-ab35-27cf99ad8cb4/scratchpad/fifth_ly/beethoven_fifth_op67-lys/mvt01-allegroconbrio.ly";

export const PLANS = {
  /* ───────────── ベートーヴェン 交響曲第 5 番「運命」第 1 楽章 (ピアノ編曲) ───────────── */
  fifth: {
    midi: "beethoven_fifth_op67.mid",
    out: "fifth-opus.vesper.json",
    ly: LY,
    title: "交響曲第 5 番「運命」第 1 楽章 (ピアノ編曲)",
    pieceTitle: "Symphony No. 5 in C minor, Op. 67 — I. Allegro con brio (piano reduction)",
    composer: "Ludwig van Beethoven",
    year: "1808",
    key: "C minor",
    timeSig: 2,
    // ベートーヴェンの指定は 2 分音符 = 108 (= 4 分音符 216)。速すぎると編曲のオクターブが潰れるので、
    // 実際の名演の多くと同じあたり (4 分音符 200) に置く。勢いは残る。
    tempo: 200,
    melodyLead: 0,                 // ユニゾンが多い曲なので、旋律をずらさない
    startDynamic: "ff",
    motif: { shortDur: 0.5, minLong: 1.4 },
    concept: "Public Domain (Augener's Edition, typeset by Magnus Lewis-Smith, Mutopia Project) · https://www.mutopiaproject.org/ftp/BeethovenLv/O67/beethoven_fifth_op67/",
    note: "Allegro con brio。3 つの短い音と 1 つの長い音の動機が、全曲を組み立てる。",

    // 楽譜の記号だけでは足りない所を、私が決める
    dynamics: [
      { fromBar: 1, toBar: 5, from: "ff" },                    // 冒頭の動機は ff（楽譜の読み取りのずれを上書き）
      { fromBar: 6, toBar: 13, from: "p" },                    // 弦の答えは p から
      { fromBar: 14, toBar: 17, from: "p", to: 62 },           // 少しずつ起き上がる
      { fromBar: 18, toBar: 21, from: 66, to: 92 },            // 最初の頂点へ
      { fromBar: 63, toBar: 74, from: "p" },                   // 第 2 主題 (変ホ長調) は静かに歌う
      { fromBar: 75, toBar: 82, from: "p", to: 62 },
      { fromBar: 83, toBar: 93, from: 62, to: 101 },           // 徐々に熱く
      { fromBar: 196, toBar: 214, from: 78, to: 48 },          // 展開部の和音の掛け合いが遠ざかる
      { fromBar: 215, toBar: 227, from: 46, to: 36 },          // さらに遠く（ここが一番静か）
      { fromBar: 228, toBar: 231, from: 101 },                 // 突然の ff
      { fromBar: 232, toBar: 238, from: 33 },                  // また pp
      { fromBar: 239, toBar: 247, from: 60, to: 108 },         // 再現部へ駆け上がる
      { fromBar: 268, toBar: 272, from: 58, to: 50 },          // オーボエの独奏（カデンツァ）
      { fromBar: 479, toBar: 481, from: 108 },
      { fromBar: 482, toBar: 490, from: "pp", to: 52 },        // 終わる前の静けさ
      { fromBar: 491, toBar: 496, from: 60, to: 104 },         // 最後の追い込み
      { fromBar: 497, toBar: 505, from: 112 },                 // 締めの和音
    ],

    // 区間ごとの性格（ペダル・音の切り方・声部のバランス）
    sections: [
      { from: 1, to: 5, name: "動機", pedal: "dry", articulation: 0.52, motifShort: 0.48, motifLong: 9, stress: 4,
        balance: { melody: 5, inner: -6, bass: 2 } },
      { from: 6, to: 21, name: "第 1 主題", pedal: "short", articulation: 0.70, motifShort: 0.58, motifLong: 6, stress: 4,
        balance: { melody: 9, inner: -12, bass: 1, repeated: -6 } },
      { from: 22, to: 24, name: "動機 (2 回目)", pedal: "dry", articulation: 0.52, motifShort: 0.48, motifLong: 9, stress: 4,
        balance: { melody: 5, inner: -6, bass: 2 } },
      { from: 25, to: 33, name: "答え", pedal: "short", articulation: 0.72, motifShort: 0.58, motifLong: 5, stress: 3,
        balance: { melody: 10, inner: -13, bass: 0, repeated: -7 } },
      { from: 34, to: 58, name: "経過句", pedal: "short", articulation: 0.76, motifShort: 0.60, motifLong: 6, stress: 4,
        balance: { melody: 9, inner: -11, bass: 3, repeated: -5 } },
      { from: 59, to: 62, name: "ホルンの呼びかけ", pedal: "dry", articulation: 0.60, motifShort: 0.52, motifLong: 10, stress: 5,
        balance: { melody: 7, inner: -7, bass: 3 } },
      { from: 63, to: 93, name: "第 2 主題", pedal: "long", articulation: 1.0, motifShort: 0.70, motifLong: 4, stress: 2,
        balance: { melody: 12, inner: -15, bass: 2, repeated: -8 } },
      { from: 94, to: 124, name: "結び", pedal: "harmonic", articulation: 0.82, motifShort: 0.58, motifLong: 6, stress: 4,
        balance: { melody: 9, inner: -11, bass: 2, repeated: -5 } },
      { from: 125, to: 195, name: "展開部 前半", pedal: "short", articulation: 0.76, motifShort: 0.56, motifLong: 7, stress: 4,
        balance: { melody: 10, inner: -12, bass: 2, repeated: -6 } },
      { from: 196, to: 238, name: "展開部 和音の掛け合い", pedal: "short", articulation: 0.86, motifShort: 0.62, motifLong: 4, stress: 2,
        balance: { melody: 8, inner: -10, bass: 1, repeated: -4 } },
      { from: 239, to: 247, name: "再現部へ", pedal: "short", articulation: 0.74, motifShort: 0.56, motifLong: 7, stress: 5,
        balance: { melody: 9, inner: -11, bass: 3 } },
      { from: 248, to: 267, name: "再現部 第 1 主題", pedal: "short", articulation: 0.70, motifShort: 0.56, motifLong: 7, stress: 4,
        balance: { melody: 9, inner: -12, bass: 1, repeated: -6 } },
      { from: 268, to: 272, name: "オーボエの独奏", pedal: "long", articulation: 1.0, motifShort: 0.75, motifLong: 3, stress: 1,
        balance: { melody: 14, inner: -16, bass: 0 } },
      { from: 273, to: 330, name: "再現部 続き", pedal: "short", articulation: 0.78, motifShort: 0.58, motifLong: 6, stress: 4,
        balance: { melody: 10, inner: -12, bass: 2, repeated: -6 } },
      { from: 331, to: 373, name: "再現部 第 2 主題", pedal: "long", articulation: 1.0, motifShort: 0.70, motifLong: 4, stress: 2,
        balance: { melody: 12, inner: -15, bass: 2, repeated: -8 } },
      { from: 374, to: 478, name: "コーダ", pedal: "short", articulation: 0.74, motifShort: 0.56, motifLong: 7, stress: 5,
        balance: { melody: 9, inner: -11, bass: 3, repeated: -5 } },
      { from: 479, to: 505, name: "終結", pedal: "harmonic", articulation: 0.72, motifShort: 0.54, motifLong: 8, stress: 5,
        balance: { melody: 8, inner: -9, bass: 4 } },
    ],

    // 時間の揺れ（Fable の流れでは作れなかった所）
    rubato: [
      { fromBar: 2, toBar: 2, shape: "hold", amount: 0.30 },            // 最初のフェルマータ
      { fromBar: 4, toBar: 5, shape: "hold", amount: 0.24 },            // 2 つ目は長く
      { fromBar: 21, toBar: 21, shape: "hold", amount: 0.42 },
      { fromBar: 23, toBar: 24, shape: "hold", amount: 0.30 },
      { fromBar: 62, toBar: 62, shape: "rit", amount: 0.88, after: 0.97 },   // 第 2 主題へ入る前に息を置く
      { fromBar: 63, toBar: 82, shape: "tempo", amount: 0.97, after: 1 },    // 第 2 主題は少しだけ落ち着く
      { fromBar: 122, toBar: 124, shape: "rit", amount: 0.88 },
      { fromBar: 226, toBar: 227, shape: "rit", amount: 0.90, after: 1 },    // 一番静かな所の前
      { fromBar: 245, toBar: 247, shape: "accel", amount: 1.05, after: 1 },  // 再現部へ突っ込む
      { fromBar: 267, toBar: 267, shape: "rit", amount: 0.70, after: 0.45 }, // オーボエの独奏へ
      { fromBar: 268, toBar: 272, shape: "tempo", amount: 0.45, after: 1 },  // 独奏は自由に
      { fromBar: 372, toBar: 373, shape: "rit", amount: 0.92, after: 1 },
      { fromBar: 481, toBar: 483, shape: "rit", amount: 0.90, after: 0.93 },
      { fromBar: 484, toBar: 490, shape: "tempo", amount: 0.93, after: 1 },  // 静かな所は少しゆっくり
      { fromBar: 491, toBar: 496, shape: "accel", amount: 1.06, after: 1.04 },
      { fromBar: 501, toBar: 505, shape: "rit", amount: 0.90, after: null }, // 最後の和音を踏みしめる
    ],

    // 頂点の音をもう少しだけ強く
    accents: [
      { fromBar: 18, toBar: 21, v: 3, role: "melody" },
      { fromBar: 44, toBar: 58, v: 3, role: "melody" },
      { fromBar: 90, toBar: 93, v: 4, role: "melody" },
      { fromBar: 179, toBar: 195, v: 3, role: "melody" },
      { fromBar: 346, toBar: 373, v: 3, role: "melody" },
      { fromBar: 439, toBar: 478, v: 4, role: "melody" },
      { fromBar: 497, toBar: 505, v: 6 },
    ],

    memos: [
      "この曲は「3 つの短い音 + 1 つの長い音」の動機だけで組み立てられている。だから動機は毎回、短い 3 つを切って詰め、長い音に重みを置いた (43 か所を自動で見つけて同じ形にした)。",
      "冒頭と 22 小節の動機はペダルを踏まない。音と音の間の無音が、この曲の怖さだから。フェルマータは 3〜4 倍に伸ばして、次に入るまでの静けさを作った。",
      "第 2 主題 (63 小節〜、変ホ長調) は別の世界。ペダルを長くし、音を切らずに歌わせ、旋律を内声より 27 も大きくした。テンポも 3% だけ落ち着かせた。",
      "展開部の 196〜238 小節は、和音の掛け合いが遠ざかっていく所。78 から 36 まで、42 段かけて落とした。そこに 228 小節の突然の ff が来る。",
      "268 小節のオーボエの独奏は、テンポを 45% まで落として自由に。ここだけは指揮者が止まり、一人が歌う。",
      "コーダは押し切るが、482〜490 小節でいったん静まり (pp)、491 から 6% 加速して最後の和音へ。501 小節から踏みしめて終わる。",
      "声部のバランスは区間ごとに変えた。ユニゾンの所は差を小さく (旋律 +5)、歌う所は大きく (+12 / 内声 -15)。同じ高さを刻み続ける伴奏はさらに引いた。",
    ],
    performanceNotes: "Claude Opus 5 の演奏解釈。楽譜 (Augener 版) の強弱記号を土台に、全曲を一度に設計。",
  },
};
