import { TableEntity } from "@azure/data-tables";
export interface JobRunEntity extends TableEntity {
    RunId: string;
    JobType: string;
    Status: string;
    StartTime: string;
    EndTime?: string;
    TotalSites?: number;
    ProcessedSites?: number;
    FailedSites?: number;
    SpaceReclaimedGB?: number;
    DryRun?: boolean;
    ErrorMessage?: string;
}
export interface VersionCleanupResultEntity extends TableEntity {
    SiteUrl: string;
    SiteTitle?: string;
    RunId: string;
    FilesScanned?: number;
    FilesWithVersions?: number;
    VersionsFound?: number;
    VersionsRemoved?: number;
    VersionsDeleted?: number;
    SpaceReclaimedMB: number;
    LibrariesProcessed?: number;
    DryRun?: boolean;
    Status: string;
    ErrorMessage?: string;
    ErrorCode?: string;
    ErrorSource?: string;
    ProcessedAt?: string;
    CompletedAt?: string;
}
export interface StaleSiteEntity extends TableEntity {
    SiteUrl: string;
    SiteTitle: string;
    RunId: string;
    StalenessScore: number;
    LastActivityDate: string;
    LastModifiedDate: string;
    StorageUsedGB: number;
    OwnerEmail: string;
    Category: string;
    AdminAction?: string;
    AdminActionDate?: string;
    AdminActionBy?: string;
    ErrorCode?: string;
    ErrorSource?: string;
}
export interface QuotaStatusEntity extends TableEntity {
    SiteUrl: string;
    SiteTitle: string;
    RunId: string;
    StorageUsedGB: number;
    StorageAllocatedGB: number;
    PercentUsed: number;
    AutoIncreasedGB?: number;
    AutoIncreaseDate?: string;
    Status: string;
    ErrorCode?: string;
    ErrorSource?: string;
}
export interface RecycleBinResultEntity extends TableEntity {
    SiteUrl: string;
    RunId: string;
    ItemsDeleted: number;
    SpaceReclaimedMB: number;
    Status: string;
    ErrorMessage?: string;
    ErrorCode?: string;
    ErrorSource?: string;
    ProcessedAt: string;
}
export interface DashboardOverviewResponse {
    totalStorageReclaimedGB: number;
    activeJobs: number;
    sitesMonitored: number;
    staleSitesCount: number;
    storageTrend: Array<{
        date: string;
        gb: number;
    }>;
    recentJobs: JobRunEntity[];
}
export interface TriggerJobRequest {
    jobType: string;
    dryRun?: boolean;
    batchSize?: number;
}
export interface StaleSiteActionRequest {
    siteUrl: string;
    action: "Keep" | "Archive" | "Delete";
}
export type SettingsMap = Record<string, string>;
export type JobStatus = "Running" | "Completed" | "Failed" | "Stopped" | "Stalled" | "PartialComplete";
export declare const VALID_JOB_TYPES: readonly ["VersionCleanup", "QuotaManager", "StaleSiteDetector", "RecycleBinCleaner"];
export type ValidJobType = (typeof VALID_JOB_TYPES)[number];
//# sourceMappingURL=types.d.ts.map