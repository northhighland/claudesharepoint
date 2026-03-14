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
export declare function jsonResponse<T>(data: T, status?: number): {
    status: number;
    headers: Record<string, string>;
    body: string;
};
export declare function errorResponse(message: string, status?: number): {
    status: number;
    headers: Record<string, string>;
    body: string;
};
//# sourceMappingURL=response.d.ts.map