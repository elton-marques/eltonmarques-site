/**
 * Bootstrap: carrega os dados, popula filtros e liga o render inicial +
 * o re-render em cada mudança de filtro (via dropdown OU clique em
 * qualquer gráfico/card).
 */

const state = {
  // Matrícula órfã NÃO é um filtro de dado (ver applyFilters em aggregate.js):
  // é uma liberação real, só sem cadastro em COLABORADORES.csv (que pode
  // estar desatualizada) — por isso sempre entra no total, sem opção de
  // excluir. `onlyOrfaos` (drill-down "ver só as órfãs") continua existindo.
  filters: { mes: '', setor: '', motivo: '', aprovador: '', weekday: '', data: '', band: '', matricula: '', nomeSemMatricula: '', onlyUnauthorized: false, onlyOrfaos: false },
  dataset: null, // { records, duplicatesRemoved }
  colabQuery: '', // busca do card "Colaboradores" — não é um filtro do dashboard, só narrows essa lista
  paletteOpen: false,
  paletteQuery: '',
  trendModalOpen: false,
  liberacoesModalOpen: false, // lista de liberações relacionadas ao filtro atual (drill-down)
  detailRecord: null, // liberação aberta no modal de detalhe (null = fechado)
  anomaliasCollapsed: localStorage.getItem('cm_anomalias_collapsed') === '1',
  // Oculto por padrão a pedido: o card "Matrícula órfã" só aparece se o
  // usuário ligar esse toggle (popover "Mais opções") — não afeta o total,
  // que sempre inclui as órfãs (ver applyFilters em aggregate.js).
  showOrfaosCard: localStorage.getItem('cm_orfaos_card_visible') === '1',
  openDropdown: null, // 'mes' | 'setor' | 'motivo' | 'aprovador' | 'more' | 'export' | 'account' | null
  username: null, // vem de GET /auth/verify (X-User) no boot; null em dev local sem o serviço de auth
  filterOptions: { setor: [], motivo: [], aprovador: [] }, // opções fixas, calculadas 1x no boot a partir do dataset completo
  // Listas curtas o bastante pra não precisar de scroll (motivos, gestores
  // fora da lista) mostram só os primeiros itens por padrão — "expanded"
  // controla o botão "Mostrar mais" de cada uma, independente das outras.
  // Setores/gestores/colaboradores usam scroll interno em vez disso (podem
  // ter dezenas de itens — "mostrar mais" faria o card virar um elevador).
  expanded: { motivo: false, alerta: false },
};

function els() {
  return {
    kpis: document.getElementById('kpi-grid'),
    anomalias: document.getElementById('anomalias-card'),
    heatmap: document.getElementById('heatmap-card'),
    dia: document.getElementById('dia-card'),
    motivo: document.getElementById('motivo-card'),
    setores: document.getElementById('setor-card'),
    colaboradores: document.getElementById('colaboradores-card'),
    aprovadores: document.getElementById('aprovadores-card'),
    alerta: document.getElementById('alerta-card'),
    activeFilters: document.getElementById('active-filters'),
    colabModal: document.getElementById('colaborador-modal-root'),
    paletteRoot: document.getElementById('command-palette-root'),
    trendModalRoot: document.getElementById('trend-modal-root'),
    liberacoesModalRoot: document.getElementById('liberacoes-modal-root'),
    detalheModalRoot: document.getElementById('detalhe-modal-root'),
    openPaletteBtn: document.getElementById('open-palette'),
    filterMes: document.getElementById('filter-mes'),
    filterSetor: document.getElementById('filter-setor'),
    filterMotivo: document.getElementById('filter-motivo'),
    filterAprovador: document.getElementById('filter-aprovador'),
    filterMore: document.getElementById('filter-more'),
    accountMenu: document.getElementById('account-menu'),
    exportMenu: document.getElementById('export-menu'),
    subtitle: document.getElementById('header-subtitle'),
    footerPeriod: document.getElementById('footer-period'),
    errorBanner: document.getElementById('error-banner'),
  };
}

/** Define um filtro; clicar de novo no mesmo valor limpa (comportamento toggle). */
function setFilter(field, value) {
  state.filters[field] = state.filters[field] === value ? '' : value;
  renderAll();
}

