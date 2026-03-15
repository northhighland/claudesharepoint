import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { queryEntities } from "../shared/table-client";
import { jsonResponse, errorResponse } from "../shared/response";
import { QuotaStatusEntity } from "../shared/types";
import { mapQuotaStatusEntity } from "../shared/transforms";

const TABLE_NAME = "QuotaStatus";

const DISTRIBUTION_BUCKETS = [
  { label: "0-25 GB", minGB: 0, maxGB: 25 },
  { label: "25-50 GB", minGB: 25, maxGB: 50 },
  { label: "50-100 GB", minGB: 50, maxGB: 100 },
  { label: "100-250 GB", minGB: 100, maxGB: 250 },
  { label: "250-500 GB", minGB: 250, maxGB: 500 },
  { label: "500+ GB", minGB: 500, maxGB: Infinity },
];

const handler: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  try {
    const sortField = req.query.sort ?? "percentUsed";
    const VALID_SORT_FIELDS = ["percentUsed", "storageUsedGB"] as const;
    if (!VALID_SORT_FIELDS.includes(sortField as typeof VALID_SORT_FIELDS[number])) {
      context.res = errorResponse(`Invalid sort field. Must be one of: ${VALID_SORT_FIELDS.join(", ")}`, 400);
      return;
    }
    const topRaw = req.query.top ? parseInt(req.query.top, 10) : undefined;
    const top = topRaw !== undefined ? (isNaN(topRaw) || topRaw < 1 ? undefined : Math.min(topRaw, 1000)) : undefined;

    // Query all quota status entries
    const allEntries = await queryEntities<QuotaStatusEntity>(TABLE_NAME);

    if (allEntries.length === 0) {
      context.res = jsonResponse({ sites: [], distribution: [] });
      return;
    }

    // Determine the latest RunId
    const latestRunId = allEntries.reduce((latest, entry) => {
      if (!latest || entry.RunId > latest) {
        return entry.RunId;
      }
      return latest;
    }, "" as string);

    // Filter to latest run only
    const results = allEntries.filter(
      (entry) => entry.RunId === latestRunId
    );

    // Sort based on query param
    if (sortField === "storageUsedGB") {
      results.sort((a, b) => (b.StorageUsedGB ?? 0) - (a.StorageUsedGB ?? 0));
    } else {
      results.sort((a, b) => (b.PercentUsed ?? 0) - (a.PercentUsed ?? 0));
    }

    // Build distribution buckets based on StorageAllocatedGB
    const distribution = DISTRIBUTION_BUCKETS.map((bucket) => {
      const count = results.filter((entry) => {
        const allocated = entry.StorageAllocatedGB ?? 0;
        return allocated >= bucket.minGB && allocated < bucket.maxGB;
      }).length;
      return { label: bucket.label, count };
    });

    // Apply top limit if provided
    const sites = (top && top > 0 ? results.slice(0, top) : results).map(
      mapQuotaStatusEntity
    );

    context.res = jsonResponse({ sites, distribution });
  } catch (error: unknown) {
    context.log.error("quota-status error:", error);
    context.res = errorResponse("An internal error occurred.");
  }
};

export default handler;
