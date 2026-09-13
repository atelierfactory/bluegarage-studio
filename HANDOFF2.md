# HANDOFF2 — VESPER PIANO / VESPER BAND 引き継ぎ（2026-09-14 時点）

宛先：このプロジェクトを続けるエージェント（ふぇぶるん本人の次セッションを含む）と、さとるん。
**会話ログ無しで再開できるように書いてある。まずこの文書だけ読めばよい。**

- さとるんへの文体・作法は `agent/CLAUDE.md` が正（中学生でも分かる言葉・状況を省かない・作業を促す投稿は 1 投稿で完結）
- 経緯の詳細は `HANDOFF1.md`（1〜18 章。今の作りに至るまでの全記録）。さらに古い話は `HANDOFF.md`
- 記憶は `~/.claude/projects/-Users-satorun-Documents-agent-product-toys-music-app/memory/`

---

## 0. いま何がある（結論だけ）

**公開中。すべて push 済み・中継も新しい版で稼働中。未 push のものは無い。**

| もの | 住所 |
|---|---|
| VESPER PIANO（ロボットがグランドピアノを弾く） | https://atelierfactory.jp/device/jukebox/piano/ |
| VESPER BAND（ロボットのワンマンバンド） | https://atelierfactory.jp/device/jukebox/band/ |
| 元の公開先（同じ中身） | https://atelierfactory.github.io/bluegarage-studio/ |
| Claude を呼ぶ中継 | https://block.atelierfactory.jp/jukebox/health |

最新コミット `b3f3ad1`。リポジトリは `github.com/atelierfactory/bluegarage-studio`。

### 公開の仕組み（大事）
- **画面の更新は `git push origin main` だけ。** GitHub Pages が 1〜2 分で作り直し、会社サイト（Amplify）の `custom_rule` が `/device/jukebox/<*>` を GitHub Pages へそのまま返すので、atelierfactory.jp にも同時に反映される。会社サイト側の deploy は不要。
- **中継（`relay/`）を変えたときだけ**、さとるんに次の 1 行を実行してもらう（Claude の Bash は本番サーバーへの ssh/sudo を安全装置で止められる）。
  ```bash
  cd ~/Documents/agent/product/toys/music_app && ./relay/deploy.sh
  ```
  最後に `relay: {"ok":true,...,"concurrent":true,...}` と `block builder still ok: 200` が出れば成功。
- **配信の中継所（CloudFront）は最大 10 分、古い写しを返す。** 公開直後に「反映されていない」ように見えるのは、たいていこれ。`curl` で確かめ、10 分待ってから再確認する。

---

## 1. さとるんの決定（変えない）

1. **権利がきれいな物だけ。** 同梱する楽譜は Mutopia Project の「Public Domain」と明記された版だけ。著作権のある曲は同梱も生成もしない（ボカロ曲も作者の許可が要る）。
2. **API キーは他人が見えない場所にしか置かない。** 公開ページにキーは無い。中継サーバー（Lightsail）の `/etc/bb.env` にだけある。**エージェントはキーに触らない。**
3. **鍵は 1 本を使い回す**（新しい鍵は作れない。上限は鍵の提供元が付けている）。
4. **1 日 5 曲まで（ピアノ 5・シンセ 5、別々に数える）。そのかわり同時に作曲してよい。**
5. **できた曲に手で音を足せない**（ピアノロールは見る・聴く・再生位置を選ぶだけ）。
6. **曲を選ぶボタンは「選択」**（選んだだけでは鳴らない。▶ で再生）。
7. **3D は安定第一**（見た目の作り込みより、処理落ちしない・カメラで酔わないこと）。
8. 公開に影響する push は事前に一言。ダウンロードは「ファイル名・場所・大きさ・権利」を見せてから。

---

## 2. 同梱の曲（2026-09-14 時点）

### ピアノ（一覧に 10 曲／データは 12 曲）
表 = 一覧に出る、隠 = `index.json` の `hidden: true`（データは残してある）

| | 曲 | 演奏 |
|---|---|---|
| 表 | The Entertainer | Fable 5.1 |
| 隠 | Für Elise | Fable 5.1（さとるん「微妙」で外した） |
| 表 | Clair de Lune | Fable 5.1 |
| 表 | Trois Nouvelles Études No.1 | Fable 5.1 |
| 表 | Étude Op.10-12「革命」 | Fable 5.1 |
| 表 | 祭囃子オーバードライブ（オリジナル） | Fable 5.1 |
| 表 | トルコ行進曲 | Fable 5.1 |
| 表 | 幻想即興曲 | Fable 5.1 |
| 表 | 子犬のワルツ | Fable 5.1 |
| 表 | ジムノペディ 第 1 番 | Fable 5.1 |
| 表 | 悲愴ソナタ 第 2 楽章 | Fable 5.1 |
| 隠 | 交響曲第 5 番「運命」第 1 楽章 | **Opus 5**（さとるん「微妙」で外した） |

