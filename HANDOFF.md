# HANDOFF — BLUE GARAGE STUDIO 引き継ぎ（2026-09-07）

宛先：このプロジェクトの作業を続けるエージェント（ふぇぶるん本人の次セッションを含む）。
会話ログ無しで再開できるように書いてある。さとるんへの文体・作法は `agent/CLAUDE.md` が正。

## 0. 直近の作業と、止まっている場所（2026-09-07 夜・クレジット切れで中断）

さとるんの要望の流れ：①各楽器を無料最高級の音源に（済）→ ②右パネルをチャットだけに（済）→ ③公開版に API キーを「他人が参照できない場所」に置いて配る（**途中**）。

### 決まったこと（さとるんの決定。変えない）
- **API キーは他人が参照できない場所（サーバー側の金庫）にしか置かない。** 静的サイトへの同梱（GitHub secret → config.json）は一度作ったが**却下・撤去済み**。Cloudflare Worker 案も「うちは AWS」で却下（`proxy/` に残骸あり。使わない。消してよい）
- 公開先は **https://atelierfactory.jp/device/jukebox/**（会社サイト Amplify の中。名前「jukebox」はさとるん決定＝「話しかけると曲を作って鳴らす箱」）
- **1日20曲**（設計図の数・訪問者全員合計・日本時間0時切替）。料金の心配（Opus 5 で1曲2〜5ドル→最悪1日100ドル）に対する提案は「Anthropic 側の月の Spend limit＋公開版は Sonnet 5・effort medium（1曲0.5〜1ドル）＋合言葉」。**さとるんの返事待ち**（OK なら `apps/jukebox/variables.tf` の `force_model="claude-sonnet-5"`, `effort="medium"` にして進める）
- 公開サイトに影響する push は事前に一言確認（2026-09-07 に無断 push で驚かせた）。エージェントはキーそのものに触らない（`put_secret.sh` はさとるんが実行）

### できているもの
- **AWS 側**：`product/infra/apps/jukebox/`（Lambda Node22 ストリーミング Function URL＋DynamoDB 帳簿＋Secrets Manager 金庫＋予算$5＋ログ30日）。`terraform validate` 通過、`test_local.mjs` で門番・上限・モデル差し替えを検査済み。**まだ apply していない**（dev 079247879456 に置く予定）。infra はローカルコミット c4df8de、**未 push**（push はさとるん）
- **会社サイト側**：`apps/site/jukebox.sh`（`toys/music_app/public` を `/device/jukebox/` に同梱し、`terraform output api_url` から `config.json` を書く）を `deploy.sh` に組み込み済み。**hosting.tf の CSP に中継の住所（connect-src）を足す作業が未着手**（住所は apply 後に決まる。`/device/jukebox/**` のパターンを追加→`./headers_push.sh`→`./deploy.sh`）
- **アプリ側**：外の CDN を読まないよう Tone.js とフォント3種を `public/vendor/` に同梱（会社サイトの CSP 対応、push 済み 93e41cd）。`claude.js` は transport "remote"（`config.json` の `proxyUrl` を使い、ヘッダ `x-bluegarage-pass`（合言葉）と `x-bluegarage-kind`（blueprint/track/chat…）を送る）。⚙ に合言葉欄（中継が要求するときだけ表示）と「今日はあと N 曲」
- **料金の実測**：7トラック42小節の曲＝入力9.2万＋出力5.3万トークン（thinking除く）≈ Opus 5 で1.9ドル、thinking・作り直し込みで2〜5ドル。測り方は `prompts.js` の `buildTrackRequest` を `count_tokens` にかける（無料）

### 次にやること（この順）
1. さとるん：`aws sso login --sso-session atelier` → エージェント：`cd infra/apps/jukebox && terraform init && terraform plan` を一枚で見せる → さとるん OK → `terraform apply`
2. さとるん：`cd infra/apps/jukebox && ./put_secret.sh`（toys/env のキーを金庫へ。合言葉をその場で入力）→ `curl "$(terraform output -raw api_url)/health"` で `hasKey:true`
3. エージェント：`apps/site/hosting.tf` に `/device/jukebox/**` の CSP パターン（`connect-src 'self' <api_url>`）を追加 → `./headers_push.sh` → `./deploy.sh` → https://atelierfactory.jp/device/jukebox/ を開き、⚙ に「専用の中継サーバー…」が出て、合言葉を入れて曲が作れることを確認
4. 会社サイト（3D のアトリエ）にガラクタとして jukebox を1個置く（`aTELiER FACTORY/07_Webサイト/index.html` の `JUNK` 配列。apps/site/web/HANDOFF.md 参照）
5. Anthropic Console で jukebox 専用ワークスペース＋月の Spend limit（さとるん）。`proxy/` フォルダの削除

