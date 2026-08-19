#!/usr/bin/env python3
"""Serviço de autenticação por cookie para o dashboard Cartão Mestre.

Substitui o HTTP Basic Auth do nginx por uma sessão de cookie assinada,
pra permitir uma página de login com estilo próprio — o navegador não
deixa estilizar a caixinha nativa do Basic Auth.

Endpoints:
  POST /login   {"username": "...", "password": "..."}  -> Set-Cookie + 200 / 401
  POST /logout  -> limpa o cookie, 200
  GET  /verify  -> 200 se o cookie de sessão é válido, 401 caso contrário
                   (chamado pelo nginx via auth_request — sub-requisição
                   interna, não é o navegador batendo aqui direto)

Usuários ficam em /etc/cartao-mestre/users.txt, uma linha por usuário:
  usuario:salt_hex:sha256_hex(salt + senha)
Gerencie com manage_users.py (add/del/list) — nunca editar esse arquivo à mão.

Sem dependências externas de propósito (só stdlib) pra não precisar de
venv/pip nesse serviço pequeno.
"""
import hashlib
import hmac
import http.server
import json
import os
import secrets
import time

USERS_FILE = "/etc/cartao-mestre/users.txt"
SECRET_FILE = "/etc/cartao-mestre/secret.key"
SESSION_TTL = 12 * 3600  # 12h
COOKIE_NAME = "cm_session"
LISTEN = ("127.0.0.1", 8082)


def _load_secret():
    if not os.path.exists(SECRET_FILE):
        os.makedirs(os.path.dirname(SECRET_FILE), exist_ok=True)
        with open(SECRET_FILE, "w") as f:
            f.write(secrets.token_hex(32))
        os.chmod(SECRET_FILE, 0o600)
    with open(SECRET_FILE) as f:
        return f.read().strip()


SECRET = _load_secret()


def _load_users():
    users = {}
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split(":")
                if len(parts) == 3:
                    users[parts[0]] = (parts[1], parts[2])
    return users


def check_password(username, password):
    users = _load_users()
    if username not in users:
        return False
    salt, expected = users[username]
    got = hashlib.sha256((salt + password).encode()).hexdigest()
    return hmac.compare_digest(got, expected)


def make_token(username):
    exp = int(time.time()) + SESSION_TTL
    payload = f"{username}|{exp}"
    sig = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}|{sig}"


def verify_token(token):
    try:
        username, exp, sig = token.split("|")
    except (ValueError, AttributeError):
        return None
    payload = f"{username}|{exp}"
    expected_sig = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return None
    if int(exp) < time.time():
        return None
    return username


def get_cookie(headers, name):
    raw = headers.get("Cookie", "")
    for part in raw.split(";"):
        part = part.strip()
        if part.startswith(name + "="):
            return part[len(name) + 1:]
    return None


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "cartao-mestre-auth/1.0"

    def log_message(self, fmt, *args):
        pass  # o journal do systemd já guarda o essencial via stdout/stderr

    def _send_json(self, status, obj, extra_headers=None):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        for k, v in extra_headers or []:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/verify"):
            token = get_cookie(self.headers, COOKIE_NAME)
            username = verify_token(token) if token else None
            if username:
                self.send_response(200)
                self.send_header("X-User", username)
                self.send_header("Content-Length", "0")
                self.end_headers()
            else:
                self.send_response(401)
                self.send_header("Content-Length", "0")
                self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            data = {}

        if self.path.startswith("/login"):
            username = (data.get("username") or "").strip()
            password = data.get("password") or ""
            if username and check_password(username, password):
                token = make_token(username)
                cookie = (
                    f"{COOKIE_NAME}={token}; Path=/; Max-Age={SESSION_TTL}; "
                    f"HttpOnly; Secure; SameSite=Lax"
                )
                self._send_json(200, {"ok": True}, [("Set-Cookie", cookie)])
            else:
                self._send_json(401, {"ok": False, "error": "Usuário ou senha inválidos."})
            return

        if self.path.startswith("/logout"):
            cookie = f"{COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
            self._send_json(200, {"ok": True}, [("Set-Cookie", cookie)])
            return

        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    httpd = http.server.ThreadingHTTPServer(LISTEN, Handler)
    print(f"cartao-mestre-auth ouvindo em {LISTEN[0]}:{LISTEN[1]}")
    httpd.serve_forever()
