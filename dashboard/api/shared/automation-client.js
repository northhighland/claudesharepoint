"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerRunbook = triggerRunbook;
exports.getJob = getJob;
exports.listJobs = listJobs;
exports.getVariable = getVariable;
exports.setVariable = setVariable;
const identity_1 = require("@azure/identity");
const API_VERSION = "2023-11-01";
function getAutomationConfig() {
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    const resourceGroup = process.env.AZURE_RESOURCE_GROUP;
    const automationAccount = process.env.AZURE_AUTOMATION_ACCOUNT;
    if (!subscriptionId || !resourceGroup || !automationAccount) {
        throw new Error("Azure Automation configuration missing. Set AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, and AZURE_AUTOMATION_ACCOUNT.");
    }
    return { subscriptionId, resourceGroup, automationAccount };
}
function getBaseUrl() {
    const { subscriptionId, resourceGroup, automationAccount } = getAutomationConfig();
    return `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Automation/automationAccounts/${automationAccount}`;
}
async function getAccessToken() {
    const credential = new identity_1.ManagedIdentityCredential();
    const tokenResponse = await credential.getToken("https://management.azure.com/.default");
    return tokenResponse.token;
}
async function automationRequest(path, method = "GET", body) {
    const token = await getAccessToken();
    const baseUrl = getBaseUrl();
    const separator = path.includes("?") ? "&" : "?";
    const url = `${baseUrl}${path}${separator}api-version=${API_VERSION}`;
    const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };
    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Azure Automation API error (${response.status}): ${errorBody}`);
    }
    if (response.status === 204 || response.headers.get("content-length") === "0") {
        return {};
    }
    return response.json();
}
async function triggerRunbook(runbookName, params) {
    const jobId = crypto.randomUUID();
    const body = {
        properties: {
            runbook: { name: runbookName },
            parameters: params,
        },
    };
    const result = await automationRequest(`/jobs/${jobId}`, "PUT", body);
    return result.properties?.jobId ?? jobId;
}
async function getJob(jobId) {
    const result = await automationRequest(`/jobs/${jobId}`);
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
async function listJobs(filter) {
    const filterParam = filter ? `?$filter=${encodeURIComponent(filter)}` : "";
    const result = await automationRequest(`/jobs${filterParam}`);
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
async function getVariable(variableName) {
    try {
        const result = await automationRequest(`/variables/${variableName}`);
        return {
            name: result.name,
            value: result.properties.value,
            isEncrypted: result.properties.isEncrypted,
            description: result.properties.description ?? "",
        };
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("404")) {
            return null;
        }
        throw error;
    }
}
async function setVariable(variableName, value, description) {
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
//# sourceMappingURL=automation-client.js.map