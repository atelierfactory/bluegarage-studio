# HANDOFF1 — VESPER PIANO 引き継ぎ（2026-09-09 午後）

> **これは 2026-09-09 時点の記録です。最新の状態は `HANDOFF2.md` を先に読んでください。**

宛先：このプロジェクトの作業を続けるエージェント（ふぇぶるん本人の次セッションを含む）と、さとるん。
会話ログ無しで再開できるように書いてある。さとるんへの文体・作法は `agent/CLAUDE.md` が正。
古い経緯（BLUE GARAGE STUDIO、jukebox 中継、v3 まで）は `HANDOFF.md`。この HANDOFF1 は VESPER PIANO の「今」だけを書く。

---

## 0. いま何が起きているか（状況）

さとるんの要望は「ロボット VESPER-01 がグランドピアノを弾くのを見る・聴くツール（VESPER PIANO）を、権利のきれいな名曲だけで、最高のものにする」。
今日（2026-09-09）は朝から午後まで、さとるんの指摘を順に直して 4 回公開した。

- 公開先：**https://atelierfactory.github.io/bluegarage-studio/piano/**（GitHub Pages。`main` に push すると 1〜2 分で反映）
- 最後に公開した版：コミット `ee4c1e9`（2026-09-09 午後）
- **動いている途中のもの**：Fable 5.1 による「演奏解釈」（楽譜はそのまま、強弱・間・音の切り方・手と指・ペダルを Fable が演奏家として決める）を 3 曲、ローカルのブラウザ 3 タブで同時に走らせている。
  - 革命のエチュード（84 小節）… 8 小節あたり約 5 分 → 50〜55 分。開始 13:0x 頃
  - Für Elise（53 小節）… 約 30 分。開始 13:1x 頃
  - Clair de Lune（108 小節）… 約 50 分。開始 13:1x 頃
  - 終わると自動で `public/presets/<名前>.json` に保存される（下の 4 章）。**このセッションが閉じると、終わっていない分は消える**（ブラウザの中で走っているため）。その場合は 4 章の手順でやり直す
- さとるんの言葉：「本当に本当に素晴らしいです」「すでにだいぶ素晴らしいです。最高のものにしましょう」。次の要望は「革命を弾けるように」（楽譜を見つけて同梱済み、解釈は上の通り進行中）

## 1. 見方・動かし方（さとるん向け）

- 公開版：上の URL を開く。下の帯の「既存の曲を弾く」→「♪ 曲を選ぶ」→ 曲の右の「弾く」。
- ローカルで見る：
  ```bash
  cd /Users/satorun/Documents/agent/product/toys/music_app && ~/.local/node/bin/node server.js
  ```
  → http://localhost:5173/piano/ を開く。ローカルのサーバーは `.env` の API キーで Claude を呼べる（公開版はまだ呼べない。2 章の「判断待ち」）。
- node は `~/.local/node/bin/node`（PATH に入っていない）。

## 2. 今日決まったこと（さとるんの決定。変えない）

1. **同梱する曲も、作る曲も、著作権が切れているものだけ。** 打ち込みデータ（MIDI）にも作った人の権利があるので、「Public Domain」と明記された Mutopia Project の版だけを使う。IMSLP の MIDI（CC BY 3.0）や Wikipedia の MIDI（CC BY-SA 3.0）は使わなかった。
2. **上級者向けのものは全部省く。簡単に楽しめるものだけ残す。** ⚙（API キー）・検査・凡例・?・拍子・キー・スナップ・手の切替は削除済み。作曲は Fable 5.1 の一番本気の作り方に固定、**一発生成のみ、作り直しなし**。
3. **下の帯は「既存の曲を弾く / 即興 / 作曲」の 3 つ。** 「既存の曲を弾く」を押しても曲は選ばれず、帯の中に「♪ 曲を選ぶ」が出て、そこから選ぶ。
4. 即興と同梱曲は「作った曲」に残さない（保存するのは作曲した曲と自分で読み込んだ曲だけ）。
5. API キーは公開側に置かない。さとるんが AWS に置く（`HANDOFF.md` 0 章。まだ）。作曲の上限は Fable 1 日 20 曲・全体 100 曲のイメージ。
6. 一番上に小節番号と**時間**（経過 / 全体）を出す。
7. 鍵盤の境目と、押したときの変化がはっきり見えること。指と鍵盤は**既存の曲すべてでリハーサルして完全に一致**させること。

## 3. できていること（今日の 4 回の公開）

### v4.1（朝）
- 白鍵の左右反転を直した（ExtrudeGeometry を rotateY(π) していたのが原因）。弦はケースの外形線から 7cm 内側に必ず収める（多角形の内外判定）。
- ピアノロールは手で動かすと 5 秒間追いかけをやめ、そのあと再生位置に戻る。
- 曲の種類 `song.kind`（repertoire / jam / composed / imported）。ピアノの保管庫は STUDIO と別（`configureLibrary("vesper")`）。初回起動で古い「開いていた曲」を捨ててエンターテイナーを開く（`vesper:reset:v4`）。

### v4.2（昼）
- **指と鍵盤のずれの根本原因：両手とも親指と小指が左右逆に付いていた**（`FINGER_Z` の符号）。直した。
- 指先を鍵の上にぴったり置く計算 `_placeFinger`（scene.js）：3 関節を実測ヤコビアンで減衰最小二乗、関節の限界に当たったら反対側に微分、前フレームの答えから開始、だめなら基本形からやり直し。
- 手の前後位置は指ごとの届く長さ `FINGER_REACH_Z` から決める（親指を重く）。音が鳴る 0.10 秒前（LEAD）から手を先回り。鍵は音の開始と同時に沈め、指はその沈んだ面に合わせる。
- データの指番号の間違い（同じ指に 2 音・順番が逆）はその瞬間だけ振り直す。
- **リハーサル `stage.rehearse(notes, pedal, beatToSec)`**：描画せずに曲を頭から通し、音の開始と 60ms 後に指先を測る（鍵の幅の中・上面から 8mm・奥行きの中）。
- 鍵盤の見た目：すき間 2.2mm、角の丸み 1.2mm、黒鍵は台形断面、すき間の底に黒い板、鍵盤を斜めから撫でる影つきライト、押した鍵は金色に灯る。
- 下の帯 3 タブ、LCD に「経過 / 全体」。

### v4.3（午後）
- **革命のエチュード（ショパン Op.10-12）を追加**。Mutopia の Public Domain 版（Roland Goretzki 打ち込み、Peters 1900 版が元、Mutopia-2018/05/15-743）。`.ly` も同梱して権利表記を残した。
- 手の流れ：跳ぶ 60ms 前に遠くの押さえっぱなしを手放して次のかたまりに先回り（楽譜で伸ばしていても実際の手は届かない。音はペダルが保つ）。届かなかった指の残りだけで手全体をずらす（2 回まで）。片手で 10 度を超える塊は届く方の手へ（`fingering.js`）。
- **同梱 5 曲リハーサル ずれ 0**（判定 15794 回、最大の横ずれ 0.8mm）：

| 曲 | 音の数 | 判定回数 | ずれ |
|---|---|---|---|
| The Entertainer（Fable 解釈版） | 2621 | 5242 | 0 |
| Für Elise | 905 | 1810 | 0 |
| Clair de Lune | 1468 | 2936 | 0 |
| Chopin 新練習曲 1 番 | 829 | 1658 | 0 |
| Étude Op.10-12「革命」 | 2082 | 4148 | 0 |

## 4. 進行中の 3 曲の解釈 — 終わったらやること（エージェント向け・手順）

1. 保存先を確認：`public/presets/revolutionary-vesper.json` / `fur-elise-vesper.json` / `clair-de-lune-vesper.json`（形式は `{ song }`。`song.interpretation` に model / memos / usage）。Monitor（task bal1mg7pc）が「SAVED …」を通知する。
2. 取り込み：
   ```bash
   ~/.local/node/bin/node tools/adopt-perf.mjs revolutionary-vesper op-10-12-wfi.mid revolutionary.vesper.json
   ~/.local/node/bin/node tools/adopt-perf.mjs fur-elise-vesper fur_Elise_WoO59.mid fur-elise.vesper.json
   ~/.local/node/bin/node tools/adopt-perf.mjs clair-de-lune-vesper debussy_Ste_Bergamesq_Clair.mid clair-de-lune.vesper.json
   ```
   → `public/piano/repertoire/<名前>.vesper.json` を書き、`index.json` の該当曲に `perf` / `perfBy` / `perfNote` を付ける（エンターテイナーと同じ形）。
3. リハーサル：ブラウザで http://localhost:5173/piano/ を開き、JS で
   ```js
   const S = await import('/js/state.js'); const st = window.vesperStage;
   // 「曲を選ぶ」の 弾く ボタン (index 0〜4) を click して読み込んだあと
   st.rehearse(S.state.song.tracks[0].notes, S.state.song.pedal, b => S.beatToSec(b))
   ```
   → `misses` が 0 であること。0 でなければ `misses` の `i`（音の番号）を `update()` を onset まで回して調べる（今日やった probe と同じ。手の位置・指先・lead リストを出す）。
4. `git add -A && git commit && git push origin main` → `gh run list --branch main --limit 1` が completed success → 公開版で「曲を選ぶ」に「Claude Fable 5.1 の演奏解釈」と出ることを確認。
5. さとるんに報告（曲名・音数・判定数・ずれ・トークン数。料金の単価は分からないので言わない）。

解釈をやり直す場合（セッションが切れた等）：ブラウザで曲を読み込み、
```js
window.vesperInterpret({ model: 'claude-fable-5-1', bars: 8, extraDirection: '（曲の性格の指示）', onProgress: m => console.log(m) })
  .then(() => fetch('/api/save-preset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '<名前>-vesper', song: (await import('/js/state.js')).state.song }) }))
```
（`await` はコンソールの都合で then の中を async にする。今日は `.then(async (res) => …)` で書いた。）8 小節ごとに Fable を呼ぶので 1 曲 30〜55 分。

## 5. 次にやること（順番）

