# Backend de contato do hub (eltonmarques.com)

Data: 2026-08-30
Status: aprovado para implementação
Escopo: primeira versão do backend do site, cobrindo o formulário de contato

## Problema

O formulário de contato do hub (`deploy/hub/index.html`) não envia nada.
O submit monta um `mailto:` e entrega a mensagem para o cliente de e-mail
do visitante abrir. Isso falha em três situações comuns:

- desktop sem cliente de e-mail configurado: o clique não faz nada visível
  e a pessoa desiste;
- webmail em aba: o `mailto:` abre um programa que a pessoa não usa;
- celular: abre o app de e-mail, mas o visitante precisa apertar "enviar"
  numa segunda tela, fora do site.

Em todos eles o lead se perde em silêncio e o site não registra nada. Como
a página inteira foi reescrita para prospecção, o formulário é o gargalo
que sobra.

## Objetivo

Receber a mensagem no servidor, guardá-la, e avisar Elton por e-mail e
Telegram. O lead não pode depender de o navegador do visitante ter
cliente de e-mail, nem de o provedor de e-mail estar no ar no momento do
envio.

Fora de escopo nesta versão: painel de leitura dos leads, eventos de
conversão, resposta automática ao lead, autenticação, endpoints para os
outros projetos.

## Restrições do ambiente

Levantadas na VPS em 2026-08-30:

- 954 MB de RAM total, ~500 MB livres. Isso descarta banco em processo
  separado (Postgres, MySQL) e qualquer stack com múltiplos workers.
- Nenhuma porta pública. O firewall libera apenas 22 (SSH) e a malha
  Tailscale; todo tráfego externo entra por Cloudflare Tunnel e bate em
  `127.0.0.1`.
- Já rodam na máquina: `leitor-backend.service` (FastAPI, porta 8000),
  `cartao-mestre-auth.service`, nginx, `cloudflared`, `tailscaled`.
- Python 3.12.3 e Node 22.23.2 instalados.

## Decisões

### Stack: FastAPI + SQLite, serviço systemd

Alternativas consideradas: Cloudflare Worker + D1 (serverless, zero RAM na
VPS) e Node/Express na VPS.

FastAPI venceu por operação, não por performance: `leitor-backend` já é
FastAPI sob systemd na mesma máquina, então o deploy, os logs
(`journalctl`) e o diagnóstico seguem um padrão que já existe. Os leads
ficam em disco na VPS, não no banco de um terceiro. O Worker seria mais
barato em RAM, mas introduziria um terceiro padrão de backend (TypeScript,
deploy por `wrangler`) para manter sozinho.

Node/Express foi descartado por não oferecer nada sobre o FastAPI e somar
um ecossistema a mais.

### Roteamento: pelo nginx do hub, não por rota nova no túnel

O catch-all `eltonmarques.com/` do Cloudflare Tunnel já aponta para o
nginx do hub em `127.0.0.1:8081`. Um `location /api/` com `proxy_pass`
para `127.0.0.1:8082` dentro de `deploy/nginx/hub.conf` resolve o
roteamento sem tocar na configuração do túnel, que vive no painel
Cloudflare e não no repositório. Como efeito colateral desejável, a API
herda os headers de segurança que o `hub.conf` já aplica.

### Persistir antes de notificar

O handler grava o lead no SQLite, responde `202` e só então dispara Resend
e Telegram em background (`BackgroundTasks` do FastAPI).

A ordem importa: se a notificação viesse primeiro e a Resend estivesse
fora do ar, o visitante veria erro e o lead sumiria. Com a ordem
invertida, uma falha de notificação custa o aviso, nunca o contato. Cada
linha registra `email_enviado` e `telegram_enviado`; um comando de
reenvio varre os pendentes. Sem fila e sem Redis: o volume de uma landing
não justifica um processo a mais em 500 MB de RAM livre.

### Anti-spam: Turnstile validado no servidor + honeypot + limite

