import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { queryEntities, getEntity } from "../shared/table-client";
import { jsonResponse, errorResponse } from "../shared/response";
import {
  JobRunEntity,
  VersionCleanupResultEntity,
  VALID_JOB_TYPES,
  ValidJobType,
} from "../shared/types";
import { TableEntity, odata } from "@azure/data-tables";
import { mapJobRunEntity, mapVersionCleanupResultEntity } from "../shared/transforms";

/** Map job types to their results table names. */
const RESULTS_TABLE_MAP: Record<string, string> = {
  VersionCleanup: "VersionCleanupResults",
  QuotaManager: "QuotaStatus",
  StaleSiteDetector: "StaleSiteRecommendations",
  RecycleBinCleaner: "RecycleBinResults",
};

const VALID_STATUSES = ["Running", "Completed", "Failed", "Stopped"] as const;

const handler: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  try {
    const jobId = context.bindingData.id as string | undefined;

    if (jobId) {
      return await handleGetJob(context, jobId);
    }

    return await handleListJobs(context, req);
  } catch (error: unknown) {
    context.log.error("jobs error:", error);
    context.res = errorResponse("An internal error occurred.");
  }
};

async function handleListJobs(
  context: Context,
  req: HttpRequest
): Promise<void> {
  const typeFilter = req.query.jobType;
  const statusFilter = req.query.status;
  const topParam = parseInt(req.query.top ?? "50", 10);
  const top = Math.min(Math.max(1, topParam), 200);

  // Validate inputs against allowlists to prevent OData injection
  if (typeFilter && !VALID_JOB_TYPES.includes(typeFilter as ValidJobType)) {
    context.res = errorResponse(
      `Invalid type filter. Must be one of: ${VALID_JOB_TYPES.join(", ")}`,
      400
    );
    return;
  }
  if (statusFilter && !VALID_STATUSES.includes(statusFilter as typeof VALID_STATUSES[number])) {
    context.res = errorResponse(
      `Invalid status filter. Must be one of: ${VALID_STATUSES.join(", ")}`,
      400
    );
    return;
  }

  const filters: string[] = [];
  if (typeFilter) {
    filters.push(odata`PartitionKey eq ${typeFilter}`);
  }
  if (statusFilter) {
    filters.push(odata`Status eq ${statusFilter}`);
  }

  const filter = filters.length > 0 ? filters.join(" and ") : undefined;

  const jobs = await queryEntities<JobRunEntity>("JobRuns", filter, top);

  // Sort by UpdatedAt descending (StartTime is inside Details JSON, not a top-level field)
  const raw = jobs as Array<Record<string, unknown>>;
  raw.sort((a, b) => ((b.UpdatedAt as string) ?? "").localeCompare((a.UpdatedAt as string) ?? ""));

  context.res = jsonResponse(jobs.map(mapJobRunEntity));
}

async function handleGetJob(
  context: Context,
  jobId: string
): Promise<void> {
  // Validate jobId format (expected: YYYYMMDD_HHmmss)
  if (!/^\d{8}_\d{6}$/.test(jobId)) {
    context.res = errorResponse("Invalid job ID format", 400);
    return;
  }

  // JobRuns use JobType as PartitionKey and RunId as RowKey.
  const jobs = await queryEntities<JobRunEntity>(
    "JobRuns",
    odata`RowKey eq ${jobId}`
  );

  if (jobs.length === 0) {
    context.res = errorResponse("Job not found", 404);
    return;
  }

  const job = jobs[0];

  // Fetch per-site results for this run
  // JobType is stored as PartitionKey, not a separate column
  const jobType = String(job.partitionKey ?? job.JobType ?? "");
  const resultsTableName = RESULTS_TABLE_MAP[jobType];
  let mappedResults: unknown[] = [];

  if (resultsTableName) {
    try {
      const runId = job.rowKey ?? "";
      const rawResults = await queryEntities<TableEntity>(
        resultsTableName,
        odata`PartitionKey eq ${runId}`
      );

      // Map results based on job type
      if (jobType === "VersionCleanup") {
        mappedResults = (rawResults as unknown as VersionCleanupResultEntity[]).map(
          mapVersionCleanupResultEntity
        );
      } else {
        mappedResults = rawResults;
      }
    } catch {
      // Results table may not exist; return empty array
    }
  }

  context.res = jsonResponse({ job: mapJobRunEntity(job), results: mappedResults });
}

export default handler;
