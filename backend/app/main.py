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
    """Atrás do túnel, o IP real do visitante vem em cabeçalho.

    O socket é sempre 127.0.0.1 aqui (o serviço só escuta em loopback e
    quem chega é o nginx local), então limitar por ele bloquearia o site
    inteiro por causa de um visitante só.

    CF-Connecting-IP é o cabeçalho certo porque a Cloudflare o SOBRESCREVE
    em tudo que ela encaminha: um valor forjado pelo cliente é descartado
    na borda. Isso só vale enquanto a única porta de entrada for o túnel,
    que é o caso hoje (o firewall da VPS libera apenas SSH e Tailscale, e
    o serviço não escuta em interface pública). Se um dia este serviço
    ficar alcançável por outro caminho, o cabeçalho volta a ser forjável e
    esta função precisa passar a validar a origem.
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

    # Corrida conhecida e aceita entre esta checagem e o INSERT abaixo: a
    # contagem é um SELECT fora de transação, então requisições simultâneas
    # da mesma origem podem ler o mesmo total antes de qualquer uma
    # inserir. O handler é síncrono, então o Starlette o roda no
    # threadpool: um disparo em rajada não fura o limite em uma linha, e
    # sim em até tantas quantas o threadpool atender de uma vez. Fica
    # assim de propósito porque não há corrupção de dado (o excesso são
    # linhas a mais, nunca lead perdido), o teto diário ainda segura o
    # pior caso, e fechar a janela exigiria transação cobrindo leitura e
    # escrita, complexidade que o volume de uma landing pessoal não paga.
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
