/**
 * Agregações consumidas pelo render.js. Tudo aqui opera sobre a lista
 * de registros já limpa (ver data.js) — nada de parsing de CSV aqui.
 */

// Derivado de MONTHLY_FILES (data.js) — fonte única da verdade sobre quais
// meses existem. Adicionar um mês novo em data.js já propaga pra cá.
const MESES_ORDEM = MONTHLY_FILES.map((f) => f.mes);
const MESES_ABREV_ANO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_ORDEM = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
// Faixas dentro do expediente real da loja (Ferreira Costa, filial 08): abre
// 8h/fecha 20h, colaboradores chegam a partir de 7h40 e o último sai até
// 20h20 — não existe movimento de madrugada, então as faixas cobrem essa
// janela (07:40–20:20) com larguras bem próximas entre si (nada de uma de
// 400min contra outra de 40min como antes), pra comparação justa no
// heatmap. A primeira e a última faixa ficam "abertas" (min < X / min >= Y)
// só pra absorver com segurança qualquer horário fora do normal sem
// precisar de um cesto genérico "Outros" — na prática quase tudo cai dentro
// de 07:40–20:20 mesmo.
const HORA_BANDS = [
  { key: 'abertura', label: 'Abertura (até 10h)', short: 'Abertura', range: 'até 10:00', test: (min) => min < 600 }, // pega a chegada às 7h40
  { key: 'manha', label: 'Manhã (10h–12h)', short: 'Manhã', range: '10:00–12:00', test: (min) => min >= 600 && min < 720 },
  { key: 'meio-dia', label: 'Meio-dia (12h–14h)', short: 'Meio-dia', range: '12:00–14:00', test: (min) => min >= 720 && min < 840 },
  { key: 'tarde', label: 'Tarde (14h–16h)', short: 'Tarde', range: '14:00–16:00', test: (min) => min >= 840 && min < 960 },
  { key: 'fim-tarde', label: 'Fim de tarde (16h–18h)', short: 'Fim de tarde', range: '16:00–18:00', test: (min) => min >= 960 && min < 1080 },
  { key: 'fechamento', label: 'Fechamento (a partir de 18h)', short: 'Fechamento', range: 'a partir de 18:00', test: (min) => min >= 1080 }, // pega a saída até 20h20
];

function applyFilters(records, filters) {
  return records.filter((r) => {
    if (filters.mes && r.mes !== filters.mes) return false;
    if (filters.setor && r.setor !== filters.setor) return false;
    if (filters.motivo && r.motivo !== filters.motivo) return false;
    if (filters.aprovador && r.aprovador !== filters.aprovador) return false;
    if (filters.weekday && r.weekday !== filters.weekday) return false;
    if (filters.data && r.data !== filters.data) return false;
    if (filters.band) {
      const bandDef = HORA_BANDS.find((b) => b.key === filters.band);
      if (r.minutesOfDay == null || !bandDef.test(r.minutesOfDay)) return false;
    }
    if (filters.matricula && r.matricula !== filters.matricula) return false;
    if (filters.nomeSemMatricula && !(!r.matricula && r.nomeDisplay === filters.nomeSemMatricula)) return false;
    if (filters.onlyUnauthorized && !r.aprovadorNaoAutorizado) return false;
    if (filters.onlyOrfaos && !r.naoCadastrado) return false;
    if (!filters.onlyOrfaos && !filters.includeOrfaos && r.naoCadastrado) return false;
    return true;
  });
}

/** Descrição legível de cada filtro ativo, para os chips da barra de filtros. */
function describeFilters(filters) {
  const chips = [];
  if (filters.mes) chips.push({ key: 'mes', label: `Período: ${filters.mes}` });
  if (filters.setor) chips.push({ key: 'setor', label: `Setor: ${filters.setor}` });
  if (filters.motivo) chips.push({ key: 'motivo', label: `Motivo: ${filters.motivo}` });
  if (filters.aprovador) chips.push({ key: 'aprovador', label: `Gestor: ${filters.aprovador}` });
  if (filters.weekday) chips.push({ key: 'weekday', label: `Dia da semana: ${filters.weekday}` });
  if (filters.data) chips.push({ key: 'data', label: `Data: ${filters.data}` });
  if (filters.band) {
    const bandDef = HORA_BANDS.find((b) => b.key === filters.band);
    chips.push({ key: 'band', label: `Horário: ${bandDef ? bandDef.label : filters.band}` });
  }
  if (filters.matricula) chips.push({ key: 'matricula', label: `Colaborador: mat. ${filters.matricula}` });
  if (filters.nomeSemMatricula) chips.push({ key: 'nomeSemMatricula', label: `Colaborador: ${filters.nomeSemMatricula}` });
  if (filters.onlyUnauthorized) chips.push({ key: 'onlyUnauthorized', label: 'Somente gestor irregular' });
  if (filters.onlyOrfaos) chips.push({ key: 'onlyOrfaos', label: 'Somente matrícula órfã' });
  return chips;
}

