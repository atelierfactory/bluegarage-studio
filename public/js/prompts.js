// ═══════════ prompts / schemas / tool definitions (ブラウザと server.js で共有・純粋関数のみ) ═══════════
// ここには DOM も Node API も使わない。設計図・トラック・ミックス・シンセ音色・チャットの
// 「Claude に何をどう頼むか」を全部この 1 ファイルに集める。

export const INSTRUMENTS = [
  "drums", "bass", "piano", "epiano", "organ",
  "guitar-electric", "guitar-electric-mute", "guitar-acoustic",
  "synth", "synth-lead", "synth-pad", "synth-bass",
  "strings", "saxophone", "trumpet", "flute",
];

export const INSTRUMENT_RANGE = {
  drums: [35, 81], bass: [28, 55], "synth-bass": [24, 60], piano: [21, 108], epiano: [28, 103], organ: [36, 96],
  "guitar-electric": [40, 88], "guitar-electric-mute": [40, 76], "guitar-acoustic": [40, 84],
  synth: [24, 108], "synth-lead": [48, 96], "synth-pad": [36, 84],
  strings: [36, 96], saxophone: [49, 81], trumpet: [54, 86], flute: [60, 96],
};
// 同時発音数の上限 (演奏可能性チェック用)
export const INSTRUMENT_POLY = {
  bass: 2, "synth-bass": 2, saxophone: 1, trumpet: 1, flute: 1, "guitar-electric": 6, "guitar-electric-mute": 6, "guitar-acoustic": 6,
  piano: 10, epiano: 10, organ: 10, synth: 16, "synth-lead": 4, "synth-pad": 8, strings: 8, drums: 8,
};

/* ---------------------------------- schemas ---------------------------------- */

export const BLUEPRINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "tempo", "timeSig", "key", "concept", "sections", "chordProgression", "trackPlan", "tempoChanges"],
  properties: {
    title: { type: "string", description: "曲のタイトル(日本語可)" },
    tempo: { type: "number", description: "基準 BPM" },
    timeSig: { type: "integer", description: "1小節の拍数 (例: 4)" },
    key: { type: "string", description: '例: "A minor", "E major"' },
    concept: { type: "string", description: "アレンジ全体のコンセプト、音像、リファレンスの解釈 (2-4文)" },
    sections: {
      type: "array",
      description: "曲の構成。bars の合計が曲の長さになる",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "bars", "description"],
        properties: {
          name: { type: "string", description: '例: "Intro", "A(Verse)", "Sabi(Chorus)"' },
          bars: { type: "integer" },
          description: { type: "string", description: "このセクションのダイナミクスと各パートの動き" },
        },
      },
    },
    chordProgression: {
      type: "array",
      description: "コード進行。曲頭からの小節番号(0始まり)と拍(0始まり)で指定",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["bar", "beat", "chord"],
        properties: {
          bar: { type: "integer" },
          beat: { type: "number" },
          chord: { type: "string", description: '例: "Am7", "F#m7b5", "E7(#9)", "C/E"' },
        },
      },
    },
    tempoChanges: {
      type: "array",
      description: "テンポの変化点 (無ければ空配列)。リタルダンド等は 2 点を置く: 変化の始まりの拍で現在テンポ、終わりの拍で到達テンポ。間は直線でつなぐ",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["bar", "beat", "tempo"],
        properties: { bar: { type: "integer" }, beat: { type: "number" }, tempo: { type: "number" } },
      },
    },
    trackPlan: {
      type: "array",
      description: "推奨トラック編成",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "instrument", "role", "stylePrompt"],
        properties: {
          name: { type: "string" },
          instrument: { type: "string", enum: INSTRUMENTS },
          role: { type: "string", description: '例: "drums", "bass", "chords", "melody", "lead", "pad", "arpeggio", "counter-melody", "percussion"' },
          stylePrompt: { type: "string", description: "このトラックの生成に使うスタイル指示(ユーザーのリファレンスを反映)。synth 系なら欲しい音色も書く" },
        },
      },
    },
  },
};

export const NOTES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["performanceNotes", "notes"],
  properties: {
    performanceNotes: {
      type: "string",
      description: "演奏意図の説明: グルーヴ、ダイナミクス設計、フレージング、リファレンスをどう解釈したか (2-4文)",
    },
    notes: {
      type: "array",
      description: "MIDIノート配列",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["p", "s", "d", "v"],
        properties: {
          p: { type: "integer", description: "MIDIピッチ 0-127 (ドラムはGMドラムマップ)" },
          s: { type: "number", description: "開始位置: 生成範囲の先頭からの拍数 (0始まり, 小数可)" },
          d: { type: "number", description: "長さ(拍)" },
          v: { type: "integer", description: "ベロシティ 1-127 (音の頭の強さ)" },
          v2: { type: "integer", description: "省略可。音の終わりの強さ 1-127。弦・管・パッド等の長い音で、伸ばしながら膨らむ/しぼむ(クレッシェンド/ディミヌエンド)ときだけ付ける" },
        },
      },
    },
  },
};

export const MIX_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["concept", "tracks", "master"],
  properties: {
    concept: { type: "string", description: "音像の設計 (2-3文): 何を前に出し、何を奥に置くか。左右の広がり。" },
    tracks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "volume", "pan", "hpf", "eqLow", "eqMid", "eqHigh", "comp", "hall", "room", "reason"],
        properties: {
          name: { type: "string", description: "トラック名 (与えられた名前をそのまま)" },
          volume: { type: "number", description: "dB (-24〜+3)。主役 -4〜-8、脇役 -10〜-16 が目安" },
          pan: { type: "number", description: "-1(左)〜1(右)。キック/スネア/ベース/主旋律は 0 付近" },
          hpf: { type: "number", description: "ローカット Hz (20〜400)。ベース/キックは 20-30、他は 60-200 で低域の濁りを取る" },
          eqLow: { type: "number", description: "低域 (250Hz以下) dB -12〜+6" },
          eqMid: { type: "number", description: "中域 (250〜2500Hz) dB -12〜+6" },
          eqHigh: { type: "number", description: "高域 (2.5kHz以上) dB -12〜+6" },
          comp: { type: "number", description: "コンプ量 0〜1 (0=なし, 0.3=軽く, 0.7=しっかり)" },
          hall: { type: "number", description: "ホール(長い響き)へのセンド 0〜1" },
          room: { type: "number", description: "ルーム(短い響き)へのセンド 0〜1" },
          reason: { type: "string", description: "一言 (なぜこの設定か)" },
        },
      },
    },
    master: {
      type: "object",
      additionalProperties: false,
      required: ["glue", "hallDecay", "roomDecay", "targetLufs", "width"],
      properties: {
        glue: { type: "number", description: "マスターのバスコンプ量 0〜1" },
        hallDecay: { type: "number", description: "ホールの残響時間 秒 (1.2〜5)" },
        roomDecay: { type: "number", description: "ルームの残響時間 秒 (0.3〜1.2)" },
        targetLufs: { type: "number", description: "書き出し時の目標ラウドネス LUFS (-9〜-20)。ストリーミング基準 -14、ダイナミックな生音 -16〜-18、EDM/ロック -9〜-11" },
        width: { type: "number", description: "全体のステレオ幅 0.5(狭)〜1.5(広)" },
      },
    },
  },
};

