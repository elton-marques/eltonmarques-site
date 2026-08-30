import pytest

from app import storage


@pytest.fixture()
def db(tmp_path):
    """Banco novo por teste, em disco temporário.

    Em disco e não em :memory: porque o código abre uma conexão por
    operação (é o padrão certo pra SQLite sob servidor web), e um banco
    em memória morreria junto com a primeira conexão.
    """
    caminho = str(tmp_path / "leads.db")
    storage.criar_schema(caminho)
    return caminho
