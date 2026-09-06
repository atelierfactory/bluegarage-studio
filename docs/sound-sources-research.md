# 音源調査メモ（2026-09-04・内部向け）

目的: BLUE GARAGE STUDIO の各楽器を「無料で入手できる最高レベルの録音サンプル」に差し替える。
現状 (public/js/audio.js): Tone.Sampler = 1鍵1サンプル・ベロシティは音量のみ・RR/リリースサンプル無し。ドラムは Tone.js acoustic-kit 6音 + 金物はシンセ。

## 採用セット（再配布OKなもの。全部 SFZ + WAV/FLAC/OGG）

| 楽器 | 採用 | 入手 | 形式/サイズ | 層/RR/奏法 | ライセンス |
|---|---|---|---|---|---|
| piano | Salamander Grand Piano V3 (Yamaha C5) | https://github.com/sfzinstruments/SalamanderGrandPiano (FLAC 748MB) / archive.org 48k24bit 1.45GB | SFZ+FLAC | 16 vel層, リリース(ハンマー/弦共鳴), ペダル音, RR無し | CC-BY 3.0 表記 + 作者が2022-03-04にPD宣言 |
| piano 次点 | Headroom Piano (Yamaha C3) | https://github.com/sfzinstruments/BengtNilsson.HeadroomPiano | SFZ+FLAC 156MB | 5層, 2マイク | CC-BY 4.0 |
| epiano | Greg Sullivan E-Pianos (Wurlitzer EP200 / CP80 / Pianet T) | https://github.com/sfzinstruments/GregSullivan.E-Pianos | SFZ+FLAC 21.5MB | Wurli 4層 / CP80 4層 | CC-BY 3.0 |
| epiano (Rhodes, 非商用限定) | jRhodes3d | https://github.com/sfzinstruments/jlearman.jRhodes3d | SFZ+FLAC 97MB | 5層 | CC-BY-NC 4.0 |
| organ | サンプル無し → Tone.js で自作 (sine×9 ドローバー + キークリック + Leslie 模擬: Vibrato/Tremolo/AutoPanner) | — | — | — | 実機B3+Leslie+再配布OKは存在しない。Real Rotor Organ (Indiginus) はライセンス文なし |
| drums | Naked Drums (Wilkinson Audio, kinwie SFZ移植) | https://github.com/sfzinstruments/WilkinsonAudio.NakedDrums | SFZ v2 + FLAC 1.28GB | 5vel×10RR, kick/snare×2/tom×5/HH open,closed,pedal/ride bow+bell/crash×2/china×2/splash×2, GMプリセット同梱 | CC-BY 4.0 (原版Wilkinsonの条件は404で未確認) |
| drums 次点 | Salamander Drumkit | https://github.com/endolith/Salamander-Drumkit (SFZ) / archive.org 388MB | SFZ+WAV | vel 2〜4層, RR極多 (HH20/snare14/kick12), 金物完備 | Public Domain (2022-03-04〜) |
| bass | Black And Blue Basses (Karoryfer) | https://github.com/sfzinstruments/karoryfer.black-and-blue-basses | SFZ+WAV 985MB | 指: 4vel×4RR+ghost / ピック: 2vel×8RR, staccato, リリースノイズ | CC0 |
| bass 次点 | Growlybass (Karoryfer) | https://github.com/sfzinstruments/karoryfer.growlybass | SFZ+WAV 160MB | 4vel×4RR, stac 5RR, release 5RR | CC0 |
| guitar-electric | Blue Jeans and Moonbeams (BJAM) 5.26.04 | Google Docs リンク集: https://docs.google.com/document/d/15XBK9LqTsNRG14JD23bidiAvaEaj8UXcT8O8PDTnS3o | SFZ(ARIA拡張)+OGG 231MB | 4-5vel, legato/hammer/pull/palm mute/harmonics 等11奏法, 72フレット位置 | MIT |
| guitar-electric 次点 | Emilyguitar (Karoryfer) | https://github.com/sfzinstruments/karoryfer.emilyguitar | SFZ+WAV 98MB | 4vel×3RR, release 4RR, パワーコード/バレーコードKS | CC0 |
| guitar-acoustic | Ella Gitauru (BJAM同梱, スチール弦 6/12/ナッシュビル) | 同上 | SFZ+OGG | 4-5vel | MIT (作者自身は音に不満) |
| guitar-acoustic ナイロン | FreePats Nylon-String | https://freepats.zenvoid.org/Guitar/acoustic-guitar.html | SFZ+FLAC 4.5MB | 単層 | CC0 |
| strings | VSCO 2 Community Edition 1.1.0 | https://github.com/sgossner/VSCO-2-CE | SFZ+WAV 2.3GB zip (全楽器) | Vln/Vla/Vc セクション: susVib 2vel, spic 2vel×2RR, pizz, trem. Legato無し, Bassセクション無し | CC0 |
| strings 次点 | Sonatina Symphonic Orchestra 4.0 | https://github.com/peastman/sso | SFZ+WAV/FLAC 16bit 1.39GB | Sustain/Legato/Marcato/Stac(2RR)/Pizz/Trem, Basses あり | CC Sampling Plus 1.0 |
| saxophone | Weresax (alto, Karoryfer) | https://github.com/sfzinstruments/karoryfer.weresax/releases | SFZ+WAV 198MB | 2vel×2RR, ループ済, sus のみ | CC0 |
| saxophone 次点 | MTG.SoloSax (sop/alto/tenor/bari) | https://github.com/sfzinstruments/MTG.SoloSax | SFZ+FLAC mono 110MB | 2〜3vel | CC-BY 4.0 (元 CC-BY 3.0) |
| trumpet | VSCO 2 CE Trumpet | (VSCO2 内) | | sus/susvib 2vel, stac 3vel×2RR, straight/harmon mute | CC0 |
| flute | VSCO 2 CE Flute | (VSCO2 内) | | susNV 3vel, expvib, stac 4vel×2RR | CC0 |
| synth-lead / synth-pad | webDX7 (WASM, MIT) + webOBXD (GPL-3, OB-X系) + Tone.js 自前パッチ | https://github.com/webaudiomodules/webdx7 / https://github.com/jariseon/webOBXD | AudioWorklet | DX7 sysex バンク読込 | MIT / GPL-3 (同梱ROMバンクはYamaha著作物→自作/CC0パッチのみ) |
| synth サンプル補助 | SHLD Wavestate/Minifreak Pads (CC0, Patreon無料枠) / FreePats synth pad,lead (CC0) | https://drolez.com/blog/music/ableton-free-sound-packs.php / https://freepats.zenvoid.org/ | SFZ+WAV 160/265MB | 多重サンプル | CC0 |

