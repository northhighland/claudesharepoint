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
        const { jobType, dryRun } = body;
        if (!types_1.VALID_JOB_TYPES.includes(jobType)) {
            context.res = (0, response_1.errorResponse)(`Invalid jobType. Must be one of: ${types_1.VALID_JOB_TYPES.join(", ")}`, 400);
            return;
        }
        const isDryRun = dryRun ?? true;
        context.log.info(`[AUDIT] Runbook triggered: JobType=${jobType}, DryRun=${isDryRun}, User=${principal.userDetails}`);
        const jobId = await (0, automation_client_1.triggerRunbook)("Invoke-Orchestrator", {
            JobType: jobType,
            DryRun: String(isDryRun),
        });
        context.res = (0, response_1.jsonResponse)({
            jobId,
            message: `Job ${jobType} triggered successfully${isDryRun ? " (dry run)" : ""}.`,
        }, 202);
    }
    catch (error) {
        context.log.error("jobs-trigger error:", error);
        context.res = (0, response_1.errorResponse)("Failed to trigger job. Contact your administrator.");
    }
};
exports.default = handler;
//# sourceMappingURL=index.js.map