// シンセ音色 (public/js/synth.js が再生する)
export const SYNTH_PATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "osc", "sub", "noise", "filter", "ampEnv", "filterEnv", "lfo", "fx", "glide", "mono", "level"],
  properties: {
    name: { type: "string" },
    description: { type: "string", description: "音色の狙い 1 文" },
    osc: {
      type: "array", description: "1〜3 個",
      items: {
        type: "object", additionalProperties: false,
        required: ["wave", "octave", "semi", "detune", "level", "unison", "spread"],
        properties: {
          wave: { type: "string", enum: ["saw", "square", "triangle", "sine", "pulse25", "pulse12", "fm2", "fm3", "fm5", "am"] },
          octave: { type: "integer", description: "-2〜2" },
          semi: { type: "integer", description: "半音 -12〜12" },
          detune: { type: "number", description: "セント -50〜50" },
          level: { type: "number", description: "0〜1" },
          unison: { type: "integer", description: "重ねる数 1〜7 (1=なし)" },
          spread: { type: "number", description: "ユニゾンの広がり セント 0〜60" },
        },
      },
    },
    sub: { type: "object", additionalProperties: false, required: ["wave", "level"], properties: { wave: { type: "string", enum: ["sine", "square", "triangle"] }, level: { type: "number", description: "0〜1 (1オクターブ下)" } } },
    noise: { type: "object", additionalProperties: false, required: ["type", "level", "decay"], properties: { type: { type: "string", enum: ["white", "pink", "brown"] }, level: { type: "number", description: "0〜1" }, decay: { type: "number", description: "秒 (アタックのノイズなら 0.05〜0.2)" } } },
    filter: {
      type: "object", additionalProperties: false,
      required: ["type", "cutoff", "q", "envAmount", "keyTrack"],
      properties: {
        type: { type: "string", enum: ["lowpass", "highpass", "bandpass"] },
        cutoff: { type: "number", description: "Hz 20〜18000" },
        q: { type: "number", description: "0.1〜12" },
        envAmount: { type: "number", description: "フィルターエンベロープの深さ オクターブ 0〜6" },
        keyTrack: { type: "number", description: "キートラック 0〜1" },
      },
    },
    ampEnv: { type: "object", additionalProperties: false, required: ["a", "d", "s", "r"], properties: { a: { type: "number", description: "秒" }, d: { type: "number" }, s: { type: "number", description: "0〜1" }, r: { type: "number" } } },
    filterEnv: { type: "object", additionalProperties: false, required: ["a", "d", "s", "r"], properties: { a: { type: "number" }, d: { type: "number" }, s: { type: "number" }, r: { type: "number" } } },
    lfo: {
      type: "object", additionalProperties: false,
      required: ["target", "rate", "depth", "wave"],
      properties: {
        target: { type: "string", enum: ["none", "filter", "pitch", "amp", "pan"] },
        rate: { type: "number", description: "Hz 0.05〜20" },
        depth: { type: "number", description: "0〜1" },
        wave: { type: "string", enum: ["sine", "triangle", "square", "sawtooth"] },
      },
    },
    fx: {
      type: "object", additionalProperties: false,
      required: ["drive", "chorus", "delay", "reverb"],
      properties: {
        drive: { type: "number", description: "歪み 0〜1" },
        chorus: { type: "object", additionalProperties: false, required: ["mix", "rate", "depth"], properties: { mix: { type: "number" }, rate: { type: "number", description: "Hz" }, depth: { type: "number" } } },
        delay: { type: "object", additionalProperties: false, required: ["mix", "time", "feedback", "pingpong"], properties: { mix: { type: "number" }, time: { type: "number", description: "拍 (0.25=16分, 0.5=8分, 0.75=付点8分)" }, feedback: { type: "number", description: "0〜0.8" }, pingpong: { type: "boolean" } } },
        reverb: { type: "object", additionalProperties: false, required: ["mix", "decay"], properties: { mix: { type: "number" }, decay: { type: "number", description: "秒 0.3〜8" } } },
      },
    },
    glide: { type: "number", description: "ポルタメント 秒 (0=なし)" },
    mono: { type: "boolean", description: "true=単音(ベース/リード向け), false=和音可" },
    level: { type: "number", description: "出力 dB (-24〜0)" },
  },
};

/* ---------------------------------- system prompts ---------------------------------- */

export const SYSTEM_MUSICIAN = `あなたは世界トップクラスのセッションミュージシャン兼アレンジャー兼MIDIプログラマーです。プロのレコーディング現場で「あとは軽くエディットするだけで本番に使える」レベルのMIDIトラックを打ち込みます。

# 出力の絶対条件
- 完全にオリジナルの演奏を作ること。参照アーティストの「奏法・グルーヴ・音使いの傾向」を取り込むのは良いが、実在する楽曲のメロディ・フレーズをそのまま再現してはならない。
- 生成範囲の拍数を超えるノートを置かない。s + d が範囲の総拍数を超えない。
- ピッチは楽器の実用音域内に収める。
- notes を空で返さない。セクションの指示が「休符」でも、範囲全体が休みでない限り必ず演奏する箇所を作る。範囲全体が本当に休みなら performanceNotes にその旨を書き、notes は空でよい。
- performanceNotes には実際に出力した notes の内容だけを書く (書いていない演奏を「した」と書かない)。

# プロ品質の打ち込み基準
1. **ベロシティは生きた演奏**: 機械的な一定値は禁止。アクセント/ゴーストノート/クレッシェンドを設計する。ドラムなら例えばゴーストスネア 20-45、通常 70-95、アクセント 100-120。
2. **マイクロタイミング**: グリッドべったりにしない。スタイルに応じてハネ(スウィング)、前ノリ/後ノリを 1/64拍程度の範囲で表現してよい (例: s=4.02, s=7.97)。ただしやりすぎない。ベース/ドラムなど「土台」はドラムのキックにロックさせる。
3. **フレーズ構造**: 2/4/8小節単位の呼吸。セクションの変わり目にはフィル/ピックアップ/クレッシェンドを置く。同じパターンの単純コピペを避け、2回目は微妙に変化させる。動機(モチーフ)を作り、反復と変形で曲を組み立てる。
4. **コード進行との整合**: 強拍(1拍目・3拍目)で長く伸ばす音はコードトーンかスケール内の音にする。非和声音は経過音・刺繍音・アポジャトゥーラとして短く、必ず解決させる。ベースはコードのルート/5th/経過音を軸に。スラッシュコード(C/E)ならベースは指定音を弾く。
5. **他トラックとの対話**: 「既存の他トラック」の実際のノートが与えられたら、それを楽譜として読み、音域・リズムの隙間を活かす(コールアンドレスポンス、キックとベースのロック、コード楽器とメロディの音域の住み分け、内声のぶつかり回避)。同じ拍に同じ音域で密集させない。
6. **休符は音楽**: 詰め込みすぎない。スタイルに応じた密度で。主旋律は歌えるフレーズ(息継ぎがある)。
7. **演奏可能性**: 管楽器・サックスは単音。ベースは基本単音。ギターは 6 声まで、片手で押さえられる形。ピアノは両手 10 音まで、片手は 10 度以内。
8. **長い音の表情 (v2)**: 弦・管・パッド・オルガン・シンセの長い音は v2 (終わりの強さ) を付けて、伸ばしながら膨らむ・しぼむを作れる。クレッシェンドの白玉、フレーズ末のディミヌエンド、スウェルに使う。減衰楽器(ピアノ・ギター・ドラム)には付けない。
9. **役割ごとの密度の目安 (1小節あたり)**: drums 8-20 / bass 4-10 / chords 3-12 / arpeggio 8-16 / melody・lead 2-8 / pad 1-3 / counter-melody 2-6。主役のメロディが 42 小節で 78 音、のような痩せた出力にしない。

# ドラム (GMドラムマップ, ch10)
36=Kick, 38=Snare, 37=SideStick, 42=HH Closed, 44=HH Pedal, 46=HH Open, 41/43=Floor Tom, 45/47=Low-Mid Tom, 48/50=High Tom, 49=Crash1, 57=Crash2, 51=Ride, 53=Ride Bell, 55=Splash, 39=Clap, 54=Tambourine, 56=Cowbell

# 楽器音域の目安 (MIDIノート)
bass: 28-55 / synth-bass: 24-60 / guitar: 40-88 / piano・epiano・organ: 21-108 / synth: 24-108 / synth-lead: 48-96 / synth-pad: 36-84 / strings: 36-96 / saxophone: 49-81 / trumpet: 54-86 / flute: 60-96`;

