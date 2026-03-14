"use client";

import { HardDrive, Play, Globe, Archive } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import type { DashboardOverview } from "@/lib/types";

interface StatsCardsProps {
  overview: DashboardOverview | undefined;
  isLoading: boolean;
}

interface StatCardProps {
  label: string;
  value: string;
  trend: number;
  icon: React.ReactNode;
  isLoading: boolean;
}

function StatCard({ label, value, trend, icon, isLoading }: StatCardProps): React.ReactElement {
  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#141414] p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
          {label}
        </p>
        <div className="text-emerald-400">{icon}</div>
      </div>
      <div className="mt-3">
        {isLoading ? (
          <div className="h-9 w-28 animate-pulse rounded bg-[#1A1A1A]" />
        ) : (
          <p className="text-3xl font-semibold tracking-tight text-[#F9FAFB]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {value}
          </p>
        )}
      </div>
      <div className="mt-2">
        {isLoading ? (
          <div className="h-3 w-16 animate-pulse rounded bg-[#1A1A1A]" />
        ) : (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                trend >= 0 ? "bg-emerald-400" : "bg-red-400"
              }`}
            />
            <span className={trend >= 0 ? "text-emerald-400" : "text-red-400"}>
              {trend >= 0 ? "+" : ""}
              {trend.toFixed(1)}%
            </span>
            <span className="text-[#6B7280]">vs last period</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function StatsCards({ overview, isLoading }: StatsCardsProps): React.ReactElement {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Storage Reclaimed"
        value={overview ? formatBytes(overview.totalStorageReclaimedBytes) : "0 B"}
        trend={overview?.storageReclaimedTrendPercent ?? 0}
        icon={<HardDrive className="h-4 w-4" />}
        isLoading={isLoading}
      />
      <StatCard
        label="Active Jobs"
        value={String(overview?.activeJobs ?? 0)}
        trend={overview?.activeJobsTrendPercent ?? 0}
        icon={<Play className="h-4 w-4" />}
        isLoading={isLoading}
      />
      <StatCard
        label="Sites Monitored"
        value={overview?.sitesMonitored?.toLocaleString() ?? "0"}
        trend={overview?.sitesMonitoredTrendPercent ?? 0}
        icon={<Globe className="h-4 w-4" />}
        isLoading={isLoading}
      />
      <StatCard
        label="Stale Sites"
        value={String(overview?.staleSitesFound ?? 0)}
        trend={overview?.staleSitesTrendPercent ?? 0}
        icon={<Archive className="h-4 w-4" />}
        isLoading={isLoading}
      />
    </div>
  );
}
