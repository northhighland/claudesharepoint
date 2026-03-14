"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const table_client_1 = require("../shared/table-client");
const response_1 = require("../shared/response");
const auth_1 = require("../shared/auth");
const TABLE_NAME = "StaleSiteRecommendations";
const VALID_ACTIONS = ["Keep", "Archive", "Delete"];
const handler = async function (context, req) {
    try {
        if (req.method === "GET") {
            return await handleGet(context, req);
        }
        if (req.method === "POST") {
            return await handlePost(context, req);
        }
        context.res = (0, response_1.errorResponse)("Method not allowed", 405);
    }
    catch (error) {
        context.log.error("sites-stale error:", error);
        context.res = (0, response_1.errorResponse)("An internal error occurred.");
    }
};
async function handleGet(context, req) {
    const category = req.query.category;
    // First, find the latest RunId by querying the most recent entries
    const allSites = await (0, table_client_1.queryEntities)(TABLE_NAME);
    if (allSites.length === 0) {
        context.res = (0, response_1.jsonResponse)([]);
        return;
    }
    // Determine the latest RunId
    const latestRunId = allSites.reduce((latest, site) => {
        if (!latest || site.RunId > latest) {
            return site.RunId;
        }
        return latest;
    }, "");
    // Filter to latest run only
    let results = allSites.filter((site) => site.RunId === latestRunId);
    // Apply category filter if provided
    if (category) {
        results = results.filter((site) => site.Category === category);
    }
    // Sort by StalenessScore descending
    results.sort((a, b) => (b.StalenessScore ?? 0) - (a.StalenessScore ?? 0));
    context.res = (0, response_1.jsonResponse)(results);
}
async function handlePost(context, req) {
    const body = req.body;
    if (!body || !body.siteUrl || !body.action) {
        context.res = (0, response_1.errorResponse)("Request body must include siteUrl and action.", 400);
        return;
    }
    const principal = (0, auth_1.getClientPrincipal)(req);
    const { siteUrl, action } = body;
    // Validate siteUrl format
    if (!/^https:\/\/[\w-]+\.sharepoint\.com\//.test(siteUrl)) {
        context.res = (0, response_1.errorResponse)("Invalid SharePoint site URL format.", 400);
        return;
    }
    if (!VALID_ACTIONS.includes(action)) {
        context.res = (0, response_1.errorResponse)(`Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}`, 400);
        return;
    }
    // Find the entity by scanning for the siteUrl in the latest run
    const allSites = await (0, table_client_1.queryEntities)(TABLE_NAME);
    const latestRunId = allSites.reduce((latest, site) => {
        if (!latest || site.RunId > latest)
            return site.RunId;
        return latest;
    }, "");
    const target = allSites.find((site) => site.SiteUrl === siteUrl && site.RunId === latestRunId);
    if (!target) {
        context.res = (0, response_1.errorResponse)("Stale site recommendation not found for the provided siteUrl.", 404);
        return;
    }
    context.log.info(`[AUDIT] Stale site action: ${action} on ${siteUrl} by ${principal.userDetails}`);
    // Update the entity with admin action
    await (0, table_client_1.upsertEntity)(TABLE_NAME, {
        partitionKey: target.partitionKey,
        rowKey: target.rowKey,
        AdminAction: action,
        AdminActionDate: new Date().toISOString(),
        AdminActionBy: principal.userDetails,
    });
    // Return the updated entity
    const updated = await (0, table_client_1.getEntity)(TABLE_NAME, target.partitionKey, target.rowKey);
    context.res = (0, response_1.jsonResponse)(updated);
}
exports.default = handler;
//# sourceMappingURL=index.js.map