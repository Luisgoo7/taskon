"""Servidor local do TaskON.

Serve os arquivos do app e busca a agenda (.ics) em nome do navegador,
que sozinho seria bloqueado pelo CORS do Google/Outlook.

Uso: python server.py  ->  http://localhost:5173
"""
import json
import urllib.parse
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 5173
MAX_SIZE = 10_000_000  # 10 MB


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/ics":
            return self.send_error(404)

        # Só aceita pedidos vindos do próprio app
        origin = self.headers.get("Origin")
        if origin and urllib.parse.urlparse(origin).hostname not in ("localhost", "127.0.0.1"):
            return self.send_error(403)

        try:
            length = int(self.headers.get("Content-Length", 0))
            url = json.loads(self.rfile.read(length) or b"{}").get("url", "").strip()
            if url.startswith("webcal://"):
                url = "https://" + url[len("webcal://"):]

            parsed = urllib.parse.urlparse(url)
            is_local = parsed.hostname in ("localhost", "127.0.0.1")
            if not (parsed.scheme == "https" or (parsed.scheme == "http" and is_local)):
                raise ValueError("Use um link que comece com https://")

            request = urllib.request.Request(url, headers={"User-Agent": "TaskON/1.0"})
            with urllib.request.urlopen(request, timeout=15) as response:
                body = response.read(MAX_SIZE)

            if not body.lstrip(b"\xef\xbb\xbf \r\n").startswith(b"BEGIN:VCALENDAR"):
                raise ValueError("Esse link não é de uma agenda iCal (.ics)")

            self._send(200, body, "text/calendar; charset=utf-8")
        except Exception as error:  # noqa: BLE001 - qualquer falha vira mensagem para o app
            message = json.dumps({"error": str(error)}).encode()
            self._send(502, message, "application/json")

    def _send(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler, directory=str(ROOT)))
    print(f"TaskON rodando em http://localhost:{PORT}  (Ctrl+C para parar)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
