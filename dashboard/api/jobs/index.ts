import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { queryEntities, getEntity } from "../shared/table-client";
import { jsonResponse, errorResponse } from "../shared/response";
import {
  JobRunEntity,
  VersionCleanupResultEntity,
  QuotaStatusEntity,
  StaleSiteEntity,
  RecycleBinResultEntity,
} from "../shared/types";
import { TableEntity } from "@azure/data-tables";

/** Map job types to their results table names. */
const RESULTS_TABLE_MAP: Record<string, string> = {
  VersionCleanup: "VersionCleanupResults",
  QuotaManager: "QuotaStatus",
  StaleSiteDetector: "StaleSiteRecommendations",
  RecycleBinCleaner: "RecycleBinResults",
};

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
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    context.log.error("jobs error:", message);
    context.res = errorResponse(message);
  }
};

async function handleListJobs(
  context: Context,
  req: HttpRequest
): Promise<void> {
  const typeFilter = req.query.type;
  const statusFilter = req.query.status;
  const top = parseInt(req.query.top ?? "50", 10);

  const filters: string[] = [];
  if (typeFilter) {
    filters.push(`PartitionKey eq '${typeFilter}'`);
  }
  if (statusFilter) {
    filters.push(`Status eq '${statusFilter}'`);
  }

  const filter = filters.length > 0 ? filters.join(" and ") : undefined;

  const jobs = await queryEntities<JobRunEntity>("JobRuns", filter, top);

  // Sort by StartTime descending
  jobs.sort((a, b) => (b.StartTime ?? "").localeCompare(a.StartTime ?? ""));

  context.res = jsonResponse(jobs);
}

async function handleGetJob(
  context: Context,
  jobId: string
): Promise<void> {
  // JobRuns use JobType as PartitionKey and RunId as RowKey.
  // Since we don't know the partition key from the URL alone,
  // scan across all partitions for this RunId.
  const jobs = await queryEntities<JobRunEntity>(
    "JobRuns",
    `RowKey eq '${jobId}'`
  );

  if (jobs.length === 0) {
    context.res = errorResponse("Job not found", 404);
    return;
  }

  const job = jobs[0];

  // Fetch per-site results for this run
  const resultsTableName = RESULTS_TABLE_MAP[job.JobType];
  let results: TableEntity[] = [];

  if (resultsTableName) {
    try {
      results = await queryEntities<TableEntity>(
        resultsTableName,
        `PartitionKey eq '${job.rowKey}'`
      );
    } catch {
      // Results table may not exist; return empty array
    }
  }

  context.res = jsonResponse({ job, results });
}

export default handler;
