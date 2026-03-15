"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Trash2,
  CheckCircle2,
  XCircle,
  Play,
  Globe,
  Clock,
  Loader2,
  ChevronRight,
  TrendingUp,
  PackageX,
  HardDrive,
  Recycle,
} from "lucide-react";
import { usePolling } from "@/hooks/use-polling";
import { fetchJobs } from "@/lib/api";
import { formatBytes, formatDate, formatDuration, getStatusColor, cn } from "@/lib/utils";
import { JobDetail } from "@/components/jobs/job-detail";
import { TriggerModal } from "@/components/jobs/trigger-modal";
import { ExportButton } from "@/components/ui/export-button";
import { DataFreshness } from "@/components/ui/data-freshness";
import { NextRunIndicator } from "@/components/ui/next-run-indicator";
import type { JobRun } from "@/lib/types";

type FilterStatus = "all" | "Completed" | "Failed" | "Running" | "PartialComplete";

export default function RecycleBinPage(): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [selectedJob, setSelectedJob] = useState<JobRun | null>(null);
  const [triggerOpen, setTriggerOpen] = useState(false);

  const [pollInterval, setPollInterval] = useState(30000);
  const fetcher = useCallback(
    () => fetchJobs({ jobType: "RecycleBinCleaner" }),
    []
  );
  const { data: jobs, isLoading, mutate } = usePolling("recycle-bin-jobs", fetcher, pollInterval);
  const lastUpdated = jobs ? new Date().toISOString() : undefined;

  // Dynamic polling: 5s when jobs are running, 30s otherwise
  useEffect(() => {
    const hasRunning = (jobs ?? []).some((j) => j.status === "Running");
    setPollInterval(hasRunning ? 5000 : 30000);
  }, [jobs]);

  const filtered = (jobs ?? []).filter(
    (j) => statusFilter === "all" || j.status === statusFilter
  );

  // Summary stats — cumulative across ALL runs
  const allJobs = jobs ?? [];
  const totalReclaimed = allJobs.reduce((sum, j) => sum + j.totalSpaceReclaimedBytes, 0);
  const completedCount = allJobs.filter((j) => j.status === "Completed").length;
  const totalSitesProcessed = allJobs.reduce((sum, j) => sum + j.processedSites, 0);
  const totalFailed = allJobs.reduce((sum, j) => sum + j.failedSites, 0);

  if (selectedJob) {
    return <JobDetail job={selectedJob} onBack={() => setSelectedJob(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recycle Bin</h1>
          <p className="text-sm text-muted-foreground">
            Recycle bin cleanup results across SharePoint sites
          </p>
          <div className="mt-1 flex items-center gap-3">
            <DataFreshness lastUpdated={lastUpdated} pollInterval={pollInterval} />
            <NextRunIndicator jobType="RecycleBinCleaner" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={(jobs ?? []) as unknown as Record<string, unknown>[]}
            filename="recycle-bin-runs"
            columns={[
              { key: "runId", label: "Run ID" },
              { key: "status", label: "Status" },
              { key: "startedAt", label: "Started" },
              { key: "totalSites", label: "Total Sites" },
              { key: "processedSites", label: "Processed" },
              { key: "failedSites", label: "Failed" },
              { key: "totalSpaceReclaimedBytes", label: "Space Reclaimed" },
            ]}
          />
          <button
            onClick={() => setTriggerOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Play className="h-4 w-4" />
            Run Recycle Bin Cleanup
          </button>
        </div>
      </div>

      {/* Cumulative Impact Banner */}
      <div className="glass-card animate-fade-in-up rounded-xl p-6">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-64 animate-pulse rounded bg-muted" />
            <div className="h-5 w-48 animate-pulse rounded bg-muted" />
          </div>
        ) : allJobs.length === 0 ? (
          <div className="text-center py-8">
            <Recycle className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-lg font-semibold text-muted-foreground">No cleanup runs yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
              Recycle bin items consume storage quota even after deletion. Run your first cleanup to reclaim that space across all SharePoint sites.
            </p>
            <button
              onClick={() => setTriggerOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Play className="h-4 w-4" />
              Start First Cleanup
            </button>
          </div>
        ) : (
          <>
            <div className="text-center">
              <p
                className="font-mono text-4xl font-bold text-emerald-400 sm:text-5xl"
                style={{ textShadow: "0 0 40px rgba(16, 185, 129, 0.3)" }}
              >
                {formatBytes(totalReclaimed)}
              </p>
              <p className="mt-1 text-base font-semibold tracking-wide">
                Total Reclaimed across {totalSitesProcessed.toLocaleString()} site cleanups
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span className="text-[10px] uppercase tracking-wider">Runs Completed</span>
                </div>
                <p className="mt-1 font-mono text-lg font-bold">{completedCount}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="text-[10px] uppercase tracking-wider">Sites Processed</span>
                </div>
                <p className="mt-1 font-mono text-lg font-bold">{totalSitesProcessed.toLocaleString()}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                  <XCircle className="h-3.5 w-3.5" />
                  <span className="text-[10px] uppercase tracking-wider">Failed Sites</span>
                </div>
                <p className="mt-1 font-mono text-lg font-bold text-red-400">{totalFailed.toLocaleString()}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="text-[10px] uppercase tracking-wider">Total Runs</span>
                </div>
                <p className="mt-1 font-mono text-lg font-bold">{allJobs.length}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Summary cards — visual, color-coded */}
      {!isLoading && allJobs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-card rounded-xl p-4 animate-fade-in-up">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-500/15 p-2">
                <HardDrive className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-xs text-muted-foreground">Space Reclaimed</p>
            </div>
            <p className="mt-2 text-xl font-bold text-emerald-400">
              {formatBytes(totalReclaimed)}
            </p>
          </div>
          <div className="glass-card rounded-xl p-4 animate-fade-in-up-delay-1">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-500/15 p-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-xs text-muted-foreground">Completed Runs</p>
            </div>
            <p className="mt-2 text-xl font-bold">{completedCount}</p>
          </div>
          <div className="glass-card rounded-xl p-4 animate-fade-in-up-delay-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-sky-500/15 p-2">
                <Globe className="h-4 w-4 text-sky-400" />
              </div>
              <p className="text-xs text-muted-foreground">Sites Processed</p>
            </div>
            <p className="mt-2 text-xl font-bold">{totalSitesProcessed.toLocaleString()}</p>
          </div>
          <div className="glass-card rounded-xl p-4 animate-fade-in-up-delay-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-red-500/15 p-2">
                <XCircle className="h-4 w-4 text-red-400" />
              </div>
              <p className="text-xs text-muted-foreground">Failed Sites</p>
            </div>
            <p className="mt-2 text-xl font-bold text-red-400">{totalFailed}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center justify-between">
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
              {status !== "all" && (
                <span className="ml-1 opacity-70">
                  ({allJobs.filter((j) => j.status === status).length})
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {filtered.length} run{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Job Cards */}
      <div className="space-y-3">
        {isLoading ? (
          [1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card h-24 animate-pulse rounded-xl" />
          ))
        ) : filtered.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center">
            <Trash2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              No recycle bin cleanup runs found{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}
            </p>
          </div>
        ) : (
          filtered.map((job) => (
            <button
              key={job.runId}
              onClick={() => setSelectedJob(job)}
              className="glass-card-hover w-full rounded-xl p-4 text-left transition-all"
            >
              <div className="flex items-center gap-4">
                {/* Status indicator */}
                <div className="shrink-0">
                  {job.status === "Running" ? (
                    <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
                  ) : job.status === "Completed" ? (
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  ) : job.status === "Failed" ? (
                    <XCircle className="h-8 w-8 text-red-400" />
                  ) : (
                    <Clock className="h-8 w-8 text-amber-400" />
                  )}
                </div>

                {/* Main info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        getStatusColor(job.status)
                      )}
                    >
                      {job.status}
                    </span>
                    {job.isDryRun && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
                        DRY RUN
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(job.startedAt)}
                    </span>
                    {job.durationMs && job.durationMs > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDuration(job.durationMs)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="font-mono">{job.runId.substring(0, 8)}...</span>
                    <span className="mx-1">|</span>
                    <span>by {job.triggeredBy}</span>
                  </div>
                </div>

                {/* Mini stats */}
                <div className="hidden sm:flex items-center gap-6 shrink-0">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sites</p>
                    <p className="font-mono text-sm font-bold">
                      {job.processedSites}
                      {job.failedSites > 0 && (
                        <span className="text-red-400 text-xs ml-1">({job.failedSites})</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Reclaimed</p>
                    <p className="font-mono text-sm font-bold text-emerald-400">
                      {formatBytes(job.totalSpaceReclaimedBytes)}
                    </p>
                  </div>
                </div>

                {/* Progress bar for running jobs */}
                {job.status === "Running" && job.totalSites > 0 && (
                  <div className="hidden md:block w-24 shrink-0">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                      <span>{Math.round((job.processedSites / job.totalSites) * 100)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-400 transition-all duration-500"
                        style={{
                          width: `${Math.min(100, (job.processedSites / job.totalSites) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </button>
          ))
        )}
      </div>

      <TriggerModal
        jobType="RecycleBinCleaner"
        isOpen={triggerOpen}
        onClose={() => setTriggerOpen(false)}
        onTriggered={() => mutate()}
      />
    </div>
  );
}