### シンセ（一覧に 3 曲／データは 6 曲）
表：疾風・電脳桜 / Neon Circuit / 3+3+2 オーバードライブ（すべて Fable 5.1 作）
隠：硝子の環流 / 銅の蝶番 / 白磁の螺旋（GPT-6 Astra 作。`public/band/repertoire/_hidden/index-removed.json` に元の登録内容、`.band.json` 本体も残してある）

---

## 3. 手元で動かす・確かめる

```bash
cd ~/Documents/agent/product/toys/music_app && ~/.local/node/bin/node server.js
```
→ http://localhost:5173/piano/ と /band/ 。node は `~/.local/node/bin/node`（PATH に無い）。`.claude/launch.json` の "bluegarage" で preview_start も可。

### 検査（全部 Node。ブラウザ不要）
```bash
node --experimental-vm-modules --experimental-loader ./tools/band-node-loader.mjs tools/<名前>.mjs
```
- ピアノ：`piano-motion-check`（**終了コード 0 が合格**。運指・コマ落ち 60/30/20/12・手の速さ）、`piano-fingering-check`、`piano-camera-check`、`piano-level-check`、`piano-hardware-check`、`piano-headless`、`piano-page-check`、`key-visual-check`
- シンセ：`band-check`、`band-regression`、`band-page-check`、`band-grip-check`、`band-hand-check`、`band-knob-check`
- `band-audio-check` は**前から不合格**（白磁の螺旋の keys と pedal の音量差 6.9 dB > 基準 6）。今回の作業のせいではない。直すなら曲データ側＝さとるんが聴いて決める話。

### 写真を撮る（Astra に見せる用・確認用）
```bash
node astra/shot.mjs out.png 'http://localhost:5173/piano/?song=<file>&shot=<view>&beat=<拍>'
node astra/shot.mjs --size=390x844 --page out.png 'http://localhost:5173/piano/'
```
1 枚 7〜15 秒。view は piano が left/right/both/pedal/eye/full、band が full/stick/pedal/knob/keys/bass/crash/synth/ar。

### ブラウザでの確認の入口
`window.vesperStage` / `vesperRoll` / `pianoLoad(file)` / `pianoShot({view,beat})` / `pianoShotStatus` / `vesperInterpret` / `vesperStage.rehearse(notes, pedal, b=>beatToSec(b))` / `vesperStage.setFrameRate(20)`。
シンセは `bandLoad` / `bandShot` / `bandRehearse` / `bandShotStatus`。

---

## 4. 中継（`relay/`）の作り

`relay/server.mjs`（依存なし・Node 標準だけ）を Lightsail（ブロックビルダーと同じサーバー）で `vesper-relay.service` として動かし、Caddy が `https://block.atelierfactory.jp/jukebox/*` で受ける。鍵は `/etc/bb.env` の `ANTHROPIC_API_KEY` を systemd の `EnvironmentFile` で読むだけ（**エージェントは鍵に触らない**）。

- `GET /health` → `{ ok, hasKey, concurrent: true, apps: { piano: {songs,tracks}, band: {...} } }`
- `POST /v1/messages` → api.anthropic.com へそのまま流す（ストリーミング）
- 守り：Origin の許可一覧／使えるモデルは 3 つだけ／`max_tokens` 上限 110000／IP ごと 1 分 30 回・1 日 260 回／**アプリごと 1 日 5 曲・音を作る呼び出し 90・その他 60**（日本時間 0 時切替）
- アプリの判定は見出し `x-bluegarage-app`（piano / band）。**新しい中継（health に `concurrent: true`）のときだけ送る**（古い中継は CORS で弾くので、公開の順番が前後しても壊れない）
- 数は `/var/lib/vesper/counters.json` に残る

---

## 5. 事故りやすい点（実際に起きたもの）

1. **Node の `fetch` は応答本文を 5 分で時間切れにする。** Claude が長く考えている間は無音なので、長い生成が `terminated` で切れて JSON が壊れる。→ 上流は **`node:https` + `setTimeout(0)`** で呼ぶ（`relay/server.mjs` と `server.js`）。undici は中継に入っていないので使えない。
2. **CloudFront が最大 10 分、古い写しを返す。** 公開直後の「出ない」はたいていこれ。
3. **`piano-motion-check` は曲を足すと落ちる**（前回の記録が無い／`astra/piano-baseline.json` の hash が合わない）。曲を足したら baseline の hash を更新する。曲データ本体を変えていないことは、他の hash が一致することで確認する。
4. **検査の偽の `claude.js`**（`band-page-check` / `piano-page-check` の中）に、画面が使う関数を書き足さないと `does not provide an export named ...` で落ちる。
5. **`band-page-check` は `index.json` の `shots`（撮影の拍）に依存する。** 曲を差し替えたら埋め直す（cutoff のつまみ操作の真ん中を `knob`/`ar`、その次の操作の直後を `full`/`crash`/`synth`）。
6. **JS を書いたら必ず `node --check`**（行末コメントで括弧を消して真っ白になる事故が何度もあった）。
7. **`synthcore.js` か `worklet/synth2-processor.js` を変えたら `node tools/bundle-worklet.mjs`**（作り直さないと古い音のまま）。
8. **`String.replace` の置き換え文字列は `$'` `$&` を特別扱いする。** コードを差し込むときは必ず関数で渡す（配布用 HTML が壊れた）。
9. **3D を変えたら渡す前に必ず測る**：三角形の数・描画回数・影を落とす部品の数・`update()` の 1 コマ最大時間・寄りカメラの移動量（0.06 m/秒 が静か、0.6 は酔う）。Node の検査だけでは処理落ちとカメラ酔いは見つからない。
10. **会社サイトの CSP** は `script-src` に `blob:` が必要（AudioWorklet が blob に包まれるため）。`/device/jukebox/**` にだけ足してある。worklet を使う新しい画面を公開するときは同じ CSP で試す（`astra/csp-proxy.mjs`）。

