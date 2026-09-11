import dataclasses

import pytest
from fastapi.testclient import TestClient

from app import antispam, main, notify, storage

VALIDO = {
    "nome": "Fulano de Tal",
    "email": "fulano@exemplo.com",
    "mensagem": "Tenho um processo manual travando a operação, podemos falar?",
    "empresa": "",
    "turnstile_token": "token",
}


@pytest.fixture()
def cliente(db, monkeypatch):
    """Aponta o app pro banco temporário e desliga a rede.

    Config é frozen, então não dá pra trocar um campo: substitui-se o
    objeto inteiro em main.CONFIG. As rotas leem esse global na hora da
    chamada, então o monkeypatch pega.
    """
    monkeypatch.setattr(
        main, "CONFIG", dataclasses.replace(main.CONFIG, db_path=db)
    )
    monkeypatch.setattr(antispam, "verificar_turnstile", lambda *a, **k: True)
    monkeypatch.setattr(notify, "notificar", lambda *a, **k: None)
    return TestClient(main.app)


def test_envio_valido_grava_e_devolve_202(cliente, db):
    resposta = cliente.post("/api/contato", json=VALIDO)

    assert resposta.status_code == 202
    corpo = resposta.json()
    assert corpo["ok"] is True

    lead = storage.buscar_lead(db, corpo["id"])
    assert lead["nome"] == "Fulano de Tal"
    assert lead["email"] == "fulano@exemplo.com"


def test_honeypot_preenchido_devolve_403_e_nao_grava(cliente, db):
    resposta = cliente.post("/api/contato", json={**VALIDO, "empresa": "Bot Corp"})

    assert resposta.status_code == 403
    assert resposta.json()["erro"] == "recusado"
    assert storage.contar_desde(db, "2000-01-01T00:00:00+00:00") == 0


def test_turnstile_reprovado_devolve_403_e_nao_grava(cliente, db, monkeypatch):
    monkeypatch.setattr(antispam, "verificar_turnstile", lambda *a, **k: False)

    resposta = cliente.post("/api/contato", json=VALIDO)

    assert resposta.status_code == 403
    assert storage.contar_desde(db, "2000-01-01T00:00:00+00:00") == 0


def test_sexto_envio_da_mesma_origem_devolve_429(cliente, db):
    for _ in range(antispam.LIMITE_POR_IP_HORA):
        assert cliente.post("/api/contato", json=VALIDO).status_code == 202

    resposta = cliente.post("/api/contato", json=VALIDO)

    assert resposta.status_code == 429
    assert resposta.json()["erro"] == "limite"


def test_teto_diario_devolve_429(cliente, db, monkeypatch):
    monkeypatch.setattr(antispam, "LIMITE_DIARIO", 1)
    assert cliente.post("/api/contato", json=VALIDO).status_code == 202

    resposta = cliente.post("/api/contato", json=VALIDO)

    assert resposta.status_code == 429


def test_resend_fora_do_ar_nao_perde_o_lead(db, monkeypatch):
    """O teste que justifica a ordem persistir-antes-de-notificar.

    Aqui notify.notificar NÃO é mockado: só os dois canais de saída são,
    pra o caminho real de background rodar e gravar o resultado de cada
    um no banco.
    """
    monkeypatch.setattr(
        main, "CONFIG", dataclasses.replace(main.CONFIG, db_path=db)
    )
    monkeypatch.setattr(antispam, "verificar_turnstile", lambda *a, **k: True)
    monkeypatch.setattr(notify, "enviar_email", lambda lead, cfg: (False, "timeout"))
    monkeypatch.setattr(notify, "enviar_telegram", lambda lead, cfg: (True, ""))

    resposta = TestClient(main.app).post("/api/contato", json=VALIDO)

    assert resposta.status_code == 202
    lead = storage.buscar_lead(db, resposta.json()["id"])
    assert lead["email_enviado"] == 0
    assert lead["telegram_enviado"] == 1
    assert "timeout" in lead["erro_notificacao"]


def test_ip_do_cabecalho_da_cloudflare_e_o_que_limita(cliente, db):
    """Atrás do túnel, o socket é sempre 127.0.0.1.

    Se o handler limitasse pelo socket, um único visitante abusivo
    bloquearia o site inteiro. O limite tem que seguir CF-Connecting-IP.
    """
    for _ in range(antispam.LIMITE_POR_IP_HORA):
        resposta = cliente.post(
            "/api/contato", json=VALIDO, headers={"CF-Connecting-IP": "203.0.113.7"}
        )
        assert resposta.status_code == 202

    bloqueado = cliente.post(
        "/api/contato", json=VALIDO, headers={"CF-Connecting-IP": "203.0.113.7"}
    )
    outro_visitante = cliente.post(
        "/api/contato", json=VALIDO, headers={"CF-Connecting-IP": "203.0.113.9"}
    )

    assert bloqueado.status_code == 429
    assert outro_visitante.status_code == 202
