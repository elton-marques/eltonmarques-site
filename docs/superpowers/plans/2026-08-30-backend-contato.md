# Backend de contato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o formulário do site entregar o lead no servidor, guardá-lo em SQLite e avisar por e-mail (Resend) e Telegram, sem depender do cliente de e-mail do visitante.

**Architecture:** Serviço FastAPI novo (`backend/`) rodando sob systemd em `127.0.0.1:8082`, roteado por um `location /api/` no nginx do hub que já existe. O handler grava o lead primeiro, responde `202`, e só então dispara as notificações em background — falha de notificação nunca perde o contato.

**Tech Stack:** Python 3.12, FastAPI, uvicorn, Pydantic v2, httpx, SQLite (módulo `sqlite3` da stdlib), pytest.

**Spec:** `docs/superpowers/specs/2026-08-30-backend-contato-design.md`

## Global Constraints

- Python 3.12 (versão da VPS: 3.12.3).
- Sem dependência de banco externo. Persistência é SQLite via `sqlite3` da stdlib.
- Nenhum teste faz chamada de rede. Resend, Telegram e o `siteverify` do Turnstile são sempre mockados.
- O serviço escuta apenas em `127.0.0.1:8082`. Nunca em `0.0.0.0`.
- Segredos só via variável de ambiente. Nenhum valor real entra no repositório; o repo versiona apenas `backend/.env.example`.
- Código, comentários, mensagens de commit e documentação em português, sem travessão (`—`), seguindo o resto do repositório.
- Limites fixados na spec: 5 envios/hora por IP, 100 envios aceitos/dia no serviço inteiro, mensagem de 10 a 2000 caracteres, nome de 2 a 80, e-mail até 120.
- Todos os comandos de teste rodam a partir de `backend/`.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `backend/requirements.txt` | dependências de runtime e teste |
| `backend/.env.example` | nomes das variáveis, sem valores |
| `backend/pytest.ini` | configuração do pytest |
| `backend/app/__init__.py` | pacote |
| `backend/app/config.py` | leitura das variáveis de ambiente |
| `backend/app/schemas.py` | contrato de entrada e saída |
| `backend/app/storage.py` | SQLite: schema, inserção, contagens, pendentes, marcação |
| `backend/app/notify.py` | Resend e Telegram |
| `backend/app/antispam.py` | Turnstile e limites |
| `backend/app/main.py` | rotas e orquestração |
| `backend/app/reenviar.py` | comando de reenvio de notificações pendentes |
| `backend/tests/conftest.py` | fixtures (banco temporário, cliente de teste) |
| `backend/tests/test_*.py` | testes por módulo |
| `deploy/systemd/hub-api.service` | unit do systemd |
| `deploy/nginx/hub.conf` | ganha o `location /api/` |
| `deploy/hub/index.html` | formulário passa a usar `fetch` |
| `deploy/README.md` | documentação do deploy do serviço |

---

### Task 1: Esqueleto do serviço e `/api/health`

**Files:**
- Create: `backend/requirements.txt`, `backend/.env.example`, `backend/pytest.ini`, `backend/app/__init__.py`, `backend/app/config.py`, `backend/app/main.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Consumes: nada
- Produces: `app.config.Config` (dataclass com os campos `db_path: str`, `resend_api_key: str`, `resend_from: str`, `resend_to: str`, `telegram_token: str`, `telegram_chat_id: str`, `turnstile_secret: str`, `ip_hash_salt: str`, `versao: str`, `origem_permitida: str`), a função `app.config.carregar() -> Config` e a aplicação `app.main.app`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

cliente = TestClient(app)


def test_health_responde_ok():
    resposta = cliente.get("/api/health")

    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok", "versao": "dev"}
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
cd backend && python -m pytest tests/test_health.py -v
```

Esperado: FAIL com `ModuleNotFoundError: No module named 'app'`.

- [ ] **Step 3: Criar dependências e configuração do pytest**

`backend/requirements.txt`:

```
fastapi>=0.115
uvicorn[standard]>=0.34
pydantic[email]>=2.10
httpx>=0.28
pytest>=8.3
```

`backend/pytest.ini`:

```ini
[pytest]
testpaths = tests
pythonpath = .
```

Instalar num virtualenv local:

```bash
cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
```

(Na VPS o venv fica em `/opt/hub-api/venv`; ver Task 9.)

- [ ] **Step 4: Escrever a configuração**

`backend/app/__init__.py`: arquivo vazio.

`backend/app/config.py`:

```python
"""Leitura das variáveis de ambiente.

Uma função só, chamada uma vez no import do main. Tudo tem default de
desenvolvimento, exceto os segredos: sem eles o serviço sobe e responde,
mas as integrações ficam desligadas de propósito (ver notify e antispam),
pra dar pra rodar e testar a API na máquina local sem conta em serviço
nenhum.
"""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    db_path: str
    resend_api_key: str
    resend_from: str
    resend_to: str
    telegram_token: str
    telegram_chat_id: str
    turnstile_secret: str
    ip_hash_salt: str
    versao: str
    origem_permitida: str


def carregar() -> Config:
    return Config(
        db_path=os.environ.get("HUB_API_DB", "leads.db"),
        resend_api_key=os.environ.get("RESEND_API_KEY", ""),
        resend_from=os.environ.get("RESEND_FROM", "site@eltonmarques.com"),
        resend_to=os.environ.get("RESEND_TO", "contato@eltonmarques.com"),
        telegram_token=os.environ.get("TELEGRAM_BOT_TOKEN", ""),
        telegram_chat_id=os.environ.get("TELEGRAM_CHAT_ID", ""),
        turnstile_secret=os.environ.get("TURNSTILE_SECRET", ""),
        ip_hash_salt=os.environ.get("IP_HASH_SALT", "dev"),
        versao=os.environ.get("APP_VERSION", "dev"),
        origem_permitida=os.environ.get(
            "ORIGEM_PERMITIDA", "https://eltonmarques.com"
        ),
    )
```

`backend/.env.example`:

```
# copiar pra /etc/hub-api.env na VPS (chmod 600, dono root)
HUB_API_DB=/var/lib/hub-api/leads.db
RESEND_API_KEY=
RESEND_FROM=site@eltonmarques.com
RESEND_TO=contato@eltonmarques.com
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TURNSTILE_SECRET=
IP_HASH_SALT=
APP_VERSION=dev
ORIGEM_PERMITIDA=https://eltonmarques.com
```

- [ ] **Step 5: Escrever a aplicação mínima**

