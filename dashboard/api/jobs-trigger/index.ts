import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { triggerRunbook } from "../shared/automation-client";
import { jsonResponse, errorResponse } from "../shared/response";
import { TriggerJobRequest, VALID_JOB_TYPES, ValidJobType } from "../shared/types";
import { getClientPrincipal } from "../shared/auth";

const handler: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  try {
    const principal = getClientPrincipal(req);
    const body = req.body as TriggerJobRequest | undefined;

    if (!body || !body.jobType) {
      context.res = errorResponse("Request body must include jobType.", 400);
      return;
    }

    const { jobType, dryRun } = body;

    if (!VALID_JOB_TYPES.includes(jobType as ValidJobType)) {
      context.res = errorResponse(
        `Invalid jobType. Must be one of: ${VALID_JOB_TYPES.join(", ")}`,
        400
      );
      return;
    }

    const isDryRun = dryRun ?? true;

    context.log.info(
      `[AUDIT] Runbook triggered: JobType=${jobType}, DryRun=${isDryRun}, User=${principal.userDetails}`
    );

    const jobId = await triggerRunbook("Invoke-Orchestrator", {
      JobType: jobType,
      DryRun: String(isDryRun),
    });

    context.res = jsonResponse(
      {
        jobId,
        message: `Job ${jobType} triggered successfully${isDryRun ? " (dry run)" : ""}.`,
      },
      202
    );
  } catch (error: unknown) {
    context.log.error("jobs-trigger error:", error);
    context.res = errorResponse("Failed to trigger job. Contact your administrator.");
  }
};

export default handler;
