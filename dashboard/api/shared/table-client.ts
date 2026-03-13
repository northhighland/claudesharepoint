import {
  TableClient,
  TableServiceClient,
  AzureNamedKeyCredential,
  odata,
  TableEntity,
} from "@azure/data-tables";

let serviceClient: TableServiceClient | null = null;

function getServiceClient(): TableServiceClient {
  if (serviceClient) {
    return serviceClient;
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (connectionString) {
    serviceClient = TableServiceClient.fromConnectionString(connectionString);
    return serviceClient;
  }

  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  if (accountName && accountKey) {
    const credential = new AzureNamedKeyCredential(accountName, accountKey);
    const url = `https://${accountName}.table.core.windows.net`;
    serviceClient = new TableServiceClient(url, credential);
    return serviceClient;
  }

  throw new Error(
    "Azure Table Storage configuration missing. Set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY."
  );
}

export function getTableClient(tableName: string): TableClient {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (connectionString) {
    return TableClient.fromConnectionString(connectionString, tableName);
  }

  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  if (accountName && accountKey) {
    const credential = new AzureNamedKeyCredential(accountName, accountKey);
    const url = `https://${accountName}.table.core.windows.net`;
    return new TableClient(url, tableName, credential);
  }

  throw new Error(
    "Azure Table Storage configuration missing. Set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY."
  );
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
