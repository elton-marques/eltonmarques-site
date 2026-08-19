#!/usr/bin/env python3
"""Gerencia os usuários do login do dashboard Cartão Mestre.

Uso:
  python3 manage_users.py add <usuario> <senha>   # cria ou troca a senha
  python3 manage_users.py del <usuario>
  python3 manage_users.py list

Grava em /etc/cartao-mestre/users.txt (salt+sha256 por usuário — não é
Basic Auth do nginx, é o arquivo lido pelo server.py do serviço de login).
"""
import hashlib
import secrets
import sys

USERS_FILE = "/etc/cartao-mestre/users.txt"


def load():
    try:
        with open(USERS_FILE) as f:
            return [l.rstrip("\n") for l in f if l.strip()]
    except FileNotFoundError:
        return []


def save(lines):
    with open(USERS_FILE, "w") as f:
        f.write("\n".join(lines) + ("\n" if lines else ""))


def cmd_add(username, password):
    lines = [l for l in load() if not l.startswith(username + ":")]
    salt = secrets.token_hex(16)
    h = hashlib.sha256((salt + password).encode()).hexdigest()
    lines.append(f"{username}:{salt}:{h}")
    save(lines)
    print(f"Usuário '{username}' salvo/atualizado.")


def cmd_del(username):
    lines = load()
    new_lines = [l for l in lines if not l.startswith(username + ":")]
    if len(new_lines) == len(lines):
        print(f"Usuário '{username}' não encontrado.")
        return
    save(new_lines)
    print(f"Usuário '{username}' removido.")


def cmd_list():
    for l in load():
        print(l.split(":")[0])


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd == "add" and len(sys.argv) == 4:
        cmd_add(sys.argv[2], sys.argv[3])
    elif cmd == "del" and len(sys.argv) == 3:
        cmd_del(sys.argv[2])
    elif cmd == "list":
        cmd_list()
    else:
        print(__doc__)
        sys.exit(1)
