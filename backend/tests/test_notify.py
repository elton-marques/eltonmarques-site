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
    "mensagem": "processo manual travando a operacao",
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
        raise AssertionError("nao deveria chamar a rede sem chave")

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


def test_erro_do_telegram_nao_vaza_o_token(monkeypatch):
    def cair(*a, **k):
        raise httpx.ConnectError(
            "erro ao conectar em https://api.telegram.org/bottoken/sendMessage"
        )

    monkeypatch.setattr(httpx, "post", cair)

    ok, erro = notify.enviar_telegram(LEAD, CFG)

    assert ok is False
    assert "token" not in erro
    assert "<omitido>" in erro


def test_notificar_pula_canal_ja_enviado(db, monkeypatch):
    """Reenvio nao pode mandar o e-mail de novo pra tentar so o Telegram."""
    lead_id = storage.inserir_lead(
        db, "Fulano", "f@e.com", "mensagem longa o bastante", "ip", "pytest"
    )
    storage.marcar_envio(db, lead_id, "email", True)

    chamados = []
    monkeypatch.setattr(
        notify,
        "enviar_email",
        lambda lead, cfg: (chamados.append("email"), (True, ""))[1],
    )
    monkeypatch.setattr(
        notify,
        "enviar_telegram",
        lambda lead, cfg: (chamados.append("telegram"), (True, ""))[1],
    )

    notify.notificar(db, lead_id, CFG)

    assert chamados == ["telegram"]
