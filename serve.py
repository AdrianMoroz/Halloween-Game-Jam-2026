"""Start the static game locally; Python is a dev convenience, never a host requirement."""
import argparse
import functools
import http.server
import pathlib
import threading
import webbrowser

parser = argparse.ArgumentParser(description="Run The Last Disciple locally.")
parser.add_argument("--port", type=int, default=8000)
parser.add_argument("--no-browser", action="store_true")
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
server = None
for port in range(args.port, args.port + 11):
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
        break
    except OSError:
        continue
if server is None:
    raise SystemExit("No free local port found. Try: python serve.py --port 9000")
url = f"http://localhost:{server.server_address[1]}/"
print(f"The Last Disciple: {url}\nKeep this window open while playing. Ctrl+C stops the server.", flush=True)
if not args.no_browser:
    opener = threading.Timer(0.5, lambda: webbrowser.open(url))
    opener.daemon = True
    opener.start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
