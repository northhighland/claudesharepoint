"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const table_client_1 = require("../shared/table-client");
const response_1 = require("../shared/response");
function parseDetails(detailsStr) {
    if (!detailsStr)
        return {};
    try {
        return JSON.parse(detailsStr);
    }
    catch {
        return {};
    }
}
const handler = async function (context, req) {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
        // Query recent job runs (last 30 days)
        const recentJobs = await (0, table_client_1.queryEntities)("JobRuns", (0, table_client_1.odata) `Timestamp ge datetime'${thirtyDaysAgoISO}'`);
        // Count active jobs
        const activeJobs = recentJobs.filter((job) => job.Status === "Running").length;
        // Unique sites: max TotalSites from latest completed run of each type
        const completedJobs = recentJobs.filter((job) => job.Status === "Completed");
        const latestByType = new Map();
        for (const job of completedJobs) {
            const jobType = String(job.partitionKey ?? "");
            const existing = latestByType.get(jobType);
            if (!existing || (job.UpdatedAt ?? "") > (existing.UpdatedAt ?? "")) {
                latestByType.set(jobType, job);
            }
        }
        const uniqueSitesMonitored = Array.from(latestByType.values()).reduce((max, job) => Math.max(max, job.TotalSites ?? 0), 0);
        // Query stale site recommendations
        let staleSitesCount = 0;
        try {
            const staleSites = await (0, table_client_1.queryEntities)("StaleSiteRecommendations", (0, table_client_1.odata) `StalenessScore gt 50`);
            staleSitesCount = staleSites.length;
        }
        catch {
            // Table may not exist yet
        }
        // Build storage trend from Details.CompletedAt dates
        const trendMap = new Map();
        for (const job of recentJobs) {
            const details = parseDetails(job.Details);
            if (details.CompletedAt) {
                const date = details.CompletedAt.substring(0, 10);
                // No per-job space data at top level; count completions per day
                trendMap.set(date, (trendMap.get(date) ?? 0) + 1);
            }
        }
        const storageTrend = Array.from(trendMap.entries())
            .map(([date, count]) => ({ date, reclaimedGB: count }))
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
            };
        });
        const response = {
            totalStorageReclaimedBytes: 0,
            storageReclaimedTrendPercent: 0,
            activeJobs,
            activeJobsTrendPercent: 0,
            sitesMonitored: uniqueSitesMonitored,
            sitesMonitoredTrendPercent: 0,
            staleSitesFound: staleSitesCount,
            staleSitesTrendPercent: 0,
            storageTrend,
            recentJobs: sortedRecentJobs,
        };
        context.res = (0, response_1.jsonResponse)(response);
    }
    catch (error) {
        context.log.error("dashboard-overview error:", error);
        context.res = (0, response_1.errorResponse)("An internal error occurred.");
    }
};
exports.default = handler;
//# sourceMappingURL=index.js.map