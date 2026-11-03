# 手元で見るためのファイルのサーバー。ブラウザが前の版の .js を覚えたまま使わないよう、毎回確かめさせる (Cache-Control: no-cache)。
# 2026-11-03: python -m http.server のままでは、読み直しても古い ar.js が使われ、直したつまみのカードが出なかった。
# 使い方: python3 tools/serve-nocache.py 8824 public
import functools, http.server, sys

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass

port, root = int(sys.argv[1]), sys.argv[2]
http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=root)).serve_forever()
