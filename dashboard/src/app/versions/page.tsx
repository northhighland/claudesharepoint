"use client";

import { useState, useCallback, useEffect } from "react";
import { FileStack, CheckCircle2, XCircle, SkipForward, Play } from "lucide-react";
import { usePolling } from "@/hooks/use-polling";
import { fetchJobs } from "@/lib/api";
import { formatBytes, formatDate, getStatusColor, cn } from "@/lib/utils";
import { JobDetail } from "@/components/jobs/job-detail";
import { TriggerModal } from "@/components/jobs/trigger-modal";
import { ExportButton } from "@/components/ui/export-button";
import type { JobRun } from "@/lib/types";

type FilterStatus = "all" | "Completed" | "Failed" | "Running";

export default function VersionsPage(): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [selectedJob, setSelectedJob] = useState<JobRun | null>(null);
  const [triggerOpen, setTriggerOpen] = useState(false);

  const [pollInterval, setPollInterval] = useState(30000);
  const fetcher = useCallback(
    () => fetchJobs({ jobType: "VersionCleanup" }),
    []
  );
  const { data: jobs, isLoading, mutate } = usePolling("version-jobs", fetcher, pollInterval);

  // Dynamic polling: 5s when jobs are running, 30s otherwise
  useEffect(() => {
    const hasRunning = (jobs ?? []).some((j) => j.status === "Running");
    setPollInterval(hasRunning ? 5000 : 30000);
  }, [jobs]);

  const filtered = (jobs ?? []).filter(
    (j) => statusFilter === "all" || j.status === statusFilter
  );

  // Summary stats
  const allJobs = jobs ?? [];
  const totalReclaimed = allJobs.reduce((sum, j) => sum + j.totalSpaceReclaimedBytes, 0);
  const totalSites = allJobs.reduce((sum, j) => sum + j.processedSites, 0);
  const totalFailed = allJobs.reduce((sum, j) => sum + j.failedSites, 0);
  const completedCount = allJobs.filter((j) => j.status === "Completed").length;

  if (selectedJob) {
    return <JobDetail job={selectedJob} onBack={() => setSelectedJob(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Version Control</h1>
          <p className="text-sm text-muted-foreground">
            File version cleanup results across SharePoint sites
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={(jobs ?? []) as unknown as Record<string, unknown>[]}
            filename="version-cleanup-runs"
            columns={[
              { key: "runId", label: "Run ID" },
              { key: "status", label: "Status" },
              { key: "startedAt", label: "Started" },
              { key: "totalSites", label: "Total Sites" },
              { key: "processedSites", label: "Processed" },
              { key: "failedSites", label: "Failed" },
              { key: "totalSpaceReclaimedBytes", label: "Space Reclaimed" },
              { key: "isDryRun", label: "Dry Run" },
            ]}
          />
          <button
            onClick={() => setTriggerOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Play className="h-4 w-4" />
            Run Version Cleanup
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <FileStack className="h-4 w-4 text-primary" />
            <p className="text-xs text-muted-foreground">Total Reclaimed</p>
          </div>
          <p className="mt-2 text-xl font-bold">
            {isLoading ? "--" : formatBytes(totalReclaimed)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <p className="text-xs text-muted-foreground">Completed Runs</p>
          </div>
          <p className="mt-2 text-xl font-bold">{isLoading ? "--" : completedCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-500" />
            <p className="text-xs text-muted-foreground">Sites Processed</p>
          </div>
          <p className="mt-2 text-xl font-bold">{isLoading ? "--" : totalSites.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <p className="text-xs text-muted-foreground">Failed Sites</p>
          </div>
          <p className="mt-2 text-xl font-bold">{isLoading ? "--" : totalFailed}</p>
        </div>
      </div>

      {/* Filter */}
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

      {/* Results table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {isLoading ? (
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
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-muted-foreground"
                    >
                      No version cleanup runs found
                    </td>
                  </tr>
                ) : (
                  filtered.map((job) => (
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

      <TriggerModal
        jobType="VersionCleanup"
        isOpen={triggerOpen}
        onClose={() => setTriggerOpen(false)}
        onTriggered={() => mutate()}
      />
    </div>
  );
}
