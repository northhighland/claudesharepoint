"use client";

import type { QuotaDistributionBucket } from "@/lib/types";

interface DistributionChartProps {
  data: QuotaDistributionBucket[];
  isLoading: boolean;
}

export function DistributionChart({ data, isLoading }: DistributionChartProps): React.ReactElement {
  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-5">
        <h4 className="mb-4 text-sm font-medium">Quota Distribution</h4>
        <div className="h-48 animate-pulse rounded bg-muted/30" />
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="glass-card rounded-xl p-5">
      <h4 className="mb-4 text-sm font-medium">Quota Distribution</h4>
      <div className="flex items-end gap-2 h-48">
        {data.map((bucket) => {
          const heightPercent = (bucket.count / maxCount) * 100;
          return (
            <div key={bucket.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <span className="font-mono text-xs font-bold">{bucket.count}</span>
              <div
                className="w-full rounded-t-md bg-primary/60 hover:bg-primary/80 transition-colors min-h-[4px]"
                style={{ height: `${Math.max(heightPercent, 2)}%` }}
              />
              <span className="text-[10px] text-muted-foreground text-center leading-tight mt-1">
                {bucket.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
