/**
 * Pure utility functions for exporting data as CSV or JSON files.
 * No Angular DI — all functions are standalone and side-effect free
 * (except downloadFile, which triggers a browser download).
 */

/**
 * Build an RFC-4180 CSV string with UTF-8 BOM.
 * - Wraps any field containing comma, double-quote, or newline in double-quotes
 * - Escapes internal double-quotes by doubling them
 * - Prepends \uFEFF so Excel auto-detects UTF-8 on Windows (critical for
 *   non-ASCII characters — without it Excel defaults to the system locale)
 */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const BOM = '\uFEFF';
  const lines = [
    headers.map(escapeCsvField).join(','),
    ...rows.map(row => row.map(escapeCsvField).join(',')),
  ];
  return BOM + lines.join('\r\n') + '\r\n';
}

/**
 * Escape a single CSV field per RFC 4180: wrap in double-quotes if the value
 * contains a comma, double-quote, or newline; double any internal quotes.
 */
export function escapeCsvField(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Trigger a browser download via Blob + createObjectURL.
 * Works in all modern browsers; no server round-trip required.
 */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Build a download filename: slugified scenario name + ISO date + suffix.
 * Example: "smooth-income-target_2026-07-12.csv"
 */
export function exportFilename(scenarioName: string, suffix: string): string {
  const slug = scenarioName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `${slug}_${date}.${suffix}`;
}
