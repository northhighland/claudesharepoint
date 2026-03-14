"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const table_client_1 = require("../shared/table-client");
const response_1 = require("../shared/response");
const handler = async function (context, req) {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
        // Query recent job runs (last 30 days)
        const recentJobs = await (0, table_client_1.queryEntities)("JobRuns", (0, table_client_1.odata) `Timestamp ge datetime'${thirtyDaysAgoISO}'`);
        // Aggregate total space reclaimed
        const totalStorageReclaimedGB = recentJobs.reduce((sum, job) => sum + (job.SpaceReclaimedGB ?? 0), 0);
        // Count active jobs
        const activeJobs = recentJobs.filter((job) => job.Status === "Running").length;
        // Unique sites from latest completed runs
        const completedJobs = recentJobs.filter((job) => job.Status === "Completed");
        const sitesMonitored = completedJobs.reduce((sum, job) => sum + (job.TotalSites ?? 0), 0);
        // Unique site count approximation: use the max TotalSites from the latest run of each type
        const latestByType = new Map();
        for (const job of completedJobs) {
            const existing = latestByType.get(job.JobType);
            if (!existing || job.StartTime > existing.StartTime) {
                latestByType.set(job.JobType, job);
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
            // Table may not exist yet; default to 0
        }
        // Build storage trend (daily aggregation over last 30 days)
        const trendMap = new Map();
        for (const job of recentJobs) {
            if (job.EndTime && job.SpaceReclaimedGB) {
                const date = job.EndTime.substring(0, 10); // YYYY-MM-DD
                trendMap.set(date, (trendMap.get(date) ?? 0) + job.SpaceReclaimedGB);
            }
        }
        const storageTrend = Array.from(trendMap.entries())
            .map(([date, gb]) => ({ date, gb: Math.round(gb * 100) / 100 }))
            .sort((a, b) => a.date.localeCompare(b.date));
        // Sort recent jobs by start time descending, limit to 10
        const sortedRecentJobs = recentJobs
            .sort((a, b) => (b.StartTime ?? "").localeCompare(a.StartTime ?? ""))
            .slice(0, 10);
        const response = {
            totalStorageReclaimedGB: Math.round(totalStorageReclaimedGB * 100) / 100,
            activeJobs,
            sitesMonitored: uniqueSitesMonitored,
            staleSitesCount,
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