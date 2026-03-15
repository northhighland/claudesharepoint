"use client";

import { Clock } from "lucide-react";
import { usePolling } from "@/hooks/use-polling";
import { fetchSettings } from "@/lib/api";
import type { JobType, JobSchedule } from "@/lib/types";

const JOB_TYPE_LABELS: Record<JobType, string> = {
  VersionCleanup: "Version Control",
  QuotaManager: "Quota Manager",
  StaleSiteDetector: "Stale Site Detector",
  RecycleBinCleaner: "Recycle Bin Cleaner",
};

function getNextRunTime(schedule: JobSchedule): string | null {
  if (!schedule.enabled) return null;

  const now = new Date();
  const [hours, minutes] = (schedule.timeUtc || "02:00").split(":").map(Number);

  // Simple calculation — next occurrence
  const next = new Date(now);
  next.setUTCHours(hours, minutes, 0, 0);

  if (next <= now) {
    // Already passed today, calculate next based on frequency
    if (schedule.frequency === "daily") {
      next.setUTCDate(next.getUTCDate() + 1);
    } else if (schedule.frequency === "weekly") {
      const targetDay = schedule.dayOfWeek ?? 1; // Monday default
      let daysUntil = targetDay - next.getUTCDay();
      if (daysUntil <= 0) daysUntil += 7;
      next.setUTCDate(next.getUTCDate() + daysUntil);
    } else if (schedule.frequency === "monthly") {
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(schedule.dayOfMonth ?? 1);
    }
  }

  // Format relative
  const diffMs = next.getTime() - now.getTime();
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffHrs > 24) {
    const days = Math.floor(diffHrs / 24);
    return `in ${days}d ${diffHrs % 24}h`;
  }
  if (diffHrs > 0) return `in ${diffHrs}h ${diffMins}m`;
  return `in ${diffMins}m`;
}

interface NextRunIndicatorProps {
  jobType: JobType;
}

export function NextRunIndicator({ jobType }: NextRunIndicatorProps): React.ReactElement {
  const { data: settings } = usePolling("settings-for-schedule", fetchSettings, 120000);

  const schedule = settings?.schedules?.[jobType];
  if (!schedule) return <></>;

  const nextRun = getNextRunTime(schedule);

  if (!nextRun) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
        <Clock className="h-3 w-3" />
        <span>Schedule disabled</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
      <Clock className="h-3 w-3" />
      <span>Next run {nextRun}</span>
    </div>
  );
}
