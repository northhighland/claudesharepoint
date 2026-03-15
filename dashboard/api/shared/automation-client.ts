import { ManagedIdentityCredential } from "@azure/identity";

export interface AutomationJob {
  id: string;
  jobId: string;
  runbookName: string;
  status: string;
  statusDetails: string;
  startTime: string | null;
  endTime: string | null;
  creationTime: string;
  lastModifiedTime: string;
  parameters: Record<string, string>;
}

export interface AutomationVariable {
  name: string;
  value: string;
  isEncrypted: boolean;
  description: string;
}

const API_VERSION = "2023-11-01";

function getAutomationConfig(): {
  subscriptionId: string;
  resourceGroup: string;
  automationAccount: string;
} {
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP;
  const automationAccount = process.env.AZURE_AUTOMATION_ACCOUNT;

  if (!subscriptionId || !resourceGroup || !automationAccount) {
    throw new Error(
      "Azure Automation configuration missing. Set AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, and AZURE_AUTOMATION_ACCOUNT."
    );
  }

  return { subscriptionId, resourceGroup, automationAccount };
}

function getBaseUrl(): string {
  const { subscriptionId, resourceGroup, automationAccount } =
    getAutomationConfig();
  return `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Automation/automationAccounts/${automationAccount}`;
}

async function getAccessToken(): Promise<string> {
  const credential = new ManagedIdentityCredential();
  const tokenResponse = await credential.getToken(
    "https://management.azure.com/.default"
  );
  return tokenResponse.token;
}

async function automationRequest<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" = "GET",
  body?: unknown
): Promise<T> {
  const token = await getAccessToken();
  const baseUrl = getBaseUrl();
  const separator = path.includes("?") ? "&" : "?";
  const url = `${baseUrl}${path}${separator}api-version=${API_VERSION}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const options: RequestInit = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Azure Automation API error (${response.status}): ${errorBody}`
    );
  }

  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

/**
 * Validates that a resource name contains only safe characters to prevent
 * path traversal or injection in Azure Management API URLs.
 * OWASP A03:2021 — Injection
 */
function validateResourceName(name: string, label: string): void {
  if (!/^[\w-]+$/.test(name) || name.length > 128) {
    throw new Error(`Invalid ${label}: must be 1-128 alphanumeric/hyphen/underscore characters.`);
  }
}

export async function triggerRunbook(
  runbookName: string,
  params: Record<string, string>
): Promise<string> {
  validateResourceName(runbookName, "runbook name");
  const jobId = crypto.randomUUID();

  const body = {
    properties: {
      runbook: { name: runbookName },
      parameters: params,
    },
  };

  const result = await automationRequest<{
    properties: { jobId: string };
  }>(`/jobs/${jobId}`, "PUT", body);

  return result.properties?.jobId ?? jobId;
}

export async function getJob(jobId: string): Promise<AutomationJob> {
  // Validate jobId is a UUID to prevent path traversal
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error("Invalid job ID format: must be a UUID.");
  }
  const result = await automationRequest<{
    properties: {
      jobId: string;
      runbook: { name: string };
      status: string;
      statusDetails: string;
      startTime: string | null;
      endTime: string | null;
      creationTime: string;
      lastModifiedTime: string;
      parameters: Record<string, string>;
    };
    id: string;
  }>(`/jobs/${jobId}`);

  return {
    id: result.id,
    jobId: result.properties.jobId,
    runbookName: result.properties.runbook?.name ?? "",
    status: result.properties.status,
    statusDetails: result.properties.statusDetails,
    startTime: result.properties.startTime,
    endTime: result.properties.endTime,
    creationTime: result.properties.creationTime,
    lastModifiedTime: result.properties.lastModifiedTime,
    parameters: result.properties.parameters ?? {},
  };
}

export async function listJobs(filter?: string): Promise<AutomationJob[]> {
  const filterParam = filter ? `?$filter=${encodeURIComponent(filter)}` : "";
  const result = await automationRequest<{
    value: Array<{
      id: string;
      properties: {
        jobId: string;
        runbook: { name: string };
        status: string;
        statusDetails: string;
        startTime: string | null;
        endTime: string | null;
        creationTime: string;
        lastModifiedTime: string;
        parameters: Record<string, string>;
      };
    }>;
  }>(`/jobs${filterParam}`);

  return (result.value ?? []).map((item) => ({
    id: item.id,
    jobId: item.properties.jobId,
    runbookName: item.properties.runbook?.name ?? "",
    status: item.properties.status,
    statusDetails: item.properties.statusDetails,
    startTime: item.properties.startTime,
    endTime: item.properties.endTime,
    creationTime: item.properties.creationTime,
    lastModifiedTime: item.properties.lastModifiedTime,
    parameters: item.properties.parameters ?? {},
  }));
}

export async function getVariable(
  variableName: string
): Promise<AutomationVariable | null> {
  validateResourceName(variableName, "variable name");
  try {
    const result = await automationRequest<{
      properties: {
        value: string;
        isEncrypted: boolean;
        description: string;
      };
      name: string;
    }>(`/variables/${variableName}`);

    return {
      name: result.name,
      value: result.properties.value,
      isEncrypted: result.properties.isEncrypted,
      description: result.properties.description ?? "",
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("404")) {
      return null;
    }
    throw error;
  }
}

export async function setVariable(
  variableName: string,
  value: string,
  description?: string
): Promise<void> {
  validateResourceName(variableName, "variable name");
  const body = {
    name: variableName,
    properties: {
      value: JSON.stringify(value),
      isEncrypted: false,
      description: description ?? "",
    },
  };

  await automationRequest(`/variables/${variableName}`, "PUT", body);
}
