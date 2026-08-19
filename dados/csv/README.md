# dados/csv/

Os CSVs desta pasta **não são versionados** (veja `.gitignore` na raiz —
`dados/csv/*.csv`), porque contêm dados pessoais reais de funcionários
(nome, matrícula, setor). Ao clonar o repo em outra máquina, copie esses
arquivos separadamente (pendrive, OneDrive, zip à parte) para dentro desta
pasta antes de rodar o app.

Formato: português, delimitado por vírgula, UTF-8 com acentos, campos
multi-linha entre aspas.

## Arquivos esperados

- **`COLABORADORES.csv`** — registro de funcionários:
  `MATRÍCULA,NOME,FUNÇÃO,SETOR`. `MATRÍCULA` é a chave de junção com os
  logs mensais.

- **`GESTORES.csv`** — lista livre (não tabular) de gestores/aprovadores
  autorizados, sob o cabeçalho "GESTORES AUTORIZADOS". São os valores que
  populam a coluna `RESPONSÁVEL PELA AUTORIZAÇÃO` dos logs mensais, às
  vezes prefixados com código de grupo (ex.: `GR4 - ANDRÉ VALENÇA`).

- **Logs mensais de uso** — um arquivo por mês (`JANEIRO.csv`,
  `FEVEVEIRO.csv` — grafia com erro na fonte original, é assim mesmo,
  `MARÇO.csv`, `ABRIL.csv`, e os meses seguintes conforme forem chegando).
  Cada um é um log de uso do Cartão Mestre: quem contornou uma restrição
  de checkout/acesso, quando, e qual gestor autorizou. Layout:
  - Linha 1: banner — `Controle de Uso do Cartão Mestre,...,"FILIAL: 08\nCARUARU"`
  - Linha 2: em branco
  - Linha 3: cabeçalho real —
    `DATA,HORA,MATRÍCULA,NOME,SETOR,FUNÇÃO,MOTIVO,"RESPONSÁVEL\nPELA AUTORIZAÇÃO"`
  - Linha 4+: um registro por evento.

## Adicionar um novo mês

1. Coloque o CSV do mês novo aqui, seguindo exatamente o mesmo formato
   (banner na linha 1, linha em branco na linha 2, cabeçalho na linha 3).
2. Abra `app/js/data.js` e acrescente uma linha em `MONTHLY_FILES`, na
   ordem cronológica — ex.: `{ path: '../dados/csv/MAIO.csv', mes: 'Maio' }`.
   O nome do arquivo em `path` precisa bater exatamente com o nome salvo em
   disco (inclusive erros de grafia/acentuação, como em `FEVEVEIRO.csv`).

Mais detalhes de limpeza/normalização em `app/README.md`.
