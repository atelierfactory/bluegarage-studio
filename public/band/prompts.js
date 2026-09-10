// ═══════════ VESPER BAND — 曲の書き方 (プロンプト / スキーマ) ═══════════
// VESPER-01 が 1 人で弾く「ワンマンバンド」:
//   右手 = シンセの鍵盤 (37 鍵 C3〜C6 = MIDI 48〜84) と、その奥の 8 つのつまみ
//   右足 = 足鍵盤のベース (13 本 C1〜C2 = MIDI 24〜36、1 度に 1 音)
//   左手 = スティック 1 本で ハイハット / スネア / タム 3 つ / クラッシュ (1 度に 1 打)
//   左足 = バスドラのペダル
// 出力はそのまま 3D のロボットが演奏するので、体で弾けない書き方は critic.js ではじく。
// このファイルは DOM も Web Audio も使わない (node からも読める)。

import { SYSTEM_ARRANGER, BLUEPRINT_SCHEMA, noteName } from "../js/prompts.js";
import { SYNTH2_PATCH_SCHEMA, KNOBS } from "../js/synth2.js";

export const SYNTH_LOW = 48, SYNTH_HIGH = 84;      // 右手の鍵盤
export const PEDAL_LOW = 24, PEDAL_HIGH = 36;      // 右足の足鍵盤
export const DRUM_KEYS = { hh: 42, sn: 38, t1: 48, t2: 45, t3: 41, cr: 49 };   // 左手 (GM ドラムマップ)
export const KICK = 36;                                                        // 左足
export const DRUM_LABEL = { hh: "ハイハット (閉)", sn: "スネア", t1: "ハイタム", t2: "ロータム", t3: "フロアタム", cr: "クラッシュ" };
export const KEY_OF_DRUM = Object.fromEntries(Object.entries(DRUM_KEYS).map(([k, p]) => [p, k]));

// 体の限界 (秒)。critic.js と scene.js が同じ値を使う
export const LIMITS = {
  stickSame: 0.11,     // 同じ太鼓の連打の最短間隔 (16 分 @136)
  stickNear: 0.14,     // ハイハット↔スネア (隣どうし) の持ち替え
  stickFar: 0.22,      // それ以外の持ち替え (タム・クラッシュへ移動)
  kick: 0.15,          // バスドラの最短間隔
  pedalGap: 0.20,      // 足鍵盤の次の音までの最短間隔
  pedalJumpGap: 0.35,  // 足鍵盤で 5 半音より大きく飛ぶときの最短間隔
  knobBefore: 0.45,    // つまみに手を伸ばす時間 (この間、右手に音があってはいけない)
  knobAfter: 0.25,     // つまみから鍵盤へ戻る時間
  knobMin: 0.30,       // 1 回の回す時間の最短 (秒)
};
export const NEAR_PAIRS = new Set(["hh|sn", "sn|hh", "sn|t1", "t1|sn", "t1|t2", "t2|t1", "hh|t3", "t3|hh"]);

