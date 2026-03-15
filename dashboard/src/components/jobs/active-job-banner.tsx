"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn, formatDate, formatDuration, getStatusColor, clampPercent } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";
import type { JobRun } from "@/lib/types";
import { JOB_TYPE_DISPLAY_NAMES } from "@/lib/types";

interface ActiveJobBannerProps {
  jobs: JobRun[];
}

export function ActiveJobBanner({ jobs }: ActiveJobBannerProps): React.ReactElement | null {
  const now = useNow(5000);
  const runningJobs = jobs.filter((j) => j.status === "Running");

  if (runningJobs.length === 0) return null;

  return (
    <div className="space-y-3">
      {runningJobs.map((job) => {
        const progress = clampPercent(
          job.totalSites > 0
            ? Math.round((job.processedSites / job.totalSites) * 100)
            : 0
        );
        const elapsed = now - new Date(job.startedAt).getTime();

        return (
          <div
            key={job.runId}
            className="glass-card rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 animate-fade-in-up"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                <span className="text-sm font-medium">
                  {JOB_TYPE_DISPLAY_NAMES[job.jobType] ?? job.jobType}
                </span>
                {job.isDryRun && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                    Dry Run
                  </span>
                )}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    getStatusColor(job.status)
                  )}
                >
                  {job.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Started {formatDate(job.startedAt)}</span>
                <span>{formatDuration(elapsed)}</span>
              </div>
            </div>

            {/* Progress */}
            {job.totalSites > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {job.processedSites.toLocaleString()} / {job.totalSites.toLocaleString()} sites
                    {" \u2014 "}
                    {progress}%
                  </span>
                  {job.failedSites > 0 && (
                    <span className="text-red-400">{job.failedSites} failed</span>
                  )}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-sky-500/10">
                  <div
                    className="h-full rounded-full bg-sky-400 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
