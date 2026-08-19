/**
 * Renderização em DOM puro (sem framework), com classes Tailwind —
 * o mesmo mecanismo de estilo usado pelo template em design-system/
 * (resource_*.js compila as classes em tempo de execução, inclusive
 * para elementos inseridos depois do carregamento inicial).
 *
 * Toda seção é clicável (filtra o dashboard inteiro) e animada
 * (números contam, barras crescem, células do heatmap aparecem em
 * cascata). Animações respeitam prefers-reduced-motion.
 */

const fmtInt = (n) => n.toLocaleString('pt-BR');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, className, children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (children == null) return node;
  if (!Array.isArray(children)) children = [children];
  for (const c of children) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/** Ícone SVG inline (traço, sem preenchimento — mesmo estilo Lucide usado nos
 * outros ícones do projeto, ex.: os campos de usuário/senha do login). `paths`
 * é o miolo do `<svg>` (um ou mais `<path>`/`<circle>`/etc.), sempre uma
 * constante fixa no código-fonte, nunca dado dinâmico — por isso o innerHTML
 * aqui é seguro. Usado no lugar de emoji nos menus que precisam de um visual
 * mais discreto/profissional (ex.: menu de conta). */
function iconEl(paths, size = 15) {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return wrap.firstChild;
}

function cardHeader(title, subtitle) {
  const wrap = el('div', 'mb-5');
  wrap.appendChild(el('h3', 'text-lg font-semibold text-white', title));
  if (subtitle) wrap.appendChild(el('p', 'text-sm text-white/50 mt-1', subtitle));
  return wrap;
}

// ------------------------------------------------------- animação: números

const _kpiPrev = {};
function animateValue(target, key, toNumber, formatter) {
  const from = _kpiPrev[key] ?? 0;
  _kpiPrev[key] = toNumber;
  if (REDUCED_MOTION || from === toNumber) {
    target.textContent = formatter(toNumber);
    return;
  }
  const duration = 650;
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    target.textContent = formatter(Math.round(from + (toNumber - from) * eased));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// --------------------------------------------------------- animação: barras

/** Cria a barra com largura 0 e agenda o crescimento até targetPct (0-100). */
function growableBar(className, targetPct) {
  const bar = el('div', className);
  bar.style.width = '0%';
  bar.style.transition = REDUCED_MOTION ? 'none' : 'width 700ms cubic-bezier(0.16,1,0.3,1)';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.width = `${Math.max(4, targetPct)}%`;
  }));
  return bar;
}

/** Botão "Mostrar mais N / Mostrar menos" pros cards de lista que podem
 * crescer bastante (motivos, gestores fora da lista, colaboradores...).
 * Devolve `null` quando a lista já cabe inteira dentro do `limit` — nesse
 * caso o chamador simplesmente não anexa nada. */
function expandToggleButton(totalCount, limit, expanded, onToggle) {
  if (totalCount <= limit) return null;
  const label = expanded ? 'Mostrar menos' : `Mostrar mais ${totalCount - limit}`;
  const btn = el('button', 'w-full text-center text-xs font-medium text-white/50 hover:text-white/80 mt-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors duration-150', label);
  btn.type = 'button';
  btn.addEventListener('click', onToggle);
  return btn;
}

function clickableRow(extraClass) {
  const btn = el('button', `w-full text-left ${extraClass || ''}`);
  btn.type = 'button';
  return btn;
}

// ---------------------------------------------------------------- KPIs

const KPI_SPECS = [
  { key: 'total', color: 'bg-cyan-500', title: 'Liberações no período' },
  { key: 'trend', color: 'bg-blue-500', title: 'Tendência mensal' },
  // Título "Principal motivo" (em vez de "Horário Negado" solto): o valor abaixo já é
  // "Horário Negado — X%", então o título deixa claro que X% é a PARTICIPAÇÃO desse motivo
  // no total de liberações, não uma taxa de falha/erro do sistema.
  { key: 'negado', color: 'bg-amber-500', title: 'Principal motivo', filterField: 'motivo', filterValue: 'HORÁRIO NEGADO' },
  { key: 'colaboradores', color: 'bg-emerald-500', title: 'Colaboradores únicos' },
  { key: 'irregular', color: 'bg-red-500', title: 'Gestor irregular', filterField: 'onlyUnauthorized', filterValue: true },
  { key: 'orfa', color: 'bg-pink-500', title: 'Matrícula órfã', filterField: 'onlyOrfaos', filterValue: true },
];

/** Paleta semântica por KPI: card vira vidro translúcido, a cor vira glow + ponto + número. */
const KPI_ACCENT = {
  'bg-cyan-500': { dot: 'bg-cyan-400', text: 'text-cyan-300', ring: 'ring-cyan-400/60', glow: 'shadow-[0_0_0_1px_rgba(34,211,238,0.2),0_10px_34px_-12px_rgba(34,211,238,0.45)]' },
  'bg-blue-500': { dot: 'bg-blue-400', text: 'text-blue-300', ring: 'ring-blue-400/60', glow: 'shadow-[0_0_0_1px_rgba(96,165,250,0.2),0_10px_34px_-12px_rgba(96,165,250,0.45)]' },
  'bg-amber-500': { dot: 'bg-amber-400', text: 'text-amber-300', ring: 'ring-amber-400/60', glow: 'shadow-[0_0_0_1px_rgba(251,191,36,0.2),0_10px_34px_-12px_rgba(251,191,36,0.45)]' },
  'bg-emerald-500': { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'ring-emerald-400/60', glow: 'shadow-[0_0_0_1px_rgba(52,211,153,0.2),0_10px_34px_-12px_rgba(52,211,153,0.45)]' },
  'bg-red-500': { dot: 'bg-red-400', text: 'text-red-300', ring: 'ring-red-400/60', glow: 'shadow-[0_0_0_1px_rgba(248,113,113,0.2),0_10px_34px_-12px_rgba(248,113,113,0.45)]' },
  'bg-pink-500': { dot: 'bg-pink-400', text: 'text-pink-300', ring: 'ring-pink-400/60', glow: 'shadow-[0_0_0_1px_rgba(244,114,182,0.2),0_10px_34px_-12px_rgba(244,114,182,0.45)]' },
};

function sparkline(values) {
  const max = Math.max(...values, 1);
  const wrap = el('div', 'flex items-end gap-1.5 h-14 mt-2');
  for (const v of values) {
    const h = Math.max(6, Math.round((v / max) * 56));
    const bar = el('div', 'w-4 bg-blue-400 rounded-sm shadow-[0_0_10px_rgba(96,165,250,0.55)]');
    bar.style.height = '0px';
    bar.style.transition = REDUCED_MOTION ? 'none' : 'height 600ms cubic-bezier(0.16,1,0.3,1)';
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.height = `${h}px`; }));
    wrap.appendChild(bar);
  }
  return wrap;
}

function kpiShell(spec, isActive, onClick, interactive) {
  const accent = KPI_ACCENT[spec.color];
  const base = `cm-glass rounded-3xl p-5 flex flex-col justify-between min-h-[140px] transition-all duration-200 ${accent.glow} ${
    isActive ? `ring-2 ${accent.ring} scale-[1.02]` : ''
  } ${interactive ? 'cursor-pointer hover:-translate-y-0.5 hover:brightness-125' : ''}`;
  const c = interactive ? clickableRow(base) : el('div', base);
  if (interactive) c.addEventListener('click', onClick);
  return c;
}

/** `showOrfaosCard` (default false): o KPI "Matrícula órfã" só entra na grade
 * quando o usuário liga esse toggle (popover "Mais opções") — a matrícula
 * órfã continua contando no total sempre (ver applyFilters em aggregate.js),
 * isso só decide se o CARD aparece. */
