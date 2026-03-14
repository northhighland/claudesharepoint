"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const table_client_1 = require("../shared/table-client");
const response_1 = require("../shared/response");
const TABLE_NAME = "QuotaStatus";
const handler = async function (context, req) {
    try {
        // Query all quota status entries
        const allEntries = await (0, table_client_1.queryEntities)(TABLE_NAME);
        if (allEntries.length === 0) {
            context.res = (0, response_1.jsonResponse)([]);
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
        // Sort by PercentUsed descending (highest usage first)
        results.sort((a, b) => (b.PercentUsed ?? 0) - (a.PercentUsed ?? 0));
        context.res = (0, response_1.jsonResponse)(results);
    }
    catch (error) {
        context.log.error("quota-status error:", error);
        context.res = (0, response_1.errorResponse)("An internal error occurred.");
    }
};
exports.default = handler;
//# sourceMappingURL=index.js.map