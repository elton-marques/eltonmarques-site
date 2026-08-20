# eltonmarques.com

Landing page pessoal do Elton Marques — servida na raiz de
`eltonmarques.com`. Estático, sem build: `deploy/hub/index.html` +
`design-system/` (assets do template visual).

## Estrutura

- `deploy/hub/index.html` — a página em si (hero, Sobre, Projetos,
  Serviços, Contato)
- `design-system/` — fontes self-hosted, runtime Tailwind e ícones usados
  pela página
- `deploy/nginx/hub.conf` — config do nginx na VPS
- `deploy/README.md` — como o deploy funciona (VPS, Cloudflare Tunnel,
  passo a passo pra publicar uma atualização)
- `media/` — assets de referência da identidade visual (logo, painel de
  marca) — não fazem parte do site publicado

## Projetos irmãos

Os cards da seção "Projetos" da landing apontam pra apps publicados
separadamente na mesma VPS, cada um em seu próprio repositório:

- [Cartão Mestre](https://github.com/elton-marques/cartao-mestre) —
  dashboard de controle de uso do cartão mestre
- [Leitor de Matrículas](https://github.com/elton-marques/leitor-matriculas) —
  OCR de formulários manuscritos

## Deploy

Ver `deploy/README.md`.