function renderKPIs(container, kpis, trend, filters, onKpiClick, showOrfaosCard) {
  container.innerHTML = '';

  for (const spec of KPI_SPECS) {
    if (spec.key === 'orfa' && !showOrfaosCard) continue;
    const isActive = spec.filterField ? filters[spec.filterField] === spec.filterValue : false;
    const accent = KPI_ACCENT[spec.color];

    // "Tendência mensal" e "Colaboradores únicos" não mapeiam pra nenhum
    // filtro — mas ficavam com a mesma cara "clicável" dos vizinhos, o que
    // é enganoso. Em vez de só deixá-los inertes, cada um ganha uma ação
    // própria: tendência abre um modal com gráficos maiores e interativos,
    // colaboradores pula pra lista detalhada lá embaixo.
    let interactive, handleClick;
    if (spec.key === 'trend') {
      interactive = true;
      handleClick = () => onKpiClick({ key: 'trend', action: 'openTrend' });
    } else if (spec.key === 'colaboradores') {
      interactive = true;
      handleClick = () => onKpiClick({ key: 'colaboradores', action: 'scrollColaboradores' });
    } else {
      interactive = !!spec.filterField;
      handleClick = () => onKpiClick(spec);
    }

    const c = kpiShell(spec, isActive, handleClick, interactive);
    const titleRow = el('div', 'flex items-center gap-2');
    titleRow.appendChild(el('span', `w-1.5 h-1.5 rounded-full shrink-0 ${accent.dot}`));
    titleRow.appendChild(el('p', 'text-sm font-medium text-white/90', spec.title));
    c.appendChild(titleRow);

    if (spec.key === 'trend') {
      const trendValues = trend.map((t) => t.count);
      c.appendChild(sparkline(trendValues));
      const label = `${trend[0]?.mes.slice(0, 3).toLowerCase()} ${fmtInt(trend[0]?.count || 0)} → ${trend[trend.length - 1]?.mes.slice(0, 3).toLowerCase()} ${fmtInt(trend[trend.length - 1]?.count || 0)}`;
      c.appendChild(el('p', 'text-sm text-white/80 mt-2', label));

      // Variação mês a mês (MoM) — só faz sentido olhando o período todo,
      // não quando um único mês já está selecionado no filtro.
      if (!filters.mes) {
        const mom = monthOverMonth(trend);
        if (mom) {
          const pillColor = mom.pct == null ? 'bg-white/10 text-white/70'
            : mom.pct > 0 ? 'bg-red-500/15 text-red-300'
            : mom.pct < 0 ? 'bg-emerald-500/15 text-emerald-300'
            : 'bg-white/10 text-white/70';
          const arrow = mom.pct == null ? '' : mom.pct > 0 ? '▲ ' : mom.pct < 0 ? '▼ ' : '';
          const text = mom.pct == null
            ? `novo · ${fmtInt(mom.count)} liberações`
            : `${arrow}${mom.pct > 0 ? '+' : ''}${mom.pct}% vs ${mom.mesAnterior.slice(0, 3).toLowerCase()}`;
          c.appendChild(el('span', `inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full ${pillColor}`, text));
        }
      }
      c.appendChild(el('p', 'text-[11px] text-white/35 mt-2', 'Clique para ver os gráficos'));
    } else {
      // "Horário Negado — X%" (spec.key === 'negado') usa uma fonte menor: é texto + número
      // no mesmo valor, não cabe no mesmo tamanho dos KPIs que são só um número.
      const numberEl = el('p', `${spec.key === 'negado' ? 'text-xl' : 'text-3xl'} font-bold ${accent.text} mt-2`, '0');
      c.appendChild(numberEl);
      let toNumber, formatter, subtitle;
      if (spec.key === 'total') {
        toNumber = kpis.total; formatter = fmtInt;
        subtitle = filters.mes ? `somente ${filters.mes}` : `${MESES_ORDEM.length} meses no período`;
      } else if (spec.key === 'negado') {
        // O % aqui é PARTICIPAÇÃO no total de liberações, não uma taxa de falha —
        // "Horário Negado — X%" + "N de M liberações" deixam essa leitura explícita.
        toNumber = kpis.negadoPct; formatter = (v) => `Horário Negado — ${v}%`; subtitle = `${fmtInt(kpis.negado)} de ${fmtInt(kpis.total)} liberações`;
      } else if (spec.key === 'colaboradores') {
        toNumber = kpis.colaboradoresUnicos; formatter = fmtInt; subtitle = 'matrículas distintas · clique pra ver a lista';
      } else if (spec.key === 'irregular') {
        // Número puro (sem sufixo) no valor grande — "liberações" não cabia numa
        // linha em text-3xl e estourava a largura do card; a unidade vai na legenda.
        toNumber = kpis.naoAutorizadoEventos; formatter = fmtInt; subtitle = `liberações · ${kpis.naoAutorizadoPessoas} pessoa(s) fora da lista`;
      } else if (spec.key === 'orfa') {
        toNumber = kpis.orfaosPct; formatter = (v) => `${v}%`; subtitle = `${fmtInt(kpis.orfaos)} de ${fmtInt(kpis.total)} liberações`;
      }
      animateValue(numberEl, spec.key, toNumber, formatter);
      c.appendChild(el('p', 'text-sm text-white/80 mt-2', subtitle));
    }
    container.appendChild(c);
  }
}

// ------------------------------------------------------------ Heatmap

function heatColor(count, max) {
  if (count === 0) return '#1a1a1d';
  const t = count / max;
  const ramp = ['#1e2b38', '#274a68', '#2f7bb8', '#4a9eed'];
  const idx = Math.min(ramp.length - 1, Math.floor(t * ramp.length));
  return ramp[idx];
}

function renderHeatmap(container, { matrix, max }, filters, onCellClick, onDayClick) {
  container.innerHTML = '';
  container.appendChild(cardHeader('Padrão semanal × horário', 'Clique num dia pra filtrar só por ele, ou numa célula pra dia + faixa de horário'));

  // Sem overflow-x-auto: o card ganhou espaço de sobra (grid-cols-[3fr_2fr]
  // no index.html) pra caber as 4 faixas sem precisar de scroll.
  const table = el('div', 'w-full');

  const header = el('div', 'grid grid-cols-[90px_repeat(6,1fr)] gap-1.5 mb-2.5');
  header.appendChild(el('div', ''));
  for (const b of HORA_BANDS) {
    const cell = el('div', 'text-center leading-tight');
    cell.appendChild(el('p', 'text-[11px] text-white/60 font-medium whitespace-nowrap', b.short));
    cell.appendChild(el('p', 'text-[10px] text-white/35 whitespace-nowrap', b.range));
    header.appendChild(cell);
  }
  table.appendChild(header);

  let delay = 0;
  for (const row of matrix) {
    const rowEl = el('div', 'grid grid-cols-[90px_repeat(6,1fr)] gap-1.5 mb-1.5');
    const isDayActive = filters.weekday === row.day && !filters.band;
    const dayBtn = clickableRow(
      `flex items-center rounded-md px-1.5 -mx-1.5 text-sm transition-colors duration-150 hover:bg-white/5 ${
        isDayActive ? 'text-white font-semibold bg-white/10' : 'text-white/80'
      }`
    );
    dayBtn.textContent = row.day;
    dayBtn.title = `Filtrar só por ${row.day}`;
    dayBtn.addEventListener('click', () => onDayClick(row.day));
    rowEl.appendChild(dayBtn);
    for (const b of row.bands) {
      const isActive = filters.weekday === row.day && filters.band === b.key;
      const cell = clickableRow(
        `h-7 rounded-md flex items-center justify-center text-[11px] text-white/70 transition-all duration-200 hover:ring-2 hover:ring-white/60 cursor-pointer ${
          isActive ? 'ring-2 ring-white scale-[1.06]' : ''
        }`
      );
      cell.style.backgroundColor = heatColor(b.count, max);
      cell.title = `${row.day} · ${b.label}: ${b.count} liberações`;
      if (b.count > 0) cell.textContent = fmtInt(b.count);
      cell.addEventListener('click', () => onCellClick(row.day, b.key));

      if (!REDUCED_MOTION) {
        cell.style.opacity = '0';
        cell.style.transform = 'scale(0.85)';
        cell.style.transition = 'opacity 350ms ease, transform 350ms ease, background-color 400ms ease';
        const d = delay;
        setTimeout(() => { cell.style.opacity = '1'; cell.style.transform = 'scale(1)'; }, d);
        delay += 9;
      }
      rowEl.appendChild(cell);
    }
    table.appendChild(rowEl);
  }
  container.appendChild(table);
}

// ------------------------------------------------------------ Dia a dia

/** Card "Liberações por dia" — a granularidade que faltava entre "mês" (KPI +
 * modal de tendência) e "dia da semana" (heatmap): um pico num dia específico
 * do calendário. Mesmo gráfico de linha do modal de tendência, reaproveitado
 * com uma cor própria pra não confundir com o de mês. */
function renderDailyCard(container, dailyData, filters, onSelectDay) {
  container.innerHTML = '';
  container.appendChild(cardHeader('Liberações por dia', 'Passe o mouse pra ver a data exata, clique num ponto pra filtrar o dashboard só por aquele dia'));

  if (dailyData.length === 0) {
    container.appendChild(el('p', 'text-sm text-white/40', 'Sem liberações para os filtros selecionados.'));
    return;
  }

  const total = dailyData.reduce((s, d) => s + d.count, 0);
  const media = Math.round((total / dailyData.length) * 10) / 10;
  const pico = dailyData.reduce((m, d) => (d.count > m.count ? d : m), dailyData[0]);
  container.appendChild(el('p', 'text-sm text-white/50 mb-3', `${fmtInt(dailyData.length)} dia(s) com uso · média de ${media} liberações/dia · pico em ${pico.data} (${fmtInt(pico.count)})`));

  // Altura fixa em CSS, mas o SVG interno usa o tamanho real do container
  // (ver renderLineChart) — é isso que evita o gráfico esticado/distorcido.
  const chartWrap = el('div', 'w-full');
  chartWrap.style.height = '220px';
  container.appendChild(chartWrap);

  // Um rótulo a cada N pontos — com o período inteiro (~90-120 dias) o eixo
  // viraria uma faixa preta de texto se cada dia ganhasse seu próprio rótulo.
  const labelEvery = Math.max(1, Math.ceil(dailyData.length / 12));
  const chartData = dailyData.map((d) => ({
    key: d.data,
    label: d.dateObj ? `${String(d.dateObj.getDate()).padStart(2, '0')}/${String(d.dateObj.getMonth() + 1).padStart(2, '0')}` : d.data,
    value: d.count,
    // monthKey/monthLabel: usados só pra desenhar a linha de separação entre
    // meses (renderLineChart) — derivados da data real do ponto, nunca de
    // uma data fixa, então continuam corretos com novos meses/lacunas.
    monthKey: d.dateObj ? `${d.dateObj.getFullYear()}-${d.dateObj.getMonth()}` : null,
    monthLabel: d.dateObj ? MESES_ABREV_ANO[d.dateObj.getMonth()] : null,
  }));
  renderLineChart(chartWrap, chartData, { color: '#34d399', onSelect: onSelectDay, activeKey: filters.data, labelEvery });
}

// ------------------------------------------------------------- Motivo

const MOTIVO_LIMIT = 5;

