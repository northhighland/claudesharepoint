"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const automation_client_1 = require("../shared/automation-client");
const response_1 = require("../shared/response");
const auth_1 = require("../shared/auth");
/** Automation variable names that map to dashboard settings. */
const SETTING_VARIABLES = [
    "ExpireAfterDays",
    "MaxMajorVersions",
    "QuotaIncrementGB",
    "TeamsWebhookUrl",
    "NotificationEmail",
    "ScheduleVersionCleanup",
    "ScheduleRecycleBinCleaner",
    "ScheduleQuotaManager",
    "ScheduleStaleSiteDetector",
];
/** Validates a schedule JSON string. */
function validateScheduleJson(v) {
    if (v === "")
        return null;
    try {
        const obj = JSON.parse(v);
        if (typeof obj.enabled !== "boolean")
            return "enabled must be a boolean";
        if (!["daily", "weekly", "monthly"].includes(obj.frequency))
            return "frequency must be daily, weekly, or monthly";
        if (typeof obj.timeUtc !== "string" || !/^\d{2}:\d{2}$/.test(obj.timeUtc))
            return "timeUtc must be HH:MM format";
        return null;
    }
    catch {
        return "Must be valid JSON";
    }
}
/** Per-field value validators to prevent dangerous values. */
const SETTING_VALIDATORS = {
    ExpireAfterDays: (v) => /^\d+$/.test(v) && +v >= 1 && +v <= 3650 ? null : "Must be 1-3650",
    MaxMajorVersions: (v) => /^\d+$/.test(v) && +v >= 1 && +v <= 50000 ? null : "Must be 1-50000",
    QuotaIncrementGB: (v) => /^\d+$/.test(v) && +v >= 1 && +v <= 100 ? null : "Must be 1-100",
    TeamsWebhookUrl: (v) => v === "" || /^https:\/\/[\w-]+\.webhook\.office\.com\//.test(v)
        ? null
        : "Must be empty or a valid Teams webhook URL",
    NotificationEmail: (v) => v === "" || /^[^@\s]+@northhighland\.com$/i.test(v)
        ? null
        : "Must be empty or a @northhighland.com email",
    ScheduleVersionCleanup: validateScheduleJson,
    ScheduleRecycleBinCleaner: validateScheduleJson,
    ScheduleQuotaManager: validateScheduleJson,
    ScheduleStaleSiteDetector: validateScheduleJson,
};
const handler = async function (context, req) {
    try {
        if (req.method === "GET") {
            return await handleGet(context);
        }
        if (req.method === "PUT") {
            return await handlePut(context, req);
        }
        context.res = (0, response_1.errorResponse)("Method not allowed", 405);
    }
    catch (error) {
        context.log.error("settings error:", error);
        context.res = (0, response_1.errorResponse)("An internal error occurred.");
    }
};
async function handleGet(context) {
    const settings = {};
    // Fetch all setting variables in parallel
    const results = await Promise.allSettled(SETTING_VARIABLES.map(async (name) => {
        const variable = await (0, automation_client_1.getVariable)(name);
        return { name, variable };
    }));
    for (const result of results) {
        if (result.status === "fulfilled" && result.value.variable) {
            // Strip surrounding quotes from JSON-encoded values
            let value = result.value.variable.value;
            if (value &&
                value.startsWith('"') &&
                value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            settings[result.value.name] = value;
        }
        else if (result.status === "fulfilled") {
            // Variable doesn't exist yet; omit from response
        }
        else {
            context.log.warn(`Failed to read setting: ${result.reason}`);
        }
    }
    context.res = (0, response_1.jsonResponse)(settings);
}
async function handlePut(context, req) {
    const principal = (0, auth_1.getClientPrincipal)(req);
    const body = req.body;
    if (!body || typeof body !== "object") {
        context.res = (0, response_1.errorResponse)("Request body must be a JSON object.", 400);
        return;
    }
    // Validate that only known setting names are provided
    const providedKeys = Object.keys(body);
    const invalidKeys = providedKeys.filter((key) => !SETTING_VARIABLES.includes(key));
    if (invalidKeys.length > 0) {
        context.res = (0, response_1.errorResponse)(`Unknown settings: ${invalidKeys.join(", ")}`, 400);
        return;
    }
    // Validate each value
    for (const key of providedKeys) {
        const value = body[key];
        if (value === undefined)
            continue;
        const validator = SETTING_VALIDATORS[key];
        if (validator) {
            const error = validator(value);
            if (error) {
                context.res = (0, response_1.errorResponse)(`Invalid value for ${key}: ${error}`, 400);
                return;
            }
        }
    }
    // Update each provided variable in parallel
    const updates = providedKeys.map(async (key) => {
        const value = body[key];
        if (value !== undefined) {
            await (0, automation_client_1.setVariable)(key, value);
            context.log.info(`[AUDIT] Setting updated: ${key} by ${principal.userDetails}`);
        }
    });
    await Promise.all(updates);
    // Return the updated settings
    return await handleGet(context);
}
exports.default = handler;
//# sourceMappingURL=index.js.map