1. 4 章（3 曲の解釈の取り込み → リハーサル → 公開 → 報告）。
2. **API キーを AWS に置く**（`HANDOFF.md` 0 章の jukebox 中継）。さとるんの `aws sso login` と `put_secret.sh` が必要。公開版の作曲・即興（お題つき）はこれが終わるまで動かない（即興は既定の手札で API 無しでも鳴る）。上限は Fable 1 日 20 曲・全体 100 曲。中継の `allowed_origins` に `https://atelierfactory.github.io` を足す。
3. 手の見た目（今は白い筒の指と箱の手のひら）をもっとそれらしく。指の長さは v4.2 で親指 1.65 / 小指 1.75（ロボット単位）に伸ばしてある。見た目を変えるときは必ず 5 曲リハーサルを回す。
4. 同梱曲を増やす（Mutopia の Public Domain 版だけ。手順は 4 章 + `.mid` `.ly` を `public/piano/repertoire/` に置いて `index.json` に追加）。さとるんの候補だった中で権利がきれいなのは、ショパン・ベートーヴェン・ドビュッシー・ジョプリンなど。
5. `docs/ROADMAP.md` の整理（STUDIO 側の項目は「封印」に移す）。

## 6. さとるんの判断待ち / 未決

- AWS 中継（上の 5-2）。さとるんの Touch ID が要る作業なので、エージェントからは進められない。
- 公開版の作曲モデルは Fable 5.1 固定でよいか（料金は 1 曲あたり入力 10 万・出力 17 万トークン級。単価は不明）。
- 今日のダウンロードは「ファイル名・場所・大きさ・権利」を見せたら即 OK だった。次に曲を足すときも同じ形で聞く。

## 7. コードの地図（VESPER PIANO）

- `public/piano/index.html` … 画面。上：⏮ ▶ ■ ⟲ ♩・LCD（小節 + 経過/全体）・BPM・VOL・MIDI・WAV・♥。左：ピアノロール。右：3D 舞台（上 = 全体 / 横 / 上 / 目線、下 = 指先、全画面）。下：3 タブ + 曲を選ぶ / お題。
- `public/piano/piano.js` … 本体（v4）。`playRepertoire`（`perf` があれば解釈済み JSON、無ければ MIDI + `autoFinger`）、`loadMidiIntoSong`、`interpretSong`（= `window.vesperInterpret`）、`compose`（Fable deep 一発）、`jamStart`、`renderSongs`（同梱 / 作った曲 / 読み込んだ曲）、`updateLcd`。デバッグ用に `window.vesperStage` / `window.vesperRoll`。
- `public/piano/scene.js` … 3D。`buildPiano`（外形 `outline()`、鍵 `keys[p]`、弦・ピン・ハンマー・ダンパー）、`buildHand`（`FINGER_Z` / `FINGER_LEN` / `FINGER_REACH_Z` / `FINGER_Z_WEIGHT`）、`PianoStage.update()`（音の集合 active / lead / upcoming → 手の担当 list → 指振り直し → 手の位置 → `_solveArm` → `_placeFinger` → 手ずらし）、`_updateKeys`（沈み + 金色）、`rehearse()`。
- `public/js/fingering.js` … 手（トラック → 10 度超の塊は分け直し）と指のルール。
- `public/js/midiread.js` … SMF 読み込み（CC64 → ペダル区間）。
- `public/js/prompts.js` 末尾 … `SYSTEM_PERFORMER` / `buildInterpretRequest` / `PIANO_INTERPRET_SCHEMA`（解釈）、`SYSTEM_PIANIST` / `buildPianoRequest`（作曲）。
- `public/piano/jam.js` + `public/piano/banks/`（20 スタイル 1320 手札、`tools/make-banks.mjs` で生成）。
- `public/piano/repertoire/` … 5 曲の `.mid`、`index.json`（出典・ライセンス）、`entertainer.vesper.json`（Fable 解釈済み）、`op-10-12-wfi.ly`（権利表記の記録）。
- `tools/adopt-perf.mjs` … 解釈結果の取り込み（4 章）。
- `server.js` … ローカル用（`/api/proxy` が `.env` のキーで Claude を呼ぶ、`/api/save-preset` が `public/presets/` に書く）。公開版は静的。

## 8. 事故りやすい点

- 指の並び：手の骨のローカル z は左手で world +x、右手で world -x（どちらも体の内側 = 親指側）。`FINGER_Z` の親指は + で正しい。ここを触ると両手が裏返る。
- `_placeFinger` は関節の限界（`lo` / `hi`）で微分を反対に取る。限界を変えたら 5 曲リハーサル。
- 手が「手放す」判定は 12cm・60ms・120ms の 3 つの数（scene.js の `list` を決める所）。広げると届かない和音が増え、狭めると跳びが遅れる。
- 白鍵の z 領域：`_placeFinger` は `-0.115〜-0.020`、リハーサルは `-0.120〜-0.004`（判定の方が広い）。
- `*.mid` は `.gitignore` で除外されている。`public/piano/repertoire/*.mid` だけ `!` で許可してある。新しい曲も同じ場所に置くこと。
- ブラウザの「曲を選ぶ」で読み込むと `state.song` が入れ替わる。解釈を走らせている間に別の曲を読み込むと壊れる（タブを分ける）。
- 公開に影響する push は事前に一言（今日は「公開サイトにも出ました」と報告する形で進めて OK だった。無断で驚かせたのは 09-07 の一回）。

## 9. 記憶（memory）

`~/.claude/projects/-Users-satorun-Documents-agent-product-toys-music-app/memory/` に `bluegarage-studio.md`（構成・起動・v4.1〜v4.3 の要点）、`sound-library-plan.md`（音源）、`node-install-location.md`。

---

## 10. v4.4（2026-09-09 夕方）— 革命の「片手が聞こえない」・読み取り専用のピアノロール・和風ロックのオリジナル曲

### 何が起きていたか（さとるんの報告：革命で、鍵盤とピアノロールは動いているのに片手の音が聞こえない）
- ブラウザで実測（sampler.js に数え役を仕込んで 978 音）：**音のデータ無し 0・小さすぎて止めた 0・遅れ 0**。音は全部鳴っていた。
- 本当の原因は**音量差**。Mutopia の革命 `.ly` 61 行目 `\set Staff.midiMinimumVolume = #-.5`（ふつう使わない設定）で、p が強さ 31、pp や山カッコの終わりが 12、ff が 122〜127 になっていた（右手 668 音のうち 253 音が 41 以下、左手 1414 音のうち 165 音が 12）。
- そこに音源の仕組みが重なる：Salamander は強さで 8 段の録音を切り替え（弱い録音は ff より約 14 dB 小さい）、その上に sampler.js が amp_veltrack（2 乗カーブ、vt=0.73）を掛ける → 強さ 31 は ff より **約 24 dB 小さい**（音の大きさ 1/16）。71 小節中 16 小節で片手が 15 dB 以上小さかった（14〜17・23・24・28 小節は右手が、37〜41 小節は左手が消える）。
- 他の同梱 3 曲は強さ 62〜127 で問題なし → **読み込みの仕組みは変えていない**。革命だけ、別レーンが作り終えていた Fable の演奏解釈（`public/presets/revolutionary-vesper.json`、強さ 76〜120、ペダル 412 区間、入力 88k / 出力 194k トークン）を `tools/adopt-perf.mjs` で取り込んで解決。リハーサル 4127 回・ずれ 0。
- Für Elise / Clair de Lune の解釈は別レーンのブラウザで走っていた分が残っていない（presets に無い）。必要なら 4 章の手順でやり直す。

### さとるんの決定（変えない）
- **できた曲（同梱・作曲・即興・読み込んだ曲）に手で音を足せないようにする。** → `PianoRoll` に `editable` オプション（`public/js/pianoroll.js`）。piano.js は `editable: false`（ノートの追加・移動・削除・貼り付け・ベロシティ変更を止める。クリックは試聴だけ。ルーラーで再生位置を選ぶ・鍵盤の試聴はそのまま）。STUDIO（main.js）は従来どおり編集可。
- **マウスパッドで前に戻れるように。** 原因は「手で動かして 5 秒たつと再生位置へ引き戻す」追従。→ `userScrolled` フラグ：再生位置が画面の外にあるあいだは追わない（画面内に戻ってきたら、または ▶・⏮・Home・ルーラークリックで `resetFollow()` したら追う）。
- **和風ロックの超絶技巧オリジナル曲**（千本桜のような雰囲気。既存曲の旋律は使わない）を作って「曲を選ぶ」に登録。→ 「祭囃子オーバードライブ」（Fable 5.1 deep、38 小節、A マイナー、154 BPM、1513 音、ペダル 112 区間、約 55 分）。`public/presets/matsuri-overdrive.json` → `public/piano/repertoire/matsuri-overdrive.vesper.json` + `index.json`（作曲者 Claude Fable 5.1、オリジナル）。曲を選ぶの見出しは「同梱の曲（著作権切れの名曲 … と このアプリで作ったオリジナル曲）」に変更。

### 新曲で見つかった手の問題と直し（scene.js）
1. リハーサルの「始まりの 60 ms 後」の判定は、60 ms より短い音（32 分の駆け上がり、27 ms）では指が次の鍵へ移っていてよいので**見ない**（始まりだけ見る）。
2. 同じ和音を 16 分で連打しながら形を変える所で、「楽譜上もう終わっている古い音（90 ms 保持の名残）」と「これから始まる音」が同じ指を取り合い、振り直しで指が付け替わっては戻る「ちらつき」→ 古い音を手放す（振り直さない）。
3. それでも取り合うなら相手は「今鳴っている音」と「先回り（100 ms 先）の次の和音」→ 先回りを後回しにして今の指を守る（振り直しで 3 音が小指に集まっていた）。
- 直したあと **6 曲すべてリハーサル ずれ 0**（The Entertainer 5241 / Für Elise 1807 / Clair de Lune 2919 / 新練習曲 1 番 1658 / 革命 4127 / 祭囃子オーバードライブ 2689 回）。新曲の再生 903 音で音抜け 0・遅れ 0。

