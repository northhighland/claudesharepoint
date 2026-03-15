"use client";

import { useState, useCallback, useEffect } from "react";
import { Play } from "lucide-react";
import { usePolling } from "@/hooks/use-polling";
import { fetchQuotaStatus, fetchJobs } from "@/lib/api";
import { formatBytes, formatDate, getStatusColor, cn } from "@/lib/utils";
import { TopSitesList } from "@/components/quota/top-sites-list";
import { DistributionChart } from "@/components/quota/distribution-chart";
import { QuotaHeatmap } from "@/components/quota/quota-heatmap";
import { QuotaHistory } from "@/components/quota/quota-history";
import { QuotaHealthDonut } from "@/components/quota/quota-health-donut";
import { ActiveJobBanner } from "@/components/jobs/active-job-banner";
import { JobDetail } from "@/components/jobs/job-detail";
import { TriggerModal } from "@/components/jobs/trigger-modal";
import { ExportButton } from "@/components/ui/export-button";
import { SiteSearch } from "@/components/ui/site-search";
import { DataFreshness } from "@/components/ui/data-freshness";
import { NextRunIndicator } from "@/components/ui/next-run-indicator";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { JobRun, QuotaStatus } from "@/lib/types";

type FilterStatus = "all" | "Completed" | "Failed" | "Running" | "PartialComplete";

/** Deduplicate sites by URL (safety net — API should already handle this) */
function dedupSites(sites: QuotaStatus[]): QuotaStatus[] {
  const map = new Map<string, QuotaStatus>();
  for (const site of sites) {
    if (!map.has(site.siteUrl)) {
      map.set(site.siteUrl, site);
    }
  }
  return Array.from(map.values());
}