function renderMotivo(container, breakdown, filters, expanded, onMotivoClick, onToggleExpand) {
  container.innerHTML = '';
  container.appendChild(cardHeader('Distribuição por motivo', 'Clique numa barra (ou no destaque) para filtrar por esse motivo'));

  if (breakdown.negadoCount > 0) {
    const isActive = filters.motivo === 'HORÁRIO NEGADO';
    const highlight = clickableRow(
      `rounded-2xl bg-amber-500 p-4 mb-4 shadow-[0_10px_34px_-12px_rgba(251,191,36,0.55)] transition-all duration-200 cursor-pointer hover:brightness-105 hover:-translate-y-0.5 ${
        isActive ? 'ring-2 ring-white' : ''
      }`
    );
    highlight.appendChild(el('p', 'text-base font-semibold text-zinc-900', `Horário Negado — ${breakdown.negadoPct}%`));
    highlight.appendChild(el('p', 'text-sm text-zinc-900/80', `${fmtInt(breakdown.negadoCount)} de ${fmtInt(breakdown.total)} liberações`));
    highlight.addEventListener('click', () => onMotivoClick('HORÁRIO NEGADO'));
    container.appendChild(highlight);
  }

  const otherCount = breakdown.outros.length;
  container.appendChild(el('p', 'text-sm text-white/50 mb-3', `Outros ${otherCount} motivo(s) somam ${fmtInt(breakdown.outrosTotal)} liberações`));

  const maxOther = Math.max(1, ...breakdown.outros.map(([, c]) => c));
  const visibleOutros = expanded ? breakdown.outros : breakdown.outros.slice(0, MOTIVO_LIMIT);
  const list = el('div', 'space-y-2.5');
  for (const [motivo, count] of visibleOutros) {
    const isActive = filters.motivo === motivo;
    const row = clickableRow(`flex items-center gap-3 rounded-lg px-1.5 py-1 -mx-1.5 transition-colors duration-150 hover:bg-white/5 ${isActive ? 'bg-white/10' : ''}`);
    row.addEventListener('click', () => onMotivoClick(motivo));
    row.appendChild(el('div', `w-40 shrink-0 text-sm truncate ${isActive ? 'text-white font-semibold' : 'text-white/80'}`, motivo));
    const barWrap = el('div', 'flex-1 h-4 bg-white/5 rounded-full overflow-hidden');
    barWrap.appendChild(growableBar('h-full bg-blue-500 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.15)]', (count / maxOther) * 100));
    row.appendChild(barWrap);
    row.appendChild(el('div', 'w-10 text-right text-sm text-white/60', fmtInt(count)));
    list.appendChild(row);
  }
  container.appendChild(list);
  const toggleBtn = expandToggleButton(breakdown.outros.length, MOTIVO_LIMIT, expanded, onToggleExpand);
  if (toggleBtn) container.appendChild(toggleBtn);
}

// ---------------------------------------------------- Ranking genérico

// Setores e (principalmente) gestores podem passar de 20-80 itens distintos
// — "mostrar mais" nesse volume faria o card ficar gigante (e o card
// continuaria crescendo a cada clique). Em vez disso a lista inteira já
// está no DOM, só que dentro de uma janela de altura fixa com scroll
// (mesma scrollbar fina do resto do projeto, definida globalmente em
// index.html) — o card não estica, mas nada fica inacessível.
const RANKING_SCROLL_MAX_H = 'max-h-[336px]';

/** `total` (opcional) é o total de liberações no filtro atual — quando informado, cada
 * item ganha o % que representa desse total ao lado da contagem absoluta (que continua
 * sendo o dado principal, exibido primeiro e maior). */
function renderRankingBars(container, title, subtitle, items, filterField, colorClass, filters, onItemClick, total) {
  container.innerHTML = '';
  container.appendChild(cardHeader(title, subtitle));

  if (items.length === 0) {
    container.appendChild(el('p', 'text-sm text-white/40', 'Sem liberações para os filtros selecionados.'));
    return;
  }

  const labelKey = filterField;
  const max = Math.max(...items.map((i) => i.count));
  const needsScroll = items.length > 8;
  const list = el('div', `space-y-3 ${needsScroll ? `${RANKING_SCROLL_MAX_H} overflow-y-auto pr-1 -mr-1` : ''}`);
  for (const item of items) {
    const value = item[labelKey];
    const isActive = filters[filterField] === value;
    const row = clickableRow(`flex items-center gap-3 rounded-lg px-1.5 py-1 -mx-1.5 transition-colors duration-150 hover:bg-white/5 ${isActive ? 'bg-white/10' : ''}`);
    row.addEventListener('click', () => onItemClick(value));
    row.appendChild(el('div', `w-44 shrink-0 text-sm truncate ${isActive ? 'text-white font-semibold' : 'text-white/80'}`, value));
    const barWrap = el('div', 'flex-1 h-5 bg-white/5 rounded-full overflow-hidden');
    barWrap.appendChild(growableBar(`h-full ${colorClass} rounded-full shadow-[0_0_10px_rgba(255,255,255,0.15)]`, (item.count / max) * 100));
    row.appendChild(barWrap);
    const countLabel = total ? `${fmtInt(item.count)} · ${Math.round((item.count / total) * 100)}%` : fmtInt(item.count);
    row.appendChild(el('div', 'w-20 shrink-0 text-right text-sm text-white/60', countLabel));
    list.appendChild(row);
  }
  container.appendChild(list);
}

// -------------------------------------------------------- Colaboradores

// Este card é "Colaboradores" — só gente cadastrada em COLABORADORES.csv.
// Matrículas órfãs (promotores/terceiros sem cadastro) já têm seu próprio
// KPI/filtro/anomalias; misturadas aqui só confundiam quem é de fato
// colaborador. Por isso renderColaboradoresCard (main.js) já filtra
// naoCadastrado antes de chegar aqui — `items` só tem gente cadastrada.
/** `total` (opcional) é o total de liberações de colaboradores cadastrados no filtro
 * atual — usado só pro % de participação de cada linha (contexto adicional; a
 * contagem absoluta continua sendo o dado principal, exibido maior/primeiro). */
function renderColaboradores(container, items, filters, query, onColaboradorClick, onDetailClick, onQueryChange, total) {
  const active = document.activeElement;
  const hadFocus = active && active.dataset && active.dataset.colabSearch === '1';
  const caret = hadFocus ? active.selectionStart : null;

  container.innerHTML = '';
  const isSearching = query.trim().length > 0;
  container.appendChild(
    cardHeader(
      'Colaboradores com mais liberações',
      isSearching
        ? `${items.length} resultado(s) para "${query.trim()}"`
        : 'Clique num nome para filtrar, ou em "Detalhes" pra ver a ficha completa'
    )
  );

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Buscar por nome ou matrícula…';
  input.value = query;
  input.dataset.colabSearch = '1';
  input.className = 'w-full mb-4 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/60';
  input.addEventListener('input', () => onQueryChange(input.value));
  container.appendChild(input);

  if (items.length === 0) {
    container.appendChild(el('p', 'text-sm text-white/40', isSearching ? 'Nenhum colaborador encontrado.' : 'Sem liberações para os filtros selecionados.'));
    if (hadFocus) { input.focus(); input.setSelectionRange(caret, caret); }
    return;
  }

  // Mostra todos (sem cap) — janela de altura fixa com scroll vertical em
  // vez de "mostrar mais" (mesmo raciocínio do ranking de setor/gestor).
  // overflow-x-hidden garante que nomes longos truncam (a classe `truncate`
  // do span abaixo) em vez de abrir uma barra de rolagem horizontal.
  const needsScroll = items.length > 8;
  const list = el('div', `space-y-2 ${needsScroll ? 'max-h-[320px] overflow-y-auto overflow-x-hidden pr-1 -mr-1' : ''}`);
  for (const item of items) {
    const isActive = item.matricula ? filters.matricula === item.matricula : filters.nomeSemMatricula === item.nome;
    const row = el('div', `flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 -mx-2 transition-colors duration-150 hover:bg-white/5 ${isActive ? 'bg-white/10' : ''}`);

    const mainBtn = clickableRow('flex-1 min-w-0 text-left');
    mainBtn.addEventListener('click', () => onColaboradorClick(item));
    mainBtn.appendChild(el('span', `block text-sm truncate ${isActive ? 'text-white font-semibold' : 'text-white/80'}`, item.nome + (item.matricula ? ` · mat. ${item.matricula}` : '')));
    // Dias distintos com liberação — contexto pra diferenciar uso concentrado
    // (poucos dias, muitas liberações) de uso espalhado ao longo do período.
    if (item.diasAtivos > 0) {
      mainBtn.appendChild(el('span', 'block text-xs text-white/40 truncate', `${item.diasAtivos} dia(s) ativo(s)${total ? ` · ${Math.round((item.count / total) * 100)}% do total` : ''}`));
    }
    row.appendChild(mainBtn);

    const right = el('div', 'flex items-center gap-2 shrink-0');
    right.appendChild(el('span', 'text-sm font-semibold px-2.5 py-1 rounded-lg bg-emerald-500 text-white', fmtInt(item.count)));
    const detailBtn = el('button', 'text-xs px-2 py-1 rounded-lg border border-white/15 text-white/50 hover:text-white hover:border-white/40 transition-colors duration-150', 'Detalhes');
    detailBtn.type = 'button';
    detailBtn.addEventListener('click', (e) => { e.stopPropagation(); onDetailClick(item); });
    right.appendChild(detailBtn);
    row.appendChild(right);

    list.appendChild(row);
  }
  container.appendChild(list);

  if (hadFocus) { input.focus(); input.setSelectionRange(caret, caret); }
}

// --------------------------------------------------- Modal: ficha do colaborador

