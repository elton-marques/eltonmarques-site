"""Avisos de lead novo: e-mail pela Resend e alerta no Telegram.

Nenhuma das funcoes levanta excecao pra fora: elas devolvem (ok, erro).
Quem chama roda em background, depois de a resposta HTTP ja ter saido, e
falha de aviso nao pode virar stack trace no log de request nem apagar o
lead que ja esta salvo.
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
                # responder o aviso responde o cliente, sem copiar endereco
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

    Um canal nao derruba o outro: e-mail fora do ar ainda deixa o alerta
    do Telegram chegar, e vice-versa.
    """
    lead = storage.buscar_lead(db_path, lead_id)
    if not lead:
        return

    ok_email, erro_email = enviar_email(lead, cfg)
    storage.marcar_envio(db_path, lead_id, "email", ok_email, erro_email)

    ok_telegram, erro_telegram = enviar_telegram(lead, cfg)
    storage.marcar_envio(db_path, lead_id, "telegram", ok_telegram, erro_telegram)
