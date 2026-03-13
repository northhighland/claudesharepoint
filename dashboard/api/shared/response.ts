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

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
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
