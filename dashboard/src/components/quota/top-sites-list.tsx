"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ArrowUpCircle } from "lucide-react";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import type { QuotaStatus } from "@/lib/types";

interface TopSitesListProps {
  title: string;
  sites: QuotaStatus[];
  metric: "percentUsed" | "usedBytes";
  limit?: number;
}

function getSeverityColor(percent: number): {
  bar: string;
  rank: string;
  text: string;
} {
  if (percent >= 95) return { bar: "bg-red-500/60", rank: "bg-red-500/20 text-red-400", text: "text-red-400" };
  if (percent >= 85) return { bar: "bg-orange-500/60", rank: "bg-orange-500/20 text-orange-400", text: "text-orange-400" };
  if (percent >= 70) return { bar: "bg-amber-500/60", rank: "bg-amber-500/20 text-amber-400", text: "text-amber-400" };
  return { bar: "bg-emerald-500/60", rank: "bg-emerald-500/20 text-emerald-400", text: "text-emerald-400" };
}

export function TopSitesList({ title, sites, metric, limit = 20 }: TopSitesListProps): React.ReactElement {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Deduplicate by siteUrl (safety net)
  const deduped = Array.from(
    sites.reduce((map, site) => {
      if (!map.has(site.siteUrl)) map.set(site.siteUrl, site);
      return map;
    }, new Map<string, QuotaStatus>()).values()
  );

  const sorted = [...deduped]
    .sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0))
    .slice(0, limit);

  return (
    <div className="glass-card rounded-xl p-5">
      <h4 className="mb-4 text-sm font-medium">{title}</h4>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data available</p>
      ) : (
        <div className="space-y-1">
          {sorted.map((site, index) => {
            const displayValue = metric === "percentUsed"
              ? `${site.percentUsed.toFixed(1)}%`
              : formatBytes(site.usedBytes);
            const barPercent = metric === "percentUsed"
              ? site.percentUsed
              : (site.usedBytes / (sorted[0]?.usedBytes || 1)) * 100;
            const severity = getSeverityColor(site.percentUsed);
            const isExpanded = expandedIndex === index;

            return (
              <div key={site.siteUrl} className="group">
                {/* Main row */}
                <button
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                  className="relative w-full text-left rounded-lg transition-colors hover:bg-accent/30"
                >
                  {/* Background bar */}
                  <div className="absolute inset-0 rounded-lg overflow-hidden">
                    <div
                      className={cn(severity.bar, "h-full transition-all duration-500")}
                      style={{ width: `${Math.min(barPercent, 100)}%` }}
                    />
                  </div>
                  {/* Content */}
                  <div className="relative flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded font-mono text-[10px] font-bold shrink-0",
                          severity.rank
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="text-sm truncate">{site.siteName}</span>
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                    <span className={cn("font-mono text-sm font-bold ml-2 shrink-0", severity.text)}>
                      {displayValue}
                    </span>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="ml-7 mr-3 mt-1 mb-2 rounded-lg bg-muted/30 p-3 text-xs space-y-1.5 animate-fade-in-up">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <div>
                        <span className="text-muted-foreground">Quota:</span>{" "}
                        <span className="font-mono font-medium">{formatBytes(site.quotaBytes)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Used:</span>{" "}
                        <span className="font-mono font-medium">{formatBytes(site.usedBytes)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">% Used:</span>{" "}
                        <span className={cn("font-mono font-medium", severity.text)}>
                          {site.percentUsed.toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Last Checked:</span>{" "}
                        <span className="font-mono font-medium">{formatDate(site.lastCheckedAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
                      <ArrowUpCircle className={cn("h-3.5 w-3.5", site.autoIncreased ? "text-sky-400" : "text-muted-foreground/40")} />
                      <span className={site.autoIncreased ? "text-sky-400 font-medium" : "text-muted-foreground"}>
                        {site.autoIncreased ? "Auto-increased" : "No auto-increase"}
                      </span>
                      {site.autoIncreased && site.previousQuotaBytes && site.newQuotaBytes && (
                        <span className="text-muted-foreground ml-1">
                          ({formatBytes(site.previousQuotaBytes)} &rarr; {formatBytes(site.newQuotaBytes)})
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
