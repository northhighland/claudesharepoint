"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, XCircle, SkipForward, AlertTriangle } from "lucide-react";
import { cn, formatDate, formatDuration, formatBytes, getStatusColor } from "@/lib/utils";
import { usePolling } from "@/hooks/use-polling";
import { fetchJob } from "@/lib/api";
import type { JobRun, VersionCleanupResult } from "@/lib/types";
import { WaveTimeline } from "@/components/jobs/wave-timeline";
import { LiveProgress } from "@/components/jobs/live-progress";

interface JobDetailProps {
  job: JobRun;
  onBack: () => void;
}

export function JobDetail({ job, onBack }: JobDetailProps): React.ReactElement {
  const { data, isLoading } = usePolling(
    `job-${job.runId}`,
    () => fetchJob(job.runId),
    job.status === "Running" ? 5000 : 0
  );

  const results = (data?.results ?? []) as VersionCleanupResult[];
  const [errorExpanded, setErrorExpanded] = useState(false);

  // Calculate running totals from per-site results
  const totalVersionsFound = results.reduce((sum, r) => sum + (r.versionsFound ?? 0), 0);
  const totalVersionsDeleted = results.reduce((sum, r) => sum + (r.versionsDeleted ?? 0), 0);
  const totalSpaceReclaimed = results.reduce((sum, r) => sum + (r.spaceReclaimedBytes ?? 0), 0);
  const totalFilesScanned = results.reduce((sum, r) => sum + (r.filesScanned ?? 0), 0);
  const sitesCompleted = results.length;
  const sitesFailed = results.filter((r) => r.status === "Failed" || r.status === "Error").length;
  const isDryRun = job.isDryRun || results.some((r) => r.isDryRun);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="rounded-md p-2 hover:bg-accent"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-xl font-semibold">{job.jobType} Run</h2>
            {isDryRun && (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-400">
                DRY RUN
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Run ID: {job.runId}</p>
        </div>
        <span
          className={cn(
            "ml-auto rounded-full px-3 py-1 text-sm font-medium",
            getStatusColor(job.status)
          )}
        >
          {job.status}
        </span>
      </div>

      {/* Summary cards — calculated from real results */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="glass-card rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sites Completed</p>
          <p className="mt-1 font-mono text-2xl font-bold">
            {sitesCompleted}
            <span className="text-sm font-normal text-muted-foreground"> / {job.totalSites}</span>
          </p>
          {sitesFailed > 0 && (
            <p className="mt-1 text-xs text-red-400">{sitesFailed} failed</p>
          )}
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Files Scanned</p>
          <p className="mt-1 font-mono text-2xl font-bold text-sky-400">
            {totalFilesScanned.toLocaleString()}
          </p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Versions Found</p>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-400">
            {totalVersionsFound.toLocaleString()}
          </p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {isDryRun ? "Would Delete" : "Versions Deleted"}
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-primary">
            {totalVersionsDeleted.toLocaleString()}
          </p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {isDryRun ? "Would Reclaim" : "Space Reclaimed"}
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-400">
            {formatBytes(totalSpaceReclaimed)}
          </p>
        </div>
      </div>

      {/* Live progress for running jobs */}
      {job.status === "Running" && (
        <LiveProgress job={job} />
      )}

      {/* Wave timeline */}
      {(job.totalWaves ?? 0) > 0 && (
        <WaveTimeline job={job} />
      )}

      {/* Error message */}
      {job.errorMessage && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <p className="font-medium">Error</p>
          <p className={cn("mt-1", !errorExpanded && "line-clamp-2")}>
            {job.errorMessage}
          </p>
          {job.errorMessage.length > 200 && (
            <button
              onClick={() => setErrorExpanded(!errorExpanded)}
              className="mt-2 text-xs font-medium text-red-300 hover:text-red-200"
            >
              {errorExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {/* Results table */}
      <div className="overflow-hidden glass-card rounded-xl shadow-sm">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">Per-Site Results</h3>
          {results.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {results.length} site{results.length !== 1 ? "s" : ""} completed
            </span>
          )}
        </div>
        {isLoading && results.length === 0 ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Site
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Files
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Versions Found
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {isDryRun ? "Would Delete" : "Deleted"}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {isDryRun ? "Would Reclaim" : "Reclaimed"}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-sm text-muted-foreground"
                    >
                      {job.status === "Running" ? "Waiting for results..." : "No results yet"}
                    </td>
                  </tr>
                ) : (
                  results.map((result: VersionCleanupResult) => (
                    <tr key={result.rowKey} className="hover:bg-accent/50">
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium">{result.siteName || result.siteUrl.split("/").pop()}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-xs">{result.siteUrl}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {result.status === "Success" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : result.status === "Failed" || result.status === "Error" ? (
                            <XCircle className="h-4 w-4 text-red-400" />
                          ) : (
                            <SkipForward className="h-4 w-4 text-zinc-400" />
                          )}
                          <span className="text-sm">{result.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        {(result.filesScanned ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-amber-400">
                        {(result.versionsFound ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-medium text-primary">
                        {(result.versionsDeleted ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-medium text-emerald-400">
                        {formatBytes(result.spaceReclaimedBytes ?? 0)}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-sm">
                        {result.errorMessage ? (
                          <div className="flex items-start gap-1 text-red-400">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span className="truncate">{result.errorMessage}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
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
  );
}