O token que o widget do Turnstile devolve no navegador não vale nada
sozinho — o backend chama o `siteverify` da Cloudflare antes de aceitar.
Somados: campo-isca (`empresa`) que humano nunca vê, limite de 5 envios
por hora por IP e teto de 100 envios aceitos por dia no serviço inteiro. O
teto global existe para o pior caso não virar conta na Resend nem
enxurrada no Telegram; 100 é duas ordens de grandeza acima do volume
esperado de uma landing pessoal, então só dispara sob abuso.

## Arquitetura

```
navegador
   │ POST /api/contato  (fetch, JSON)
   ▼
Cloudflare (Turnstile, WAF)
   │
   ▼
cloudflared ──► nginx :8081 ──/api/──► uvicorn :8082 (hub-api.service)
                                          │
                                          ├─► SQLite /var/lib/hub-api/leads.db
                                          ├─► Resend  (HTTPS)
                                          └─► Telegram Bot API (HTTPS)
```

### Módulos

Cada arquivo com uma responsabilidade, para caber na cabeça e no contexto
de quem edita:

| Arquivo | Responsabilidade | Depende de |
|---|---|---|
| `backend/app/main.py` | rotas HTTP, orquestração do fluxo | todos abaixo |
| `backend/app/config.py` | leitura e validação das variáveis de ambiente | — |
| `backend/app/schemas.py` | contrato de entrada e saída (Pydantic) | — |
| `backend/app/storage.py` | SQLite: criação do schema, inserção, marcação de envio, pendentes | `config` |
| `backend/app/notify.py` | envio via Resend e Telegram | `config` |
| `backend/app/antispam.py` | verificação do Turnstile, honeypot, limite por IP | `config`, `storage` |
| `backend/app/reenviar.py` | comando que reenvia notificações pendentes | `storage`, `notify` |

## Contrato da API

### `POST /api/contato`

Requisição (JSON):

| Campo | Tipo | Regra |
|---|---|---|
| `nome` | string | 2 a 80 caracteres |
| `email` | string | e-mail válido, até 120 caracteres |
| `mensagem` | string | 10 a 2000 caracteres |
| `empresa` | string | honeypot: precisa chegar vazio |
| `turnstile_token` | string | token do widget |

Respostas:

| Status | Quando | Corpo |
|---|---|---|
| `202` | lead gravado | `{"ok": true, "id": "<uuid>"}` |
| `400` | validação de campo | `{"ok": false, "erro": "validacao", "campos": {...}}` |
| `403` | honeypot preenchido ou Turnstile reprovado | `{"ok": false, "erro": "recusado"}` |
| `429` | limite por IP ou teto diário | `{"ok": false, "erro": "limite"}` |
| `500` | falha ao gravar | `{"ok": false, "erro": "interno"}` |

O `403` é deliberadamente genérico: dizer ao bot qual das duas barreiras
ele derrubou é dar mapa para a próxima tentativa.

### `GET /api/health`

`200 {"status": "ok", "versao": "<valor de APP_VERSION>"}`, onde
`APP_VERSION` é uma variável de ambiente escrita no deploy (sha curto do
commit). Ausente, o campo vem como `"dev"`. Sem autenticação, sem dados. Serve para monitoramento externo e para conferir depois do
deploy se o serviço subiu.

## Dados

Tabela `leads`, em `/var/lib/hub-api/leads.db`:

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | TEXT PK | uuid4 |
| `criado_em` | TEXT | ISO 8601 em UTC |
| `nome` | TEXT | |
| `email` | TEXT | |
| `mensagem` | TEXT | |
| `ip_hash` | TEXT | SHA-256 do IP com sal fixo do ambiente |
| `user_agent` | TEXT | truncado em 300 caracteres |
| `email_enviado` | INTEGER | 0/1 |
| `telegram_enviado` | INTEGER | 0/1 |
| `erro_notificacao` | TEXT | última falha, se houver |

Índice em `criado_em` e em `ip_hash` (o limite por IP consulta os dois).

Guardar o hash do IP, e não o IP, cobre o limite por origem sem manter
dado pessoal identificável parado em disco.

## Notificações

