# BLUE GARAGE STUDIO

三軒茶屋の地下ライブハウス発、AI ネイティブな MIDI シーケンサー。
「ドラムはレッチリ、メロディはミスチル」のような自然言語から、プロがそのまま使えるマルチトラック MIDI と、ミックス済みのオーディオを作る。
**無料・オープン・自分の Anthropic API キーで動く** (サーバー不要の静的サイトとしても配れる)。

English: see [README.en.md](README.en.md).

## 使い方 (3 通り)

### A. 配布版 (静的サイト / 自分のキー)
1. `public/` をそのまま静的ホスティング (GitHub Pages / Netlify / 自分のサーバー) に置く。`public/samples/` (音源, 約 160MB) も一緒に置く。
2. ブラウザで開き、右上の **⚙** に自分の Anthropic API キーを入れる (キーはそのブラウザの localStorage にだけ保存され、`api.anthropic.com` にしか送られない)。
3. 右のチャットに話しかける。

### B. ローカル (サーバーのキー)
```bash
# .env に ANTHROPIC_API_KEY=sk-ant-... を置く
~/.local/node/bin/node server.js
# → http://localhost:5173
```
サーバーがキーを持っているとブラウザは `/api/proxy` 経由で呼ぶ。⚙ に自分のキーを入れるとそちらが優先。

### 公開サイトにキーを同梱する (訪問者がキーを入れなくても使える)

GitHub のリポジトリに secret `ANTHROPIC_API_KEY` を登録すると、Pages のデプロイ時に `.github/workflows/pages.yml` が `public/config.json` を書き出し、ブラウザはそのキーで `api.anthropic.com` を直接呼ぶ (優先順位: ⚙ の自分のキー > ローカルサーバー > 同梱キー)。キーは git には入らない (`public/config.json` は `.gitignore` 済み)。

**注意: 同梱したキーは、サイトを開いた人なら誰でも取り出せる** (静的サイトなので隠す場所が無い)。必ず次の 2 つをやること。
1. Anthropic Console で専用のワークスペースを作り、そこで発行したキーだけを使う (他の用途のキーを流用しない)
2. そのワークスペースに月の利用上限 (Spend limit) を設定する

登録・更新は `gh secret set ANTHROPIC_API_KEY --repo <owner>/<repo>`、その後 `gh workflow run pages.yml` で再デプロイ。secret を消して再デプロイすれば同梱なし (各自がキーを入れる方式) に戻る。モデルは repository variable `EMBEDDED_MODEL` で変えられる (既定 claude-opus-5)。

### C. コマンドライン
```bash
node tools/compose.mjs --prompt "曲のイメージ" --name my-song      # 設計図 → 全トラック (検査・手直し付き) → public/presets/my-song.json
# /?preset=my-song で開ける
```

## 会話でできること (全部 Claude が道具を選んで実行する)

| 言うこと | 起きること |
|---|---|
| 「ドラムはレッチリ、メロディはミスチルでガレージロック。BPM 速めで作って」 | 設計図 (構成・コード・編成・テンポ変化) → 全トラック生成 → 自動ミックス |
| 「ベースをもっと動かして」「サビだけ作り直して」 | そのトラック / その範囲だけ作り直し |
| 「ピアノを 3dB 下げて」「ギターを右に」「テンポ 120」「2 番をミュート」 | 即時反映 |
| 「サビだけ半音上げて」「人間味つけて」「ストリングスを膨らませて (swell)」 | ノート編集 |
| 「ミックスして」「全体をもっとドライに」「ドラムを前に」 | AI ミキシングエンジニアが音量・パン・ローカット・EQ・コンプ・リバーブ送り・マスターを決める |
| 「80 年代のぶ厚いブラスの音にして」「Reese ベースにして」 | シンセの音色を言葉から設計 (SYNTH パネルで手でも直せる) |
| 「最後の 2 小節でだんだん遅く」 | テンポマップ (再生・WAV・MIDI すべてに効く) |
| 「このトラックを DAW に MIDI で送って」 | Web MIDI で外部音源 / DAW 上の VST・AU に出力 |
| 「WAV で書き出して」「MIDI で書き出して」 | ミックス済み・ラウドネス調整済み WAV / テンポ変化と表情 CC 付き SMF |

手でもできる: ピアノロール編集、⌘Z、人間味 / Q (クオンタイズ)、♩ メトロノーム、● REC (MIDI 鍵盤から録音)、MIDI OUT。

画面中央のタブ: **PIANO ROLL** / **RACK** (選んだトラックの音源を機材パネルとして表示。シンセはつまみ全部、サンプル音源は中身の情報と試聴鍵盤。チャンネルストリップとマスターも同じ画面) / **MIXER** (全トラックのフェーダー・パン・センド・レベルメーター)。

曲は開くたびにブラウザのライブラリ (IndexedDB) に自動保存される。右上「☰」で一覧・開く・名前変更・複製・削除。チャットでも「曲の一覧」「前の曲を開いて」「別名で保存」ができる。

## 曲の質を上げる仕組み (v2)