`backend/app/main.py`:

```python
"""API do hub. Por enquanto: health e (nas próximas tasks) contato."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config

CONFIG = config.carregar()

app = FastAPI(title="hub-api", docs_url=None, redoc_url=None)

# CORS restrito: o único front que fala com esta API é o próprio site.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[CONFIG.origem_permitida],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "versao": CONFIG.versao}
```

- [ ] **Step 6: Rodar o teste e ver passar**

```bash
cd backend && python -m pytest tests/test_health.py -v
```

Esperado: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(backend): esqueleto FastAPI com /api/health"
```

---

### Task 2: Contrato de entrada e erro de validação

**Files:**
- Create: `backend/app/schemas.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_validacao.py`

**Interfaces:**
- Consumes: `app.main.app`
- Produces: `app.schemas.ContatoIn` com os campos `nome: str`, `email: EmailStr`, `mensagem: str`, `empresa: str = ""`, `turnstile_token: str = ""`. Rota `POST /api/contato` respondendo `400` no corpo `{"ok": false, "erro": "validacao", "campos": {<campo>: <mensagem>}}`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `backend/tests/test_validacao.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

cliente = TestClient(app)

VALIDO = {
    "nome": "Fulano de Tal",
    "email": "fulano@exemplo.com",
    "mensagem": "Tenho um processo manual travando a operação, podemos falar?",
    "empresa": "",
    "turnstile_token": "token-qualquer",
}


def test_nome_curto_devolve_400():
    resposta = cliente.post("/api/contato", json={**VALIDO, "nome": "A"})

    assert resposta.status_code == 400
    corpo = resposta.json()
    assert corpo["ok"] is False
    assert corpo["erro"] == "validacao"
    assert "nome" in corpo["campos"]


def test_email_invalido_devolve_400():
    resposta = cliente.post("/api/contato", json={**VALIDO, "email": "nao-e-email"})

    assert resposta.status_code == 400
    assert "email" in resposta.json()["campos"]


def test_mensagem_curta_devolve_400():
    resposta = cliente.post("/api/contato", json={**VALIDO, "mensagem": "oi"})

    assert resposta.status_code == 400
    assert "mensagem" in resposta.json()["campos"]


def test_mensagem_longa_demais_devolve_400():
    resposta = cliente.post(
        "/api/contato", json={**VALIDO, "mensagem": "x" * 2001}
    )

    assert resposta.status_code == 400
    assert "mensagem" in resposta.json()["campos"]
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd backend && python -m pytest tests/test_validacao.py -v
```

Esperado: FAIL com `404` (rota ainda não existe).

- [ ] **Step 3: Escrever o schema**

`backend/app/schemas.py`:

```python
"""Contrato de entrada do formulário.

Os limites vêm da spec e existem por dois motivos: cortar lixo antes de
tocar no banco e impedir que um bot use o campo de mensagem como espaço
de armazenamento gratuito.
"""

from pydantic import BaseModel, EmailStr, Field


class ContatoIn(BaseModel):
    nome: str = Field(min_length=2, max_length=80)
    email: EmailStr = Field(max_length=120)
    mensagem: str = Field(min_length=10, max_length=2000)
    # honeypot: precisa chegar vazio. Não é validado aqui de propósito,
    # porque a resposta pra bot é 403 (recusado), não 400 (validação).
    empresa: str = ""
    turnstile_token: str = ""
```

- [ ] **Step 4: Ligar a rota e traduzir o erro do Pydantic**

Em `backend/app/main.py`, adicionar os imports e o handler:

```python
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import config
from app.schemas import ContatoIn
```

E, depois do `add_middleware`:

```python
@app.exception_handler(RequestValidationError)
def erro_de_validacao(request: Request, exc: RequestValidationError):
    """O 422 padrão do FastAPI vaza a estrutura interna do Pydantic.

    O front só precisa saber QUAL campo está errado pra destacar o input,
    então a resposta vira um mapa simples campo -> mensagem.
    """
    campos = {}
    for erro in exc.errors():
        caminho = [parte for parte in erro["loc"] if parte != "body"]
        if caminho:
            campos[str(caminho[0])] = erro["msg"]
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"ok": False, "erro": "validacao", "campos": campos},
    )


@app.post("/api/contato")
def contato(dados: ContatoIn):
    return {"ok": True, "id": "ainda-nao-implementado"}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd backend && python -m pytest -v
```

Esperado: PASS em todos.

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat(backend): valida o contrato do formulario e devolve 400 por campo"
```

---

### Task 3: Persistência em SQLite

**Files:**
- Create: `backend/app/storage.py`, `backend/tests/conftest.py`
- Test: `backend/tests/test_storage.py`

**Interfaces:**
- Consumes: `app.config.Config`
- Produces:
  - `storage.criar_schema(db_path: str) -> None`
  - `storage.inserir_lead(db_path: str, nome: str, email: str, mensagem: str, ip_hash: str, user_agent: str) -> str` (devolve o id)
  - `storage.buscar_lead(db_path: str, lead_id: str) -> dict | None`
  - `storage.marcar_envio(db_path: str, lead_id: str, canal: str, ok: bool, erro: str = "") -> None` com `canal` em `{"email", "telegram"}`
  - `storage.contar_por_ip(db_path: str, ip_hash: str, desde_iso: str) -> int`
  - `storage.contar_desde(db_path: str, desde_iso: str) -> int`
  - `storage.pendentes(db_path: str) -> list[dict]`
  - `storage.agora_iso() -> str`

- [ ] **Step 1: Escrever os testes que falham**

Criar `backend/tests/conftest.py`:

```python
import pytest

from app import storage


@pytest.fixture()
def db(tmp_path):
    """Banco novo por teste, em disco temporário.

    Em disco e não em :memory: porque o código abre uma conexão por
    operação (é o padrão certo pra SQLite sob servidor web), e um banco
    em memória morreria junto com a primeira conexão.
    """
    caminho = str(tmp_path / "leads.db")
    storage.criar_schema(caminho)
    return caminho
```

Criar `backend/tests/test_storage.py`:

