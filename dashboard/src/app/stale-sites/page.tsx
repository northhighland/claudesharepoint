"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Play,
  CheckCircle2,
  Activity,
  Moon,
  Archive,
  Trash2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { usePolling } from "@/hooks/use-polling";
import { fetchStaleSites, fetchJobs } from "@/lib/api";
import { formatBytes, formatDate, getStatusColor, cn } from "@/lib/utils";
import { SiteTable } from "@/components/stale-sites/site-table";
import { ImpactSummary } from "@/components/stale-sites/impact-summary";
import { ActiveJobBanner } from "@/components/jobs/active-job-banner";
import { JobDetail } from "@/components/jobs/job-detail";
import { TriggerModal } from "@/components/jobs/trigger-modal";
import { ExportButton } from "@/components/ui/export-button";
import { SiteSearch } from "@/components/ui/site-search";
import { DataFreshness } from "@/components/ui/data-freshness";
import { NextRunIndicator } from "@/components/ui/next-run-indicator";
import type { JobRun } from "@/lib/types";
import type { StaleSiteRecommendation } from "@/lib/types";

type CategoryFilter = "all" | "Active" | "Low Activity" | "Stale" | "Abandoned";
type FilterStatus = "all" | "Completed" | "Failed" | "Running" | "PartialComplete";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Normalize API categories to frontend categories */
function normalizeCategory(cat: string): StaleSiteRecommendation["category"] {
  const map: Record<string, StaleSiteRecommendation["category"]> = {
    Active: "Active",
    LowActivity: "Low Activity",
    "Low Activity": "Low Activity",
    Dormant: "Stale",
    Stale: "Stale",
    RecommendArchive: "Stale",
    RecommendDelete: "Abandoned",
    Abandoned: "Abandoned",
  };
  return map[cat] ?? (cat as StaleSiteRecommendation["category"]);
}

/** Client-side dedup safety net — keep first occurrence per siteUrl */
function dedupSites(sites: StaleSiteRecommendation[]): StaleSiteRecommendation[] {
  const map = new Map<string, StaleSiteRecommendation>();
  for (const site of sites) {
    const existing = map.get(site.siteUrl);
    if (!existing) {
      map.set(site.siteUrl, site);
    }
  }
  return Array.from(map.values());
}

/* Category card config */
const CATEGORY_CONFIG: Record<
  Exclude<CategoryFilter, "all">,
  { icon: React.ElementType; bg: string; text: string; border: string; label: string }