export const SYSTEM_ARRANGER = `あなたは世界トップクラスの音楽プロデューサー兼アレンジャーです。ユーザーの曲のイメージ(ジャンル、リファレンスアーティスト、雰囲気)から、プロがそのまま制作に入れる「曲の設計図」を作ります。

原則:
- リファレンスアーティストが挙げられたら、その音楽的特徴(テンポ感、キー傾向、コード語彙、リズムの質感、構成の癖)を具体的に解釈して反映する。ただし実在曲の進行やメロディの複製はしない。
- 日本のポップス/ロックのリファレンス(例: Mr.Children, スピッツ)なら、J-POP的なセクション構成 (イントロ/Aメロ/Bメロ/サビ) やノンダイアトニックの彩り (セカンダリードミナント、クリシェ) を検討する。
- コード進行は安直な4コードループを避け、セクションごとに表情を変える。ただしスタイルがループ主体(ファンク等)ならそれに従う。
- 全セクションの bars 合計は 16〜48小節程度。デモとして聴ける完結した構成にする。
- sections の description には各パートの動き(誰が休むか、どこで爆発するか)を書く。
- tempoChanges: リタルダンド・アッチェレランド・ルバートが音楽的に必要なときだけ入れる (無ければ空配列)。
- 楽器: 生楽器は drums/bass/piano/epiano/organ/guitar-*/strings/saxophone/trumpet/flute。シンセは synth (汎用・音色はあとで設計), synth-lead, synth-pad, synth-bass。エレクトロ系・80s・EDM・シティポップなどは synth 系を積極的に使う。stylePrompt に欲しい音色 (例: "太いモノシンセベース、レゾナンス強め") を書くと音色も自動設計される。`;

export const SYSTEM_MIX = `あなたは世界トップクラスのミキシングエンジニアです。与えられた曲 (ジャンル・コンセプト・各トラックの楽器/役割/音域/密度) から、プロのミックスの初期設定を決めます。

原則:
- 主役 (メロディ/ボーカル代わりのリード) が最前列、リズムの土台 (キック/スネア/ベース) はセンターで安定、コード楽器と装飾は左右に広げて奥へ。
- 同じ音域の楽器は左右に振り分けて分離する (例: ピアノ左 0.3 / ギター右 0.35)。ペアになる楽器は対称に置く。
- ローカット: ベースとキックだけが 100Hz 以下を持つ。他は 80〜200Hz でカットして濁りを取る。パッド/ストリングス/リバーブの多い楽器は高めにカット。
- EQ は控えめ (±3dB 程度)。ぶつかる帯域を譲り合う。
- コンプ: ベース/ボーカル的リード/ドラムはしっかり、パッド/ストリングスは軽く。
- リバーブ: 生楽器・オーケストラはホール多め、ロック/ファンクはルーム中心、EDM はシンセにホール、ドラムはドライ寄り。ベースとキックはほぼドライ。
- 音量: 全体で -6〜-10dB 帯に収め、ピークで歪まない。主役 -5dB 前後、土台 -6〜-8、脇役 -10〜-16。
- targetLufs はジャンルに合わせる (ストリーミング -14、映画音楽/ジャズ -16〜-18、ロック/EDM -9〜-11)。`;

export const SYSTEM_SOUND_DESIGNER = `あなたは世界トップクラスのシンセサイザー音色デザイナーです。言葉で指定された音のイメージ (例: "80年代のブラス", "太いアシッドベース", "ガラスのようなパッド") を、減算方式シンセのパラメータに落とし込みます。

シンセの構成: 最大 3 オシレーター (波形・オクターブ・半音・デチューン・ユニゾン) + サブ + ノイズ → フィルター (LP/HP/BP, カットオフ, Q, エンベロープ量, キートラック) → アンプ。LFO は filter/pitch/amp/pan のどれか 1 つ。エフェクトは drive → chorus → delay → reverb。
波形: saw=ノコギリ(明るい・厚い), square=矩形(木管的・中空), triangle=柔らかい, sine=純音, pulse25/pulse12=細いパルス(鼻にかかった音), fm2/fm3/fm5=FM(倍音比 2/3/5、ベル・エレピ・金属的), am=リングモジュレーション風。

設計の原則:
- ジャンルの定番音色を正確に (Juno 系パッド=saw+chorus+ゆるいフィルター / Moog 系ベース=saw+square, 低いカットオフ, 速い filterEnv, mono+glide / Supersaw=unison 7 spread 30-50 / 80s ブラス=2 saw detune, filterEnv でアタック / プラック=短い decay, envAmount 3-4, sustain 0 / ベル=fm3 or fm5, 長い release)。
- 音域と役割に合わせる: ベースはサブ多め・ステレオ効果なし・mono。パッドはアタック 0.3〜1.5 秒・リリース長め・chorus/reverb。リードは mono+少しの glide+delay。
- レベルは他の楽器に埋もれない・歪まない範囲 (-6〜-14dB)。
- description に狙いを 1 文で書く。`;

export const SYSTEM_CHAT = `あなたは BLUE GARAGE STUDIO (AIネイティブのMIDIシーケンサー) の中にいる、腕利きの音楽プロデューサー兼エンジニアです。ユーザーは画面右のチャットであなたに話しかけ、あなたは道具(tool)を使って曲を作り、直し、ミックスし、音色を作り、書き出します。

# ふるまい
- ユーザーが曲のイメージを言ったら、確認を挟まずに create_blueprint → generate_tracks(全トラック) → auto_mix まで一気にやる。細かい指定が無い部分はプロとして最良の判断で埋める。
- 「もっと激しく」「ベースを変えて」のような直しは、該当トラックだけ generate_tracks (direction に具体的な指示を書く) で作り直す。全体を作り直さない。
- 音量・パン・楽器の変更、テンポ・キーの変更、ミュート、書き出しなどは update_* / transport / export_file を使う。ノートの移調・音量スケール・人間味・クオンタイズ・削除は edit_notes。
- 曲はブラウザのライブラリに自動保存される。「前の曲を開いて」「この曲を別名で保存」「曲の一覧」は project (list / open / save_as / rename / delete)。
- 音の質感 (響き・ローカット・EQ・コンプ) は set_mix / auto_mix / set_master。シンセの音色は design_sound (言葉から設計) / set_synth (数値を直接)。テンポの揺れ (リタルダンド等) は set_tempo_map。外部の音源やDAWを使いたい人には midi_out。
- 道具の結果を受け取ったら、何をしたか・どうなったかを短く報告する。長い説明や箇条書きの乱発はしない。1〜4文が基本。
- 分からないことがあっても、まず妥当な仮定で進めてから「〜として作りました。違えば言ってください」と添える。質問で止まらない。
- 曲の状態は system の「現在の曲」に毎回入っている。これは常に最新で、あなたが直前に道具で変えた結果もすでに反映されている(=変更後の値)。トラック名はそこにある名前を正確に使う。
- 道具の結果に「変更済み」「生成しました」とあれば、その要望は完了している。同じ変更を繰り返したり、値を重ねて足したりしない。要望が全部済んだら道具を使わずに短く報告して終える。
- 生成結果には自動の検査 (音域外・コードとのぶつかり・空・密度) と手直しが入る。検査で見つかった問題は道具の結果に書かれる。
- 使える楽器名: ${INSTRUMENTS.join(", ")}
- ユーザーが書いた言語で話す (日本語なら日本語、英語なら英語)。むずかしい専門用語は避け、中学生でも分かる言葉で話す。ただし音楽用語(コード、テンポ、ベロシティ等)は使ってよい。
- 生成には時間がかかる(1トラック1〜3分)。generate_tracks はまとめて1回で呼ぶ(trackNames を省略すれば全部)。`;

