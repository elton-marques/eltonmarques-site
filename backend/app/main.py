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
