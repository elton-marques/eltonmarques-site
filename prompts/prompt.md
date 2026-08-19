# MISSÃO — EVOLUÇÃO INCREMENTAL DO DASHBOARD CARTÃO MESTRE

Evolua o dashboard existente do projeto **Cartão Mestre**.

**Não peça aprovação antes de começar.**
Primeiro audite o projeto, depois implemente, teste, corrija e finalize.

A implementação atual do repositório é a fonte de verdade. Não assuma que caminhos, componentes ou arquitetura descritos aqui continuam iguais.

## REGRAS DE ESCOPO

Esta é uma **evolução incremental**, não um redesign ou reescrita.

Antes de alterar código, audite:

* estrutura do projeto;
* carregamento/processamento dos CSVs;
* componentes do dashboard;
* filtros;
* KPIs;
* rankings;
* sinais/anomalias;
* gráficos;
* testes.

Depois:

* altere somente o necessário;
* reutilize componentes e mecanismos existentes;
* preserve layout, identidade visual e comportamento atual;
* não crie aplicação paralela;
* não migre CSV para banco;
* não crie infraestrutura nova;
* não adicione dependências sem necessidade;
* não faça refatorações não relacionadas;
* não invente dados, relacionamentos ou identificadores.

Se uma mudança estrutural for realmente necessária, faça a alteração, mas valide imediatamente e registre a justificativa no relatório.

---

# 1. TERMINOLOGIA

Na interface, o termo de negócio deve ser sempre:

**LIBERAÇÃO**

Substitua `evento` por `liberação` somente quando for texto apresentado ao usuário.

Não renomeie automaticamente variáveis, funções, classes, APIs ou contratos internos apenas por causa da terminologia.

---

# 2. KPIs E HIERARQUIA

Corrija ambiguidades semânticas reais nos KPIs.

O indicador atualmente apresentado como:

> Horário Negado — 90%

deve deixar claro que representa participação no total de liberações, e não taxa de falha.

Exemplo:

> Principal motivo
> Horário Negado — 90%
> 1.380 de 1.533 liberações

Preserve métricas válidas.

A narrativa do dashboard deve favorecer:

**Resumo → Padrões → Pessoas/Anomalias → Liberação**

Faça isso sem reorganizar toda a página desnecessariamente.

---

# 3. RANKINGS

Audite rankings de:

* colaboradores;
* gestores;
* setores.

Quando os dados já disponíveis permitirem ganho analítico real, adicione contexto como percentual do total, dias ativos, participação relativa ou liberações por colaborador.

A quantidade absoluta continua sendo o dado principal.

Não adicione métricas somente para preencher espaço visual.

---

# 4. FILTROS E INVESTIGAÇÃO

Os filtros atuais no topo são a fonte de verdade.

**Não recrie, duplique ou substitua o mecanismo de filtros.**

Novas interações devem reutilizar o estado atual dos filtros e preservá-lo durante a investigação.

Quando a estrutura existente permitir:

**Sinal → contexto/filtro → liberações relacionadas → detalhe**

Criar drill-down para:

* setor → liberações;
* motivo → liberações;
* colaborador → liberações;
* gestor → liberações;
* anomalia → liberações;
* liberação → detalhe.

Se os dados atuais não permitirem relacionar um sinal a liberações de forma confiável, não invente relacionamento nem crie arquitetura paralela. Registre a limitação.

Anomalias continuam sendo **sinais de atenção**, nunca acusações.

---

# 5. DETALHE DE LIBERAÇÃO

Criar uma forma de abrir uma liberação individual a partir dos dados existentes, preferencialmente preservando o contexto atual através de drawer, modal ou painel compatível com o dashboard.

Antes de criar identificador, descubra como a liberação já é identificada nos dados.

Não invente ID permanente se não houver identificação confiável.

Exibir somente informações realmente disponíveis, como:

* data;
* horário;
* colaborador;
* matrícula;
* setor;
* gestor;
* motivo;
* faixa horária;
* origem;
* regra/heurística relacionada.

Não inventar dados ou evidências.

---

# 6. GRÁFICO "LIBERAÇÕES POR DIA"

Renomear a interface de `Eventos por dia` para:

**Liberações por dia**

Auditar a causa real do problema visual atual antes de alterar o componente.