function countBy(records, field, topN) {
  const m = new Map();
  for (const r of records) {
    const k = r[field] || '—';
    m.set(k, (m.get(k) || 0) + 1);
  }
  const arr = [...m.entries()].sort((a, b) => b[1] - a[1]);
  return topN ? arr.slice(0, topN) : arr;
}

function computeKPIs(records, duplicatesRemoved) {
  const total = records.length;
  const negado = records.filter((r) => r.motivo === 'HORÁRIO NEGADO').length;
  const matriculas = new Set(records.filter((r) => r.matricula).map((r) => r.matricula));
  const orfaos = records.filter((r) => r.naoCadastrado).length;
  const naoAutorizadoEventos = records.filter((r) => r.aprovadorNaoAutorizado).length;
  const naoAutorizadoPessoas = new Set(records.filter((r) => r.aprovadorNaoAutorizado).map((r) => r.aprovador)).size;

  return {
    total,
    negado,
    negadoPct: total ? Math.round((negado / total) * 100) : 0,
    colaboradoresUnicos: matriculas.size,
    orfaos,
    orfaosPct: total ? Math.round((orfaos / total) * 100) : 0,
    naoAutorizadoEventos,
    naoAutorizadoPessoas,
    duplicatesRemoved,
  };
}

function monthlyTrend(records) {
  const counts = Object.fromEntries(MESES_ORDEM.map((m) => [m, 0]));
  for (const r of records) if (counts[r.mes] != null) counts[r.mes]++;
  return MESES_ORDEM.map((mes) => ({ mes, count: counts[mes] }));
}

/** Contagem por dia do calendário (dd/mm/aaaa) — a granularidade que faltava
 * entre "mês" e "dia da semana": dá pra ver picos num dia específico, não só
 * "quintas em geral". Ignora suspiciousDate (mesmo critério de
 * dateRangeLabel) pra não distorcer o eixo com uma data errada da planilha.
 * Só entram dias com pelo menos 1 evento — não preenche os "buracos". */
function dailyTrend(records) {
  const m = new Map();
  for (const r of records) {
    if (!r.data || r.suspiciousDate) continue;
    if (!m.has(r.data)) m.set(r.data, { data: r.data, dateObj: r.dateObj, count: 0 });
    m.get(r.data).count++;
  }
  return [...m.values()].sort((a, b) => {
    const ta = a.dateObj ? a.dateObj.getTime() : 0;
    const tb = b.dateObj ? b.dateObj.getTime() : 0;
    return ta - tb;
  });
}

/** Variação do último mês da linha do tempo (MONTHLY_FILES) vs o mês anterior a ele.
 * Sempre compara os dois últimos meses cronológicos, não os dois com mais eventos —
 * é "como fechou o mês mais recente", não um ranking. `pct: null` quando o mês
 * anterior não teve nenhum evento (não dá pra calcular variação percentual). */
function monthOverMonth(trend) {
  if (trend.length < 2) return null;
  const last = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  if (last.count === 0 && prev.count === 0) return null;
  if (prev.count === 0) return { mes: last.mes, mesAnterior: prev.mes, pct: null, count: last.count, countAnterior: 0 };
  const pct = Math.round(((last.count - prev.count) / prev.count) * 100);
  return { mes: last.mes, mesAnterior: prev.mes, pct, count: last.count, countAnterior: prev.count };
}

/** Detalha a tendência mensal em 3 métricas por mês, pro modal "Tendência
 * mensal": total de eventos, Horário Negado vs. outros motivos, e eventos
 * com gestor irregular. Mesmo recorte de meses do monthlyTrend. */
function monthlyTrendDetailed(records) {
  return MESES_ORDEM.map((mes) => {
    const evs = records.filter((r) => r.mes === mes);
    const negado = evs.filter((r) => r.motivo === 'HORÁRIO NEGADO').length;
    const irregular = evs.filter((r) => r.aprovadorNaoAutorizado).length;
    return { mes, total: evs.length, negado, outros: evs.length - negado, irregular };
  });
}

