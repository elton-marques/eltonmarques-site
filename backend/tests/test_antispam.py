import httpx
import pytest

from app import antispam, storage


def test_hash_ip_e_estavel_e_nao_devolve_o_ip():
    resultado = antispam.hash_ip("203.0.113.7", "sal")

    assert resultado == antispam.hash_ip("203.0.113.7", "sal")
    assert "203.0.113.7" not in resultado


def test_hash_ip_muda_com_o_sal():
    assert antispam.hash_ip("203.0.113.7", "a") != antispam.hash_ip(
        "203.0.113.7", "b"
    )


def test_turnstile_sem_segredo_configurado_libera(monkeypatch):
    def explodir(*args, **kwargs):
        raise AssertionError("não deveria chamar a rede sem segredo")

    monkeypatch.setattr(httpx, "post", explodir)

    assert antispam.verificar_turnstile("token", "1.2.3.4", "") is True


def test_turnstile_aprovado(monkeypatch):
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *a, **k: httpx.Response(200, json={"success": True}),
    )

    assert antispam.verificar_turnstile("token", "1.2.3.4", "segredo") is True


def test_turnstile_reprovado(monkeypatch):
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *a, **k: httpx.Response(200, json={"success": False}),
    )

    assert antispam.verificar_turnstile("token", "1.2.3.4", "segredo") is False


def test_turnstile_fora_do_ar_reprova(monkeypatch):
    def cair(*args, **kwargs):
        raise httpx.ConnectError("sem rede")

    monkeypatch.setattr(httpx, "post", cair)

    assert antispam.verificar_turnstile("token", "1.2.3.4", "segredo") is False


def test_limite_por_ip(db):
    for _ in range(antispam.LIMITE_POR_IP_HORA):
        storage.inserir_lead(
            db, "A", "a@e.com", "mensagem longa o bastante", "ip-1", "pytest"
        )

    assert antispam.dentro_dos_limites(db, "ip-1") is False
    assert antispam.dentro_dos_limites(db, "ip-2") is True


def test_limite_diario_global(db, monkeypatch):
    monkeypatch.setattr(antispam, "LIMITE_DIARIO", 2)
    for indice in range(2):
        storage.inserir_lead(
            db, "A", "a@e.com", "mensagem longa o bastante", f"ip-{indice}", "pytest"
        )

    assert antispam.dentro_dos_limites(db, "ip-novo") is False
