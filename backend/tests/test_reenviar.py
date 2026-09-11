from app import notify, reenviar, storage
from tests.test_notify import CFG


def test_processa_so_os_pendentes(db, monkeypatch):
    completo = storage.inserir_lead(
        db, "A", "a@e.com", "mensagem longa o bastante", "ip", "pytest"
    )
    storage.marcar_envio(db, completo, "email", True)
    storage.marcar_envio(db, completo, "telegram", True)
    pendente = storage.inserir_lead(
        db, "B", "b@e.com", "mensagem longa o bastante", "ip", "pytest"
    )

    chamados = []
    monkeypatch.setattr(
        notify, "notificar", lambda caminho, lead_id, cfg: chamados.append(lead_id)
    )

    total = reenviar.processar(db, CFG)

    assert total == 1
    assert chamados == [pendente]


def test_sem_pendentes_nao_faz_nada(db, monkeypatch):
    def explodir(*a, **k):
        raise AssertionError("nao deveria chamar notificar sem pendentes")

    monkeypatch.setattr(notify, "notificar", explodir)

    assert reenviar.processar(db, CFG) == 0
