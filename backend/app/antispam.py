"""Barreiras contra bot: Turnstile, hash de IP e limites de volume.

O honeypot nao mora aqui: ele e uma checagem de uma linha no handler,
porque depende do corpo da requisicao e nao de estado nenhum.
"""

import hashlib
from datetime import datetime, timedelta, timezone

import httpx

from app import storage

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
LIMITE_POR_IP_HORA = 5
LIMITE_DIARIO = 100


def hash_ip(ip: str, sal: str) -> str:
    """Guardar o IP inteiro nao e necessario pra limitar por origem."""
    return hashlib.sha256(f"{sal}:{ip}".encode()).hexdigest()


def verificar_turnstile(token: str, ip: str, segredo: str) -> bool:
    """Valida o token no servidor.

    Sem segredo configurado (desenvolvimento local), libera sem tocar na
    rede. Qualquer falha de rede REPROVA: numa pagina de contato, deixar
    passar durante uma instabilidade da Cloudflare e convite pra bot.
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