/* ---------------------------------- chat tools ---------------------------------- */

export const CHAT_TOOLS = [
  { name: "create_blueprint", description: "曲のイメージから設計図(タイトル・テンポ・キー・セクション構成・コード進行・トラック編成・テンポ変化)を作り、プロジェクトに適用する。既存のノートは消えて新しい編成になる。", input_schema: { type: "object", properties: { prompt: { type: "string", description: "曲のイメージ。ジャンル、参考アーティスト、雰囲気、編成の希望などを具体的に" }, tempo: { type: "number" }, key: { type: "string" } }, required: ["prompt"] } },
  { name: "generate_tracks", description: "トラックのMIDIノートをAIで生成する (自動検査と手直し付き)。trackNames を省略すると全トラックをリズム隊→ハーモニー→メロディの順に生成。既存ノートは範囲内が置き換わる。", input_schema: { type: "object", properties: { trackNames: { type: "array", items: { type: "string" }, description: "対象トラック名(省略=全部)" }, startBar: { type: "integer", description: "開始小節(1始まり、省略=1)" }, bars: { type: "integer", description: "小節数(省略=曲全体)" }, mode: { type: "string", enum: ["new", "variation", "continue"] }, direction: { type: "string", description: "追加の演奏指示(直しの要望はここに具体的に)" } } } },
  { name: "update_song", description: "曲全体の設定を変える", input_schema: { type: "object", properties: { title: { type: "string" }, tempo: { type: "number" }, key: { type: "string" }, timeSig: { type: "integer" } } } },
  { name: "update_track", description: "トラックの設定(名前・楽器・音量・パン・ミュート・ソロ・スタイル指示)を変える", input_schema: { type: "object", properties: { trackName: { type: "string" }, newName: { type: "string" }, instrument: { type: "string" }, volume: { type: "number", description: "dB (-40〜6)" }, pan: { type: "number", description: "-1(左)〜1(右)" }, mute: { type: "boolean" }, solo: { type: "boolean" }, stylePrompt: { type: "string" }, role: { type: "string" } }, required: ["trackName"] } },
  { name: "add_track", description: "トラックを追加する(ノートは空。必要なら続けて generate_tracks)", input_schema: { type: "object", properties: { name: { type: "string" }, instrument: { type: "string" }, role: { type: "string" }, stylePrompt: { type: "string" } }, required: ["name", "instrument"] } },
  { name: "remove_track", description: "トラックを削除する", input_schema: { type: "object", properties: { trackName: { type: "string" } }, required: ["trackName"] } },
  { name: "edit_notes", description: "既存ノートを直接いじる(AI生成なし・即時)。transpose=半音移調(amount)、velocity_scale=ベロシティ倍率(amount 例0.8)、velocity_add=ベロシティ加算(amount)、humanize=タイミングと強さを少し揺らす、quantize=グリッドに揃える(amount=拍単位 例0.25)、clear=削除、shift=拍単位で前後にずらす(amount)、legato=音を次の音まで伸ばす、staccato=長さを半分に、swell=範囲の長い音に v2 (終わりの強さ, amount=倍率 例1.4)。startBar/bars で範囲指定可(省略=全体)", input_schema: { type: "object", properties: { trackName: { type: "string" }, action: { type: "string", enum: ["transpose", "velocity_scale", "velocity_add", "humanize", "quantize", "clear", "shift", "legato", "staccato", "swell"] }, amount: { type: "number" }, startBar: { type: "integer" }, bars: { type: "integer" } }, required: ["trackName", "action"] } },
  { name: "transport", description: "再生・停止・頭出し", input_schema: { type: "object", properties: { action: { type: "string", enum: ["play", "stop", "seek"] }, bar: { type: "integer", description: "seek/play の開始小節(1始まり)" }, loop: { type: "boolean" } }, required: ["action"] } },
  { name: "export_file", description: "書き出し。midi=Standard MIDI File (テンポ変化・表情CC付き)、wav=オーディオ (ミックス・ラウドネス調整済み、数分かかる)、json=プロジェクトファイル", input_schema: { type: "object", properties: { format: { type: "string", enum: ["midi", "wav", "json"] } }, required: ["format"] } },
  { name: "project", description: "曲の管理。曲はブラウザのライブラリに自動保存される。list=保存された曲の一覧、open=曲名で開く(name)、save_as=今の曲を別名で複製して保存(name)、rename=曲名を変える(name)、delete=曲を消す(name)、new=新しい空の曲(今の曲はライブラリに残る)、save=今すぐ保存、load_preset=同梱デモ曲を開く(name: neon-overdrive / dawn-voyage)、save_preset=ローカルサーバーにプリセット保存(name)、list_presets=デモ曲一覧", input_schema: { type: "object", properties: { action: { type: "string", enum: ["list", "open", "save_as", "rename", "delete", "new", "save", "load_preset", "save_preset", "list_presets"] }, name: { type: "string" } }, required: ["action"] } },
  { name: "get_song_details", description: "曲の詳しい情報(セクションの説明全文、コード進行全部、各トラックのスタイル指示全文・演奏メモ・ミックス設定・シンセ音色)を読む", input_schema: { type: "object", properties: { trackName: { type: "string", description: "指定するとそのトラックのノート一覧の要約も返す" } } } },
  { name: "auto_mix", description: "AI ミキシングエンジニアが全トラックの音量・パン・ローカット・EQ・コンプ・リバーブ送りとマスター設定を決めて適用する。曲が出来たら必ず 1 回やる。", input_schema: { type: "object", properties: { direction: { type: "string", description: "希望 (例: ドラムをもっと前に、全体をドライに、80s っぽくリバーブ深め)" } } } },
  { name: "set_mix", description: "1 トラックのミックス設定を数値で変える (省略した項目はそのまま)", input_schema: { type: "object", properties: { trackName: { type: "string" }, hpf: { type: "number", description: "ローカット Hz 20〜400" }, eqLow: { type: "number", description: "dB" }, eqMid: { type: "number", description: "dB" }, eqHigh: { type: "number", description: "dB" }, comp: { type: "number", description: "0〜1" }, hall: { type: "number", description: "ホール送り 0〜1" }, room: { type: "number", description: "ルーム送り 0〜1" } }, required: ["trackName"] } },
  { name: "set_master", description: "マスター (全体) の設定: バスコンプ量、ホール/ルームの残響時間、書き出しの目標ラウドネス、ステレオ幅、マスター音量", input_schema: { type: "object", properties: { glue: { type: "number", description: "0〜1" }, hallDecay: { type: "number", description: "秒" }, roomDecay: { type: "number", description: "秒" }, targetLufs: { type: "number", description: "LUFS (-9〜-20)" }, width: { type: "number", description: "0.5〜1.5" }, volume: { type: "number", description: "マスター dB" } } } },
  { name: "design_sound", description: "シンセ系トラック (synth / synth-lead / synth-pad / synth-bass) の音色を言葉から設計して適用する。楽器がシンセ系でないトラックに使うと楽器を synth に変える。", input_schema: { type: "object", properties: { trackName: { type: "string" }, description: { type: "string", description: "欲しい音 (例: 80年代のぶ厚いブラス、ガラスのような透明なパッド、ドラムンベースの Reese ベース)" } }, required: ["trackName", "description"] } },
  { name: "set_synth", description: "シンセ音色のパラメータを直接変える (部分指定可。例: {filter:{cutoff:800}, fx:{delay:{mix:0.3}}})。preset を指定するとプリセット名で読み込む。", input_schema: { type: "object", properties: { trackName: { type: "string" }, preset: { type: "string", description: "プリセット名 (list は get_song_details で分かる)" }, patch: { type: "object", description: "上書きするパラメータ (SYNTH_PATCH の部分オブジェクト)", additionalProperties: true } }, required: ["trackName"] } },
  { name: "set_tempo_map", description: "テンポの変化 (リタルダンド・アッチェレランド・途中のテンポチェンジ) を設定する。points を空にすると一定テンポに戻る。各点は「その拍でのテンポ」で、点と点の間は直線でつながる。", input_schema: { type: "object", properties: { points: { type: "array", items: { type: "object", properties: { bar: { type: "integer", description: "1始まり" }, beat: { type: "number", description: "0始まり" }, tempo: { type: "number" } }, required: ["bar", "beat", "tempo"] } } }, required: ["points"] } },
  { name: "midi_out", description: "トラックの音を外部 (DAW / ハードウェア音源 / VST を立ち上げた DAW) に MIDI で送る設定。port に 'list' を渡すと使えるポート一覧を返す。port を空にすると解除。", input_schema: { type: "object", properties: { trackName: { type: "string" }, port: { type: "string", description: "ポート名の一部 または 'list'" }, channel: { type: "integer", description: "1〜16" }, silent: { type: "boolean", description: "true=内蔵音源を鳴らさず MIDI だけ送る" } }, required: ["trackName"] } },
];

