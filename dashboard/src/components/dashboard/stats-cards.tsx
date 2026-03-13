"use client";

import { HardDrive, Play, Globe, Archive, TrendingUp, TrendingDown } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import type { DashboardOverview } from "@/lib/types";

interface StatsCardsProps {
  overview: DashboardOverview | undefined;
  isLoading: boolean;
}

interface StatCardProps {
  title: string;
  value: string;
  trend: number;
  icon: React.ReactNode;
  isLoading: boolean;
}

function StatCard({ title, value, trend, icon, isLoading }: StatCardProps): React.ReactElement {
  const isPositive = trend >= 0;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
      </div>
      <div className="mt-4">
        {isLoading ? (
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        ) : (
          <p className="text-2xl font-bold">{value}</p>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1 text-sm">
        {isLoading ? (
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        ) : (
          <>
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
            <span className={cn(isPositive ? "text-green-600" : "text-red-600")}>
              {isPositive ? "+" : ""}
              {trend.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">vs last period</span>
          </>
        )}
      </div>
    </div>
  );
}

export function StatsCards({ overview, isLoading }: StatsCardsProps): React.ReactElement {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Storage Reclaimed"
        value={overview ? formatBytes(overview.totalStorageReclaimedBytes) : "0 B"}
        trend={overview?.storageReclaimedTrendPercent ?? 0}
        icon={<HardDrive className="h-4 w-4" />}
        isLoading={isLoading}
      />
      <StatCard
        title="Active Jobs"
        value={String(overview?.activeJobs ?? 0)}
        trend={overview?.activeJobsTrendPercent ?? 0}
        icon={<Play className="h-4 w-4" />}
        isLoading={isLoading}
      />
      <StatCard
        title="Sites Monitored"
        value={overview?.sitesMonitored?.toLocaleString() ?? "0"}
        trend={overview?.sitesMonitoredTrendPercent ?? 0}
        icon={<Globe className="h-4 w-4" />}
        isLoading={isLoading}
      />
      <StatCard
        title="Stale Sites Found"
        value={String(overview?.staleSitesFound ?? 0)}
        trend={overview?.staleSitesTrendPercent ?? 0}
        icon={<Archive className="h-4 w-4" />}
        isLoading={isLoading}
      />
    </div>
  );
}