function clearFilter(field) {
  if (field === 'weekday') { state.filters.weekday = ''; state.filters.band = ''; }
  else if (field === 'band') { state.filters.band = ''; }
  else if (field === 'onlyUnauthorized' || field === 'onlyOrfaos') state.filters[field] = false;
  else state.filters[field] = '';
  renderAll();
}

function clearAllFilters() {
  Object.assign(state.filters, { mes: '', setor: '', motivo: '', aprovador: '', weekday: '', data: '', band: '', matricula: '', nomeSemMatricula: '', onlyUnauthorized: false, onlyOrfaos: false });
  renderAll();
}

/** Clique num ponto do gráfico "Liberações por dia" — filtra por aquele dia
 * exato (toggle: clicar de novo no mesmo dia limpa). */
function onDiaClick(data) {
  setFilter('data', data);
}

/** Liga/desliga só a VISIBILIDADE do card "Matrícula órfã" (popover "Mais
 * opções") — o dado em si sempre conta no total, isso não é um filtro. */
function onToggleOrfaosCard(checked) {
  state.showOrfaosCard = checked;
  localStorage.setItem('cm_orfaos_card_visible', checked ? '1' : '0');
  renderAll();
}

// ------------------------------------------------------------------- Sessão

/** GET /auth/verify (proxiado pelo nginx pro serviço de sessão em :8082) —
 * mesma checagem que o nginx já faz via auth_request antes de servir a
 * página, só que chamada agora pelo navegador pra descobrir QUEM está
 * logado (o auth_request original só via se o cookie era válido, não
 * expunha o usuário pra UI). Em dev local (sem nginx/serviço de auth na
 * frente) o fetch falha ou cai num 404 qualquer — o menu de conta cai pro
 * rótulo genérico "Conta" e as ações de logout continuam funcionando. */
async function fetchUsername() {
  try {
    const res = await fetch('/auth/verify', { credentials: 'include' });
    if (res.ok) return res.headers.get('X-User');
  } catch (err) {
    console.error('Falha ao consultar sessão:', err);
  }
  return null;
}

/** POST /auth/logout limpa o cookie de sessão no servidor; o redirect (pro
 * hub ou de volta pro /login/) é o mesmo em ambos os casos — a diferença
 * entre "Sair" e "Trocar de conta" é só pra onde cada um manda depois. */
async function doLogout(redirectTo) {
  state.openDropdown = null;
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
  } catch (err) {
    console.error('Falha ao encerrar sessão:', err);
  }
  location.href = redirectTo;
}

/** "Sair": encerra a sessão e volta pro hub — sai do app por completo. */
function onLogout() {
  doLogout('/');
}

/** "Trocar de conta": encerra a sessão atual e manda direto pra tela de
 * login (não pro hub), já com `next` apontando de volta pra cá — outro
 * usuário loga e cai direto no dashboard, sem passar pelo hub no meio. */
function onSwitchAccount() {
  doLogout('/login/?next=' + encodeURIComponent(location.pathname));
}

// -------------------------------------------------------- Dropdowns de filtro

function onToggleDropdown(key) {
  state.openDropdown = state.openDropdown === key ? null : key;
  renderFilterBar();
}

function onSelectFilter(field, value) {
  state.openDropdown = null;
  state.filters[field] = value;
  renderAll();
}

function closeOpenDropdown() {
  if (!state.openDropdown) return;
  state.openDropdown = null;
  renderFilterBar();
}

