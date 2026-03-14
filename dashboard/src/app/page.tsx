"use client";

import { usePolling } from "@/hooks/use-polling";
import { fetchOverview } from "@/lib/api";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { StorageTrendChart } from "@/components/dashboard/storage-trend-chart";
import { ActiveJobs } from "@/components/dashboard/active-jobs";

export default function OverviewPage(): React.ReactElement {
  const { data: overview, isLoading } = usePolling("overview", fetchOverview, 30000);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">DASHBOARD</p>
        <h1 className="text-xl font-semibold tracking-tight text-[#F9FAFB]">Overview</h1>
      </div>

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
