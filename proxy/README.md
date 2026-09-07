# proxy — API キーを置く中継サーバー (Cloudflare Worker)

公開サイト (GitHub Pages) は静的なので、API キーを置ける場所がありません。
そこでキーはこの Worker の secret にだけ置き、ブラウザは Worker を経由して Claude を呼びます。
キーはブラウザにも git にも一切出ません。

```
ブラウザ (GitHub Pages) ──POST /v1/messages──▶ Worker (キー保持) ──▶ api.anthropic.com
      x-bluegarage-pass: アクセスコード            ↑ Origin 制限 / 回数制限
```

## 初回セットアップ (音楽アプリのフォルダで、ターミナル 3 回)

```bash
cd /Users/satorun/Documents/agent/product/toys/music_app/proxy && npx wrangler login
```
ブラウザが開くので Cloudflare にログイン (無料アカウントで可) → 「Allow」。

```bash
cd /Users/satorun/Documents/agent/product/toys/music_app/proxy && npx wrangler secret put ANTHROPIC_API_KEY
```
「Enter a secret value」と出たら Anthropic の API キーを貼って Enter (画面には出ない)。
※ 専用ワークスペースのキーを使い、Anthropic Console 側で月の上限 (Spend limit) をかけておく。

```bash
cd /Users/satorun/Documents/agent/product/toys/music_app/proxy && npx wrangler secret put PASSCODE
```
サイトを使わせたい人にだけ教える「アクセスコード」(好きな文字列) を貼って Enter。不要なら設定しない (誰でも使える状態になるので非推奨)。

## 1 日の上限 (曲数)

`wrangler.toml` の `SONG_LIMIT` (既定 20) が 1 日に作れる曲 (設計図) の数。全員の合計で数える。トラック生成はその 15 倍、その他 (チャット等) は 3000 回/日。日本時間の 0 時で切り替わる。
数えるために KV (小さな保存場所) を 1 つ使う。ログイン後に 1 回だけ:

```bash
cd /Users/satorun/Documents/agent/product/toys/music_app/proxy && npx wrangler kv namespace create COUNTERS
```
出てきた `id = "…"` を `wrangler.toml` の `[[kv_namespaces]]` の `id` に書く。KV が無い状態では曲作りは通らない (安全側に倒してある)。

## 配置と、サイトへのつなぎ込み

```bash
cd /Users/satorun/Documents/agent/product/toys/music_app/proxy && npx wrangler deploy
```
最後に `https://bluegarage-proxy.<アカウント名>.workers.dev` という URL が出る。これをサイトに教える:

```bash
gh variable set PROXY_URL --repo atelierfactory/bluegarage-studio --body "https://bluegarage-proxy.<アカウント名>.workers.dev"
```
```bash
gh workflow run pages.yml --repo atelierfactory/bluegarage-studio
```
2 分後にサイトを開き、⚙ に「専用サーバーが用意されている」と出れば完了。アクセスコードを設定した場合は ⚙ の「アクセスコード」に入れて保存。

## 確認

- `curl https://bluegarage-proxy.<アカウント名>.workers.dev/health` → `{"ok":true,"passcode":true,"hasKey":true,"counter":true,"songs":{"used":0,"limit":20,"left":20},…}`
- 上限を変える: `wrangler.toml` の `SONG_LIMIT` を書き換えて `npx wrangler deploy`
- キーを変える: `secret put ANTHROPIC_API_KEY` をやり直すだけ (deploy 不要)
- 止める: `npx wrangler delete` (または Cloudflare の画面で Worker を削除)。サイトは各自キー方式に戻る

## 手元で試す (本物のキー不要)

```bash
cd proxy && npx wrangler dev --var ALLOWED_ORIGINS:http://localhost:5180
```
→ http://localhost:8787 で動く。`public/config.json` に `{"proxyUrl":"http://localhost:8787"}` を置いて `node tools/static-serve.mjs` で開くと同じ経路を通る。
