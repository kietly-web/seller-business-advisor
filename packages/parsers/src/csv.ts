export type Table = string[][];

export function readCsv(text: string): Table {
  const rows: Table = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '' && !closed) {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
      closed = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') {
        i++;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      closed = false;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const FORMULA_START = /^[=+\-@\t\r]/;

// Excel runs a cell starting with = + - @ as a formula; seller-facing templates must not
export function textCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

export function writeCsv(table: Table): string {
  return `${table.map((row) => row.map(quote).join(',')).join('\r\n')}\r\n`;
}

function quote(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}
