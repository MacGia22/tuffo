/**
 * A small RFC 4180 CSV reader: quoted fields, doubled quotes, commas and line breaks
 * inside quotes, CRLF or LF, and a byte-order mark. Also accepts semicolon- or
 * tab-separated files (detected from the header line). No dependency.
 */

export interface CsvTable {
  headers: string[];
  rows: string[][];
  /** The line in the file where each row starts (blank lines and quoted line breaks counted). */
  lines?: number[];
}

function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  const starts: number[] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  let line = 1;
  let start = 1;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        if (c === "\n" || (c === "\r" && text[i + 1] !== "\n")) line += 1;
        field += c;
      }
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === delimiter) {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      starts.push(start);
      record = [];
      field = "";
      line += 1;
      start = line;
    } else {
      field += c;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
    starts.push(start);
  }

  const nonEmpty = records
    .map((cells, i) => ({ cells, line: starts[i] }))
    .filter((r) => r.cells.some((cell) => cell.trim() !== ""));
  const [header, ...rows] = nonEmpty;
  return {
    headers: (header?.cells ?? []).map((h) => h.trim()),
    rows: rows.map((r) => r.cells.map((cell) => cell.trim())),
    lines: rows.map((r) => r.line),
  };
}