function motivoBreakdown(records) {
  const ranked = countBy(records, 'motivo');
  const total = records.length;
  const negado = ranked.find(([m]) => m === 'HORÁRIO NEGADO');
  const outros = ranked.filter(([m]) => m !== 'HORÁRIO NEGADO');
  const outrosTotal = outros.reduce((s, [, c]) => s + c, 0);
  return {
    total,
    negadoCount: negado ? negado[1] : 0,
    negadoPct: total ? Math.round(((negado ? negado[1] : 0) / total) * 100) : 0,
    outros, // já ordenado desc
    outrosTotal,
  };
}

function dayHourMatrix(records) {
  const matrix = DIAS_ORDEM.map((day) => ({
    day,
    bands: HORA_BANDS.map((b) => ({ key: b.key, label: b.label, count: 0 })),
  }));
  for (const r of records) {
    if (r.weekday == null || r.minutesOfDay == null) continue;
    const dayRow = matrix[DIAS_ORDEM.indexOf(r.weekday)];
    const bandIdx = HORA_BANDS.findIndex((b) => b.test(r.minutesOfDay));
    dayRow.bands[bandIdx].count++;
  }
  const max = Math.max(1, ...matrix.flatMap((d) => d.bands.map((b) => b.count)));
  return { matrix, max };
}

// Sem cap fixo (n opcional): a lista completa vai pro card, que corta
// visualmente com o padrão "mostrar mais" (ver render.js) — antes o corte
// de 8 acontecia aqui e escondia gestores/setores de vez, sem chance de ver
// o resto.
function topSetores(records, n) {
  return countBy(records, 'setor', n).map(([setor, count]) => ({ setor, count }));
}

function topAprovadores(records, n) {
  const ranked = countBy(records, 'aprovador', n);
  // "Não informado" não é um gestor de verdade — rankeá-lo por volume junto
  // dos outros distorceria o "quem libera mais"; ele sempre vai pro fim da
  // lista, disponível pra quem quiser auditar, sem poluir o topo.
  const idx = ranked.findIndex(([a]) => a === NAO_INFORMADO);
  if (idx > -1) ranked.push(ranked.splice(idx, 1)[0]);
  return ranked.map(([aprovador, count]) => ({ aprovador, count }));
}

/** Um item por colaborador distinto (matrícula, ou nome quando sem matrícula), ordenado por volume desc, sem limite.
 * `diasAtivos` (dias distintos com pelo menos 1 liberação) é o contexto adicional pedido pro ranking — dá pra
 * distinguir "muitas liberações concentradas em poucos dias" de "uso espalhado ao longo do período". */
function aggregateColaboradores(records) {
  const m = new Map();
  for (const r of records) {
    const key = r.matricula || `SEMMAT:${r.nomeDisplay}`;
    if (!m.has(key)) {
      m.set(key, { matricula: r.matricula, nome: r.nomeDisplay, naoCadastrado: r.naoCadastrado, count: 0, dias: new Set() });
    }
    const e = m.get(key);
    e.count++;
    if (r.data) e.dias.add(r.data);
  }
  return [...m.values()]
    .map((e) => ({ ...e, diasAtivos: e.dias.size }))
    .sort((a, b) => b.count - a.count);
}

function topColaboradores(records, n = 10) {
  return aggregateColaboradores(records).slice(0, n);
}

/** Busca por nome (acento/caixa-insensível) ou matrícula (substring). */
function searchColaboradores(records, query, limit = 25) {
  const raw = (query || '').trim();
  if (!raw) return [];
  const q = stripAccents(baseKey(raw));
  return aggregateColaboradores(records)
    .filter((c) => stripAccents(baseKey(c.nome)).includes(q) || (c.matricula && c.matricula.includes(raw)))
    .slice(0, limit);
}

/** Busca unificada (paleta de comandos): colaboradores, setores e aprovadores
 * que batem com a query, combinados num só resultado ordenado por volume.
 * Roda sobre o dataset completo (não o filtrado), pra achar qualquer um
 * independente do que está selecionado agora no dashboard. */
