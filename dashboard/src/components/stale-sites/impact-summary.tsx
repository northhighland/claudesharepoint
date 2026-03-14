"use client";

import { formatBytes } from "@/lib/utils";
import type { StaleSiteRecommendation } from "@/lib/types";

interface ImpactSummaryProps {
  sites: StaleSiteRecommendation[];
}

interface CategorySummary {
  category: string;
  count: number;
  totalBytes: number;
  color: string;
  barColor: string;
}

export function ImpactSummary({ sites }: ImpactSummaryProps): React.ReactElement {
  const categories: CategorySummary[] = [
    { category: "Active", count: 0, totalBytes: 0, color: "text-emerald-400", barColor: "bg-emerald-500/50" },
    { category: "Low Activity", count: 0, totalBytes: 0, color: "text-amber-400", barColor: "bg-amber-500/50" },
    { category: "Stale", count: 0, totalBytes: 0, color: "text-orange-400", barColor: "bg-orange-500/50" },
    { category: "Abandoned", count: 0, totalBytes: 0, color: "text-red-400", barColor: "bg-red-500/50" },
  ];

  for (const site of sites) {
    const cat = categories.find((c) => c.category === site.category);
    if (cat) {
      cat.count++;
      cat.totalBytes += site.storageUsedBytes;
    }
  }

  const totalBytes = sites.reduce((sum, s) => sum + s.storageUsedBytes, 0);
  const maxBytes = Math.max(...categories.map((c) => c.totalBytes), 1);

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in-up">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium">Storage Impact by Category</h4>
        <span className="font-mono text-sm text-muted-foreground">
          Total: {formatBytes(totalBytes)}
        </span>
      </div>
      <div className="space-y-3">
        {categories.map((cat) => (
          <div key={cat.category} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className={cat.color}>
                {cat.category} <span className="text-muted-foreground">({cat.count} sites)</span>
              </span>
              <span className="font-mono font-bold">{formatBytes(cat.totalBytes)}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
              <div
                className={`h-full rounded-full ${cat.barColor} transition-all`}
                style={{ width: `${(cat.totalBytes / maxBytes) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