### まだやっていないこと
- **公開（push）はしていない**（公開に影響する push は事前に一言、の約束）。ローカルの main にコミットだけ。
- Für Elise / Clair de Lune の Fable 解釈（各 30〜50 分）。
- 作曲した曲はこのブラウザの「作った曲」にも 1 つ残っている（IndexedDB。消しても同梱版には影響なし）。

## 11. 公開（2026-09-09 夕方）— https://atelierfactory.jp/device/jukebox/

- さとるん要望：曲を選ぶの「弾く」→「選択」（選ぶだけ。▶ を押してから鳴る）。MIDI 読み込みも自動再生しない。push 済み（a814650）。
- **公開 URL は https://atelierfactory.jp/device/jukebox/ （開くと piano/ へ移る）。** 仕組み：会社サイト（Amplify）の custom_rule で `/device/jukebox/<*>` を GitHub Pages（`https://atelierfactory.github.io/bluegarage-studio/<*>`）へ 200 rewrite（エジンバラ城と同じ方式）。infra `apps/site/hosting.tf` に 3 行（末尾 / 補いの 301 ×2 と 200 rewrite）。terraform apply はさとるんが実行（エージェントの apply は安全装置で止まる）。infra はローカルコミット b34181a、**未 push**（push はさとるん）。
- したがって **更新は music_app を `git push origin main` するだけ**（GitHub Pages が 1〜2 分で更新 → atelierfactory.jp 側も同時に変わる）。会社サイトの deploy.sh は不要。deploy.sh の jukebox 同梱は止めてある（rule と二重になるため）。
- 確認済み：/device/jukebox → 301 → /device/jukebox/ → piano/ へ。piano.js / repertoire/index.json / samples/piano/index.json が 200。CSP（会社サイトの `**` パターン）の中でそのまま動く。ブラウザで「祭囃子オーバードライブ」を選択 → ▶ で 327 音・音抜け 0。コンソールの 404 は /api/config と config.json（静的サイトでは無いのが正常）。
- 公開版で動くもの：既存の曲 6 曲、お題なしの即興（既定の手札）。**作曲・お題つき即興は AWS 中継（apps/jukebox、未 apply）ができるまで動かない**。中継ができたら `config.json` を GitHub Pages 側の public/ に置く（proxyUrl）＋会社サイトの CSP `connect-src` に中継の住所を足す（`/device/jukebox/**` のパターンで）。

## 12. HTML 1 枚の配布版（2026-09-09 夕方・さとるん要望「このhtmlだけ渡せば大丈夫」）
- `tools/build-single.mjs <perf.json> <出力.html> [タイトル]` が、piano/index.html + CSS + フォント(data:) + Tone.js + esbuild で 1 本にした JS（three.js 込み）+ 曲 + その曲で使う音源だけ（base64）を 1 ファイルにする。`fetch()` を差し替えて埋め込みを返すので file:// で開ける。
- 革命版: `~/Desktop/VESPER_PIANO_革命.html`（42.4 MB、音源 215 ファイル 24.7 MB、JS 0.7 MB）。手元の http 経由で動作確認済み（読み込み・▶・鍵の沈み）。
- 事故: `String.replace` の置き換え文字列は `$'` `$&` を特別扱いする → JS が壊れて `Unexpected token 'void'`。必ず関数で渡す（直した）。inline `<script>` の中の `</script` はエスケープ。
- 配布版でできないこと: 作曲・お題つき即興（API 無し）。「作った曲」は開いたブラウザごとの保存。

## 13. 公開版の「作曲」を動かす中継（2026-09-09 夜・さとるん指摘「ブロックビルダーは API キーで動いている。なぜこれだけ使えない」）
- 私の間違い: AWS の terraform (apps/jukebox、未 apply) だけ見て「中継が無いから動かない」と答えた。実際はブロックビルダーの裏方が **Lightsail サーバー (block.atelierfactory.jp、鍵は /etc/bb.env)** で動いていて、そこに乗せればよかった。
- 作ったもの: `relay/server.mjs`（依存なしの Node 中継。/health と /v1/messages。Origin 許可・IP 1 分 20 回・1 日 曲 20 / 生成 300 / その他 3000・日本時間 0 時切替・数は /var/lib/vesper/counters.json）、`relay/vesper-relay.service`（EnvironmentFile=/etc/bb.env で鍵を読む。私は鍵に触らない）、`relay/deploy.sh`（scp → systemd → Caddy に `handle_path /jukebox/*` → 外から /health 確認）。手元の煙テスト済み（Origin 拒否・回数上限・上流へ流す）。
- 画面側: GitHub Pages の workflow が repo 変数 `PROXY_URL` から `public/config.json` を書く（既存の仕組み）。`PROXY_URL=https://block.atelierfactory.jp/jukebox`。会社サイトの CSP は connect-src に block.atelierfactory.jp が既にあるので変更不要。
- 実行はさとるん（エージェントの Bash は本番サーバーへの ssh/sudo と gh variable set を安全装置が止める）: `./relay/deploy.sh` → `gh variable set PROXY_URL ...` → `gh workflow run "Deploy to GitHub Pages"`。
- 注意: VESPER PIANO の画面には ⚙（合言葉欄）が無いので、合言葉は使わない（Origin と回数で守る）。作曲は Fable 5.1 固定なので 1 曲 2〜5 ドル級 → 1 日 20 曲。料金の栓は service の Environment で `FORCE_MODEL` / `EFFORT` / `MAX_TOKENS_CAP` を足せば効く。
- 2026-09-10 追記（さとるん要望「誰かが作曲中なら他の人は作曲できないように」・鍵は 1 本を使い回す。上限は鍵の提供元が付けている）: 中継に「作曲の席は 1 つ」を入れた。作曲系の呼び出し（blueprint / piano / polish / revise / track / interpret）は、ブラウザごとの番号 `x-bluegarage-session`（claude.js の sessionId、sessionStorage の乱数）で席を取る。通信中か最後の通信から 3 分以内は席が埋まったまま（`VESPER_BUSY_IDLE_SEC`）、念のため 90 分で必ず空く（`VESPER_BUSY_MAX_MIN`）。埋まっていれば 409 `busy_error`（数に入れない）。`/health` の `seat` に {busy, minutes}。ブラウザ側は「作曲」を押した瞬間に `relaySeat()` で席を見て、埋まっていれば曲を作り始めずに知らせる（piano.js）。即興の手札作り（jam）と小さな呼び出しは席に関係なく通る。手元の煙テスト済み（A が作曲中 → B は 409、A の続きは通る、空いてから B が取れると今度は A が 409）。
- 2026-09-10 公開版の作曲が動くようになった（確認済み）: さとるんが `relay/deploy.sh`・`gh variable set PROXY_URL`・Pages 再実行を実行。公開ページ (atelierfactory.jp/device/jukebox/piano/) から transport "remote" で中継を通り Claude が返事（OK）。席が埋まっている間に「作曲」を押すと曲を作り始めずに「今、別の人が作曲中です」と出る。事故 2 つ: (1) piano/ からは `config.json` を `../config.json`（claude.js の場所基準）で探す必要があった、(2) 中継の CORS `Access-Control-Allow-Headers` に `x-bluegarage-session` を書き忘れ → "Failed to fetch"。新しい見出しを足したら必ず一覧にも足す。今日の曲数カウントは確認のため 3 消費。

## 14. 日本で有名なクラシック 5 曲を Fable の演奏解釈つきで追加（2026-09-10・さとるん要望）
- 選び方: 日本で有名 + Mutopia に「Public Domain」と明記された打ち込みがある曲。ノクターン Op.9-2 と月光ソナタは Mutopia に CC 版しか無く見送り。
- 追加: トルコ行進曲 (Mozart K.331 III, Mutopia id 108, 128 小節 2/4→4/4 換算 64)、幻想即興曲 (Chopin Op.66, id 1693, 138 小節)、子犬のワルツ (Chopin Op.64-1, id 483, 140 小節 3/4)、ジムノペディ第 1 番 (Satie, id 37, 47 小節)、悲愴ソナタ第 2 楽章 (Beethoven Op.13, id 295, 73 小節 2/4→37)。.mid と .ly（KV331 と Op.64-1 は複数ファイルなので -lys.zip）を `public/piano/repertoire/` に置き、index.json に出典・打ち込み者・ライセンスを記録。
- トルコ行進曲の .ly には速さの指定が無く MIDI が 60 になっていたので、解釈前に `state.song.tempo = 126` にした（perf に保存済み）。
- 解釈: 3 タブ同時 (`window.vesperInterpret` → `/api/save-preset` → `tools/adopt-perf.mjs`)。所要: トルコ 18 分 / ジムノペディ 5 分 / 幻想即興曲 36 分 / 子犬 約 40 分 / 悲愴 約 50 分。
- **事故と対処**: Fable が公有の楽譜の演奏指示を「拒否」する誤判定が、子犬のワルツと悲愴で区間ごとに何度も起きた（stop_reason refusal）。指示文を素っ気なくすると通ることが多い。通らない区間は Opus 5 で補った（子犬 1 区間、悲愴 2 区間。メモの先頭にモデル名）。**Opus 5 / Sonnet 5 は 32k の出力枠を「考える分」で使い切って max_tokens で落ちる** → Opus は maxTokens 64000 で通った。Sonnet は使わない方がよい。
- piano.js `interpretSong` に、区間ごと最大 3 回のやり直し（指示文に「公有の楽譜の演奏表現の指定」の一文を足す）、`startBar` / `keep` での途中再開、`song.interpretation.partial` の途中経過を入れた（コミット e0f0378）。今回の再開はタブ内の JS で同じ手順を組んで走らせた（ページを読み直すと途中結果が消えるため）。
- 6 曲すべて（新 5 曲 + 既存）リハーサル ずれ 0: トルコ 2992 / 幻想 5996 / 子犬 2727 / ジムノペディ 564 / 悲愴 3247 判定。
- 音量: ジムノペディは v25〜56、悲愴は v24〜90 と静かな解釈（指示どおり）。他の曲より小さく聞こえる。気になれば VOL で。
- 今の「曲を選ぶ」: 11 曲（The Entertainer / Für Elise / Clair de Lune / 新練習曲 1 / 革命 / 祭囃子 / トルコ / 幻想即興曲 / 子犬 / ジムノペディ / 悲愴）。Für Elise・Clair de Lune・新練習曲は解釈なし（MIDI + 自動運指）のまま。

