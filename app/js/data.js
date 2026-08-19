/**
 * Carregamento e limpeza (ETL) dos CSVs em dados/csv/.
 * Ver plano: C:\Users\Elton\.claude\plans\ol-quero-que-voce-synthetic-quokka.md
 */

// Para adicionar um novo mês: solte o CSV em dados/csv/ e acrescente UMA
// linha aqui (nessa ordem cronológica). O resto do dashboard (filtro de
// período, tendência mensal, KPIs, etc.) se ajusta sozinho — não precisa
// tocar em mais nenhum arquivo.
const MONTHLY_FILES = [
  { path: '../dados/csv/JANEIRO.csv', mes: 'Janeiro' },
  { path: '../dados/csv/FEVEVEIRO.csv', mes: 'Fevereiro' }, // nome do arquivo-fonte tem esse typo
  { path: '../dados/csv/MARÇO.csv', mes: 'Março' },
  { path: '../dados/csv/ABRIL.csv', mes: 'Abril' },
];
const COLABORADORES_PATH = '../dados/csv/COLABORADORES.csv';
const GESTORES_PATH = '../dados/csv/GESTORES.csv';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const HORA_RE = /^(\d{2}):(\d{2})/;

async function fetchText(path) {
  const res = await fetch(encodeURI(path));
  if (!res.ok) {
    throw new Error(`Falha ao carregar ${path} (HTTP ${res.status}). Confira o README para rodar via servidor local.`);
  }
  return res.text();
}

function parseDateBR(d) {
  const m = DATE_RE.exec(d);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

async function loadMonthlyEvents(path, mes) {
  const text = await fetchText(path);
  const rows = parseCSV(text);
  // Só nos interessam linhas cuja primeira coluna é uma data dd/mm/aaaa —
  // isso já descarta banner, cabeçalho, linhas em branco e o rodapé fixo
  // "FOR.PRP.0017..." presentes em todos os arquivos mensais.
  return rows
    .filter((r) => DATE_RE.test((r[0] || '').trim()))
    .map((r) => ({
      mes,
      data: (r[0] || '').trim(),
      hora: (r[1] || '').trim(),
      matricula: (r[2] || '').trim(),
      nome: (r[3] || '').trim(),
      setorRaw: (r[4] || '').trim(),
      funcaoRaw: (r[5] || '').trim(),
      motivoRaw: (r[6] || '').trim(),
      aprovadorRaw: (r[7] || '').trim(),
    }));
}

async function loadColaboradores() {
  const text = await fetchText(COLABORADORES_PATH);
  const rows = parseCSV(text);
  const map = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const mat = (r[0] || '').trim();
    if (!mat) continue;
    map.set(mat, {
      nome: (r[1] || '').trim(),
      funcao: (r[2] || '').trim(),
      setor: (r[3] || '').trim(),
    });
  }
  return map;
}

async function loadGestoresSet() {
  const text = await fetchText(GESTORES_PATH);
  const rows = parseCSV(text);
  const set = new Set();
  for (const r of rows) {
    const v = (r[0] || '').trim();
    if (!v) continue;
    const upper = v.toUpperCase();
    if (upper.includes('GESTORES') || upper.includes('AUTORIZADOS')) continue; // cabeçalho
    set.add(normalizeAprovador(v));
  }
  return set;
}

/**
 * Junta os 4 meses, remove duplicatas exatas, faz o join com
 * COLABORADORES/GESTORES e calcula todas as flags de qualidade usadas
 * pelo dashboard. Não filtra nada por padrão — quem decide o que
 * mostrar são os filtros da UI (ver aggregate.js).
 */
function buildDataset(monthlyEventArrays, colaboradoresMap, gestoresSet) {
  const seen = new Set();
  let duplicatesRemoved = 0;
  const records = [];

  for (const ev of monthlyEventArrays.flat()) {
    const dupKey = [ev.data, ev.hora, ev.matricula, ev.nome, ev.setorRaw, ev.funcaoRaw, ev.motivoRaw, ev.aprovadorRaw].join('|');
    if (seen.has(dupKey)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(dupKey);

    const dateObj = parseDateBR(ev.data);
    const suspiciousDate = !!dateObj && dateObj.getFullYear() < 2020;
    const horaMatch = HORA_RE.exec(ev.hora);
    const hour = horaMatch ? Number(horaMatch[1]) : null;
    const minute = horaMatch ? Number(horaMatch[2]) : null;
    // minutos desde 00:00 — usado pelas faixas de horário (HORA_BANDS em
    // aggregate.js), que precisam de precisão de minuto pra bater com o
    // expediente real (abre 8h/fecha 20h, colaboradores de 7h40 a 20h20).
    const minutesOfDay = hour != null && minute != null ? hour * 60 + minute : null;
    const horaAusente = !horaMatch;

    const colInfo = ev.matricula ? colaboradoresMap.get(ev.matricula) : null;
    const naoCadastrado = !colInfo; // inclui matrícula vazia e matrícula não encontrada

    const setor = normalizeSetor(ev.setorRaw || (colInfo && colInfo.setor) || '');
    const motivo = normalizeMotivo(ev.motivoRaw);
    const aprovador = normalizeAprovador(ev.aprovadorRaw);
    // "Não informado" (matrícula sem aprovador no CSV) não é um gestor
    // irregular — é falta de dado, não alguém de fora de GESTORES.csv.
    const aprovadorNaoAutorizado = !!aprovador && aprovador !== NAO_INFORMADO && !gestoresSet.has(aprovador);

    records.push({
      ...ev,
      dateObj,
      weekday: dateObj ? WEEKDAYS[dateObj.getDay()] : null,
      hour,
      minutesOfDay,
      horaAusente,
      suspiciousDate,
      setor,
      motivo,
      aprovador,
      aprovadorNaoAutorizado,
      naoCadastrado,
      nomeDisplay: ev.nome || (colInfo && colInfo.nome) || '(sem nome)',
    });
  }

  return { records, duplicatesRemoved };
}

async function loadAll() {
  const [monthlyArrays, colaboradoresMap, gestoresSet] = await Promise.all([
    Promise.all(MONTHLY_FILES.map((f) => loadMonthlyEvents(f.path, f.mes))),
    loadColaboradores(),
    loadGestoresSet(),
  ]);

  const { records, duplicatesRemoved } = buildDataset(monthlyArrays, colaboradoresMap, gestoresSet);

  return { records, duplicatesRemoved, colaboradoresMap, gestoresSet };
}
