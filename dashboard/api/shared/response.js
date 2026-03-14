"use strict";
/**
 * Standard API response helpers for consistent formatting.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonResponse = jsonResponse;
exports.errorResponse = errorResponse;
const SECURITY_HEADERS = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
};
function jsonResponse(data, status = 200) {
    return {
        status,
        headers: SECURITY_HEADERS,
        body: JSON.stringify({ success: true, data }),
    };
}
function errorResponse(message, status = 500) {
    return {
        status,
        headers: SECURITY_HEADERS,
        body: JSON.stringify({ success: false, error: message }),
    };
}
//# sourceMappingURL=response.js.map