function renderColaboradorModal(root, item, events, onClose, onOpenDetail) {
  root.innerHTML = '';
  const overlay = el('div', 'fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4');
  overlay.addEventListener('click', onClose);

  const box = el('div', 'cm-glass-modal w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl p-6 shadow-2xl');
  if (!REDUCED_MOTION) {
    box.style.animation = 'cm-chip-in 260ms cubic-bezier(0.16,1,0.3,1) both';
  }
  box.addEventListener('click', (e) => e.stopPropagation());

  const header = el('div', 'flex items-start justify-between gap-3 mb-5');
  const titleWrap = el('div', 'min-w-0');
  const nameRow = el('div', 'flex items-center gap-2 flex-wrap');
  nameRow.appendChild(el('h3', 'text-lg font-semibold text-white', item.nome));
  if (item.naoCadastrado) nameRow.appendChild(el('span', 'text-[11px] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300', 'órfã — sem cadastro'));
  titleWrap.appendChild(nameRow);
  titleWrap.appendChild(el('p', 'text-sm text-white/50 mt-1', item.matricula ? `Matrícula ${item.matricula}` : 'Sem matrícula registrada'));
  header.appendChild(titleWrap);

  const closeBtn = el('button', 'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-150', '×');
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', onClose);
  header.appendChild(closeBtn);
  box.appendChild(header);

  // estatísticas rápidas
  const negadoCount = events.filter((e) => e.motivo === 'HORÁRIO NEGADO').length;
  const meses = new Set(events.map((e) => e.mes)).size;
  const stats = el('div', 'grid grid-cols-3 gap-2.5 mb-5');
  const statBox = (label, value) => {
    const b = el('div', 'rounded-xl bg-white/5 border border-white/10 px-3 py-2.5');
    b.appendChild(el('p', 'text-lg font-bold text-white', value));
    b.appendChild(el('p', 'text-xs text-white/50 mt-0.5', label));
    return b;
  };
  stats.appendChild(statBox('liberações no total', fmtInt(events.length)));
  stats.appendChild(statBox('horário negado', fmtInt(negadoCount)));
  stats.appendChild(statBox('mês(es) com uso', fmtInt(meses)));
  box.appendChild(stats);

  // distribuição de motivos
  if (events.length > 0) {
    box.appendChild(el('h4', 'text-sm font-semibold text-white/80 mb-2', 'Motivos'));
    const motivos = countBy(events, 'motivo');
    const maxM = Math.max(...motivos.map(([, c]) => c));
    const motivoList = el('div', 'space-y-1.5 mb-5');
    for (const [motivo, count] of motivos) {
      const row = el('div', 'flex items-center gap-2');
      row.appendChild(el('div', 'w-36 shrink-0 text-xs text-white/70 truncate', motivo));
      const barWrap = el('div', 'flex-1 h-3 bg-white/5 rounded-full overflow-hidden');
      const bar = el('div', 'h-full bg-cyan-500 rounded-full');
      bar.style.width = `${Math.max(4, (count / maxM) * 100)}%`;
      barWrap.appendChild(bar);
      row.appendChild(barWrap);
      row.appendChild(el('div', 'w-8 text-right text-xs text-white/50', fmtInt(count)));
      motivoList.appendChild(row);
    }
    box.appendChild(motivoList);
  }

  // linha do tempo
  box.appendChild(el('h4', 'text-sm font-semibold text-white/80 mb-2', 'Linha do tempo'));
  if (events.length === 0) {
    box.appendChild(el('p', 'text-sm text-white/40', 'Nenhuma liberação encontrada.'));
  } else {
    const timeline = el('div', 'space-y-1.5');
    for (const e of events) {
      const row = clickableRow('flex items-center gap-3 text-xs rounded-lg px-2.5 py-2 bg-white/5 hover:bg-white/10 transition-colors duration-150');
      row.title = 'Ver detalhe desta liberação';
      if (onOpenDetail) row.addEventListener('click', () => onOpenDetail(e));
      row.appendChild(el('span', 'text-white/70 shrink-0 w-24', `${e.data}${e.hora ? ' ' + e.hora : ''}`));
      row.appendChild(el('span', 'text-white/50 flex-1 min-w-0 truncate', e.motivo));
      if (e.aprovadorNaoAutorizado) row.appendChild(el('span', 'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300', 'gestor irregular'));
      timeline.appendChild(row);
    }
    box.appendChild(timeline);
  }

  overlay.appendChild(box);
  root.appendChild(overlay);

  const onKeydown = (e) => { if (e.key === 'Escape') onClose(); };
  document.addEventListener('keydown', onKeydown, { once: true });
}

function closeColaboradorModal(root) {
  root.innerHTML = '';
}

// -------------------------------------------------- Modal: liberações relacionadas

/** Lista de liberações que batem com os filtros ativos — o passo "liberações
 * relacionadas" do drill-down (sinal → contexto/filtro → liberações relacionadas →
 * detalhe). Reaproveita os mesmos registros já filtrados pelo resto do dashboard;
 * não duplica o mecanismo de filtragem existente. */
function renderLiberacoesModal(root, records, filters, onOpenDetail, onClose) {
  root.innerHTML = '';
  const overlay = el('div', 'fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-start justify-center pt-[8vh] p-4 overflow-y-auto');
  overlay.addEventListener('click', onClose);

  const box = el('div', 'cm-glass-modal w-full max-w-2xl max-h-[80vh] flex flex-col rounded-3xl p-6 shadow-2xl');
  if (!REDUCED_MOTION) box.style.animation = 'cm-chip-in 220ms cubic-bezier(0.16,1,0.3,1) both';
  box.addEventListener('click', (e) => e.stopPropagation());

  const header = el('div', 'flex items-start justify-between gap-3 mb-3 shrink-0');
  const titleWrap = el('div', 'min-w-0');
  titleWrap.appendChild(el('h3', 'text-lg font-semibold text-white', `Liberações (${fmtInt(records.length)})`));
  titleWrap.appendChild(el('p', 'text-sm text-white/50 mt-1', 'Clique numa linha pra ver o detalhe'));
  header.appendChild(titleWrap);
  const closeBtn = el('button', 'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-150', '×');
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', onClose);
  header.appendChild(closeBtn);
  box.appendChild(header);

  const chips = describeFilters(filters);
  if (chips.length) {
    const chipsWrap = el('div', 'flex flex-wrap gap-1.5 mb-4 shrink-0');
    for (const c of chips) chipsWrap.appendChild(el('span', 'text-[11px] px-2 py-1 rounded-full bg-white/10 text-white/70', c.label));
    box.appendChild(chipsWrap);
  }

  const listWrap = el('div', 'flex-1 overflow-y-auto -mx-1 px-1');
  if (records.length === 0) {
    listWrap.appendChild(el('p', 'text-sm text-white/40 py-6 text-center', 'Nenhuma liberação encontrada para os filtros atuais.'));
  } else {
    const sorted = sortByRecency(records);
    const list = el('div', 'space-y-1.5');
    for (const r of sorted) {
      const row = clickableRow('w-full flex items-center gap-3 text-left text-xs rounded-lg px-2.5 py-2 bg-white/5 hover:bg-white/10 transition-colors duration-150');
      row.title = 'Ver detalhe desta liberação';
      row.addEventListener('click', () => onOpenDetail(r));
      row.appendChild(el('span', 'text-white/70 shrink-0 w-24', `${r.data}${r.hora ? ' ' + r.hora : ''}`));
      row.appendChild(el('span', 'text-white/90 flex-1 min-w-0 truncate', r.nomeDisplay));
      row.appendChild(el('span', 'text-white/50 shrink-0 hidden sm:block w-40 truncate', r.motivo));
      if (r.aprovadorNaoAutorizado) row.appendChild(el('span', 'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300', 'irregular'));
      if (r.naoCadastrado) row.appendChild(el('span', 'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300', 'órfã'));
      list.appendChild(row);
    }
    listWrap.appendChild(list);
  }
  box.appendChild(listWrap);

  overlay.appendChild(box);
  root.appendChild(overlay);

  const onKeydown = (e) => { if (e.key === 'Escape') onClose(); };
  document.addEventListener('keydown', onKeydown, { once: true });
}

function closeLiberacoesModal(root) {
  root.innerHTML = '';
}

// -------------------------------------------------------- Modal: detalhe da liberação

/** Detalhe de uma liberação individual — abre num root/z-index próprios, por cima
 * de qualquer lista/ficha já aberta atrás; fechar o detalhe preserva o que estava
 * por trás (lista filtrada, ficha do colaborador, ou o dashboard puro por baixo).
 * Não existe ID permanente nos dados de origem (CSV sem coluna de identificador),
 * então o "registro" em si (referência de objeto, já deduplicado em data.js) é o
 * que identifica a liberação — sem inventar um ID que os dados não sustentam.
 * Só mostra campos realmente presentes no dado de origem. */
function renderLiberacaoDetailModal(root, record, onClose) {
  root.innerHTML = '';
  const overlay = el('div', 'fixed inset-0 z-[60] bg-black/70 backdrop-blur-md flex items-center justify-center p-4');
  overlay.addEventListener('click', onClose);

  const box = el('div', 'cm-glass-modal w-full max-w-md rounded-3xl p-6 shadow-2xl');
  if (!REDUCED_MOTION) box.style.animation = 'cm-chip-in 220ms cubic-bezier(0.16,1,0.3,1) both';
  box.addEventListener('click', (e) => e.stopPropagation());

  const header = el('div', 'flex items-start justify-between gap-3 mb-4');
  header.appendChild(el('h3', 'text-lg font-semibold text-white', 'Detalhe da liberação'));
  const closeBtn = el('button', 'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-150', '×');
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', onClose);
  header.appendChild(closeBtn);
  box.appendChild(header);

  const fields = [
    ['Data', record.data || '—'],
    ['Horário', record.hora || 'Não informado'],
    ['Faixa horária', bandLabelFor(record.minutesOfDay) || 'Não informado'],
    ['Colaborador', record.nomeDisplay],
    ['Matrícula', record.matricula || (record.naoCadastrado ? 'Sem matrícula (órfã)' : '—')],
    ['Setor', record.setor],
    ['Gestor', record.aprovador],
    ['Motivo', record.motivo],
  ];
  const grid = el('div', 'space-y-2.5 mb-5');
  for (const [label, value] of fields) {
    const row = el('div', 'flex items-baseline justify-between gap-3');
    row.appendChild(el('span', 'text-xs text-white/40 shrink-0', label));
    row.appendChild(el('span', 'text-sm text-white/90 text-right truncate', value));
    grid.appendChild(row);
  }
  box.appendChild(grid);

  // Regra/heurística relacionada: as mesmas flags de qualidade calculadas em
  // data.js, em texto legível — nada de acusação, só o que o dado mostra.
  const flags = [];
  if (record.naoCadastrado) flags.push('Matrícula não encontrada em COLABORADORES.csv (órfã)');
  if (record.aprovadorNaoAutorizado) flags.push('Gestor fora de GESTORES.csv');
  if (record.suspiciousDate) flags.push('Data suspeita (fora do intervalo esperado)');
  if (record.horaAusente) flags.push('Horário não informado no CSV de origem');
  if (flags.length) {
    box.appendChild(el('h4', 'text-xs font-semibold uppercase tracking-wide text-white/40 mb-2', 'Sinais / heurísticas relacionadas'));
    const flagList = el('div', 'space-y-1.5');
    for (const f of flags) {
      flagList.appendChild(el('p', 'text-xs text-amber-200 bg-amber-500/10 border border-amber-400/20 rounded-lg px-2.5 py-1.5', f));
    }
    box.appendChild(flagList);
  }

  overlay.appendChild(box);
  root.appendChild(overlay);

  const onKeydown = (e) => { if (e.key === 'Escape') onClose(); };
  document.addEventListener('keydown', onKeydown, { once: true });
}