1. **本物の譜面を渡す** — トラックを作るとき、先にできたトラックの実際のノートを小節ごとの譜面テキスト (`D2@0(1) A2@1.5!`) にして渡す。ドラムとベースがロックし、メロディと内声がぶつからない。
2. **検査と手直し** — 生成結果を `critic.js` が検査する: 空 / 範囲外 / 音域外 / 同音の重なり / 単音楽器の和音 / 強拍でコードにぶつかる長い音 / 役割に対する薄さ / 一定ベロシティ。機械的に直せるものは直し、重い問題は Claude に「エディター役」として出し直させる。0 音が「完了」で通ることは無い。
3. **表情 (v2)** — ノートに「終わりの強さ」を持たせ、弦・管・パッドの長い音がふくらむ / しぼむ。MIDI では CC11 のランプになる。
4. **テンポマップ** — リタルダンド等。再生・WAV・MIDI で一致。
5. **セクション単位の生成** — 長い曲は 24 小節以下に分け、前の範囲の演奏を引き継いで作る。
6. **ミックス** — 全トラックにローカット → 3 バンド EQ → コンプ → 音量/パン、ホール / ルームのセンドリバーブ、マスターにステレオ幅 → バスコンプ → リミッター。WAV 書き出し時は BS.1770 の K 重み付けでラウドネスを測り、目標 LUFS (既定 -14) に合わせる。
7. **シンセ** — 減算方式 (3 OSC + サブ + ノイズ → フィルター → LFO → drive / chorus / delay / reverb)。プリセット 20 種、または言葉から Claude が設計。パッチは JSON でプロジェクトに保存される。

## 音源 (すべて無料・再配布可・ローカル配信)

`public/samples/<楽器>/` に SFZ ライブラリを変換した Opus + `index.json` を置き、自前の多層サンプラー (`sampler.js`) で鳴らす (ベロシティ層 / ラウンドロビン / リリース音 / チョーク / ループ / 奏法切替 / v2 表情)。

| 楽器 | 音源 | ライセンス |
|---|---|---|
| ピアノ | Salamander Grand Piano V3 (Yamaha C5) 8 層 + リリース音 | CC-BY 3.0 |
| エレピ | Greg Sullivan E-Pianos: Wurlitzer EP200 | CC-BY 3.0 |
| ドラム | Naked Drums (Wilkinson Audio, kinwie SFZ 移植) GM プリセット 5 層 × 6RR | CC-BY 4.0 |
| エレキベース | Karoryfer Black And Blue Basses | CC0 |
| エレキギター / ミュート | Blue Jeans and Moonbeams (Strat) + アンプ風処理 | MIT |
| アコギ | Ella Gitauru | MIT |
| ストリングス / トランペット / フルート | VSCO 2 Community Edition | CC0 |
| サックス | Karoryfer Weresax | CC0 |
| オルガン | Tone.js で合成 (ドローバー + レスリー) | — |
| synth / synth-lead / synth-pad / synth-bass | 内蔵シンセ (パッチ) | — |

音源の作り直し: `samples_src/fetch.sh` → `tools/build-samples.sh`。任意の SFZ は `node tools/sfz-import.mjs --name <楽器> --sfz <file.sfz>`。調査メモは `docs/sound-sources-research.md`。

## 外部音源・プラグインについて

ブラウザは VST / AU / CLAP を直接読み込めない。代わりに:
- **MIDI OUT** (Web MIDI): トラックごとにポートとチャンネルを選び、DAW (Logic / Ableton / Cubase…) やハードウェア音源へ送る。macOS は「Audio MIDI 設定」の IAC ドライバを ON にして DAW 側で受ける。Windows は loopMIDI 等。DAW 側で好きな VST を立ち上げれば、このシーケンサーで作った演奏をその音で鳴らせる。「内蔵音源を鳴らさない」にすれば MIDI だけ送れる。
- **SMF 書き出し**: テンポ変化・CC11 (表情)・CC7/10 を含む Type-1。
- 将来: Web Audio Modules (WAM) 対応 (ブラウザ用プラグイン規格) と、デスクトップ版で VST3 / CLAP をホストする案がある。

## 構成

```
server.js            ローカル用: 静的配信 + /api/proxy (サーバーのキーで Claude を代理呼び出し) + 書き出し保存 + compose.mjs 用 API
public/js/
  prompts.js         プロンプト・JSON Schema・道具定義・コード解析・譜面テキスト化 (ブラウザとサーバーで共有)
  claude.js          Claude API クライアント (直結 / プロキシ、SSE、再試行、設定)
  critic.js          生成結果の検査・自動修正
  state.js           曲データ・Undo・自動保存・テンポマップ (拍⇄秒)
  audio.js           再生エンジン (音源選択・スケジューリング・オフライン書き出し)
  mix.js / ir.js     ミックスバス (挿入 FX・センドリバーブ・マスター) / インパルス応答の生成
  loudness.js        BS.1770 ラウドネス計測とノーマライズ・簡易リミッター
  synth.js           減算シンセ (パッチ → Tone.js ノード) + プリセット
  sampler.js         多層サンプラー (index.json を再生、v2 表情対応)
  midiio.js          Web MIDI 入出力
  midi.js            SMF Type-1 書き出し (テンポマップ・CC11)
  chat.js            会話ループ (tool_use をブラウザで実行)
  main.js            UI と道具の実装 (生成パイプライン・ミックス・音色・録音)
  rack.js / mixer.js / knob.js  機材パネル・ミキサー・つまみ部品
  library.js         曲のライブラリ (IndexedDB)
  synthpanel.js / settings.js / i18n.js  各パネル・設定・表示言語
  pianoroll.js / arrange.js  キャンバス表示
public/samples/      変換済み音源 (配布のため git に含める。build-samples.sh で作り直せる)
public/presets/      デモ曲 (neon-overdrive, dawn-voyage)
tools/               compose.mjs (CLI 生成) / sfz-import.mjs / wav-dir-sfz.mjs / build-samples.sh
```

## ライセンス

コードは MIT。音源は上表の各ライセンス (すべて再配布可)。Claude API の利用料は各自の Anthropic アカウントにかかる。
