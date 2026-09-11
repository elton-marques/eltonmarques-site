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
