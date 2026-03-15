"use client";

import { useCallback, useState } from "react";
import { usePolling } from "@/hooks/use-polling";
import { fetchOverview } from "@/lib/api";
import { TimeRangeToggle } from "@/components/dashboard/time-range-toggle";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { StorageTrendChart } from "@/components/dashboard/storage-trend-chart";
import { TenantHealthGauge } from "@/components/dashboard/tenant-health-gauge";
import { RiskIndicators } from "@/components/dashboard/risk-indicators";
import { JobActivityFeed } from "@/components/dashboard/job-activity-feed";
import { ErrorBanner } from "@/components/ui/error-banner";
import type { TimeRange } from "@/lib/types";

export default function OverviewPage(): React.ReactElement {
  const [range, setRange] = useState<TimeRange>("all");
  const [apiError, setApiError] = useState<string | null>(null);
  const { data: overview, isLoading } = usePolling(
    `overview-${range}`,
    () =>
      fetchOverview(range).catch((err) => {
        setApiError(
          "API connection failed: " +
            (err instanceof Error ? err.message : String(err)) +
            ". Check Function App status."
        );
        return undefined as never;
      }),
    30000
  );

  const dismissError = useCallback(() => setApiError(null), []);

  return (
    <div className="space-y-8">
      {apiError && (
        <ErrorBanner
          message={apiError}
          details="The dashboard API may be unreachable. Verify that the linked Function App (func-csp-nh) is running and that your network can reach the API endpoint."
          onDismiss={dismissError}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Impact Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Automated storage management for 7,160+ SharePoint sites
          </p>
        </div>
        <TimeRangeToggle value={range} onChange={setRange} />
      </div>

      {/* Impact KPI Cards */}
      <StatsCards overview={overview} isLoading={isLoading} />

      {/* Health Gauge + Risk Indicators */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TenantHealthGauge
            score={overview?.tenantHealthScore ?? 0}
            quotaHealth={overview?.quotaHealthPercent ?? 0}
            stalenessHealth={overview?.stalenessHealthPercent ?? 0}
            jobSuccess={overview?.jobSuccessPercent ?? 0}
            isLoading={isLoading}
          />
        </div>
        <div>
          <RiskIndicators overview={overview} isLoading={isLoading} />
        </div>
      </div>

      {/* Storage Trend Chart */}
      <StorageTrendChart data={overview?.storageTrend} isLoading={isLoading} />

      {/* Job Activity Feed */}
      <JobActivityFeed jobs={overview?.recentJobs} isLoading={isLoading} />
    </div>
  );
}
