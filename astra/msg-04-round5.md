# 5 回目の依頼（Claude より）

## 4 回目の結果（Claude がブラウザで確認）
- `bandRehearse`：3 曲とも misses 0（硝子 synth 839・drum 482・pedal 237・knob 48 / 銅 705・391・248・42 / 白磁 1047・400・214・45）。ピアノの `rehearse`（The Entertainer 2621 音）も misses 0、ピアノの再生・停止も正常。
- よくなった所：AR 表示がシンセの近くに浮くようになった。実際の音から描いた図（実線＝今、点線＝変える前）が出る。2 つ続けて回すと 2 枚並ぶ。指の × の交差は無くなり、関節が銀の球になった。表示窓に文字が出る。
- 曲はさとるんがこれから耳で判断します。**曲は今回は変えないでください。**

## Claude が直したこと（作曲機能が壊れていた。あなたは変えないでください）
画面の作曲機能（Claude Fable 5.1）を実際に動かしたところ、2 か所で API に断られていました。
1. `400: output_config.format.schema: For 'number' type, properties maximum, minimum are not supported`
   - structured outputs は `minimum`・`maximum`・`multipleOf`・`minLength`・`maxLength` などを受け付けない。
   - 新しい `public/js/api-schema.js` の `apiSchema()` を、`public/js/claude.js` の `streamMessage` が送る直前に通すようにした（元のスキーマは変えないので、`model.js` などの手元の検査はそのまま min/max を使える）。
2. `400: The compiled grammar is too large, which would cause performance issues.`
   - `BAND_SOUNDS_SCHEMA` は SYNTH2 のパッチ（89 項目）を 2 つ持っていて、大きすぎる。
   - `buildBandSoundsRequest` は structured outputs を使わず、Schema を `SYSTEM_BAND_SOUNDS` の文章の中で渡して JSON を書かせるようにした。受け取った後、`band.js` の compose で keys と pedal があるかを確かめてから `normalizePatch2` で整える。

Claude は今、この直した作曲機能で 3 曲を作っています。**`band.js` の compose まわり・`band/prompts.js`・`js/claude.js`・`js/api-schema.js` は変えないでください。** 問題を見つけたら、直さずに最後の返事に書いてください。HANDOFF1 の 15 章には、この 2 つの直しを書き足してください。

## 直してほしい所
1. **AR の表示板が、説明している物を隠している。** 手元の写真ではつまみと手の上に、シンセの写真では表示窓の上にかぶさっている。表示板は、そのつまみ・回している手・表示窓を隠さない位置（例：つまみの上の空中、手と反対の側）に置き、線でつまみとつなぐ。全体の画面・手元の画面の両方で。
2. **止まった写真で AR の図が空になることがある。** 全体の写真（`shot=full`, beat=196）では「再生すると実音を測ります」とだけ出て、図が空だった。シンセの写真では比較の図が出ていた。止まって撮るときも、いつも比較の図を出す。
3. **写真を撮るのがとても遅い。** Claude はコマンドで写真を撮って確認します（Playwright の chrome-headless-shell、`--use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1600,900 --virtual-time-budget=30000`）。4 回目から、1 枚に約 7 分かかっている（3 回目までは 1 分前後）。撮影のときの音の計算（比較の図）を短くする・使い回すなどして、1 枚 30 秒以内に。
4. **つまみに寄った写真で、手が大きな白いミトンに見える**（太い筒の指 4 本が並ぶ）。近くで見ても、関節で分かれた精密なロボットの手に見えるように。ピアノと共有している部分を変えるなら、ピアノの指先合わせ（ずれ 0）を保つ。

## 決まり・最後の返事
今までと同じです（書けるのは music_app の中だけ、.git を触らない、`node --check`、worklet を変えたら bundle、さとるん向けのまとめは中学生でも分かる言葉で、など）。途中で止まって確認を求めなくてよいです。
