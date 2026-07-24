import * as XLSX from "xlsx";

type Row = Record<string, unknown>;

function toCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function collectColumns(rows: Row[]): string[] {
  const set = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
  return [...set];
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCSV(rows: Row[], filename: string): void {
  const columns = collectColumns(rows);
  const header = columns.map(escapeCsv).join(",");
  const body = rows
    .map((r) => columns.map((c) => escapeCsv(toCell(r[c]))).join(","))
    .join("\n");
  // Excel 한글 깨짐 방지 위해 UTF-8 BOM 추가
  const csv = "\ufeff" + header + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerBrowserDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export function downloadXLSX(rows: Row[], filename: string, sheetName = "Sheet1"): void {
  const columns = collectColumns(rows);
  const normalized = rows.map((r) => {
    const out: Row = {};
    columns.forEach((c) => {
      const v = r[c];
      out[c] = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v;
    });
    return out;
  });
  const worksheet = XLSX.utils.json_to_sheet(normalized, { header: columns });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
