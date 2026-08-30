from fastapi.testclient import TestClient

from app.main import app

cliente = TestClient(app)

VALIDO = {
    "nome": "Fulano de Tal",
    "email": "fulano@exemplo.com",
    "mensagem": "Tenho um processo manual travando a operação, podemos falar?",
    "empresa": "",
    "turnstile_token": "token-qualquer",
}


def test_nome_curto_devolve_400():
    resposta = cliente.post("/api/contato", json={**VALIDO, "nome": "A"})

    assert resposta.status_code == 400
    corpo = resposta.json()
    assert corpo["ok"] is False
    assert corpo["erro"] == "validacao"
    assert "nome" in corpo["campos"]


def test_email_invalido_devolve_400():
    resposta = cliente.post("/api/contato", json={**VALIDO, "email": "nao-e-email"})

    assert resposta.status_code == 400
    assert "email" in resposta.json()["campos"]


def test_mensagem_curta_devolve_400():
    resposta = cliente.post("/api/contato", json={**VALIDO, "mensagem": "oi"})

    assert resposta.status_code == 400
    assert "mensagem" in resposta.json()["campos"]


def test_mensagem_longa_demais_devolve_400():
    resposta = cliente.post(
        "/api/contato", json={**VALIDO, "mensagem": "x" * 2001}
    )

    assert resposta.status_code == 400
    assert "mensagem" in resposta.json()["campos"]
