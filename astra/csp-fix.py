#!/usr/bin/env python3
# 会社サイト (atelierfactory.jp) の CSP: ジュークボックス (/device/jukebox/**) だけ script-src に blob: を足す。
# VESPER BAND の自作シンセ (AudioWorklet) は Tone.js が中身を blob: に包んで読むので、blob: が無いと鳴らない。
# /rf/** (ロボット道場) と同じ形で、hosting.tf に 1 行足して 2 行を書き換える。他のページの CSP は変えない。
#   python3 csp-fix.py [hosting.tf の場所]   (既定: infra/apps/site/hosting.tf)
# 決まった場所がちょうど 1 か所ずつ見つからなければ、何も書き換えずに止まる。2 回目は「もう入っています」で止まる。
import pathlib, sys

path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/Users/satorun/Documents/agent/product/infra/apps/site/hosting.tf")
s = path.read_text(encoding="utf-8")
if "jukebox_headers" in s:
    sys.exit("もう入っています (jukebox_headers がある)。何も変えていません。")

rf_line = """  rf_headers          = [for h in local.site_headers : h.key == "Content-Security-Policy" ? { key = h.key, value = replace(h.value, "'wasm-unsafe-eval'", "'wasm-unsafe-eval' 'unsafe-eval'") } : h]\n"""
jukebox_lines = (
    "  # ジュークボックス（/device/jukebox/**、VESPER BAND）だけは script-src に blob: も許す（2026-09-11）。\n"
    "  # 自作シンセ（AudioWorklet）を Tone.js が中身を blob: に包んで読むため。script-src には元から 'unsafe-inline' がある\n"
    """  jukebox_headers     = [for h in local.site_headers : h.key == "Content-Security-Policy" ? { key = h.key, value = replace(h.value, "'wasm-unsafe-eval'", "'wasm-unsafe-eval' blob:") } : h]\n"""
)
edits = [
    (rf_line, rf_line + jukebox_lines),
    ("{ site = local.site_headers, rf = local.rf_headers }", "{ site = local.site_headers, rf = local.rf_headers, jukebox = local.jukebox_headers }"),
    (r'[${local.hdr_json.rf}]}]"', r'[${local.hdr_json.rf}]},{\"pattern\":\"/device/jukebox/**\",\"headers\":[${local.hdr_json.jukebox}]}]"'),
]
for old, _ in edits:
    n = s.count(old)
    if n != 1:
        sys.exit(f"書き換える場所が {n} か所見つかりました (1 か所のはず)。何も変えていません:\n{old[:120]}")
for old, new in edits:
    s = s.replace(old, new, 1)
path.write_text(s, encoding="utf-8")
print(f"書き換えました: {path}")
print("ジュークボックス (/device/jukebox/**) だけ script-src に blob: を足すパターンを入れました。")
