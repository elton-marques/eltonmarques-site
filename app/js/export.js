/**
 * Exportação da lista de liberações filtrada — em três formatos, todos
 * montados no navegador (sem servidor, sem dependência externa): CSV,
 * planilha Excel e relatório em PDF (via impressão do navegador). Em todos
 * os três, o que sai é exatamente o que está filtrado no dashboard no
 * momento do clique (mesmos `state.filters` de sempre — ver
 * exportFilteredCSV/exportSpreadsheet/exportPDF em main.js), nunca o
 * dataset inteiro.
 */

// ============================================================== Utilitários

/** Dispara o download no navegador via um <a download> temporário — não
 * precisa de servidor, o Blob já vive só no lado do cliente. */
function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportTimestamp() {
  return new Date().toISOString().slice(0, 10);
}

const EXPORT_HEADER = [
  'Mês', 'Data', 'Hora', 'Matrícula', 'Nome', 'Setor', 'Função', 'Motivo',
  'Gestor responsável', 'Matrícula órfã', 'Gestor fora da lista',
];

function recordToExportRow(r) {
  return [
    r.mes,
    r.data,
    r.hora,
    r.matricula,
    r.nomeDisplay,
    r.setor,
    r.funcaoRaw,
    r.motivo,
    r.aprovador,
    r.naoCadastrado ? 'Sim' : 'Não',
    r.aprovadorNaoAutorizado ? 'Sim' : 'Não',
  ];
}

// ===================================================================== CSV

