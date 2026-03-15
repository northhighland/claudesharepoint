import {
  TableClient,
  odata,
  TableEntity,
} from "@azure/data-tables";
import { ManagedIdentityCredential } from "@azure/identity";

const credential = new ManagedIdentityCredential();

function getAccountName(): string {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  if (!accountName) {
    throw new Error(
      "AZURE_STORAGE_ACCOUNT_NAME is required."
    );
  }
  return accountName;
}

/**
 * Known table names — acts as an allowlist to prevent injection
 * into the Table Storage URL (OWASP A03:2021 — Injection).
 */
const ALLOWED_TABLES = new Set([
  "JobRuns",
  "VersionCleanupResults",
  "QuotaStatus",
  "StaleSiteRecommendations",
  "RecycleBinResults",
]);

export function getTableClient(tableName: string): TableClient {
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`Access to table '${tableName}' is not permitted.`);
  }
  const accountName = getAccountName();
  const url = `https://${accountName}.table.core.windows.net`;
  return new TableClient(url, tableName, credential);
}

export async function queryEntities<T extends TableEntity>(
  tableName: string,
  filter?: string,
  top?: number
): Promise<T[]> {
  const client = getTableClient(tableName);
  const results: T[] = [];

  const queryOptions: { filter?: string; top?: number } = {};
  if (filter) {
    queryOptions.filter = filter;
  }

  const iterator = client.listEntities<T>({
    queryOptions: filter ? { filter } : undefined,
  });

  for await (const entity of iterator) {
    results.push(entity);
    if (top && results.length >= top) {
      break;
    }
  }

  return results;
}

export async function upsertEntity(
  tableName: string,
  entity: Record<string, unknown>
): Promise<void> {
  const client = getTableClient(tableName);

  if (!entity.partitionKey || !entity.rowKey) {
    throw new Error("Entity must include partitionKey and rowKey.");
  }

  await client.upsertEntity(entity as TableEntity, "Merge");
}

export async function getEntity<T extends TableEntity>(
  tableName: string,
  partitionKey: string,
  rowKey: string
): Promise<T | null> {
  const client = getTableClient(tableName);

  try {
    const entity = await client.getEntity<T>(partitionKey, rowKey);
    return entity;
  } catch (error: unknown) {
    const restError = error as { statusCode?: number };
    if (restError.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

export { odata };