## 15. VESPER BAND（2026-09-11・第6回への対応、6曲を保持、公開済み fccf717 → https://atelierfactory.jp/device/jukebox/band/ ）

右手37鍵＋8つまみ、右足13鍵、左手1本のスティック、左足キック。第6回は連続したつまみ操作の接触、作曲者と候補の検査、手の甲を修正した。**同梱6曲の音・音色・つまみ時刻・曲目・candidateは一切変更していない。LIMITS、critic、Claudeの作曲処理、ピアノの共有コードも変更なし**。開始時の14範囲の照合値は `astra/r6-protected.json`。

**Claudeの第5回実ブラウザ確認**：見えるブラウザでは撮影readyまで4〜6秒。ARは手・つまみ・表示窓を覆わず、停止写真にも比較図、表示窓に音色名と値。Astra3曲とピアノ2621音のrehearseはmisses 0、ピアノ再生・停止は正常。page-check 35、共有音声のregression 40も合格。Fable候補3曲ではつまみのmissが5 / 10 / 6あり、これが今回の修正対象。

**撮影の現状**：Chromiumの単純な `--screenshot` は準備前に写して黒くなる。Claudeが作った `astra/shot.mjs` はDevToolsでreadyを待って保存する。SwiftShaderでは1枚約105秒、ページ内のms約45秒という実測。前版15章の「既存の--screenshotでそのまま撮れる」という説明は訂正する。今回は撮影処理を変更しておらず、**保存まで30秒以内は未達のまま**。ブラウザは使っていないため、第6回の実画面と時間はClaudeの確認が必要。

### 15.1 保持したAstra3曲とFable候補3曲

全曲 `{ song }` の `.band.json`。Astraの3曲は曲目と各曲内に `composer: "GPT-6 Astra"`、このアプリのためのオリジナルであることを示す `license` を記録。既存曲の音符や外部素材を取り込んでいない。第4回に旧3ファイル名を継続して演奏内容を置換し、旧 `basalt-relay.band.json` は曲目から外してファイルも削除した。第6回では曲ファイルを変更していない。

`tools/make-band-repertoire.mjs` は検査と書き出しのみ。作曲は `tools/scores/glass-current.mjs`、`copper-hinge.mjs`、`porcelain-tide.mjs` にそれぞれ独立して記述。共有する `score.mjs` は音符・和音の記譜、曲とトラックの作成だけで、共通の曲構成・リズム・旋律・和音表・つまみ時刻は持たない。

| 曲 / ファイル | BPM / 拍子 / 小節 / 秒 | 右手 / 足鍵盤 / 左手 / キック | 右手平均/小節 | 音域 | 最短の音 | クラッシュ | つまみ | 足鍵盤とキックの同時率 |
|---|---|---|---|---|---|---|---|---|
| 硝子の環流 — 零時の加速 / glass-current.band.json | 132 / 4拍子 / 64 / 116.364 | 839 / 237 / 482 / 231 | 13.11 | 48–83 | .075拍 | 48 | 16 | 0.4% |
| 銅の蝶番 — 影の返答 / copper-hinge.band.json | 100 / 4拍子 / 52 / 124.800 | 705 / 248 / 391 / 157 | 13.56 | 48–83 | .14拍 | 47 | 14 | 16.5% |
| 白磁の螺旋 / porcelain-tide.band.json | 108 / 3拍子 / 72 / 120.000 | 1047 / 214 / 400 / 135 | 14.54 | 48–84 | .08拍 | 48 | 15 | 7.5% |

合計 **5,086音、クラッシュ143打、つまみ45操作**。3曲とも形式エラー・analyzeBandの修正・issues・検査前後の音符/つまみ変更は0。全曲に16分の駆け上がり・駆け下りがある。最短の音はつまみへ移る直前の短い和音であり、最短の発音間隔と区別して検査に出す。短く鍵を押した後の音の余韻は音色側で作り、鍵から離れて0.45秒以上たってからつまみを回す。片手のハイハットとスネアは同時に叩かない。

**聴き所（拍は0始まり）**：

- **硝子の環流 — 零時の加速**：四つ打ちのキックに、ほぼ重ならない裏拍のベース。「レ・ファ・ミ・ラ」の短い問いが主旋律。16拍から提示、64拍で4音の和音へ拡大。112拍から6小節だけ谷へ入り、136拍では右手が空けた所を右足が同じ動機で返す。192〜196拍は全員の新しい発音を止める。**196拍で全体をD minorからE minorへ上げ、クラッシュと主旋律が戻る**。太いsupersawの `GLASS / ZERO HOUR`。
- **銅の蝶番 — 影の返答**：三連の長短で跳ね、最初は1小節に1回の重いスネア。「ド・ソ・シ♭・ミ♭」という下がる問い。56拍からは右足が答え、104拍で3小節だけ影へ引く。116拍からの独白は9小節あり、148拍で解決を1小節引き延ばす。**168拍からスネアを倍の頻度にし、主旋律も16分の刻みへ変える**。速さの数値を変えずに走り出す。短い矩形波の輪郭を残す `COPPER / AFTERIMAGE`。
- **白磁の螺旋**：3拍子。「ミ・ファ♯・シ」を長い歌へ育て、16分の分散和音と交代させる。60拍からは5小節の階段を登り、75拍で最初の山。111拍からは右足が歌を引き継ぎ、響きを大きくする。**165拍からは旋律の大きな和音が2拍おきに進み、3拍子の小節線をまたぐ**。その隙間を細かな音が流れ、最後はG majorに落ち着く。鐘の輪郭を加えた `PORCELAIN / HELIX`。

「銅の蝶番」「白磁の螺旋」は、LFO DEPTHの操作に対して揺れの接続先が空だった初期設定を修正し、実際にフィルターの明るさへ結びつけた。`band-check` も、揺れの操作があるのに接続先がない同梱曲をエラーにする。

3曲の `moments` にも拍と説明を記録した。山の位置・谷の長さ・最後の仕掛け・足鍵盤・太鼓・つまみの台本はそれぞれ異なる。音の良さや高揚感は数の検査だけでは保証できず、試聴で判断する。

**Claudeが画面で作曲して追加した試聴候補（第6回では無変更）**：

| 曲 / ファイル | BPM / 小節 / 秒 | 右手 / 足 / 左手 / キック | クラッシュ / つまみ |
|---|---|---|---|
| 疾風・電脳桜 / hayate-cyber-sakura.band.json | 150 / 38 / 60.800 | 427 / 174 / 244 / 143 | 25 / 15 |
| Neon Circuit / neon-circuit.band.json | 118 / 36 / 73.220 | 336 / 185 / 302 / 156 | 20 / 20 |
| 3+3+2 オーバードライブ / overdrive-332.band.json | 150 / 36 / 57.600 | 344 / 174 / 199 / 141 | 43 / 14 |

3候補のcomposerは `Claude Fable 5.1`、licenseはオリジナルの記載、`candidate: true`。残す曲はさとるんが耳で決める。**合計6曲・7,911音・94つまみ操作**。短さや音数を揃えるための作り替えは行わない。

`tools/band-check.mjs` は両作曲者を認め、candidateがあればbooleanを検査する。6曲とも形式・analyzeBandのfixes/issues・検査前後のデータ変更は0。候補については90〜180秒・クラッシュ30以上・右手平均12以上・足とキックの同時率40%以下などの作風の目安を**advisories（参考情報）**として出す。身体・形式の検査を緩めたわけではない。候補を最終採用するときの音楽上の判断を検査で代行しない。

`tools/make-band-repertoire.mjs` は自分が作る3曲の曲目だけを更新し、それ以外の項目・候補ファイルは保持する。自分が担当する名前でもcandidateに指定されていたら、上書き前に拒否する。今回は実ファイルの生成を実行せず、仮のファイル保存先で候補保護を検査した。

### 15.2 第6回のつまみと手の修正

- **別のつまみに手が残る**：以前は先に見つかった操作の「手を戻す時間」を優先し、次の操作が始まっても前のつまみに接触していた。指と内部の目標点のdistが小さくても、譜面に指定されたつまみのsurfaceGapは最大約0.40 mになる。新しい `knob-motion.js` は音の時刻から現在の操作を最優先で選ぶ。
- **連続操作**：近い操作の間は鍵盤へ戻らず、前の操作の終了から次の開始までを使って直接移動。掌を滑らかに補間して少し持ち上げ、回転も補間する。両指先を別々に直線補間すると途中で寄りすぎるため、同じ手の形を回して運ぶ。
- **表面への接触**：つまみの実際の円すい状の半径と指腹の半径から目標を求める。掌の基本位置を指の付け根に合わせて下げ・寄せた。2本分の誤差の和が小さいだけで止めず、各指の最大誤差で解く。符号の違う誤差が打ち消し合う早期終了を防ぐ。
- **指の計算**：実際の2節の長さと、指腹が節の軸から下へずれた分まで含めて角度を直接求める。関節の範囲外や届かない初期位置だけ従来の数値計算へ戻す。指先を偽の接触点へ付け替えていない。
- **曲に依存しない追加検査**：全8つまみ・値0〜1の両方向と、全64順序の組み合わせを0 / .02 / .15 / .60秒の間隔で検査。criticが修正もissuesも出さない272例に対して4,960点の接触・移動時の指先間隔を確認した。特定の曲名・作曲者を動作の条件にしていない。
- **検査時刻のずれ**：以前のrehearseは操作の98%地点を次のフレームまで繰り上げて測っていた。短い操作間隔では、その時すでに次のつまみへ移動している。つまみだけは指定した時刻で姿勢を求めて検査し、通常の固定刻みの更新はその後に行う。鍵・足の沈みやスティックの戻りは従来の刻みのまま。表面の許容差2 mmなどは緩めていない。
- **使わない指**：Fableの極端なつまみ値では人差し指と中指の途中が近づく場面もあった。中指以降を掌側へ揃えて曲げ、指の棒・関節・指腹・斜めの指先部品まで検査する。
- **手の甲**：大きな白い4枚の板を廃し、細い骨格・銀の橋・小さな2分割の外板・軸受け・留め具に変更。親指の大きい白い覆いも小さい銀の支持部にした。BANDの実体だけを変更し、共有のピアノの指と骨格は保持。