// BOM em escape explícito, não como byte literal no arquivo-fonte — é o que
// faz o Excel no Windows reconhecer UTF-8 sozinho ao abrir o CSV por
// duplo-clique, sem estropiar os acentos.
const CSV_BOM = '﻿';

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  // RFC 4180: só precisa de aspas se o campo tiver vírgula, aspas ou quebra
  // de linha — aspas internas são escapadas dobrando ("").
  if (/["\n\r,]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** `records` já deve vir filtrado (ver applyFilters em aggregate.js) — mais
 * recente primeiro, mesmo critério usado nas listas de liberações da UI. */
function recordsToCSV(records) {
  const lines = [EXPORT_HEADER.map(csvEscape).join(',')];
  for (const r of sortByRecency(records)) {
    lines.push(recordToExportRow(r).map(csvEscape).join(','));
  }
  // \r\n (não só \n): é o que o Excel no Windows espera pra não juntar tudo
  // numa linha só quando o CSV é aberto por duplo-clique.
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

function downloadCSV(filename, csvText) {
  triggerDownload(filename, csvText, 'text/csv;charset=utf-8;');
}

// =========================================================== Planilha (XLS)
//
// Sem lib nenhuma (nem vendorizada): o "SpreadsheetML" é um formato XML
// aberto e documentado que o Excel abre nativamente (File > Open ou
// duplo-clique com extensão .xls), com abas, negrito e tipos de célula reais
// — dá pra montar só com template string, sem gerar um .xlsx (zip) de
// verdade, que exigiria uma lib de compressão. Ressalva: como o conteúdo é
// XML e não o binário .xls de fato, o Excel pode avisar que "a extensão não
// bate com o formato" ao abrir — é seguro clicar em "Sim/Abrir mesmo assim".

function xmlEscape(value) {
  const s = value == null ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xlsHeaderRow(labels) {
  const cells = labels.map((l) => `<Cell ss:StyleID="header"><Data ss:Type="String">${xmlEscape(l)}</Data></Cell>`);
  return `<Row>${cells.join('')}</Row>`;
}

/** `numericCols`: índices (0-based) de `values` que devem virar célula
 * numérica de verdade (dá pra somar/ordenar no Excel) — o resto vira texto. */
function xlsDataRow(values, numericCols = []) {
  const cells = values.map((v, i) => {
    if (numericCols.includes(i)) return `<Cell><Data ss:Type="Number">${Number(v) || 0}</Data></Cell>`;
    return `<Cell><Data ss:Type="String">${xmlEscape(v)}</Data></Cell>`;
  });
  return `<Row>${cells.join('')}</Row>`;
}

function xlsSheet(name, rows) {
  // Nome de aba no Excel: até 31 caracteres, sem : \ / ? * [ ] — os nomes
  // usados aqui já são curtos e simples, só o slice é defensivo.
  return `<Worksheet ss:Name="${xmlEscape(name).slice(0, 31)}"><Table>${rows.join('')}</Table></Worksheet>`;
}

function buildWorkbookXML(sheets) {
  const sheetsXml = sheets.map((s) => xlsSheet(s.name, s.rows)).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#E5E7EB" ss:Pattern="Solid"/></Style>
 </Styles>
 ${sheetsXml}
</Workbook>`;
}

function buildLiberacoesSheetRows(records) {
  const rows = [xlsHeaderRow(EXPORT_HEADER)];
  for (const r of sortByRecency(records)) rows.push(xlsDataRow(recordToExportRow(r)));
  return rows;
}

/** Aba de ranking genérica (Setor/Gestor × contagem × %) — mesma forma dos
 * cards "Setores com mais liberações" / "Gestores por volume" do dashboard. */
function buildRankingSheetRows(headerLabels, items, keyField, total) {
  const rows = [xlsHeaderRow(headerLabels)];
  for (const item of items) {
    const pct = total ? Math.round((item.count / total) * 100) : 0;
    rows.push(xlsDataRow([item[keyField], item.count, `${pct}%`], [1]));
  }
  return rows;
}

function buildMotivoSheetRows(breakdown) {
  const rows = [xlsHeaderRow(['Motivo', 'Liberações', '%'])];
  if (breakdown.negadoCount > 0) rows.push(xlsDataRow(['HORÁRIO NEGADO', breakdown.negadoCount, `${breakdown.negadoPct}%`], [1]));
  for (const [motivo, count] of breakdown.outros) {
    const pct = breakdown.total ? Math.round((count / breakdown.total) * 100) : 0;
    rows.push(xlsDataRow([motivo, count, `${pct}%`], [1]));
  }
  return rows;
}

function buildResumoSheetRows({ records, filters, kpis, duplicatesRemoved }) {
  const chips = describeFilters(filters);
  const filtroDesc = chips.length ? chips.map((c) => c.label).join(' · ') : 'Nenhum (todos os dados)';
  const rows = [xlsHeaderRow(['Métrica', 'Valor'])];
  const add = (label, value) => rows.push(xlsDataRow([label, value]));
  add('Filtros ativos', filtroDesc);
  add('Período', dateRangeLabel(records));
  add('Total de liberações', String(kpis.total));
  add('Horário negado', `${kpis.negado} (${kpis.negadoPct}%)`);
  add('Colaboradores únicos', String(kpis.colaboradoresUnicos));
  add('Matrícula órfã', `${kpis.orfaos} (${kpis.orfaosPct}%) — sempre incluída no total`);
  add('Gestor irregular — liberações', String(kpis.naoAutorizadoEventos));
  add('Gestor irregular — gestores distintos', String(kpis.naoAutorizadoPessoas));
  add('Duplicatas removidas (dataset completo)', String(duplicatesRemoved));
  add('Gerado em', new Date().toLocaleString('pt-BR'));
  return rows;
}

/** Monta o workbook inteiro (várias abas) a partir dos registros já
 * filtrados — mesmas agregações usadas pelos cards do dashboard
 * (aggregate.js), só que exportadas em vez de renderizadas em tela. */
function buildDashboardWorkbookXML({ records, filters, duplicatesRemoved }) {
  const kpis = computeKPIs(records, duplicatesRemoved);
  const motivo = motivoBreakdown(records);
  const setores = topSetores(records, 20);
  const gestores = topAprovadores(records, 20);
  const irregulares = unauthorizedApprovers(records);

  const sheets = [
    { name: 'Resumo', rows: buildResumoSheetRows({ records, filters, kpis, duplicatesRemoved }) },
    { name: 'Liberações', rows: buildLiberacoesSheetRows(records) },
    { name: 'Por Setor', rows: buildRankingSheetRows(['Setor', 'Liberações', '%'], setores, 'setor', records.length) },
    { name: 'Por Motivo', rows: buildMotivoSheetRows(motivo) },
    { name: 'Por Gestor', rows: buildRankingSheetRows(['Gestor', 'Liberações', '%'], gestores, 'aprovador', records.length) },
  ];
  if (irregulares.length) {
    sheets.push({ name: 'Gestores Fora da Lista', rows: buildRankingSheetRows(['Gestor', 'Liberações', '%'], irregulares, 'aprovador', records.length) });
  }
  return buildWorkbookXML(sheets);
}

function downloadWorkbook(filename, xml) {
  triggerDownload(filename, xml, 'application/vnd.ms-excel;charset=utf-8;');
}

// ===================================================================== PDF
//
// Sem lib de PDF nenhuma: abre um relatório autocontido (HTML+CSS inline,
// tema claro pensado pra papel, nada do visual escuro do dashboard) numa
// aba nova e chama window.print() — o usuário escolhe "Salvar como PDF" no
// destino da própria caixa de impressão do navegador. Os "gráficos" são
// barras em CSS puro (largura proporcional ao valor), que imprimem de forma
// confiável em qualquer navegador/impressora, ao contrário de reaproveitar
// os SVGs animados do dashboard (pensados pro tema escuro interativo).

function printBarRows(items, labelFn, countFn, total) {
  const max = Math.max(1, ...items.map(countFn));
  return items.map((item) => {
    const count = countFn(item);
    const label = xmlEscape(labelFn(item));
    const widthPct = Math.max(2, Math.round((count / max) * 100));
    const pctLabel = total ? ` · ${Math.round((count / total) * 100)}%` : '';
    return `<div class="bar-row">
      <div class="bar-label" title="${label}">${label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${widthPct}%"></div></div>
      <div class="bar-count">${count}${pctLabel}</div>
    </div>`;
  }).join('');
}

function printTable(headerLabels, rows) {
  const thead = `<tr>${headerLabels.map((l) => `<th>${xmlEscape(l)}</th>`).join('')}</tr>`;
  const tbody = rows.map((r) => `<tr>${r.map((c) => `<td>${xmlEscape(c)}</td>`).join('')}</tr>`).join('');
  return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

/** Monta o documento HTML completo do relatório — string pura, sem tocar o
 * DOM da página principal (é escrito depois numa aba/janela separada). */
function buildPrintReportHTML({ records, filters, duplicatesRemoved }) {
  const kpis = computeKPIs(records, duplicatesRemoved);
  const trend = monthlyTrend(records);
  const motivo = motivoBreakdown(records);
  const setores = topSetores(records, 10);
  const gestores = topAprovadores(records, 10);
  const irregulares = unauthorizedApprovers(records);

  const chips = describeFilters(filters);
  const filtroDesc = chips.length ? chips.map((c) => c.label).join(' · ') : 'Nenhum filtro — todos os dados';
  const geradoEm = new Date().toLocaleString('pt-BR');

  const motivoItems = [];
  if (motivo.negadoCount > 0) motivoItems.push(['HORÁRIO NEGADO', motivo.negadoCount]);
  motivoItems.push(...motivo.outros.slice(0, 10));
  const motivoResto = motivo.outros.length > 10 ? motivo.outros.length - 10 : 0;

  const irregularesSection = irregulares.length
    ? `<div class="section"><h2>Gestores fora da lista (${irregulares.length})</h2>${printTable(['Gestor', 'Liberações'], irregulares.slice(0, 20).map((g) => [g.aprovador, String(g.count)]))}</div>`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Cartão Mestre — Relatório</title>
<style>
  @page { margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: 24px; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { color: #6b7280; font-size: 11px; margin: 0 0 20px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; break-inside: avoid; }
  .kpi .label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; }
  .kpi .value { font-size: 18px; font-weight: 700; margin-top: 2px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 20px 0 10px; break-after: avoid; }
  .section { break-inside: avoid; }
  .bar-row { display: flex; align-items: center; gap: 8px; font-size: 11px; margin-bottom: 5px; }
  .bar-label { width: 160px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { flex: 1; background: #f3f4f6; border-radius: 4px; height: 11px; overflow: hidden; }
  .bar-fill { height: 100%; background: #2563eb; }
  .bar-count { width: 90px; text-align: right; flex-shrink: 0; color: #374151; }
  .note { font-size: 10px; color: #9ca3af; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #f0f0f0; }
  th { color: #6b7280; font-weight: 600; font-size: 10px; text-transform: uppercase; }
  .footer { margin-top: 28px; font-size: 10px; color: #9ca3af; text-align: center; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <h1>💳 Cartão Mestre — Relatório de Liberações</h1>
  <p class="subtitle">${xmlEscape(dateRangeLabel(records))} · ${xmlEscape(filtroDesc)} · gerado em ${xmlEscape(geradoEm)}</p>

  <div class="kpi-grid">
    <div class="kpi"><div class="label">Total de liberações</div><div class="value">${fmtInt(kpis.total)}</div></div>
    <div class="kpi"><div class="label">Horário negado</div><div class="value">${kpis.negadoPct}%</div></div>
    <div class="kpi"><div class="label">Colaboradores únicos</div><div class="value">${fmtInt(kpis.colaboradoresUnicos)}</div></div>
    <div class="kpi"><div class="label">Matrícula órfã</div><div class="value">${kpis.orfaosPct}%</div></div>
    <div class="kpi"><div class="label">Gestor irregular</div><div class="value">${fmtInt(kpis.naoAutorizadoEventos)}</div></div>
    <div class="kpi"><div class="label">Duplicatas removidas</div><div class="value">${fmtInt(duplicatesRemoved)}</div></div>
  </div>

  <div class="section">
    <h2>Liberações por mês</h2>
    ${printBarRows(trend, (t) => t.mes, (t) => t.count)}
  </div>

  <div class="section">
    <h2>Distribuição por motivo</h2>
    ${printBarRows(motivoItems, (m) => m[0], (m) => m[1], kpis.total)}
    ${motivoResto > 0 ? `<p class="note">+ ${motivoResto} outro(s) motivo(s) não listado(s) — ver planilha/CSV pro detalhe completo.</p>` : ''}
  </div>

  <div class="section">
    <h2>Setores com mais liberações</h2>
    ${printBarRows(setores, (s) => s.setor, (s) => s.count, kpis.total)}
  </div>

  <div class="section">
    <h2>Gestores por volume</h2>
    ${printBarRows(gestores, (g) => g.aprovador, (g) => g.count, kpis.total)}
  </div>

  ${irregularesSection}

  <p class="footer">eltonmarques.com · Cartão Mestre — dashboard interno · relatório gerado automaticamente, não é documento oficial</p>

  <script>
    // Dispara a caixa de impressão sozinho ao carregar — "Salvar como PDF"
    // no destino é a forma de virar arquivo, sem precisar de lib de PDF.
    window.onload = () => window.print();
  </script>
</body>
</html>`;
}

/** Abre o relatório numa aba nova (não mexe no DOM da página principal) e
 * deixa o próprio HTML disparar a impressão ao carregar. */
function openPrintReport(html) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Não foi possível abrir a aba do relatório — verifique se o navegador bloqueou pop-ups pra este site.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
