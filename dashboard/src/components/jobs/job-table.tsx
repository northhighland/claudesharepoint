"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { cn, formatDate, formatDuration, formatBytes, getStatusColor } from "@/lib/utils";
import type { JobRun } from "@/lib/types";
import { JobProgress } from "@/components/jobs/job-progress";

interface JobTableProps {
  jobs: JobRun[];
  isLoading: boolean;
  onSelectJob: (job: JobRun) => void;
}

type SortKey = "startedAt" | "jobType" | "status" | "processedSites" | "totalSpaceReclaimedBytes";
type SortDir = "asc" | "desc";

export function JobTable({ jobs, isLoading, onSelectJob }: JobTableProps): React.ReactElement {
  const [sortKey, setSortKey] = useState<SortKey>("startedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey): void => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...jobs].sort((a, b) => {
    let aVal: string | number = a[sortKey] ?? "";
    let bVal: string | number = b[sortKey] ?? "";
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    aVal = Number(aVal);
    bVal = Number(bVal);
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  const SortHeader = ({
    label,
    sortable,
  }: {
    label: string;
    sortable: SortKey;
  }): React.ReactElement => (
    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
      <button
        className="flex items-center gap-1 hover:text-foreground"
        onClick={() => handleSort(sortable)}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="space-y-2 p-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <SortHeader label="Type" sortable="jobType" />
              <SortHeader label="Status" sortable="status" />
              <SortHeader label="Started" sortable="startedAt" />
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Duration
              </th>
              <SortHeader label="Sites" sortable="processedSites" />
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Errors
              </th>
              <SortHeader label="Reclaimed" sortable="totalSpaceReclaimedBytes" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No jobs found
                </td>
              </tr>
            ) : (
              sorted.map((job) => (
                <tr
                  key={job.runId}
                  onClick={() => onSelectJob(job)}
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">
                    {job.jobType}
                    {job.isDryRun && (
                      <span className="ml-2 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
                        Dry Run
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        getStatusColor(job.status)
                      )}
                    >
                      {job.status}
                    </span>
                    {job.status === "Running" && (
                      <div className="mt-1">
                        <JobProgress job={job} compact />
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(job.startedAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                    {job.durationMs ? formatDuration(job.durationMs) : "--"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    {job.processedSites} / {job.totalSites}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    {job.failedSites > 0 ? (
                      <span className="text-red-600">{job.failedSites}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">
                    {formatBytes(job.totalSpaceReclaimedBytes)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