Fable3曲にも、Astra3曲にも、音符・音色・つまみ時刻の機械修正は加えていない。LIMITS/criticへの新制限の追加もしていない。

### 15.3 Claudeが直した作曲機能（今回の編集対象外）

1. **APIが数値などの制約を拒否**：`400: output_config.format.schema: For 'number' type, properties maximum, minimum are not supported` が発生。Claudeが追加した `public/js/api-schema.js` の `apiSchema()` を、`public/js/claude.js` の `streamMessage` が送信直前に使う。`minimum` / `maximum` / `multipleOf` / 文字列長などの未対応制約を送信用の複製から外す。元のSchemaは残るため手元の検査では範囲を使える。
2. **音色2つの文法が大きすぎる**：`400: The compiled grammar is too large, which would cause performance issues.` が発生。各89項目のSYNTH2パッチを2つ含む `BAND_SOUNDS_SCHEMA` はstructured outputsに渡さず、`SYSTEM_BAND_SOUNDS` の文章中で形を指定しJSONを受け取る。compose側でkeys/pedalを確かめ、`normalizePatch2` で値と既定値を整える。

3. **最後の全体検査でfixesだけでも曲を捨てていた**：Claudeがcomposeを変更。issuesがあれば停止する。fixesだけなら、検査が整えたsynth / pedal / drums / kick / knobsを曲に書き戻し、全体を再検査してfixes・issuesの両方が0のときだけ完成・保存する。完成の文につなぎ目の直しを添える。Neon Circuitはこの問題で一度捨てられ、作りかけから同じ手順で回収され、足鍵盤は187→185音になった。これはClaudeの回収時の変更で、第6回Astraによる変更ではない。

上記3点はClaudeによる修正。第6回のAstraは作曲部分・prompts.js・claude.js・api-schema.jsを変更していない。実際のAPI通信も行っていない。`band-page-check` に、本物のcriticとcomposeを使う境界の試験を追加した。2区切りの境界で足鍵盤の3音を2音へ直して完成し、説明文が付くこと、5区切りの4境界でissuesが残った場合には再生せず元の完成曲へ戻すことを確認。

### 15.4 維持している機能・過去の修正

- 曲の検査後に入れ替え、古い音源を停止・解放。不正JSONで元の曲を壊さず、読込競合は最後を採用。保存はBAND専用で、ピアノ/STUDIOと分離。インポートは8 MBまで、書き出しURLを解放する。
- 途中再生・停止・再開・繰り返し・テンポ変更のつまみ初期値と途中値、残響の復元。準備中の停止・曲変更で古い要求を無効化。曲替えで前の音色や音を残さない。
- `critic.js` / `model.js` は鍵の重なり、同じ指の重複、手の幅、足の移動、つまみへの移動時間、曲外データを検査。`LIMITS` は元のまま。
- 作曲の重複開始防止、中止、失敗時の元の曲への復帰、完成済み区切りのdraft保存、曲のつなぎ目検査。ClaudeのAPI修正をそのまま維持。
- 大きなブロンズのクラッシュ、削り目・カップ・支柱・減衰する揺れ、スティックの握り、キックの踏み板・ビーター・ばね、黒銀のシンセと足鍵盤、暗い床。黒鍵の材質・表示窓の面・つながった筐体・光るつまみ・KNOBSレーンも維持。
- ドラムのBAND専用補正 `{42:18,49:5}` を維持。前回は同梱OGGを29個復号し、クラッシュの最初400 msの平均がスネア比−1.9〜−0.9 dBであること、必要素材150個の存在を確認した。今回は変更・再測定なし。
- 再生中のARは右手シンセのFX後の `AnalyserNode` の実音。金線が現在、点線が回す前。測定は20回/秒。曲替え・巻き戻し・再開で古い比較を消す。表示窓にも実際の音の波形を描く。
- 停止写真の図は、直前の右手の和音を同じ音・強さ・リズムで変更前と現在の設定に通した試奏の実測。その拍の曲全体の録音ではない。「同じ音で実測 · 点線は変更前」と表示する。
- 第6回も `public/piano/scene.js`、共有 `audio.js` / `state.js` / `synth2.js` / `synthcore.js` / workletを変更していない。workletの再生成が必要な変更はしていない。

### 15.5 第6回のファイル・検査

| ファイル | 変更 |
|---|---|
| `public/band/knob-motion.js`（新規） | 音の時計に基づく操作の選択、前後の移動区間 |
| `public/band/scene.js` | 現在のつまみ優先、直接移動、実表面への接触、指の直接解法と誤差判定、掌と未使用指の姿勢、つまみの正確な検査時刻 |
| `public/band/hardware.js` | 手の甲を小さい外板と骨格・支持部へ |
| `tools/band-check.mjs` | 2作曲者・候補・6曲以上へ対応、候補の作風の目安は参考表示 |
| `tools/make-band-repertoire.mjs` | 担当外の曲目と候補ファイルを保護 |
| `tools/band-page-check.mjs` | 修正可能なつなぎ目の完成とissuesによる停止を本物の処理で検査 |
| `tools/band-hand-check.mjs` | 特定ファイルを選べる引数を追加（省略時は全6曲） |
| `tools/band-visual-check.mjs` | 接触を別途全数検査済みの場合の `--layout-only` を追加 |
| `tools/band-knob-check.mjs`（新規） | 全8つまみ・全順序・両端の値・短い間隔の検査 |
| `tools/band-repertoire-check.mjs`（新規） | 本物の生成道具を仮の保存先で動かし、候補を消さないことを検査 |
| `astra/r6-*.json` / `r6-*.txt` | 照合値・検査記録。途中失敗を含む記録とfinalを区別 |
| `astra/shots/geometry-knob.png` | 実形状の参考画像を更新。WebGLの材質・文字・ARの再現ではない |
| `HANDOFF1.md` | 当15章。1〜14章は保持 |

```bash
/Users/satorun/.local/node/bin/node tools/band-check.mjs
/Users/satorun/.local/node/bin/node --experimental-loader ./tools/band-node-loader.mjs tools/band-rehearse.mjs
/Users/satorun/.local/node/bin/node --experimental-loader ./tools/band-node-loader.mjs tools/band-knob-check.mjs
/Users/satorun/.local/node/bin/node --experimental-loader ./tools/band-node-loader.mjs tools/band-hand-check.mjs
/Users/satorun/.local/node/bin/node --experimental-loader ./tools/band-node-loader.mjs tools/band-visual-check.mjs --layout-only
/Users/satorun/.local/node/bin/node --experimental-vm-modules --experimental-loader ./tools/band-node-loader.mjs tools/band-page-check.mjs
/Users/satorun/.local/node/bin/node --experimental-vm-modules tools/band-repertoire-check.mjs
```

- **band-check**：6曲 / 7,911音 / 94操作。形式・fixes・issues・データ変更はすべて0。候補の参考情報は疾風4、Neon4、3+3+2は3項目。結果は `astra/r6-band-check.json`。
- **band-rehearse**：6曲すべてmisses 0。つまみは硝子48 / 銅42 / 白磁45 / 疾風45 / Neon60 / 3+3+2は42回、合計282時点で接触を検査。ほかに7,911音とスティックの握り10,090点を検査。最終結果 `astra/r6-rehearse-final.txt`。
- **band-knob-check**：272例 / 4,960点、失敗0。最大表面隙間1.73 mm、最大の目標位置との差1.96 mm。`astra/r6-knob-check-final.txt`。
- **band-hand-check**：6曲の94操作を各41時点、合計3,854時点・1,040,580組で失敗0。指同士の最小すき間1.65 mm、最大の目標位置との差0.343 mm。最終結果 `astra/r6-hand-check-final.txt`。
- **band-page-check**：45項目合格（6曲になった分と、つなぎ目の7項目を追加）。本物のband.js / critic / THREE、DOM・音源・APIは代用。`astra/r6-page-check.txt`。
- **band-repertoire-check**：候補3項目が完全一致し、候補ファイルに書き込まないこと、担当名がcandidateなら書込前に拒否することを確認。実際の曲ファイルは生成していない。
- **band-visual-check --layout-only**：223項目。接触は上記の別の全数検査で確認し、ここではARの遮蔽・大小画面・2枚・表示窓・黒鍵・クラッシュ等を確認。最終結果 `astra/r6-visual-check-final.txt`。
- 編集したJS全10ファイルは指定Nodeで `--check`。曲6ファイル・index・LIMITS/prompts・critic・作曲部分・Claude APIの2ファイル・ピアノ・文書前半の14範囲を開始時と照合。最終結果 `astra/r6-verification.json`。共有音声を変更していないためworklet再生成なし。

前回までの確認も維持：Claudeの実ブラウザでピアノ2621音misses 0と再生・停止、共有音声 `band-regression` 40項目。実ブラウザとNodeの検査を混同しない。

### 15.6 Claudeのブラウザ確認と撮影

基点 `http://localhost:5173/band/`。曲を読み、全6曲を確認できる：

```js
await window.bandReady;
for (const item of await (await fetch('repertoire/index.json')).json()) {
  await bandLoad(item.file);
  const r=bandRehearse();
  console.log(item.file,r.counts,r.misses.length,r.misses.slice(0,10));
}
```

撮影はreadyを待つ。**単純なChrome --screenshotでは黒くなるため、Claudeの `astra/shot.mjs` またはPlaywrightの待機を使う**。Astraはこのブラウザ用道具を実行していない。

```bash
/Users/satorun/.local/node/bin/node astra/shot.mjs astra/shots/r6-hayate.png 'http://localhost:5173/band/?song=hayate-cyber-sakura.band.json&shot=knob&beat=109.2'
```