Corrigir apenas o necessário para que o gráfico:

* mantenha proporção correta;
* não fique esticado;
* utilize adequadamente o espaço disponível;
* tenha boa resolução visual;
* permaneça responsivo;
* mantenha os dados atuais;
* apresente datas legíveis.

Quando houver muitos dias, ajuste a densidade dos rótulos do eixo X sem remover dados da série.

Não substitua a biblioteca ou componente sem necessidade.

---

# 7. SEPARAÇÃO AUTOMÁTICA ENTRE MESES

Adicionar ao gráfico **Liberações por dia** uma linha vertical discreta indicando a transição entre meses.

A posição deve ser calculada automaticamente a partir das datas reais.

**Não codificar manualmente datas como 27/01, 04/02, 23/02 etc.**

A solução deve continuar funcionando quando:

* houver novos dias;
* existirem lacunas;
* a quantidade de dias mudar;
* novos meses forem adicionados;
* o gráfico for redimensionado.

A linha deve marcar a transição entre o último ponto de um mês e o primeiro ponto do seguinte, e não simplesmente coincidir com um ponto de dados.

Use, preferencialmente, o mecanismo nativo de referência/anotação da biblioteca utilizada.

Rótulos de mês são opcionais e só devem ser adicionados se melhorarem a leitura.

---

# 8. NOVOS MESES E CSV

O código não pode assumir que abril/2026 é o fim dos dados.

O período deve ser derivado dos CSVs disponíveis.

Não criar lógica específica para determinados meses.

Não alterar o formato dos CSVs sem necessidade.

Não criar mecanismo especial de importação futura.

O dashboard deve continuar funcionando quando novos CSVs/meses forem adicionados de acordo com o fluxo existente.

---

# 9. DESIGN E PERFORMANCE

Preserve:

* tema;
* identidade visual;
* cards;
* gráficos;
* cores semânticas;
* responsividade;
* layout geral.

Prioridade:

**clareza > decoração**

Como os dados vêm de CSV:

* reutilize dados já carregados;
* evite leituras e cálculos redundantes;
* reutilize o mecanismo atual de filtragem.

Não introduza cache complexo, banco ou infraestrutura nova sem necessidade real.

---

# 10. VALIDAÇÃO

Use os **CSVs reais existentes no projeto**.

Execute os testes existentes e adicione somente os necessários para esta fase.

Valide pelo menos:

* carregamento dos CSVs;
* múltiplos CSVs;
* período Jan–Abr;
* novos meses não fixados no código;
* filtros existentes;
* combinações de filtros;
* drill-down;
* detalhe de diferentes liberações;
* preservação do contexto após abrir/fechar detalhe;
* setor/motivo/colaborador/gestor/anomalia;
* ausência de resultados;
* gráfico Liberações por dia;
* proporção/responsividade;
* legibilidade das datas;
* separação automática entre meses;
* comportamento com lacunas de datas;
* ausência de erros no console;
* build, se existir;
* regressão das funcionalidades existentes.

Inicie o projeto localmente e faça validação visual com os dados reais.

Não crie dados fictícios apenas para produzir evidência de funcionamento quando os dados reais já forem suficientes.

---

# 11. CRITÉRIO DE CONCLUSÃO

A fase estará concluída quando o dashboard permitir, sem alterar sua arquitetura ou identidade desnecessariamente:

**Resumo → Padrão → Pessoa/Anomalia → Liberação**

com:

* KPIs semanticamente claros;
* rankings com contexto útil;
* filtros existentes preservados;
* sinais de atenção investigáveis quando os dados permitirem;
* drill-down;
* detalhe individual da liberação;
* gráfico Liberações por dia corrigido;
* separação automática entre meses;
* funcionamento com novos meses;
* ausência de regressões.

Não adicione funcionalidades fora deste escopo.

---

# 12. RELATÓRIO FINAL

Informe objetivamente:

### Implementado

Principais alterações.

### Arquivos

Arquivos criados/modificados.

### Decisões

Principais decisões técnicas tomadas.

### Validação

Testes executados e resultados.

### Limitações

Somente limitações reais encontradas.

### Alterações estruturais

Informe somente se alguma mudança estrutural foi necessária e por quê.

**Não declare a fase concluída se houver falha causada pela implementação.**

Comece obrigatoriamente pela auditoria.