---

## 6. 道具（自分たちで作った物）

- **`tools/opus-interpret.mjs` + `tools/opus-plans.mjs`** … Opus 5 の演奏解釈エンジン。全曲を一度に設計・LilyPond の強弱記号を小節つきで読む・`tempoMap` で本物の時間の揺れ・声部バランスを区間ごとに指定。使い方 `node --experimental-loader ./tools/band-node-loader.mjs tools/opus-interpret.mjs <plan 名>`
- **`window.vesperInterpret`**（`public/piano/piano.js`）… Fable 5.1 の演奏解釈。8 小節ずつ。`startBar` / `keep` で途中から再開でき、区間ごとに最大 3 回やり直す
- **`tools/adopt-perf.mjs`** … `public/presets/<名前>.json` の解釈結果を同梱曲に取り込む
- **`tools/build-single.mjs`** … HTML 1 枚の配布版を作る（音源・フォント・JS を全部埋め込む。`~/Desktop/VESPER_PIANO_革命.html` が例、42 MB）
- **`astra/run_astra.sh`** … Claude Code → codex exec → GPT-6 Astra。続きは `ASTRA_SESSION=<番号> ./astra/run_astra.sh --resume <頼み.md> [写真...]`。ピアノの会話番号 `01a08f01-d864-7853-b996-79c5a51fc027`。料金は毎回ドルで出る（1 会話を resume し続けると回を重ねるほど高い）

---

## 7. 残っていること・次の候補

- **`band-audio-check` の 1 件**（白磁の螺旋の音量差 6.9 dB）。前からの状態。曲データを直すかどうかはさとるんの判断。
- **縦長の画面（幅 390）で「両手」の寄りカメラだと、片手が端で切れることがある。** Astra 前と同じ状態。
- **外した曲（運命・Für Elise・Astra の 3 曲）をどうするか。** データは残してある。戻すなら `hidden` を消す（ピアノ）／`_hidden/index-removed.json` から `index.json` に戻す（シンセ）。
- **Opus の演奏解釈を他の曲にも作るか。** `opus-plans.mjs` に足すだけ。運命は「微妙」と言われたので、次に作るならもともとピアノのために書かれた曲を選ぶ。
- さとるんは**聴いて判断する**。数字（強さの段階数・ペダルの数）が立派でも、良いかどうかは別。

---

## 8. コードの地図

| 場所 | 役割 |
|---|---|
| `public/piano/piano.js` | ピアノの本体（曲を選ぶ・作曲・即興・演奏解釈・残り曲数の表示） |
| `public/piano/scene.js` | 3D（ピアノ・ロボット・カメラ・鍵・リハーサル）。バンドと共有 |
| `public/piano/motion.js` | 手の経路の事前計算（先読み・速度上限） |
| `public/piano/loudness.js` + `sample-energy.json` | 曲ごとの音量補正 |
| `public/band/band.js` / `scene.js` / `hardware.js` / `prompts.js` / `critic.js` | シンセ＆ドラム |
| `public/js/claude.js` | Claude を呼ぶ（direct / proxy / remote、`songsLeft()`、`x-bluegarage-app`） |
| `public/js/robot-hardware.js` | ロボットの手・腕の部品（ピアノとバンドで共有） |
| `public/js/key-visual.js` | 押した鍵の印（小口の細い線。金色の全面発光はやめた） |
| `public/js/fingering.js` | 手と指を決めるルール（曲全体を見て運指を決める） |
| `public/js/audio.js` / `state.js` / `mix.js` / `sampler.js` | 再生・曲データ・ミックス・音源 |
| `relay/` | 公開版が Claude を呼ぶ中継（server.mjs / vesper-relay.service / deploy.sh） |
| `tools/` | 検査と道具（上の 6 章） |
| `astra/` | GPT-6 Astra に頼む仕組みと写真（`astra/shots/` は git に入れない） |
