# HANDOFF1 — VESPER PIANO 引き継ぎ（2026-09-09 午後）

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