/* ---------------------------------- chord parsing (critic と共有) ---------------------------------- */

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function parseChord(sym) {
  if (!sym) return null;
  let s = String(sym).trim().replace(/\s+/g, "");
  if (!s || /^(N\.?C\.?|rest)$/i.test(s)) return null;
  let bass = null;
  const slash = s.indexOf("/");
  if (slash > 0) { bass = noteToPc(s.slice(slash + 1)); s = s.slice(0, slash); }
  const m = s.match(/^([A-G])([#b♯♭]*)(.*)$/);
  if (!m) return null;
  let root = PC[m[1]];
  for (const ch of m[2]) root += /[#♯]/.test(ch) ? 1 : -1;
  root = ((root % 12) + 12) % 12;
  const q = m[3].toLowerCase().replace(/[()]/g, "");
  const iv = new Set([0]);
  const minor = /^(m(?!aj)|min|-)/.test(q) && !/^maj/.test(q);
  const dim = /dim|°|o(?!n)/.test(q) || /m7b5|ø/.test(q);
  const aug = /aug|\+(?!\d)/.test(q) || /#5/.test(q);
  const sus2 = /sus2/.test(q), sus4 = /sus4|sus(?!2)/.test(q);
  // 3度
  if (sus4) iv.add(5); else if (sus2) iv.add(2); else iv.add(minor || dim ? 3 : 4);
  // 5度
  if (dim && !/m7b5|ø/.test(q)) iv.add(6); else if (/m7b5|ø|b5/.test(q)) iv.add(6); else if (aug) iv.add(8); else iv.add(7);
  // 7度
  if (/maj7|ma7|M7|△7|△/.test(m[3])) iv.add(11);
  else if (/dim7|°7|o7/.test(q)) iv.add(9);
  else if (/7|9|11|13/.test(q)) iv.add(10);
  if (/6/.test(q) && !/m7b5/.test(q)) iv.add(9);
  if (/9/.test(q)) iv.add(/b9/.test(q) ? 1 : /#9/.test(q) ? 3 : 2);
  if (/add9|add2/.test(q)) iv.add(2);
  if (/11/.test(q)) iv.add(/#11/.test(q) ? 6 : 5);
  if (/13/.test(q)) iv.add(/b13/.test(q) ? 8 : 9);
  const tones = new Set([...iv].map((i) => (root + i) % 12));
  if (bass != null) tones.add(bass);
  return { root, bass, tones, minor: minor || dim, sym };
}
export function noteToPc(name) {
  const m = String(name).match(/^([A-G])([#b♯♭]*)/i);
  if (!m) return null;
  let pc = PC[m[1].toUpperCase()];
  for (const ch of m[2]) pc += /[#♯]/.test(ch) ? 1 : -1;
  return ((pc % 12) + 12) % 12;
}
export function keyScale(keyStr) {
  const m = String(keyStr ?? "").match(/^([A-G][#b♯♭]?)\s*(m|min|minor|maj|major)?/i);
  if (!m) return null;
  const root = noteToPc(m[1]);
  const minor = /^m/i.test(m[2] ?? "") && !/^maj/i.test(m[2] ?? "");
  const steps = minor ? [0, 2, 3, 5, 7, 8, 10, 11] : [0, 2, 4, 5, 7, 9, 11]; // 短調は和声短音階の導音も許容
  return new Set(steps.map((s) => (root + s) % 12));
}

/* ---------------------------------- 他トラックの実ノートを圧縮して渡す ---------------------------------- */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const noteName = (p) => NOTE_NAMES[((p % 12) + 12) % 12] + (Math.floor(p / 12) - 1);
const DRUM_ABBR = { 35: "K", 36: "K", 37: "SS", 38: "S", 39: "CP", 40: "S", 41: "FT", 42: "HH", 43: "FT", 44: "HP", 45: "LT", 46: "HO", 47: "MT", 48: "HT", 49: "CR", 50: "HT", 51: "RD", 53: "RB", 54: "TB", 55: "SP", 56: "CB", 57: "CR2", 59: "RD" };

// 1 トラックのノートを「小節ごとの譜面テキスト」に。budget (文字数) を超えたら
// セクション頭の小節だけ詳しく書き、残りは密度だけにする。
export function trackScoreText(track, song, range, budget = 7000) {
  const ts = song.timeSig;
  const startBeat = range.startBar * ts, endBeat = (range.startBar + range.bars) * ts;
  const notes = (track.notes ?? []).filter((n) => n.s >= startBeat - 1e-6 && n.s < endBeat - 1e-6);
  if (!notes.length) return "(この範囲は空)";
  const isDrum = track.instrument === "drums";
  const fmt = (n) => {
    const name = isDrum ? (DRUM_ABBR[n.p] ?? `d${n.p}`) : noteName(n.p);
    const s = +(n.s - startBeat - Math.floor((n.s - startBeat) / ts) * ts).toFixed(2);
    const dur = !isDrum && n.d >= 0.9 ? `(${+n.d.toFixed(1)})` : "";
    const acc = n.v >= 105 ? "!" : n.v <= 40 ? "." : "";
    return `${name}@${s}${dur}${acc}`;
  };
  const byBar = new Map();
  for (const n of notes) { const b = Math.floor((n.s - startBeat) / ts); (byBar.get(b) ?? byBar.set(b, []).get(b)).push(n); }
  const lines = [];
  for (const [b, arr] of [...byBar.entries()].sort((a, c) => a[0] - c[0])) lines.push(`b${b}: ${arr.sort((x, y) => x.s - y.s || x.p - y.p).map(fmt).join(" ")}`);
  let text = lines.join("\n");
  if (text.length <= budget) return text;
  // 予算超過: セクション頭 2 小節 + 各小節の要約
  const secStarts = new Set(); let bar = 0;
  for (const s of song.sections ?? []) { secStarts.add(bar - range.startBar); secStarts.add(bar - range.startBar + 1); bar += s.bars; }
  const out = [];
  for (const [b, arr] of [...byBar.entries()].sort((a, c) => a[0] - c[0])) {
    if (secStarts.has(b)) out.push(`b${b}: ${arr.sort((x, y) => x.s - y.s).map(fmt).join(" ")}`);
    else { const ps = arr.map((n) => n.p); out.push(`b${b}: ${arr.length}音 ${isDrum ? "" : noteName(Math.min(...ps)) + "〜" + noteName(Math.max(...ps))} 拍:${[...new Set(arr.map((n) => +((n.s - startBeat) % ts).toFixed(1)))].slice(0, 8).join(",")}`); }
  }
  text = out.join("\n");
  return text.length <= budget ? text : text.slice(0, budget) + "\n…(省略)";
}

/* ---------------------------------- request builders ---------------------------------- */

export function buildBlueprintRequest({ prompt, tempo, key, existing }) {
  const constraints = [];
  if (tempo) constraints.push(`テンポは ${tempo} BPM 付近を希望`);
  if (key) constraints.push(`キーは ${key} を希望`);
  const userText = `次のイメージで曲の設計図を作ってください。

## 曲のイメージ
${prompt}
${constraints.length ? `\n## 制約\n- ${constraints.join("\n- ")}` : ""}
${existing ? `\n## 参考: 現在のプロジェクト状態\n${existing}` : ""}`;
  return { system: SYSTEM_ARRANGER, userText, schema: BLUEPRINT_SCHEMA, label: "blueprint" };
}

function songSectionsInRange(song, range) {
  const out = [];
  let bar = 0;
  for (const s of song.sections ?? []) {
    const start = bar, end = bar + s.bars;
    bar = end;
    const rs = Math.max(start, range.startBar);
    const re = Math.min(end, range.startBar + range.bars);
    if (rs < re) out.push({ name: s.name, description: s.description, rs: rs - range.startBar, re: re - range.startBar - 1 });
  }
  return out;
}

// otherTracks: [{name, instrument, role, summary, score(小節ごとの譜面テキスト), performanceNotes}]
export function buildTrackRequest({ song, track, range, otherTracks, mode, existingNotes, extraDirection, issues, previousNotes, previousPerformanceNotes }) {
  const totalBeats = range.bars * song.timeSig;
  const chordText = (song.chordProgression ?? [])
    .filter((c) => c.bar >= range.startBar && c.bar < range.startBar + range.bars)
    .map((c) => `bar ${c.bar - range.startBar} beat ${c.beat}: ${c.chord}`)
    .join(" | ") || "(コード指定なし: キーに従って自由に)";
  const sectionText = (song.sections ?? []).length
    ? songSectionsInRange(song, range).map((s) => `- bars ${s.rs}〜${s.re}: ${s.name}${s.description ? ` — ${s.description}` : ""}`).join("\n")
    : "(セクション情報なし)";
  const othersText = (otherTracks ?? []).length
    ? otherTracks.map((t) => `### ${t.name} (${t.instrument}${t.role ? `, ${t.role}` : ""}) — ${t.summary}${t.performanceNotes ? `\n演奏意図: ${t.performanceNotes}` : ""}${t.score ? `\n譜面 (小節番号は生成範囲基準, 音名@拍(長さ) !=強 .=弱):\n${t.score}` : ""}`).join("\n\n")
    : "(他のトラックはまだ空)";
  const tempoText = (song.tempoMap ?? []).length ? `\n- テンポ変化: ${song.tempoMap.map((p) => `bar ${Math.floor(p.beat / song.timeSig)} beat ${+(p.beat % song.timeSig).toFixed(2)} → ${p.tempo}`).join(", ")}` : "";

  let modeText;
  if (mode === "variation") modeText = `## モード: バリエーション生成\n既存の演奏を土台に、同じキャラクターを保ったまま別テイクを作ってください。既存の演奏:\n${JSON.stringify(existingNotes ?? []).slice(0, 60000)}`;
  else if (mode === "continue") modeText = `## モード: 続きを生成\n直前の範囲の演奏に自然につながるように作ってください (同じモチーフ・同じグルーヴを引き継ぎ、フレーズが途中で切れないように)。直前の演奏 (s は直前範囲の先頭基準。この範囲の s=0 の直前まで):\n${JSON.stringify(existingNotes ?? []).slice(0, 40000)}${previousPerformanceNotes ? `\n直前範囲の演奏意図: ${previousPerformanceNotes}` : ""}`;
  else if (mode === "revise") modeText = `## モード: 手直し (エディター役)\nあなたが打ち込んだ下の演奏を、検査で見つかった問題を直して出し直してください。良い部分はそのまま残し、問題の箇所だけを最小限に直す。全体を作り直さない。notes は範囲全体の完全版を返す。\n\n### 検査で見つかった問題\n${(issues ?? []).map((i) => `- ${i}`).join("\n")}\n\n### 打ち込んだ演奏\n${JSON.stringify(previousNotes ?? []).slice(0, 80000)}`;
  else modeText = "## モード: 新規生成";

  const userText = `次のトラックのMIDIを打ち込んでください。

## 曲情報
- タイトル: ${song.title ?? "(無題)"}
- テンポ: ${song.tempo} BPM / 拍子: ${song.timeSig}/4 / キー: ${song.key}${tempoText}
- 曲のコンセプト: ${song.concept ?? "(指定なし)"}

## 生成範囲
- 曲の bar ${range.startBar} から ${range.bars} 小節分 (総拍数 ${totalBeats} 拍)
- ノートの s は 0 〜 ${totalBeats} の範囲 (生成範囲の先頭 = 0)

## この範囲のセクション構成 (小節番号は生成範囲基準)
${sectionText}

## コード進行 (小節番号は生成範囲基準)
${chordText}

## このトラック
- 名前: ${track.name} / 楽器: ${track.instrument} / 役割: ${track.role ?? track.name}
- スタイル指示: ${track.stylePrompt || "(指定なし: 曲に合う演奏を)"}
${extraDirection ? `- 追加ディレクション: ${extraDirection}` : ""}

## 既存の他トラック (実際の譜面。これを読んで音域とリズムの住み分け・対話を作る)
${othersText}

${modeText}

スタイル指示にアーティスト名があれば、その演奏者の署名的な奏法(グルーヴ、手癖、音選び、ダイナミクス)を具体的に思い浮かべてから、完全オリジナルの演奏として打ち込むこと。`;

  return { system: SYSTEM_MUSICIAN, userText, schema: NOTES_SCHEMA, label: mode === "revise" ? "revise" : "track" };
}

export function buildMixRequest({ song, tracks, direction }) {
  const userText = `次の曲のミックス初期設定を決めてください。

## 曲
- タイトル: ${song.title} / ${song.tempo} BPM / ${song.key}
- コンセプト: ${song.concept ?? "(なし)"}
- セクション: ${(song.sections ?? []).map((s) => `${s.name}(${s.bars})`).join(" → ")}

## トラック
${tracks.map((t, i) => `${i + 1}. name="${t.name}" instrument=${t.instrument} role=${t.role ?? "-"} | ${t.summary}${t.stylePrompt ? ` | スタイル: ${t.stylePrompt.slice(0, 100)}` : ""}${t.patchName ? ` | 音色: ${t.patchName}` : ""}`).join("\n")}
${direction ? `\n## ユーザーの希望\n${direction}` : ""}

全トラックについて設定を返すこと (name は上の name をそのまま)。`;
  return { system: SYSTEM_MIX, userText, schema: MIX_SCHEMA, label: "mix" };
}

export function buildSynthRequest({ description, track, song, current }) {
  const userText = `次の音色を設計してください。

## 欲しい音
${description}

## 使われ方
- トラック: ${track.name} / 楽器種別: ${track.instrument} / 役割: ${track.role ?? "-"}
- 音域 (MIDI): ${track.range ?? "不明"}
- 曲: ${song.title ?? ""} / ${song.tempo} BPM / ${song.key} / ${song.concept ?? ""}
${current ? `\n## 今の音色 (これを土台に変えてよい)\n${JSON.stringify(current)}` : ""}`;
  return { system: SYSTEM_SOUND_DESIGNER, userText, schema: SYNTH_PATCH_SCHEMA, label: "synth" };
}

/* ================================ PIANO (VESPER が弾く独奏ピアノ) ================================ */
// 1 トラックのピアノ独奏。音符ごとに 手 (h: L/R) と 指 (f: 1=親指〜5=小指)、ペダル区間 (pedal) を一緒に作らせる。

export const PIANO_NOTES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["performanceNotes", "notes", "pedal"],
  properties: {
    performanceNotes: { type: "string", description: "演奏意図 (2-4文): フレージング、強弱の設計、運指の考え方、ペダルの使い方" },
    notes: {
      type: "array",
      description: "両手の音符 (1 つの配列に右手も左手も入れる)",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["p", "s", "d", "v", "h", "f"],
        properties: {
          p: { type: "integer", description: "MIDI ピッチ 21-108" },
          s: { type: "number", description: "開始位置: 生成範囲の先頭からの拍 (0 始まり, 小数可)" },
          d: { type: "number", description: "長さ (拍)" },
          v: { type: "integer", description: "強さ 1-127" },
          h: { type: "string", enum: ["L", "R"], description: "L=左手 R=右手" },
          f: { type: "integer", description: "指 1=親指 2=人差し指 3=中指 4=薬指 5=小指" },
        },
      },
    },
    pedal: {
      type: "array",
      description: "サスティンペダルを踏んでいる区間 (踏む拍 s と長さ d)。踏み替えは区間を分ける。使わないなら空配列",
      items: { type: "object", additionalProperties: false, required: ["s", "d"], properties: { s: { type: "number" }, d: { type: "number" } } },
    },
  },
};

export const SYSTEM_PIANIST = `あなたは世界トップクラスのピアニスト兼作曲家です。ピアノ独奏曲を「実際に両手で弾ける形」で打ち込みます。音符ごとに手 (L/R) と指 (1〜5) を決め、サスティンペダルの踏み替えも書きます。出力はそのまま演奏ロボットが弾くので、弾けない運指は許されません。

# 出力の絶対条件
- 完全にオリジナル。実在曲の複製をしない。
- 生成範囲の拍数を超えない (s + d ≤ 総拍数)。ピッチは 21〜108。
- notes を空で返さない。
- performanceNotes には実際に出力した内容だけを書く。

# 運指の物理条件 (機械で検査される)
1. 同時に押す音は片手 5 音まで。同じ手の同じ指を同時に 2 つの鍵に使わない。
2. 片手の同時の広がりは 10 度 (16 半音) 以内。9 度 (14 半音) を超えるのは強い和音の頂点だけ。
3. 右手の和音は 低い音ほど小さい指番号 (1→5)、左手の和音は 高い音ほど小さい指番号 (1 が一番上)。これを崩さない。
4. 左右の手は基本的に交差しない (左手の音は右手の音より低い)。意図的な交差は短い装飾に限る。
5. 速いパッセージは 1-2-3-1-2-3-4 のような親指くぐりで指を回す。同じ指の連打は遅い音価だけ。
6. 跳躍のあとは親指か小指で着地させると弾きやすい。
7. 音符が黒鍵なら親指を避ける (できるだけ 2〜4)。

# ピアニストとしての品質
- 左手: ベース + 和音 (アルベルティ、分散和音、10 度のストライド、オクターブ)。右手: 旋律 + 内声。役割は曲想で変えてよい。
- 強弱 (v): 旋律は伴奏より 15〜30 大きく。フレーズの山に向かってクレッシェンド、終わりで引く。左手の伴奏は 40〜75、旋律は 70〜110、クライマックス 110〜125。
- タイミング: 和音は完全に同時でなく、低い音から 0.01〜0.03 拍ずつずらす (ロール) と生っぽい。ルバートはやりすぎない。
- ペダル: 和声が変わるごとに踏み替える (区間を分ける)。速いパッセージや歯切れの良い場所は踏まない。
- 音域: 左手 21〜72、右手 48〜108 が目安。
- 密度の目安 (1 小節): 伴奏的な曲 6〜14 音、華やかな曲 14〜28 音。`;

const pianoScoreText = (notes, ts, startBeat, endBeat) => {
  const list = notes.filter((n) => n.s >= startBeat - 1e-6 && n.s < endBeat - 1e-6);
  if (!list.length) return "(空)";
  const byBar = new Map();
  for (const n of list) { const b = Math.floor((n.s - startBeat) / ts); (byBar.get(b) ?? byBar.set(b, []).get(b)).push(n); }
  return [...byBar.entries()].sort((a, c) => a[0] - c[0]).map(([b, arr]) => `b${b}: ` + arr.sort((x, y) => x.s - y.s || x.p - y.p).map((n) => `${noteName(n.p)}@${+(n.s - startBeat - b * ts).toFixed(2)}(${+n.d.toFixed(2)})${n.h ?? ""}${n.f ?? ""}`).join(" ")).join("\n");
};

export function buildPianoRequest({ song, range, mode, previousNotes, previousPedal, previousPerformanceNotes, extraDirection, issues, revisedNotes, stylePrompt }) {
  const ts = song.timeSig;
  const totalBeats = range.bars * ts;
  const chordText = (song.chordProgression ?? []).filter((c) => c.bar >= range.startBar && c.bar < range.startBar + range.bars).map((c) => `bar ${c.bar - range.startBar} beat ${c.beat}: ${c.chord}`).join(" | ") || "(コード指定なし: キーに従って自由に)";
  let bar = 0; const secs = [];
  for (const s of song.sections ?? []) { const st = bar, en = bar + s.bars; bar = en; const rs = Math.max(st, range.startBar), re = Math.min(en, range.startBar + range.bars); if (rs < re) secs.push(`- bars ${rs - range.startBar}〜${re - range.startBar - 1}: ${s.name}${s.description ? ` — ${s.description}` : ""}`); }
  const tempoText = (song.tempoMap ?? []).length ? `\n- テンポ変化: ${song.tempoMap.map((p) => `bar ${Math.floor(p.beat / ts)} beat ${+(p.beat % ts).toFixed(2)} → ${p.tempo}`).join(", ")}` : "";
  let modeText = "## モード: 新規生成";
  if (mode === "continue") modeText = `## モード: 続きを生成\n直前の範囲から自然につながるように (モチーフ・伴奏の型・手の位置を引き継ぐ)。直前の演奏 (s は直前範囲の先頭基準):\n${JSON.stringify(previousNotes ?? []).slice(0, 40000)}\n直前のペダル: ${JSON.stringify(previousPedal ?? [])}${previousPerformanceNotes ? `\n直前範囲の演奏意図: ${previousPerformanceNotes}` : ""}`;
  if (mode === "revise") modeText = `## モード: 手直し (校閲役)\n下の演奏の、検査で見つかった問題だけを最小限に直して、範囲全体の完全版を返す。音楽は変えない。\n\n### 問題\n${(issues ?? []).map((i) => `- ${i}`).join("\n")}\n\n### 演奏\n${JSON.stringify(revisedNotes ?? []).slice(0, 80000)}`;
  if (mode === "variation") modeText = `## モード: 作り直し\n同じ曲想で別のテイクを作る。元の演奏 (参考):\n${JSON.stringify(previousNotes ?? []).slice(0, 40000)}`;
  if (mode === "polish") modeText = `## モード: 磨き上げ (名ピアニストの推敲)\n下は自分が打ち込んだ演奏の完成版候補。これを「本番の録音」に出せる水準まで磨く。やること: (1) フレーズの山と谷 (強弱の設計) を明確に (2) 声部進行 (内声の動き、ベースラインの歌) を滑らかに (3) 単調な繰り返しは 2 回目を少し変える (4) ペダルの踏み替えを和声と合わせ、濁りを消す (5) 運指を弾きやすく見直す (6) 音楽的に弱い小節を書き直す。良い部分は残す。範囲全体の完全版を返す。\n\n### 演奏\n${JSON.stringify(revisedNotes ?? []).slice(0, 80000)}`;
  const userText = `次のピアノ独奏を打ち込んでください (両手・運指・ペダル付き)。

## 曲情報
- タイトル: ${song.title ?? "(無題)"}
- テンポ: ${song.tempo} BPM / 拍子: ${song.timeSig}/4 / キー: ${song.key}${tempoText}
- 曲のコンセプト: ${song.concept ?? "(指定なし)"}
- スタイル指示: ${stylePrompt || "(指定なし)"}
${extraDirection ? `- 追加ディレクション: ${extraDirection}` : ""}

## 生成範囲
- 曲の bar ${range.startBar} から ${range.bars} 小節分 (総拍数 ${totalBeats} 拍)。s は 0〜${totalBeats}

## この範囲のセクション (小節番号は生成範囲基準)
${secs.join("\n") || "(セクション情報なし)"}

## コード進行 (小節番号は生成範囲基準)
${chordText}

${modeText}`;
  return { system: SYSTEM_PIANIST, userText, schema: PIANO_NOTES_SCHEMA, label: mode === "revise" ? "revise" : mode === "polish" ? "polish" : "piano" };
}

export const SYSTEM_CHAT_PIANO = `あなたは VESPER PIANO (ロボットのピアニスト VESPER-01 が弾く、AI ネイティブのピアノ作曲ツール) の中にいる、腕利きの作曲家兼ピアニストです。ユーザーは右のチャットで話しかけ、あなたは道具 (tool) で曲を作り、直し、弾かせ、書き出します。

# ふるまい
- 曲のイメージを言われたら、確認を挟まずに compose_piano で設計図から全部作る。細かい指定が無い所はプロとして埋める。
- 「もっと静かに」「サビを作り直して」は regenerate (範囲と direction) で該当部分だけ。
- テンポ・キー・タイトルは update_song。移調や強弱の一括変更は edit_notes。テンポの揺れは set_tempo_map。再生は transport。書き出しは export_file。曲の管理は project。
- 「エンターテイナー弾いて」「エリーゼのために」など既存の曲は repertoire (同梱はパブリックドメインの名曲だけ。著作権のある曲 (ビートルズ、久石譲、坂本龍一、ゲーム音楽など) は作れないし弾けない。代わりに「その曲の雰囲気で新しい曲」なら compose_piano で作れる、と案内する)。
- 「ずっと弾いていて」「即興で」「ジャムして」は jam start (style を書く)。手札を新しく作るのは jam new_bank。
- 曲は 1 トラックのピアノ。音符ごとに手 (L/R) と指 (1〜5)、ペダル区間を持つ。生成後は自動検査 (片手 5 音・指の重複・広がり・交差・指順) と手直しが入る。
- 道具の結果を受け取ったら 1〜4 文で短く報告する。道具の結果に「変更済み」「生成しました」とあれば完了。同じ変更を繰り返さない。
- ユーザーの言語で話す。中学生でも分かる言葉で。音楽用語は使ってよい。
- 生成は 1 回 1〜3 分かかる。`;

export const PIANO_CHAT_TOOLS = [
  { name: "compose_piano", description: "曲のイメージから設計図 (タイトル・テンポ・キー・構成・コード進行・テンポ変化) を作り、ピアノ独奏 (両手・運指・ペダル) を全部生成する。既存の曲は新しい曲に置き換わる (前の曲はライブラリに残る)。", input_schema: { type: "object", properties: { prompt: { type: "string", description: "曲のイメージ (ジャンル、雰囲気、参考作曲家、テンポ感、長さの希望など)" }, tempo: { type: "number" }, key: { type: "string" } }, required: ["prompt"] } },
  { name: "regenerate", description: "指定した範囲のピアノ演奏だけを作り直す (direction に直しの要望)", input_schema: { type: "object", properties: { startBar: { type: "integer", description: "1 始まり (省略=1)" }, bars: { type: "integer", description: "小節数 (省略=最後まで)" }, direction: { type: "string" }, mode: { type: "string", enum: ["new", "variation"] } } } },
  { name: "update_song", description: "曲全体の設定を変える", input_schema: { type: "object", properties: { title: { type: "string" }, tempo: { type: "number" }, key: { type: "string" }, timeSig: { type: "integer" }, stylePrompt: { type: "string", description: "演奏スタイルの指示 (次の生成から使う)" } } } },
  { name: "edit_notes", description: "既存の音符を直接いじる (即時)。transpose=半音移調、velocity_scale=強さ倍率、velocity_add=強さ加算、humanize=揺らす、quantize=グリッド (amount=拍)、clear=削除、shift=ずらす、legato、staccato。hand='L'|'R' で片手だけ。startBar/bars で範囲。", input_schema: { type: "object", properties: { action: { type: "string", enum: ["transpose", "velocity_scale", "velocity_add", "humanize", "quantize", "clear", "shift", "legato", "staccato"] }, amount: { type: "number" }, hand: { type: "string", enum: ["L", "R"] }, startBar: { type: "integer" }, bars: { type: "integer" } }, required: ["action"] } },
  { name: "set_pedal", description: "ペダル区間を設定する。mode=replace で全部置き換え、add で追加、clear で消す。segments は {bar(1始まり), beat(0始まり), lengthBeats}", input_schema: { type: "object", properties: { mode: { type: "string", enum: ["replace", "add", "clear"] }, segments: { type: "array", items: { type: "object", properties: { bar: { type: "integer" }, beat: { type: "number" }, lengthBeats: { type: "number" } }, required: ["bar", "beat", "lengthBeats"] } } }, required: ["mode"] } },
  { name: "set_tempo_map", description: "テンポの変化 (リタルダンド等)。points を空で一定に戻す。", input_schema: { type: "object", properties: { points: { type: "array", items: { type: "object", properties: { bar: { type: "integer" }, beat: { type: "number" }, tempo: { type: "number" } }, required: ["bar", "beat", "tempo"] } } }, required: ["points"] } },
  { name: "transport", description: "再生・停止・頭出し (再生すると VESPER が弾く)", input_schema: { type: "object", properties: { action: { type: "string", enum: ["play", "stop", "seek"] }, bar: { type: "integer" }, loop: { type: "boolean" } }, required: ["action"] } },
  { name: "export_file", description: "書き出し。midi=SMF (運指はテキストイベント、ペダルは CC64)、wav=オーディオ、json=プロジェクト", input_schema: { type: "object", properties: { format: { type: "string", enum: ["midi", "wav", "json"] } }, required: ["format"] } },
  { name: "project", description: "曲の管理。list=一覧、open=曲名で開く(name)、save_as=別名で保存(name)、rename=改名(name)、delete=削除(name)、new=空の新曲", input_schema: { type: "object", properties: { action: { type: "string", enum: ["list", "open", "save_as", "rename", "delete", "new"] }, name: { type: "string" } }, required: ["action"] } },
  { name: "get_song_details", description: "曲の詳しい情報 (構成の説明、コード進行、演奏メモ、運指の検査結果、小節ごとの音数)", input_schema: { type: "object", properties: {} } },
  { name: "repertoire", description: "同梱の著作権切れ (パブリックドメイン) の名曲や、ユーザーが読み込んだ MIDI を VESPER に弾かせる。list=一覧、play=name で開いて再生 (自動で手と指を付ける)", input_schema: { type: "object", properties: { action: { type: "string", enum: ["list", "play"] }, name: { type: "string", description: "曲名の一部" } }, required: ["action"] } },
  { name: "jam", description: "即興モード。start=手札 (定番の進行・伴奏型・モチーフ) を混ぜながら VESPER が弾き続ける (今の曲は保存され、即興は別の曲になる)。new_bank=そのスタイルの手札を Claude が作り直す (1〜2 分)。stop=止める。", input_schema: { type: "object", properties: { action: { type: "string", enum: ["start", "stop", "new_bank"] }, style: { type: "string", description: "スタイル (例: ジャズバラード, ボサノバ, ポップス, 坂本龍一風ミニマル)" }, key: { type: "string" }, tempo: { type: "number" }, density: { type: "number", description: "音の多さ 0.5〜1" } }, required: ["action"] } },
];
