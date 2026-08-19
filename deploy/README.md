# Deploy — eltonmarques.com

Documenta como o dashboard (e o hub que aponta pra ele) ficaram publicados
na VPS Oracle, pra dar pra reproduzir/atualizar de outro PC sem precisar
redescobrir tudo.

## Topologia

A VPS **não expõe portas 80/443 diretamente** (firewall só libera 22/SSH e
a malha Tailscale). Tudo que é público passa pelo **Cloudflare Tunnel**
(`cloudflared`, já rodando como serviço systemd, configurado remotamente
pelo painel Cloudflare Zero Trust — não existe `config.yml` local; a
config do túnel vive na nuvem e é lida via API/dashboard).

```
Internet → Cloudflare (eltonmarques.com) → cloudflared (túnel) → nginx local na VPS
```

Três serviços rodando só em `127.0.0.1` (nunca expostos externamente por
conta própria — só alcançáveis via túnel):

| Serviço | Porta | Serve | Auth |
|---|---|---|---|
| `deploy/nginx/cartao-mestre.conf` (nginx) | `127.0.0.1:8080` | `/cartaomestre/` (app), `/design-system/` (assets do template), `/dados/` (CSVs), `/login/` (tela de login), `/auth/` (proxy pro serviço de sessão) | `/cartaomestre/` e `/dados/` exigem sessão válida (cookie); `/design-system/` e `/login/` públicos |
| `deploy/auth-service/server.py` (systemd `cartao-mestre-auth`) | `127.0.0.1:8082` | `/login`, `/logout`, `/verify` — API de sessão por cookie | — (é o próprio serviço de auth) |
| `deploy/nginx/hub.conf` (nginx) | `127.0.0.1:8081` | `deploy/hub/index.html` — página de entrada em `eltonmarques.com/` com links pros projetos da VPS | Público |

Roteamento no túnel (Cloudflare Tunnel → *Public Hostname* / ingress rules,
uma entrada por `path` sob o mesmo hostname `eltonmarques.com`, avaliadas
em ordem, primeira que casa vence):

```
eltonmarques.com/leitor         → http://localhost:8000   (outro projeto, leitor-matriculas — já existia)
eltonmarques.com/cartaomestre   → http://localhost:8080
eltonmarques.com/design-system  → http://localhost:8080
eltonmarques.com/dados          → http://localhost:8080
eltonmarques.com/login          → http://localhost:8080
eltonmarques.com/auth           → http://localhost:8080
eltonmarques.com/ (catch-all)   → http://localhost:8081    (hub)
eltonmarques.com/* (default)    → http_status:404
```

Essa config do túnel é gerenciada via API da Cloudflare (não há arquivo
correspondente pra versionar) — pra reaplicar/alterar, use a API
(`PUT /accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations`) ou o
painel Zero Trust → Networks → Tunnels → `leitor-matriculas` → Public
Hostnames.

## Login: sessão por cookie, não Basic Auth

O dashboard **não** usa mais o HTTP Basic Auth nativo do navegador (a
caixinha sem estilo) — foi trocado por uma tela de login própria
(`deploy/login/index.html`, mesmo visual do dashboard: aurora, vidro,
Plus Jakarta Sans) + um serviço de sessão minimalista em Python puro
(stdlib, sem dependências) rodando como `cartao-mestre-auth.service`.

Como funciona:

1. Requisição a `/cartaomestre/` ou `/dados/` → nginx faz uma
   sub-requisição interna (`auth_request`) pro serviço de auth
   (`GET /verify`), que checa o cookie `cm_session` (assinado por HMAC,
   validade de 12h).
2. Sem cookie válido → nginx responde `302` pra
   `/login/?next=<url original>` (não é 401 com `WWW-Authenticate`, então
   o navegador nunca mostra a caixinha nativa).
3. `deploy/login/index.html` faz `fetch()` pra `POST /auth/login` com
   usuário/senha em JSON; sucesso seta o cookie e redireciona pro `next`.

Usuários ficam em `/etc/cartao-mestre/users.txt` na VPS (fora do git —
`usuario:salt_hex:sha256_hex`, nunca senha em texto puro). Gerencie com:

```bash
ssh -i "$KEY" "$VPS" "python3 /opt/cartao-mestre-auth/manage_users.py add '<usuario>' '<senha>'"
ssh -i "$KEY" "$VPS" "python3 /opt/cartao-mestre-auth/manage_users.py del '<usuario>'"
ssh -i "$KEY" "$VPS" "python3 /opt/cartao-mestre-auth/manage_users.py list"
```

