"use client";

import { cn } from "@/lib/utils";
import type { JobRun } from "@/lib/types";

interface JobProgressProps {
  job: JobRun;
  compact?: boolean;
}

export function JobProgress({ job, compact = false }: JobProgressProps): React.ReactElement {
  const totalWaves = job.totalWaves ?? 0;
  const completedWaves = job.completedWaves ?? 0;
  const succeeded = job.jobsSucceeded ?? 0;
  const failed = job.jobsFailed ?? 0;
  const isRunning = job.status === "Running";
  const percent = totalWaves > 0 ? Math.round((completedWaves / totalWaves) * 100) : 0;

  if (totalWaves === 0 && !isRunning) {
    return <></>;
  }

  return (
    <div className={cn("space-y-2", compact ? "w-48" : "w-full")}>
      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isRunning
              ? "animate-pulse bg-emerald-400"
              : percent === 100
                ? "bg-emerald-400"
                : "bg-sky-400"
          )}
          style={{ width: `${Math.max(percent, isRunning ? 5 : 0)}%` }}
        />
      </div>

      {/* Wave text and counts */}
      <div className="flex items-center justify-between text-[11px] text-[#6B7280]">
        <span>
          {totalWaves > 0
            ? `Wave ${completedWaves}/${totalWaves}`
            : isRunning
              ? "Starting..."
              : ""}
        </span>
        {(succeeded > 0 || failed > 0) && (
          <span className="flex items-center gap-2">
            {succeeded > 0 && (
              <span className="text-emerald-400">{succeeded} succeeded</span>
            )}
            {failed > 0 && (
              <span className="text-red-400">{failed} failed</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
