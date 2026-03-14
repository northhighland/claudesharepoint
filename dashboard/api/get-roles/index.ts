import { AzureFunction, Context, HttpRequest } from "@azure/functions";

/**
 * SWA rolesSource endpoint — called after AAD login to determine custom roles.
 * Returns { "roles": ["admin"] } if the user's email is in the ADMIN_USERS list.
 *
 * Configure ADMIN_USERS as a comma-separated list of email addresses in
 * the Function App's application settings.
 *
 * See: https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-custom
 */
const handler: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  try {
    const clientPrincipal = req.body?.clientPrincipal;
    if (!clientPrincipal?.userDetails) {
      context.res = { status: 200, body: { roles: [] } };
      return;
    }

    const userEmail = clientPrincipal.userDetails.toLowerCase();
    const adminList = (process.env.ADMIN_USERS ?? "")
      .split(",")
      .map((e: string) => e.trim().toLowerCase())
      .filter(Boolean);

    const roles: string[] = [];
    if (adminList.includes(userEmail)) {
      roles.push("admin");
    }

    context.log.info(`[ROLES] User=${userEmail}, Roles=[${roles.join(",")}]`);

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { roles },
    };
  } catch (error) {
    context.log.error("get-roles error:", error);
    context.res = { status: 200, body: { roles: [] } };
  }
};

export default handler;
