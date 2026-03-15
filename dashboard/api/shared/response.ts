/**
 * Standard API response helpers for consistent formatting.
 */

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Security headers applied to every API response.
 *
 * Defence-in-depth: these supplement the globalHeaders in
 * staticwebapp.config.json so that even if the SWA reverse-proxy
 * is bypassed (e.g. direct Function URL), headers are still set.
 *
 * OWASP ref: A05:2021 — Security Misconfiguration
 */
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

export function jsonResponse<T>(data: T, status = 200): {
  status: number;
  headers: Record<string, string>;
  body: string;
} {
  return {
    status,
    headers: SECURITY_HEADERS,
    body: JSON.stringify({ success: true, data }),
  };
}

export function errorResponse(
  message: string,
  status = 500
): {
  status: number;
  headers: Record<string, string>;
  body: string;
} {
  return {
    status,
    headers: SECURITY_HEADERS,
    body: JSON.stringify({ success: false, error: message }),
  };
}
