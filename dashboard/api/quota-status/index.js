"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const table_client_1 = require("../shared/table-client");
const response_1 = require("../shared/response");
const transforms_1 = require("../shared/transforms");
const TABLE_NAME = "QuotaStatus";
const DISTRIBUTION_BUCKETS = [
    { label: "0-25 GB", minGB: 0, maxGB: 25 },
    { label: "25-50 GB", minGB: 25, maxGB: 50 },
    { label: "50-100 GB", minGB: 50, maxGB: 100 },
    { label: "100-250 GB", minGB: 100, maxGB: 250 },
    { label: "250-500 GB", minGB: 250, maxGB: 500 },
    { label: "500+ GB", minGB: 500, maxGB: Infinity },
];
const handler = async function (context, req) {
    try {
        const sortField = req.query.sort ?? "percentUsed";
        const top = req.query.top ? parseInt(req.query.top, 10) : undefined;
        // Query all quota status entries
        const allEntries = await (0, table_client_1.queryEntities)(TABLE_NAME);
        if (allEntries.length === 0) {
            context.res = (0, response_1.jsonResponse)({ sites: [], distribution: [] });
            return;
        }
        // Determine the latest RunId
        const latestRunId = allEntries.reduce((latest, entry) => {
            if (!latest || entry.RunId > latest) {
                return entry.RunId;
            }
            return latest;
        }, "");
        // Filter to latest run only
        const results = allEntries.filter((entry) => entry.RunId === latestRunId);
        // Sort based on query param
        if (sortField === "storageUsedGB") {
            results.sort((a, b) => (b.StorageUsedGB ?? 0) - (a.StorageUsedGB ?? 0));
        }
        else {
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
        const sites = (top && top > 0 ? results.slice(0, top) : results).map(transforms_1.mapQuotaStatusEntity);
        context.res = (0, response_1.jsonResponse)({ sites, distribution });
    }
    catch (error) {
        context.log.error("quota-status error:", error);
        context.res = (0, response_1.errorResponse)("An internal error occurred.");
    }
};
exports.default = handler;
//# sourceMappingURL=index.js.map