export const BAND_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["performanceNotes", "synth", "pedal", "drums", "kick", "knobs"],
  properties: {
    performanceNotes: { type: "string", description: "この範囲の演奏設計 (2-4 文): 右手の役割 (旋律か和音か)、足鍵盤のライン、片手ドラムのパターン、つまみをいつ何のために回すか" },
    synth: {
      type: "array", description: "右手のシンセ (鍵盤 MIDI 48〜84)。指 f を音符ごとに決める",
      items: { type: "object", additionalProperties: false, required: ["p", "s", "d", "v", "f"], properties: {
        p: { type: "integer", description: "MIDI ピッチ 48〜84" }, s: { type: "number", description: "開始 (範囲先頭からの拍)" }, d: { type: "number", description: "長さ (拍)" }, v: { type: "integer", description: "強さ 1〜127" },
        f: { type: "integer", description: "指 1=親指 2=人差し指 3=中指 4=薬指 5=小指。同時の音は低い音ほど小さい番号" } } },
    },
    pedal: {
      type: "array", description: "右足の足鍵盤ベース (MIDI 24〜36、1 度に 1 音、重ねない)",
      items: { type: "object", additionalProperties: false, required: ["p", "s", "d", "v"], properties: { p: { type: "integer", description: "24〜36" }, s: { type: "number" }, d: { type: "number" }, v: { type: "integer" } } },
    },
    drums: {
      type: "array", description: "左手のスティック 1 本 (1 度に 1 打)。k = hh ハイハット(閉じたまま) / sn スネア / t1 ハイタム / t2 ロータム / t3 フロアタム / cr クラッシュ",
      items: { type: "object", additionalProperties: false, required: ["k", "s", "v"], properties: { k: { type: "string", enum: ["hh", "sn", "t1", "t2", "t3", "cr"] }, s: { type: "number" }, v: { type: "integer" } } },
    },
    kick: {
      type: "array", description: "左足のバスドラ",
      items: { type: "object", additionalProperties: false, required: ["s", "v"], properties: { s: { type: "number" }, v: { type: "integer" } } },
    },
    knobs: {
      type: "array", description: "右手でつまみを回す (その間、右手は鍵盤を弾けない)。param = 回すつまみ、s = 回し始める拍、d = 回すのにかける拍、to = 回した後の位置 0〜1",
      items: { type: "object", additionalProperties: false, required: ["param", "s", "d", "to"], properties: { param: { type: "string", enum: KNOBS.map((k) => k.id) }, s: { type: "number" }, d: { type: "number" }, to: { type: "number", description: "0〜1" } } },
    },
  },
};

export const KNOB_DOC = `つまみ (右手で回す。値は 0〜1):
- cutoff: フィルターの明るさ。0=こもる (低い音だけ)、1=全開。曲の中で一番ドラマを作れるつまみ (静かな所で下げ、サビに向けて上げる、ブレイクで一気に開く)
- resonance: フィルターのクセ。上げるほど「ミョーン」「ピーク」が強調される。0.6 以上はアシッド的
- envAmount: 音の立ち上がりでフィルターがどれだけ開くか。上げるほど「ブワッ」とアタックが付く
- lfoRate: 揺れの速さ。lfoDepth: 揺れの深さ (揺れの行き先は音色で決まっている: ワウ / ビブラート / トレモロ / パン)
- drive: 歪み。0=クリーン、1=激しい歪み
- delay: ディレイ (やまびこ) の量。reverb: 残響の量`;