function renderFilterBar() {
  const e = els();
  const f = state.filters;
  renderFilterDropdown(e.filterMes, {
    value: f.mes, options: MESES_ORDEM, placeholder: 'Período: todos',
    isOpen: state.openDropdown === 'mes', onToggle: () => onToggleDropdown('mes'), onSelect: (v) => onSelectFilter('mes', v),
  });
  renderFilterDropdown(e.filterSetor, {
    value: f.setor, options: state.filterOptions.setor, placeholder: 'Setor: todos',
    isOpen: state.openDropdown === 'setor', onToggle: () => onToggleDropdown('setor'), onSelect: (v) => onSelectFilter('setor', v),
  });
  renderFilterDropdown(e.filterMotivo, {
    value: f.motivo, options: state.filterOptions.motivo, placeholder: 'Motivo: todos',
    isOpen: state.openDropdown === 'motivo', onToggle: () => onToggleDropdown('motivo'), onSelect: (v) => onSelectFilter('motivo', v),
  });
  renderFilterDropdown(e.filterAprovador, {
    value: f.aprovador, options: state.filterOptions.aprovador, placeholder: 'Gestor: todos',
    isOpen: state.openDropdown === 'aprovador', onToggle: () => onToggleDropdown('aprovador'), onSelect: (v) => onSelectFilter('aprovador', v),
  });
  renderMoreOptions(e.filterMore, {
    isOpen: state.openDropdown === 'more',
    onToggle: () => onToggleDropdown('more'),
    showOrfaosCard: state.showOrfaosCard,
    onToggleOrfaosCard,
  });
  renderExportMenu(e.exportMenu, {
    isOpen: state.openDropdown === 'export',
    onToggle: () => onToggleDropdown('export'),
    // Fecha o painel antes de disparar a exportação (mesmo padrão do
    // onSelectFilter/doLogout — não fica aberto depois do clique).
    onExportCSV: () => { state.openDropdown = null; renderFilterBar(); exportFilteredCSV(); },
    onExportExcel: () => { state.openDropdown = null; renderFilterBar(); exportSpreadsheet(); },
    onExportPDF: () => { state.openDropdown = null; renderFilterBar(); exportPDF(); },
  });
  renderAccountMenu(e.accountMenu, {
    isOpen: state.openDropdown === 'account',
    username: state.username,
    onToggle: () => onToggleDropdown('account'),
    onSwitchAccount,
    onLogout,
  });
}

/** Pisca um anel na borda do card e rola até ele — usado pelos KPIs que não
 * mapeiam pra um filtro (ex.: "Colaboradores únicos"), pra dar uma resposta
 * visível ao clique em vez de simplesmente não fazer nada. */
function scrollToAndHighlight(node) {
  if (!node) return;
  node.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'center' });
  node.classList.add('ring-2', 'ring-blue-400/70');
  setTimeout(() => node.classList.remove('ring-2', 'ring-blue-400/70'), 1100);
}

function onKpiClick(spec) {
  if (spec.action === 'openTrend') {
    openTrendModal();
    return;
  }
  if (spec.action === 'scrollColaboradores') {
    scrollToAndHighlight(els().colaboradores);
    return;
  }
  if (!spec.filterField) return;
  setFilter(spec.filterField, spec.filterValue);
}

// -------------------------------------------------- Modal: tendência mensal

function onTrendModalKeydown(e) {
  if (e.key === 'Escape') closeTrendModalUI();
}

function openTrendModal() {
  state.trendModalOpen = true;
  renderTrendModalRoot();
  document.addEventListener('keydown', onTrendModalKeydown);
}

function closeTrendModalUI() {
  if (!state.trendModalOpen) return;
  state.trendModalOpen = false;
  closeTrendModal(els().trendModalRoot);
  document.removeEventListener('keydown', onTrendModalKeydown);
}

function onTrendSelectMonth(mes) {
  setFilter('mes', mes); // toggle: clicar no mês já ativo limpa o filtro
  closeTrendModalUI();
}

function onTrendClearMes() {
  state.filters.mes = '';
  renderAll();
  closeTrendModalUI();
}

function renderTrendModalRoot() {
  const { records } = state.dataset;
  // Ignora o próprio filtro de mês pro cálculo (senão, com um mês já
  // selecionado, todo o resto apareceria zerado) — mas respeita os demais
  // filtros ativos (setor, motivo, gestor...), igual ao resto do dashboard.
  const filtersNoMes = { ...state.filters, mes: '' };
  const filtered = applyFilters(records, filtersNoMes);
  const detailed = monthlyTrendDetailed(filtered);
  renderTrendModal(els().trendModalRoot, {
    detailed,
    filters: state.filters,
    onSelectMonth: onTrendSelectMonth,
    onClearMes: onTrendClearMes,
    onClose: closeTrendModalUI,
  });
}

function onColaboradorClick(item) {
  if (item.matricula) setFilter('matricula', item.matricula);
  else setFilter('nomeSemMatricula', item.nome);
}

function openColaboradorDetail(item) {
  const events = colaboradorEvents(state.dataset.records, item.matricula, item.matricula ? null : item.nome);
  const root = els().colabModal;
  renderColaboradorModal(root, item, events, () => closeColaboradorModal(root), openLiberacaoDetail);
}

// ---------------------------------------------- Liberações relacionadas + detalhe

