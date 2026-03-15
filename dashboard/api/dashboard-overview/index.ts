import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { queryEntities, odata } from "../shared/table-client";
import { jsonResponse, errorResponse } from "../shared/response";
import {
  StaleSiteEntity,
  VersionCleanupResultEntity,
  RecycleBinResultEntity,
  QuotaStatusEntity,
} from "../shared/types";
import { TableEntity } from "@azure/data-tables";

// Raw Table Storage entity — actual field names from Invoke-Orchestrator
interface RawJobRunEntity extends TableEntity {
  // partitionKey = JobType, rowKey = RunId
  Status?: string;
  TotalSites?: number;
  TotalWaves?: number;
  CompletedWaves?: number;
  DryRun?: boolean;
  UpdatedAt?: string;
  Details?: string; // JSON string with StartedAt, CompletedAt, DurationMinutes, etc.
}

interface JobDetails {
  StartedAt?: string;
  CompletedAt?: string;
  DurationMinutes?: number;
  DryRun?: boolean;
  JobsSucceeded?: number;
  JobsFailed?: number;
}

function parseDetails(detailsStr?: string): JobDetails {
  if (!detailsStr) return {};
  try {
    return JSON.parse(detailsStr);
  } catch {
    return {};
  }
}

const handler: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  try {
    // Support ?range=30d|90d|all (default: all)
    const range = req.query.range ?? "all";
    const VALID_RANGES = ["30d", "90d", "all"] as const;
    if (!VALID_RANGES.includes(range as typeof VALID_RANGES[number])) {
      context.res = errorResponse(`Invalid range. Must be one of: ${VALID_RANGES.join(", ")}`, 400);
      return;
    }
    let dateFilter: string | undefined;

    if (range === "30d" || range === "90d") {
      const days = range === "30d" ? 30 : 90;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffISO = cutoff.toISOString();
      dateFilter = odata`Timestamp ge datetime'${cutoffISO}'`;
    }

    // Query job runs within the selected range
    const recentJobs = await queryEntities<RawJobRunEntity>(
      "JobRuns",
      dateFilter
    );

    // Count active jobs
    const activeJobs = recentJobs.filter(
      (job) => job.Status === "Running"
    ).length;

    // Unique sites: max TotalSites from latest completed run of each type
    const completedJobs = recentJobs.filter(
      (job) => job.Status === "Completed"
    );
    const latestByType = new Map<string, RawJobRunEntity>();
    for (const job of completedJobs) {
      const jobType = String(job.partitionKey ?? "");
      const existing = latestByType.get(jobType);
      if (!existing || (job.UpdatedAt ?? "") > (existing.UpdatedAt ?? "")) {
        latestByType.set(jobType, job);
      }
    }
    const uniqueSitesMonitored = Array.from(latestByType.values()).reduce(
      (max, job) => Math.max(max, job.TotalSites ?? 0),
      0
    );

    // Query stale site recommendations
    let staleSitesCount = 0;
    try {
      const staleSites = await queryEntities<StaleSiteEntity>(
        "StaleSiteRecommendations",
        odata`StalenessScore gt 50`
      );
      staleSitesCount = staleSites.length;
    } catch {
      // Table may not exist yet
    }

    // Calculate Tenant Health Score (0-100 composite)
    let quotaHealthPercent = 100;
    let stalenessHealthPercent = 100;

    // Quota health: % of sites below 85% usage (deduplicated)
    try {
      const quotaEntries = await queryEntities<QuotaStatusEntity>("QuotaStatus");
      const quotaSiteMap = new Map<string, QuotaStatusEntity>();
      for (const entry of quotaEntries) {
        const key = entry.SiteUrl ?? "";
        if (!key) continue;
        const existing = quotaSiteMap.get(key);
        if (!existing || (entry.RunId ?? "") > (existing.RunId ?? "")) {
          quotaSiteMap.set(key, entry);
        }
      }
      const uniqueQuotaSites = Array.from(quotaSiteMap.values());
      if (uniqueQuotaSites.length > 0) {
        const healthySites = uniqueQuotaSites.filter(s => (s.PercentUsed ?? 0) < 85).length;
        quotaHealthPercent = Math.round((healthySites / uniqueQuotaSites.length) * 100);
      }
    } catch {
      // Table may not exist yet
    }

    // Staleness health: % of Active/LowActivity sites (deduplicated)
    try {
      const allStale = await queryEntities<StaleSiteEntity>("StaleSiteRecommendations");
      const staleSiteMap = new Map<string, StaleSiteEntity>();
      for (const site of allStale) {
        const key = site.SiteUrl ?? "";
        if (!key) continue;
        const existing = staleSiteMap.get(key);
        if (!existing || (site.RunId ?? "") > (existing.RunId ?? "")) {
          staleSiteMap.set(key, site);
        }
      }
      const uniqueStaleSites = Array.from(staleSiteMap.values());
      if (uniqueStaleSites.length > 0) {
        const activeSites = uniqueStaleSites.filter(s =>
          s.Category === "Active" || s.Category === "LowActivity"
        ).length;
        stalenessHealthPercent = Math.round((activeSites / uniqueStaleSites.length) * 100);
        staleSitesCount = uniqueStaleSites.filter(s => (s.StalenessScore ?? 0) > 50).length;
      }
    } catch {
      // Table may not exist yet
    }

    // Job success rate
    const jobSuccessPercent = completedJobs.length > 0
      ? Math.round((completedJobs.filter(j => {
          const d = parseDetails(j.Details);
          return (d.JobsFailed ?? 0) === 0;
        }).length / completedJobs.length) * 100)
      : 100;

    // Weighted composite: quota 40%, staleness 40%, job success 20%
    const tenantHealthScore = Math.round(
      quotaHealthPercent * 0.4 +
      stalenessHealthPercent * 0.4 +
      jobSuccessPercent * 0.2
    );

    // Calculate totalSitesProcessed from completed non-DryRun jobs
    let totalSitesProcessed = 0;
    for (const job of completedJobs) {
      const details = parseDetails(job.Details);
      const isDryRun = job.DryRun ?? details.DryRun ?? false;
      if (!isDryRun) {
        totalSitesProcessed += (details.JobsSucceeded ?? 0) + (details.JobsFailed ?? 0);
      }
    }
    const adminHoursSaved = Math.round((totalSitesProcessed * 15 / 60) * 100) / 100;
    const costAvoidanceDollars = Math.round(adminHoursSaved * 85 * 100) / 100;

    // Build storage trend from actual space reclaimed in results tables
    const trendMap = new Map<string, number>();
    let totalStorageReclaimedBytes = 0;

    try {
      const versionResults = await queryEntities<VersionCleanupResultEntity>(
        "VersionCleanupResults",
        dateFilter
      );
      for (const result of versionResults) {
        const mbReclaimed = result.SpaceReclaimedMB ?? 0;
        const bytes = Math.round(mbReclaimed * 1024 * 1024);
        totalStorageReclaimedBytes += bytes;
        if (result.ProcessedAt) {
          const date = result.ProcessedAt.substring(0, 10);
          trendMap.set(date, (trendMap.get(date) ?? 0) + mbReclaimed / 1024);
        }
      }
    } catch {
      // Table may not exist yet
    }

    try {
      const recycleBinResults = await queryEntities<RecycleBinResultEntity>(
        "RecycleBinResults",
        dateFilter
      );
      for (const result of recycleBinResults) {
        const mbReclaimed = result.SpaceReclaimedMB ?? 0;
        const bytes = Math.round(mbReclaimed * 1024 * 1024);
        totalStorageReclaimedBytes += bytes;
        if (result.ProcessedAt) {
          const date = result.ProcessedAt.substring(0, 10);
          trendMap.set(date, (trendMap.get(date) ?? 0) + mbReclaimed / 1024);
        }
      }
    } catch {
      // Table may not exist yet
    }

    const storageTrend = Array.from(trendMap.entries())
      .map(([date, gb]) => ({ date, reclaimedGB: Math.round(gb * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Transform jobs to frontend format
    const sortedRecentJobs = recentJobs
      .sort((a, b) => (b.UpdatedAt ?? "").localeCompare(a.UpdatedAt ?? ""))
      .slice(0, 10)
      .map((job) => {
        const details = parseDetails(job.Details);
        const durationMs = details.DurationMinutes
          ? Math.round(details.DurationMinutes * 60 * 1000)
          : details.StartedAt && details.CompletedAt
            ? new Date(details.CompletedAt).getTime() - new Date(details.StartedAt).getTime()
            : undefined;

        return {
          partitionKey: String(job.partitionKey ?? ""),
          rowKey: String(job.rowKey ?? ""),
          runId: String(job.rowKey ?? ""),
          jobType: String(job.partitionKey ?? ""),
          status: job.Status ?? "",
          startedAt: details.StartedAt ?? job.UpdatedAt ?? "",
          completedAt: details.CompletedAt ?? undefined,
          durationMs,
          totalSites: job.TotalSites ?? 0,
          processedSites: (details.JobsSucceeded ?? 0) + (details.JobsFailed ?? 0),
          failedSites: details.JobsFailed ?? 0,
          skippedSites: 0,
          totalSpaceReclaimedBytes: 0,
          errorMessage: undefined,
          triggeredBy: "Automation",
          isDryRun: job.DryRun ?? details.DryRun ?? false,
          totalWaves: job.TotalWaves ?? undefined,
          completedWaves: job.CompletedWaves ?? undefined,
          jobsSucceeded: details.JobsSucceeded ?? undefined,
          jobsFailed: details.JobsFailed ?? undefined,
        };
      });

    const response = {
      totalStorageReclaimedBytes,
      storageReclaimedTrendPercent: 0,
      activeJobs,
      activeJobsTrendPercent: 0,
      sitesMonitored: uniqueSitesMonitored,
      sitesMonitoredTrendPercent: 0,
      staleSitesFound: staleSitesCount,
      staleSitesTrendPercent: 0,
      storageTrend,
      recentJobs: sortedRecentJobs,
      totalSitesProcessed,
      adminHoursSaved,
      costAvoidanceDollars,
      tenantHealthScore,
      quotaHealthPercent,
      stalenessHealthPercent,
      jobSuccessPercent,
    };

    context.res = jsonResponse(response);
  } catch (error: unknown) {
    context.log.error("dashboard-overview error:", error);
    context.res = errorResponse("An internal error occurred.");
  }
};

export default handler;
