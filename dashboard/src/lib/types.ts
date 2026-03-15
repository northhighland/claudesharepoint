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
  | "Cancelled"
  | "PartialComplete";

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
  errorCode?: string;
  errorSource?: string;
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
  errorCode?: string;
  errorSource?: string;
  errorMessage?: string;
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
  errorCode?: string;
  errorSource?: string;
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
  errorCode?: string;
  errorSource?: string;
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
  tenantHealthScore?: number;
  quotaHealthPercent?: number;
  stalenessHealthPercent?: number;
  jobSuccessPercent?: number;
  criticalQuotaSites?: number;
  staleSitesNeedingAction?: number;
  failedJobsLast24h?: number;
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

export interface StaleSiteWeights {
  inactivityDays: number;       // Days without activity to trigger (default: 180)
  inactivityWeight: number;     // Score points for inactivity (default: 40)
  noUsersDays: number;          // Days without active users (default: 90)
  noUsersWeight: number;        // Score points for no users (default: 25)
  minFileCount: number;         // Below this = low content (default: 10)
  lowFilesWeight: number;       // Score points for low files (default: 15)
  minStorageMB: number;         // Below this MB = low storage (default: 100)
  lowStorageWeight: number;     // Score points for low storage (default: 10)
  minAgeYears: number;          // Site older than this = age factor (default: 2)
  ageWeight: number;            // Score points for age (default: 10)
}

export interface StaleSiteThresholds {
  activeMax: number;            // 0 to this = Active (default: 20)
  lowActivityMax: number;       // to this = Low Activity (default: 50)
  dormantMax: number;           // to this = Dormant/Stale (default: 70)
  archiveMax: number;           // to this = Recommend Archive (default: 85)
  // 86-100 = Recommend Delete
}

export interface AppSettings {
  expireAfterDays: number;
  maxMajorVersions: number;
  quotaIncrementGB: number;
  teamsWebhookUrl: string;
  notificationEmail: string;
  schedules: Record<JobType, JobSchedule>;
  staleSiteWeights: StaleSiteWeights;
  staleSiteThresholds: StaleSiteThresholds;
}

export interface JobFilters {
  jobType?: JobType;
  status?: JobStatus;
  startDate?: string;
  endDate?: string;
}

export type TimeRange = "30d" | "90d" | "all";