```js
await bandLoad('neon-circuit.band.json');
await bandShot({view:'knob',beat:97.55});
window.bandShotStatus; // state === 'ready'
// Playwright: await page.waitForFunction(() => window.bandShotStatus?.state === 'ready')
```

見る所：

1. 疾風の **108.4→109.2→110.6拍**、最後の **149.9→150.85拍**。古いつまみに残らず、次へ直接移動して表面をつまむか。98拍と109.15拍付近では人差し指と中指が突き抜けないか。
2. Neonの **96.9→97.55→98.2拍**、3+3+2の **76.4→77.3拍** と **85.6拍**。普通の再生と、拍を指定した停止撮影の両方で接触を確認。
3. 手の甲は `glass-current.band.json&shot=knob&beat=185.94`。大きな4枚板がなく、小さい外板・骨格・支持部が一体に見えるか。新しい折り畳み姿勢、ARと手の重なり、表示窓の読みやすさも確認。
4. 1600×900と幅390の通常2画面。`bandShotEnd()` / Escapeで戻し、再生・停止・途中移動・曲替え。ピアノの指先と再生・停止も確認する。
5. 曲とcandidateは無変更。作曲の実通信はClaude修正版のまま。つなぎ目の修正がある完成では、その旨が画面の文に付くことを実通信でも確認できる。

`bandShotStatus.ms` はページ内の測定から描画呼び出しまでであり、ページ読込・GPU完了・画像保存までは含まない。速度の判断には保存までの実時間を使う。

### 15.7 残り

- 第6回の実WebGL画面、手の甲の質感、素早い連続つまみの見え方は未確認。接触の数値検査と芸術性の判断は別。
- SwiftShader撮影約105秒、単純な--screenshotでは黒い問題は前回の実測として残る。ready待機で写真は撮れるが、30秒以内は達成したとしない。
- 候補3曲を含む6曲の最終採否はさとるんの試聴待ち。今回は曲を変更していない。
- 以前からの未実装：ピッチ/モジュレーションホイールの操作、作曲途中draftからの自動再開、BAND専用WAV書き出し。MIDIは音符、音色・つまみ・ドラム補正は `.band.json` で保存。
- 公開・commit・Git変更・外部通信・素材取得・依存追加は行っていない。JS変更時は必ず指定の `node --check`、synthcore/worklet変更時はbundleを再生成する。

### 15.8 公開と会社サイトの CSP（2026-09-11・Claude）

さとるん「公開したいです！！」（6 曲の採否の指定は無し → 6 曲とも入れて公開、外したい曲は後で言ってもらう）。

- **公開前に見つけた問題**：会社サイト（`https://atelierfactory.jp/device/jukebox/`）の CSP は `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com`（blob: 無し）。自作シンセの AudioWorklet は Tone.js → standardized-audio-context が中身を必ず blob: に包んで `addModule` するので、会社サイトでは "Loading the script 'blob:…' violates … script-src" → "Unable to load a worklet's module" で**シンセが鳴らず再生が始まらない**。GitHub Pages（`atelierfactory.github.io/bluegarage-studio/`）には CSP が無いので鳴る。ピアノはこの部品を使わないので影響なし。
- **確かめ方**：`astra/csp-proxy.mjs`（手元の 5173 の前に立ち、会社サイトと同じ CSP を付けて返す。`.claude/launch.json` の `csp-test` = 5190）で再現。`csp-test-blob`（5191、script-src に blob: を足した案）では再生が進み、エラー 0。
- **直し方**：infra `apps/site/hosting.tf` に、`/rf/**` と同じ形で `/device/jukebox/**` だけ `'wasm-unsafe-eval'` → `'wasm-unsafe-eval' blob:` に置き換えた CSP のパターンを足す。script-src には元から 'unsafe-inline' があるので守りはほぼ変わらない。反映は `./headers_push.sh` → `./deploy.sh`（見出しは次の deploy で配信に反映）。
- **会社サイトの CSP を変えるのはさとるんの操作**（Claude の hosting.tf 編集は安全装置で止まった。会社サイトのセキュリティ設定なので、すり抜けずにさとるんに依頼）。`deploy.sh` は会社サイト本体と 3D 作品（`works.sh`）をまとめて配り直す。`works.sh` には未コミットの変更がある（中身は Claude からは見られなかった）。
- 中継（relay）は Origin が atelierfactory.jp だけなので、「BAND だけ github.io で開く」逃げ道は作曲が 403 になり使えない。
- 公開に入れないもの：`astra/`（Astra とのやりとり・写真・確認用の道具）、`public/presets/band-fable-*.json`（同梱曲と同じ中身の重複）、`.claude/launch.json` の確認用の追加。
- **公開した（2026-09-11）**：さとるんが `astra/csp-fix.py`（hosting.tf の 3 か所だけを書き換える。写しで試験済み）→ `./headers_push.sh` → `./deploy.sh` を実行。Claude が見出しを確認：`/device/jukebox/piano/` と `/device/jukebox/band/` の script-src に `blob:` あり、トップ `/` と `/rf/robot_fighter/` は元のまま。その後 Claude がコミット `fccf717` を push（fetch して origin に先行コミットが無いことを確認してから）。公開 URL **https://atelierfactory.jp/device/jukebox/band/** 。band/・曲目・worklet bundle・piano が 200、曲目は 6 曲、ピアノに BAND ボタン、主要 8 ファイル（band.js / scene.js / ar.js / bundle / claude.js / api-schema.js / prompts.js / index.json）が fccf717 と同じ中身。
- 未確認：会社サイトの本物のページでシンセが鳴ること（Claude の内蔵ブラウザは atelierfactory.jp へ移動できず、`gh run watch` も安全装置で止まったので、公開ページの取得で確認した）。同じ CSP を付けた手元の再現では鳴る。さとるんの耳での確認待ち。


## 16. ピアノの手・カメラ・音量（2026-09-11、Astra、未公開）

以下は1回目の記録。写真を受けた2回目の仕上げと現在の合格判定は17章を参照。

実装・検査方法・11曲の表・ブラウザで残る確認は [docs/PIANO_FINISH.md](docs/PIANO_FINISH.md)。同梱MIDI・演奏JSON・index、音符の強弱・長さ・ペダルは無変更。`.git` と公開操作も未実施。

- 自動運指は曲全体の手の位置と、以前その鍵を弾いた指を覚える方式へ。付け替えはエリーゼ356→11、月の光628→123（表示127）、新練習曲495→6。音の途中の指の変更は全曲0。
- 手は曲の秒数から位置を求め、距離に応じて先回りする。実際の骨と指腹を使う直接計算へ変更。速度上限3.0 m/s。`tools/piano-motion-check.mjs` が発音直前・全音の開始・保持中・60/30/20/12 FPS・移動中の速度を検査する。`--experimental-loader ./tools/band-node-loader.mjs` が必要。
- **10曲合格、祭囃子の144拍目のMIDI 59だけ未達**。直前の143.9333拍に右手で93を弾き、約26ms後に59へ戻るデータ。今回の経路では約18.5cm、必要最高速度約9.16 m/s。上限を守ると約45ms不足する。検査はこの1音を除外せず終了コード1を返す。全曲合格にはしていない。数値の正本は `astra/piano-motion-final.json`。
- カメラは主役の手・跳び先・両手の距離・和音・ペダルに対応。「自動/左手/右手/両手」のボタン、手動操作による自動停止を追加。`window.pianoLoad(file)`、`pianoReady`、`pianoShot({view,beat})`、`pianoShotStatus`、`pianoShotEnd()`、`?song=...&shot=...&beat=...`、`vesperStage.setFrameRate(20)`（0で解除）が使える。
- ピアノ専用のベロシティ追従0.35と、曲を開いた時に決める一定の音量補正を追加。補正はバスコンプ後。BAND/STUDIOの指定なしの経路は従来どおり。エンターテイナーの中央値は旧実測−30.5→予想−21.0 dB。全曲の予想は `astra/piano-levels.json`。実測LUFSではない。WAVも同じ補正を通り、最後は従来の−14 LUFS目標で整える。
- ブラウザと実音の確認は未実施。古い3曲への強弱・ペダルの演奏解釈も未追加。祭囃子の1音、実画面の遮りや動き、実音とWAVの音量が残る確認対象。

## 17. ピアノの手の造形・遮らないカメラ・祭囃子（2026-09-11、Astra、2回目、未公開）

詳細と再撮影コマンドは [docs/PIANO_FINISH_2.md](docs/PIANO_FINISH_2.md)。現在の検証記録は `astra/piano-verification-p2.json`。

- Claudeが1回目の結果をブラウザで再現。エンターテイナーの音量は中央値−21.2 dB、上位10%−17.8 dB、最大−13.3 dBで合格。今回は音量処理を変更していない。
- BANDの手の造形を `public/js/robot-hardware.js` に共有化。PIANOは骨の位置を変えるオプションを使わず、白い甲の板を金属の支え・小さな覆い・関節へ交換。甲の腱の通り道、留めねじ、手首の軸受け、曲面の前腕カバーも追加。32個の骨・節・指先の変換は完全一致、見た目の変更による指先移動0.000 mm。
- 寄りカメラは押す鍵を狙い、実際の部品への光線判定で遮りを避ける。144構図・1280本の光線、革命の移動中37フレームで合格。判定はNodeの3D形状で、今回の変更後のブラウザ写真はまだない。
- **運動検査は11曲すべて・60/30/20/12 FPSで合格、終了コード0。** 祭囃子の144拍MIDI 59だけは、今回許可された「叩かずに手放す」動きへ。直前の93から次の62へ移り、59の鍵は沈めない。音声と曲ファイルはそのまま。この1音を接触成功として数えず、`releases`／`rehearse().released` に記録し、鍵が沈まず指が離れていることを別に検査する。速度上限は3.0 m/sのまま。
- 撮影終了時に元のカメラと全画面状態を復元。同梱曲の連続選択で古い読み込みが上書きする競合も防ぐ。幅390では上下配置。実際のPianoRollを使った読み取り専用・再生・停止・撮影復帰等56項目合格。
- BANDの曲検査6曲、回帰46項目、画面45項目合格。JS構文21ファイル合格。同梱データ19ファイルのSHA-256一致。`.git`・公開操作は未実施。
- 残るのは新しい手の質感・画角・幅390での実表示の確認。WAVの実測も未実施。再撮影用に `astra/shot.mjs --size=390x844 --page ...` を追加した。