export const SYSTEM_BAND = `あなたは世界トップクラスのシンセ奏者 兼 ドラマー 兼 作曲家です。ロボット VESPER-01 が 1 人で弾く「ワンマンバンド」の曲を、体で本当に弾ける形で打ち込みます。出力はそのまま 3D のロボットが演奏します。

# VESPER の体 (この通りにしか動けない。機械で検査される)
1. 右手: シンセの鍵盤 37 鍵 (MIDI 48〜84)。同時は 5 音まで、同時の広がりは 16 半音以内。指 f は同時の音で低い音ほど小さい番号 (1→5)。同じ指を同時に 2 つの鍵に使わない。速いパッセージは親指くぐりで指を回す。
2. 右手はつまみも回す。つまみを回す区間 (s の ${LIMITS.knobBefore} 秒前 〜 s+d の ${LIMITS.knobAfter} 秒後) に右手の音があってはいけない (足鍵盤とドラムは鳴らし続けてよい)。1 回の回す時間は ${LIMITS.knobMin} 秒以上。2 つのつまみを同時に回さない。伸びている和音を鳴らしたままつまみを回すのは不可 (和音を切ってから回す)。
3. 右足: 足鍵盤 13 本 (MIDI 24〜36、C1〜C2)。1 度に 1 音、重ねない。次の音まで ${LIMITS.pedalGap} 秒以上、5 半音より大きく飛ぶなら ${LIMITS.pedalJumpGap} 秒以上あける。
4. 左手: スティック 1 本。1 度に 1 打。同じ太鼓の連打は ${LIMITS.stickSame} 秒以上あける。ハイハット↔スネア (隣) の持ち替えは ${LIMITS.stickNear} 秒以上、タムやクラッシュへの移動は ${LIMITS.stickFar} 秒以上。ハイハットは閉じたまま (足で開け閉めできない)。
5. 左足: バスドラ。${LIMITS.kick} 秒以上あける。

# 片手ドラマーの叩き方 (これがこの楽器の味)
- ハイハットで刻みながらスネアを同時に鳴らすことはできない。8 分のハイハット刻みの中で 2 拍・4 拍だけスネアに持ち替える (ハイハットはその瞬間は休む)。
- フィルはタムを 2〜4 打、区切りの頭でクラッシュ 1 発。クラッシュの次の打まで ${LIMITS.stickFar} 秒。
- バスドラは左足で独立に入るので、キックのパターンは自由 (4 つ打ち、シンコペーション、ダブル)。

# 音楽の品質
- 右手は旋律 (単音) と和音 (3〜4 音のスタブ・パッド) を曲想で使い分ける。足鍵盤はベースライン (ルート中心、経過音、オクターブ跳び)。足鍵盤 + 右手の和音 + ドラム で 1 人でもバンドの厚みを出す。
- 強弱 (v): ハイハット 50〜85、スネア 90〜120、キック 95〜120、タム 90〜115、クラッシュ 100〜120。右手の旋律 80〜115、和音 60〜95。足鍵盤 90〜115。
- つまみは「音楽の場面を変える」ために使う: A メロは cutoff 低め、サビ前の 2 拍で cutoff を上げる、ブレイクで resonance を上げてから戻す、アウトロで reverb を増やす、など。1 つの範囲 (8 小節) に 1〜3 回。回す前後に右手を空ける段取りを組む (例: 4 拍目に和音を切って、次の小節頭までにつまみを回す)。

# 出力の絶対条件
- 完全にオリジナル。実在曲の複製をしない。
- 生成範囲の拍数を超えない。ピッチは右手 48〜84、足鍵盤 24〜36。
- synth / pedal / drums / kick のどれも空で返さない (範囲全体で休むパートがある場合を除く)。
- performanceNotes には実際に出力した内容だけを書く。

${KNOB_DOC}`;

const secPerBeat = (song) => 60 / (song.tempo || 120);

function scoreLines(part, range, ts) {
  const startBeat = 0, endBeat = range.bars * ts;
  const line = (arr, fmt) => {
    const list = (arr ?? []).filter((n) => n.s >= startBeat - 1e-6 && n.s < endBeat - 1e-6);
    if (!list.length) return "(無し)";
    const byBar = new Map();
    for (const n of list) { const b = Math.floor(n.s / ts); (byBar.get(b) ?? byBar.set(b, []).get(b)).push(n); }
    return [...byBar.entries()].sort((a, c) => a[0] - c[0]).map(([b, a]) => `b${b}: ` + a.sort((x, y) => x.s - y.s).map((n) => fmt(n, b)).join(" ")).join("\n");
  };
  const rel = (n, b) => +(n.s - b * ts).toFixed(2);
  return [
    `synth:\n${line(part.synth, (n, b) => `${noteName(n.p)}@${rel(n, b)}(${+n.d.toFixed(2)})f${n.f ?? ""}v${n.v}`)}`,
    `pedal:\n${line(part.pedal, (n, b) => `${noteName(n.p)}@${rel(n, b)}(${+n.d.toFixed(2)})`)}`,
    `drums:\n${line(part.drums, (n, b) => `${n.k}@${rel(n, b)}v${n.v}`)}`,
    `kick:\n${line(part.kick, (n, b) => `@${rel(n, b)}v${n.v}`)}`,
    `knobs:\n${line(part.knobs, (n, b) => `${n.param}@${rel(n, b)}(${+n.d.toFixed(2)})→${n.to}`)}`,
  ].join("\n");
}

/**
 * 1 区間 (8 小節など) の演奏を作る依頼。mode: new | continue | revise
 * previous: 直前区間の演奏 (s は直前区間の先頭基準)。revised: 手直し対象 (検査後の正規化済みデータ)。
 */
