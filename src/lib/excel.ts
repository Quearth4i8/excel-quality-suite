import * as XLSX from "xlsx";

export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Record<string, any>[];
  matrix: any[][];
}

export interface ParsedFile {
  name: string;
  sheets: ParsedSheet[];
  importedAt: string;
  uploadMode?: "spc" | "msa";
}

export async function parseExcelFile(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheets: ParsedSheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null }) as any[][];
    const headers = (matrix[0] ?? []).map((h, i) => {
      const header = h == null || h === "" ? `Col${i + 1}` : String(h).trim();
      return header;
    });
    const rows = matrix.slice(1).map((r) => {
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => (obj[h] = r?.[i] ?? null));
      return obj;
    });
    return { name, headers, rows, matrix };
  });
  return { name: file.name, sheets, importedAt: new Date().toISOString() };
}

export function toNumericMatrix(rows: Record<string, any>[], cols: string[]): number[][] {
  return rows
    .map((r) => cols.map((c) => Number(r[c])).filter((v) => !Number.isNaN(v)))
    .filter((r) => r.length === cols.length);
}

export function toNumericArray(rows: Record<string, any>[], col: string): number[] {
  return rows.map((r) => Number(r[col])).filter((v) => !Number.isNaN(v));
}

export function downloadCSV(filename: string, rows: any[][]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

export function downloadXLSX(filename: string, sheets: { name: string; rows: any[][] }[]) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((s) => {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