## 18. ピアノとバンドの鍵の色・左手の握り（2026-09-11、Astra、3回目、未公開）

詳細と再撮影コマンドは [docs/PIANO_BAND_FINISH_3.md](docs/PIANO_BAND_FINISH_3.md)。検証記録は `astra/verification-p3.json`。今回もブラウザ・ネット・公開操作・同梱曲の書き換えは実施していない。

- 鍵の全面の金色発光を廃止。PIANOの88鍵、BANDのシンセ37鍵・足鍵盤13本とも、元の黒さ・象牙色を保つ。押した印は小口の細い白い表示と、従来の沈み・段差。共通処理は `public/js/key-visual.js`。ピアノロールの金色の点灯は無変更。
- BANDのシンセは、沈んだ白鍵と本体の上板が交わっていた。鍵盤の下の本体・板を12mm下げ、沈んだ鍵の小口が見えるようにした。PIANOの寄りも小口の印が手に隠れにくい角度を選ぶ。
- 左手の甲は元の座標でも上向きだったが、前腕と手が逆向きに折れていた。新しい `public/band/drum-grip.js` は前腕・握り・スティックをつないで肘と手首を逆算する。打面の下側から当てないよう肘の高さも調整。小さな手首の返しを追加。スティックの長さ・握り・先端の移動経路と骨の長さは維持。
- BANDの前腕・手首も、共通の `refinePianoArms` の曲面の覆い・棒・軸受けを使う。PIANOの見た目と指先の座標は今回変更していない。
- `band-grip-check`：6曲・2,018打点、移動中31,399フレームで合格。手首の曲がり最大5.73度、甲は真上から約11.2度以内、先端の経路の変化は丸め後0.0000mm。打面との距離は別で最大約8.26mm（従来の動きのまま）。`key-visual-check` は材質・小口の面積・印への遮りを検査。どちらも `--experimental-loader ./tools/band-node-loader.mjs` が必要。
- 追加の既存 `band-audio-check` は、白磁の螺旋のシンセと足鍵盤の、エフェクト前の平均音量差約6.9dBが基準6dBを超え、終了コード1。12パートの数値異常・音の割れ・曲末の鳴りっぱなしは0。今回変更していない音量と曲を保ち、基準も緩めていない。全検査合格という記録にはしない。
- 残るのはブラウザでの色・反射・動画の自然さ。`pianoShot` / `bandShot` の入口は維持。打点は硝子の環流のハイハット64.5、スネア60、タム60.75/61.75/62.75、クラッシュ64拍。手は `shot=stick`、クラッシュ先端は `shot=crash` で撮れる。

- 最終検証：20コマンド中19本合格、追加の旧音量比較のみ不合格。PIANOの11曲×4コマ数はすべて合格・終了コード0。構文9ファイル合格。以前の記録と同梱26ファイルのSHA-256一致。通常更新のNode計測では平均1.18ms、最大94.84msの一時負荷があり、ブラウザ動画の滑らかさは確認対象。詳細の数値は上記文書に記録。

## 16. VESPER PIANO v5（2026-09-11・Astra 3 回）— 手の動き・カメラ・音量・鍵の光り方・ドラムの握り

さとるんの要望（3 回に分けて届いた）：①「革命の前に追加した曲の指の動きが、ちゃんとついていけてない」②「vesper band と比べてカメラワークが微妙」③「band と比べてだいぶ音が小さい」④「シンセひいてるとき、押された鍵盤が消滅してないですか？ ピアノも黒鍵ひいてるときそこが金色になってしまっている」⑤「ハイハット叩いてる手の向きが変。治すの超大変？」

やり方は VESPER BAND と同じ **Claude Code → codex exec → GPT-6 Astra**（`astra/REQUEST_piano.md`、続きは `astra/msg-p2-round2.md` / `msg-p3-round3.md`）。会話の番号 `01a08f01-d864-7853-b996-79c5a51fc027`、3 回で約 49 ドル。

### Claude が最初に測った事実（Astra に渡した観測）
- 革命より前の 3 曲は `autoFinger` が毎回その場で指を決めるので、**同じ鍵で指が変わる回数**が Für Elise 356/905、Clair de Lune 628/1468、Trois Nouvelles 495/829。ペダルは前 2 曲が 0 区間、強さも一定（62 / 90）。
- 音量（実測・つまみ -4 dB）：ピアノ最大 -21.6 / 中央 -30.5 に対し、バンドは -14.7 / -20.1。**7〜10 dB 小さい。**
- カメラ：バンドには `closeMode="auto"` の自動寄りがあるが、ピアノの `camHands` は固定の決め打ち。

### 直った所（Claude が手元で再現確認済み）
| 項目 | 結果 |
|---|---|
| 指の付け替え | Für Elise 356→11、Clair de Lune 628→123、Trois Nouvelles 495→6 |
| コマ落ち耐性 | 11 曲 × 60/30/20/12 コマで接触失敗 0、`piano-motion-check` 終了コード 0 |
| 音量（実測） | 最大 -15.3 / 上位 10% -17.8 / 中央 -21.2（バンドは -14.7 / -17.4 / -20.1）。**差 1 dB 台** |
| カメラ | 自動で 左手/右手/両手/ペダル を切り替え（革命 0〜40 拍で 11 回、ばたつき無し）。画面下にボタン |
| 手の造形 | `public/js/robot-hardware.js` に共通化し、ピアノもバンドの精密な手（銀の骨組み・球の関節・丸い甲）に。**指先の移動 0.000 mm** |
| 鍵の光り方 | 金色の全面発光をやめ、黒鍵は黒・白鍵は象牙色のまま。押した鍵は**小口の細い白い印**と沈みで示す。ピアノ・シンセ・足鍵盤の 3 つとも |
| ドラムの左手 | 甲を上に保つ握りに。肘・手首・スティックをつないで計算し、手首の返しも追加。前腕・手首はピアノと共通部品に |
| 祭囃子の届かない 1 音 | 「叩かずに手放す」として明示。音は元データどおり鳴り、鍵は勝手に沈まない |

### 新しい道具
`tools/piano-motion-check.mjs`（運指・コマ落ち・速度）、`piano-fingering-check` / `piano-camera-check` / `piano-level-check` / `piano-hardware-check` / `piano-headless` / `key-visual-check` / `band-grip-check`。`public/piano/motion.js`（手の経路の事前計算）、`public/piano/loudness.js` + `sample-energy.json`（曲ごとの音量補正）。
撮影：`window.pianoShot({view,beat})` / `?song=...&shot=...&beat=...` / `window.pianoShotStatus`。`astra/shot.mjs` は `--size=390x844` と `--page` に対応し、**1 枚 7〜15 秒**（前は約 105 秒）。

### 既知・未解決
- `tools/band-audio-check.mjs` だけ終了コード 1。中身は全 12 行が ok で、落ちているのは「白磁の螺旋の keys と pedal の音量差 6.9 dB > 基準 6 dB」。**この検査が読むファイル（synthcore.js・synth2.js・synth-automation.js・state.js・曲データ・検査そのもの）は今回 1 つも変えていない**ので、今回の作業が原因ではなく前からの状態。直すなら曲データ側（さとるんが聴いて決める話）。
- Node の更新処理に一時的に最大約 95 ms の負荷が出る場面があると Astra が報告。ブラウザでのコマ数は未測定。
- **公開（push）はしていない。** さとるんの一言待ち。

### 16.1 v5 の事故と直し（2026-09-11 夕方・さとるん「処理落ちしまくり、カメラで酔う、正直めちゃくちゃ悪くなった」「シンセも処理落ち。キラキラより安定」）
**私の反省**: Node の検査（指のずれ 0・コマ落ち耐性）は通っていたが、実際の画面のコマ数とカメラの動きの量を自分の目で確かめずに渡した。Astra が「一時的に最大 95 ms の負荷」と書いていたのを軽く見た。

**測って分かった原因**（直す前 = Astra 前の tarball を `public/_before/` に置いて同じ条件で比較）:
| | Astra 前 | Astra 後 (v5) | 直した後 (v5.1) |
|---|---|---|---|
| ピアノ 三角形 | 5.2 万 | **25 万** | 5.1 万 |
| ピアノ 描画回数 | 107 | 284 | 143 |
| ピアノ 影を落とす部品 | 209 | 305 | 179 |
| ピアノ 1 コマの計算の最大 | 0.3 ms | **31 ms** | 0.7 ms |
| 寄りカメラの動き | 0.06 m/秒 | **0.62 m/秒** | 0.015〜0.16 m/秒 |
| バンド 三角形 | 90 万 | 99 万 | **9.6 万** |
| バンド 影を落とす部品 | 477 | 559 | 143 |
| 半透明の部品 (バンド) | 0 | 50 | 0 |

