"""API do hub: health e o endpoint de contato do site."""

import logging
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import antispam, config, notify, storage
from app.schemas import ContatoIn

logger = logging.getLogger(__name__)

CONFIG = config.carregar()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Cria o schema na subida do serviço.

    Fica no lifespan, e não no import do módulo, pra importar o app (nos
    testes, por exemplo) não criar arquivo de banco em lugar nenhum.
    """
    storage.criar_schema(CONFIG.db_path)
    yield


app = FastAPI(title="hub-api", docs_url=None, redoc_url=None, lifespan=lifespan)

# CORS restrito: o único front que fala com esta API é o próprio site.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[CONFIG.origem_permitida],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)

RECUSADO = {"ok": False, "erro": "recusado"}


@app.exception_handler(RequestValidationError)
def erro_de_validacao(request: Request, exc: RequestValidationError):
    """O 422 padrao do FastAPI vaza a estrutura interna do Pydantic.

    O front so precisa saber QUAL campo esta errado pra destacar o input,
    entao a resposta vira um mapa simples campo -> mensagem.
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


def ip_do_request(request: Request) -> str:
    """Atrás do túnel e do nginx, o IP real vem em cabeçalho.

    CF-Connecting-IP é escrito pela Cloudflare e é o mais confiável aqui;
    X-Forwarded-For fica como segundo, e o socket como último recurso,
    que em produção seria sempre 127.0.0.1, ou seja, inútil pro limite.
    """
    cabecalho = request.headers.get("cf-connecting-ip") or request.headers.get(
        "x-forwarded-for", ""
    )
    if cabecalho:
        return cabecalho.split(",")[0].strip()
    return request.client.host if request.client else "desconhecido"


@app.post("/api/contato", status_code=status.HTTP_202_ACCEPTED)
def contato(dados: ContatoIn, request: Request, tarefas: BackgroundTasks):
    # honeypot: campo escondido que só bot preenche. A resposta é genérica
    # de propósito, igual à do Turnstile reprovado: dizer qual barreira
    # caiu é dar o mapa da próxima tentativa.
    if dados.empresa.strip():
        return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content=RECUSADO)

    ip = ip_do_request(request)
    if not antispam.verificar_turnstile(
        dados.turnstile_token, ip, CONFIG.turnstile_secret
    ):
        return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content=RECUSADO)

    # Existe uma corrida conhecida entre esta checagem e o INSERT abaixo:
    # dois envios simultâneos da mesma origem podem passar os dois. Fica
    # assim de propósito. Fechar a janela exigiria transação cobrindo
    # checagem e escrita, e o volume de uma landing pessoal não paga essa
    # complexidade; o custo do caso raro é um lead a mais, não um a menos.
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
        logger.exception("falha ao gravar o lead")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"ok": False, "erro": "interno"},
        )

    # o lead já está salvo: daqui pra frente, falha de aviso não custa o
    # contato. Por isso a notificação vai pra background e a resposta sai.
    tarefas.add_task(notify.notificar, CONFIG.db_path, lead_id, CONFIG)
    return {"ok": True, "id": lead_id}


@app.get("/api/health")
def health():
    return {"status": "ok", "versao": CONFIG.versao}
