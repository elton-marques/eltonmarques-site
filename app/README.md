# Dashboard Cartão Mestre

App estático client-side (HTML + JS puro, sem build/framework) que lê os
CSVs de `dados/csv/`, aplica a limpeza descrita no plano e renderiza o
dashboard. Reaproveita o runtime Tailwind já embutido em
`design-system/assets/` para manter a mesma linguagem visual do template
do projeto (tema escuro, cards `rounded-3xl`).

## Rodar localmente

O navegador bloqueia `fetch()` de arquivos locais abertos direto via
`file://`, então é preciso servir a pasta por HTTP. Rode a partir da
**raiz do repositório** (não da pasta `app/`), para que `app/` consiga
acessar `../dados/csv/` corretamente:

```bash
# opção 1 — Node (não precisa instalar nada além do Node)
npx serve .

# opção 2 — Python
python -m http.server 8080
```

Depois abra `http://localhost:PORTA/app/` no navegador.

## Estrutura

- `index.html` — shell da página e filtros
- `js/csv.js` — parser CSV (lida com aspas/quebras de linha embutidas)
- `js/normalize.js` — normalização de SETOR/MOTIVO/RESPONSÁVEL
- `js/data.js` — carregamento dos 6 CSVs + limpeza (ETL)
- `js/aggregate.js` — KPIs, rankings, heatmap, qualidade de dados
- `js/render.js` — renderização em DOM puro
- `js/main.js` — bootstrap e filtros interativos

## Decisões de limpeza (ver plano completo para o racional)

- Linhas sem data em `dd/mm/aaaa` na 1ª coluna são descartadas (isso já
  remove banner, cabeçalho, linhas em branco e o rodapé fixo
  `FOR.PRP.0017...` de cada arquivo mensal).
- Duplicatas exatas (mesma linha inteira) são removidas e contadas.
- `SETOR`/`MOTIVO`/`RESPONSÁVEL` passam por normalização de
  caixa/espaço/traço; `SETOR` tem também um dicionário pequeno de
  apelidos conhecidos (`js/normalize.js`) — extensível conforme novos
  meses revelarem novas variações.
- Matrícula vazia ou sem correspondência em `COLABORADORES.csv` vira
  `naoCadastrado: true` (exibido como "órfã"), nunca é descartada.
- Aprovador fora de `GESTORES.csv` vira `aprovadorNaoAutorizado: true`
  e aparece no painel de alerta vermelho.
- A data suspeita (`23/01/2006` em `JANEIRO.csv`) **não é corrigida
  automaticamente** — só é contabilizada no painel de qualidade, como
  o plano definiu.

## Adicionar um novo mês

1. Coloque o CSV do mês em `dados/csv/` (mesmo formato dos existentes: banner
   na linha 1, linha 2 em branco, cabeçalho real na linha 3 — ver
   `CLAUDE.md` da raiz do repo).
2. Abra `app/js/data.js` e acrescente uma linha em `MONTHLY_FILES`, na ordem
   cronológica, ex.: `{ path: '../dados/csv/MAIO.csv', mes: 'Maio' }`.
3. Pronto — filtro de período, tendência mensal, KPIs e o texto do
   cabeçalho ("jan/2026 – mai/2026" etc.) se recalculam sozinhos a partir
   dessa lista; nenhum outro arquivo precisa mudar.

Se o nome do arquivo-fonte vier com acento/typo (como aconteceu com
`FEVEVEIRO.csv`), copie o nome exatamente como está no arquivo — o `path`
tem que bater com o nome real salvo em disco.

## Pendente

- Nenhuma decisão de framework/backend foi necessária: por ser 100%
  client-side, não há servidor de aplicação a escolher. Se o volume de
  dados crescer muito ou for preciso persistir estado entre usuários,
  reavaliar.
