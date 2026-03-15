"use client";

import Link from "next/link";
import {
  HardDrive,
  Gauge,
  Search,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { formatBytes, cn, getStatusColor, clampPercent } from "@/lib/utils";
import type { JobRun, JobType } from "@/lib/types";
import { JOB_TYPE_DISPLAY_NAMES } from "@/lib/types";

const JOB_TYPE_ROUTES: Record<JobType, string> = {
  VersionCleanup: "/versions",
  RecycleBinCleaner: "/recycle-bin",
  QuotaManager: "/quota",
  StaleSiteDetector: "/stale-sites",
};

function getJobIcon(jobType: JobType): React.ReactElement {
  switch (jobType) {
    case "VersionCleanup":
      return <HardDrive className="h-3.5 w-3.5" />;
    case "QuotaManager":
      return <Gauge className="h-3.5 w-3.5" />;
    case "StaleSiteDetector":
      return <Search className="h-3.5 w-3.5" />;
    case "RecycleBinCleaner":
      return <Trash2 className="h-3.5 w-3.5" />;
  }
}

function getTimelineColor(status: string): string {
  switch (status) {
    case "Completed":
      return "bg-emerald-500";
    case "Running":
      return "bg-sky-500 animate-pulse";
    case "Failed":
      return "bg-red-500";
    case "PartialComplete":
      return "bg-amber-500";
    default:
      return "bg-zinc-500";
  }
}

function describeJob(job: JobRun): string {
  const name = JOB_TYPE_DISPLAY_NAMES[job.jobType] ?? job.jobType;
  const sites = job.processedSites || job.totalSites;

  if (job.status === "Running") {
    const progress =
      job.totalSites > 0
        ? Math.round((job.processedSites / job.totalSites) * 100)
        : 0;
    return `${name} in progress — ${job.processedSites}/${job.totalSites} sites (${progress}%)`;
  }
  if (job.status === "Failed") {
    return `${name} failed — ${job.failedSites} site${job.failedSites !== 1 ? "s" : ""} with errors`;
  }
  if (job.status === "Completed" || job.status === "PartialComplete") {
    const parts = [`${name} completed — ${sites} site${sites !== 1 ? "s" : ""}`];
    if (job.totalSpaceReclaimedBytes > 0) {
      parts.push(formatBytes(job.totalSpaceReclaimedBytes) + " reclaimed");
    }
    return parts.join(", ");
  }
  return `${name} ${job.status.toLowerCase()}`;
}

function relativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  if (isNaN(diffMs) || diffMs < 0) return "just now";

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface JobActivityFeedProps {
  jobs: JobRun[] | undefined;
  isLoading: boolean;
}

export function JobActivityFeed({
  jobs,
  isLoading,
}: JobActivityFeedProps): React.ReactElement {
  if (isLoading) {
    return (
      <div className="glass-card animate-fade-in-up rounded-xl p-6">
        <h3 className="mb-4 text-xs uppercase tracking-wider text-muted-foreground">
          Job Activity
        </h3>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="h-3 w-3 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const displayJobs = (jobs ?? []).slice(0, 8);

  return (
    <div className="glass-card animate-fade-in-up rounded-xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
          Job Activity
        </h3>
        <Link
          href="/versions"
          className="text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          View all jobs
        </Link>
      </div>

      {displayJobs.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No recent jobs
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[5px] top-2 bottom-2 w-px bg-white/10" />

          <div className="space-y-4">
            {displayJobs.map((job) => {
              const progress =
                job.status === "Running" && job.totalSites > 0
                  ? clampPercent(Math.round((job.processedSites / job.totalSites) * 100))
                  : null;

              return (
                <Link
                  key={job.runId}
                  href={JOB_TYPE_ROUTES[job.jobType] ?? "/jobs"}
                  className="group relative flex gap-3 pl-5"
                >
                  {/* Timeline dot */}
                  <div
                    className={cn(
                      "absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full ring-2 ring-[hsl(var(--card))]",
                      getTimelineColor(job.status)
                    )}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-muted-foreground">
                        {getJobIcon(job.jobType)}
                      </span>
                      <p className="text-sm leading-snug text-foreground/90 group-hover:text-foreground transition-colors">
                        {describeJob(job)}
                      </p>
                    </div>

                    {/* Inline progress bar for running jobs */}
                    {progress !== null && (
                      <div className="mt-2 ml-5">
                        <div className="h-1.5 w-full max-w-xs rounded-full bg-muted/50">
                          <div
                            className="h-1.5 rounded-full bg-sky-500 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Failed error count */}
                    {job.status === "Failed" && job.failedSites > 0 && (
                      <div className="mt-1 ml-5 flex items-center gap-1 text-xs text-red-400">
                        <AlertTriangle className="h-3 w-3" />
                        {job.failedSites} error{job.failedSites !== 1 ? "s" : ""}
                      </div>
                    )}

                    <div className="mt-1 ml-5 flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {relativeTime(job.completedAt ?? job.startedAt)}
                      </span>
                      {job.isDryRun && (
                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                          DRY RUN
                        </span>
                      )}
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          getStatusColor(job.status)
                        )}
                      >
                        {job.status}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