function globalSearch(allRecords, query, limit = 8) {
  const raw = (query || '').trim();
  if (!raw) return [];
  const q = stripAccents(baseKey(raw));

  const colaboradores = searchColaboradores(allRecords, raw, limit).map((c) => ({
    type: 'colaborador',
    label: c.nome,
    sublabel: c.matricula ? `mat. ${c.matricula}` : (c.naoCadastrado ? 'órfã' : ''),
    count: c.count,
    payload: c,
  }));

  const setores = countBy(allRecords, 'setor')
    .filter(([s]) => stripAccents(baseKey(s)).includes(q))
    .slice(0, limit)
    .map(([setor, count]) => ({ type: 'setor', label: setor, sublabel: 'setor', count, payload: setor }));

  const aprovadores = countBy(allRecords.filter((r) => r.aprovador), 'aprovador')
    .filter(([a]) => stripAccents(baseKey(a)).includes(q))
    .slice(0, limit)
    .map(([aprovador, count]) => ({ type: 'aprovador', label: aprovador, sublabel: 'aprovador', count, payload: aprovador }));

  return [...colaboradores, ...setores, ...aprovadores].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Mais recente primeiro (data, depois hora) — usado tanto na ficha do colaborador quanto na lista
 * genérica de "liberações relacionadas" (drill-down), pra manter o mesmo critério de ordenação. */
function sortByRecency(records) {
  return records.slice().sort((a, b) => {
    const ta = a.dateObj ? a.dateObj.getTime() : 0;
    const tb = b.dateObj ? b.dateObj.getTime() : 0;
    if (tb !== ta) return tb - ta;
    return (b.hora || '').localeCompare(a.hora || '');
  });
}

/** Histórico completo de um colaborador (ignora os filtros da UI — é a "ficha" dele). */
function colaboradorEvents(allRecords, matricula, nomeSemMatricula) {
  return sortByRecency(allRecords.filter((r) => (matricula ? r.matricula === matricula : !r.matricula && r.nomeDisplay === nomeSemMatricula)));
}

/** Faixa de horário (HORA_BANDS) de um registro, pro detalhe da liberação individual. */
function bandLabelFor(minutesOfDay) {
  if (minutesOfDay == null) return null;
  const b = HORA_BANDS.find((band) => band.test(minutesOfDay));
  return b ? b.label : null;
}

function unauthorizedApprovers(records) {
  const filtered = records.filter((r) => r.aprovadorNaoAutorizado);
  return countBy(filtered, 'aprovador').map(([aprovador, count]) => ({ aprovador, count }));
}

/** Estatísticas de qualidade — sempre sobre o dataset limpo COMPLETO (sem filtros de UI). */
function qualityStats(allRecords, duplicatesRemoved) {
  return {
    duplicatesRemoved,
    horaAusente: allRecords.filter((r) => r.horaAusente).length,
    matriculaOrfa: allRecords.filter((r) => r.naoCadastrado).length,
    matriculaVazia: allRecords.filter((r) => !r.matricula).length,
    dataSuspeita: allRecords.filter((r) => r.suspiciousDate).length,
    setorNaoInformado: allRecords.filter((r) => r.setor === 'Não informado').length,
    motivoNaoInformado: allRecords.filter((r) => r.motivo === 'Não informado').length,
    aprovadorVazio: allRecords.filter((r) => !r.aprovador).length,
  };
}

/** Ex.: "jan/2026 – abr/2026" — calculado a partir das datas reais dos registros
 * (ignora datas sinalizadas como suspeitas, ex.: o typo de ano em JANEIRO.csv,
 * pra não distorcer o período mostrado no cabeçalho). */
function dateRangeLabel(records) {
  const dates = records.filter((r) => !r.suspiciousDate).map((r) => r.dateObj).filter(Boolean);
  if (dates.length === 0) return '';
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  const fmt = (d) => `${MESES_ABREV_ANO[d.getMonth()]}/${d.getFullYear()}`;
  const a = fmt(min), b = fmt(max);
  return a === b ? a : `${a} – ${b}`;
}

// ---------------------------------------------------- Detecção de anomalias
//
// Heurísticas simples e explicáveis (nada de estatística pesada) sobre o
// recorte já filtrado — cada uma vira uma lista de "sinais de atenção" no
// card de anomalias. São indícios pra olhar com calma, não acusação: um
// colaborador pode ter 4 tentativas no mesmo dia por um motivo legítimo,
// um setor pode crescer por sazonalidade, etc.

/** Colaborador (matrícula, ou nome quando sem matrícula) liberado em muitos
 * dias DISTINTOS dentro do mesmo mês — uso recorrente/habitual do cartão
 * mestre. Deliberadamente não é "várias vezes no mesmo dia": isso costuma
 * ser só reincidência de tentativa (ex.: esqueceu o crachá, tentou de novo),
 * enquanto muitos dias diferentes no mês é o padrão que vale olhar. */
function anomaliasFrequenciaMensal(records, minDiasDistintos = 8, limit = 12) {
  const m = new Map();
  for (const r of records) {
    if (!r.data || !r.mes) continue;
    const key = `${r.matricula || 'SEMMAT:' + r.nomeDisplay}|${r.mes}`;
    if (!m.has(key)) {
      m.set(key, { matricula: r.matricula, nome: r.nomeDisplay, naoCadastrado: r.naoCadastrado, mes: r.mes, dias: new Set(), count: 0, motivos: new Set() });
    }
    const e = m.get(key);
    e.dias.add(r.data);
    e.count++;
    e.motivos.add(r.motivo);
  }
  return [...m.values()]
    .map((e) => ({ ...e, diasDistintos: e.dias.size }))
    .filter((e) => e.diasDistintos >= minDiasDistintos)
    .sort((a, b) => b.diasDistintos - a.diasDistintos)
    .slice(0, limit);
}

/** Mês em que um setor teve um salto muito acima da própria média nos outros
 * meses do período — pico súbito, não apenas "o setor que mais usa". */
function anomaliasPicoSetor(records, { minEventos = 12, fatorMin = 1.6 } = {}, limit = 10) {
  const bySetor = new Map();
  for (const r of records) {
    if (!bySetor.has(r.setor)) bySetor.set(r.setor, new Map());
    const byMes = bySetor.get(r.setor);
    byMes.set(r.mes, (byMes.get(r.mes) || 0) + 1);
  }

  const out = [];
  for (const [setor, byMes] of bySetor) {
    const mesesComDados = MESES_ORDEM.filter((mes) => byMes.has(mes));
    if (mesesComDados.length < 2) continue; // sem outros meses pra comparar
    for (const mes of mesesComDados) {
      const count = byMes.get(mes);
      if (count < minEventos) continue;
      const outros = mesesComDados.filter((m) => m !== mes).map((m) => byMes.get(m));
      const media = outros.reduce((s, v) => s + v, 0) / outros.length;
      if (media <= 0) continue;
      const fator = count / media;
      if (fator >= fatorMin) {
        out.push({ setor, mes, count, media: Math.round(media * 10) / 10, fator: Math.round(fator * 10) / 10 });
      }
    }
  }
  return out.sort((a, b) => b.fator - a.fator).slice(0, limit);
}

/** Aprovadores com volume suficiente pra ter um padrão claro de setor, mas
 * que também aprovaram um número relevante de eventos fora desse padrão.
 * (Só olha setor — a versão por faixa de horário foi removida a pedido:
 * não é um dado útil no momento.) */
function anomaliasPadraoAprovador(records, { minVolume = 20, domMin = 0.65, minExcecoes = 3 } = {}, limit = 10) {
  const byAprovador = new Map();
  for (const r of records) {
    if (!r.aprovador) continue;
    if (!byAprovador.has(r.aprovador)) byAprovador.set(r.aprovador, []);
    byAprovador.get(r.aprovador).push(r);
  }

  const out = [];
  for (const [aprovador, evs] of byAprovador) {
    if (evs.length < minVolume) continue;

    const setorRanked = countBy(evs, 'setor');
    const [domSetor, domSetorCount] = setorRanked[0];
    const domSetorPct = domSetorCount / evs.length;
    const setorExcecoes = domSetorPct >= domMin ? evs.length - domSetorCount : 0;

    if (setorExcecoes >= minExcecoes) {
      out.push({
        aprovador,
        total: evs.length,
        domSetor,
        domSetorPct: Math.round(domSetorPct * 100),
        setorExcecoes,
      });
    }
  }
  return out.sort((a, b) => b.setorExcecoes - a.setorExcecoes).slice(0, limit);
}

/** Agrega as três heurísticas acima pro card de anomalias. */
function detectAnomalias(records) {
  const frequentes = anomaliasFrequenciaMensal(records);
  const picosSetor = anomaliasPicoSetor(records);
  const aprovadoresForaPadrao = anomaliasPadraoAprovador(records);
  return {
    frequentes,
    picosSetor,
    aprovadoresForaPadrao,
    total: frequentes.length + picosSetor.length + aprovadoresForaPadrao.length,
  };
}

function distinctSorted(records, field) {
  return [...new Set(records.map((r) => r[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