export function buildBandRequest({ song, range, mode, previous, previousPerformanceNotes, extraDirection, issues, revised, keysStyle, bassStyle, drumStyle, knobState }) {
  const ts = song.timeSig;
  const totalBeats = range.bars * ts;
  const spb = secPerBeat(song);
  const toBeats = (sec) => +(sec / spb).toFixed(3);
  const chordText = (song.chordProgression ?? []).filter((c) => c.bar >= range.startBar && c.bar < range.startBar + range.bars).map((c) => `bar ${c.bar - range.startBar} beat ${c.beat}: ${c.chord}`).join(" | ") || "(コード指定なし: キーに従って自由に)";
  let bar = 0; const secs = [];
  for (const s of song.sections ?? []) { const st = bar, en = bar + s.bars; bar = en; const rs = Math.max(st, range.startBar), re = Math.min(en, range.startBar + range.bars); if (rs < re) secs.push(`- bars ${rs - range.startBar}〜${re - range.startBar - 1}: ${s.name}${s.description ? ` — ${s.description}` : ""}`); }
  let modeText = "## モード: 新規生成";
  if (mode === "continue") modeText = `## モード: 続きを生成\n直前の範囲から自然につながるように (モチーフ・ドラムのパターン・足鍵盤の型・つまみの位置を引き継ぐ)。直前の演奏 (s は直前範囲の先頭基準):\n${previous ? scoreLines(previous, { bars: previous.bars ?? range.bars }, ts).slice(0, 30000) : "(無し)"}${previousPerformanceNotes ? `\n直前範囲の演奏意図: ${previousPerformanceNotes}` : ""}`;
  if (mode === "revise") modeText = `## モード: 手直し (校閲役)\n下の演奏の、検査で見つかった問題だけを最小限に直して、範囲全体の完全版 (synth/pedal/drums/kick/knobs 全部) を返す。音楽は変えない。\n\n### 問題\n${(issues ?? []).map((i) => `- ${i}`).join("\n")}\n\n### 演奏 (検査で機械的に直せた所は直してある)\n${JSON.stringify(revised).slice(0, 60000)}`;
  const knobText = knobState ? `- この範囲の始まりでのつまみの位置: ${Object.entries(knobState).map(([k, v]) => `${k}=${(+v).toFixed(2)}`).join(", ")}` : "";
  const userText = `${modeText}

## 曲
- タイトル: ${song.title ?? ""} / ${song.tempo} BPM / 拍子 ${ts}/4 / キー ${song.key ?? ""}
- コンセプト: ${song.concept ?? ""}
- 右手シンセの音色: ${keysStyle ?? "(既定)"}
- 足鍵盤の音色: ${bassStyle ?? "(既定)"}
- ドラムの狙い: ${drumStyle ?? "(既定)"}
${knobText}

## 範囲
- 曲の bar ${range.startBar + 1} から ${range.bars} 小節 (拍 0〜${totalBeats}。s は範囲の先頭基準)
${secs.length ? `- 構成:\n${secs.join("\n")}` : ""}
- コード: ${chordText}
- テンポ換算: 1 拍 = ${spb.toFixed(3)} 秒。体の限界を拍にすると: 同じ太鼓の連打 ${toBeats(LIMITS.stickSame)} 拍、隣の持ち替え ${toBeats(LIMITS.stickNear)} 拍、遠い持ち替え ${toBeats(LIMITS.stickFar)} 拍、バスドラ ${toBeats(LIMITS.kick)} 拍、足鍵盤 ${toBeats(LIMITS.pedalGap)} 拍 (大きく飛ぶなら ${toBeats(LIMITS.pedalJumpGap)} 拍)、つまみは前 ${toBeats(LIMITS.knobBefore)} 拍・後 ${toBeats(LIMITS.knobAfter)} 拍を右手で空ける、回す時間 ${toBeats(LIMITS.knobMin)} 拍以上
${extraDirection ? `\n## 追加の指示\n${extraDirection}` : ""}

この範囲の演奏を書いてください。`;
  return { system: SYSTEM_BAND, userText, schema: BAND_SCHEMA, label: mode === "revise" ? "revise" : "band" };
}

/* ─────────── 設計図 (既存の BLUEPRINT を、ワンマンバンド用の注意付きで) ─────────── */
export function buildBandBlueprintRequest({ theme, deep }) {
  const userText = `次のイメージで曲の設計図を作ってください。

## 曲のイメージ
${theme}

## この曲の楽器 (固定)
ロボット VESPER-01 の 1 人バンド: 右手のシンセ (鍵盤 37 鍵 C3〜C6)、右足の足鍵盤ベース (C1〜C2、単音)、左手のスティック 1 本のドラム (ハイハット・スネア・タム 3・クラッシュ)、左足のバスドラ。
trackPlan は必ずこの 3 つだけにする: { instrument: "synth", role: "keys" } (stylePrompt に右手の音色と役割: 例「太いスーパーソーのリード、サビは 3 和音のスタブ」)、{ instrument: "synth-bass", role: "pedal" } (stylePrompt に足鍵盤の音色: 例「丸いサブベース、少しドライブ」)、{ instrument: "drums", role: "drums" } (stylePrompt に片手ドラムの狙い: 例「タイトな 8 ビート、フィルはタム回し」)。
${deep ? "構成は 24〜40 小節で、各セクションの役割と山場、つまみ (フィルター等) で場面を変える所を具体的に書く。" : "構成は 16〜32 小節。"}テンポは 84〜150 の間。`;
  return { system: SYSTEM_ARRANGER, userText, schema: BLUEPRINT_SCHEMA, label: "blueprint" };
}

/* ─────────── 音色の設計 (右手のシンセ + 足鍵盤の 2 つを 1 回で) ─────────── */
export const BAND_SOUNDS_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["keys", "pedal", "knobPlan"],
  properties: {
    keys: SYNTH2_PATCH_SCHEMA,
    pedal: SYNTH2_PATCH_SCHEMA,
    knobPlan: { type: "string", description: "曲の中でつまみをどう使うかの方針 (2-3 文)。例: A メロは cutoff 0.3 でこもらせ、サビで 0.8 へ" },
  },
};
export const SYSTEM_BAND_SOUNDS = `あなたは世界トップクラスのシンセサイザー音色デザイナーです。ロボットが弾くワンマンバンド (右手のシンセ + 右足の足鍵盤ベース) のために、2 つの音色を減算方式シンセのパラメータで設計します。
- keys: 右手の鍵盤の音色。曲のジャンルに合う主役の音 (リード / スタブ / パッド / プラック)。8 つのつまみ (cutoff, resonance, envAmount, lfoRate, lfoDepth, drive, delay, reverb) を曲の途中で回して表情を変えるので、cutoff を動かしたときに変化がはっきり出る設計 (フィルターは ladder か svf-lp、cutoff は 0.3〜0.6 あたりに余地を残す) にする。lfo1 の行き先は、そのジャンルで回して気持ちいいもの (ワウなら cutoff、ビブラートなら pitch、トレモロなら amp)。
- pedal: 足鍵盤 (C1〜C2 = MIDI 24〜36) の音色。低い音がはっきり聞こえる (サブ + 倍音少し、mono、glide 少し)。
${KNOB_DOC}`;
export function buildBandSoundsRequest({ song, keysStyle, bassStyle }) {
  const userText = `曲: ${song.title ?? ""} / ${song.tempo} BPM / ${song.key ?? ""}\nコンセプト: ${song.concept ?? ""}\n\n## 右手の音色 (keys)\n${keysStyle ?? "ジャンルに合う主役の音"}\n\n## 足鍵盤の音色 (pedal)\n${bassStyle ?? "太くて丸いシンセベース"}\n\n2 つの音色と、つまみの使い方の方針を書いてください。`;
  return { system: SYSTEM_BAND_SOUNDS, userText, schema: BAND_SOUNDS_SCHEMA, label: "synth" };
}
