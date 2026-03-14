export type JobType =
  | "VersionCleanup"
  | "QuotaManager"
  | "StaleSiteDetector"
  | "RecycleBinCleaner";

export const JOB_TYPE_DISPLAY_NAMES: Record<JobType, string> = {
  VersionCleanup: "Version Control",
  QuotaManager: "Quota Manager",
  StaleSiteDetector: "Stale Site Detector",
  RecycleBinCleaner: "Recycle Bin Cleaner",
};

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
  totalWaves?: number;
  completedWaves?: number;
  jobsSucceeded?: number;
  jobsFailed?: number;
}

export interface VersionCleanupResult {
  partitionKey: string;
  rowKey: string;
  runId: string;
  siteUrl: string;
  siteName: string;
  status: "Success" | "Failed" | "Skipped" | "Error";
  filesScanned: number;
  filesWithVersions: number;
  versionsFound: number;
  versionsDeleted: number;
  spaceReclaimedBytes: number;
  librariesProcessed: number;
  isDryRun: boolean;
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
  adminHoursSaved: number;
  costAvoidanceDollars: number;
  totalSitesProcessed: number;
  storageTrend: StorageTrendPoint[];
  recentJobs: JobRun[];
}

export interface StorageTrendPoint {
  date: string;
  reclaimedGB: number;
}

export interface QuotaDistributionBucket {
  label: string;
  count: number;
  minGB: number;
  maxGB: number;
}

export interface QuotaStatusResponse {
  sites: QuotaStatus[];
  distribution: QuotaDistributionBucket[];
}

export interface JobSchedule {
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek?: number; // 0=Sun, 1=Mon, ... 6=Sat (for weekly)
  dayOfMonth?: number; // 1-28 (for monthly)
  timeUtc: string; // "02:00" format
}

export interface AppSettings {
  expireAfterDays: number;
  maxMajorVersions: number;
  quotaIncrementGB: number;
  teamsWebhookUrl: string;
  notificationEmail: string;
  schedules: Record<JobType, JobSchedule>;
}

export interface JobFilters {
  jobType?: JobType;
  status?: JobStatus;
  startDate?: string;
  endDate?: string;
}

export type TimeRange = "30d" | "90d" | "all";
