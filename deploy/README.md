# Deploy — Hub (eltonmarques.com)

Documenta como a landing pessoal (raiz de `eltonmarques.com`) fica
publicada na VPS Oracle, pra dar pra reproduzir/atualizar de outro PC sem
precisar redescobrir tudo.

> Este repo é só o hub. O Cartão Mestre (dashboard, login, serviço de
> auth) foi separado pro repo `elton-marques/cartao-mestre` — os dois
> continuam publicados na mesma VPS, como serviços irmãos sob o mesmo
> domínio, cada um com seu próprio deploy.

## Topologia

A VPS **não expõe portas 80/443 diretamente** (firewall só libera 22/SSH e
a malha Tailscale). Tudo que é público passa pelo **Cloudflare Tunnel**
(`cloudflared`, já rodando como serviço systemd, configurado remotamente
pelo painel Cloudflare Zero Trust — não existe `config.yml` local; a
config do túnel vive na nuvem e é lida via API/dashboard).

```
Internet → Cloudflare (eltonmarques.com) → cloudflared (túnel) → nginx local na VPS
```

O único serviço deste repo, rodando só em `127.0.0.1` (nunca exposto
externamente por conta própria — só alcançável via túnel):

| Serviço | Porta | Serve | Auth |
|---|---|---|---|
| `deploy/nginx/hub.conf` (nginx) | `127.0.0.1:8081` | `deploy/hub/index.html` — landing pessoal em `eltonmarques.com/` | Público |

Roteamento no túnel (Cloudflare Tunnel → *Public Hostname* / ingress rules,
uma entrada por `path` sob o mesmo hostname `eltonmarques.com`, avaliadas
em ordem, primeira que casa vence — mantido aqui só como referência, quem
configura de fato é o painel Cloudflare):

```
eltonmarques.com/leitor         → http://localhost:8000   (outro projeto, leitor-matriculas)
eltonmarques.com/cartaomestre   → http://localhost:8080   (repo elton-marques/cartao-mestre)
eltonmarques.com/design-system  → http://localhost:8080   (idem, design-system do Cartão Mestre)
eltonmarques.com/dados          → http://localhost:8080   (idem)
eltonmarques.com/login          → http://localhost:8080   (idem)
eltonmarques.com/auth           → http://localhost:8080   (idem)
eltonmarques.com/ (catch-all)   → http://localhost:8081    (hub — este repo)
eltonmarques.com/* (default)    → http_status:404
```

Pra reaplicar/alterar rotas do túnel, use a API da Cloudflare
(`PUT /accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations`) ou o
painel Zero Trust → Networks → Tunnels → `leitor-matriculas` → Public
Hostnames.

## Por que caminho relativo sem `../`

O hub (`deploy/hub/index.html`) referencia `design-system/assets/...` sem
`../` — servido em `eltonmarques.com/` (raiz), isso resolve direto pra
`eltonmarques.com/design-system/...`, que é servido pelo nginx do Cartão
Mestre (outro repo, porta 8080) via túnel. Esse repo tem sua própria cópia
de `design-system/` só pra desenvolvimento local — na VPS, a rota
`/design-system/` de produção sempre vem do repo do Cartão Mestre.

## Estrutura na VPS

```
/var/www/hub/
├── index.html      ← deploy/hub/index.html deste repo
├── 404.html        ← deploy/hub/404.html (error_page 404 no nginx)
├── robots.txt      ← deploy/hub/robots.txt
└── sitemap.xml     ← deploy/hub/sitemap.xml
```

`deploy/nginx/hub.conf` (symlink em `/etc/nginx/sites-available/hub.conf`
na VPS) manda os headers de segurança (HSTS, nosniff, X-Frame-Options,
Referrer-Policy, Permissions-Policy) e aponta `error_page 404` pro
`404.html` acima. Alterar esse arquivo exige `sudo nginx -t && sudo
systemctl reload nginx` na VPS depois do `scp` — não é hot-reload
automático como o `index.html`.

(`/var/www/cartao-mestre/` e `/var/www/login/` também existem na mesma
VPS, mas pertencem ao outro repo — ver `elton-marques/cartao-mestre`.)

## Deploy inicial / atualização manual

Não há CI/CD — é cópia manual via `scp`. A partir da raiz do repo:

```bash
KEY=~/caminho/para/sua/chave.key
VPS=ubuntu@<ip-da-vps>

scp -i "$KEY" deploy/hub/index.html "$VPS":/var/www/hub/index.html
```

## Cache do Cloudflare

O hub não manda `Cache-Control: no-store` hoje — se um deploy não
aparecer pra ninguém depois de alguns minutos, purgue a borda: painel
Cloudflare → domínio → **Caching → Configuration → Purge Everything** (ou
"Custom Purge" só com `eltonmarques.com/`).

## Segredos — nunca versionados

- Chave SSH privada da VPS.
- Token de API da Cloudflare (usado só pontualmente pra configurar as
  rotas do túnel; pode ser revogado depois de configurado).
