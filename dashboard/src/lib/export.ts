/**
 * Client-side CSV generation and download utility.
 * Formats dates, bytes, and percentages for human readability.
 */

export function formatValueForCSV(value: unknown, key: string): string {
  if (value === null || value === undefined) return "";

  // Format byte values as human-readable
  if (key.toLowerCase().includes("bytes") && typeof value === "number") {
    const gb = value / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = value / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    return `${value} B`;
  }

  // Format percentages
  if (key.toLowerCase().includes("percent") && typeof value === "number") {
    return `${value.toFixed(1)}%`;
  }

  // Format dates
  if (key.toLowerCase().includes("date") || key.toLowerCase().includes("at")) {
    if (typeof value === "string" && value.includes("T")) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return d.toISOString().replace("T", " ").substring(0, 19);
      }
    }
  }

  // Format durations (ms)
  if (key.toLowerCase().includes("duration") && typeof value === "number") {
    const minutes = Math.round(value / 60000);
    if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    return `${minutes}m`;
  }

  // Escape strings for CSV
  let str = String(value);

  // CSV Formula Injection protection (OWASP):
  // Prefix dangerous characters that could trigger formula execution
  // in spreadsheet applications (Excel, Google Sheets, LibreOffice).
  // Characters: = + - @ TAB CR that start a cell value.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("'")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCSV(
  data: Record<string, unknown>[],
  columns?: { key: string; label: string }[]
): string {
  if (data.length === 0) return "";

  // Auto-detect columns if not provided
  const cols =
    columns ??
    Object.keys(data[0])
      .filter((k) => !["partitionKey", "rowKey"].includes(k))
      .map((k) => ({ key: k, label: k }));

  // Header row
  const header = cols.map((c) => c.label).join(",");

  // Data rows
  const rows = data.map((row) =>
    cols.map((c) => formatValueForCSV(row[c.key], c.key)).join(",")
  );

  return [header, ...rows].join("\n");
}

export function downloadCSV(
  data: Record<string, unknown>[],
  filename: string,
  columns?: { key: string; label: string }[]
): void {
  const csv = generateCSV(data, columns);
  if (!csv) return;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().substring(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
