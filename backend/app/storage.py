"""Persistência dos leads em SQLite.

Uma conexão por operação, aberta e fechada na hora: o volume é baixo e
conexão de vida longa em SQLite sob servidor web é fonte clássica de
"database is locked". WAL ligado pra leitura não travar escrita.
"""

import contextlib
import sqlite3
import uuid
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    criado_em TEXT NOT NULL,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    email_enviado INTEGER NOT NULL DEFAULT 0,
    telegram_enviado INTEGER NOT NULL DEFAULT 0,
    erro_notificacao TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_leads_criado_em ON leads (criado_em);
CREATE INDEX IF NOT EXISTS idx_leads_ip_hash ON leads (ip_hash, criado_em);
"""


def agora_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextlib.contextmanager
def _conectar(db_path: str):
    """Conexao por operacao, sempre fechada.

    `with sqlite3.connect(...)` sozinho faz commit mas nao fecha, entao o
    fechamento fica explicito aqui: e o unico lugar do modulo que precisa
    saber disso.
    """
    conexao = sqlite3.connect(db_path, timeout=5)
    conexao.row_factory = sqlite3.Row
    conexao.execute("PRAGMA journal_mode=WAL")
    try:
        with conexao:
            yield conexao
    finally:
        conexao.close()


def criar_schema(db_path: str) -> None:
    with _conectar(db_path) as conexao:
        conexao.executescript(SCHEMA)


def inserir_lead(
    db_path: str,
    nome: str,
    email: str,
    mensagem: str,
    ip_hash: str,
    user_agent: str,
) -> str:
    lead_id = str(uuid.uuid4())
    with _conectar(db_path) as conexao:
        conexao.execute(
            "INSERT INTO leads (id, criado_em, nome, email, mensagem, ip_hash,"
            " user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                lead_id,
                agora_iso(),
                nome,
                email,
                mensagem,
                ip_hash,
                user_agent[:300],
            ),
        )
    return lead_id


def buscar_lead(db_path: str, lead_id: str):
    with _conectar(db_path) as conexao:
        linha = conexao.execute(
            "SELECT * FROM leads WHERE id = ?", (lead_id,)
        ).fetchone()
    return dict(linha) if linha else None


SEPARADOR_ERRO = " | "


def _erros_dos_outros_canais(atual: str, canal: str) -> list:
    """Erros gravados que NÃO são deste canal.

    A coluna erro_notificacao é uma só para os dois canais, então cada
    escrita precisa preservar o que o outro canal deixou lá.
    """
    if not atual:
        return []
    prefixo = f"{canal}: "
    return [
        parte
        for parte in atual.split(SEPARADOR_ERRO)
        if parte and not parte.startswith(prefixo)
    ]


def marcar_envio(
    db_path: str, lead_id: str, canal: str, ok: bool, erro: str = ""
) -> None:
    """Registra o resultado de um canal sem apagar o do outro.

    Sucesso limpa o erro anterior DESTE canal: sem isso, um reenvio bem
    sucedido deixaria uma mensagem de falha velha ao lado de enviado=1, e
    quem lesse a tabela depois concluiria que o aviso falhou.
    """
    if canal not in ("email", "telegram"):
        raise ValueError("canal precisa ser 'email' ou 'telegram'")
    coluna = "email_enviado" if canal == "email" else "telegram_enviado"
    with _conectar(db_path) as conexao:
        linha = conexao.execute(
            "SELECT erro_notificacao FROM leads WHERE id = ?", (lead_id,)
        ).fetchone()
        if linha is None:
            return
        partes = _erros_dos_outros_canais(linha[0], canal)
        if not ok:
            partes.append(f"{canal}: {erro}")
        texto = SEPARADOR_ERRO.join(partes)[:500]
        conexao.execute(
            f"UPDATE leads SET {coluna} = ?, erro_notificacao = ? WHERE id = ?",
            (1 if ok else 0, texto, lead_id),
        )


def contar_por_ip(db_path: str, ip_hash: str, desde_iso: str) -> int:
    with _conectar(db_path) as conexao:
        return conexao.execute(
            "SELECT COUNT(*) FROM leads WHERE ip_hash = ? AND criado_em >= ?",
            (ip_hash, desde_iso),
        ).fetchone()[0]


def contar_desde(db_path: str, desde_iso: str) -> int:
    with _conectar(db_path) as conexao:
        return conexao.execute(
            "SELECT COUNT(*) FROM leads WHERE criado_em >= ?", (desde_iso,)
        ).fetchone()[0]


def pendentes(db_path: str) -> list:
    with _conectar(db_path) as conexao:
        linhas = conexao.execute(
            "SELECT * FROM leads WHERE email_enviado = 0 OR telegram_enviado = 0"
            " ORDER BY criado_em"
        ).fetchall()
    return [dict(linha) for linha in linhas]