```python
from app import storage


def test_inserir_devolve_id_e_guarda_os_campos(db):
    lead_id = storage.inserir_lead(
        db,
        nome="Fulano",
        email="fulano@exemplo.com",
        mensagem="mensagem de teste com tamanho suficiente",
        ip_hash="abc123",
        user_agent="pytest",
    )

    lead = storage.buscar_lead(db, lead_id)
    assert lead["nome"] == "Fulano"
    assert lead["email"] == "fulano@exemplo.com"
    assert lead["email_enviado"] == 0
    assert lead["telegram_enviado"] == 0


def test_marcar_envio_com_sucesso(db):
    lead_id = storage.inserir_lead(
        db, "Fulano", "f@e.com", "mensagem longa o bastante", "abc", "pytest"
    )

    storage.marcar_envio(db, lead_id, "email", True)

    assert storage.buscar_lead(db, lead_id)["email_enviado"] == 1


def test_marcar_envio_com_falha_guarda_o_erro(db):
    lead_id = storage.inserir_lead(
        db, "Fulano", "f@e.com", "mensagem longa o bastante", "abc", "pytest"
    )

    storage.marcar_envio(db, lead_id, "email", False, "timeout")

    lead = storage.buscar_lead(db, lead_id)
    assert lead["email_enviado"] == 0
    assert "timeout" in lead["erro_notificacao"]


def test_contar_por_ip_so_conta_o_mesmo_ip(db):
    for _ in range(3):
        storage.inserir_lead(
            db, "A", "a@e.com", "mensagem longa o bastante", "ip-1", "pytest"
        )
    storage.inserir_lead(
        db, "B", "b@e.com", "mensagem longa o bastante", "ip-2", "pytest"
    )

    assert storage.contar_por_ip(db, "ip-1", "2000-01-01T00:00:00+00:00") == 3


def test_contar_desde_ignora_o_que_e_mais_antigo(db):
    storage.inserir_lead(
        db, "A", "a@e.com", "mensagem longa o bastante", "ip-1", "pytest"
    )

    assert storage.contar_desde(db, "2000-01-01T00:00:00+00:00") == 1
    assert storage.contar_desde(db, "2999-01-01T00:00:00+00:00") == 0


def test_pendentes_traz_so_quem_falta_notificar(db):
    completo = storage.inserir_lead(
        db, "A", "a@e.com", "mensagem longa o bastante", "ip", "pytest"
    )
    storage.marcar_envio(db, completo, "email", True)
    storage.marcar_envio(db, completo, "telegram", True)
    faltando = storage.inserir_lead(
        db, "B", "b@e.com", "mensagem longa o bastante", "ip", "pytest"
    )

    ids = [lead["id"] for lead in storage.pendentes(db)]
    assert ids == [faltando]
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd backend && python -m pytest tests/test_storage.py -v
```

Esperado: FAIL com `AttributeError: module 'app.storage' has no attribute 'criar_schema'` (ou `ModuleNotFoundError`).

- [ ] **Step 3: Escrever o módulo**

`backend/app/storage.py`:

```python
"""Persistência dos leads em SQLite.

Uma conexão por operação, aberta e fechada na hora: o volume é baixo e
conexão de vida longa em SQLite sob servidor web é fonte clássica de
"database is locked". WAL ligado pra leitura não travar escrita.
"""

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


def _conectar(db_path: str) -> sqlite3.Connection:
    conexao = sqlite3.connect(db_path, timeout=5)
    conexao.row_factory = sqlite3.Row
    conexao.execute("PRAGMA journal_mode=WAL")
    return conexao


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


def marcar_envio(
    db_path: str, lead_id: str, canal: str, ok: bool, erro: str = ""
) -> None:
    if canal not in ("email", "telegram"):
        raise ValueError("canal precisa ser 'email' ou 'telegram'")
    coluna = "email_enviado" if canal == "email" else "telegram_enviado"
    with _conectar(db_path) as conexao:
        if ok:
            conexao.execute(
                f"UPDATE leads SET {coluna} = 1 WHERE id = ?", (lead_id,)
            )
        else:
            conexao.execute(
                "UPDATE leads SET erro_notificacao = ? WHERE id = ?",
                (f"{canal}: {erro}"[:500], lead_id),
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
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd backend && python -m pytest tests/test_storage.py -v
```

Esperado: PASS nos 6 testes.

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat(backend): persistencia dos leads em SQLite"
```

---

### Task 4: Turnstile, honeypot e limites

**Files:**
- Create: `backend/app/antispam.py`
- Test: `backend/tests/test_antispam.py`

**Interfaces:**
- Consumes: `app.storage`, `app.config.Config`
- Produces:
  - `antispam.hash_ip(ip: str, sal: str) -> str`
  - `antispam.verificar_turnstile(token: str, ip: str, segredo: str) -> bool` (segredo vazio devolve `True` sem chamar rede)
  - `antispam.dentro_dos_limites(db_path: str, ip_hash: str) -> bool`
  - Constantes `LIMITE_POR_IP_HORA = 5` e `LIMITE_DIARIO = 100`

- [ ] **Step 1: Escrever os testes que falham**

Criar `backend/tests/test_antispam.py`:

```python
import httpx
import pytest

from app import antispam, storage


def test_hash_ip_e_estavel_e_nao_devolve_o_ip():
    resultado = antispam.hash_ip("203.0.113.7", "sal")

    assert resultado == antispam.hash_ip("203.0.113.7", "sal")
    assert "203.0.113.7" not in resultado


def test_hash_ip_muda_com_o_sal():
    assert antispam.hash_ip("203.0.113.7", "a") != antispam.hash_ip(
        "203.0.113.7", "b"
    )


def test_turnstile_sem_segredo_configurado_libera(monkeypatch):
    def explodir(*args, **kwargs):
        raise AssertionError("não deveria chamar a rede sem segredo")

    monkeypatch.setattr(httpx, "post", explodir)

    assert antispam.verificar_turnstile("token", "1.2.3.4", "") is True


def test_turnstile_aprovado(monkeypatch):
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *a, **k: httpx.Response(200, json={"success": True}),
    )

    assert antispam.verificar_turnstile("token", "1.2.3.4", "segredo") is True


def test_turnstile_reprovado(monkeypatch):
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *a, **k: httpx.Response(200, json={"success": False}),
    )

    assert antispam.verificar_turnstile("token", "1.2.3.4", "segredo") is False


def test_turnstile_fora_do_ar_reprova(monkeypatch):
    def cair(*args, **kwargs):
        raise httpx.ConnectError("sem rede")

    monkeypatch.setattr(httpx, "post", cair)

    assert antispam.verificar_turnstile("token", "1.2.3.4", "segredo") is False


def test_limite_por_ip(db):
    for _ in range(antispam.LIMITE_POR_IP_HORA):
        storage.inserir_lead(
            db, "A", "a@e.com", "mensagem longa o bastante", "ip-1", "pytest"
        )

    assert antispam.dentro_dos_limites(db, "ip-1") is False
    assert antispam.dentro_dos_limites(db, "ip-2") is True


