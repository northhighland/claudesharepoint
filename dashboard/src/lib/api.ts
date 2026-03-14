import type {
  DashboardOverview,
  JobRun,
  JobFilters,
  JobType,
  QuotaStatusResponse,
  StaleSiteRecommendation,
  VersionCleanupResult,
  AppSettings,
  TimeRange,
} from "./types";

const API_BASE = "/api";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `API error ${response.status}: ${response.statusText}${body ? ` - ${body}` : ""}`
    );
  }
  const json = await response.json();
  // API wraps responses as {success, data} — unwrap for consumers
  return json.data !== undefined ? json.data : json;
}

export async function fetchOverview(range: TimeRange = "all"): Promise<DashboardOverview> {
  return fetchJSON<DashboardOverview>(`/dashboard-overview?range=${range}`);
}

export async function fetchJobs(filters?: JobFilters): Promise<JobRun[]> {
  const params = new URLSearchParams();
  if (filters?.jobType) params.set("jobType", filters.jobType);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.startDate) params.set("startDate", filters.startDate);
  if (filters?.endDate) params.set("endDate", filters.endDate);
  const qs = params.toString();
  return fetchJSON<JobRun[]>(`/jobs${qs ? `?${qs}` : ""}`);
}

export async function fetchJob(
  runId: string
): Promise<{ job: JobRun; results: VersionCleanupResult[] }> {
  return fetchJSON(`/jobs/${encodeURIComponent(runId)}`);
}

export async function triggerJob(
  jobType: JobType,
  dryRun = false
): Promise<{ runId: string }> {
  return fetchJSON("/jobs-trigger", {
    method: "POST",
    body: JSON.stringify({ jobType, dryRun }),
  });
}

export async function fetchStaleSites(category?: string): Promise<StaleSiteRecommendation[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : "";
  return fetchJSON<StaleSiteRecommendation[]>(`/sites-stale${params}`);
}

export async function updateStaleSiteAction(
  siteUrl: string,
  action: "Keep" | "Archive" | "Delete"
): Promise<void> {
  await fetchJSON("/sites-stale", {
    method: "POST",
    body: JSON.stringify({ siteUrl, action }),
  });
}

export async function notifyStaleSiteOwner(
  siteUrl: string,
  siteName: string,
  ownerEmail: string
): Promise<void> {
  await fetchJSON("/sites-stale/notify", {
    method: "POST",
    body: JSON.stringify({ siteUrl, siteName, ownerEmail }),
  });
}

export async function fetchQuotaStatus(
  sort: "percentUsed" | "storageUsedGB" = "percentUsed",
  top?: number
): Promise<QuotaStatusResponse> {
  const params = new URLSearchParams({ sort });
  if (top) params.set("top", String(top));
  return fetchJSON<QuotaStatusResponse>(`/quota-status?${params.toString()}`);
}

export async function fetchSettings(): Promise<AppSettings> {
  return fetchJSON<AppSettings>("/settings");
}

export async function updateSettings(
  settings: Partial<AppSettings>
): Promise<AppSettings> {
  return fetchJSON<AppSettings>("/settings", {
    method: "POST",
    body: JSON.stringify(settings),
  });
}
