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
          className="rounded-md p-2 text-[#6B7280] hover:bg-[#1A1A1A] hover:text-[#D1D5DB]"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-[#F9FAFB]">{job.jobType} Run</h2>
          <p className="text-[13px] text-[#6B7280]">Run ID: {job.runId}</p>
        </div>
        <span
          className={cn(
            "ml-auto rounded-full px-3 py-1 text-[13px] font-medium",
            getStatusColor(job.status)
          )}
        >
          {job.status}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Started</p>
          <p className="mt-1 text-[13px] font-medium text-[#F9FAFB]">{formatDate(job.startedAt)}</p>
        </div>
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Duration</p>
          <p className="mt-1 text-[13px] font-medium text-[#F9FAFB]">
            {job.durationMs ? formatDuration(job.durationMs) : "In progress..."}
          </p>
        </div>
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Sites Processed</p>
          <p className="mt-1 text-[13px] font-medium text-[#F9FAFB]">
            {job.processedSites} / {job.totalSites}
            {job.failedSites > 0 && (
              <span className="ml-2 text-red-400">({job.failedSites} failed)</span>
            )}
          </p>
        </div>
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Space Reclaimed</p>
          <p className="mt-1 text-[13px] font-medium text-[#F9FAFB]">
            {formatBytes(job.totalSpaceReclaimedBytes)}
          </p>
        </div>
      </div>

      {/* Job progress */}
      {(job.status === "Running" || (job.totalWaves ?? 0) > 0) && (
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-4">
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Progress</h3>
          <JobProgress job={job} />
        </div>
      )}

      {/* Error message */}
      {job.errorMessage && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-4 text-[13px] text-red-400">
          <p className="font-medium">Error</p>
          <p className="mt-1">{job.errorMessage}</p>
        </div>
      )}

      {/* Results table */}
      <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.06)]">
        <div className="border-b border-[rgba(255,255,255,0.06)] px-4 py-3">
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Per-Site Results</h3>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-[#1A1A1A]" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
                    Site
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
                    Versions Deleted
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
                    Reclaimed
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
                    Libraries
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                {results.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-[13px] text-[#6B7280]"
                    >
                      No results yet
                    </td>
                  </tr>
                ) : (
                  results.map((result: VersionCleanupResult) => (
                    <tr key={result.rowKey} className="hover:bg-[rgba(255,255,255,0.03)]">
                      <td className="px-4 py-3 text-[13px]">
                        <div className="font-medium text-[#F9FAFB]">{result.siteName}</div>
                        <div className="text-[11px] text-[#6B7280]">{result.siteUrl}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {result.status === "Success" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : result.status === "Failed" ? (
                            <XCircle className="h-4 w-4 text-red-400" />
                          ) : (
                            <SkipForward className="h-4 w-4 text-zinc-400" />
                          )}
                          <span className="text-[13px] text-[#D1D5DB]">{result.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#D1D5DB]">{result.versionsDeleted}</td>
                      <td className="px-4 py-3 text-[13px] font-medium text-[#F9FAFB]">
                        {formatBytes(result.spaceReclaimedBytes)}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#D1D5DB]">{result.librariesProcessed}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-[13px] text-red-400">
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
