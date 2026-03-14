import { HttpRequest } from "@azure/functions";
export interface ClientPrincipal {
    identityProvider: string;
    userId: string;
    userDetails: string;
    userRoles: string[];
}
/**
 * Extracts the authenticated client principal from the SWA request header.
 * Returns a safe default if the header is missing (should not happen
 * behind SWA auth, but defensive coding for ISO 27001 A.8.25).
 */
export declare function getClientPrincipal(req: HttpRequest): ClientPrincipal;
//# sourceMappingURL=auth.d.ts.map