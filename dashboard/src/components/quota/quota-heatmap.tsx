"use client";

import { cn, formatBytes } from "@/lib/utils";
import type { QuotaStatus } from "@/lib/types";

interface QuotaHeatmapProps {
  sites: QuotaStatus[];
  isLoading: boolean;
}

function getHeatColor(percent: number): string {
  if (percent >= 95) return "bg-red-500/80 text-red-100";
  if (percent >= 85) return "bg-amber-500/60 text-amber-100";
  if (percent >= 70) return "bg-amber-500/30 text-amber-200";
  return "bg-emerald-500/20 text-emerald-200";
}

function getHeatBorder(percent: number): string {
  if (percent >= 95) return "border-red-500/40";
  if (percent >= 85) return "border-amber-500/30";
  if (percent >= 70) return "border-amber-500/20";
  return "border-emerald-500/20";
}

export function QuotaHeatmap({ sites, isLoading }: QuotaHeatmapProps): React.ReactElement {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#141414] p-6">
        <h3 className="mb-4 text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
          Quota Usage Heatmap
        </h3>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-[#1A1A1A]" />
          ))}
        </div>
      </div>
    );
  }

  const sorted = [...sites].sort((a, b) => b.percentUsed - a.percentUsed);

  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#141414] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Quota Usage Heatmap</h3>
        <div className="flex items-center gap-3 text-[11px] text-[#6B7280]">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-emerald-500/20" />
            &lt;70%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-amber-500/30" />
            70-85%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-amber-500/60" />
            85-95%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-red-500/80" />
            &gt;95%
          </span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-[13px] text-[#6B7280]">
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
              <span className="text-[11px] font-bold">{Math.round(site.percentUsed)}%</span>

              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-48 -translate-x-1/2 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A1A1A] p-2 text-[11px] text-[#F9FAFB] group-hover:block">
                <p className="font-medium">{site.siteName}</p>
                <p className="mt-1 text-[#6B7280]">
                  {formatBytes(site.usedBytes)} / {formatBytes(site.quotaBytes)}
                </p>
                <p className="text-[#6B7280]">{site.percentUsed.toFixed(1)}% used</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