> = {
  Active: {
    icon: CheckCircle2,
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    label: "Active",
  },
  "Low Activity": {
    icon: Activity,
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/30",
    label: "Low Activity",
  },
  Stale: {
    icon: Moon,
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    label: "Stale",
  },
  Abandoned: {
    icon: Trash2,
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
    label: "Abandoned",
  },
};

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function StaleSitesPage(): React.ReactElement {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [selectedJob, setSelectedJob] = useState<JobRun | null>(null);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [siteSearch, setSiteSearch] = useState("");

  const { data: rawSites, isLoading, mutate: mutateSites } = usePolling("stale-sites", fetchStaleSites, 60000);
  const lastUpdated = rawSites ? new Date().toISOString() : undefined;

  const jobFetcher = useCallback(
    () => fetchJobs({ jobType: "StaleSiteDetector" }),
    []
  );
  // Dynamic polling: 5s when jobs are running, 60s otherwise
  const { data: jobs, isLoading: jobsLoading, mutate: mutateJobs } = usePolling(
    "stale-jobs",
    jobFetcher,
    (data) => (data ?? []).some((j) => j.status === "Running") ? 5000 : 60000
  );

  // Normalize categories from API and dedup
  const allSites = useMemo(() => {
    const raw = rawSites ?? [];
    const normalized = raw.map((s) => ({
      ...s,
      category: normalizeCategory(s.category),
    }));
    return dedupSites(normalized);
  }, [rawSites]);

  const filtered =
    category === "all" ? allSites : allSites.filter((s) => s.category === category);

  // Search filter — applied after category filter
  const searchedSites = siteSearch
    ? filtered.filter(
        (s) =>
          s.siteName.toLowerCase().includes(siteSearch.toLowerCase()) ||
          s.siteUrl.toLowerCase().includes(siteSearch.toLowerCase())
      )
    : filtered;

  // Category counts & storage
  const categoryStats = useMemo(() => {
    const stats: Record<Exclude<CategoryFilter, "all">, { count: number; bytes: number }> = {
      Active: { count: 0, bytes: 0 },
      "Low Activity": { count: 0, bytes: 0 },
      Stale: { count: 0, bytes: 0 },
      Abandoned: { count: 0, bytes: 0 },
    };
    for (const s of allSites) {
      const key = s.category as Exclude<CategoryFilter, "all">;
      if (stats[key]) {
        stats[key].count++;
        stats[key].bytes += s.storageUsedBytes;
      }
    }
    return stats;
  }, [allSites]);

  // Storage at risk: Stale + Abandoned
  const staleSites = useMemo(() => {
    return allSites.filter((s) => s.category === "Stale" || s.category === "Abandoned");
  }, [allSites]);

  const storageAtRiskBytes = categoryStats.Stale.bytes + categoryStats.Abandoned.bytes;

  // Action progress
  const actionCounts = useMemo(() => {
    const counts = { Keep: 0, Archive: 0, Delete: 0, Pending: 0 };
    for (const s of allSites) {
      if (s.adminAction === "Keep") counts.Keep++;
      else if (s.adminAction === "Archive") counts.Archive++;
      else if (s.adminAction === "Delete") counts.Delete++;
      else counts.Pending++;
    }
    return counts;
  }, [allSites]);

  const totalActioned = actionCounts.Keep + actionCounts.Archive + actionCounts.Delete;

  const filteredJobs = (jobs ?? []).filter(
    (j) => statusFilter === "all" || j.status === statusFilter
  );

  if (selectedJob) {
    return <JobDetail job={selectedJob} onBack={() => setSelectedJob(null)} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Stale Sites</h1>
          <p className="text-sm text-muted-foreground">
            Identify and manage inactive SharePoint sites consuming storage
          </p>
          <div className="mt-1 flex items-center gap-3">
            <DataFreshness lastUpdated={lastUpdated} pollInterval={60000} />
            <NextRunIndicator jobType="StaleSiteDetector" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={allSites as unknown as Record<string, unknown>[]}
            filename="stale-sites"
            columns={[
              { key: "siteUrl", label: "Site URL" },
              { key: "siteName", label: "Site Name" },
              { key: "stalenessScore", label: "Score" },
              { key: "category", label: "Category" },
              { key: "lastActivityDate", label: "Last Activity" },
              { key: "storageUsedBytes", label: "Storage Used" },
              { key: "adminAction", label: "Admin Action" },
            ]}
          />
          <button
            onClick={() => setTriggerOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Play className="h-4 w-4" />
            Run Stale Site Detector
          </button>
        </div>
      </div>

      {/* Active job banner */}
      <ActiveJobBanner jobs={jobs ?? []} />

      {/* Storage at Risk Banner */}
      {staleSites.length > 0 && (
        <div className="glass-card rounded-xl p-5 animate-fade-in-up border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-red-500/5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-amber-400">
                  {formatBytes(storageAtRiskBytes)}
                </span>
                <span className="text-sm text-muted-foreground">
                  at risk across {staleSites.length} stale site{staleSites.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {categoryStats.Stale.count > 0 && (
                  <span>
                    <span className="font-medium text-amber-400">{categoryStats.Stale.count}</span> stale site{categoryStats.Stale.count !== 1 ? "s" : ""} ({formatBytes(categoryStats.Stale.bytes)})
                  </span>
                )}
                {categoryStats.Abandoned.count > 0 && (
                  <span>
                    <span className="font-medium text-red-400">{categoryStats.Abandoned.count}</span> site{categoryStats.Abandoned.count !== 1 ? "s" : ""} recommended for deletion ({formatBytes(categoryStats.Abandoned.bytes)})
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Risk Overview Cards (clickable category filters) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(CATEGORY_CONFIG) as Exclude<CategoryFilter, "all">[]).map((cat, i) => {
          const config = CATEGORY_CONFIG[cat];
          const stats = categoryStats[cat];
          const Icon = config.icon;
          const isSelected = category === cat;

          return (
            <button
              key={cat}
              onClick={() => setCategory(isSelected ? "all" : cat)}
              className={cn(
                "glass-card rounded-xl p-4 text-left transition-all hover:scale-[1.02]",
                `animate-fade-in-up`,
                isSelected && `border ${config.border} ring-1 ring-inset ring-white/5`
              )}
              style={{ animationDelay: `${i * 75}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", config.bg)}>
                  <Icon className={cn("h-4 w-4", config.text)} />
                </div>
                {isSelected && (
                  <span className={cn("text-[10px] uppercase tracking-wider font-medium", config.text)}>
                    Filtered
                  </span>
                )}
              </div>
              <p className="mt-3 font-mono text-2xl font-bold">
                {isLoading ? "--" : stats.count}
              </p>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{config.label}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {isLoading ? "--" : formatBytes(stats.bytes)}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Action Progress Tracker */}
      {allSites.length > 0 && (
        <div className="glass-card rounded-xl p-5 animate-fade-in-up">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h4 className="text-sm font-medium">Admin Action Progress</h4>
              <p className="text-xs text-muted-foreground">
                {totalActioned} of {allSites.length} sites actioned
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-3 w-full rounded-full bg-muted/30 overflow-hidden flex">
            {actionCounts.Keep > 0 && (
              <div
                className="h-full bg-emerald-500/70 transition-all"
                style={{ width: `${(actionCounts.Keep / allSites.length) * 100}%` }}
                title={`Keep: ${actionCounts.Keep}`}
              />
            )}
            {actionCounts.Archive > 0 && (
              <div
                className="h-full bg-amber-500/70 transition-all"
                style={{ width: `${(actionCounts.Archive / allSites.length) * 100}%` }}
                title={`Archive: ${actionCounts.Archive}`}
              />
            )}
            {actionCounts.Delete > 0 && (
              <div
                className="h-full bg-red-500/70 transition-all"
                style={{ width: `${(actionCounts.Delete / allSites.length) * 100}%` }}
                title={`Delete: ${actionCounts.Delete}`}
              />
            )}
          </div>

          {/* Breakdown */}
          <div className="mt-3 grid grid-cols-4 gap-4 text-center">
            <div>
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500/70 mr-1" />
              <span className="text-xs text-muted-foreground">Keep</span>
              <p className="font-mono text-sm font-bold">{actionCounts.Keep}</p>
            </div>
            <div>
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500/70 mr-1" />
              <span className="text-xs text-muted-foreground">Archive</span>
              <p className="font-mono text-sm font-bold">{actionCounts.Archive}</p>
            </div>
            <div>
              <span className="inline-block h-2 w-2 rounded-full bg-red-500/70 mr-1" />
              <span className="text-xs text-muted-foreground">Delete</span>
              <p className="font-mono text-sm font-bold">{actionCounts.Delete}</p>
            </div>
            <div>
              <span className="inline-block h-2 w-2 rounded-full bg-muted mr-1" />
              <span className="text-xs text-muted-foreground">Pending</span>
              <p className="font-mono text-sm font-bold">{actionCounts.Pending}</p>
            </div>
          </div>
        </div>
      )}

      {/* Site search */}
      <SiteSearch
        value={siteSearch}
        onChange={setSiteSearch}
        resultCount={siteSearch ? searchedSites.length : undefined}
        totalCount={siteSearch ? filtered.length : undefined}
      />

      {/* Impact Summary with cost estimates */}
      <ImpactSummary sites={searchedSites} />

      {/* Site Table */}
      <SiteTable
        sites={searchedSites}
        isLoading={isLoading}
        onActionComplete={() => mutateSites()}
      />

      {/* Recent Detection Runs */}
      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Recent Detection Runs</h2>

        {/* Status filter */}
        <div className="flex gap-2">
          {(["all", "Completed", "Running", "Failed", "PartialComplete"] as FilterStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                statusFilter === status
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {status === "all" ? "All" : status === "PartialComplete" ? "Partial" : status}
            </button>
          ))}
        </div>

        {/* Run history table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {jobsLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Run ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Started
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Sites
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Space Reclaimed
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Triggered By
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredJobs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                      >
                        No stale site detection runs found
                      </td>
                    </tr>
                  ) : (
                    filteredJobs.map((job) => (
                      <tr
                        key={job.runId}
                        onClick={() => setSelectedJob(job)}
                        className="cursor-pointer transition-colors hover:bg-accent/50"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-xs">
                          {job.runId.substring(0, 8)}...
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              getStatusColor(job.status)
                            )}
                          >
                            {job.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                          {formatDate(job.startedAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <span>{job.processedSites}</span>
                          {job.failedSites > 0 && (
                            <span className="ml-1 text-red-600">({job.failedSites} failed)</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">
                          {formatBytes(job.totalSpaceReclaimedBytes)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                          {job.triggeredBy}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <TriggerModal
        jobType="StaleSiteDetector"
        isOpen={triggerOpen}
        onClose={() => setTriggerOpen(false)}
        onTriggered={() => mutateJobs()}
      />
    </div>
  );
}
