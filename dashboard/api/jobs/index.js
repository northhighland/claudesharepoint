"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const table_client_1 = require("../shared/table-client");
const response_1 = require("../shared/response");
const data_tables_1 = require("@azure/data-tables");
const types_1 = require("../shared/types");
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
        context.log.error("jobs error:", error);
        context.res = (0, response_1.errorResponse)("An internal error occurred.");
    }
};
async function handleListJobs(context, req) {
    const typeFilter = req.query.type;
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
        filters.push((0, data_tables_1.odata) `PartitionKey eq ${typeFilter}`);
    }
    if (statusFilter) {
        filters.push((0, data_tables_1.odata) `Status eq ${statusFilter}`);
    }
    const filter = filters.length > 0 ? filters.join(" and ") : undefined;
    const jobs = await (0, table_client_1.queryEntities)("JobRuns", filter, top);
    // Sort by StartTime descending
    jobs.sort((a, b) => (b.StartTime ?? "").localeCompare(a.StartTime ?? ""));
    context.res = (0, response_1.jsonResponse)(jobs);
}
async function handleGetJob(context, jobId) {
    // Validate jobId format (expected: YYYYMMDD_HHmmss)
    if (!/^\d{8}_\d{6}$/.test(jobId)) {
        context.res = (0, response_1.errorResponse)("Invalid job ID format", 400);
        return;
    }
    // JobRuns use JobType as PartitionKey and RunId as RowKey.
    const jobs = await (0, table_client_1.queryEntities)("JobRuns", (0, data_tables_1.odata) `RowKey eq ${jobId}`);
    if (jobs.length === 0) {
        context.res = (0, response_1.errorResponse)("Job not found", 404);
        return;
    }
    const job = jobs[0];
    // Fetch per-site results for this run
    const resultsTableName = RESULTS_TABLE_MAP[job.JobType];
    let results = [];
    if (resultsTableName) {
        try {
            const runId = job.rowKey ?? "";
            results = await (0, table_client_1.queryEntities)(resultsTableName, (0, data_tables_1.odata) `PartitionKey eq ${runId}`);
        }
        catch {
            // Results table may not exist; return empty array
        }
    }
    context.res = (0, response_1.jsonResponse)({ job, results });
}
exports.default = handler;
//# sourceMappingURL=index.js.map