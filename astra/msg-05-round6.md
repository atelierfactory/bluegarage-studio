# 6 回目の依頼（Claude より）

## 5 回目の結果（Claude がブラウザで確認）
- 見えるブラウザでは、撮影は 4〜6 秒で `bandShotStatus.state === "ready"` になる。表示板は、つまみ・手・表示窓を隠さなくなった（手元はつまみの下、シンセは上の空中）。止まった写真にも比較の図が出る。表示窓に「GLASS / ZERO HOUR　REVERB 20/100」。指は骨組み＋関節になり、2 本でつまんでいる。
- あなたの 3 曲：`bandRehearse` misses 0。ピアノの `rehearse`（2621 音）misses 0、再生・停止も正常。
- 検査の道具：`band-page-check` 35 項目、`band-regression` 40 項目に合格（Claude の直しの後に、HANDOFF の旗付きで実行）。
- **見えない Chromium の `--screenshot` は、5 回目から真っ黒になった**（読み込み直後に写すため、準備待ちの撮影に間に合わない）。Claude は `astra/shot.mjs` を作った：DevTools の通信で `bandShotStatus` が ready になるのを待ってから写す。swiftshader だと 1 枚約 105 秒（ページの中の ms は約 45 秒）。今回の添付 `r5-knob.png` はこれで撮った。

## 画面の作曲機能で作った 3 曲（Claude Fable 5.1）を、同梱曲の候補に入れた
Claude が画面の作曲機能で 3 曲作り、`public/band/repertoire/` に候補として入れた（`index.json` に `candidate: true`）。どれを残すかは、さとるんが耳で決めます。
| ファイル | 曲 | BPM | 小節 | 右手音/小節 | クラッシュ | つまみ |
|---|---|---|---|---|---|---|
| `hayate-cyber-sakura.band.json` | 疾風・電脳桜 | 150 | 38 | 11.2 | 25 | 15 |
| `neon-circuit.band.json` | Neon Circuit | 118 | 36 | 9.3 | 20 | 20 |
| `overdrive-332.band.json` | 3+3+2 オーバードライブ | 150 | 36 | 9.6 | 43 | 14 |
- 3 曲とも `analyzeBand` は fixes 0・issues 0。どれもブラウザで `bandLoad` できる。
- **`index.json` を作り直すとき（`make-band-repertoire.mjs` など）に、この 3 曲を消さないでください。** 曲の音も変えないでください。

## Claude が直したこと（作曲機能。変えないでください）
- 前回伝えた 2 つ（`api-schema.js`、音色の頼みは Schema を文章で渡す）に加えて、**`band.js` の `compose` の最後の全体検査**を直した。以前は、全体の `analyzeBand` に fixes が 1 つでもあると（例：つなぎ目で「足鍵盤で速すぎる音 1 個を落とした」）36 小節の曲を丸ごと捨てていた。今は、issues があれば止める。fixes だけなら、直した形を曲に書き戻し、もう一度検査して fixes・issues が 0 のときだけ完成にする（完成の文につなぎ目の直しを添える）。Neon Circuit はこの問題で一度捨てられたので、作りかけから同じ手順で拾い直した（足鍵盤 187 → 185 音）。
- HANDOFF1 の 15 章にこの直しを書き足し、`band-page-check` にも「つなぎ目の fixes だけなら完成になる／issues なら止まる」の検査を足してください。

## 直してほしい所
1. **Fable の 3 曲で、つまみに指が届かない。** `bandRehearse` の misses：疾風・電脳桜 5、Neon Circuit 10、3+3+2 オーバードライブ 6。**全部 kind が knob**。指はつまみの真上に来ている（dist 0.0006〜0.0016）が、指先がつまみの表面に届いていない（surfaceGap 0.02〜0.40）。例：
   - 疾風 `{param:"reverb", s:109.2, f:1, surfaceGap:0.374}`、`{param:"delay", s:110.6, f:1, surfaceGap:0.002}`、`{param:"delay", s:150.85, f:1, surfaceGap:0.044}`
   - Neon `{param:"delay", s:97.55, f:1, surfaceGap:0.337}` の直後に `{param:"reverb", s:98.2, surfaceGap:0.059}`（つまみを続けて回す所）
   - 3+3+2 `{param:"resonance", s:77.3, f:1, surfaceGap:0.213}`、`{param:"cutoff", s:85.6, f:2, surfaceGap:0.0023}`
   - つまり、**`analyzeBand` が通した曲（LIMITS を守った曲）を、体が弾けない**。画面の作曲機能は `analyzeBand` を門番にしているので、さとるんが作曲した曲でも同じことが起きる。
   - 求めること：**`analyzeBand` が通す曲は、必ず misses 0 で弾ける**ようにする。第一は体の動きを直す（つまみからつまみへ間に合う、右端のつまみにも届く、つまむ前に指先を表面まで下ろす）。どうしても体で無理な間隔なら、その限界を `LIMITS`／`analyzeBand` に入れて、曲の側を機械的に直す（その場合は Fable の 3 曲に何をしたかを書く）。6 曲すべてで misses 0 を確認する。
2. **`tools/band-check.mjs` の作曲者の決まりが狭すぎる**（`item.composer !== 'GPT-6 Astra'` だと不合格）。`GPT-6 Astra` と `Claude Fable 5.1` を受け入れる（license に「オリジナル」を含むことは今のまま）。`candidate` の欄も許す。6 曲で合格させる。
3. **つまむ手の甲**（添付 `r5-knob.png`）：指は精密になったが、手の甲の側に大きな白い板が 4 枚並んで見え、近くで見ると安っぽい。指と同じ精密さに。ピアノの指先合わせ（ずれ 0）は保つ。

## 決まり・最後の返事
今までと同じです（書けるのは music_app の中だけ、.git を触らない、`node --check`、worklet を変えたら bundle、さとるん向けのまとめは中学生でも分かる言葉で、など）。途中で止まって確認を求めなくてよいです。
