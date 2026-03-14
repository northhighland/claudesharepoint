"use client";

import { useState, useCallback } from "react";
import { FileStack, CheckCircle2, XCircle, SkipForward } from "lucide-react";
import { usePolling } from "@/hooks/use-polling";
import { fetchJobs } from "@/lib/api";
import { formatBytes, formatDate, getStatusColor, cn } from "@/lib/utils";
import { JobDetail } from "@/components/jobs/job-detail";
import type { JobRun } from "@/lib/types";

type FilterStatus = "all" | "Completed" | "Failed" | "Running";

export default function VersionsPage(): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [selectedJob, setSelectedJob] = useState<JobRun | null>(null);

  const fetcher = useCallback(
    () => fetchJobs({ jobType: "VersionCleanup" }),
    []
  );
  const { data: jobs, isLoading } = usePolling("version-jobs", fetcher, 30000);

  const filtered = (jobs ?? []).filter(
    (j) => statusFilter === "all" || j.status === statusFilter
  );

  // Summary stats
  const allJobs = jobs ?? [];
  const totalReclaimed = allJobs.reduce((sum, j) => sum + j.totalSpaceReclaimedBytes, 0);
  const totalSites = allJobs.reduce((sum, j) => sum + j.processedSites, 0);
  const totalFailed = allJobs.reduce((sum, j) => sum + j.failedSites, 0);
  const completedCount = allJobs.filter((j) => j.status === "Completed").length;

  if (selectedJob) {
    return <JobDetail job={selectedJob} onBack={() => setSelectedJob(null)} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#F9FAFB]">Version Cleanup</h1>
        <p className="text-[13px] text-[#6B7280]">
          File version cleanup results across SharePoint sites
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-4">
          <div className="flex items-center gap-2">
            <FileStack className="h-4 w-4 text-emerald-400" />
            <p className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Total Reclaimed</p>
          </div>
          <p className="mt-2 text-xl font-semibold text-[#F9FAFB]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {isLoading ? "--" : formatBytes(totalReclaimed)}
          </p>
        </div>
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <p className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Completed Runs</p>
          </div>
          <p className="mt-2 text-xl font-semibold text-[#F9FAFB]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {isLoading ? "--" : completedCount}
          </p>
        </div>
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <p className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Sites Processed</p>
          </div>
          <p className="mt-2 text-xl font-semibold text-[#F9FAFB]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {isLoading ? "--" : totalSites.toLocaleString()}
          </p>
        </div>
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-400" />
            <p className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Failed Sites</p>
          </div>
          <p className="mt-2 text-xl font-semibold text-[#F9FAFB]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {isLoading ? "--" : totalFailed}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(["all", "Completed", "Running", "Failed"] as FilterStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
              statusFilter === status
                ? "bg-emerald-500 text-[#0A0A0A]"
                : "bg-[#1A1A1A] text-[#6B7280] hover:text-[#D1D5DB]"
            )}
          >
            {status === "all" ? "All" : status}
          </button>
        ))}
      </div>

      {/* Results table */}
      <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.06)]">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-[#1A1A1A]" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-[rgba(255,255,255,0.06)]">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
                    Run ID
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
                    Started
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
                    Sites
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
                    Space Reclaimed
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
                    Triggered By
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-[13px] text-[#6B7280]"
                    >
                      No version cleanup runs found
                    </td>
                  </tr>
                ) : (
                  filtered.map((job) => (
                    <tr
                      key={job.runId}
                      onClick={() => setSelectedJob(job)}
                      className="cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-[#D1D5DB]">
                        {job.runId.substring(0, 8)}...
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            getStatusColor(job.status)
                          )}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-[#6B7280]">
                        {formatDate(job.startedAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-[#D1D5DB]">
                        <span>{job.processedSites}</span>
                        {job.failedSites > 0 && (
                          <span className="ml-1 text-red-400">({job.failedSites} failed)</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] font-medium text-[#F9FAFB]">
                        {formatBytes(job.totalSpaceReclaimedBytes)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-[#6B7280]">
                        {job.triggeredBy}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
