"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, XCircle, SkipForward, AlertTriangle } from "lucide-react";
import { cn, formatDate, formatDuration, formatBytes, getStatusColor } from "@/lib/utils";
import { usePolling } from "@/hooks/use-polling";
import { fetchJob } from "@/lib/api";
import type { JobRun, VersionCleanupResult } from "@/lib/types";
import { WaveTimeline } from "@/components/jobs/wave-timeline";
import { LiveProgress } from "@/components/jobs/live-progress";
import { ErrorSummary } from "@/components/jobs/error-summary";
import { ExportButton } from "@/components/ui/export-button";
import { JobReportButton } from "@/components/jobs/job-report";

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

  const jobData = data?.job ?? job;
  const rawResults = (data?.results ?? []) as unknown as Array<Record<string, unknown>>;
  const results = rawResults as unknown as VersionCleanupResult[];
  const [errorExpanded, setErrorExpanded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "Success" | "Error" | "Failed">("all");

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

      {/* Error summary */}
      <ErrorSummary results={rawResults as Array<{ errorCode?: string; errorSource?: string; errorMessage?: string; status?: string }>} />

      {/* Results table */}
      <ResultsTable
        job={job}
        rawResults={rawResults}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        isLoading={isLoading}
        isDryRun={isDryRun}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Extracted results table to keep the main component readable        */
/* ------------------------------------------------------------------ */

function ResultsTable({
  job,
  rawResults,
  statusFilter,
  setStatusFilter,
  isLoading,
  isDryRun,
}: {
  job: JobRun;
  rawResults: Array<Record<string, unknown>>;
  statusFilter: "all" | "Success" | "Error" | "Failed";
  setStatusFilter: (v: "all" | "Success" | "Error" | "Failed") => void;
  isLoading: boolean;
  isDryRun: boolean;
}): React.ReactElement {
  const filteredResults =
    statusFilter === "all"
      ? rawResults
      : rawResults.filter((r) => String(r.status) === statusFilter);

  return (
    <div className="overflow-hidden glass-card rounded-xl shadow-sm">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Per-Site Results</h3>
        <div className="flex items-center gap-2">
          {rawResults.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">
                {rawResults.length} site{rawResults.length !== 1 ? "s" : ""} completed
              </span>
              <ExportButton
                data={rawResults}
                filename={`${job.jobType}-${job.runId}`}
              />
              <JobReportButton
                job={job}
                results={rawResults}
              />
            </>
          )}
        </div>
      </div>

      {/* Status filter */}
      {rawResults.length > 0 && (
        <div className="flex gap-2 px-4 py-2 border-b border-border">
          {(["all", "Success", "Error", "Failed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "all" ? "All" : s}
              {s !== "all" && (
                <span className="ml-1 opacity-70">
                  ({rawResults.filter((r) => r.status === s).length})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {isLoading && rawResults.length === 0 ? (
        <div className="space-y-2 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : job.jobType === "VersionCleanup" ? (
        <VersionCleanupTable results={filteredResults as unknown as VersionCleanupResult[]} job={job} isDryRun={isDryRun} />
      ) : (
        <GenericResultsTable results={filteredResults} job={job} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* VersionCleanup-specific table                                      */
/* ------------------------------------------------------------------ */

function VersionCleanupTable({
  results,
  job,
  isDryRun,
}: {
  results: VersionCleanupResult[];
  job: JobRun;
  isDryRun: boolean;
}): React.ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-muted/30">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Site</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Files</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Versions Found</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">{isDryRun ? "Would Delete" : "Deleted"}</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">{isDryRun ? "Would Reclaim" : "Reclaimed"}</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {results.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                {job.status === "Running" ? "Waiting for results..." : "No results yet"}
              </td>
            </tr>
          ) : (
            results.map((result) => (
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
                  <div className="flex items-start gap-1">
                    {result.errorCode && (
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-mono text-red-400">
                        {result.errorCode}
                      </span>
                    )}
                    {result.errorMessage ? (
                      <div className="flex items-start gap-1 text-red-400">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span className="truncate">{result.errorMessage}</span>
                      </div>
                    ) : !result.errorCode ? (
                      <span className="text-muted-foreground">--</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Generic table for QuotaManager, StaleSiteDetector, RecycleBinCleaner */
/* ------------------------------------------------------------------ */

function GenericResultsTable({
  results,
  job,
}: {
  results: Array<Record<string, unknown>>;
  job: JobRun;
}): React.ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-muted/30">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Site</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Error Code</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Error Source</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Error Message</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {results.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                {job.status === "Running" ? "Waiting for results..." : "No results yet"}
              </td>
            </tr>
          ) : (
            results.map((result, idx) => {
              const siteUrl = String(result.siteUrl ?? "");
              const siteName = String(result.siteName ?? "");
              const status = String(result.status ?? "");
              const errorCode = result.errorCode ? String(result.errorCode) : undefined;
              const errorSource = result.errorSource ? String(result.errorSource) : undefined;
              const errorMessage = result.errorMessage ? String(result.errorMessage) : undefined;
              return (
                <tr key={String(result.rowKey ?? idx)} className="hover:bg-accent/50">
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium">{siteName || siteUrl.split("/").pop()}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-xs">{siteUrl}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {status === "Success" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : status === "Failed" || status === "Error" ? (
                        <XCircle className="h-4 w-4 text-red-400" />
                      ) : (
                        <SkipForward className="h-4 w-4 text-zinc-400" />
                      )}
                      <span className="text-sm">{status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {errorCode ? (
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-mono text-red-400">
                        {errorCode}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {errorSource ?? "--"}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-sm">
                    {errorMessage ? (
                      <div className="flex items-start gap-1 text-red-400">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span className="truncate">{errorMessage}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