function closeLiberacaoDetailModal(root) {
  root.innerHTML = '';
}

// -------------------------------------------------------------- Alerta

// Grid de 2 colunas: 16 chips (8 linhas) ainda cabe no "tamanho padrão" de
// card do dashboard sem esticar mais que os vizinhos — só corta lista
// realmente longa.
const ALERTA_LIMIT = 16;

function renderAlerta(container, unauthorized, naoAutorizadoEventos, naoAutorizadoPessoas, filters, expanded, onChipClick, onToggleExpand) {
  container.className = 'cm-card cm-glass-danger rounded-3xl p-5 sm:p-6 transition-colors duration-300';
  container.innerHTML = '';
  const header = el('div', 'flex items-start gap-2.5 mb-5');
  const dot = el('span', 'mt-1.5 w-3 h-3 rounded-full bg-red-500 shrink-0 animate-pulse');
  const headerText = el('div');
  headerText.appendChild(el('h3', 'text-lg font-semibold text-red-300', 'Gestores fora da lista'));
  headerText.appendChild(el('p', 'text-sm text-red-200/70 mt-1', `${naoAutorizadoPessoas} gestores não autorizados totalizaram ${fmtInt(naoAutorizadoEventos)} liberações · clique para filtrar`));
  header.appendChild(dot);
  header.appendChild(headerText);
  container.appendChild(header);

  if (unauthorized.length === 0) {
    container.appendChild(el('p', 'text-sm text-red-200/50', 'Nenhum gestor fora da lista nos filtros selecionados.'));
    return;
  }

  const visible = expanded ? unauthorized : unauthorized.slice(0, ALERTA_LIMIT);
  const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-2.5');
  for (const { aprovador, count } of visible) {
    const isActive = filters.aprovador === aprovador;
    const chip = clickableRow(
      `rounded-xl bg-red-500/15 border px-3 py-2 text-sm text-red-200 transition-all duration-150 hover:bg-red-500/25 hover:-translate-y-0.5 ${
        isActive ? 'border-white ring-1 ring-white' : 'border-red-400/20'
      }`
    );
    chip.textContent = `${aprovador} · ${fmtInt(count)}`;
    chip.addEventListener('click', () => onChipClick(aprovador));
    grid.appendChild(chip);
  }
  container.appendChild(grid);
  const toggleBtn = expandToggleButton(unauthorized.length, ALERTA_LIMIT, expanded, onToggleExpand);
  if (toggleBtn) container.appendChild(toggleBtn);
}

// ------------------------------------------------------- Filtros ativos

/** `filteredCount`/`onVerLiberacoes` (opcionais): quando informados, mostra um botão
 * "Ver liberações (N)" na barra — é o passo "sinal → contexto/filtro → liberações
 * relacionadas" do drill-down: só aparece quando já existe pelo menos um filtro
 * (um "sinal") ativo, reaproveitando o mesmo estado de filtros de sempre. */
function renderActiveFilters(container, filters, onRemove, onClearAll, filteredCount, onVerLiberacoes) {
  container.innerHTML = '';
  const chips = describeFilters(filters);
  if (chips.length === 0) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');

  chips.forEach((chip, i) => {
    const btn = el('button', 'cm-chip-in group flex items-center gap-1.5 text-xs font-medium pl-3 pr-2 py-1.5 rounded-full bg-white/10 border border-white/10 hover:bg-white/20 text-white/90 transition-colors duration-150');
    btn.type = 'button';
    if (!REDUCED_MOTION) btn.style.animationDelay = `${i * 30}ms`;
    btn.appendChild(el('span', '', chip.label));
    btn.appendChild(el('span', 'text-white/50 group-hover:text-white', '×'));
    btn.addEventListener('click', () => onRemove(chip.key));
    container.appendChild(btn);
  });

  if (onVerLiberacoes) {
    const verBtn = el('button', 'text-xs font-medium px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 hover:bg-blue-500/30 transition-colors duration-150', `Ver liberações (${fmtInt(filteredCount)})`);
    verBtn.type = 'button';
    verBtn.addEventListener('click', onVerLiberacoes);
    container.appendChild(verBtn);
  }

  const clearAll = el('button', 'text-xs font-medium px-3 py-1.5 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors duration-150', 'Limpar filtros');
  clearAll.type = 'button';
  clearAll.addEventListener('click', onClearAll);
  container.appendChild(clearAll);
}

// -------------------------------------------------------------- Anomalias

function anomaliaRow(children, onClick) {
  const row = clickableRow('w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 -mx-1 bg-white/[0.03] border border-white/5 transition-colors duration-150 hover:bg-white/[0.07] hover:border-white/10');
  row.addEventListener('click', onClick);
  for (const c of children) row.appendChild(c);
  return row;
}

function renderAnomalias(container, anomalias, filters, collapsed, handlers) {
  container.className = 'cm-card cm-glass-warn rounded-3xl p-5 sm:p-6 transition-colors duration-300';
  container.innerHTML = '';

  const header = el('div', 'flex items-start justify-between gap-3');
  const headerLeft = el('div', 'flex items-start gap-2.5');
  const dot = el('span', `mt-1.5 w-3 h-3 rounded-full shrink-0 ${anomalias.total > 0 && !collapsed ? 'bg-amber-400 animate-pulse' : 'bg-white/20'}`);
  const headerText = el('div');
  headerText.appendChild(el('h3', 'text-lg font-semibold text-amber-200', 'Sinais de atenção'));
  headerText.appendChild(el('p', 'text-sm text-amber-100/60 mt-1',
    anomalias.total > 0
      ? `${anomalias.total} sinal(is) detectado(s) nos filtros atuais — heurísticas automáticas, não são acusação`
      : 'Nenhum sinal fora do padrão nos filtros atuais'
  ));
  headerLeft.appendChild(dot);
  headerLeft.appendChild(headerText);
  header.appendChild(headerLeft);

  const toggleBtn = el('button',
    'shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border border-amber-400/20 text-amber-200/70 hover:text-amber-100 hover:border-amber-400/40 transition-colors duration-150'
  );
  toggleBtn.type = 'button';
  const chevron = el('span', `inline-block transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`, '▾');
  toggleBtn.appendChild(el('span', '', collapsed ? 'Mostrar' : 'Ocultar'));
  toggleBtn.appendChild(chevron);
  toggleBtn.addEventListener('click', handlers.onToggleCollapse);
  header.appendChild(toggleBtn);

  container.appendChild(header);

  if (collapsed || anomalias.total === 0) return;

  // auto-fit em vez de grid-cols-3 fixo: quando alguma categoria não tem
  // sinal (ex.: nenhum aprovador fora do padrão), as colunas que existem
  // ocupam o espaço todo em vez de deixar uma coluna vazia.
  const groups = el('div', 'grid grid-cols-1 lg:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] gap-4 mt-5');

  // -- Uso frequente no mês
  if (anomalias.frequentes.length > 0) {
    const col = el('div');
    col.appendChild(el('h4', 'text-xs font-semibold uppercase tracking-wide text-amber-200/70 mb-2', 'Uso frequente no mês'));
    const list = el('div', 'space-y-1.5');
    for (const item of anomalias.frequentes) {
      const left = el('div', 'min-w-0');
      left.appendChild(el('p', 'text-sm text-white/90 truncate', item.nome + (item.matricula ? ` · mat. ${item.matricula}` : '')));
      left.appendChild(el('p', 'text-xs text-white/50 mt-0.5 truncate', `${item.mes} · ${fmtInt(item.count)} liberações · ${[...item.motivos].slice(0, 2).join(', ')}${item.motivos.size > 2 ? '…' : ''}`));
      const right = el('span', 'shrink-0 text-sm font-semibold px-2 py-1 rounded-lg bg-amber-500/20 text-amber-200', `${item.diasDistintos} dias`);
      list.appendChild(anomaliaRow([left, right], () => handlers.onFrequente(item)));
    }
    col.appendChild(list);
    groups.appendChild(col);
  }

  // -- Picos de setor
  if (anomalias.picosSetor.length > 0) {
    const col = el('div');
    col.appendChild(el('h4', 'text-xs font-semibold uppercase tracking-wide text-amber-200/70 mb-2', 'Picos de setor'));
    const list = el('div', 'space-y-1.5');
    for (const item of anomalias.picosSetor) {
      const left = el('div', 'min-w-0');
      left.appendChild(el('p', 'text-sm text-white/90 truncate', `${item.setor} — ${item.mes}`));
      left.appendChild(el('p', 'text-xs text-white/50 mt-0.5', `${fmtInt(item.count)} liberações vs. média de ${item.media} nos outros meses`));
      const right = el('span', 'shrink-0 text-sm font-semibold px-2 py-1 rounded-lg bg-amber-500/20 text-amber-200', `${item.fator}×`);
      list.appendChild(anomaliaRow([left, right], () => handlers.onPicoSetor(item)));
    }
    col.appendChild(list);
    groups.appendChild(col);
  }

  // -- Aprovadores fora do padrão
  if (anomalias.aprovadoresForaPadrao.length > 0) {
    const col = el('div');
    col.appendChild(el('h4', 'text-xs font-semibold uppercase tracking-wide text-amber-200/70 mb-2', 'Gestores fora do padrão'));
    const list = el('div', 'space-y-1.5');
    for (const item of anomalias.aprovadoresForaPadrao) {
      const bits = [];
      if (item.setorExcecoes >= 3) bits.push(`Costuma liberar em ${item.domSetor} (${item.domSetorPct}% dos casos) — ${item.setorExcecoes}× fora disso`);
      const left = el('div', 'min-w-0');
      left.appendChild(el('p', 'text-sm text-white/90 truncate', item.aprovador));
      left.appendChild(el('p', 'text-xs text-white/50 mt-0.5 truncate', bits.join(' · ')));
      const right = el('span', 'shrink-0 text-sm font-semibold px-2 py-1 rounded-lg bg-amber-500/20 text-amber-200', `${fmtInt(item.total)}`);
      list.appendChild(anomaliaRow([left, right], () => handlers.onAprovador(item)));
    }
    col.appendChild(list);
    groups.appendChild(col);
  }

  container.appendChild(groups);
}

