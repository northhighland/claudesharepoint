"use client";

import { Download } from "lucide-react";
import { downloadCSV } from "@/lib/export";

interface ExportButtonProps {
  data: Record<string, unknown>[];
  filename: string;
  columns?: { key: string; label: string }[];
  label?: string;
}

export function ExportButton({
  data,
  filename,
  columns,
  label = "Export CSV",
}: ExportButtonProps): React.ReactElement {
  const handleExport = () => {
    downloadCSV(data, filename, columns);
  };

  return (
    <button
      onClick={handleExport}
      disabled={data.length === 0}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
