#!/bin/zsh
# 中継サーバー (proxy/worker.js) を手元で動かす (本物のキー不要・Cloudflare ログイン不要)
#   tools/proxy-dev.sh            → http://localhost:8787  (ALLOWED_ORIGINS=http://localhost:5180, PASSCODE=test-code)
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/node/bin:$PATH"
exec npx wrangler dev --config proxy/wrangler.toml --port 8787 \
  --var "ALLOWED_ORIGINS:http://localhost:5180" \
  --var "ANTHROPIC_API_KEY:${ANTHROPIC_API_KEY:-sk-ant-dummy-local-test}" \
  --var "PASSCODE:${PASSCODE:-test-code}"