def test_limite_diario_global(db, monkeypatch):
    monkeypatch.setattr(antispam, "LIMITE_DIARIO", 2)
    for indice in range(2):
        storage.inserir_lead(
            db, "A", "a@e.com", "mensagem longa o bastante", f"ip-{indice}", "pytest"
        )

    assert antispam.dentro_dos_limites(db, "ip-novo") is False
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd backend && python -m pytest tests/test_antispam.py -v
```

Esperado: FAIL com `ModuleNotFoundError: No module named 'app.antispam'`.

- [ ] **Step 3: Escrever o módulo**

`backend/app/antispam.py`:

```python
"""Barreiras contra bot: Turnstile, hash de IP e limites de volume.

O honeypot não mora aqui: ele é uma checagem de uma linha no handler,
porque depende do corpo da requisição e não de estado nenhum.
"""

import hashlib
from datetime import datetime, timedelta, timezone

import httpx

from app import storage

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
LIMITE_POR_IP_HORA = 5
LIMITE_DIARIO = 100


def hash_ip(ip: str, sal: str) -> str:
    """Guardar o IP inteiro não é necessário pra limitar por origem."""
    return hashlib.sha256(f"{sal}:{ip}".encode()).hexdigest()


def verificar_turnstile(token: str, ip: str, segredo: str) -> bool:
    """Valida o token no servidor.

    Sem segredo configurado (desenvolvimento local), libera sem tocar na
    rede. Qualquer falha de rede REPROVA: numa página de contato, deixar
    passar durante uma instabilidade da Cloudflare é convite pra bot.
    """
    if not segredo:
        return True
    try:
        resposta = httpx.post(
            VERIFY_URL,
            data={"secret": segredo, "response": token, "remoteip": ip},
            timeout=5,
        )
        return bool(resposta.json().get("success"))
    except Exception:
        return False


def dentro_dos_limites(db_path: str, ip_hash: str) -> bool:
    agora = datetime.now(timezone.utc)
    uma_hora_atras = (agora - timedelta(hours=1)).isoformat()
    um_dia_atras = (agora - timedelta(days=1)).isoformat()

    if storage.contar_por_ip(db_path, ip_hash, uma_hora_atras) >= LIMITE_POR_IP_HORA:
        return False
    return storage.contar_desde(db_path, um_dia_atras) < LIMITE_DIARIO
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd backend && python -m pytest tests/test_antispam.py -v
```

Esperado: PASS nos 8 testes.

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat(backend): turnstile validado no servidor, hash de IP e limites"
```

---

### Task 5: Notificações (Resend e Telegram)

**Files:**
- Create: `backend/app/notify.py`
- Test: `backend/tests/test_notify.py`

**Interfaces:**
- Consumes: `app.config.Config`, `app.storage`
- Produces:
  - `notify.enviar_email(lead: dict, cfg: Config) -> tuple[bool, str]`
  - `notify.enviar_telegram(lead: dict, cfg: Config) -> tuple[bool, str]`
  - `notify.notificar(db_path: str, lead_id: str, cfg: Config) -> None` (busca o lead, envia pelos dois canais e marca cada um no banco)

- [ ] **Step 1: Escrever os testes que falham**

Criar `backend/tests/test_notify.py`:

```python
import httpx

from app import config, notify, storage

CFG = config.Config(
    db_path="",
    resend_api_key="chave",
    resend_from="site@eltonmarques.com",
    resend_to="contato@eltonmarques.com",
    telegram_token="token",
    telegram_chat_id="123",
    turnstile_secret="",
    ip_hash_salt="sal",
    versao="teste",
    origem_permitida="https://eltonmarques.com",
)

LEAD = {
    "id": "abc",
    "criado_em": "2026-08-30T12:00:00+00:00",
    "nome": "Fulano",
    "email": "fulano@exemplo.com",
    "mensagem": "processo manual travando a operação",
}


def test_email_usa_reply_to_do_lead(monkeypatch):
    capturado = {}

    def falso_post(url, **kwargs):
        capturado["url"] = url
        capturado["json"] = kwargs.get("json")
        return httpx.Response(200, json={"id": "email-1"})

    monkeypatch.setattr(httpx, "post", falso_post)

    ok, erro = notify.enviar_email(LEAD, CFG)

    assert ok is True
    assert erro == ""
    assert "api.resend.com" in capturado["url"]
    assert capturado["json"]["reply_to"] == "fulano@exemplo.com"
    assert capturado["json"]["to"] == ["contato@eltonmarques.com"]


def test_email_sem_chave_configurada_nao_chama_rede(monkeypatch):
    def explodir(*a, **k):
        raise AssertionError("não deveria chamar a rede sem chave")

    monkeypatch.setattr(httpx, "post", explodir)
    sem_chave = config.Config(**{**CFG.__dict__, "resend_api_key": ""})

    ok, erro = notify.enviar_email(LEAD, sem_chave)

    assert ok is False
    assert "nao configurado" in erro


def test_email_com_erro_http_devolve_a_falha(monkeypatch):
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: httpx.Response(422, text="dominio invalido")
    )

    ok, erro = notify.enviar_email(LEAD, CFG)

    assert ok is False
    assert "422" in erro


def test_telegram_manda_para_o_chat_configurado(monkeypatch):
    capturado = {}

    def falso_post(url, **kwargs):
        capturado["url"] = url
        capturado["json"] = kwargs.get("json")
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(httpx, "post", falso_post)

    ok, _ = notify.enviar_telegram(LEAD, CFG)

    assert ok is True
    assert "bot" in capturado["url"]
    assert capturado["json"]["chat_id"] == "123"
    assert "Fulano" in capturado["json"]["text"]


def test_notificar_marca_os_dois_canais(db, monkeypatch):
    lead_id = storage.inserir_lead(
        db, "Fulano", "f@e.com", "mensagem longa o bastante", "ip", "pytest"
    )
    monkeypatch.setattr(notify, "enviar_email", lambda lead, cfg: (True, ""))
    monkeypatch.setattr(notify, "enviar_telegram", lambda lead, cfg: (True, ""))

    notify.notificar(db, lead_id, CFG)

    lead = storage.buscar_lead(db, lead_id)
    assert lead["email_enviado"] == 1
    assert lead["telegram_enviado"] == 1


def test_notificar_registra_falha_sem_derrubar_o_outro_canal(db, monkeypatch):
    lead_id = storage.inserir_lead(
        db, "Fulano", "f@e.com", "mensagem longa o bastante", "ip", "pytest"
    )
    monkeypatch.setattr(notify, "enviar_email", lambda lead, cfg: (False, "timeout"))
    monkeypatch.setattr(notify, "enviar_telegram", lambda lead, cfg: (True, ""))

    notify.notificar(db, lead_id, CFG)

    lead = storage.buscar_lead(db, lead_id)
    assert lead["email_enviado"] == 0
    assert lead["telegram_enviado"] == 1
    assert "timeout" in lead["erro_notificacao"]
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd backend && python -m pytest tests/test_notify.py -v
```

