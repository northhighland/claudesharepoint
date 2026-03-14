"use client";

import { cn } from "@/lib/utils";
import type { JobRun } from "@/lib/types";

interface WaveTimelineProps {
  job: JobRun;
}

export function WaveTimeline({ job }: WaveTimelineProps): React.ReactElement {
  const totalWaves = job.totalWaves ?? 0;
  const completedWaves = job.completedWaves ?? 0;

  if (totalWaves === 0) {
    return <div className="text-sm text-muted-foreground">No wave data available</div>;
  }

  // Create array of waves
  const waves = Array.from({ length: totalWaves }, (_, i) => {
    const waveNum = i + 1;
    const isCompleted = waveNum <= completedWaves;
    const isCurrent = waveNum === completedWaves + 1 && job.status === "Running";
    return { waveNum, isCompleted, isCurrent };
  });

  return (
    <div className="glass-card rounded-xl p-5">
      <h4 className="mb-4 text-sm font-medium">Wave Execution Timeline</h4>
      <div className="flex flex-wrap gap-2">
        {waves.map((wave) => (
          <div
            key={wave.waveNum}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg text-xs font-mono font-bold transition-all",
              wave.isCompleted
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : wave.isCurrent
                  ? "bg-sky-500/20 text-sky-400 border border-sky-500/30 animate-pulse"
                  : "bg-muted/30 text-muted-foreground border border-border"
            )}
          >
            {wave.waveNum}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/40" /> Completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-sky-500/40 animate-pulse" /> In Progress
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-muted/50" /> Pending
        </span>
      </div>
    </div>
  );
}
