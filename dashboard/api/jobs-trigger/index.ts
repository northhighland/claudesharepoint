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

    const { jobType, dryRun, batchSize } = body;

    if (!VALID_JOB_TYPES.includes(jobType as ValidJobType)) {
      context.res = errorResponse(
        `Invalid jobType. Must be one of: ${VALID_JOB_TYPES.join(", ")}`,
        400
      );
      return;
    }

    // Validate dryRun is boolean if provided (prevent type confusion)
    if (dryRun !== undefined && typeof dryRun !== "boolean") {
      context.res = errorResponse("dryRun must be a boolean.", 400);
      return;
    }

    const isDryRun = dryRun ?? true;

    // Validate batchSize: must be a positive integer, capped at 500
    // to prevent resource exhaustion (OWASP A04:2021 — Insecure Design)
    const MAX_BATCH_SIZE = 500;
    const validBatchSize = batchSize && Number.isInteger(Number(batchSize)) && Number(batchSize) > 0
      ? Math.min(Number(batchSize), MAX_BATCH_SIZE)
      : undefined;

    context.log.info(
      `[AUDIT] Runbook triggered: JobType=${jobType}, DryRun=${isDryRun}, BatchSize=${validBatchSize ?? "default"}, User=${principal.userDetails}`
    );

    const params: Record<string, string> = {
      JobType: jobType,
      DryRun: String(isDryRun),
    };
    if (validBatchSize) {
      params.BatchSize = String(validBatchSize);
    }

    const jobId = await triggerRunbook("Invoke-Orchestrator", params);

    context.res = jsonResponse(
      {
        jobId,
        message: `Job ${jobType} triggered successfully${isDryRun ? " (dry run)" : ""}.`,
      },
      202
    );
  } catch (error: unknown) {
    context.log.error("jobs-trigger error:", error);
    context.log.error("Failed to trigger job:", error);
    context.res = errorResponse("Failed to trigger job. Please try again or contact support.");
  }
};

export default handler;