Esperado: FAIL com `ModuleNotFoundError: No module named 'app.notify'`.

- [ ] **Step 3: Escrever o módulo**

`backend/app/notify.py`:

```python
"""Avisos de lead novo: e-mail pela Resend e alerta no Telegram.

Nenhuma das funções levanta exceção pra fora: elas devolvem (ok, erro).
Quem chama roda em background, depois de a resposta HTTP já ter saído, e
falha de aviso não pode virar stack trace no log de request nem apagar o
lead que já está salvo.
"""

import httpx

from app import storage
from app.config import Config

RESEND_URL = "https://api.resend.com/emails"


def enviar_email(lead: dict, cfg: Config):
    if not cfg.resend_api_key:
        return False, "nao configurado: RESEND_API_KEY vazio"

    corpo = (
        f"Nome: {lead['nome']}\n"
        f"E-mail: {lead['email']}\n"
        f"Recebido em: {lead['criado_em']}\n\n"
        f"{lead['mensagem']}\n"
    )
    try:
        resposta = httpx.post(
            RESEND_URL,
            headers={"Authorization": f"Bearer {cfg.resend_api_key}"},
            json={
                "from": cfg.resend_from,
                "to": [cfg.resend_to],
                # responder o aviso responde o cliente, sem copiar endereço
                "reply_to": lead["email"],
                "subject": f"Novo contato pelo site: {lead['nome']}",
                "text": corpo,
            },
            timeout=5,
        )
        if resposta.status_code >= 300:
            return False, f"HTTP {resposta.status_code}: {resposta.text[:200]}"
        return True, ""
    except Exception as erro:
        return False, str(erro)[:200]


def enviar_telegram(lead: dict, cfg: Config):
    if not cfg.telegram_token or not cfg.telegram_chat_id:
        return False, "nao configurado: TELEGRAM_BOT_TOKEN ou CHAT_ID vazio"

    texto = (
        f"Novo lead pelo site\n"
        f"{lead['nome']} ({lead['email']})\n\n"
        f"{lead['mensagem'][:400]}"
    )
    try:
        resposta = httpx.post(
            f"https://api.telegram.org/bot{cfg.telegram_token}/sendMessage",
            json={"chat_id": cfg.telegram_chat_id, "text": texto},
            timeout=5,
        )
        if resposta.status_code >= 300:
            return False, f"HTTP {resposta.status_code}: {resposta.text[:200]}"
        return True, ""
    except Exception as erro:
        return False, str(erro)[:200]


def notificar(db_path: str, lead_id: str, cfg: Config) -> None:
    """Dispara os dois canais e registra o resultado de cada um.

    Um canal não derruba o outro: e-mail fora do ar ainda deixa o alerta
    do Telegram chegar, e vice-versa.
    """
    lead = storage.buscar_lead(db_path, lead_id)
    if not lead:
        return

    ok_email, erro_email = enviar_email(lead, cfg)
    storage.marcar_envio(db_path, lead_id, "email", ok_email, erro_email)

    ok_telegram, erro_telegram = enviar_telegram(lead, cfg)
    storage.marcar_envio(db_path, lead_id, "telegram", ok_telegram, erro_telegram)
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd backend && python -m pytest tests/test_notify.py -v
```

Esperado: PASS nos 6 testes.

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat(backend): avisos de lead por Resend e Telegram"
```

---

### Task 6: Handler completo do `POST /api/contato`

**Files:**
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_contato.py`

**Interfaces:**
- Consumes: `app.schemas.ContatoIn`, `app.storage`, `app.antispam`, `app.notify`
- Produces: rota `POST /api/contato` completa, com `202/403/429/500`, e a função `app.main.ip_do_request(request) -> str`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `backend/tests/test_contato.py`:

```python
import pytest
from fastapi.testclient import TestClient

from app import antispam, main, notify, storage

VALIDO = {
    "nome": "Fulano de Tal",
    "email": "fulano@exemplo.com",
    "mensagem": "Tenho um processo manual travando a operação, podemos falar?",
    "empresa": "",
    "turnstile_token": "token",
}


@pytest.fixture()
def cliente(db, monkeypatch):
    """Aponta o app pro banco temporário e desliga a rede.

    Config é frozen, então não dá pra alterar um campo: troca-se o objeto
    inteiro em main.CONFIG. As rotas leem esse global na hora da chamada,
    então o monkeypatch pega.
    """
    monkeypatch.setattr(
        main,
        "CONFIG",
        main.CONFIG.__class__(**{**main.CONFIG.__dict__, "db_path": db}),
    )
    monkeypatch.setattr(antispam, "verificar_turnstile", lambda *a, **k: True)
    monkeypatch.setattr(notify, "notificar", lambda *a, **k: None)
    storage.criar_schema(db)
    return TestClient(main.app)


def test_envio_valido_grava_e_devolve_202(cliente, db):
    resposta = cliente.post("/api/contato", json=VALIDO)

    assert resposta.status_code == 202
    corpo = resposta.json()
    assert corpo["ok"] is True

    lead = storage.buscar_lead(db, corpo["id"])
    assert lead["nome"] == "Fulano de Tal"


def test_honeypot_preenchido_devolve_403_e_nao_grava(cliente, db):
    resposta = cliente.post(
        "/api/contato", json={**VALIDO, "empresa": "Bot Corp"}
    )

    assert resposta.status_code == 403
    assert resposta.json()["erro"] == "recusado"
    assert storage.contar_desde(db, "2000-01-01T00:00:00+00:00") == 0


def test_turnstile_reprovado_devolve_403_e_nao_grava(cliente, db, monkeypatch):
    monkeypatch.setattr(antispam, "verificar_turnstile", lambda *a, **k: False)

    resposta = cliente.post("/api/contato", json=VALIDO)

    assert resposta.status_code == 403
    assert storage.contar_desde(db, "2000-01-01T00:00:00+00:00") == 0


def test_sexto_envio_da_mesma_origem_devolve_429(cliente, db):
    for _ in range(antispam.LIMITE_POR_IP_HORA):
        assert cliente.post("/api/contato", json=VALIDO).status_code == 202

    resposta = cliente.post("/api/contato", json=VALIDO)

    assert resposta.status_code == 429
    assert resposta.json()["erro"] == "limite"


def test_teto_diario_devolve_429(cliente, db, monkeypatch):
    monkeypatch.setattr(antispam, "LIMITE_DIARIO", 1)
    assert cliente.post("/api/contato", json=VALIDO).status_code == 202

    resposta = cliente.post("/api/contato", json=VALIDO)

    assert resposta.status_code == 429


def test_resend_fora_do_ar_nao_perde_o_lead(db, monkeypatch):
    """O teste que justifica a ordem persistir-antes-de-notificar."""
    monkeypatch.setattr(main, "CONFIG", main.CONFIG.__class__(
        **{**main.CONFIG.__dict__, "db_path": db}
    ))
    monkeypatch.setattr(antispam, "verificar_turnstile", lambda *a, **k: True)
    monkeypatch.setattr(notify, "enviar_email", lambda lead, cfg: (False, "timeout"))
    monkeypatch.setattr(notify, "enviar_telegram", lambda lead, cfg: (True, ""))
    storage.criar_schema(db)

    resposta = TestClient(main.app).post("/api/contato", json=VALIDO)

    assert resposta.status_code == 202
    lead = storage.buscar_lead(db, resposta.json()["id"])
    assert lead["email_enviado"] == 0
    assert lead["telegram_enviado"] == 1
    assert "timeout" in lead["erro_notificacao"]
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd backend && python -m pytest tests/test_contato.py -v
```

