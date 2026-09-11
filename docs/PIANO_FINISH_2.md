# VESPER PIANO — 写真を受けた仕上げ（2026-09-11、2回目）

Claudeの写真5枚と、ブラウザ・音量測定の報告を受けた変更。ここでの追加確認はNode上。今回の変更後のブラウザ撮影・試聴・公開操作は実施していない。同梱曲のファイルも変更していない。

## 手の見た目

`public/js/robot-hardware.js` にBANDの手と金属部品の作り方を移した。`public/band/hardware.js` はこれを再公開するため、BAND側の呼び出しと既定の形は同じ。

PIANOの `scene.js` は `refineHands(...,{knuckleArch:false})` を使う。BAND専用の指の付け根を動かす処理は適用しない。手の甲の板を外し、中手骨の支え、分割した曲面の覆い、軸受け、親指の付け根、細い指の骨格と指腹へ置き換える。上から見える甲には腱の通り道と六角穴の留めねじを加えた。

黒い球の手首は薄い軸受けと二股の支えへ。前腕は中の軸、金属の棒、丸く削った2組の覆い、継ぎ目の輪で構成する。画像を貼る方法や照明変更は使っていない。

`tools/piano-hardware-check.mjs` で、骨・指の節・指先の32個の変換が完全一致し、指先の変位が **0.000 mm** であることを検査。固定部品は材質と接続先ごとにまとめ、ロボットのMesh数を416から204へ減らした。指の関節と指腹は個別に動くまま。

## カメラ

`scene.js` の寄りカメラは、手首ではなく押している鍵へ狙いを置く。指先を斜め上から見る角度を基本とし、手の部品やピアノの屋根が遮る場合だけ別の角度を選ぶ。通常再生中の遮りの判定は最大2回/秒。今の角度で見えるなら維持し、位置と狙いは時間に基づく補間で動かす。手動操作は引き続き自動を止める。

画角は手全体の立体的な範囲から決める。両手カメラは両手を含め、移動中に端が切れそうなら先に引く。全体カメラは演奏者側へ中心を移して寄せ、頭と足を収める。検査対象の横長全体画面では、演奏者が画像の高さの45%以上を占める。

`keyVisibility(camera,subjects)` は、鍵の演奏面9点と指先へ、実際の3D部品に対する光線判定をする。指腹を覆う同じ指の末節が見える場合も「指先が見える」とする。別の指、甲、腕、ピアノの屋根は遮る部品として扱う。

`tools/piano-camera-check.mjs` は11曲・12か所、1600×900と390×844、6カメラの **144構図** を検査。そのうち寄り72構図では、対象の手全体と鍵が画面内にあり、各鍵で9点中3点以上が見え、指先も見えることを条件にする。鍵と指先への光線は計1280本。わざと大きな遮る板を置いた場合に失敗を検出できることも検査する。革命12〜20拍は12 FPSで移動中の両手の収まりを検査する。

この結果は3Dの形による判定。光の当たり方、材質の質感、画面全体の美しさをブラウザで確認した結果ではない。全曲の全拍について常に全ての指が見えるという保証でもない。

## 祭囃子の1音

前後の指の組み合わせを25通り試し、143.9333拍の93を小指、144拍の59を親指で弾く元の指定が最も速かった。それでも計画上の必要速度は約9.16 m/s。同時に左手が35を弾くので、59を左手に加えるには2オクターブの開きが必要。速度上限は3.0 m/sのままにした。

今回許可された **「届かない1音を叩かずに手放す」** 方法を使う。`motion.js` は144拍の59を表示上の打鍵から外し、右手は直前の高音を離して144.25拍の62へ移動する。59を押すふりはせず、鍵も勝手に沈めない。音源は元データをそのまま再生する。

この1音は `stage.motion.releases` と検査結果の `releases` に理由・必要速度・拍を明記する。接触成功には数えない。`rehearse` も `released` を返す。元の発音時刻、12ms後、35ms後、および各FPSの描画時刻で鍵が沈まず、指先が離れていることを別に検査する。開始時の最も近い指先は鍵の中心から約13.4cm、鍵の押し込みは0。

この処理は、速度不足が1か所だけ・単音・使える移動時間40ms未満で、1音を手放した後の経路に未解決の問題がなくなる場合だけ適用する。ほかの問題や複数の問題をまとめて合格にする処理ではない。

運動検査の現在の結果は `astra/piano-motion-p2.json`。判定対象は「実際の打鍵」と「明示した1音の手放し」であり、全音を鍵で弾いたという意味ではない。

**11曲すべて合格、終了コード0。** 全曲とも発音時の接触失敗0、60/30/20/12 FPSの接触失敗0/0/0/0。祭囃子の1音以外に表示上の手放しはない。手首の最高速度は全曲3.0 m/s以下。検証のまとめは `astra/piano-verification-p2.json`。