// -------------------------------------------------------- Paleta de comandos

const PALETTE_TYPE_LABEL = { colaborador: 'Colaborador', setor: 'Setor', aprovador: 'Gestor' };
const PALETTE_TYPE_COLOR = {
  colaborador: 'text-emerald-300 bg-emerald-500/10',
  setor: 'text-cyan-300 bg-cyan-500/10',
  aprovador: 'text-violet-300 bg-violet-500/10',
};

function renderCommandPalette(root, query, results, onQueryChange, onSelect, onClose) {
  root.innerHTML = '';
  const overlay = el('div', 'fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-start justify-center pt-[14vh] p-4');
  overlay.addEventListener('click', onClose);

  const box = el('div', 'cm-glass-modal w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl');
  if (!REDUCED_MOTION) box.style.animation = 'cm-chip-in 200ms cubic-bezier(0.16,1,0.3,1) both';
  box.addEventListener('click', (e) => e.stopPropagation());

  const inputWrap = el('div', 'flex items-center gap-2.5 px-4 py-3 border-b border-white/10');
  inputWrap.appendChild(el('span', 'text-white/40 shrink-0', [iconEl(ICON_SEARCH)]));
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Buscar colaborador, setor ou gestor…';
  input.value = query;
  input.className = 'flex-1 bg-transparent outline-none text-sm text-white placeholder-white/30';
  input.addEventListener('input', () => onQueryChange(input.value));
  inputWrap.appendChild(input);
  box.appendChild(inputWrap);

  const list = el('div', 'max-h-80 overflow-y-auto p-2');
  const q = query.trim();
  if (!q) {
    list.appendChild(el('p', 'text-sm text-white/30 px-3 py-4 text-center', 'Digite pra buscar em colaboradores, setores e gestores.'));
  } else if (results.length === 0) {
    list.appendChild(el('p', 'text-sm text-white/40 px-3 py-4 text-center', 'Nada encontrado.'));
  } else {
    for (const r of results) {
      const row = clickableRow('w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors duration-150 text-left');
      const left = el('div', 'flex items-center gap-2.5 min-w-0');
      left.appendChild(el('span', `shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${PALETTE_TYPE_COLOR[r.type]}`, PALETTE_TYPE_LABEL[r.type]));
      const labelText = r.sublabel && r.type === 'colaborador' ? `${r.label} · ${r.sublabel}` : r.label;
      left.appendChild(el('span', 'text-sm text-white/90 truncate', labelText));
      row.appendChild(left);
      row.appendChild(el('span', 'shrink-0 text-xs text-white/50', `${fmtInt(r.count)} liberações`));
      row.addEventListener('click', () => onSelect(r));
      list.appendChild(row);
    }
  }
  box.appendChild(list);
  box.appendChild(el('div', 'px-4 py-2 border-t border-white/10 text-[11px] text-white/30', 'Esc para fechar'));

  overlay.appendChild(box);
  root.appendChild(overlay);

  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function closeCommandPalette(root) {
  root.innerHTML = '';
}

// -------------------------------------------------- Modal: tendência mensal

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function legendDot(colorClass, label) {
  const item = el('div', 'flex items-center gap-1.5 text-xs text-white/50');
  item.appendChild(el('span', `w-2.5 h-2.5 rounded-sm shrink-0 ${colorClass}`));
  item.appendChild(el('span', '', label));
  return item;
}

/** Gráfico de linha (SVG puro, sem dependências) — hover mostra tooltip
 * com o valor exato do mês, clique filtra o dashboard por ele. `container`
 * precisa de altura fixa (definida pelo chamador) pra o cálculo do
 * tooltip bater com o tamanho renderizado. */
/** Gráfico de linha genérico — `data` é [{key, label, value, monthKey?, monthLabel?}];
 * `key` é o valor que volta em `onSelect`/filtra o dashboard (ex.: nome do mês ou
 * "15/03/2026"), `label` é o texto curto mostrado no eixo. `labelEvery`
 * evita poluir o eixo quando há muitos pontos (ex.: todos os dias do
 * período) — só 1 a cada N pontos ganha rótulo, os outros ainda respondem a
 * hover/clique normalmente. `monthKey`/`monthLabel` (opcionais) desenham uma
 * linha de referência discreta na transição entre meses, calculada a partir
 * da mudança real de mês entre dois pontos consecutivos — não de datas fixas.
 *
 * O viewBox usa o tamanho REAL (em px CSS) do container no momento da
 * renderização, em vez de um tamanho fixo esticado por CSS (preserveAspectRatio
 * "none" antigo) — é isso que evita o gráfico ficar desproporcional: 1 unidade
 * do viewBox passa a valer exatamente 1px renderizado, então nada é esticado
 * de forma não-uniforme (nem os traços, nem o texto dos rótulos). */
function renderLineChart(container, data, { color = '#60a5fa', onSelect, activeKey, labelEvery = 1 } = {}) {
  container.innerHTML = '';
  container.style.position = 'relative';
  const rect = container.getBoundingClientRect();
  // Fallback pro tamanho antigo só pro caso do container ainda não ter layout
  // (ex.: display:none) — nunca acontece nos cards atuais, mas evita viewBox 0x0.
  const width = Math.max(1, Math.round(rect.width) || 640);
  const height = Math.max(1, Math.round(rect.height) || 240);
  const padding = { top: 20, right: 12, bottom: 26, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;
  const pts = data.map((d, i) => ({
    ...d,
    x: padding.left + stepX * i,
    y: padding.top + innerH - (d.value / max) * innerH,
  }));

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'xMidYMid meet', class: 'w-full h-full block' });

  for (const frac of [0, 0.5, 1]) {
    const y = padding.top + innerH * (1 - frac);
    svg.appendChild(svgEl('line', { x1: padding.left, x2: width - padding.right, y1: y, y2: y, stroke: 'rgba(255,255,255,0.08)', 'stroke-width': 1 }));
    const label = svgEl('text', { x: padding.left - 8, y: y + 3, fill: 'rgba(255,255,255,0.35)', 'font-size': 10, 'text-anchor': 'end' });
    label.textContent = fmtInt(Math.round(max * frac));
    svg.appendChild(label);
  }

  const gradId = `trendGrad${Math.random().toString(36).slice(2, 8)}`;
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.35 }));
  grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  if (pts.length) {
    const areaPath = ['M', pts[0].x, height - padding.bottom, ...pts.flatMap((p) => ['L', p.x, p.y]), 'L', pts[n - 1].x, height - padding.bottom, 'Z'].join(' ');
    svg.appendChild(svgEl('path', { d: areaPath, fill: `url(#${gradId})` }));

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    svg.appendChild(svgEl('path', { d: linePath, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  }

  // Separação automática entre meses: uma linha de referência discreta no
  // PONTO MÉDIO entre o último ponto de um mês e o primeiro do seguinte —
  // nunca em cima de um ponto de dado — calculada a partir da mudança real
  // de `monthKey` entre pontos consecutivos (não de datas fixas), então
  // continua correta com lacunas, novos dias e novos meses.
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].monthKey == null || pts[i - 1].monthKey == null) continue;
    if (pts[i].monthKey === pts[i - 1].monthKey) continue;
    const xMid = (pts[i - 1].x + pts[i].x) / 2;
    svg.appendChild(svgEl('line', {
      x1: xMid, x2: xMid, y1: padding.top, y2: height - padding.bottom,
      stroke: 'rgba(255,255,255,0.25)', 'stroke-width': 1, 'stroke-dasharray': '3 3',
    }));
    if (pts[i].monthLabel) {
      const monthTag = svgEl('text', { x: xMid, y: padding.top - 7, fill: 'rgba(255,255,255,0.4)', 'font-size': 9, 'text-anchor': 'middle' });
      monthTag.textContent = pts[i].monthLabel;
      svg.appendChild(monthTag);
    }
  }

  const tip = el('div', 'pointer-events-none absolute z-10 hidden text-xs rounded-lg px-2.5 py-1.5 bg-neutral-900 border border-white/15 text-white shadow-xl whitespace-nowrap');

  const showTip = (p) => {
    tip.classList.remove('hidden');
    tip.innerHTML = '';
    tip.appendChild(el('p', 'font-semibold', p.label));
    tip.appendChild(el('p', 'text-white/70', `${fmtInt(p.value)} liberações`));
    const rect = container.getBoundingClientRect();
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;
    tip.style.left = `${p.x * scaleX}px`;
    tip.style.top = `${p.y * scaleY - 10}px`;
    tip.style.transform = 'translate(-50%, -100%)';
  };
  const hideTip = () => tip.classList.add('hidden');

  pts.forEach((p, i) => {
    const isActive = activeKey === p.key;
    const dot = svgEl('circle', { cx: p.x, cy: p.y, r: isActive ? 5.5 : 4, fill: color, stroke: '#0a0a0b', 'stroke-width': 2 });
    svg.appendChild(dot);

    if (i % labelEvery === 0) {
      const label = svgEl('text', { x: p.x, y: height - 8, fill: isActive ? '#fff' : 'rgba(255,255,255,0.5)', 'font-size': 11, 'text-anchor': 'middle' });
      label.textContent = p.label;
      svg.appendChild(label);
    }

    const zoneW = n > 1 ? innerW / (n - 1) : innerW;
    const zone = svgEl('rect', { x: p.x - zoneW / 2, y: 0, width: zoneW, height, fill: 'transparent', style: 'cursor:pointer' });
    zone.addEventListener('mouseenter', () => showTip(p));
    zone.addEventListener('mouseleave', hideTip);
    zone.addEventListener('click', () => onSelect && onSelect(p.key));
    svg.appendChild(zone);
  });

  container.appendChild(svg);
  container.appendChild(tip);
}

