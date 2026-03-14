"use client";

import { cn, formatBytes } from "@/lib/utils";
import type { QuotaStatus } from "@/lib/types";

interface TopSitesListProps {
  title: string;
  sites: QuotaStatus[];
  metric: "percentUsed" | "usedBytes";
  limit?: number;
}

export function TopSitesList({ title, sites, metric, limit = 20 }: TopSitesListProps): React.ReactElement {
  const sorted = [...sites]
    .sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0))
    .slice(0, limit);

  return (
    <div className="glass-card rounded-xl p-5">
      <h4 className="mb-4 text-sm font-medium">{title}</h4>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data available</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((site, index) => {
            const displayValue = metric === "percentUsed"
              ? `${site.percentUsed.toFixed(1)}%`
              : formatBytes(site.usedBytes);
            const barPercent = metric === "percentUsed"
              ? site.percentUsed
              : (site.usedBytes / (sorted[0]?.usedBytes || 1)) * 100;
            const barColor = site.percentUsed >= 95
              ? "bg-red-500/60"
              : site.percentUsed >= 85
                ? "bg-orange-500/60"
                : site.percentUsed >= 70
                  ? "bg-amber-500/60"
                  : "bg-emerald-500/60";

            return (
              <div key={site.rowKey} className="group relative">
                {/* Background bar */}
                <div className="absolute inset-0 rounded-lg overflow-hidden">
                  <div
                    className={cn(barColor, "h-full transition-all")}
                    style={{ width: `${Math.min(barPercent, 100)}%` }}
                  />
                </div>
                {/* Content */}
                <div className="relative flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-muted-foreground w-5">
                      {index + 1}
                    </span>
                    <span className="text-sm truncate">{site.siteName}</span>
                  </div>
                  <span className="font-mono text-sm font-bold ml-2 shrink-0">
                    {displayValue}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