Esperado: FAIL (a rota ainda devolve o id fixo `ainda-nao-implementado`).

- [ ] **Step 3: Escrever o handler**

Substituir a rota provisória em `backend/app/main.py` por:

```python
from fastapi import BackgroundTasks, FastAPI, Request, status

from app import antispam, notify, storage


@app.on_event("startup")
def preparar_banco():
    storage.criar_schema(CONFIG.db_path)


def ip_do_request(request: Request) -> str:
    """Atrás do túnel + nginx, o IP real vem em cabeçalho.

    CF-Connecting-IP é escrito pela Cloudflare e é o mais confiável aqui;
    X-Forwarded-For fica como segundo, e o socket como último recurso
    (que em produção seria sempre 127.0.0.1, ou seja, inútil pra limite).
    """
    cabecalho = request.headers.get("cf-connecting-ip") or request.headers.get(
        "x-forwarded-for", ""
    )
    if cabecalho:
        return cabecalho.split(",")[0].strip()
    return request.client.host if request.client else "desconhecido"


@app.post("/api/contato", status_code=status.HTTP_202_ACCEPTED)
def contato(dados: ContatoIn, request: Request, tarefas: BackgroundTasks):
    # honeypot: campo escondido que só bot preenche. Resposta genérica de
    # propósito, pra não ensinar ao bot qual barreira ele derrubou.
    if dados.empresa.strip():
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"ok": False, "erro": "recusado"},
        )

    ip = ip_do_request(request)
    if not antispam.verificar_turnstile(
        dados.turnstile_token, ip, CONFIG.turnstile_secret
    ):
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"ok": False, "erro": "recusado"},
        )

    ip_hash = antispam.hash_ip(ip, CONFIG.ip_hash_salt)
    if not antispam.dentro_dos_limites(CONFIG.db_path, ip_hash):
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"ok": False, "erro": "limite"},
        )

    try:
        lead_id = storage.inserir_lead(
            CONFIG.db_path,
            nome=dados.nome.strip(),
            email=str(dados.email),
            mensagem=dados.mensagem.strip(),
            ip_hash=ip_hash,
            user_agent=request.headers.get("user-agent", ""),
        )
    except Exception:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"ok": False, "erro": "interno"},
        )

    # o lead já está salvo: daqui pra frente, falha de aviso não custa o
    # contato. Por isso a notificação vai pra background e a resposta sai.
    tarefas.add_task(notify.notificar, CONFIG.db_path, lead_id, CONFIG)
    return {"ok": True, "id": lead_id}
```

- [ ] **Step 4: Rodar a suíte inteira e ver passar**

```bash
cd backend && python -m pytest -v
```

Esperado: PASS em todos os arquivos.

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat(backend): endpoint de contato grava o lead antes de notificar"
```

---

### Task 7: Comando de reenvio

**Files:**
- Create: `backend/app/reenviar.py`
- Test: `backend/tests/test_reenviar.py`

**Interfaces:**
- Consumes: `app.storage`, `app.notify`, `app.config`
- Produces: `reenviar.processar(db_path: str, cfg: Config) -> int` (devolve quantos leads foram reprocessados) e `python -m app.reenviar` como entrada de linha de comando.

- [ ] **Step 1: Escrever os testes que falham**

Criar `backend/tests/test_reenviar.py`:

```python
from app import notify, reenviar, storage
from tests.test_notify import CFG


def test_processa_so_os_pendentes(db, monkeypatch):
    completo = storage.inserir_lead(
        db, "A", "a@e.com", "mensagem longa o bastante", "ip", "pytest"
    )
    storage.marcar_envio(db, completo, "email", True)
    storage.marcar_envio(db, completo, "telegram", True)
    pendente = storage.inserir_lead(
        db, "B", "b@e.com", "mensagem longa o bastante", "ip", "pytest"
    )

    chamados = []
    monkeypatch.setattr(
        notify, "notificar", lambda caminho, lead_id, cfg: chamados.append(lead_id)
    )

    total = reenviar.processar(db, CFG)

    assert total == 1
    assert chamados == [pendente]


def test_sem_pendentes_nao_faz_nada(db, monkeypatch):
    monkeypatch.setattr(
        notify,
        "notificar",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("não deveria chamar")),
    )

    assert reenviar.processar(db, CFG) == 0
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd backend && python -m pytest tests/test_reenviar.py -v
```

Esperado: FAIL com `ModuleNotFoundError: No module named 'app.reenviar'`.

- [ ] **Step 3: Escrever o módulo**

`backend/app/reenviar.py`:

```python
"""Reenvia as notificações que falharam.

Existe porque a notificação é best-effort: o lead entra no banco mesmo
quando Resend ou Telegram estão fora do ar. Rodar isto (à mão ou por
cron) fecha o buraco sem precisar de fila nem de processo extra.

Uso: python -m app.reenviar
"""

