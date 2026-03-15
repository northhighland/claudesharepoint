import { HttpRequest } from "@azure/functions";

export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
}

/** Trusted identity providers — reject anything unexpected (OWASP A07:2021). */
const TRUSTED_PROVIDERS = ["aad", "azureactivedirectory"];

/**
 * Extracts the authenticated client principal from the SWA request header.
 * Returns a safe default if the header is missing (should not happen
 * behind SWA auth, but defensive coding for ISO 27001 A.8.25).
 *
 * Validates identityProvider against allow-list to prevent spoofing
 * via misconfigured identity providers.
 */
export function getClientPrincipal(req: HttpRequest): ClientPrincipal {
  const header = req.headers["x-ms-client-principal"];
  if (!header) {
    return {
      identityProvider: "unknown",
      userId: "unknown",
      userDetails: "unknown",
      userRoles: [],
    };
  }

  try {
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as ClientPrincipal;

    // Validate expected shape to prevent prototype pollution or malformed data
    if (
      typeof parsed.identityProvider !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.userDetails !== "string" ||
      !Array.isArray(parsed.userRoles)
    ) {
      return {
        identityProvider: "unknown",
        userId: "unknown",
        userDetails: "unknown",
        userRoles: [],
      };
    }

    // Validate identity provider is from a trusted source
    if (!TRUSTED_PROVIDERS.includes(parsed.identityProvider.toLowerCase())) {
      return {
        identityProvider: "untrusted",
        userId: "unknown",
        userDetails: "unknown",
        userRoles: [],
      };
    }

    return parsed;
  } catch {
    // Malformed header — fail securely (OWASP A07:2021)
    return {
      identityProvider: "unknown",
      userId: "unknown",
      userDetails: "unknown",
      userRoles: [],
    };
  }
}

/**
 * Checks whether the principal holds a specific role.
 * Use this for programmatic role checks beyond what SWA route rules enforce.
 */
export function hasRole(principal: ClientPrincipal, role: string): boolean {
  return (
    Array.isArray(principal.userRoles) && principal.userRoles.includes(role)
  );
}

/**
 * Returns true if the principal is authenticated via a trusted provider.
 */
export function isAuthenticated(principal: ClientPrincipal): boolean {
  return (
    TRUSTED_PROVIDERS.includes(principal.identityProvider.toLowerCase()) &&
    principal.userId !== "unknown"
  );
}
