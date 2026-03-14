"use client";

import { ArrowLeft, CheckCircle2, XCircle, SkipForward } from "lucide-react";
import { cn, formatDate, formatDuration, formatBytes, getStatusColor } from "@/lib/utils";
import { usePolling } from "@/hooks/use-polling";
import { fetchJob } from "@/lib/api";
import type { JobRun, VersionCleanupResult } from "@/lib/types";
import { JobProgress } from "@/components/jobs/job-progress";

interface JobDetailProps {
  job: JobRun;
  onBack: () => void;
}

export function JobDetail({ job, onBack }: JobDetailProps): React.ReactElement {
  const { data, isLoading } = usePolling(
    `job-${job.runId}`,
    () => fetchJob(job.runId),
    job.status === "Running" ? 10000 : 0
  );

  const results = data?.results ?? [];

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
          <h2 className="text-xl font-semibold">{job.jobType} Run</h2>
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

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Started</p>
          <p className="mt-1 text-sm font-medium">{formatDate(job.startedAt)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Duration</p>
          <p className="mt-1 text-sm font-medium">
            {job.durationMs ? formatDuration(job.durationMs) : "In progress..."}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Sites Processed</p>
          <p className="mt-1 text-sm font-medium">
            {job.processedSites} / {job.totalSites}
            {job.failedSites > 0 && (
              <span className="ml-2 text-red-600">({job.failedSites} failed)</span>
            )}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Space Reclaimed</p>
          <p className="mt-1 text-sm font-medium">
            {formatBytes(job.totalSpaceReclaimedBytes)}
          </p>
        </div>
      </div>

      {/* Job progress */}
      {(job.status === "Running" || (job.totalWaves ?? 0) > 0) && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-medium">Progress</h3>
          <JobProgress job={job} />
        </div>
      )}

      {/* Error message */}
      {job.errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <p className="font-medium">Error</p>
          <p className="mt-1">{job.errorMessage}</p>
        </div>
      )}

      {/* Results table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium">Per-Site Results</h3>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Site
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Versions Deleted
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Reclaimed
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Libraries
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
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-muted-foreground"
                    >
                      No results yet
                    </td>
                  </tr>
                ) : (
                  results.map((result: VersionCleanupResult) => (
                    <tr key={result.rowKey} className="hover:bg-accent/50">
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium">{result.siteName}</div>
                        <div className="text-xs text-muted-foreground">{result.siteUrl}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {result.status === "Success" ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : result.status === "Failed" ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : (
                            <SkipForward className="h-4 w-4 text-zinc-500" />
                          )}
                          <span className="text-sm">{result.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{result.versionsDeleted}</td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {formatBytes(result.spaceReclaimedBytes)}
                      </td>
                      <td className="px-4 py-3 text-sm">{result.librariesProcessed}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-sm text-red-600">
                        {result.errorMessage || "--"}
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
