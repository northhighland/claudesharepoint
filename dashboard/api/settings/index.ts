import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { getVariable, setVariable } from "../shared/automation-client";
import { jsonResponse, errorResponse } from "../shared/response";
import { SettingsMap } from "../shared/types";

/** Automation variable names that map to dashboard settings. */
const SETTING_VARIABLES = [
  "ExpireAfterDays",
  "MaxMajorVersions",
  "QuotaIncrementGB",
  "ExclusionPatterns",
  "TeamsWebhookUrl",
  "NotificationEmail",
] as const;

type SettingName = (typeof SETTING_VARIABLES)[number];

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
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    context.log.error("settings error:", message);
    context.res = errorResponse(message);
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
      `Unknown settings: ${invalidKeys.join(", ")}. Valid settings: ${SETTING_VARIABLES.join(", ")}`,
      400
    );
    return;
  }

  // Update each provided variable in parallel
  const updates = providedKeys.map(async (key) => {
    const value = body[key as SettingName];
    if (value !== undefined) {
      await setVariable(key, value);
      context.log.info(`Updated setting: ${key}`);
    }
  });

  await Promise.all(updates);

  // Return the updated settings
  return await handleGet(context);
}

export default handler;
