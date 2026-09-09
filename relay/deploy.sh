#!/bin/bash
# VESPER PIANO の中継を、ブロックビルダーと同じ Lightsail サーバー (東京) に載せる。
#   ./deploy.sh   … relay/server.mjs を /opt/vesper に置き、systemd と Caddy (https://block.atelierfactory.jp/jukebox/*) を設定して起動
# 鍵は触らない: サーバーの /etc/bb.env (ブロックビルダーが使っている ANTHROPIC_API_KEY) を systemd の EnvironmentFile で読むだけ。
# 2 回目以降も同じ 1 行でよい (コードの置き換え + 再起動。Caddy の行は既にあれば足さない)。
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
source "$SRC/../../3D_model/blocks/deploy.env"   # IP=...
KEY="$HOME/.ssh/lightsail-tokyo.pem"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 ubuntu@$IP"

echo "== 1. コードを置く"
$SSH 'sudo mkdir -p /opt/vesper /var/lib/vesper && sudo chown ubuntu:ubuntu /opt/vesper /var/lib/vesper'
scp -q -i "$KEY" "$SRC/server.mjs" "ubuntu@$IP:/opt/vesper/server.mjs"

echo "== 2. systemd (vesper-relay.service)"
$SSH 'sudo tee /etc/systemd/system/vesper-relay.service >/dev/null' < "$SRC/vesper-relay.service"
$SSH 'sudo systemctl daemon-reload && sudo systemctl enable --now vesper-relay >/dev/null 2>&1; sudo systemctl restart vesper-relay && sleep 1 && systemctl is-active vesper-relay && curl -s http://127.0.0.1:8768/health'
echo

echo "== 3. Caddy: https://block.atelierfactory.jp/jukebox/* → 127.0.0.1:8768"
$SSH 'sudo python3 - <<PY
p="/etc/caddy/Caddyfile"; s=open(p).read()
if "/jukebox/*" not in s:
    block = "    handle_path /jukebox/* {\n        reverse_proxy 127.0.0.1:8768 {\n            flush_interval -1\n        }\n    }\n"
    marker = "block.atelierfactory.jp {\n"
    assert s.count(marker) == 1, "Caddyfile の形が想定と違う (block.atelierfactory.jp の塊が 1 つでない)"
    s = s.replace(marker, marker + block)
    open(p, "w").write(s); print("Caddyfile: /jukebox/* を追加")
else:
    print("Caddyfile: 既に /jukebox/* がある")
PY
caddy validate --config /etc/caddy/Caddyfile >/dev/null && sudo systemctl reload caddy && echo "caddy reloaded"'

echo "== 4. 外から確認"
sleep 2
echo -n "relay: "; curl -s "https://block.atelierfactory.jp/jukebox/health"; echo
curl -s -o /dev/null -w "block builder still ok: %{http_code}\n" "https://block.atelierfactory.jp/"