Todo usuário logado tem o mesmo nível de acesso (só visualização/filtros —
o app não tem modo de edição) — não existe hoje uma distinção de papéis
por usuário.

O dashboard (`app/js/main.js`) usa os três endpoints do serviço de sessão:
`GET /auth/verify` no boot pra saber quem está logado (mostra o usuário no
menu de conta do header), e `POST /auth/logout` nas duas ações desse menu —
"Sair" (volta pro hub) e "Trocar de conta" (volta direto pro `/login/`, já
com `next` de volta pro dashboard). O menu "Exportar" (mesmo header — CSV,
planilha Excel ou PDF) é 100% client-side — não bate em nenhum endpoint, só
monta o arquivo/relatório a partir do que já está carregado no navegador
(ver `app/js/export.js`).

A chave de assinatura dos cookies fica em `/etc/cartao-mestre/secret.key`
(gerada automaticamente na primeira execução do serviço; fora do git).
Trocar essa chave invalida todas as sessões ativas.

## Por que caminhos relativos exigem essa estrutura

O app (`app/index.html`) referencia `../design-system/...` e os módulos JS
fazem fetch em `../dados/csv/...` — caminhos relativos à posição da
página. Servido em `eltonmarques.com/cartaomestre/`, isso resolve pra
`eltonmarques.com/design-system/...` e `eltonmarques.com/dados/...` — por
isso essas pastas (`app/`, `design-system/`, `dados/csv/`) viram
`location`s irmãs no mesmo vhost, refletindo o mesmo layout de pastas do
repo. O hub (servido em `eltonmarques.com/` — raiz) e o login (servido em
`eltonmarques.com/login/`) seguem o mesmo raciocínio: `design-system/` sem
`../` no hub (raiz), `../design-system/` no login (um nível abaixo, como
o app).

## Estrutura na VPS

```
/var/www/cartao-mestre/
├── app/            ← cópia de app/ deste repo
├── design-system/  ← cópia de design-system/ deste repo
└── dados/csv/      ← CSVs reais (não versionados — ver dados/csv/README.md)

/var/www/hub/
└── index.html      ← deploy/hub/index.html deste repo

/var/www/login/
└── index.html      ← deploy/login/index.html deste repo

/opt/cartao-mestre-auth/
├── server.py         ← deploy/auth-service/server.py deste repo
└── manage_users.py   ← deploy/auth-service/manage_users.py deste repo

/etc/cartao-mestre/     (fora do git)
├── users.txt         ← usuários do login
└── secret.key         ← chave de assinatura dos cookies de sessão

/etc/systemd/system/cartao-mestre-auth.service  ← deploy/systemd/cartao-mestre-auth.service deste repo
```

## Deploy inicial / atualização manual

Não há CI/CD — é cópia manual via `scp`. A partir da raiz do repo:

```bash
KEY=~/caminho/para/sua/chave.key
VPS=ubuntu@<ip-da-vps>

# app + assets + dados
scp -i "$KEY" -r app design-system dados "$VPS":/var/www/cartao-mestre/

# hub e login
scp -i "$KEY" deploy/hub/index.html "$VPS":/var/www/hub/index.html
scp -i "$KEY" deploy/login/index.html "$VPS":/var/www/login/index.html

# nginx
scp -i "$KEY" deploy/nginx/cartao-mestre.conf "$VPS":/tmp/ && \
  ssh -i "$KEY" "$VPS" 'sudo mv /tmp/cartao-mestre.conf /etc/nginx/sites-available/ && sudo nginx -t && sudo systemctl restart nginx'

# serviço de auth (só se mudou server.py/manage_users.py)
scp -i "$KEY" deploy/auth-service/server.py "$VPS":/opt/cartao-mestre-auth/server.py
scp -i "$KEY" deploy/auth-service/manage_users.py "$VPS":/opt/cartao-mestre-auth/manage_users.py
ssh -i "$KEY" "$VPS" 'sudo systemctl restart cartao-mestre-auth'
```

`dados/csv/` na VPS precisa ser mantido em dia manualmente (novo mês →
`scp` do CSV novo, ver `dados/csv/README.md` no que muda em `data.js`).

## Segredos — nunca versionados

- Chave SSH privada da VPS.
- Token de API da Cloudflare (usado só pontualmente pra configurar as
  rotas do túnel; pode ser revogado depois de configurado — a rota fica
  salva no lado da Cloudflare, não depende do token continuar válido).
- `/etc/cartao-mestre/users.txt` e `/etc/cartao-mestre/secret.key`.
