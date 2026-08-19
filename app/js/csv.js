/**
 * Parser CSV mínimo (estilo RFC 4180): lida com campos entre aspas,
 * vírgulas e quebras de linha dentro de aspas, e aspas escapadas ("").
 * Necessário porque os cabeçalhos e o banner dos logs mensais têm
 * campos multi-linha (ex.: "RESPONSÁVEL\nPELA AUTORIZAÇÃO").
 *
 * Retorna um array de linhas, cada linha um array de strings (cru, sem trim).
 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // ignora; a quebra real é tratada no \n
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }

  // última linha, se o arquivo não terminar com quebra de linha
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
