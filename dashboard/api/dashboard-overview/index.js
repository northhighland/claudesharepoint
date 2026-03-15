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
        // Support ?range=30d|90d|all (default: all)
        const range = req.query.range ?? "all";
        const VALID_RANGES = ["30d", "90d", "all"];
        if (!VALID_RANGES.includes(range)) {
            context.res = (0, response_1.errorResponse)(`Invalid range. Must be one of: ${VALID_RANGES.join(", ")}`, 400);
            return;
        }
        let dateFilter;
        if (range === "30d" || range === "90d") {
            const days = range === "30d" ? 30 : 90;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            const cutoffISO = cutoff.toISOString();
            dateFilter = (0, table_client_1.odata) `Timestamp ge datetime'${cutoffISO}'`;
        }
        // Query job runs within the selected range
        const recentJobs = await (0, table_client_1.queryEntities)("JobRuns", dateFilter);
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
        const trendMap = new Map();
        let totalStorageReclaimedBytes = 0;
        try {
            const versionResults = await (0, table_client_1.queryEntities)("VersionCleanupResults", dateFilter);
            for (const result of versionResults) {
                const mbReclaimed = result.SpaceReclaimedMB ?? 0;
                const bytes = Math.round(mbReclaimed * 1024 * 1024);
                totalStorageReclaimedBytes += bytes;
                if (result.ProcessedAt) {
                    const date = result.ProcessedAt.substring(0, 10);
                    trendMap.set(date, (trendMap.get(date) ?? 0) + mbReclaimed / 1024);
                }
            }
        }
        catch {
            // Table may not exist yet
        }
        try {
            const recycleBinResults = await (0, table_client_1.queryEntities)("RecycleBinResults", dateFilter);
            for (const result of recycleBinResults) {
                const mbReclaimed = result.SpaceReclaimedMB ?? 0;
                const bytes = Math.round(mbReclaimed * 1024 * 1024);
                totalStorageReclaimedBytes += bytes;
                if (result.ProcessedAt) {
                    const date = result.ProcessedAt.substring(0, 10);
                    trendMap.set(date, (trendMap.get(date) ?? 0) + mbReclaimed / 1024);
                }
            }
        }
        catch {
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