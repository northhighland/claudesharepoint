"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.odata = void 0;
exports.getTableClient = getTableClient;
exports.queryEntities = queryEntities;
exports.upsertEntity = upsertEntity;
exports.getEntity = getEntity;
const data_tables_1 = require("@azure/data-tables");
Object.defineProperty(exports, "odata", { enumerable: true, get: function () { return data_tables_1.odata; } });
const identity_1 = require("@azure/identity");
const credential = new identity_1.ManagedIdentityCredential();
function getAccountName() {
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    if (!accountName) {
        throw new Error("AZURE_STORAGE_ACCOUNT_NAME is required.");
    }
    return accountName;
}
function getTableClient(tableName) {
    const accountName = getAccountName();
    const url = `https://${accountName}.table.core.windows.net`;
    return new data_tables_1.TableClient(url, tableName, credential);
}
async function queryEntities(tableName, filter, top) {
    const client = getTableClient(tableName);
    const results = [];
    const queryOptions = {};
    if (filter) {
        queryOptions.filter = filter;
    }
    const iterator = client.listEntities({
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
async function upsertEntity(tableName, entity) {
    const client = getTableClient(tableName);
    if (!entity.partitionKey || !entity.rowKey) {
        throw new Error("Entity must include partitionKey and rowKey.");
    }
    await client.upsertEntity(entity, "Merge");
}
async function getEntity(tableName, partitionKey, rowKey) {
    const client = getTableClient(tableName);
    try {
        const entity = await client.getEntity(partitionKey, rowKey);
        return entity;
    }
    catch (error) {
        const restError = error;
        if (restError.statusCode === 404) {
            return null;
        }
        throw error;
    }
}
//# sourceMappingURL=table-client.js.map