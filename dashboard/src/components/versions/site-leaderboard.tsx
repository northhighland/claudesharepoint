"use client";

import { useEffect, useState } from "react";
import { Trophy, HardDrive, FileStack } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { fetchJob } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import type { JobRun, VersionCleanupResult } from "@/lib/types";

interface SiteAggregate {
  siteUrl: string;
  siteName: string;
  totalReclaimedBytes: number;
  totalVersionsDeleted: number;
  runCount: number;
}

interface SiteLeaderboardProps {
  jobs: JobRun[];
}

const BAR_COLORS = [
  "#00c9b7", "#0ea5e9", "#8b5cf6", "#f59e0b",
  "#10b981", "#06b6d4", "#a78bfa", "#fbbf24",
  "#34d399", "#22d3ee",
];

export function SiteLeaderboard({ jobs }: SiteLeaderboardProps): React.ReactElement {
  const [siteData, setSiteData] = useState<SiteAggregate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadResults(): Promise<void> {
      const completedJobs = jobs
        .filter((j) => j.status === "Completed" || j.status === "PartialComplete")
        .slice(0, 20); // Limit to 20 most recent runs

      if (completedJobs.length === 0) {
        setIsLoading(false);
        return;
      }

      const aggregateMap = new Map<string, SiteAggregate>();

      const results = await Promise.allSettled(
        completedJobs.map((j) => fetchJob(j.runId))
      );

      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const siteResults = (result.value.results ?? []) as unknown as VersionCleanupResult[];
        for (const r of siteResults) {
          if (!r.siteUrl) continue;
          const existing = aggregateMap.get(r.siteUrl);
          if (existing) {
            existing.totalReclaimedBytes += r.spaceReclaimedBytes ?? 0;
            existing.totalVersionsDeleted += r.versionsDeleted ?? 0;
            existing.runCount += 1;
          } else {
            aggregateMap.set(r.siteUrl, {
              siteUrl: r.siteUrl,
              siteName: r.siteName || r.siteUrl.split("/").pop() || r.siteUrl,
              totalReclaimedBytes: r.spaceReclaimedBytes ?? 0,
              totalVersionsDeleted: r.versionsDeleted ?? 0,
              runCount: 1,
            });
          }
        }
      }

      if (!cancelled) {
        const sorted = Array.from(aggregateMap.values())
          .sort((a, b) => b.totalReclaimedBytes - a.totalReclaimedBytes)
          .slice(0, 10);
        setSiteData(sorted);
        setIsLoading(false);
      }
    }

    loadResults();
    return () => {
      cancelled = true;
    };
  }, [jobs]);

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold">Top Sites by Space Reclaimed</h3>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (siteData.length === 0) {
    return (
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold">Top Sites by Space Reclaimed</h3>
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          No completed runs with site data yet
        </p>
      </div>
    );
  }

  const maxReclaimed = siteData[0]?.totalReclaimedBytes ?? 1;

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-semibold">Top 10 Sites by Space Reclaimed</h3>
      </div>

      {/* Bar chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={siteData.map((s) => ({
              name: s.siteName.length > 25 ? s.siteName.substring(0, 22) + "..." : s.siteName,
              reclaimedGB: s.totalReclaimedBytes / (1024 * 1024 * 1024),
              fullName: s.siteName,
              versionsDeleted: s.totalVersionsDeleted,
              reclaimedBytes: s.totalReclaimedBytes,
            }))}
            layout="vertical"
            margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }}
              tickFormatter={(v: number) => `${v.toFixed(1)} GB`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={160}
              tick={{ fill: "hsl(210 20% 92%)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }: { active?: boolean; payload?: Array<{ payload?: Record<string, unknown> }> }) => {
                if (!active || !payload || payload.length === 0) return null;
                const d = payload[0]?.payload as { fullName?: string; reclaimedBytes?: number; versionsDeleted?: number } | undefined;
                if (!d) return null;
                return (
                  <div
                    style={{
                      background: "rgba(15, 25, 50, 0.95)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      color: "hsl(210 20% 92%)",
                      fontSize: "12px",
                      padding: "8px 12px",
                    }}
                  >
                    <p className="font-medium text-sm">{d.fullName}</p>
                    <p className="text-muted-foreground">
                      {formatBytes(d.reclaimedBytes ?? 0)} | {(d.versionsDeleted ?? 0).toLocaleString()} versions
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="reclaimedGB" radius={[0, 4, 4, 0]} barSize={20}>
              {siteData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend list */}
      <div className="space-y-2">
        {siteData.map((site, i) => (
          <div
            key={site.siteUrl}
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: BAR_COLORS[i % BAR_COLORS.length] }}
              />
              <span className="truncate text-muted-foreground" title={site.siteUrl}>
                {site.siteName}
              </span>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <FileStack className="h-3 w-3" />
                {site.totalVersionsDeleted.toLocaleString()}
              </span>
              <span className="flex items-center gap-1 font-mono text-xs font-medium text-emerald-400">
                <HardDrive className="h-3 w-3" />
                {formatBytes(site.totalReclaimedBytes)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
