"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapJobRunEntity = mapJobRunEntity;
exports.mapVersionCleanupResultEntity = mapVersionCleanupResultEntity;
exports.mapStaleSiteEntity = mapStaleSiteEntity;
exports.mapQuotaStatusEntity = mapQuotaStatusEntity;
exports.mapRecycleBinResultEntity = mapRecycleBinResultEntity;
function parseDetails(detailsStr) {
    if (!detailsStr)
        return {};
    try {
        return JSON.parse(detailsStr);
    }
    catch {
        return {};
    }
}
function mapJobRunEntity(entity) {
    // Table Storage entity has Details as a JSON string containing dates
    const raw = entity;
    const details = parseDetails(raw.Details);
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
        startedAt: details.StartedAt ?? raw.UpdatedAt ?? "",
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
        totalWaves: raw.TotalWaves ?? undefined,
        completedWaves: raw.CompletedWaves ?? undefined,
        jobsSucceeded: details.JobsSucceeded ?? undefined,
        jobsFailed: details.JobsFailed ?? undefined,
    };
}
function mapVersionCleanupResultEntity(entity) {
    return {
        partitionKey: String(entity.partitionKey ?? ""),
        rowKey: String(entity.rowKey ?? ""),
        runId: entity.RunId ?? String(entity.partitionKey ?? ""),
        siteUrl: entity.SiteUrl ?? "",
        siteName: entity.SiteTitle ?? "",
        status: entity.Status ?? "Success",
        filesScanned: entity.FilesScanned ?? 0,
        filesWithVersions: entity.FilesWithVersions ?? 0,
        versionsFound: entity.VersionsFound ?? 0,
        versionsDeleted: entity.VersionsDeleted ?? entity.VersionsRemoved ?? 0,
        spaceReclaimedBytes: entity.SpaceReclaimedMB
            ? Math.round(entity.SpaceReclaimedMB * 1024 * 1024)
            : 0,
        librariesProcessed: entity.LibrariesProcessed ?? 0,
        isDryRun: entity.DryRun ?? false,
        errorMessage: entity.ErrorMessage ?? undefined,
        processedAt: entity.CompletedAt ?? entity.ProcessedAt ?? "",
    };
}
function mapStaleSiteEntity(entity) {
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
function mapQuotaStatusEntity(entity) {
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
function mapRecycleBinResultEntity(entity) {
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
//# sourceMappingURL=transforms.js.map