**Resend**: `POST https://api.resend.com/emails`, remetente no domínio do
site, destinatário `contato@eltonmarques.com`, `reply_to` com o e-mail do
lead — assim responder ao aviso responde ao cliente, sem copiar endereço
na mão. Assunto com o nome do lead. Corpo com os campos e o horário.

**Telegram**: `sendMessage` para o `chat_id` configurado, texto curto:
nome, e-mail e as primeiras linhas da mensagem. É alerta, não arquivo — o
conteúdo completo está no e-mail e no banco.

Ambos com `timeout` curto (5 s) e sem retry no request: a falha é gravada
e o reenvio é trabalho do comando `reenviar`, executado à mão ou por cron.

## Segurança

- Bind em `127.0.0.1:8082`. O serviço nunca escuta em interface pública.
- CORS restrito a `https://eltonmarques.com`.
- Segredos (`RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
  `TURNSTILE_SECRET`, `IP_HASH_SALT`) em `/etc/hub-api.env`, modo 600,
  dono `root`, lido pelo systemd via `EnvironmentFile`. O repositório
  versiona apenas `backend/.env.example`.
- Limite de tamanho do corpo da requisição no nginx (`client_max_body_size`).
- Unit do systemd com `NoNewPrivileges`, `PrivateTmp`,
  `ProtectSystem=strict` e `ReadWritePaths=/var/lib/hub-api`.

## Mudanças no front-end

`deploy/hub/index.html`:

- o submit passa a fazer `fetch` para `/api/contato` em vez de montar
  `mailto:`;
- três estados: enviando (botão desabilitado), sucesso (a mensagem de
  confirmação substitui o formulário), erro;
- o estado de erro precisa oferecer saída, não apenas informar a falha:
  botão do WhatsApp e endereço de e-mail visível;
- campo honeypot `empresa`, escondido por CSS e com `tabindex="-1"` e
  `autocomplete="off"`;
- widget do Turnstile;
- `<noscript>` com o e-mail à mostra, para quem bloqueia JavaScript.

## Testes

pytest com `TestClient`, escritos antes do código:

1. campo vazio ou e-mail inválido devolve `400`;
2. honeypot preenchido devolve `403` e não grava nada;
3. Turnstile reprovado devolve `403` e não grava nada;
4. sexto envio da mesma origem na mesma hora devolve `429`;
4b. envio que estoura o teto diário global devolve `429`;
5. envio válido grava a linha e devolve `202` com id;
6. Resend fora do ar não perde o lead: a linha existe, `email_enviado` é
   0 e `erro_notificacao` está preenchido;
7. `reenviar` processa apenas os pendentes e marca os que deram certo.

Resend, Telegram e o `siteverify` do Turnstile são mockados. Nenhum teste
faz chamada de rede.

## Deploy

Arquivos novos: `deploy/systemd/hub-api.service`, `backend/requirements.txt`,
`backend/.env.example`, e a seção correspondente em `deploy/README.md`.

Passos na VPS: criar `/opt/hub-api/venv` e `/var/lib/hub-api`, copiar
`backend/`, instalar dependências, escrever `/etc/hub-api.env`, habilitar
o serviço, adicionar o `location /api/` ao `hub.conf` e recarregar o
nginx (`nginx -t && systemctl reload nginx`, como já documentado para
mudanças de configuração).

## Pendências

Nenhuma bloqueia o começo da implementação; ambas precisam ser resolvidas
antes do serviço ir ao ar.

1. **Verificação do domínio na Resend.** Enviar como
   `algo@eltonmarques.com` exige registros DNS (SPF/DKIM) na Cloudflare.
   Enquanto não estiverem no ar, a implementação usa o domínio de teste da
   Resend, que entrega apenas para o e-mail dono da conta — suficiente
   para desenvolver, insuficiente para produção.
2. **Destino real de `contato@eltonmarques.com`.** Falta confirmar se é
   caixa própria ou encaminhamento (Cloudflare Email Routing) para o Gmail
   pessoal. Muda apenas para onde o aviso cai, não o desenho.