/** Barra empilhada (Horário Negado vs. outros motivos) por mês. */
function renderStackedBarChart(container, data, { onSelectMonth, activeMes } = {}) {
  container.innerHTML = '';
  const max = Math.max(1, ...data.map((d) => d.total));
  const wrap = el('div', 'flex items-end gap-3 h-40');
  for (const d of data) {
    const isActive = activeMes === d.mes;
    const col = clickableRow('flex-1 h-full flex flex-col items-center gap-1.5 group');
    col.title = `${d.mes}: ${fmtInt(d.negado)} horário negado, ${fmtInt(d.outros)} outro(s) motivo(s)`;
    col.addEventListener('click', () => onSelectMonth && onSelectMonth(d.mes));

    const barWrap = el('div', `w-full flex-1 flex flex-col justify-end rounded-t-md overflow-hidden ${isActive ? 'ring-2 ring-white' : ''}`);
    const outrosBar = el('div', 'w-full bg-blue-500/70 group-hover:bg-blue-400');
    const negadoBar = el('div', 'w-full bg-amber-500 group-hover:bg-amber-400');
    outrosBar.style.height = '0%';
    negadoBar.style.height = '0%';
    outrosBar.style.transition = REDUCED_MOTION ? 'none' : 'height 500ms cubic-bezier(0.16,1,0.3,1)';
    negadoBar.style.transition = REDUCED_MOTION ? 'none' : 'height 500ms cubic-bezier(0.16,1,0.3,1)';
    barWrap.appendChild(outrosBar);
    barWrap.appendChild(negadoBar);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      outrosBar.style.height = `${(d.outros / max) * 100}%`;
      negadoBar.style.height = `${(d.negado / max) * 100}%`;
    }));

    col.appendChild(barWrap);
    col.appendChild(el('span', `text-[11px] ${isActive ? 'text-white font-semibold' : 'text-white/50'}`, d.mes.slice(0, 3)));
    wrap.appendChild(col);
  }
  container.appendChild(wrap);
}

/** Barra simples (uma métrica) por mês — usado pra "liberações com gestor irregular". */
function renderBarChart(container, data, { color = 'bg-red-500', onSelectMonth, activeMes } = {}) {
  container.innerHTML = '';
  const max = Math.max(1, ...data.map((d) => d.value));
  const wrap = el('div', 'flex items-end gap-3 h-32');
  for (const d of data) {
    const isActive = activeMes === d.mes;
    const col = clickableRow('flex-1 h-full flex flex-col items-center gap-1.5 group');
    col.title = `${d.mes}: ${fmtInt(d.value)} liberações`;
    col.addEventListener('click', () => onSelectMonth && onSelectMonth(d.mes));

    const barWrap = el('div', `w-full flex-1 flex items-end rounded-t-md overflow-hidden ${isActive ? 'ring-2 ring-white' : ''}`);
    const bar = el('div', `w-full ${color} group-hover:brightness-125`);
    bar.style.height = '0%';
    bar.style.transition = REDUCED_MOTION ? 'none' : 'height 500ms cubic-bezier(0.16,1,0.3,1), filter 150ms ease';
    barWrap.appendChild(bar);
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.height = `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%`; }));

    col.appendChild(barWrap);
    col.appendChild(el('span', `text-[11px] ${isActive ? 'text-white font-semibold' : 'text-white/50'}`, d.mes.slice(0, 3)));
    wrap.appendChild(col);
  }
  container.appendChild(wrap);
}

/** Modal "Tendência mensal" — versão ampliada do KPI, com 3 gráficos
 * interativos (total, horário negado vs. outros, gestor irregular) em vez
 * de só a sparkline mini do card. Clicar num mês em qualquer gráfico filtra
 * o dashboard inteiro por ele e fecha o modal. */
function renderTrendModal(root, { detailed, filters, onSelectMonth, onClearMes, onClose }) {
  root.innerHTML = '';
  const overlay = el('div', 'fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-start justify-center pt-[6vh] p-4 overflow-y-auto');
  overlay.addEventListener('click', onClose);

  const box = el('div', 'cm-glass-modal w-full max-w-3xl rounded-3xl p-6 shadow-2xl');
  if (!REDUCED_MOTION) box.style.animation = 'cm-chip-in 220ms cubic-bezier(0.16,1,0.3,1) both';
  box.addEventListener('click', (e) => e.stopPropagation());

  const header = el('div', 'flex items-start justify-between gap-3');
  const titleWrap = el('div');
  titleWrap.appendChild(el('h3', 'text-lg font-semibold text-white', 'Tendência mensal'));
  titleWrap.appendChild(el('p', 'text-sm text-white/50 mt-1', 'Clique num mês em qualquer gráfico pra filtrar o dashboard inteiro por ele'));
  header.appendChild(titleWrap);
  const closeBtn = el('button', 'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-150', '×');
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', onClose);
  header.appendChild(closeBtn);
  box.appendChild(header);

  if (filters.mes) {
    const chip = el('button', 'inline-flex items-center gap-1.5 mt-3 text-xs font-medium px-3 py-1.5 rounded-full bg-white/10 border border-white/10 hover:bg-white/20 text-white/80 transition-colors duration-150');
    chip.type = 'button';
    chip.appendChild(el('span', '', `Filtrando: ${filters.mes}`));
    chip.appendChild(el('span', 'text-white/50', '× limpar'));
    chip.addEventListener('click', onClearMes);
    box.appendChild(chip);
  }

  box.appendChild(el('h4', 'text-xs font-semibold uppercase tracking-wide text-white/40 mt-5 mb-2', 'Liberações por mês'));
  const lineWrap = el('div', 'w-full');
  lineWrap.style.height = '220px';
  box.appendChild(lineWrap);

  box.appendChild(el('h4', 'text-xs font-semibold uppercase tracking-wide text-white/40 mt-6 mb-2', 'Horário negado vs. outros motivos'));
  const stackedWrap = el('div');
  box.appendChild(stackedWrap);
  const legend = el('div', 'flex items-center gap-4 mt-2.5');
  legend.appendChild(legendDot('bg-amber-500', 'Horário negado'));
  legend.appendChild(legendDot('bg-blue-500/70', 'Outros motivos'));
  box.appendChild(legend);

  box.appendChild(el('h4', 'text-xs font-semibold uppercase tracking-wide text-white/40 mt-6 mb-2', 'Liberações com gestor irregular'));
  const irregularWrap = el('div');
  box.appendChild(irregularWrap);

  overlay.appendChild(box);
  root.appendChild(overlay);

  // Renderizados depois de anexar ao DOM: o gráfico de linha usa
  // getBoundingClientRect() do container pra posicionar o tooltip, o que
  // só dá um valor real com o elemento já montado.
  renderLineChart(lineWrap, detailed.map((d) => ({ key: d.mes, label: d.mes.slice(0, 3), value: d.total })), { color: '#60a5fa', onSelect: onSelectMonth, activeKey: filters.mes });
  renderStackedBarChart(stackedWrap, detailed, { onSelectMonth, activeMes: filters.mes });
  renderBarChart(irregularWrap, detailed.map((d) => ({ mes: d.mes, value: d.irregular })), { color: 'bg-red-500', onSelectMonth, activeMes: filters.mes });

  const onKeydown = (e) => { if (e.key === 'Escape') onClose(); };
  document.addEventListener('keydown', onKeydown, { once: true });
}

function closeTrendModal(root) {
  root.innerHTML = '';
}

/** Popover "Mais opções" — atrás de um botão compacto (ícone), mesmo padrão
 * visual dos dropdowns de filtro. `container` precisa ser `relative`, igual
 * aos dropdowns.
 *
 * `showOrfaosCard` controla só a VISIBILIDADE do card/KPI "Matrícula órfã" —
 * não é mais um filtro de dado (ver applyFilters em aggregate.js): uma
 * matrícula órfã é uma liberação real, só não está em COLABORADORES.csv
 * (que pode estar desatualizada), então sempre conta no total independente
 * deste toggle. Card fica OCULTO por padrão; isso só decide se ele aparece. */
function renderMoreOptions(container, { isOpen, onToggle, showOrfaosCard, onToggleOrfaosCard }) {
  container.innerHTML = '';

  const btn = el('button', `cm-select flex items-center justify-center w-[38px] h-[38px] shrink-0 rounded-full text-white/70 transition-colors duration-150 hover:text-white ${isOpen ? 'text-white' : ''}`);
  btn.type = 'button';
  btn.title = 'Mais opções';
  btn.setAttribute('aria-expanded', String(isOpen));
  // ponto no canto quando o card está VISÍVEL (fora do padrão, que é oculto),
  // pra sinalizar "há uma opção não-padrão ativa aqui dentro" mesmo fechado.
  const dot = showOrfaosCard ? el('span', 'absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400') : null;
  btn.style.position = 'relative';
  btn.appendChild(el('span', 'text-base leading-none', '⋯'));
  if (dot) btn.appendChild(dot);
  btn.addEventListener('click', (e) => { e.stopPropagation(); onToggle(); });
  container.appendChild(btn);

  if (!isOpen) return;

  const panel = el('div', 'cm-glass-modal absolute right-0 z-40 mt-2 min-w-[250px] rounded-2xl p-2 shadow-2xl');
  if (!REDUCED_MOTION) panel.style.animation = 'cm-chip-in 150ms cubic-bezier(0.16,1,0.3,1) both';
  panel.addEventListener('click', (e) => e.stopPropagation());

  const row = el('button', 'w-full flex items-center justify-between gap-3 rounded-xl text-sm px-2.5 py-2 text-white/80 hover:bg-white/5 transition-colors duration-150');
  row.type = 'button';
  row.setAttribute('role', 'switch');
  row.setAttribute('aria-checked', String(showOrfaosCard));
  row.appendChild(el('span', 'text-left', 'Mostrar card "Matrícula órfã"'));
  const track = el('span', `relative inline-flex shrink-0 w-9 h-5 rounded-full transition-colors duration-200 ${showOrfaosCard ? 'bg-emerald-500/80' : 'bg-white/15'}`);
  const knob = el('span', `absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${showOrfaosCard ? 'translate-x-4' : 'translate-x-0'}`);
  track.appendChild(knob);
  row.appendChild(track);
  row.addEventListener('click', () => onToggleOrfaosCard(!showOrfaosCard));
  panel.appendChild(row);
  panel.appendChild(el('p', 'text-xs text-white/40 px-2.5 pt-1.5', 'Matrículas sem cadastro na base de dados — sempre contam no total, isso só decide se o card aparece.'));

  container.appendChild(panel);
}

