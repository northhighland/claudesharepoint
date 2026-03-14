"use client";

import { Play, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { cn, formatDuration, formatDate, getStatusColor } from "@/lib/utils";
import type { JobRun } from "@/lib/types";

interface ActiveJobsProps {
  jobs: JobRun[] | undefined;
  isLoading: boolean;
}

export function ActiveJobs({ jobs, isLoading }: ActiveJobsProps): React.ReactElement {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#141414] p-6">
        <h3 className="mb-4 text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
          Recent Jobs
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-[#1A1A1A]" />
          ))}
        </div>
      </div>
    );
  }

  const displayJobs = jobs ?? [];

  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#141414] p-6">
      <h3 className="mb-4 text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
        Recent Jobs
      </h3>
      {displayJobs.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-[13px] text-[#6B7280]">
          No recent jobs
        </div>
      ) : (
        <div className="space-y-2">
          {displayJobs.map((job) => {
            const progress =
              job.totalSites > 0
                ? Math.round((job.processedSites / job.totalSites) * 100)
                : 0;
            const elapsed = job.durationMs
              ? formatDuration(job.durationMs)
              : job.startedAt
                ? formatDuration(Date.now() - new Date(job.startedAt).getTime())
                : "--";

            return (
              <div
                key={job.runId}
                className={cn(
                  "rounded-md border border-[rgba(255,255,255,0.06)] p-3.5 transition-colors hover:bg-[#1A1A1A]",
                  job.status === "Running" && "border-l-2 border-l-emerald-400"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {job.status === "Running" ? (
                      <Play className="h-3.5 w-3.5 text-emerald-400" />
                    ) : job.status === "Completed" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : job.status === "Failed" ? (
                      <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-amber-400" />
                    )}
                    <span className="text-[13px] font-medium text-[#F9FAFB]">{job.jobType}</span>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      getStatusColor(job.status)
                    )}
                  >
                    {job.status}
                  </span>
                </div>

                {/* Progress bar */}
                {job.status === "Running" && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[11px] text-[#6B7280]">
                      <span>
                        {job.processedSites} / {job.totalSites} sites
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-[rgba(255,255,255,0.06)]">
                      <div
                        className="h-1 rounded-full bg-emerald-400 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-2 flex items-center gap-4 text-[11px] text-[#6B7280]">
                  <span>{formatDate(job.startedAt)}</span>
                  <span>{elapsed}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