/** "Ver liberações (N)" na barra de filtros ativos — passo "liberações relacionadas"
 * do drill-down (sinal → contexto/filtro → liberações relacionadas → detalhe). */
function openLiberacoesModal() {
  state.liberacoesModalOpen = true;
  renderLiberacoesModalRoot();
  document.addEventListener('keydown', onLiberacoesModalKeydown);
}

function onLiberacoesModalKeydown(e) {
  if (e.key === 'Escape') closeLiberacoesModalUI();
}

function closeLiberacoesModalUI() {
  if (!state.liberacoesModalOpen) return;
  state.liberacoesModalOpen = false;
  closeLiberacoesModal(els().liberacoesModalRoot);
  document.removeEventListener('keydown', onLiberacoesModalKeydown);
}

function renderLiberacoesModalRoot() {
  const { records } = state.dataset;
  const filtered = applyFilters(records, state.filters);
  renderLiberacoesModal(els().liberacoesModalRoot, filtered, state.filters, openLiberacaoDetail, closeLiberacoesModalUI);
}

/** Detalhe de uma liberação individual — abre por cima do que já estiver aberto
 * (lista de liberações, ficha do colaborador, ou nada) sem alterar filtros nem
 * fechar o que está por trás; fechar o detalhe preserva esse contexto intacto. */
function openLiberacaoDetail(record) {
  state.detailRecord = record;
  renderLiberacaoDetailModal(els().detalheModalRoot, record, closeLiberacaoDetail);
  document.addEventListener('keydown', onDetailModalKeydown);
}

function onDetailModalKeydown(e) {
  if (e.key === 'Escape') closeLiberacaoDetail();
}

function closeLiberacaoDetail() {
  if (!state.detailRecord) return;
  state.detailRecord = null;
  closeLiberacaoDetailModal(els().detalheModalRoot);
  document.removeEventListener('keydown', onDetailModalKeydown);
}

function onColabQueryChange(value) {
  state.colabQuery = value;
  renderColaboradoresCard();
}

// ------------------------------------------------------------ Anomalias

function onAnomaliaFrequente(item) {
  onColaboradorClick(item); // mesma forma { matricula, nome } do card de colaboradores
}

function onToggleAnomalias() {
  state.anomaliasCollapsed = !state.anomaliasCollapsed;
  localStorage.setItem('cm_anomalias_collapsed', state.anomaliasCollapsed ? '1' : '0');
  renderAnomaliasCard();
}

function renderAnomaliasCard() {
  const e = els();
  const { records } = state.dataset;
  const filtered = applyFilters(records, state.filters);
  renderAnomalias(e.anomalias, detectAnomalias(filtered), state.filters, state.anomaliasCollapsed, {
    onFrequente: onAnomaliaFrequente,
    onPicoSetor: onAnomaliaPicoSetor,
    onAprovador: onAnomaliaAprovador,
    onToggleCollapse: onToggleAnomalias,
  });
}

function onAnomaliaPicoSetor(item) {
  const same = state.filters.setor === item.setor && state.filters.mes === item.mes;
  if (same) { state.filters.setor = ''; state.filters.mes = ''; }
  else { state.filters.setor = item.setor; state.filters.mes = item.mes; }
  renderAll();
}

function onAnomaliaAprovador(item) {
  setFilter('aprovador', item.aprovador);
}

// -------------------------------------------------------- Paleta de comandos

function onPaletteKeydown(e) {
  if (e.key === 'Escape') closePalette();
}

function openPalette() {
  state.paletteOpen = true;
  state.paletteQuery = '';
  renderPalette();
  document.addEventListener('keydown', onPaletteKeydown);
}

function closePalette() {
  if (!state.paletteOpen) return;
  state.paletteOpen = false;
  closeCommandPalette(els().paletteRoot);
  document.removeEventListener('keydown', onPaletteKeydown);
}

function onPaletteQueryChange(value) {
  state.paletteQuery = value;
  renderPalette();
}

function onPaletteSelect(result) {
  if (result.type === 'colaborador') onColaboradorClick(result.payload);
  else if (result.type === 'setor') setFilter('setor', result.payload);
  else if (result.type === 'aprovador') setFilter('aprovador', result.payload);
  closePalette();
}

function renderPalette() {
  const results = globalSearch(state.dataset.records, state.paletteQuery, 8);
  renderCommandPalette(els().paletteRoot, state.paletteQuery, results, onPaletteQueryChange, onPaletteSelect, closePalette);
}

