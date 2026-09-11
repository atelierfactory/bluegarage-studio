#!/bin/sh
# Claude Code → codex exec → GPT-6 Astra で VESPER BAND を仕上げる（3D_model/astra_game/run_astra.sh と同じ仕組み）。
# 鍵は toys/env の OPENAI_API_KEY を CODEX_API_KEY で渡すだけ（表示しない・保存しない）。
# 読める/書ける場所は ~/.codex/vesper-band.config.toml（-p vesper-band）で絞ってある：
#   書けるのは music_app の中だけ（.git は読むだけ）、.env / env..rtf / public/config.json / toys/env は読めない、ネット無し。
#
#   ./astra/run_astra.sh <頼みのファイル.md>                                         新しい会話
#   ASTRA_SESSION=<会話の番号> ./astra/run_astra.sh --resume <続きの頼み.md> [写真.png ...]  続き
#   ASTRA_EFFORT=xhigh ...                                                          考える深さ（既定 high）
# 3D_model の Astra も同じ Codex を使うので、続きは必ず会話の番号で指定する（--last は使わない）。
set -eu
ENV=/Users/satorun/Documents/agent/product/toys/env
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$(dirname "$DIR")"
K="$(sed -n -E 's/^[[:space:]]*(export[[:space:]]+)?OPENAI_API_KEY[[:space:]]*=[[:space:]]*//p' "$ENV" | head -1 | sed -E "s/^['\"]//; s/['\"][[:space:]]*$//")"
[ -n "$K" ] || { echo "OPENAI_API_KEY not found in $ENV" >&2; exit 1; }

mkdir -p "$DIR/logs"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DIR/logs/$STAMP.last.md"
LOG="$DIR/logs/$STAMP.log"

if [ "${1:-}" = "--resume" ]; then
  shift
  [ -n "${ASTRA_SESSION:-}" ] || { echo "ASTRA_SESSION=<会話の番号> を付けてください" >&2; exit 1; }
  MSG="$1"; shift
  IMGS=""
  for img in "$@"; do IMGS="$IMGS -i $img"; done
  # shellcheck disable=SC2086
  set -- resume $IMGS -- "$ASTRA_SESSION" -
else
  MSG="$1"; shift
  set -- -
fi

# Claude Code の連絡用トークンなど、Astra の命令に渡さなくてよい値は落としておく
unset CLAUDE_CODE_MESSAGING_TOKEN 2>/dev/null || true
set +e
CODEX_API_KEY="$K" codex exec -p vesper-band \
  -c model_reasoning_effort="\"${ASTRA_EFFORT:-high}\"" \
  -C "$APP" -o "$OUT" "$@" <"$MSG" 2>&1 \
  | sed -E 's/sk-[A-Za-z0-9_*-]+/sk-***/g' > "$LOG"
status=$?
set -e

ln -sf "$STAMP.last.md" "$DIR/logs/last.md"
ln -sf "$STAMP.log" "$DIR/logs/last.log"
grep -m1 -i 'session id' "$LOG" || true
grep -A1 'tokens used' "$LOG" | tail -1 | sed 's/^/tokens used: /'
# 上の "tokens used" は使った量の全部ではない。本当の量と金額は会話記録から出す (astra/cost.mjs)
SID="$(grep -m1 -i 'session id' "$LOG" | awk '{print $3}')"
[ -n "$SID" ] && /Users/satorun/.local/node/bin/node "$DIR/cost.mjs" "$SID" || true
echo "log: $LOG"
echo "answer: $OUT"
exit $status