export default function QuotaPage(): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [selectedJob, setSelectedJob] = useState<JobRun | null>(null);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [siteSearch, setSiteSearch] = useState("");

  const { data, isLoading } = usePolling("quota", () => fetchQuotaStatus(), 60000);
  const lastUpdated = data ? new Date().toISOString() : undefined;

  const [pollInterval, setPollInterval] = useState(60000);
  const jobFetcher = useCallback(
    () => fetchJobs({ jobType: "QuotaManager" }),
    []
  );
  const { data: jobs, isLoading: jobsLoading, mutate } = usePolling("quota-jobs", jobFetcher, pollInterval);

  // Dynamic polling: 5s when jobs are running, 60s otherwise
  useEffect(() => {
    const hasRunning = (jobs ?? []).some((j) => j.status === "Running");
    setPollInterval(hasRunning ? 5000 : 60000);
  }, [jobs]);

  const filteredJobs = (jobs ?? []).filter(
    (j) => statusFilter === "all" || j.status === statusFilter
  );

  // Deduplicate sites client-side as safety net
  const sites = dedupSites(data?.sites ?? []);
  const distribution = data?.distribution ?? [];

  const critical = sites.filter((s) => s.percentUsed >= 90).length;
  const warning = sites.filter((s) => s.percentUsed >= 80 && s.percentUsed < 90).length;
  const totalUsedBytes = sites.reduce((sum, s) => sum + s.usedBytes, 0);

  // Search filter — applied to site lists but not summary stats
  const searchedSites = siteSearch
    ? sites.filter(
        (s) =>
          s.siteName.toLowerCase().includes(siteSearch.toLowerCase()) ||
          s.siteUrl.toLowerCase().includes(siteSearch.toLowerCase())
      )
    : sites;

  if (selectedJob) {
    return <JobDetail job={selectedJob} onBack={() => setSelectedJob(null)} />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Quota Management</h1>
          <p className="text-sm text-muted-foreground">
            Storage health across the environment
          </p>
          <div className="mt-1 flex items-center gap-3">
            <DataFreshness lastUpdated={lastUpdated} pollInterval={60000} />
            <NextRunIndicator jobType="QuotaManager" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={sites as unknown as Record<string, unknown>[]}
            filename="quota-status"
            columns={[
              { key: "siteUrl", label: "Site URL" },
              { key: "siteName", label: "Site Name" },
              { key: "usedBytes", label: "Used" },
              { key: "quotaBytes", label: "Quota" },
              { key: "percentUsed", label: "% Used" },
              { key: "autoIncreased", label: "Auto Increased" },
            ]}
          />
          <button
            onClick={() => setTriggerOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Play className="h-4 w-4" />
            Run Quota Manager
          </button>
        </div>
      </div>

      {/* Active job banner */}
      <ActiveJobBanner jobs={jobs ?? []} />

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="glass-card rounded-xl p-4 animate-fade-in-up">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Sites</p>
          <p className="mt-1 font-mono text-2xl font-bold">{isLoading ? "--" : sites.length.toLocaleString()}</p>
        </div>
        <div className="glass-card rounded-xl p-4 animate-fade-in-up-delay-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Critical (&gt;90%)
            <InfoTooltip text="Sites using more than 90% of their storage quota. Auto-increase is triggered at this threshold." className="ml-1" />
          </p>
          <p className={cn(
            "mt-1 font-mono text-2xl font-bold",
            !isLoading && critical > 0 ? "text-red-400" : "text-muted-foreground"
          )}>
            {isLoading ? "--" : critical}
          </p>
        </div>
        <div className="glass-card rounded-xl p-4 animate-fade-in-up-delay-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Warning (80-90%)
            <InfoTooltip text="Sites between 80-90% usage. Monitor closely — approaching auto-increase threshold." className="ml-1" />
          </p>
          <p className={cn(
            "mt-1 font-mono text-2xl font-bold",
            !isLoading && warning > 0 ? "text-amber-400" : "text-muted-foreground"
          )}>
            {isLoading ? "--" : warning}
          </p>
        </div>
        <div className="glass-card rounded-xl p-4 animate-fade-in-up-delay-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Storage Used</p>
          <p className="mt-1 font-mono text-2xl font-bold text-primary">{isLoading ? "--" : formatBytes(totalUsedBytes)}</p>
        </div>
      </div>

      {/* Two-column: Donut + Distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        <QuotaHealthDonut sites={sites} isLoading={isLoading} />
        <DistributionChart data={distribution} isLoading={isLoading} />
      </div>

      {/* Site search */}
      <SiteSearch
        value={siteSearch}
        onChange={setSiteSearch}
        resultCount={siteSearch ? searchedSites.length : undefined}
        totalCount={siteSearch ? sites.length : undefined}
      />

      {/* Heatmap — full width */}
      <QuotaHeatmap sites={searchedSites} isLoading={isLoading} />

      {/* Top 20 lists side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TopSitesList
          title="Top 20 — Highest % Used"
          sites={searchedSites}
          metric="percentUsed"
          limit={20}
        />
        <TopSitesList
          title="Top 20 — Largest by GB"
          sites={searchedSites}
          metric="usedBytes"
          limit={20}
        />
      </div>

      {/* Auto-increase history */}
      <QuotaHistory sites={searchedSites} isLoading={isLoading} />

      {/* Recent Quota Runs */}
      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Recent Quota Runs</h2>

        {/* Status filter */}
        <div className="flex gap-2">
          {(["all", "Completed", "Running", "Failed", "PartialComplete"] as FilterStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                statusFilter === status
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {status === "all" ? "All" : status === "PartialComplete" ? "Partial" : status}
            </button>
          ))}
        </div>

        {/* Run history table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {jobsLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Run ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Started
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Sites
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Space Reclaimed
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Triggered By
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredJobs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                      >
                        No quota manager runs found
                      </td>
                    </tr>
                  ) : (
                    filteredJobs.map((job) => (
                      <tr
                        key={job.runId}
                        onClick={() => setSelectedJob(job)}
                        className="cursor-pointer transition-colors hover:bg-accent/50"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-xs">
                          {job.runId.substring(0, 8)}...
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
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                          {formatDate(job.startedAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <span>{job.processedSites}</span>
                          {job.failedSites > 0 && (
                            <span className="ml-1 text-red-600">({job.failedSites} failed)</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">
                          {formatBytes(job.totalSpaceReclaimedBytes)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
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

      <TriggerModal
        jobType="QuotaManager"
        isOpen={triggerOpen}
        onClose={() => setTriggerOpen(false)}
        onTriggered={() => mutate()}
      />
    </div>
  );
}
