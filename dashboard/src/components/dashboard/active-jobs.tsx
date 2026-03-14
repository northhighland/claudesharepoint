"use client";

import Link from "next/link";
import { Play, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { cn, formatDuration, formatDate, getStatusColor } from "@/lib/utils";
import type { JobRun, JobType } from "@/lib/types";

const JOB_TYPE_ROUTES: Record<JobType, string> = {
  VersionCleanup: "/versions",
  RecycleBinCleaner: "/recycle-bin",
  QuotaManager: "/quota",
  StaleSiteDetector: "/stale-sites",
};

interface ActiveJobsProps {
  jobs: JobRun[] | undefined;
  isLoading: boolean;
}

export function ActiveJobs({ jobs, isLoading }: ActiveJobsProps): React.ReactElement {
  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-6">
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">Recent Jobs</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const displayJobs = jobs ?? [];

  return (
    <div className="glass-card rounded-xl p-6">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">Recent Jobs</h3>
      {displayJobs.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No recent jobs
        </div>
      ) : (
        <div className="space-y-3">
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
              <Link
                key={job.runId}
                href={JOB_TYPE_ROUTES[job.jobType as JobType] ?? "/versions"}
                className="block glass-card-hover rounded-lg p-4 cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {job.status === "Running" ? (
                      <Play className="h-4 w-4 text-blue-500" />
                    ) : job.status === "Completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : job.status === "Failed" ? (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-yellow-500" />
                    )}
                    <span className="text-sm font-medium">{job.jobType}</span>
                    {job.isDryRun && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                        DRY RUN
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      getStatusColor(job.status)
                    )}
                  >
                    {job.status}
                  </span>
                </div>

                {/* Progress bar */}
                {job.status === "Running" && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>
                        {job.processedSites} / {job.totalSites} sites
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Started {formatDate(job.startedAt)}</span>
                  <span>Duration: {elapsed}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
