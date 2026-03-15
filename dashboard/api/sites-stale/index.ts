import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import {
  queryEntities,
  upsertEntity,
  getEntity,
  odata,
} from "../shared/table-client";
import { jsonResponse, errorResponse } from "../shared/response";
import { StaleSiteEntity, StaleSiteActionRequest } from "../shared/types";
import { getClientPrincipal } from "../shared/auth";
import { mapStaleSiteEntity } from "../shared/transforms";

const TABLE_NAME = "StaleSiteRecommendations";
const VALID_ACTIONS = ["Keep", "Archive", "Delete"] as const;

const handler: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  try {
    if (req.method === "GET") {
      return await handleGet(context, req);
    }

    if (req.method === "POST") {
      return await handlePost(context, req);
    }

    context.res = errorResponse("Method not allowed", 405);
  } catch (error: unknown) {
    context.log.error("sites-stale error:", error);
    context.res = errorResponse("An internal error occurred.");
  }
};

async function handleGet(
  context: Context,
  req: HttpRequest
): Promise<void> {
  const category = req.query.category;
  const VALID_CATEGORIES = ["Active", "LowActivity", "Dormant", "RecommendArchive", "RecommendDelete", "Low Activity", "Stale", "Abandoned"] as const;
  if (category && !VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    context.res = errorResponse(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`, 400);
    return;
  }

  // First, find the latest RunId by querying the most recent entries
  const allSites = await queryEntities<StaleSiteEntity>(TABLE_NAME);

  if (allSites.length === 0) {
    context.res = jsonResponse([]);
    return;
  }

  // Deduplicate: keep only the latest result per site
  const siteMap = new Map<string, StaleSiteEntity>();
  for (const site of allSites) {
    const key = site.SiteUrl ?? "";
    if (!key) continue;
    const existing = siteMap.get(key);
    if (!existing || (site.RunId ?? "") > (existing.RunId ?? "")) {
      siteMap.set(key, site);
    }
  }
  let results = Array.from(siteMap.values());

  // Apply category filter if provided
  if (category) {
    results = results.filter((site) => site.Category === category);
  }

  // Sort by StalenessScore descending
  results.sort((a, b) => (b.StalenessScore ?? 0) - (a.StalenessScore ?? 0));

  context.res = jsonResponse(results.map(mapStaleSiteEntity));
}

async function handlePost(
  context: Context,
  req: HttpRequest
): Promise<void> {
  const body = req.body as (StaleSiteActionRequest & { type?: string; siteName?: string; ownerEmail?: string }) | undefined;

  // Handle notification requests (stub — actual email via Logic App later)
  if (body?.type === "notify") {
    const { siteUrl, siteName, ownerEmail } = body;
    if (!siteUrl || !siteName || !ownerEmail) {
      context.res = errorResponse("siteUrl, siteName, and ownerEmail are required.", 400);
      return;
    }
    const principal = getClientPrincipal(req);
    context.log.info(
      `[AUDIT] Stale site notification requested for ${siteUrl} (${siteName}) to ${ownerEmail} by ${principal.userDetails}`
    );
    context.res = jsonResponse({ notified: true, siteUrl, ownerEmail });
    return;
  }

  if (!body || !body.siteUrl || !body.action) {
    context.res = errorResponse(
      "Request body must include siteUrl and action.",
      400
    );
    return;
  }

  const principal = getClientPrincipal(req);
  const { siteUrl, action } = body;

  // Validate siteUrl format
  if (!/^https:\/\/[\w-]+\.sharepoint\.com\//.test(siteUrl)) {
    context.res = errorResponse("Invalid SharePoint site URL format.", 400);
    return;
  }

  if (!VALID_ACTIONS.includes(action as (typeof VALID_ACTIONS)[number])) {
    context.res = errorResponse(
      `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}`,
      400
    );
    return;
  }

  // Find the entity — deduplicate by SiteUrl, keep latest RunId
  const allSites = await queryEntities<StaleSiteEntity>(TABLE_NAME);
  const postSiteMap = new Map<string, StaleSiteEntity>();
  for (const site of allSites) {
    const key = site.SiteUrl ?? "";
    if (!key) continue;
    const existing = postSiteMap.get(key);
    if (!existing || (site.RunId ?? "") > (existing.RunId ?? "")) {
      postSiteMap.set(key, site);
    }
  }

  const target = postSiteMap.get(siteUrl);

  if (!target) {
    context.res = errorResponse(
      "Stale site recommendation not found for the provided siteUrl.",
      404
    );
    return;
  }

  context.log.info(
    `[AUDIT] Stale site action: ${action} on ${siteUrl} by ${principal.userDetails}`
  );

  // Update the entity with admin action
  await upsertEntity(TABLE_NAME, {
    partitionKey: target.partitionKey,
    rowKey: target.rowKey,
    AdminAction: action,
    AdminActionDate: new Date().toISOString(),
    AdminActionBy: principal.userDetails,
  });

  // Return the updated entity
  const updated = await getEntity<StaleSiteEntity>(
    TABLE_NAME,
    target.partitionKey as string,
    target.rowKey as string
  );

  context.res = jsonResponse(updated ? mapStaleSiteEntity(updated) : null);
}

export default handler;
