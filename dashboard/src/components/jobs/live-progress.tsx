"use client";

import { formatDuration } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";
import type { JobRun } from "@/lib/types";

interface LiveProgressProps {
  job: JobRun;
}

export function LiveProgress({ job }: LiveProgressProps): React.ReactElement {
  const totalWaves = job.totalWaves ?? 0;
  const completedWaves = job.completedWaves ?? 0;
  const succeeded = job.jobsSucceeded ?? 0;
  const failed = job.jobsFailed ?? 0;
  const processed = succeeded + failed;
  const percent = job.totalSites > 0 ? Math.round((processed / job.totalSites) * 100) : 0;

  // Calculate ETA based on elapsed time and progress
  const now = useNow(5000);
  let etaText = "";
  if (job.startedAt && percent > 0 && percent < 100) {
    const elapsedMs = now - new Date(job.startedAt).getTime();
    const estimatedTotalMs = (elapsedMs / percent) * 100;
    const remainingMs = estimatedTotalMs - elapsedMs;
    etaText = `~${formatDuration(remainingMs)} remaining`;
  }

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Live Progress</h4>
        {etaText && <span className="text-xs text-muted-foreground">{etaText}</span>}
      </div>

      {/* Main progress bar */}
      <div>
        <div className="mb-2 flex justify-between text-xs text-muted-foreground">
          <span>{processed} / {job.totalSites} sites</span>
          <span className="font-mono">{percent}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-muted/30">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-700"
            style={{ width: `${Math.max(percent, 2)}%` }}
          />
        </div>
      </div>

      {/* Wave and count details */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="font-mono text-lg font-bold">{completedWaves}/{totalWaves}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Waves</p>
        </div>
        <div>
          <p className="font-mono text-lg font-bold text-emerald-400">{succeeded}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Succeeded</p>
        </div>
        <div>
          <p className="font-mono text-lg font-bold text-red-400">{failed}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Failed</p>
        </div>
      </div>
    </div>
  );
}
