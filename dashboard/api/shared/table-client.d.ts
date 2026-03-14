import { TableClient, odata, TableEntity } from "@azure/data-tables";
export declare function getTableClient(tableName: string): TableClient;
export declare function queryEntities<T extends TableEntity>(tableName: string, filter?: string, top?: number): Promise<T[]>;
export declare function upsertEntity(tableName: string, entity: Record<string, unknown>): Promise<void>;
export declare function getEntity<T extends TableEntity>(tableName: string, partitionKey: string, rowKey: string): Promise<T | null>;
export { odata };
//# sourceMappingURL=table-client.d.ts.map