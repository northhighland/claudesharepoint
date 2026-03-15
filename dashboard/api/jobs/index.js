"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const table_client_1 = require("../shared/table-client");
const response_1 = require("../shared/response");
const types_1 = require("../shared/types");
const table_client_2 = require("../shared/table-client");
const transforms_1 = require("../shared/transforms");
/** Map job types to their results table names. */
const RESULTS_TABLE_MAP = {
    VersionCleanup: "VersionCleanupResults",
    QuotaManager: "QuotaStatus",
    StaleSiteDetector: "StaleSiteRecommendations",
    RecycleBinCleaner: "RecycleBinResults",
};
const VALID_STATUSES = ["Running", "Completed", "Failed", "Stopped"];
const handler = async function (context, req) {
    try {
        const jobId = context.bindingData.id;
        if (jobId) {
            return await handleGetJob(context, jobId);
        }
        return await handleListJobs(context, req);
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        context.log.error("jobs error:", errMsg);
        context.res = (0, response_1.errorResponse)(`Job query failed: ${errMsg}`);
    }
};
async function handleListJobs(context, req) {
    const typeFilter = req.query.jobType;
    const statusFilter = req.query.status;
    const topParam = parseInt(req.query.top ?? "50", 10);
    const top = Math.min(Math.max(1, topParam), 200);
    // Validate inputs against allowlists to prevent OData injection
    if (typeFilter && !types_1.VALID_JOB_TYPES.includes(typeFilter)) {
        context.res = (0, response_1.errorResponse)(`Invalid type filter. Must be one of: ${types_1.VALID_JOB_TYPES.join(", ")}`, 400);
        return;
    }
    if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
        context.res = (0, response_1.errorResponse)(`Invalid status filter. Must be one of: ${VALID_STATUSES.join(", ")}`, 400);
        return;
    }
    const filters = [];
    if (typeFilter) {
        filters.push((0, table_client_2.odata) `PartitionKey eq ${typeFilter}`);
    }
    if (statusFilter) {
        filters.push((0, table_client_2.odata) `Status eq ${statusFilter}`);
    }
    const filter = filters.length > 0 ? filters.join(" and ") : undefined;
    const jobs = await (0, table_client_1.queryEntities)("JobRuns", filter, top);
    // Sort by UpdatedAt descending (StartTime is inside Details JSON, not a top-level field)
    const raw = jobs;
    raw.sort((a, b) => (b.UpdatedAt ?? "").localeCompare(a.UpdatedAt ?? ""));
    context.res = (0, response_1.jsonResponse)(jobs.map(transforms_1.mapJobRunEntity));
}
async function handleGetJob(context, jobId) {
    // Validate jobId format (expected: YYYYMMDD_HHmmss)
    if (!/^\d{8}_\d{6}$/.test(jobId)) {
        context.res = (0, response_1.errorResponse)("Invalid job ID format", 400);
        return;
    }
    // JobRuns use JobType as PartitionKey and RunId as RowKey.
    const jobs = await (0, table_client_1.queryEntities)("JobRuns", (0, table_client_2.odata) `RowKey eq ${jobId}`);
    if (jobs.length === 0) {
        context.res = (0, response_1.errorResponse)("Job not found", 404);
        return;
    }
    const job = jobs[0];
    // Fetch per-site results for this run
    // JobType is stored as PartitionKey, not a separate column
    const jobType = String(job.partitionKey ?? job.JobType ?? "");
    const resultsTableName = RESULTS_TABLE_MAP[jobType];
    let mappedResults = [];
    if (resultsTableName) {
        try {
            const runId = String(job.rowKey ?? "");
            context.log.info(`Querying ${resultsTableName} with PartitionKey='${runId}'`);
            const rawResults = await (0, table_client_1.queryEntities)(resultsTableName, (0, table_client_2.odata) `PartitionKey eq ${runId}`);
            context.log.info(`Got ${rawResults.length} results from ${resultsTableName}`);
            // Map results based on job type
            if (jobType === "VersionCleanup") {
                mappedResults = rawResults.map(transforms_1.mapVersionCleanupResultEntity);
            }
            else if (jobType === "QuotaManager") {
                mappedResults = rawResults.map(transforms_1.mapQuotaStatusEntity);
            }
            else if (jobType === "StaleSiteDetector") {
                mappedResults = rawResults.map(transforms_1.mapStaleSiteEntity);
            }
            else if (jobType === "RecycleBinCleaner") {
                mappedResults = rawResults.map(transforms_1.mapRecycleBinResultEntity);
            }
            else {
                mappedResults = rawResults;
            }
        }
        catch (resultsError) {
            context.log.error(`Failed to fetch results from ${resultsTableName} for runId=${job.rowKey}:`, resultsError);
        }
    }
    context.res = (0, response_1.jsonResponse)({ job: (0, transforms_1.mapJobRunEntity)(job), results: mappedResults });
}
exports.default = handler;
//# sourceMappingURL=index.js.map