function renderColaboradoresCard() {
  const e = els();
  const { records } = state.dataset;
  const filtered = applyFilters(records, state.filters);
  // "Colaboradores" é só gente cadastrada — matrículas órfãs têm seu
  // próprio KPI/filtro/anomalias, misturadas aqui só confundiam.
  const soColaboradores = filtered.filter((r) => !r.naoCadastrado);
  const q = state.colabQuery;
  const items = q.trim() ? searchColaboradores(soColaboradores, q, Infinity) : aggregateColaboradores(soColaboradores);
  renderColaboradores(e.colaboradores, items, state.filters, q, onColaboradorClick, openColaboradorDetail, onColabQueryChange, soColaboradores.length);
}

function renderDiaCard() {
  const e = els();
  const { records } = state.dataset;
  const filtered = applyFilters(records, state.filters);
  renderDailyCard(e.dia, dailyTrend(filtered), state.filters, onDiaClick);
}

function renderMotivoCard() {
  const e = els();
  const { records } = state.dataset;
  const filtered = applyFilters(records, state.filters);
  renderMotivo(e.motivo, motivoBreakdown(filtered), state.filters, state.expanded.motivo, (motivo) => setFilter('motivo', motivo), onToggleMotivoExpand);
}

function onToggleMotivoExpand() {
  state.expanded.motivo = !state.expanded.motivo;
  renderMotivoCard();
}

function renderAlertaCard() {
  const e = els();
  const { records, duplicatesRemoved } = state.dataset;
  const filtered = applyFilters(records, state.filters);
  const kpis = computeKPIs(filtered, duplicatesRemoved);
  renderAlerta(e.alerta, unauthorizedApprovers(filtered), kpis.naoAutorizadoEventos, kpis.naoAutorizadoPessoas, state.filters, state.expanded.alerta, (aprovador) => setFilter('aprovador', aprovador), onToggleAlertaExpand);
}

function onToggleAlertaExpand() {
  state.expanded.alerta = !state.expanded.alerta;
  renderAlertaCard();
}

function renderSetoresCard() {
  const e = els();
  const { records } = state.dataset;
  const filtered = applyFilters(records, state.filters);
  renderRankingBars(e.setores, 'Setores com mais liberações', 'Clique numa barra para filtrar por esse setor', topSetores(filtered), 'setor', 'bg-cyan-500', state.filters, (setor) => setFilter('setor', setor), filtered.length);
}

function renderAprovadoresCard() {
  const e = els();
  const { records } = state.dataset;
  const filtered = applyFilters(records, state.filters);
  renderRankingBars(e.aprovadores, 'Gestores por volume', 'Clique numa barra para filtrar por esse gestor', topAprovadores(filtered), 'aprovador', 'bg-violet-500', state.filters, (aprovador) => setFilter('aprovador', aprovador), filtered.length);
}

/** Clique no nome do dia (fora das células) — filtra só por esse dia, sem
 * travar numa faixa de horário específica. Clicar de novo no mesmo dia
 * limpa o filtro. */
function onHeatmapDayClick(weekday) {
  const same = state.filters.weekday === weekday && !state.filters.band;
  if (same) { state.filters.weekday = ''; state.filters.band = ''; }
  else { state.filters.weekday = weekday; state.filters.band = ''; }
  renderAll();
}

function renderAll() {
  const e = els();
  const { records, duplicatesRemoved } = state.dataset;
  const filtered = applyFilters(records, state.filters);
  const f = state.filters;

  const kpis = computeKPIs(filtered, duplicatesRemoved);
  const trend = monthlyTrend(filtered);
  renderKPIs(e.kpis, kpis, trend, f, onKpiClick, state.showOrfaosCard);

  renderAnomaliasCard();

  renderHeatmap(e.heatmap, dayHourMatrix(filtered), f, (weekday, band) => {
    if (f.weekday === weekday && f.band === band) { state.filters.weekday = ''; state.filters.band = ''; }
    else { state.filters.weekday = weekday; state.filters.band = band; }
    renderAll();
  }, onHeatmapDayClick);

  renderDiaCard();

  renderMotivoCard();

  renderSetoresCard();

  renderColaboradoresCard();

  renderAprovadoresCard();

  renderAlertaCard();

  renderActiveFilters(e.activeFilters, f, clearFilter, clearAllFilters, filtered.length, openLiberacoesModal);
  renderFilterBar();

  e.subtitle.textContent = `${fmtInt(kpis.total)} de ${fmtInt(records.length)} liberação(ões) · ${dateRangeLabel(records)}`;
  e.footerPeriod.textContent = `Dados de ${dateRangeLabel(records)} · atualizado manualmente`;
}

