# VESPER PIANO / BAND — 鍵の色とスティックの握り（2026-09-11、3回目）

Claudeからの写真と指摘を受けた変更。ブラウザ・ネット・公開操作は使っていない。同梱曲、音量、音源、ピアノロールは変更していない。

## 鍵を元の色のまま押す

- `public/js/key-visual.js`：鍵の全面の金色発光をなくした。黒鍵・白鍵の元の色、反射の強さ、表面の粗さは押しても同じ。小口に幅約半分・高さ1.3mmの細い白い印を付け、押している間だけ見せる。上面側へ回る部分も含め、印の枠は鍵の面積の約0.5〜0.9%。光源は増やしていないので、鍵の上面を照らして別の色にすることもない。
- `public/piano/scene.js`：共有の印を88鍵に接続。従来の約10mmの沈みと指先の座標は維持。寄りカメラは鍵と指先に加え、小口の印を手で隠さない角度も探す。候補の角度を比べる間は同じ姿勢の形を使い回し、余分な計算を減らす。
- `public/band/scene.js`：シンセ37鍵と足鍵盤13本も同じ表示へ。シンセの約8mmの沈みは維持。曲頭へ戻す・曲を替える操作で印も消える。
- `public/band/hardware.js`：シンセの鍵盤の下の本体と板を12mm下げた。元は白鍵を押し切ると本体の上板と交わり、小口が隠れていた。鍵そのものの形や沈み幅は変更していない。

押したことは、沈み・段差・小さな白い印で分かる。ピアノロールの金色の点灯は従来どおり。

## 左手とスティック

座標を調べると、旧実装も手の甲の法線は上向きだった。単純な180度の裏返りではなく、肩からスティックの向きを先に決めた結果、前腕と手が逆向きに折れることが主な問題。硝子の環流60拍のスネアでは前腕とスティックの角度が約134度、64.5拍のハイハットでは約83度だった。

`public/band/drum-grip.js` では、前腕・握り・スティックを一つのつながりとして計算する。打つ先端を先に決め、肘・手首・手の向きを求める。甲は上、曲げた指は下。打面の下からスティックを差し入れないよう、打つ場所の高さに合わせて肘も持ち上げる。

`scene.js` はこの結果で左腕を動かし、打つ直前・直後に約6度以内の小さな手首の返しを加える。スティックの長さ、握る位置、指の曲げ方、先端の移動経路は維持。腕の骨も伸ばしていない。左腕のみ、従来の98.5%の距離で早めに止める制限を99.8%にして、届く範囲内のタム打点を途中で切らないようにした。

前腕と手首には、`public/js/robot-hardware.js` の既存の `refinePianoArms` をバンドでも呼ぶ。太い筒・大きい球・角板を、細い芯、曲面の覆い、金属の軸受けと棒へ交換。両手で同じ仕上げを使う。ピアノ側の部品と座標は今回変更していない。

「超大変か」への答え：全体を作り直すほど大きな変更ではない。ただし向きを反転するだけでは、手首の折れ返りや打面の裏側から当てる問題が残る。今回は腕の計算と、全打点を調べる検査まで直した。

## 新しい検査

実行例：

```sh
/Users/satorun/.local/node/bin/node --experimental-loader ./tools/band-node-loader.mjs tools/key-visual-check.mjs
/Users/satorun/.local/node/bin/node --experimental-loader ./tools/band-node-loader.mjs tools/band-grip-check.mjs
```

`key-visual-check` は実際の88＋37＋13鍵を使う。押す前後の材質が完全に同じこと、全面発光が0であること、印の面積、黒鍵が象牙色より十分暗いこと、実際の再生・解除処理を検査。指定した撮影角度から光線を飛ばし、狙った手の押した印が見えるかも調べる。旧来の金色発光をわざと戻すと不合格になる。画面のピクセル色を測った検査ではない。

`band-grip-check` は6曲・2,018打点と移動中31,399フレームを検査。甲の上向き、手首の曲がり15度未満、前腕とスティックの角度45〜80度、打面の上から当たること、骨の長さが同じこと、先端が元の位置から1マイクロメートル未満しか変わらないことを合格条件にする。これらはこのロボットの姿勢を調べる基準で、人間の身体の限界を測った数値ではない。

結果：手首の曲がり最大5.7296度、甲は真上から約11.2度以内。先端の経路の変化は丸め後0.0000mm。打面へ向かう角度は最も浅い打点でも約4.78度下向き。握りの接触の隙間は最大約1.8mmで従来の5mm基準内。打つ瞬間の打面との距離は最大約8.26mmで、以前からの先端の動きに含まれる値。先端と打面の距離まで0mmになったという意味ではない。甲や手首をわざと裏返した姿勢は不合格になる。

`tools/band-geometry-preview.mjs stick 64.5` のように拍を指定し、ブラウザを使わず輪郭だけ確認する入口も追加。これは簡易描画で、実画面の光・金属・影の確認には使わない。ハイハット、スネア、フロアタム、クラッシュの形と遮りを確認した。

