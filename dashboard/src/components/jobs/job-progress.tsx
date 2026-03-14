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
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isRunning
              ? "animate-pulse bg-blue-500"
              : percent === 100
                ? "bg-green-500"
                : "bg-blue-500"
          )}
          style={{ width: `${Math.max(percent, isRunning ? 5 : 0)}%` }}
        />
      </div>

      {/* Wave text and counts */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
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
              <span className="text-green-600">{succeeded} succeeded</span>
            )}
            {failed > 0 && (
              <span className="text-red-600">{failed} failed</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
