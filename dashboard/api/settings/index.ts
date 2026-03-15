import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { getVariable, setVariable } from "../shared/automation-client";
import { jsonResponse, errorResponse } from "../shared/response";
import { SettingsMap } from "../shared/types";
import { getClientPrincipal } from "../shared/auth";

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
  "StaleSiteWeights",
  "StaleSiteThresholds",
] as const;

type SettingName = (typeof SETTING_VARIABLES)[number];

/** Validates a schedule JSON string. */
function validateScheduleJson(v: string): string | null {
  if (v === "") return null;
  try {
    const obj = JSON.parse(v);
    if (typeof obj.enabled !== "boolean") return "enabled must be a boolean";
    if (!["daily", "weekly", "monthly"].includes(obj.frequency))
      return "frequency must be daily, weekly, or monthly";
    if (typeof obj.timeUtc !== "string" || !/^\d{2}:\d{2}$/.test(obj.timeUtc))
      return "timeUtc must be HH:MM format";
    return null;
  } catch {
    return "Must be valid JSON";
  }
}

/** Per-field value validators to prevent dangerous values. */
const SETTING_VALIDATORS: Record<SettingName, (v: string) => string | null> = {
  ExpireAfterDays: (v) =>
    /^\d+$/.test(v) && +v >= 1 && +v <= 3650 ? null : "Must be 1-3650",
  MaxMajorVersions: (v) =>
    /^\d+$/.test(v) && +v >= 1 && +v <= 50000 ? null : "Must be 1-50000",
  QuotaIncrementGB: (v) =>
    /^\d+$/.test(v) && +v >= 1 && +v <= 100 ? null : "Must be 1-100",
  TeamsWebhookUrl: (v) =>
    v === "" || /^https:\/\/[\w-]+\.webhook\.office\.com\//.test(v)
      ? null
      : "Must be empty or a valid Teams webhook URL",
  NotificationEmail: (v) =>
    v === "" || /^[^@\s]+@northhighland\.com$/i.test(v)
      ? null
      : "Must be empty or a @northhighland.com email",
  ScheduleVersionCleanup: validateScheduleJson,
  ScheduleRecycleBinCleaner: validateScheduleJson,
  ScheduleQuotaManager: validateScheduleJson,
  ScheduleStaleSiteDetector: validateScheduleJson,
  StaleSiteWeights: (v) => {
    if (v === "") return null;
    try { const o = JSON.parse(v); if (typeof o !== "object") return "Must be JSON object"; return null; }
    catch { return "Must be valid JSON"; }
  },
  StaleSiteThresholds: (v) => {
    if (v === "") return null;
    try { const o = JSON.parse(v); if (typeof o !== "object") return "Must be JSON object"; return null; }
    catch { return "Must be valid JSON"; }
  },
};

const handler: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  try {
    if (req.method === "GET") {
      return await handleGet(context);
    }

    if (req.method === "PUT") {
      return await handlePut(context, req);
    }

    context.res = errorResponse("Method not allowed", 405);
  } catch (error: unknown) {
    context.log.error("settings error:", error);
    context.res = errorResponse("An internal error occurred.");
  }
};

async function handleGet(context: Context): Promise<void> {
  const settings: SettingsMap = {};

  // Fetch all setting variables in parallel
  const results = await Promise.allSettled(
    SETTING_VARIABLES.map(async (name) => {
      const variable = await getVariable(name);
      return { name, variable };
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.variable) {
      // Strip surrounding quotes from JSON-encoded values
      let value = result.value.variable.value;
      if (
        value &&
        value.startsWith('"') &&
        value.endsWith('"')
      ) {
        value = value.slice(1, -1);
      }
      settings[result.value.name] = value;
    } else if (result.status === "fulfilled") {
      // Variable doesn't exist yet; omit from response
    } else {
      context.log.warn(
        `Failed to read setting: ${result.reason}`
      );
    }
  }

  context.res = jsonResponse(settings);
}

async function handlePut(
  context: Context,
  req: HttpRequest
): Promise<void> {
  const principal = getClientPrincipal(req);
  const body = req.body as Partial<Record<SettingName, string>> | undefined;

  if (!body || typeof body !== "object") {
    context.res = errorResponse("Request body must be a JSON object.", 400);
    return;
  }

  // Validate that only known setting names are provided
  const providedKeys = Object.keys(body);
  const invalidKeys = providedKeys.filter(
    (key) => !SETTING_VARIABLES.includes(key as SettingName)
  );

  if (invalidKeys.length > 0) {
    context.res = errorResponse(
      `Unknown settings: ${invalidKeys.join(", ")}`,
      400
    );
    return;
  }

  // Validate each value
  for (const key of providedKeys) {
    const value = body[key as SettingName];
    if (value === undefined) continue;
    const validator = SETTING_VALIDATORS[key as SettingName];
    if (validator) {
      const error = validator(value);
      if (error) {
        context.res = errorResponse(`Invalid value for ${key}: ${error}`, 400);
        return;
      }
    }
  }

  // Update each provided variable in parallel
  const updates = providedKeys.map(async (key) => {
    const value = body[key as SettingName];
    if (value !== undefined) {
      await setVariable(key, value);
      context.log.info(
        `[AUDIT] Setting updated: ${key} by ${principal.userDetails}`
      );
    }
  });

  await Promise.all(updates);

  // Return the updated settings
  return await handleGet(context);
}

export default handler;