// ------------------------------------------------------------- Exportação
//
// As três exportações (CSV, planilha, PDF) partem do mesmo recorte: os
// registros filtrados NA TELA agora (mesmos state.filters do resto do
// dashboard) — nunca o dataset inteiro. Ver js/export.js pro formato de
// cada uma (CSV: BOM+escaping RFC 4180; planilha: SpreadsheetML com várias
// abas; PDF: relatório HTML impresso pelo próprio navegador).

function exportFilteredCSV() {
  const { records } = state.dataset;
  const filtered = applyFilters(records, state.filters);
  const csv = recordsToCSV(filtered);
  downloadCSV(`cartao-mestre_${exportTimestamp()}.csv`, csv);
}

function exportSpreadsheet() {
  const { records, duplicatesRemoved } = state.dataset;
  const filtered = applyFilters(records, state.filters);
  const xml = buildDashboardWorkbookXML({ records: filtered, filters: state.filters, duplicatesRemoved });
  downloadWorkbook(`cartao-mestre_${exportTimestamp()}.xls`, xml);
}

function exportPDF() {
  const { records, duplicatesRemoved } = state.dataset;
  const filtered = applyFilters(records, state.filters);
  const html = buildPrintReportHTML({ records: filtered, filters: state.filters, duplicatesRemoved });
  openPrintReport(html);
}

function wireFilters() {
  state.filterOptions = {
    setor: distinctSorted(state.dataset.records, 'setor'),
    motivo: distinctSorted(state.dataset.records, 'motivo'),
    aprovador: distinctSorted(state.dataset.records, 'aprovador'),
  };
}

function playEntranceAnimation() {
  if (REDUCED_MOTION) return;
  const cards = document.querySelectorAll('.cm-card');
  cards.forEach((c, i) => {
    c.style.opacity = '0';
    c.style.transform = 'translateY(14px) scale(0.98)';
    c.style.filter = 'blur(6px)';
    c.style.transition = 'opacity 550ms ease, transform 550ms cubic-bezier(0.16,1,0.3,1), filter 550ms ease';
    setTimeout(() => {
      c.style.opacity = '1';
      c.style.transform = 'translateY(0) scale(1)';
      c.style.filter = 'blur(0px)';
    }, 60 * i);
  });
}

async function boot() {
  const e = els();
  try {
    state.dataset = await loadAll();
  } catch (err) {
    e.errorBanner.textContent = err.message || String(err);
    e.errorBanner.classList.remove('hidden');
    return;
  }

  // Chamada rápida (mesma origem, sem round-trip visível) — só pra já
  // renderizar o menu de conta com o nome certo no primeiro paint. Se
  // falhar (dev local sem o serviço de auth na frente), fetchUsername
  // engole o erro e devolve null — o dashboard sobe normalmente, só o
  // rótulo do menu cai pro genérico "Conta".
  state.username = await fetchUsername();

  wireFilters();
  renderAll();
  playEntranceAnimation();

  e.openPaletteBtn.addEventListener('click', openPalette);
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      openPalette();
      return;
    }
    if (ev.key === 'Escape' && state.openDropdown) closeOpenDropdown();
  });
  // clique fora de qualquer dropdown de filtro fecha o que estiver aberto
  // (os botões/opções do próprio dropdown usam stopPropagation, então só
  // chega aqui um clique genuinamente "de fora").
  document.addEventListener('click', closeOpenDropdown);

  // O gráfico "Liberações por dia" (e o do modal de tendência) usa o tamanho real
  // do container em px pra montar o SVG (ver renderLineChart) — precisa redesenhar
  // quando a janela redimensiona, senão fica com o tamanho do render anterior.
  // Debounce simples: só redesenha depois que o usuário para de arrastar a janela.
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderDiaCard();
      if (state.trendModalOpen) renderTrendModalRoot();
    }, 150);
  });
}

document.addEventListener('DOMContentLoaded', boot);
