from fastapi.testclient import TestClient

from app.main import app

cliente = TestClient(app)


def test_health_responde_ok():
    resposta = cliente.get("/api/health")

    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok", "versao": "dev"}
