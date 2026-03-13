import type {
  DashboardOverview,
  JobRun,
  JobFilters,
  JobType,
  QuotaStatus,
  StaleSiteRecommendation,
  VersionCleanupResult,
  AppSettings,
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
  return response.json();
}

export async function fetchOverview(): Promise<DashboardOverview> {
  return fetchJSON<DashboardOverview>("/dashboard-overview");
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
  return fetchJSON(`/jobs?runId=${encodeURIComponent(runId)}`);
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

export async function fetchStaleSites(): Promise<StaleSiteRecommendation[]> {
  return fetchJSON<StaleSiteRecommendation[]>("/sites-stale");
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

export async function fetchQuotaStatus(): Promise<QuotaStatus[]> {
  return fetchJSON<QuotaStatus[]>("/quota-status");
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
