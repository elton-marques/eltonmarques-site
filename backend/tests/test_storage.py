from app import storage


def test_inserir_devolve_id_e_guarda_os_campos(db):
    lead_id = storage.inserir_lead(
        db,
        nome="Fulano",
        email="fulano@exemplo.com",
        mensagem="mensagem de teste com tamanho suficiente",
        ip_hash="abc123",
        user_agent="pytest",
    )

    lead = storage.buscar_lead(db, lead_id)
    assert lead["nome"] == "Fulano"
    assert lead["email"] == "fulano@exemplo.com"
    assert lead["email_enviado"] == 0
    assert lead["telegram_enviado"] == 0


def test_marcar_envio_com_sucesso(db):
    lead_id = storage.inserir_lead(
        db, "Fulano", "f@e.com", "mensagem longa o bastante", "abc", "pytest"
    )

    storage.marcar_envio(db, lead_id, "email", True)

    assert storage.buscar_lead(db, lead_id)["email_enviado"] == 1


def test_marcar_envio_com_falha_guarda_o_erro(db):
    lead_id = storage.inserir_lead(
        db, "Fulano", "f@e.com", "mensagem longa o bastante", "abc", "pytest"
    )

    storage.marcar_envio(db, lead_id, "email", False, "timeout")

    lead = storage.buscar_lead(db, lead_id)
    assert lead["email_enviado"] == 0
    assert "timeout" in lead["erro_notificacao"]


def test_contar_por_ip_so_conta_o_mesmo_ip(db):
    for _ in range(3):
        storage.inserir_lead(
            db, "A", "a@e.com", "mensagem longa o bastante", "ip-1", "pytest"
        )
    storage.inserir_lead(
        db, "B", "b@e.com", "mensagem longa o bastante", "ip-2", "pytest"
    )

    assert storage.contar_por_ip(db, "ip-1", "2000-01-01T00:00:00+00:00") == 3


def test_contar_desde_ignora_o_que_e_mais_antigo(db):
    storage.inserir_lead(
        db, "A", "a@e.com", "mensagem longa o bastante", "ip-1", "pytest"
    )

    assert storage.contar_desde(db, "2000-01-01T00:00:00+00:00") == 1
    assert storage.contar_desde(db, "2999-01-01T00:00:00+00:00") == 0


def test_pendentes_traz_so_quem_falta_notificar(db):
    completo = storage.inserir_lead(
        db, "A", "a@e.com", "mensagem longa o bastante", "ip", "pytest"
    )
    storage.marcar_envio(db, completo, "email", True)
    storage.marcar_envio(db, completo, "telegram", True)
    faltando = storage.inserir_lead(
        db, "B", "b@e.com", "mensagem longa o bastante", "ip", "pytest"
    )

    ids = [lead["id"] for lead in storage.pendentes(db)]
    assert ids == [faltando]
