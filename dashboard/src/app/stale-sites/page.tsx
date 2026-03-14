"use client";

import { useState, useCallback, useEffect } from "react";
import { Play } from "lucide-react";
import { usePolling } from "@/hooks/use-polling";
import { fetchStaleSites, fetchJobs, triggerJob } from "@/lib/api";
import { formatBytes, formatDate, getStatusColor, cn } from "@/lib/utils";
import { SiteTable } from "@/components/stale-sites/site-table";
import { ImpactSummary } from "@/components/stale-sites/impact-summary";
import { ActiveJobBanner } from "@/components/jobs/active-job-banner";
import { JobDetail } from "@/components/jobs/job-detail";
import type { JobRun } from "@/lib/types";
import type { StaleSiteRecommendation } from "@/lib/types";

type CategoryFilter = "all" | "Active" | "Low Activity" | "Stale" | "Abandoned";
type FilterStatus = "all" | "Completed" | "Failed" | "Running";

const CATEGORIES: CategoryFilter[] = ["all", "Active", "Low Activity", "Stale", "Abandoned"];

export default function StaleSitesPage(): React.ReactElement {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [selectedJob, setSelectedJob] = useState<JobRun | null>(null);
  const [triggering, setTriggering] = useState(false);

  const { data: sites, isLoading, mutate: mutateSites } = usePolling("stale-sites", fetchStaleSites, 60000);

  const [pollInterval, setPollInterval] = useState(60000);
  const jobFetcher = useCallback(
    () => fetchJobs({ jobType: "StaleSiteDetector" }),
    []
  );
  const { data: jobs, isLoading: jobsLoading, mutate: mutateJobs } = usePolling("stale-jobs", jobFetcher, pollInterval);

  // Dynamic polling: 5s when jobs are running, 60s otherwise
  useEffect(() => {
    const hasRunning = (jobs ?? []).some((j) => j.status === "Running");
    setPollInterval(hasRunning ? 5000 : 60000);
  }, [jobs]);

  const handleTrigger = async (): Promise<void> => {
    setTriggering(true);
    try {
      await triggerJob("StaleSiteDetector", false);
      mutateJobs();
    } catch {
      // Error handled by api client
    } finally {
      setTriggering(false);
    }
  };

  const allSites = sites ?? [];
  const filtered =
    category === "all" ? allSites : allSites.filter((s) => s.category === category);

  const counts: Record<CategoryFilter, number> = {
    all: allSites.length,
    Active: allSites.filter((s) => s.category === "Active").length,
    "Low Activity": allSites.filter((s) => s.category === "Low Activity").length,
    Stale: allSites.filter((s) => s.category === "Stale").length,
    Abandoned: allSites.filter((s) => s.category === "Abandoned").length,
  };

  const filteredJobs = (jobs ?? []).filter(
    (j) => statusFilter === "all" || j.status === statusFilter
  );

  if (selectedJob) {
    return <JobDetail job={selectedJob} onBack={() => setSelectedJob(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Stale Sites</h1>
          <p className="text-sm text-muted-foreground">
            These sites cost money but nobody uses them
          </p>
        </div>
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {triggering ? "Triggering..." : "Run Stale Site Detector"}
        </button>
      </div>

      {/* Active job banner */}
      <ActiveJobBanner jobs={jobs ?? []} />

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              category === cat
                ? "bg-primary/15 text-primary"
                : "bg-muted/50 text-muted-foreground hover:text-foreground"
            )}
          >
            {cat === "all" ? "All" : cat}
            <span className="ml-1.5 text-xs opacity-70">({counts[cat]})</span>
          </button>
        ))}
      </div>

      <ImpactSummary sites={allSites} />

      <SiteTable
        sites={filtered}
        isLoading={isLoading}
        onActionComplete={() => mutateSites()}
      />

      {/* Recent Detection Runs */}
      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Recent Detection Runs</h2>

        {/* Status filter */}
        <div className="flex gap-2">
          {(["all", "Completed", "Running", "Failed"] as FilterStatus[]).map((status) => (
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
              {status === "all" ? "All" : status}
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
    </div>
  );
}
