"""API do hub. Por enquanto: health e (nas próximas tasks) contato."""

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import config
from app.schemas import ContatoIn

CONFIG = config.carregar()

app = FastAPI(title="hub-api", docs_url=None, redoc_url=None)

# CORS restrito: o único front que fala com esta API é o próprio site.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[CONFIG.origem_permitida],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


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


@app.get("/api/health")
def health():
    return {"status": "ok", "versao": CONFIG.versao}


@app.post("/api/contato")
def contato(dados: ContatoIn):
    return {"ok": True, "id": "ainda-nao-implementado"}
