"use client";

import { useState } from "react";
import { usePolling } from "@/hooks/use-polling";
import { fetchOverview } from "@/lib/api";
import { HeroMetric } from "@/components/dashboard/hero-metric";
import { TimeRangeToggle } from "@/components/dashboard/time-range-toggle";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { StorageTrendChart } from "@/components/dashboard/storage-trend-chart";
import { ActiveJobs } from "@/components/dashboard/active-jobs";
import type { TimeRange } from "@/lib/types";

export default function OverviewPage(): React.ReactElement {
  const [range, setRange] = useState<TimeRange>("all");
  const { data: overview, isLoading } = usePolling(
    `overview-${range}`,
    () => fetchOverview(range),
    30000
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Impact Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Automated storage management for 7,160+ SharePoint sites
          </p>
        </div>
        <TimeRangeToggle value={range} onChange={setRange} />
      </div>

      <HeroMetric
        value={overview?.adminHoursSaved ?? 0}
        label="Admin Hours Saved"
        subtitle={`Processed ${(overview?.totalSitesProcessed ?? 0).toLocaleString()} sites — equivalent to ${Math.ceil((overview?.adminHoursSaved ?? 0) / 8)} person-days of manual work`}
        isLoading={isLoading}
      />

      <StatsCards overview={overview} isLoading={isLoading} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <StorageTrendChart data={overview?.storageTrend} isLoading={isLoading} />
        </div>
        <div>
          <ActiveJobs jobs={overview?.recentJobs} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