## 全体の検査結果

記録は `astra/verification-p3.json`。変更後のJS/MJSは9ファイルすべて `node --check` 合格。以前の同梱データの記録と、PIANO19ファイル・BAND7ファイルのSHA-256が一致した。

| 検査 | 結果 | 終了コード |
|---|---|---:|
| `key-visual-check`（新規） | 18,482判定合格。4構図の対象12鍵で印が見える | 0 |
| `band-grip-check`（新規） | 6曲・2,018打点・31,399フレーム合格 | 0 |
| `piano-motion-check` | 11曲、60/30/20/12コマすべて合格。祭囃子の既存の1音の手放しは維持 | 0 |
| `piano-camera-check` | 144構図、移動中37フレーム、遮り・切れなし | 0 |
| `piano-page-check` | 読み取り専用、連続選曲、撮影・再生への復帰など56項目合格 | 0 |
| `piano-fingering-check` / `piano-level-check` / `piano-hardware-check` / `piano-headless` | すべて合格 | 0 |
| `band-check` / `band-regression` / `band-page-check` | 6曲、回帰46項目、画面45項目合格 | 0 |
| `band-rehearse` | 6曲すべて打点・鍵・つまみ・握りの不合格0 | 0 |
| `band-visual-check` / `band-hand-check` / `band-knob-check` / `band-signal-check` / `band-drum-check` / `band-repertoire-check` | すべて合格 | 0 |
| 追加の旧 `band-audio-check` | 白磁のエフェクト前の音量差が6dB基準を超過。詳細は末尾 | 1 |

実行した20コマンド中19本合格。一括実行 `node astra/verify-p3.mjs` の終了コードは、最後の旧音量検査を含むため1。全件合格にはしていない。

## 再撮影

鍵の黒さ・象牙色、小口の細い印と沈みを見る：

```sh
node astra/shot.mjs \
  astra/shots/p3-piano-black.png 'http://localhost:5173/piano/?song=revolutionary.vesper.json&shot=left&beat=17.55' \
  astra/shots/p3-piano-white.png 'http://localhost:5173/piano/?song=entertainer.vesper.json&shot=both&beat=32' \
  astra/shots/p3-clair-left.png 'http://localhost:5173/piano/?song=debussy_Ste_Bergamesq_Clair.mid&shot=left&beat=100' \
  astra/shots/p3-band-keys.png 'http://localhost:5173/band/?song=glass-current.band.json&shot=keys&beat=60'
```

硝子の環流の実際の打点。甲、指の曲がり、手首と前腕のつながりを見る：

```sh
node astra/shot.mjs \
  astra/shots/p3-hh.png 'http://localhost:5173/band/?song=glass-current.band.json&shot=stick&beat=64.5' \
  astra/shots/p3-snare.png 'http://localhost:5173/band/?song=glass-current.band.json&shot=stick&beat=60' \
  astra/shots/p3-tom-high.png 'http://localhost:5173/band/?song=glass-current.band.json&shot=stick&beat=60.75' \
  astra/shots/p3-tom-mid.png 'http://localhost:5173/band/?song=glass-current.band.json&shot=stick&beat=61.75' \
  astra/shots/p3-tom-floor.png 'http://localhost:5173/band/?song=glass-current.band.json&shot=stick&beat=62.75' \
  astra/shots/p3-crash-hand.png 'http://localhost:5173/band/?song=glass-current.band.json&shot=stick&beat=64' \
  astra/shots/p3-crash-tip.png 'http://localhost:5173/band/?song=glass-current.band.json&shot=crash&beat=64'
```

`shot=crash` はシンバルと先端が主役なので、手の向きは同じ拍の `shot=stick` で見る。通常再生では59〜66拍を続けて見ると、スネア→タム3台→クラッシュ→ハイハットの移動と返しを確認できる。撮影解除は `bandShotEnd()` / `pianoShotEnd()`。その後に再生し、鍵の印が残らないことも確認対象。

## 残る確認

実ブラウザの色・反射・動画の自然さは未撮影。上の簡易描画で光沢や最終的な色を保証してはいない。

追加で走らせた既存の `band-audio-check` は、白磁の螺旋のシンセと足鍵盤の、エフェクト前の平均音量差約6.9dBが基準6dBを超え、終了コード1だった。12パートすべて、数値異常・音の割れ・曲末の鳴りっぱなしは検査上0。この検査が読む音源処理と曲データは今回変更していない。承認済みの音量や同梱データを変えたり、基準を緩めて合格にすることはしていない。記録は `astra/band-audio-check-p3.out`。

通常再生の計算負荷もNodeで確認した。革命を12秒間動かしてから次の約12秒を測ると、721フレームで平均1.18ms、99%点27.74ms、最大94.84ms。カメラの遮りを調べる瞬間には負荷が上がる。これは3Dの描画を含まない値で、ブラウザでのコマ数を保証しない。動画では、カメラが向きを変える所の滑らかさも確認対象。記録は `astra/piano-animation-profile-p3.json`。