// ------------------------------------------------------------- Menu de exportação

/** Botão "<ícone de download> Exportar ▾" — mesmo padrão dos outros
 * dropdowns (renderMoreOptions/renderAccountMenu). As três opções exportam
 * exatamente o que está filtrado na tela agora (ver
 * exportFilteredCSV/exportSpreadsheet/exportPDF em main.js). */
function renderExportMenu(container, { isOpen, onToggle, onExportCSV, onExportExcel, onExportPDF }) {
  container.innerHTML = '';

  const btn = el('button', `cm-select flex items-center gap-2 rounded-full text-sm px-3 py-2 text-white/60 transition-colors duration-150 hover:border-white/25 hover:text-white/90 ${isOpen ? 'text-white' : ''}`);
  btn.type = 'button';
  btn.setAttribute('aria-expanded', String(isOpen));
  btn.appendChild(el('span', 'shrink-0', [iconEl(ICON_DOWNLOAD)]));
  btn.appendChild(el('span', '', 'Exportar'));
  btn.appendChild(el('span', `shrink-0 text-white/40 text-[10px] transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`, '▾'));
  btn.addEventListener('click', (e) => { e.stopPropagation(); onToggle(); });
  container.appendChild(btn);

  if (!isOpen) return;

  const panel = el('div', 'cm-glass-modal absolute left-0 z-40 mt-2 min-w-[230px] rounded-2xl p-1.5 shadow-2xl');
  if (!REDUCED_MOTION) panel.style.animation = 'cm-chip-in 150ms cubic-bezier(0.16,1,0.3,1) both';
  panel.addEventListener('click', (e) => e.stopPropagation());

  const menuItem = (iconPaths, label, sublabel, onClick) => {
    const b = el('button', 'w-full flex items-start gap-2.5 text-left text-sm px-3 py-2 rounded-xl text-white/80 hover:bg-white/10 transition-colors duration-100');
    b.type = 'button';
    b.appendChild(el('span', 'shrink-0 text-white/50 mt-0.5', [iconEl(iconPaths)]));
    const textWrap = el('span', 'min-w-0');
    textWrap.appendChild(el('span', 'block', label));
    textWrap.appendChild(el('span', 'block text-xs text-white/40', sublabel));
    b.appendChild(textWrap);
    b.addEventListener('click', onClick);
    return b;
  };

  panel.appendChild(menuItem(ICON_FILE_TEXT, 'CSV', 'Abre em Excel, Sheets etc.', onExportCSV));
  panel.appendChild(menuItem(ICON_TABLE, 'Planilha (Excel)', 'Várias abas: resumo, setor, motivo, gestor', onExportExcel));
  panel.appendChild(menuItem(ICON_PRINTER, 'PDF', 'Relatório com gráficos, via impressão do navegador', onExportPDF));
  panel.appendChild(el('p', 'text-[11px] text-white/30 px-3 pt-1.5', 'Sempre respeita os filtros ativos na tela.'));

  container.appendChild(panel);
}

// -------------------------------------------------------------- Menu de conta

// Ícones (traço Lucide, sem preenchimento — ver iconEl) usados no menu de
// conta no lugar de emoji: um visual mais discreto/profissional, consistente
// com os outros ícones do projeto (login, footer).
const ICON_USER = '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>';
const ICON_SWITCH_ACCOUNT = '<path d="m17 2 4 4-4 4"></path><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><path d="m7 22-4-4 4-4"></path><path d="M21 13v1a4 4 0 0 1-4 4H3"></path>';
const ICON_LOGOUT = '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>';

// Mesmo conjunto (traço Lucide), reusado no menu de exportação e na busca —
// tudo ícone SVG inline no lugar de emoji.
const ICON_SEARCH = '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>';
const ICON_DOWNLOAD = '<path d="M12 15V3"></path><path d="M6 15v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4"></path><path d="m7 10 5 5 5-5"></path>';
const ICON_FILE_TEXT = '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path>';
const ICON_TABLE = '<path d="M12 3v18"></path><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M3 9h18"></path><path d="M3 15h18"></path>';
const ICON_PRINTER = '<path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect width="12" height="8" x="6" y="14"></rect>';

/** Botão "<ícone de usuário> <usuário> ▾" no canto superior direito do header
 * — mesmo padrão visual/estrutural de renderMoreOptions (botão compacto +
 * painel cm-glass-modal abaixo). `username` vem de GET /auth/verify (ver
 * fetchUsername em main.js); fica null em dev local sem o serviço de auth, e
 * o botão cai pra um rótulo genérico "Conta" — as ações continuam
 * funcionando (POST /auth/logout + redirect), só a etiqueta de "logado
 * como" não aparece. */
function renderAccountMenu(container, { isOpen, username, onToggle, onSwitchAccount, onLogout }) {
  container.innerHTML = '';

  const btn = el('button', `cm-select flex items-center gap-2 rounded-full text-sm px-3 py-2 text-white/70 transition-colors duration-150 hover:border-white/25 hover:text-white ${isOpen ? 'text-white' : ''}`);
  btn.type = 'button';
  btn.setAttribute('aria-expanded', String(isOpen));
  btn.appendChild(el('span', 'shrink-0 text-white/50', [iconEl(ICON_USER)]));
  btn.appendChild(el('span', 'max-w-[110px] truncate', username || 'Conta'));
  btn.appendChild(el('span', `shrink-0 text-white/40 text-[10px] transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`, '▾'));
  btn.addEventListener('click', (e) => { e.stopPropagation(); onToggle(); });
  container.appendChild(btn);

  if (!isOpen) return;

  const panel = el('div', 'cm-glass-modal absolute right-0 z-40 mt-2 min-w-[200px] rounded-2xl p-1.5 shadow-2xl');
  if (!REDUCED_MOTION) panel.style.animation = 'cm-chip-in 150ms cubic-bezier(0.16,1,0.3,1) both';
  panel.addEventListener('click', (e) => e.stopPropagation());

  if (username) {
    panel.appendChild(el('p', 'px-3 pt-1.5 pb-2 text-xs text-white/40 truncate', `Logado como ${username}`));
  }

  const menuItem = (iconPaths, label, onClick) => {
    const b = el('button', 'w-full flex items-center gap-2.5 text-left text-sm px-3 py-2 rounded-xl text-white/80 hover:bg-white/10 transition-colors duration-100');
    b.type = 'button';
    b.appendChild(el('span', 'shrink-0 text-white/50', [iconEl(iconPaths)]));
    b.appendChild(el('span', '', label));
    b.addEventListener('click', onClick);
    return b;
  };

  panel.appendChild(menuItem(ICON_SWITCH_ACCOUNT, 'Trocar de conta', onSwitchAccount));
  panel.appendChild(menuItem(ICON_LOGOUT, 'Sair', onLogout));

  container.appendChild(panel);
}

// --------------------------------------------------------------- Filtros (dropdowns)

/** Dropdown customizado (não é um <select> nativo — o popup nativo é
 * desenhado pelo SO/navegador e não dá pra estilizar, então ficava
 * destoando do resto do vidro escuro). `container` precisa ser `relative`
 * pra o painel se posicionar por baixo do botão. */
function renderFilterDropdown(container, { value, options, placeholder, isOpen, onToggle, onSelect }) {
  container.innerHTML = '';

  const btn = el('button', 'cm-select flex items-center gap-2 rounded-full text-sm px-3 py-2 text-white/80 transition-colors duration-150 hover:border-white/25');
  btn.type = 'button';
  btn.appendChild(el('span', `truncate max-w-[160px] ${value ? 'text-white' : 'text-white/80'}`, value || placeholder));
  btn.appendChild(el('span', `shrink-0 text-white/40 text-[10px] transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`, '▾'));
  btn.addEventListener('click', (e) => { e.stopPropagation(); onToggle(); });
  container.appendChild(btn);

  if (!isOpen) return;

  // cm-glass-modal (vidro opaco, não o cm-glass translúcido dos cards): o painel
  // flutua por cima de cards coloridos (KPIs, destaque âmbar do motivo, etc.), e
  // com só 6% de branco de fundo o conteúdo de trás vazava through e engolia o
  // texto das opções — quase ilegível, como reportado.
  const panel = el('div', 'cm-glass-modal absolute left-0 z-40 mt-2 min-w-[210px] max-h-72 overflow-y-auto rounded-2xl p-1.5 shadow-2xl');
  if (!REDUCED_MOTION) panel.style.animation = 'cm-chip-in 150ms cubic-bezier(0.16,1,0.3,1) both';
  panel.addEventListener('click', (e) => e.stopPropagation());

  const optBtn = (label, isActive, onClick) => {
    const o = el('button', `w-full text-left text-sm px-3 py-2 rounded-xl truncate transition-colors duration-100 hover:bg-white/10 ${isActive ? 'text-white bg-white/10 font-medium' : 'text-white/70'}`, label);
    o.type = 'button';
    o.addEventListener('click', onClick);
    return o;
  };

  panel.appendChild(optBtn(placeholder, !value, () => onSelect('')));
  for (const opt of options) {
    panel.appendChild(optBtn(opt, value === opt, () => onSelect(opt)));
  }

  container.appendChild(panel);
}