from app import config, notify, storage
from app.config import Config


def processar(db_path: str, cfg: Config) -> int:
    pendentes = storage.pendentes(db_path)
    for lead in pendentes:
        notify.notificar(db_path, lead["id"], cfg)
    return len(pendentes)


if __name__ == "__main__":
    cfg = config.carregar()
    total = processar(cfg.db_path, cfg)
    print(f"leads reprocessados: {total}")
```

- [ ] **Step 4: Rodar a suíte e ver passar**

```bash
cd backend && python -m pytest -v
```

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat(backend): comando de reenvio das notificacoes pendentes"
```

---

### Task 8: Formulário do site passa a usar `fetch`

**Files:**
- Modify: `deploy/hub/index.html` (bloco do formulário na seção de contato e o script `cm-contact-form` no fim do arquivo)

**Interfaces:**
- Consumes: `POST /api/contato` (contrato da Task 6)
- Produces: nenhum consumidor posterior.

- [ ] **Step 1: Adicionar o honeypot e a área de status no formulário**

Dentro do `<form id="cm-contact-form">`, antes do botão de submit:

```html
              <!-- honeypot: humano nunca vê nem tabula até aqui; bot que
               preenche formulário por nome de campo cai e leva 403. Fica
               fora do fluxo de foco e escondido de leitor de tela. -->
              <div class="cm-hp" aria-hidden="true">
                <label for="cm-empresa">Empresa</label>
                <input
                  id="cm-empresa"
                  name="empresa"
                  type="text"
                  tabindex="-1"
                  autocomplete="off"
                />
              </div>
```

Depois do botão de submit:

```html
              <p
                id="cm-form-status"
                class="cm-form-note mt-3"
                role="status"
                aria-live="polite"
              ></p>
              <noscript>
                <p class="cm-form-note mt-3">
                  Este formulário precisa de JavaScript. Sem ele, escreva
                  direto para contato@eltonmarques.com.
                </p>
              </noscript>
```

E o CSS do honeypot, junto das outras regras de formulário:

```css
      /* honeypot: fora da tela em vez de display:none, porque bot
       inteligente ignora campo com display:none */
      .cm-hp {
        position: absolute;
        left: -9999px;
        width: 1px;
        height: 1px;
        overflow: hidden;
      }
```

- [ ] **Step 2: Adicionar o widget do Turnstile**

Precisa da chave pública criada no painel Cloudflare (pendência 3 no fim
deste plano). Antes do `</head>`:

```html
    <script
      src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      defer
    ></script>
```

Dentro do `<form>`, logo antes do botão de submit:

```html
              <!-- Turnstile em modo invisível: só aparece se a Cloudflare
               desconfiar do visitante. O token vai no corpo do POST e é
               validado no servidor; sozinho, no navegador, não vale nada. -->
              <div id="cm-turnstile"></div>
```

E o script que renderiza o widget e guarda o token, junto do script do
formulário:

```javascript
      window.cmTurnstileToken = "";
      window.onloadTurnstileCallback = function () {
        if (!window.turnstile) return;
        window.turnstile.render("#cm-turnstile", {
          sitekey: "SUBSTITUIR_PELA_CHAVE_PUBLICA",
          size: "flexible",
          callback: function (token) {
            window.cmTurnstileToken = token;
          },
        });
      };
```

E o `src` do script vira
`...api.js?onload=onloadTurnstileCallback&render=explicit`.

- [ ] **Step 3: Trocar o script do formulário**

Substituir o corpo do `(function () { var form = document.getElementById("cm-contact-form"); ... })();` por:

```javascript
      (function () {
        var form = document.getElementById("cm-contact-form");
        if (!form) return;

        var status = document.getElementById("cm-form-status");
        var botao = form.querySelector('button[type="submit"]');
        var rotuloOriginal = botao ? botao.textContent : "";

        function dizer(texto, erro) {
          if (!status) return;
          status.textContent = texto;
          status.style.color = erro ? "#fca5a5" : "";
        }

        form.addEventListener("submit", function (e) {
          e.preventDefault();
          if (botao) {
            botao.disabled = true;
            botao.textContent = "Enviando...";
          }
          dizer("");

          var corpo = {
            nome: form.elements.name.value.trim(),
            email: form.elements.email.value.trim(),
            mensagem: form.elements.message.value.trim(),
            empresa: form.elements.empresa ? form.elements.empresa.value : "",
            turnstile_token: window.cmTurnstileToken || "",
          };

          fetch("/api/contato", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpo),
          })
            .then(function (resposta) {
              return resposta.json().then(function (dados) {
                return { status: resposta.status, dados: dados };
              });
            })
            .then(function (r) {
              if (r.status === 202) {
                // sucesso: o formulário sai de cena, senão a pessoa fica
                // olhando pros campos preenchidos sem saber se foi
                form.innerHTML =
                  '<p class="cm-lead">Recebi sua mensagem. Respondo em até 1 dia útil, no e-mail que você deixou.</p>';
                return;
              }
              if (r.status === 429) {
                dizer(
                  "Muitos envios seguidos daqui. Tente mais tarde ou me chame no WhatsApp.",
                  true,
                );
              } else if (r.status === 400) {
                dizer("Confira os campos e tente de novo.", true);
              } else {
                dizer(
                  "Não consegui enviar agora. Me chame no WhatsApp ou escreva para contato@eltonmarques.com.",
                  true,
                );
              }
              if (botao) {
                botao.disabled = false;
                botao.textContent = rotuloOriginal;
              }
            })
            .catch(function () {
              dizer(
                "Não consegui enviar agora. Me chame no WhatsApp ou escreva para contato@eltonmarques.com.",
                true,
              );
              if (botao) {
                botao.disabled = false;
                botao.textContent = rotuloOriginal;
              }
            });
        });
      })();
```

