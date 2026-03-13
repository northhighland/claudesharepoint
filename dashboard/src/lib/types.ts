export type JobType =
  | "VersionCleanup"
  | "QuotaManager"
  | "StaleSiteAnalysis"
  | "RecycleBinCleanup";

export type JobStatus =
  | "Queued"
  | "Running"
  | "Completed"
  | "Failed"
  | "Cancelled";

export interface JobRun {
  partitionKey: string;
  rowKey: string;
  runId: string;
  jobType: JobType;
  status: JobStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  totalSites: number;
  processedSites: number;
  failedSites: number;
  skippedSites: number;
  totalSpaceReclaimedBytes: number;
  errorMessage?: string;
  triggeredBy: string;
  isDryRun: boolean;
}

export interface VersionCleanupResult {
  partitionKey: string;
  rowKey: string;
  runId: string;
  siteUrl: string;
  siteName: string;
  status: "Success" | "Failed" | "Skipped";
  versionsDeleted: number;
  spaceReclaimedBytes: number;
  librariesProcessed: number;
  errorMessage?: string;
  processedAt: string;
}

export interface QuotaStatus {
  partitionKey: string;
  rowKey: string;
  siteUrl: string;
  siteName: string;
  quotaBytes: number;
  usedBytes: number;
  percentUsed: number;
  autoIncreased: boolean;
  previousQuotaBytes?: number;
  newQuotaBytes?: number;
  increasedAt?: string;
  lastCheckedAt: string;
}

export interface StaleSiteRecommendation {
  partitionKey: string;
  rowKey: string;
  siteUrl: string;
  siteName: string;
  stalenessScore: number;
  category: "Active" | "Low Activity" | "Stale" | "Abandoned";
  lastActivityDate: string;
  lastContentModified: string;
  ownerEmail: string;
  storageUsedBytes: number;
  memberCount: number;
  adminAction?: "Keep" | "Archive" | "Delete" | null;
  actionDate?: string;
  analyzedAt: string;
}

export interface RecycleBinResult {
  partitionKey: string;
  rowKey: string;
  runId: string;
  siteUrl: string;
  siteName: string;
  status: "Success" | "Failed" | "Skipped";
  itemsDeleted: number;
  spaceReclaimedBytes: number;
  errorMessage?: string;
  processedAt: string;
}

export interface DashboardOverview {
  totalStorageReclaimedBytes: number;
  storageReclaimedTrendPercent: number;
  activeJobs: number;
  activeJobsTrendPercent: number;
  sitesMonitored: number;
  sitesMonitoredTrendPercent: number;
  staleSitesFound: number;
  staleSitesTrendPercent: number;
  storageTrend: StorageTrendPoint[];
  recentJobs: JobRun[];
}

export interface StorageTrendPoint {
  date: string;
  reclaimedGB: number;
}

export interface AppSettings {
  expireAfterDays: number;
  maxMajorVersions: number;
  quotaIncrementGB: number;
  exclusionPatterns: string[];
  teamsWebhookUrl: string;
  notificationEmail: string;
}

export interface JobFilters {
  jobType?: JobType;
  status?: JobStatus;
  startDate?: string;
  endDate?: string;
}
