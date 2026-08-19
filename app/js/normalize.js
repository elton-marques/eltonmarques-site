/**
 * Normalização dos campos de texto livre dos logs (SETOR, MOTIVO,
 * RESPONSÁVEL PELA AUTORIZAÇÃO). Ver plano em
 * C:\Users\Elton\.claude\plans\ol-quero-que-voce-synthetic-quokka.md
 * para o racional de cada regra.
 *
 * Estratégia: normalizar caixa/espaços/traço sem descartar acentos
 * (preserva a grafia original para exibição), e só recorrer a um
 * dicionário de apelidos (accent-insensitive) para os casos de
 * abreviação/variação já conhecidos. Novas variações encontradas no
 * futuro só precisam de uma linha nova em SETOR_ALIASES.
 */

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Uppercase, unifica hífen/travessão, colapsa espaços, sem mexer em acentos. */
function baseKey(raw) {
  return (raw == null ? '' : String(raw))
    .trim()
    .toUpperCase()
    .replace(/–/g, '-')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ');
}

// chave: baseKey sem acento -> rótulo canônico (com acento) a exibir
const SETOR_ALIASES = new Map([
  ['MOVEIS', 'MÓVEIS E COZINHAS'],
  ['PISOS', 'PISOS E REVESTIMENTOS'],
  ['ELETRO', 'ELETRODOMÉSTICOS-ELETROPORTÁTEIS'],
  ['ACESSORIOS P/ BANHEIRO', 'ACESSÓRIOS PARA BANHEIRO'],
]);

const NAO_INFORMADO = 'Não informado';

function normalizeSetor(raw) {
  const bk = baseKey(raw);
  if (!bk || bk === '0') return NAO_INFORMADO;
  const stripped = stripAccents(bk);
  if (SETOR_ALIASES.has(stripped)) return SETOR_ALIASES.get(stripped);
  return bk;
}

function normalizeMotivo(raw) {
  let bk = baseKey(raw);
  if (!bk || bk === '0') return NAO_INFORMADO;
  // ARMÁRIO / ARMÁRIOS é o mesmo motivo (singular/plural)
  if (stripAccents(bk) === 'ARMARIOS') bk = 'ARMÁRIO';
  return bk;
}

/** Aprovador: só precisa unificar hífen/travessão e espaços — baseKey já
 * resolve. Vazio vira "Não informado" (mesmo padrão de setor/motivo) em vez
 * de sumir silenciosamente do ranking de gestores. */
function normalizeAprovador(raw) {
  const bk = baseKey(raw);
  return bk || NAO_INFORMADO;
}
