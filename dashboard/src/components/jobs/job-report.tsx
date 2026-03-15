"use client";

import { useState } from "react";
import { FileText, Printer } from "lucide-react";
import { formatBytes, formatDate, formatDuration } from "@/lib/utils";
import type { JobRun } from "@/lib/types";

interface JobReportProps {
  job: JobRun;
  results: Array<Record<string, unknown>>;
}

export function JobReportButton({
  job,
  results,
}: JobReportProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenReport = () => {
    setIsOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) {
    return (
      <button
        onClick={handleOpenReport}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <FileText className="h-3.5 w-3.5" />
        View Report
      </button>
    );
  }

  const succeeded = results.filter((r) => r.status === "Success").length;
  const failed = results.filter(
    (r) => r.status === "Error" || r.status === "Failed"
  ).length;
  const partial = results.filter((r) => r.status === "Partial").length;

  // Error breakdown
  const errorCounts = new Map<string, number>();
  for (const r of results) {
    if (r.errorCode) {
      const code = String(r.errorCode);
      errorCounts.set(code, (errorCounts.get(code) ?? 0) + 1);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white text-gray-900 shadow-2xl print:shadow-none print:max-h-none print:overflow-visible">
        {/* Non-print controls */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-3 print:hidden">
          <h3 className="font-semibold">Job Report</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Printer className="h-4 w-4" />
              Print / Save PDF
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
            >
              Close
            </button>
          </div>
        </div>

        {/* Report content */}
        <div className="p-8 space-y-6">
          {/* Header */}
          <div className="border-b pb-4">
            <h1 className="text-2xl font-bold text-gray-900">
              {job.jobType} — Run Report
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Run ID: {job.runId} | Generated: {new Date().toLocaleString()}
            </p>
          </div>

          {/* Summary */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Summary</h2>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b">
                  <td className="py-2 text-gray-500 w-40">Status</td>
                  <td className="py-2 font-medium">{job.status}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 text-gray-500">Started</td>
                  <td className="py-2">{formatDate(job.startedAt)}</td>
                </tr>
                {job.completedAt && (
                  <tr className="border-b">
                    <td className="py-2 text-gray-500">Completed</td>
                    <td className="py-2">{formatDate(job.completedAt)}</td>
                  </tr>
                )}
                {job.durationMs && (
                  <tr className="border-b">
                    <td className="py-2 text-gray-500">Duration</td>
                    <td className="py-2">{formatDuration(job.durationMs)}</td>
                  </tr>
                )}
                <tr className="border-b">
                  <td className="py-2 text-gray-500">Total Sites</td>
                  <td className="py-2">{job.totalSites}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 text-gray-500">Succeeded</td>
                  <td className="py-2 text-green-700">{succeeded}</td>
                </tr>
                {failed > 0 && (
                  <tr className="border-b">
                    <td className="py-2 text-gray-500">Failed</td>
                    <td className="py-2 text-red-700">{failed}</td>
                  </tr>
                )}
                {partial > 0 && (
                  <tr className="border-b">
                    <td className="py-2 text-gray-500">Partial</td>
                    <td className="py-2 text-amber-700">{partial}</td>
                  </tr>
                )}
                <tr className="border-b">
                  <td className="py-2 text-gray-500">Mode</td>
                  <td className="py-2">
                    {job.isDryRun ? "Dry Run" : "Live"}
                  </td>
                </tr>
                {job.totalSpaceReclaimedBytes > 0 && (
                  <tr className="border-b">
                    <td className="py-2 text-gray-500">Space Reclaimed</td>
                    <td className="py-2 font-medium">
                      {formatBytes(job.totalSpaceReclaimedBytes)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Error Breakdown */}
          {errorCounts.size > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Error Breakdown</h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2">
                    <th className="text-left py-2 text-gray-500">
                      Error Code
                    </th>
                    <th className="text-right py-2 text-gray-500">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(errorCounts.entries())
                    .sort(([, a], [, b]) => b - a)
                    .map(([code, count]) => (
                      <tr key={code} className="border-b">
                        <td className="py-2 font-mono text-xs">{code}</td>
                        <td className="py-2 text-right font-bold">{count}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Per-Site Results */}
          <div>
            <h2 className="text-lg font-semibold mb-3">
              Per-Site Results ({results.length})
            </h2>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2">
                  <th className="text-left py-2 text-gray-500">Site</th>
                  <th className="text-left py-2 text-gray-500">Status</th>
                  <th className="text-left py-2 text-gray-500">Error</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-1.5 truncate max-w-xs">
                      {String(r.siteName || r.siteUrl || r.SiteUrl || "")}
                    </td>
                    <td className="py-1.5">
                      <span
                        className={
                          String(r.status) === "Success"
                            ? "text-green-700"
                            : String(r.status) === "Error" ||
                                String(r.status) === "Failed"
                              ? "text-red-700"
                              : "text-amber-700"
                        }
                      >
                        {String(r.status ?? "")}
                      </span>
                    </td>
                    <td className="py-1.5 text-gray-500 truncate max-w-sm">
                      {r.errorCode ? `[${r.errorCode}] ` : ""}
                      {String(r.errorMessage ?? "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="border-t pt-4 text-xs text-gray-400">
            <p>
              claudesharepoint — North Highland SharePoint Storage Management
            </p>
            <p>Report generated {new Date().toISOString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
