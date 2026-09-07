# HANDOFF — BLUE GARAGE STUDIO 引き継ぎ（2026-09-07）

宛先：このプロジェクトの作業を続けるエージェント（ふぇぶるん本人の次セッションを含む）。
会話ログ無しで再開できるように書いてある。さとるんへの文体・作法は `agent/CLAUDE.md` が正。

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
