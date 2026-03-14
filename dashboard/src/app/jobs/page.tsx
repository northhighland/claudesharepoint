"use client";

import { useState, useCallback, useEffect } from "react";
import { Play, ChevronDown } from "lucide-react";
import { usePolling } from "@/hooks/use-polling";
import { fetchJobs, triggerJob } from "@/lib/api";
import { JobTable } from "@/components/jobs/job-table";
import { JobDetail } from "@/components/jobs/job-detail";
import type { JobRun, JobType, JobStatus, JobFilters } from "@/lib/types";
import { JOB_TYPE_DISPLAY_NAMES } from "@/lib/types";

const JOB_TYPES: JobType[] = [
  "VersionCleanup",
  "QuotaManager",
  "StaleSiteDetector",
  "RecycleBinCleaner",
];

const JOB_STATUSES: JobStatus[] = [
  "Queued",
  "Running",
  "Completed",
  "Failed",
  "Cancelled",
];

export default function JobsPage(): React.ReactElement {
  const [filters, setFilters] = useState<JobFilters>({});
  const [selectedJob, setSelectedJob] = useState<JobRun | null>(null);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const [pollInterval, setPollInterval] = useState(15000);
  const fetcher = useCallback(() => fetchJobs(filters), [filters]);
  const { data: jobs, isLoading, mutate } = usePolling("jobs", fetcher, pollInterval);

  // Dynamic polling: 5s when jobs are running, 15s otherwise
  useEffect(() => {
    const hasRunning = (jobs ?? []).some((j) => j.status === "Running");
    setPollInterval(hasRunning ? 5000 : 15000);
  }, [jobs]);

  const handleTrigger = async (jobType: JobType): Promise<void> => {
    setTriggering(true);
    setTriggerOpen(false);
    try {
      await triggerJob(jobType, false);
      mutate();
    } catch {
      // Error handled by api client
    } finally {
      setTriggering(false);
    }
  };

  if (selectedJob) {
    return <JobDetail job={selectedJob} onBack={() => setSelectedJob(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Jobs</h1>
          <p className="text-sm text-muted-foreground">
            Monitor and manage automation job runs
          </p>
        </div>

        {/* Trigger dropdown */}
        <div className="relative">
          <button
            onClick={() => setTriggerOpen(!triggerOpen)}
            disabled={triggering}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {triggering ? "Triggering..." : "Trigger Job"}
            <ChevronDown className="h-4 w-4" />
          </button>
          {triggerOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setTriggerOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-1 w-48 glass-card rounded-lg py-1 shadow-lg">
                {JOB_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => handleTrigger(type)}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-accent"
                  >
                    {JOB_TYPE_DISPLAY_NAMES[type]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.jobType ?? ""}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              jobType: (e.target.value || undefined) as JobType | undefined,
            }))
          }
          className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground"
        >
          <option value="">All Types</option>
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>
              {JOB_TYPE_DISPLAY_NAMES[t]}
            </option>
          ))}
        </select>
        <select
          value={filters.status ?? ""}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              status: (e.target.value || undefined) as JobStatus | undefined,
            }))
          }
          className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground"
        >
          <option value="">All Statuses</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <JobTable
        jobs={jobs ?? []}
        isLoading={isLoading}
        onSelectJob={setSelectedJob}
      />
    </div>
  );
}
