"""Barreiras contra bot: Turnstile, hash de IP e limites de volume.

O honeypot não mora aqui: ele é uma checagem de uma linha no handler,
porque depende do corpo da requisição e não de estado nenhum.
"""

import hashlib
import logging
from datetime import datetime, timedelta, timezone

import httpx

from app import storage

logger = logging.getLogger(__name__)

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
        # reprova, mas deixa rastro: sem isso, um bug no chamador vira
        # "todo mundo reprovado" sem nenhuma linha de log explicando
        logger.warning("falha ao verificar o Turnstile", exc_info=True)
        return False


def dentro_dos_limites(db_path: str, ip_hash: str) -> bool:
    agora = datetime.now(timezone.utc)
    uma_hora_atras = (agora - timedelta(hours=1)).isoformat()
    um_dia_atras = (agora - timedelta(days=1)).isoformat()

    if storage.contar_por_ip(db_path, ip_hash, uma_hora_atras) >= LIMITE_POR_IP_HORA:
        return False
    return storage.contar_desde(db_path, um_dia_atras) < LIMITE_DIARIO