- [ ] **Step 4: Validar HTML e JavaScript**

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('deploy/hub/index.html','utf8');[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((x,i)=>{try{new Function(x[1])}catch(e){console.log('script '+i+' ERRO: '+e.message)}});console.log('scripts ok')"
```

Esperado: `scripts ok`, sem linha de erro.

- [ ] **Step 5: Testar contra o backend local**

```bash
cd backend && .venv/Scripts/python -m uvicorn app.main:app --port 8082
```

Noutro terminal, servir o site e enviar o formulário pelo navegador; conferir a linha no banco:

```bash
cd backend && .venv/Scripts/python -c "from app import storage; print(storage.pendentes('leads.db'))"
```

Esperado: uma linha com o que foi digitado.

- [ ] **Step 6: Commit**

```bash
git add deploy/hub/index.html
git commit -m "feat(hub): formulario envia por fetch para /api/contato"
```

---

### Task 9: Deploy (systemd, nginx, documentação)

**Files:**
- Create: `deploy/systemd/hub-api.service`
- Modify: `deploy/nginx/hub.conf`, `deploy/README.md`

**Interfaces:**
- Consumes: `backend/` inteiro
- Produces: serviço no ar em `127.0.0.1:8082`, alcançável em `https://eltonmarques.com/api/`.

- [ ] **Step 1: Escrever a unit do systemd**

`deploy/systemd/hub-api.service`:

```ini
[Unit]
Description=Hub API - contato de eltonmarques.com
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/hub-api
EnvironmentFile=/etc/hub-api.env
ExecStart=/opt/hub-api/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8082 --workers 1
Restart=on-failure
RestartSec=5

# 1 worker e ~70 MB de RSS: a VPS tem 954 MB no total, com outros tres
# servicos rodando. Mais worker aqui nao compra vazao nenhuma pro volume
# de uma landing e come RAM que falta pros vizinhos.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/hub-api

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Adicionar a rota no nginx**

Em `deploy/nginx/hub.conf`, dentro do `server`:

```nginx
    # API do proprio hub (backend de contato). Fica atras do nginx do hub
    # em vez de ganhar rota propria no tunel: o catch-all do tunel ja cai
    # aqui, entao nao precisa mexer no painel da Cloudflare, e a API herda
    # os headers de seguranca declarados acima.
    location /api/ {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
        client_max_body_size 16k;
    }
```

- [ ] **Step 3: Subir na VPS**

```bash
ssh -i "<chave>" ubuntu@163.176.176.34 "sudo mkdir -p /opt/hub-api /var/lib/hub-api && sudo chown -R www-data:www-data /var/lib/hub-api"
scp -i "<chave>" -r backend/app backend/requirements.txt ubuntu@163.176.176.34:/tmp/hub-api/
ssh -i "<chave>" ubuntu@163.176.176.34 "sudo cp -r /tmp/hub-api/* /opt/hub-api/ && sudo python3 -m venv /opt/hub-api/venv && sudo /opt/hub-api/venv/bin/pip install -r /opt/hub-api/requirements.txt"
```

- [ ] **Step 4: Escrever os segredos e habilitar o serviço**

O arquivo `/etc/hub-api.env` é escrito na VPS, com os valores reais, e nunca versionado:

```bash
ssh -i "<chave>" ubuntu@163.176.176.34 "sudo install -m 600 -o root -g root /dev/null /etc/hub-api.env"
```

Preencher com os nomes de `backend/.env.example`. Depois:

```bash
scp -i "<chave>" deploy/systemd/hub-api.service ubuntu@163.176.176.34:/tmp/
ssh -i "<chave>" ubuntu@163.176.176.34 "sudo cp /tmp/hub-api.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now hub-api && sudo systemctl status hub-api --no-pager"
```

- [ ] **Step 5: Recarregar o nginx e conferir a rota**

```bash
scp -i "<chave>" deploy/nginx/hub.conf ubuntu@163.176.176.34:/tmp/
ssh -i "<chave>" ubuntu@163.176.176.34 "sudo cp /tmp/hub.conf /etc/nginx/sites-available/hub.conf && sudo nginx -t && sudo systemctl reload nginx"
curl -s https://eltonmarques.com/api/health
```

Esperado: `{"status":"ok","versao":"..."}`.

- [ ] **Step 6: Documentar no README do deploy**

Adicionar em `deploy/README.md`, na tabela de serviços, a linha do `hub-api` (porta 8082, serve `/api/`, público) e uma seção curta com: onde ficam os segredos, como reiniciar (`sudo systemctl restart hub-api`), como ver log (`journalctl -u hub-api -f`), onde fica o banco (`/var/lib/hub-api/leads.db`) e como rodar o reenvio (`sudo -u www-data /opt/hub-api/venv/bin/python -m app.reenviar`).

- [ ] **Step 7: Commit**

```bash
git add deploy/
git commit -m "feat(deploy): unit systemd, rota /api no nginx e doc do hub-api"
```

---

### Task 10: Verificação fim a fim em produção

**Files:**
- Nenhum arquivo novo. Só verificação.

- [ ] **Step 1: Health pela internet**

```bash
curl -s https://eltonmarques.com/api/health
```

Esperado: `{"status":"ok","versao":"<sha>"}`.

- [ ] **Step 2: Honeypot é recusado**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://eltonmarques.com/api/contato -H "Content-Type: application/json" -d '{"nome":"Bot","email":"bot@exemplo.com","mensagem":"mensagem de teste com tamanho suficiente","empresa":"Bot Corp","turnstile_token":"x"}'
```

Esperado: `403`.

- [ ] **Step 3: Envio real pelo navegador**

Preencher o formulário em `https://eltonmarques.com/#contato` com dados reais. Conferir os três sinais: mensagem de sucesso na tela, alerta no Telegram, e-mail na caixa.

- [ ] **Step 4: Conferir a linha no banco**

```bash
ssh -i "<chave>" ubuntu@163.176.176.34 "sudo -u www-data sqlite3 /var/lib/hub-api/leads.db 'SELECT criado_em, nome, email_enviado, telegram_enviado FROM leads ORDER BY criado_em DESC LIMIT 3;'"
```

Esperado: a linha do envio, com os dois canais em 1.

- [ ] **Step 5: Commit da documentação final, se algo mudou**

```bash
git add -A && git commit -m "docs: ajustes apos verificacao do hub-api em producao"
```

---

## Pendências externas (bloqueiam a Task 9, não as anteriores)

1. **Conta e domínio na Resend.** Verificar `eltonmarques.com` com os registros DNS na Cloudflare. Sem isso, `RESEND_FROM` precisa usar o domínio de teste da Resend, que entrega apenas para o e-mail dono da conta.
2. **Bot do Telegram.** Criar via @BotFather, obter o token e o `chat_id` da conversa.
3. **Turnstile.** Criar o widget no painel Cloudflare para `eltonmarques.com`, guardar a chave secreta (backend) e a chave pública (que entra no HTML na Task 8, junto do script do widget).
4. **Destino de `contato@eltonmarques.com`.** Confirmar se é caixa própria ou encaminhamento.
