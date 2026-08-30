"""Contrato de entrada do formulario.

Os limites vem da spec e existem por dois motivos: cortar lixo antes de
tocar no banco e impedir que um bot use o campo de mensagem como espaco
de armazenamento gratuito.
"""

from pydantic import BaseModel, EmailStr, Field


class ContatoIn(BaseModel):
    nome: str = Field(min_length=2, max_length=80)
    email: EmailStr = Field(max_length=120)
    mensagem: str = Field(min_length=10, max_length=2000)
    # honeypot: precisa chegar vazio. Nao e validado aqui de proposito,
    # porque a resposta pra bot e 403 (recusado), nao 400 (validacao).
    empresa: str = ""
    turnstile_token: str = ""
