"""Reenvia as notificações que falharam.

Existe porque a notificação é best-effort: o lead entra no banco mesmo
quando Resend ou Telegram estão fora do ar. Rodar isto, à mão ou por
cron, fecha o buraco sem precisar de fila nem de processo extra.

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
