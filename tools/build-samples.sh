#!/bin/zsh
# ═══════════ 全楽器のサンプルパックを一括変換 ═══════════
# 前提: samples_src/ に各ライブラリが展開済み (samples_src/fetch.sh)、node_modules/ffmpeg-static あり
#   tools/build-samples.sh            … 全部
#   tools/build-samples.sh piano bass … 指定した楽器だけ
set -e
cd "$(dirname "$0")/.."
NODE=${NODE:-/Users/satorun/.local/node/bin/node}
imp() { "$NODE" tools/sfz-import.mjs "$@"; }
OUT=public/samples
J=${JOBS:-6}
want() { [ $# -eq 0 ] && return 0; return 1; }
ONLY=("$@")
want() { [ ${#ONLY[@]} -eq 0 ] && return 0; for n in "${ONLY[@]}"; do [ "$n" = "$1" ] && return 0; done; return 1; }

want piano && { echo "== piano (Salamander Grand Piano V3)"
  imp --name piano --label "Salamander Grand Piano (Yamaha C5)" --credit "Alexander Holm / kinwie, CC-BY 3.0 (PD宣言 2022)" \
    --sfz "samples_src/salamander/Salamander Grand Piano V3.sfz" --max-layers 8 --max-dur 12 --jobs $J --out $OUT; }
want epiano && { echo "== epiano (Greg Sullivan Wurlitzer EP200)"
  imp --name epiano --label "Wurlitzer EP200" --credit "Greg Sullivan / kinwie, CC-BY 3.0" \
    --sfz "samples_src/epianos/Wurlitzer EP200/Wurlitzer EP200.sfz" --max-dur 12 --jobs $J --out $OUT; }
want drums && { echo "== drums (Naked Drums GM)"
  imp --name drums --label "Naked Drums (Yamaha Recording Custom)" --credit "Wilkinson Audio / kinwie, CC-BY 4.0" \
    --sfz "samples_src/nakeddrums/Wilkinson Audio/Naked Drums/User/Naked Drums GM.sfz" --max-rr 6 --premix --bitrate 96k --jobs $J --out $OUT; }
want bass && { echo "== bass (Black And Blue Basses: dark black, fingered)"
  imp --name bass --label "Black And Blue Basses (指弾き)" --credit "Karoryfer Samples, CC0" \
    --sfz "samples_src/bbbasses/Programs/05-darkblack_pluck.sfz" --bitrate 96k --jobs $J --out $OUT; }
want guitar-electric && { echo "== guitar-electric (BJAM)"
  imp --name guitar-electric --label "Blue Jeans and Moonbeams (Strat)" --credit "Malaclypse the Younger, MIT" \
    --sfz "samples_src/bjam/Blue Jeans and Moonbeams 5.26.04.sfz" --bitrate 80k --jobs $J --out $OUT; }
want guitar-electric-mute && { echo "== guitar-electric-mute (BJAM palm mute, CC67=40)"
  imp --name guitar-electric-mute --label "BJAM パームミュート" --credit "Malaclypse the Younger, MIT" \
    --sfz "samples_src/bjam/Blue Jeans and Moonbeams 5.26.04.sfz" --cc 67=40 --bitrate 80k --jobs $J --out $OUT; }
want guitar-acoustic && { echo "== guitar-acoustic (Ella Gitauru)"
  imp --name guitar-acoustic --label "Ella Gitauru (スチール弦)" --credit "Malaclypse the Younger, MIT" \
    --sfz "samples_src/bjam/Ella Gitauru 5.26.04.sfz" --bitrate 80k --jobs $J --out $OUT; }
want saxophone && { echo "== saxophone (Weresax alto)"
  imp --name saxophone --label "Weresax (アルトサックス)" --credit "Karoryfer Samples, CC0" \
    --sfz "samples_src/weresax/Programs/Sax.sfz" --bitrate 96k --jobs $J --out $OUT; }
want strings && { echo "== strings (VSCO 2 CE)"
  imp --name strings --label "VSCO2 String Sections" --credit "Versilian Studios, CC0" \
    --sfz samples_src/generated/strings.sfz --autoloop --jobs $J --out $OUT; }
want trumpet && { echo "== trumpet (VSCO 2 CE)"
  imp --name trumpet --label "VSCO2 Trumpet" --credit "Versilian Studios, CC0" \
    --sfz samples_src/generated/trumpet.sfz --autoloop --jobs $J --out $OUT; }
want flute && { echo "== flute (VSCO 2 CE)"
  imp --name flute --label "VSCO2 Flute" --credit "Versilian Studios, CC0" \
    --sfz samples_src/generated/flute.sfz --autoloop --jobs $J --out $OUT; }
echo "== DONE"; du -sh $OUT/* 2>/dev/null