## 0b. VESPER PIANO（2026-09-08 追加・さとるんの新しい要望）

さとるんの言葉：「いきなりフルのシーケンサーは難しい。良いピアノがあるので、まずピアノだけのツールを超作り込む。左 2/3 がシーケンサー、右上にグランドピアノと座っている VESPER くん、右下に VESPER の手と鍵盤。普段はチャット、演奏を始めたら VESPER に切り替え。曲を作るとき右左どの指でどの音を弾くかが決まっている。ベロシティやペダルも VESPER が弾く。ありものの組み合わせで簡単なのに超おもしろい」。VESPER = `product/toys/3D_model` の格闘ロボ VESPER-01（白い外装・黒い胴・銀の関節・青い胸と目）。

- 場所：`public/piano/`（index.html / style.css / piano.js / scene.js）。公開は同じ Pages の `/piano/`。STUDIO の右上に PIANO リンクあり
- 中身：`piano.js` は 1 トラック（piano）のピアノロール + チャット（`PIANO_CHAT_TOOLS` / `SYSTEM_CHAT_PIANO`、prompts.js 末尾）+ 生成パイプライン（設計図 → `buildPianoRequest` を 16 小節ごとに continue → `analyzePiano`（critic.js 末尾）→ revise）。`scene.js` は three.js（`public/vendor/three/` に同梱、importmap）でグランドピアノ・骨組み（BVH と同じ骨名）・`buildRobot`（3D_model の balance_mimic_v1.html と同じ部品）・指付きの手・2 本骨 IK・鍵の沈み・ペダルの足・体の揺れ・カメラ 2 つ（上：全景、下：手のアップ。1 キャンバスを scissor で 2 分割）
- データ：音符に `h`（L/R）と `f`（1〜5）、`song.pedal = [{s, d}]`（拍）。ペダル中の音は `state.js` の `noteEndBeat` で終わりを伸ばす（audio.js の再生・オフライン共通）。MIDI は CC64。ピアノロールは手で色分け・指番号・PEDAL 帯。キー：1〜5 指、L/R 手、P ペダル
- 検証済み（2026-09-08）：ページ表示・3D 舞台・手動で置いた音符での再生（手が鍵へ動く・鍵が沈む・ペダル表示・ペダルで音が伸びる）。チャットからの作曲（Opus 5、16 小節）は実行中に HANDOFF を書いた → 結果は git log / この節の更新を見る
- 2026-09-08 夜の追加（さとるん要望）：UI を黒・白・銀に（点灯だけ金。pianoroll.js / arrange.js に THEME / ARR_THEME を追加し piano.js で上書き）。首と胴のつなぎ直し・上画面を VESPER の目線カメラに・ペダルと右足の小窓（3 つ目のビューポート）・肘の向き（IK の pole を外・下・手前に）・指と鍵の一致（指の並びを world x 基準に、押す角度を幾何で計算）・鍵の沈み 1cm・ハンマー / ダンパーの動き。グランドピアノを作り直し（Shape 押し出しのリム・響板・鋳鉄フレーム・弦 ≒230 本を InstancedMesh・チューニングピン・駒・ダンパー・ハンマー・屋根・譜面台・脚・リラ・銘板）。銘板と ♥ の窓に Salamander への感謝（一次資料は samples_src/salamander/README.md）。
- JAM（即興）：`public/piano/jam.js`。手札（進行 / 左手の型 / 右手のモチーフ / フィル、度数書き）を Claude が 1 回作り localStorage に保存、`Improviser.next8` が 8 小節ずつ音符にして `audio.appendNotes` で再生中に足す。既定の手札 DEFAULT_BANK で API 無しでも鳴る。JAM ボタン / J キー / chat の jam tool
- レパートリー：`public/piano/repertoire/`（Mutopia Project の Public Domain 版 MIDI 4 曲：The Entertainer, Für Elise, Clair de Lune, Chopin Trois Nouvelles Études No.1。index.json に出典とライセンス）。`public/js/midiread.js`（SMF 読み込み）+ `public/js/fingering.js`（ルールで手と指）。自分の MIDI は ☰ → MIDI 読み込み。**著作権のある曲（ビートルズ・久石譲・坂本龍一・ゲーム音楽・千本桜など）は同梱しない・生成もしない**（さとるん指示「権利的にアウトなことは絶対にしない」）
- 2026-09-08 深夜 (v3・さとるん要望)：チャット廃止。ピアノロールの下に「お題」バー（即興 / 作曲、モデル選択 Opus 5 / Fable 5.1 / Sonnet 5、作り込み ふつう / 超作り込み = 8 小節刻み + polish パス）。即興は既定の手札ですぐ弾き始め、裏で Claude がお題の手札を作って差し替える（jamStart）。舞台は常時表示：上（または全画面の左）= 全体（オービットカメラ：ドラッグ回転・ホイール寄り引き、全体 / 横 / 上 / 目線）、下（右）= 指先。全画面ボタン（Esc で戻る）。アレンジ帯・PEDAL 表示・小窓・JAM HUD は削除。左足は床、右足だけペダル。「曲を選ぶ」= 同梱の名曲 + 作った曲 + MIDI 読み込み。旧 piano.js のチャット道具（compose_piano 等）は prompts.js の PIANO_CHAT_TOOLS に残っているが未使用
- 2026-09-09 (v4・さとるん要望)：**既存曲は「演奏解釈」方式**にした：楽譜（音の高さ・位置）は Mutopia の Public Domain 版のまま、Fable 5.1 が 8 小節ずつ「強弱 v・間 dt・切り方 dd・手 h・指 f・ペダル」を決める（prompts.js `buildInterpretRequest` / `SYSTEM_PERFORMER`、piano.js `interpretSong`。ブラウザで `window.vesperInterpret({model, bars})`）。結果は `public/piano/repertoire/<name>.vesper.json` に保存し、index.json の `perf` で指す（perf があれば MIDI ではなく完成データを読む）。MIDI 読み込みは CC64 のペダルも読む（midiread.js）
- 即興の手札は同梱化：`tools/make-banks.mjs` が 20 スタイル × (進行 12 / 左手 16 / 右手 30 / フィル 8) を Fable で作り `public/piano/banks/<id>.json` + index.json に保存（1 スタイル 25k 出力トークン前後・約 4〜5 分）。piano.js `pickStyle` がお題の言葉から近いスタイルを選ぶ（言葉が当たらなければ Sonnet 5 に選ばせる小さな呼び出し）。お題ごとの手札生成はやめた（費用の栓）
- UI：入力欄は「既存の曲 / 即興 / 作曲」の 3 択（既存の曲が最初。押すと一覧の窓）。状態表示は 1 行だけ。操作説明は「?」の窓へ。STUDIO は封印（`public/index.html` は piano/ へ転送、旧画面は `public/studio.html` に残置・リンク無し）。指→鍵の順（指先が鍵の上に来た時だけ沈む。80ms 過ぎたら強制）。ピアノロールの横スワイプは横だけ。プレート文字は幅に合わせて縮小。ピアノ：L 字の白鍵（Shape 押し出し）、フレームの抜き穴、アグラフ、ヒッチピン、木目テクスチャ（canvas）、環境マップ（PMREM）で漆の映り込み
- 権利：著作権のある曲は同梱も生成もしない（ボカロ曲も piapro は非営利条件・JASRAC は編曲を扱わない → 作者の許可が要る。さとるんに説明済み）。「革命」など PD 曲は自由に使える楽譜データが見つかれば追加
- AWS 中継（apps/jukebox）は allowed_origins が atelierfactory.jp 前提。GitHub Pages 版の piano から使うなら `https://atelierfactory.github.io` を足す。さとるんの希望：1 日 100 曲・Fable 5.1
- 2026-09-09 朝（v4.1・さとるん指摘）：白鍵の左右反転（ExtrudeGeometry を rotateY(π) していた → rotateX(-π/2) だけに）、弦のはみ出し（低音弦の長さをケース内に切り詰め）、ピアノロールは手で動かしたら 5 秒追跡を止める（`markUserScroll`）、上級者向け UI を全部外す（拍子・キー・スナップ・手・⚙・検査・凡例・?）、入力欄は「即興 / 作曲」だけ、作曲は Fable 5.1 の超作り込み一本（モデル/段階の選択なし）、曲の種類 `song.kind`（repertoire / jam / composed / imported）で保存を分け、即興と同梱曲はライブラリに保存しない。ピアノの保管庫は `configureLibrary("vesper")` で STUDIO と分離。初回起動で以前の開いていた曲を捨ててエンターテイナーを開く（`vesper:reset:v4`）
- 次に良くすること：手の見た目（今は箱と円柱。指はもう少し細く長く）、親指くぐりの動き、和音のロール、カメラの寄り引き、左手の跳躍先読み、鍵盤の反射・ホコリ・照明の作り込み、VESPER の顔の表情（バイザーの光は既に強弱で変わる）

