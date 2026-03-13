"use client";

import { cn, formatBytes } from "@/lib/utils";
import type { QuotaStatus } from "@/lib/types";

interface QuotaHeatmapProps {
  sites: QuotaStatus[];
  isLoading: boolean;
}

function getHeatColor(percent: number): string {
  if (percent >= 95) return "bg-red-500 text-white";
  if (percent >= 85) return "bg-orange-400 text-white";
  if (percent >= 70) return "bg-yellow-400 text-yellow-950";
  return "bg-green-400 text-green-950";
}

function getHeatBorder(percent: number): string {
  if (percent >= 95) return "border-red-600";
  if (percent >= 85) return "border-orange-500";
  if (percent >= 70) return "border-yellow-500";
  return "border-green-500";
}

export function QuotaHeatmap({ sites, isLoading }: QuotaHeatmapProps): React.ReactElement {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">
          Quota Usage Heatmap
        </h3>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const sorted = [...sites].sort((a, b) => b.percentUsed - a.percentUsed);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Quota Usage Heatmap</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-green-400" />
            &lt;70%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-yellow-400" />
            70-85%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-orange-400" />
            85-95%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-red-500" />
            &gt;95%
          </span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No quota data available
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {sorted.map((site) => (
            <div
              key={site.rowKey}
              className={cn(
                "group relative flex flex-col items-center justify-center rounded-lg border p-2 text-center transition-transform hover:scale-105",
                getHeatColor(site.percentUsed),
                getHeatBorder(site.percentUsed)
              )}
              title={`${site.siteName}: ${site.percentUsed.toFixed(1)}% used (${formatBytes(site.usedBytes)} / ${formatBytes(site.quotaBytes)})`}
            >
              <span className="truncate text-[10px] font-medium leading-tight">
                {site.siteName.length > 10
                  ? `${site.siteName.substring(0, 10)}...`
                  : site.siteName}
              </span>
              <span className="text-xs font-bold">{Math.round(site.percentUsed)}%</span>

              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-48 -translate-x-1/2 rounded-lg border border-border bg-card p-2 text-xs text-foreground shadow-lg group-hover:block">
                <p className="font-medium">{site.siteName}</p>
                <p className="mt-1 text-muted-foreground">
                  {formatBytes(site.usedBytes)} / {formatBytes(site.quotaBytes)}
                </p>
                <p className="text-muted-foreground">{site.percentUsed.toFixed(1)}% used</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
