"use client";

import { ArrowRight } from "lucide-react";
import { formatBytes, formatDate } from "@/lib/utils";
import type { QuotaStatus } from "@/lib/types";

interface QuotaHistoryProps {
  sites: QuotaStatus[];
  isLoading: boolean;
}

export function QuotaHistory({ sites, isLoading }: QuotaHistoryProps): React.ReactElement {
  const increased = sites
    .filter((s) => s.autoIncreased && s.increasedAt)
    .sort((a, b) => new Date(b.increasedAt!).getTime() - new Date(a.increasedAt!).getTime());

  if (isLoading) {
    return (
      <div className="glass-card overflow-hidden rounded-xl">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium">Auto-Increase History</h3>
        </div>
        <div className="space-y-2 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden rounded-xl">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">Auto-Increase History</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Site
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Previous Quota
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                New Quota
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {increased.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No auto-increases recorded
                </td>
              </tr>
            ) : (
              increased.map((site) => (
                <tr key={`${site.rowKey}-${site.increasedAt}`} className="hover:bg-accent/50">
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium">{site.siteName}</div>
                    <div className="text-xs text-muted-foreground">{site.siteUrl}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {site.previousQuotaBytes ? formatBytes(site.previousQuotaBytes) : "--"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      {site.previousQuotaBytes && (
                        <>
                          <span className="text-muted-foreground">
                            {formatBytes(site.previousQuotaBytes)}
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        </>
                      )}
                      <span className="font-medium text-emerald-400">
                        {site.newQuotaBytes ? formatBytes(site.newQuotaBytes) : "--"}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                    {site.increasedAt ? formatDate(site.increasedAt) : "--"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