## 1. 現在地（事実）

- **公開済み**：https://atelierfactory.github.io/bluegarage-studio/ （GitHub Pages、`.github/workflows/pages.yml` が `public/` を配信。push すると約 1〜2 分で更新）
- **リポジトリ**：`github.com/atelierfactory/bluegarage-studio`（公開、MIT）。ローカルの git は `main`、origin に同期済み（最終コミット a3a8228）。音源 `public/samples/`（156MB）も git に含めて配布している
- **手元の起動**：`~/.local/node/bin/node server.js` → http://localhost:5173 。`.claude/launch.json` の "bluegarage" で preview_start も可。5173 を古いプロセスが掴んでいたら kill してから
- **API キー**：手元は `.env` の `ANTHROPIC_API_KEY`（サーバーが `/api/proxy` で代理呼び出し）。公開版は 2 通り：(a) 各自が ⚙ に自分のキーを入れる（localStorage、api.anthropic.com にだけ送る）、(b) 2026-09-07 追加：`proxy/` の中継サーバー (Cloudflare Worker) にキーを置き、`config.json` の `proxyUrl` 経由で呼ぶ（`claude.js` の transport "remote"、アクセスコード `x-bluegarage-pass`）。**キーを静的サイトに同梱する案はさとるんが却下（誰でも見えるため）。二度とやらない**。手順は `proxy/README.md`。1 日の上限は Worker の KV で数える（`SONG_LIMIT`=20 曲/日・全員合計・日本時間 0 時切り替え、トラック生成 300 回/日、種類はヘッダ `x-bluegarage-kind`）。セットアップは wrangler login（さとるんのブラウザで Cloudflare 認証）→ secret 2 つ（キー・アクセスコード）はさとるん、KV 作成・deploy・`gh variable set PROXY_URL`・Pages 再デプロイはエージェントがやる。2026-09-07 時点: コードは push 済み、Cloudflare 側は未セットアップ（サイトは「各自キー方式」のまま動く）
- **版**：v2.1。2026-09-06 に v1（2026-08-11）から土台を作り替えた。作り替えの経緯と全体像は `README.md`（日本語）/ `README.en.md`

