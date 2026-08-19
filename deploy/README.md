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

Duas instâncias de Nginx rodando só em `127.0.0.1` (nunca expostas
externamente por conta própria — só alcançáveis via túnel):

| Vhost | Porta | Serve | Auth |
|---|---|---|---|
| `deploy/nginx/cartao-mestre.conf` | `127.0.0.1:8080` | `/cartaomestre/` (app), `/design-system/` (assets do template), `/dados/` (CSVs) | `/cartaomestre/` e `/dados/` com Basic Auth; `/design-system/` público (só CSS/fonte, sem dado sensível — precisa ser público pro hub carregar) |
| `deploy/nginx/hub.conf` | `127.0.0.1:8081` | `deploy/hub/index.html` — página de entrada em `eltonmarques.com/` com links pros projetos da VPS | Público |

Roteamento no túnel (Cloudflare Tunnel → *Public Hostname* / ingress rules,
uma entrada por `path` sob o mesmo hostname `eltonmarques.com`, avaliadas
em ordem, primeira que casa vence):

```
eltonmarques.com/leitor         → http://localhost:8000   (outro projeto, leitor-matriculas — já existia)
eltonmarques.com/cartaomestre   → http://localhost:8080
eltonmarques.com/design-system  → http://localhost:8080
eltonmarques.com/dados          → http://localhost:8080
eltonmarques.com/ (catch-all)   → http://localhost:8081    (hub)
eltonmarques.com/* (default)    → http_status:404
```

Essa config do túnel é gerenciada via API da Cloudflare (não há arquivo
correspondente pra versionar) — pra reaplicar/alterar, use a API
(`PUT /accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations`) ou o
painel Zero Trust → Networks → Tunnels → `leitor-matriculas` → Public
Hostnames.

## Por que caminhos relativos exigem essa estrutura

O app (`app/index.html`) referencia `../design-system/...` e os módulos JS
fazem fetch em `../dados/csv/...` — caminhos relativos à posição da
página. Servido em `eltonmarques.com/cartaomestre/`, isso resolve pra
`eltonmarques.com/design-system/...` e `eltonmarques.com/dados/...` — por
isso essas três pastas (`app/`, `design-system/`, `dados/csv/`) viram três
`location`s irmãs no mesmo vhost, refletindo o mesmo layout de pastas do
repo. O hub (servido em `eltonmarques.com/` — raiz) referencia
`design-system/assets/...` sem `../`, pelo mesmo motivo.

## Estrutura na VPS

```
/var/www/cartao-mestre/
├── app/            ← cópia de app/ deste repo
├── design-system/  ← cópia de design-system/ deste repo
└── dados/csv/      ← CSVs reais (não versionados — ver dados/csv/README.md)

/var/www/hub/
└── index.html      ← deploy/hub/index.html deste repo
```

## Deploy inicial / atualização manual

Não há CI/CD — é cópia manual via `scp`. A partir da raiz do repo:

```bash
KEY=~/caminho/para/sua/chave.key
VPS=ubuntu@<ip-da-vps>

scp -i "$KEY" -r app design-system dados "$VPS":/var/www/cartao-mestre/
scp -i "$KEY" deploy/hub/index.html "$VPS":/var/www/hub/index.html
scp -i "$KEY" deploy/nginx/cartao-mestre.conf "$VPS":/tmp/ && \
  ssh -i "$KEY" "$VPS" 'sudo mv /tmp/cartao-mestre.conf /etc/nginx/sites-available/ && sudo nginx -t && sudo systemctl restart nginx'
```

`dados/csv/` na VPS precisa ser mantido em dia manualmente (novo mês →
`scp` do CSV novo, ver `dados/csv/README.md` no que muda em `data.js`).

## Basic Auth do dashboard

Usuário/senha ficam em `/etc/nginx/.htpasswd-cartaomestre` na VPS (fora do
git — nunca versionar hash de senha real). Para (re)criar:

```bash
ssh -i "$KEY" "$VPS" "sudo htpasswd -bc /etc/nginx/.htpasswd-cartaomestre '<usuario>' '<senha>'"
```

## Segredos — nunca versionados

- Chave SSH privada da VPS.
- Token de API da Cloudflare (usado só pontualmente pra configurar as
  rotas do túnel; pode ser revogado depois de configurado — a rota fica
  salva no lado da Cloudflare, não depende do token continuar válido).
- Hash do `.htpasswd`.
