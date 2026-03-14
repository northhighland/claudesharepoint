"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientPrincipal = getClientPrincipal;
/**
 * Extracts the authenticated client principal from the SWA request header.
 * Returns a safe default if the header is missing (should not happen
 * behind SWA auth, but defensive coding for ISO 27001 A.8.25).
 */
function getClientPrincipal(req) {
    const header = req.headers["x-ms-client-principal"];
    if (!header) {
        return {
            identityProvider: "unknown",
            userId: "unknown",
            userDetails: "unknown",
            userRoles: [],
        };
    }
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    return JSON.parse(decoded);
}
//# sourceMappingURL=auth.js.map