## 2. 何ができるか（さとるんに説明するときの要点）

- 会話だけで：設計図 → 全トラック生成（検査・手直し付き）→ 自動ミックス → 音色設計 → テンポの揺れ → 書き出し
- 手でも：ピアノロール編集（⌘ドラッグ範囲選択・⌘C/X/V/D・矢印移動）、RACK（機材パネル：シンセ 58 つまみ、チャンネルストリップ、マスター）、MIXER（フェーダー・メーター）、メトロノーム、MIDI 鍵盤から録音、トラックごとの MIDI OUT（DAW の VST/AU へ）
- 曲はブラウザのライブラリ（IndexedDB）に自動保存。☰ で一覧・開く・複製・削除。同梱デモ曲 2 曲（`public/presets/`、一覧は `presets/index.json`）

## 3. コードの地図（詳細は README「構成」）

| ファイル | 役割 | 触るときの注意 |
|---|---|---|
| `public/js/prompts.js` | プロンプト・JSON Schema・道具定義・コード解析・譜面テキスト化。**ブラウザと server.js で共有**（DOM/Node API 禁止） | structured outputs の schema に `minItems/maxItems` は使えない（400 になる）。optional プロパティは OK |
| `public/js/claude.js` | Claude API クライアント（直結 / proxy、SSE、再試行、設定） | 拡張思考の `thinking` + `signature` を content に残さないと次のターンで 400 |
| `public/js/critic.js` | 生成結果の検査・自動修正（純粋関数） | severity 2 で main.js が "revise" を 1 回だけ回す |
| `public/js/state.js` | 曲データ・Undo・自動保存・テンポマップ（拍⇄秒） | 再生は Transport の bpm を使わず `beatToSec` の秒でスケジュール |
| `public/js/audio.js` | 音源選択・スケジューリング・オフライン書き出し・メトロノーム・メーター | `SAMPLE_BASE` は相対パス（サブディレクトリ配信のため） |
| `public/js/mix.js` / `ir.js` / `loudness.js` | ミックスバス / 自作 IR / BS.1770 ラウドネス | `Tone.Convolver` に `wet` は無い（dry/wet を並列で足す）。Tone.Reverb は Offline 内で使えないので IR を計算で作る |
| `public/js/synth.js` | 減算シンセ（パッチ→Tone ノード）+ プリセット 20 | パッチは `normalizePatch` を通す |
| `public/js/rack.js` / `mixer.js` / `knob.js` | 機材パネル・ミキサー・つまみ | 表示中（`.view-active`）だけ rAF でメーター更新 |
| `public/js/library.js` | 曲ライブラリ（IndexedDB、localStorage 退避） | `state.songId` が曲の ID。設計図で曲を作り替えるとき新 ID を振る |
| `public/js/main.js` | UI と道具（actions）の実装 | 道具を足すときは `prompts.js` の CHAT_TOOLS と `main.js` の actions の両方 |
| `server.js` | ローカル用（静的配信・proxy・書き出し保存・compose.mjs 用 API） | Express の `req.on("close")` は本文読了でも発火する → abort は `res.on("close")` |
| `tools/compose.mjs` | CLI で曲を丸ごと生成（検査・手直し付き） | サーバー起動が前提 |

