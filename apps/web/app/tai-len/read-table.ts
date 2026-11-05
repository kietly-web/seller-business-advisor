import { readCsv, type Table } from '@sa/parsers';
import { read, utils } from 'xlsx';

// Dates stay Excel serial numbers (no cellDates), which the parsers read as Asia/Ho_Chi_Minh
export function readTable(name: string, bytes: ArrayBuffer): Table {
  if (/\.csv$/i.test(name)) {
    return readCsv(new TextDecoder('utf-8').decode(bytes));
  }
  const book = read(bytes, { type: 'array', dense: true });
  for (const sheetName of book.SheetNames) {
    const sheet = book.Sheets[sheetName];
    if (!sheet) continue;
    const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });
    if (rows.length > 0) {
      return rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))));
    }
  }
  return [];
}
