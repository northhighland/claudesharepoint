"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const automation_client_1 = require("../shared/automation-client");
const response_1 = require("../shared/response");
const types_1 = require("../shared/types");
const auth_1 = require("../shared/auth");
const handler = async function (context, req) {
    try {
        const principal = (0, auth_1.getClientPrincipal)(req);
        const body = req.body;
        if (!body || !body.jobType) {
            context.res = (0, response_1.errorResponse)("Request body must include jobType.", 400);
            return;
        }
        const { jobType, dryRun, batchSize } = body;
        if (!types_1.VALID_JOB_TYPES.includes(jobType)) {
            context.res = (0, response_1.errorResponse)(`Invalid jobType. Must be one of: ${types_1.VALID_JOB_TYPES.join(", ")}`, 400);
            return;
        }
        const isDryRun = dryRun ?? true;
        const validBatchSize = batchSize && Number(batchSize) > 0 ? Number(batchSize) : undefined;
        context.log.info(`[AUDIT] Runbook triggered: JobType=${jobType}, DryRun=${isDryRun}, BatchSize=${validBatchSize ?? "default"}, User=${principal.userDetails}`);
        const params = {
            JobType: jobType,
            DryRun: String(isDryRun),
        };
        if (validBatchSize) {
            params.BatchSize = String(validBatchSize);
        }
        const jobId = await (0, automation_client_1.triggerRunbook)("Invoke-Orchestrator", params);
        context.res = (0, response_1.jsonResponse)({
            jobId,
            message: `Job ${jobType} triggered successfully${isDryRun ? " (dry run)" : ""}.`,
        }, 202);
    }
    catch (error) {
        context.log.error("jobs-trigger error:", error);
        context.log.error("Failed to trigger job:", error);
        context.res = (0, response_1.errorResponse)("Failed to trigger job. Please try again or contact support.");
    }
};
exports.default = handler;
//# sourceMappingURL=index.js.map