## 4. 検証済み（2026-09-06、実機）

再生 / 8 小節の WAV 書き出し（テンポマップ + v2 込み、-14 LUFS ぴったり、ffmpeg の ebur128 と一致）/ MIDI 書き出し（テンポ・CC11）/ RACK・MIXER・ライブラリ・メトロノーム / チャット経由：auto_mix・design_sound・set_tempo_map・generate_tracks（ベース 8 小節、検査通過 93 音、2 分）/ 公開サイトで ☰ の一覧表示 / ピアノロール編集キー一式

**通しで未検証**：設計図から 7 トラックを最初から全部作る流れ（部品ごとは全部検証済み。時間と料金の都合で通していない）

## 5. 次のタスク（順番どおり。`docs/ROADMAP.md` が台帳）

1. オートメーション（音量・パン・センド・シンセのつまみを時間で動かす線。MIDI では CC）
2. ピアノロール下のベロシティ / v2 / CC レーン
3. オーディオトラック（マイク録音・WAV 取り込み・波形・クリップ編集）
4. マーカー・区間ループ・パンチ録音
5. 途中の拍子・キー変更 → グループ/バス → WAM プラグイン → 楽譜 → デスクトップ版（VST3 直接）

## 6. さとるんの判断待ち / 未決

- **ライセンス**：README と LICENSE に「コードは MIT、著作権表示 aTELiER FACTORY」と書いた。さとるんの確認は未取得
- **AWS dev への配置**：`product/infra` の `apps/_blueprint` を使う案。`aws sso login`（Touch ID）と CloudFront のアカウント確認（2026-08-19 に判明、未解決）が要るため、さとるん同席の回でやる
- **さとるんが作った曲の同梱**：デモとして出したい曲は JSON を `public/presets/` に置いて `presets/index.json` を作り直す（`node -e` の一行は git log a3a8228 の前のコミットに手順あり）→ push

## 7. 事故りやすい点

- 公開リポジトリの新規作成・`git branch -M` は auto mode の安全装置に止められた（さとるんがコマンドを実行して解決）。**既存リポジトリへの `git push` は通る**
- Web MIDI は Chrome / Edge のみ。初回は許可ダイアログ
- WAV 書き出しは曲の長さ 72 秒で約 3 分（Tone.Offline が全イベントを先に積むため）
- テストでブラウザの保存曲を書き換えたら必ず `resetSong(元)` で戻す（localStorage の自動保存が即座に上書きするため）
- 生成の最初のトークンまで 60〜200 秒黙る（進捗表示は 0 のまま）。故障ではない
- 会話履歴に壊れた thinking ブロックが残ると 400。`chat.js` の `trimHistory` が署名付き以外を落とす

## 8. 記憶（memory）

`~/.claude/projects/-Users-satorun-Documents-agent-product-toys-music-app/memory/` の `bluegarage-studio.md` に上記の要約がある。フォルダを移動すると記憶が読めなくなる（`agent/00_README.md` 参照）。
