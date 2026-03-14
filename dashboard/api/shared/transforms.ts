import {
  JobRunEntity,
  VersionCleanupResultEntity,
  StaleSiteEntity,
  QuotaStatusEntity,
  RecycleBinResultEntity,
} from "./types";

export function mapJobRunEntity(entity: JobRunEntity) {
  return {
    partitionKey: String(entity.partitionKey ?? ""),
    rowKey: String(entity.rowKey ?? ""),
    runId: entity.RunId ?? String(entity.rowKey ?? ""),
    jobType: entity.JobType ?? String(entity.partitionKey ?? ""),
    status: entity.Status ?? "",
    startedAt: entity.StartTime ?? "",
    completedAt: entity.EndTime ?? undefined,
    durationMs: entity.StartTime && entity.EndTime
      ? new Date(entity.EndTime).getTime() - new Date(entity.StartTime).getTime()
      : undefined,
    totalSites: entity.TotalSites ?? 0,
    processedSites: entity.ProcessedSites ?? 0,
    failedSites: entity.FailedSites ?? 0,
    skippedSites: 0,
    totalSpaceReclaimedBytes: entity.SpaceReclaimedGB
      ? Math.round(entity.SpaceReclaimedGB * 1024 * 1024 * 1024)
      : 0,
    errorMessage: entity.ErrorMessage ?? undefined,
    triggeredBy: "Automation",
    isDryRun: entity.DryRun ?? false,
  };
}

export function mapStaleSiteEntity(entity: StaleSiteEntity) {
  return {
    partitionKey: String(entity.partitionKey ?? ""),
    rowKey: String(entity.rowKey ?? ""),
    siteUrl: entity.SiteUrl ?? "",
    siteName: entity.SiteTitle ?? "",
    stalenessScore: entity.StalenessScore ?? 0,
    category: entity.Category ?? "Active",
    lastActivityDate: entity.LastActivityDate ?? "",
    lastContentModified: entity.LastModifiedDate ?? "",
    ownerEmail: entity.OwnerEmail ?? "",
    storageUsedBytes: entity.StorageUsedGB
      ? Math.round(entity.StorageUsedGB * 1024 * 1024 * 1024)
      : 0,
    memberCount: 0,
    adminAction: entity.AdminAction ?? null,
    actionDate: entity.AdminActionDate ?? undefined,
    analyzedAt: "",
  };
}

export function mapQuotaStatusEntity(entity: QuotaStatusEntity) {
  return {
    partitionKey: String(entity.partitionKey ?? ""),
    rowKey: String(entity.rowKey ?? ""),
    siteUrl: entity.SiteUrl ?? "",
    siteName: entity.SiteTitle ?? "",
    quotaBytes: entity.StorageAllocatedGB
      ? Math.round(entity.StorageAllocatedGB * 1024 * 1024 * 1024)
      : 0,
    usedBytes: entity.StorageUsedGB
      ? Math.round(entity.StorageUsedGB * 1024 * 1024 * 1024)
      : 0,
    percentUsed: entity.PercentUsed ?? 0,
    autoIncreased: (entity.AutoIncreasedGB ?? 0) > 0,
    previousQuotaBytes: undefined,
    newQuotaBytes: entity.AutoIncreasedGB
      ? Math.round(entity.AutoIncreasedGB * 1024 * 1024 * 1024)
      : undefined,
    increasedAt: entity.AutoIncreaseDate ?? undefined,
    lastCheckedAt: "",
  };
}

export function mapRecycleBinResultEntity(entity: RecycleBinResultEntity) {
  return {
    partitionKey: String(entity.partitionKey ?? ""),
    rowKey: String(entity.rowKey ?? ""),
    runId: entity.RunId ?? "",
    siteUrl: entity.SiteUrl ?? "",
    siteName: "",
    status: entity.Status ?? "Success",
    itemsDeleted: entity.ItemsDeleted ?? 0,
    spaceReclaimedBytes: entity.SpaceReclaimedMB
      ? Math.round(entity.SpaceReclaimedMB * 1024 * 1024)
      : 0,
    errorMessage: entity.ErrorMessage ?? undefined,
    processedAt: entity.ProcessedAt ?? "",
  };
}