## 操作と狭い画面

`piano.js` は撮影前の全画面状態・カメラ・手動位置を保存し、撮影終了時に戻す。停止と先頭へ戻す操作でも停止画を解除する。撮影中に画面寸法が変われば、新しい寸法で停止画を描き直す。

曲を素早く選び替えた場合は、古い読み込み結果が新しい曲を上書きしない。撮影準備中に曲が替わった場合も古い撮影を中止する。

`style.css` は幅699以下で操作欄を折り返し、舞台とピアノロールを上下に配置する。全画面の3Dも幅700未満では上下2画面。曲一覧の最小幅を解除し、長い曲名を折り返す。これはCSSとNodeでの寸法確認であり、実ブラウザでの幅390の最終確認は残る。

読み取り専用のPianoRollを維持し、ページ側に残っていた指番号・手・ペダルのキーボード編集も止めた。`tools/piano-page-check.mjs` は実際のPianoRollを読み、クリック・ドラッグ・削除・貼り付け・指変更のキー操作で音符が変わらないことを調べる。再生・途中移動・停止・再開・全画面・12 FPS・撮影復帰・曲変更の競合を含め **56項目合格**。

## 音量

1回目の音量処理は変更していない。Claude実測のThe Entertainerは、音量つまみ−4 dBで中央値−21.2 dB、上位10%−17.8 dB、最大−13.3 dB。BANDとの差は中央値1.1 dBで、依頼側の合格を受けている。WAVの実測は今回も実施していない。

## Node検査と写真

```sh
/Users/satorun/.local/node/bin/node --experimental-loader ./tools/band-node-loader.mjs tools/piano-hardware-check.mjs
/Users/satorun/.local/node/bin/node --experimental-loader ./tools/band-node-loader.mjs tools/piano-motion-check.mjs --json
/Users/satorun/.local/node/bin/node --experimental-loader ./tools/band-node-loader.mjs tools/piano-camera-check.mjs
/Users/satorun/.local/node/bin/node --experimental-vm-modules --experimental-loader ./tools/band-node-loader.mjs tools/piano-page-check.mjs
```

以下はClaudeによる再撮影の入口。撮影ツールの実行は今回行っていない。

```sh
/Users/satorun/.local/node/bin/node astra/shot.mjs \
  astra/shots/p2-fur-right.png 'http://localhost:5173/piano/?song=fur_Elise_WoO59.mid&shot=right&beat=46.75' \
  astra/shots/p2-rev-left.png 'http://localhost:5173/piano/?song=op-10-12-wfi.mid&shot=left&beat=16.5' \
  astra/shots/p2-clair-left.png 'http://localhost:5173/piano/?song=debussy_Ste_Bergamesq_Clair.mid&shot=left&beat=100' \
  astra/shots/p2-clair-both.png 'http://localhost:5173/piano/?song=debussy_Ste_Bergamesq_Clair.mid&shot=both&beat=100' \
  astra/shots/p2-ent-full.png 'http://localhost:5173/piano/?song=entertainer.mid&shot=full&beat=32' \
  astra/shots/p2-trois-both.png 'http://localhost:5173/piano/?song=TroisNouvellesEtudes_Chopin_n1.mid&shot=both&beat=28' \
  astra/shots/p2-matsuri-before.png 'http://localhost:5173/piano/?song=matsuri-overdrive.vesper.json&shot=both&beat=143.9333' \
  astra/shots/p2-matsuri-release.png 'http://localhost:5173/piano/?song=matsuri-overdrive.vesper.json&shot=both&beat=144' \
  astra/shots/p2-matsuri-next.png 'http://localhost:5173/piano/?song=matsuri-overdrive.vesper.json&shot=both&beat=144.25'

/Users/satorun/.local/node/bin/node astra/shot.mjs --size=390x844 --page \
  astra/shots/p2-mobile-page.png 'http://localhost:5173/piano/?song=fur_Elise_WoO59.mid'

/Users/satorun/.local/node/bin/node astra/shot.mjs --size=390x844 \
  astra/shots/p2-mobile-both.png 'http://localhost:5173/piano/?song=debussy_Ste_Bergamesq_Clair.mid&shot=both&beat=100'
```

見る所：エリーゼ・革命では甲の骨格、手首と前腕の立体感。月の光では光る鍵と指先、両手の端。エンターテイナーでは演奏者の大きさ。新練習曲では両手の形。祭囃子の3枚では、右手が高音を離して移動し、144拍の59を叩くふりをせず、次の62に着くこと。幅390の通常画面ではボタン・曲名・ピアノロール・舞台が重ならないこと。

動きの確認には `vesperStage.setFrameRate(20)` または `(12)`、通常へ戻すには `(0)`。撮影の解除は `pianoShotEnd()`。手動で寄り画面を動かした時に自動が止まり、「自動」で戻ることも確認対象。