- 手の部品（`robot-hardware.js` / `band/hardware.js`）の球・筒の分割が 32〜64 と細かすぎ、全部が影を落としていた → 分割を 8〜16 に、影は手首の甲と前腕の外装だけ（`meshAt` の第 7 引数）。見た目は写真で確認して大きな差なし。
- 鍵の印（`key-visual.js`）が鍵ごとに 2 部品・半透明 → 1 部品・不透明・影なし・押していないときは非表示。明るさは線の高さで。
- カメラ（`piano/scene.js _updateCameras`）が 0.5 秒ごとに 9 方向の候補を全部品（600 個）への光線で選び、毎コマ手の境界箱を計算、狙いを毎コマ追従 → **全部やめた**。位置と角度は v4 の物（頭の前・上から見下ろす）に戻し、手の中心だけを時定数 2 秒・6cm の遊びで追う。寄る相手の切替は 6 秒以上あけて 1.2 秒迷ってから。カメラの速さは 1 秒に 8cm まで。指先が画面の端から出そうなときだけ「引く」（1 秒に 1m まで。引く動きは酔わない）。全体カメラの距離合わせは 1 秒に 1 回・時定数 3 秒。目線カメラは時定数 1.5 秒。
- 画素密度を 2 → 1.5（Retina）。`piano.js frame()` の毎コマ DOM 探索をやめた。
- 検査側: `piano-camera-check` は「指先が切れない」だけを判定（鍵の見え方は記録）、`key-visual-check` は不透明・影なし・高さで追従を判定。**全検査合格**（piano-motion 終了コード 0、バンド 6 本合格）。
- 残り: 縦長画面（幅 390）の「両手」で片手が端で切れることがある（Astra 前と同じ）。バンドの描画回数 790 は元から多い（楽器の部品）。`band-audio-check` の 白磁の螺旋 6.9 dB は前からの状態。
- 未公開（push していない）。`astra/shots/`（写真 65MB）は git に入れない（.gitignore）。

## 17. Opus 5 の演奏解釈エンジンと「運命」（2026-09-12・さとるん「opus くんの本気オブ本気で」「切磋琢磨」）

さとるんの指示: ①本気解釈のない曲は一覧から外す ②頭の棘と黄色い提灯（Salamander の銘板）を外す ③Opus 5 が Fable より良い演奏をする ④ベートーヴェンの運命を追加。

### やったこと
- **`tools/opus-interpret.mjs` + `tools/opus-plans.mjs`**: 私（Opus 5）の演奏解釈エンジン。Fable の流れ（8 小節ずつ API に投げる）との違いは 4 つ。
  1. 曲全体を一度に設計する（8 小節ごとの継ぎ目が無い）
  2. LilyPond の楽譜から強弱記号を**小節番号つきで読む**（推測しない。運命は 97 個）
  3. **tempoMap を書ける** → フェルマータ・リタルダンド・カデンツァを本物の時間の揺れにできる（Fable の流れは 1 音 ±0.06 拍しか動かせない）
  4. 時刻ごとに声部（旋律・内声・低音・反復の伴奏）を判定し、区間ごとのバランスで弾き分ける
- **運命 第 1 楽章（ピアノ編曲）を追加**: Mutopia id 497（Augener 版、Magnus Lewis-Smith 打ち込み、Public Domain）。4223 音・505 小節・5 分 16 秒。動機（タタタ・ター）を 43 か所自動検出して同じ形で扱う。強さ 17〜127（101 段）、ペダル 973 区間、テンポの点 52。`piano-motion-check` 合格（onset ずれ 0・8445 判定）。実再生で音抜け 0、音量の幅は最大 -13.9 dB / 静かな所 -39.6 dB。
- **Fable の 3 曲も仕上げて一覧に戻した**: Für Elise（37〜74・ペダル 114）、Clair de Lune（22〜72・159）、Trois Nouvelles（26〜78・141）。前は全部同じ強さ（62 / 90）でペダル 0 だった。
- **見た目**: 頭のアンテナ（棒＋橙の光）と、ピアノの金色の銘板を削除。銘板の感謝は ♥ の中に全文が残っているので、その中の「銘板にも刻んである」の一文だけ直した。
- 一覧は 12 曲（Fable 11 + Opus 1）。`index.json` に `hidden` 欄を足した（解釈がまだの曲を一覧から外す仕組み。今は全曲出ている）。

### 事故と直し
- `piano-motion-check` は前回の記録（baseline.rows）と照合するので、**新しい曲を足すと落ちる**（`fingerChanges` が undefined）。無い曲は今の値を使うように直した。
- 曲を足す/`index.json` を変えるたびに `astra/piano-baseline.json` の hash を更新する必要がある（曲データ本体を変えていないことは、他の hash が一致することで確認する）。

### 次にやるなら
- Opus の解釈を他の曲にも作って Fable 版と聴き比べる（`PLANS` に足すだけ）。さとるんの耳で選ぶ。
- 未公開（push していない）。

### 17.1 さとるんの取捨選択（2026-09-12）
- **ピアノから外した曲**（`index.json` の `hidden: true`。ファイルは残してある）: 交響曲第 5 番「運命」第 1 楽章（Opus 5 版）、Für Elise（Fable 版）。さとるんの判断「微妙」。一覧は 10 曲。
- **バンドから外した曲**: GPT-6 Astra 作の 3 曲（硝子の環流・銅の蝶番・白磁の螺旋）。`public/band/repertoire/_hidden/index-removed.json` に元の記録を保存し、`.band.json` 本体も残してある。一覧は Fable 5.1 作の 3 曲（疾風・電脳桜 / Neon Circuit / 3+3+2 オーバードライブ）。
- そのとき直した物: バンドの `index.json` の残り 3 曲に `shots`（撮影の拍）が無く `band-page-check` が落ちた → cutoff のつまみ操作の真ん中を `knob`/`ar`、その次の操作の直後を `full`/`crash`/`synth` にして埋めた。`band-page-check` が読む曲も glass-current → hayate-cyber-sakura に変えた。
- `piano-motion-check` は新しい曲に前回の記録が無いと落ちるので、無い場合は今の値を使うように直した。

## 18. 1 日 5 曲・同時に作曲できる（2026-09-13・さとるん決定）

さとるんの指示: 「ピアノ・シンセ、どちらも 1 日 5 曲までの Fable の超本気版（指もバッチリ合うやつ）にして、そのかわり誰かが作曲中でも作曲できる仕様に」。

### 変えた所
- **`relay/server.mjs`**: 「作曲は一度に 1 人」の席をまるごと撤去（`COMPOSE_KINDS` / `takeSeat` / `seatInfo` / `BUSY_*` を削除）。上限を**アプリごと**に数えるようにし、`x-bluegarage-app`（piano / band）で振り分ける。`/health` は `concurrent: true` と `apps: {piano, band}` を返す。
- **上限（アプリごと・1 日・日本時間 0 時切替）**: 曲（設計図）5 / 音を作る呼び出し 90 / その他 60。IP ごとは 1 分 30 回・1 日 260 回（1 人で 5 曲作ると 100 回近く呼ぶため広げた）。`relay/vesper-relay.service` に反映。
- **`public/js/claude.js`**: `x-bluegarage-app` を送る（`location.pathname` から piano / band を判定、`setAppName()` で上書き可）。`relaySeat()` は新しい中継（`concurrent: true`）に対しては常に「空いている」を返す（古い中継につないだ時だけ席を見る）。今日の残り曲数は `apps[アプリ]` から拾う。
- **`public/piano/piano.js` / `public/band/band.js`**: 作曲前の「席が空いているか」の待ち合わせを削除。
- **`public/piano/piano.js` に `verifyFingering()` を追加**: 作曲のあと、`stage.rehearse` で指先が鍵に合うかを測り、外れた音のまわりだけ `autoFinger` で手と指を付け直す（最大 3 回）。結果を完成の文に出す（「指はすべて鍵に合いました」／「指が届かない音 N」）。

### 確かめたこと
- 中継を手元で起動して curl で検査: 同じアプリで続けて blueprint を 2 回通し、3 回目で `429 daily_limit_error`（文面は「今日のピアノの曲数の上限…」）。ピアノとシンセは別々に数えている。`/health` に `concurrent: true`。
- ブラウザでピアノとシンセの作曲を**同時に開始**し、両方が並んで進むことを確認（以前はどちらかが断られた）。
- 検査は piano-headless / piano-camera-check / key-visual-check / band-check / band-page-check / band-regression すべて合格。

### 公開の手順（中継を変えたので、さとるんの実行が要る）
1. `cd ~/Documents/agent/product/toys/music_app && ./relay/deploy.sh`（サーバーの中継を入れ替える）
2. `git push origin main`（画面側。GitHub Pages → atelierfactory.jp に 1〜2 分で反映）

### 18.1 通信が 5 分で切れる不具合（2026-09-13・同時作曲を試して発覚）
ピアノとシンセで同時に作曲したら**両方とも途中で落ちた**（「JSON の解析に失敗」/「Expected ',' or ']'」、サーバー側のログは `[proxy] stream: terminated`）。原因は席の撤去ではなく、**Node の fetch が応答本文を 5 分で時間切れにする**こと。Claude が長く考えている間は 1 バイトも来ないので、その沈黙が 5 分を超えると接続が切られ、途中までの JSON が届いていた。曲が長いほど起きやすく、**公開中の中継にも同じ危険があった**（同時でなくても起きうる）。
- 直し: 上流への呼び出しを `fetch` から **`node:https`** に変え、`setTimeout(0)` で時間制限を外した（`relay/server.mjs` と `server.js` の 2 か所 + `server.js` のコマンドライン用）。中継は「追加の部品なし」で動いているので undici は使えない。
- 直したあと、同じ条件（ピアノ 32 小節 + シンセ 32 小節を同時）で**両方とも最後まで完成**。ピアノは「指はすべて鍵に合いました」（`verifyFingering` が動いた）。
- 公開の順番の事故を防ぐため、`x-bluegarage-app` は**新しい中継（health に `concurrent: true`）のときだけ送る**ようにした。古い中継は CORS の preflight でこの見出しを弾くので、ページだけ先に公開しても壊れない。

### 18.2 今日あと何曲作れるかを画面に出す（2026-09-13・さとるん要望）
- `public/js/claude.js` に `songsLeft()`（中継の `/health` を毎回聞き、`apps[アプリ].songs` を返す。中継を使っていないときは null）。
- ピアノ・シンセの下の帯に `#quota` を足し、「作曲」タブのときだけ「今日はあと N 曲 (1 日 5 曲まで)」と出す。使い切ったら「今日の分 (5 曲) を使い切りました。日本時間の 0 時に戻ります」。
- 更新のきっかけ: 画面を開いたとき、タブを「作曲」に変えたとき、作曲が終わった（失敗した）とき。
- 手元のサーバー（自分のキー）では中継を使わないので何も出ない（そこは今までどおり）。
