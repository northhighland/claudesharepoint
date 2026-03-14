import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { queryEntities } from "../shared/table-client";
import { jsonResponse, errorResponse } from "../shared/response";
import { QuotaStatusEntity } from "../shared/types";
import { mapQuotaStatusEntity } from "../shared/transforms";

const TABLE_NAME = "QuotaStatus";

const handler: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  try {
    // Query all quota status entries
    const allEntries = await queryEntities<QuotaStatusEntity>(TABLE_NAME);

    if (allEntries.length === 0) {
      context.res = jsonResponse([]);
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

    // Sort by PercentUsed descending (highest usage first)
    results.sort((a, b) => (b.PercentUsed ?? 0) - (a.PercentUsed ?? 0));

    context.res = jsonResponse(results.map(mapQuotaStatusEntity));
  } catch (error: unknown) {
    context.log.error("quota-status error:", error);
    context.res = errorResponse("An internal error occurred.");
  }
};

export default handler;