## 音は良いが同梱・再配布NG（さとるんのMac内だけで使うなら候補）

- Unreal Instruments Standard Guitar (716MB, 最大16RR, palm mute等20奏法) / METAL-GTX / Standard Bass V2 (233MB, 18RR): 「音源内データの加工・二次配布禁止」(公式About)。楽曲利用はOK。
- Ivy Audio Piano in 162 (Steinway B, 5層×2RR×2マイク, 4.6GB): 再パッケージ・再配布禁止 (二次情報)。
- Pianobook 全パック (Experience NY Steinway B 7層, MDM Acoustic Guitar, Tenor Sax, Hammond L102 …): EULA で他サンプラー向け再フォーマット・ソフト組込を明示禁止。
- Maestro Concert Grand: 書面許可なく配布禁止。
- MF Natural Concert Guitar (ナイロン, 4vel×3RR): CC-BY-NC-SA + 製品組込禁止。
- Spitfire LABS / BBCSO Discover / Muse Sounds / Ample Lite / MT Power Drum Kit / Shreddage Free: プラグイン専用でサンプル取り出し不可 (LABS は 2026-10-31 終了)。

## 再生技術（ブラウザ側）

| 候補 | 判定 |
|---|---|
| Tone.Sampler (現行) | 1鍵1サンプル・vel=音量のみ。層/RR/リリース不可 (Issue #1034 closed-not-planned) |
| smplr 1.0.0 (MIT, 2026-06) | velRange/seqLength(RR)/group,offBy/loop/ampRelease 対応。release samples・attack・pan・amp_veltrack 非対応。renderOffline 内蔵。設計の下敷きに最適 |
| spessasynth_lib 4.3 (Apache-2.0) | SF2/SF3/DLS 完全対応、OfflineAudioContext 公式例あり。SF2 を使う場合はこれ |
| sfizz-webaudio | 本体 sfizz が 2026-06 アーカイブ。埋め込みサンプルのみ。× |
| sfzlab/sfz-web-player (CC0) | パーサ @sfz-tools/core (#include/#define/default_path 対応) は流用可。プレイヤー部はゲイン/エンベロープ無しで × |
| js-synthesizer (FluidSynth WASM, LGPL) | 予備 |

### 決定アーキテクチャ
1. **サーバ側 (Node スクリプト, 1回だけ)**: SFZ を解決 (#include, #define, default_path, master/group/region 継承) → 単純 JSON region 表 (sample, lokey/hikey, pitch_keycenter, lovel/hivel, seq_length/seq_position, trigger, group/off_by, ampeg 4値, loop, amp_veltrack, volume, pan, tune) + サンプルを Opus (`ffmpeg -c:a libopus -b:a 128k -vbr on -ar 48000`, mono 80k) と AAC (Safari 予備) に変換 → `samples/<instrument>/` に配置。ffmpeg は brew 無しでも `npm i ffmpeg-static` でバイナリ取得可。
2. **ブラウザ側**: AudioBufferSourceNode + GainNode の自作多層サンプラー (`Tone.getContext().rawContext` 上、AudioWorklet 不要なので Tone.Offline 内でもそのまま動く)。vel層選択・RR・release trigger・off_by (HH)・ADSR・loop・amp_veltrack を実装。smplr の region-matcher.ts / voice.ts を参考。
3. **メモリ対策 (最重要)**: decodeAudioData 後は float32 PCM = 44.1k stereo で 21.2MB/分。Opus で縮めても展開後は元WAV以上 (16bit元なら2倍)。→ 使うリージョンだけ遅延ロード + LRU 解放、変換時に層間引き (Salamander 16→6層)・尾切り (-90dBFS)・モノ化。オフライン書き出し前に曲で使うリージョン全ロード待ち。
4. **Safari**: Ogg/Opus は 18.4+ (2025-03) で `<audio>` 対応、decodeAudioData は未検証 → Opus + AAC 二本立て、canPlayType で切替。Opus は 48k 固定・pre-skip 312 → loop 点は 48/44.1 倍で再計算。ループ素材は FLAC/WAV のまま置く逃げ道も。
5. **オルガン**: サンプルでなく合成 (sine×9 + キークリック + Leslie 模擬)。
6. **シンセ**: webDX7 (AudioWorklet) を Tone.js チェーンに接続。Offline 時は offline context に addModule が必要。

## 容量目安
ダウンロード合計 ≈ 6.5GB (Salamander 1.45G + Naked 1.28G + B&B 0.99G + VSCO2 2.3G + BJAM 0.23G + Weresax 0.2G + 小物)。Opus 変換後 ≈ 500〜700MB。ディスクは 836GB 空きで問題なし。ffmpeg/brew 未インストール (2026-09-04 時点)。
