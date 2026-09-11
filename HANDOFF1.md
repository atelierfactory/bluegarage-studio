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

## 15. VESPER BAND（2026-09-11・第6回への対応、6曲を保持、未公開）

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
