import {
  JobRunEntity,
  StaleSiteEntity,
  QuotaStatusEntity,
  RecycleBinResultEntity,
} from "./types";

interface JobDetails {
  StartedAt?: string;
  CompletedAt?: string;
  DurationMinutes?: number;
  DryRun?: boolean;
  JobsSucceeded?: number;
  JobsFailed?: number;
}

function parseDetails(detailsStr?: string): JobDetails {
  if (!detailsStr) return {};
  try {
    return JSON.parse(detailsStr);
  } catch {
    return {};
  }
}

export function mapJobRunEntity(entity: JobRunEntity) {
  // Table Storage entity has Details as a JSON string containing dates
  const raw = entity as Record<string, unknown>;
  const details = parseDetails(raw.Details as string | undefined);
  const durationMs = details.DurationMinutes
    ? Math.round(details.DurationMinutes * 60 * 1000)
    : details.StartedAt && details.CompletedAt
      ? new Date(details.CompletedAt).getTime() - new Date(details.StartedAt).getTime()
      : undefined;

  return {
    partitionKey: String(entity.partitionKey ?? ""),
    rowKey: String(entity.rowKey ?? ""),
    runId: String(entity.rowKey ?? ""),
    jobType: String(entity.partitionKey ?? ""),
    status: entity.Status ?? "",
    startedAt: details.StartedAt ?? (raw.UpdatedAt as string) ?? "",
    completedAt: details.CompletedAt ?? undefined,
    durationMs,
    totalSites: entity.TotalSites ?? 0,
    processedSites: (details.JobsSucceeded ?? 0) + (details.JobsFailed ?? 0),
    failedSites: details.JobsFailed ?? 0,
    skippedSites: 0,
    totalSpaceReclaimedBytes: entity.SpaceReclaimedGB
      ? Math.round(entity.SpaceReclaimedGB * 1024 * 1024 * 1024)
      : 0,
    errorMessage: entity.ErrorMessage ?? undefined,
    triggeredBy: "Automation",
    isDryRun: entity.DryRun ?? details.DryRun ?? false,
    totalWaves: (raw.TotalWaves as number) ?? undefined,
    completedWaves: (raw.CompletedWaves as number) ?? undefined,
    jobsSucceeded: details.JobsSucceeded ?? undefined,
    jobsFailed: details.JobsFailed ?? undefined,
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
