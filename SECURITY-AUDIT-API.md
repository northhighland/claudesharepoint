# API Security Audit Report

**Date:** 2026-03-14
**Scope:** `dashboard/api/` -- Azure Functions API for SharePoint storage management dashboard
**Auditor:** Claude Code (API Security Agent)

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1     |
| High     | 2     |
| Medium   | 5     |
| Low      | 3     |

---

## Findings

### 1. OData Injection via Raw String Interpolation

- **Severity:** Critical
- **File:** `dashboard/api/jobs/index.ts:120`
- **Description:** The `handleGetJob` function constructs an OData filter using raw string interpolation: `` `PartitionKey eq '${runId}'` ``. While `runId` is validated against a regex (`/^\d{8}_\d{6}$/`), the pattern of using raw interpolation is dangerous and bypasses the `odata` tagged template literal's built-in sanitization. If the regex were ever relaxed or removed, this becomes a direct OData injection vector.
- **Fix Applied:** Changed to use the `odata` tagged template literal: `` odata`PartitionKey eq ${runId}` ``. Also fixed the import to use `odata` from `../shared/table-client` instead of `@azure/data-tables` directly, for consistency.

### 2. Error Information Leakage in jobs-trigger

- **Severity:** High
- **File:** `dashboard/api/jobs-trigger/index.ts:56`
- **Description:** The error response directly concatenated the raw error message: `"Failed to trigger job: " + error.message`. This leaks internal Azure Automation API error details (subscription IDs, resource group names, API versions, authentication failures) to the client.
- **Fix Applied:** Error details are now logged server-side only. The client receives a generic message: `"Failed to trigger job. Please try again or contact support."`

### 3. Silent Auth Fallback Returns Default Principal

- **Severity:** High
- **File:** `dashboard/api/shared/auth.ts:17-24`
- **Description:** When the `x-ms-client-principal` header is missing, `getClientPrincipal()` silently returns a default principal with `userId: "unknown"` and empty roles. While SWA enforces auth at the routing layer (mitigating direct exploitation), this means any code that checks `principal.userRoles` for authorization will silently pass for unauthenticated requests if SWA routing is misconfigured, or during local development without SWA CLI.
- **Recommendation:** Consider throwing an error or returning `null` instead of a default, forcing callers to handle the unauthenticated case explicitly. The current design is acceptable behind SWA's auth enforcement but represents a defense-in-depth gap.

### 4. Missing Input Validation on Query Parameters

- **Severity:** Medium
- **File:** `dashboard/api/dashboard-overview/index.ts:47`
- **Description:** The `range` query parameter accepted any arbitrary string value. While only `30d` and `90d` triggered OData date filters, unexpected values silently fell through to an unfiltered query. An attacker could not inject anything, but the lack of allowlist validation is inconsistent with the other endpoints.
- **Fix Applied:** Added allowlist validation for `range` parameter against `["30d", "90d", "all"]`.

- **File:** `dashboard/api/quota-status/index.ts:23-24`
- **Description:** The `sort` query parameter was not validated against known field names. The `top` parameter used `parseInt` without NaN checking or upper bounds, meaning a value like `top=999999999` would attempt to load all records.
- **Fix Applied:** Added allowlist validation for `sort` (must be `percentUsed` or `storageUsedGB`). Added NaN checking and capped `top` at 1000.

- **File:** `dashboard/api/sites-stale/index.ts:40`
- **Description:** The `category` query parameter was not validated. While it was used only for in-memory filtering (no injection risk), it should be validated for consistency and to give clear feedback on typos.
- **Fix Applied:** Added allowlist validation for `category` against known categories.

### 5. CSP Allows `unsafe-inline` for Scripts

- **Severity:** Medium
- **File:** `dashboard/public/staticwebapp.config.json:63`
- **Description:** The Content-Security-Policy header includes `script-src 'self' 'unsafe-inline'`. This weakens XSS protections by allowing inline `<script>` tags. Next.js requires this for its hydration mechanism in some configurations, making it difficult to remove without nonce-based CSP.
- **Recommendation:** If Next.js supports it in the current version, migrate to nonce-based CSP (`script-src 'self' 'nonce-{random}'`). Otherwise, document this as a known trade-off.

### 6. Missing HSTS Header

- **Severity:** Medium
- **File:** `dashboard/public/staticwebapp.config.json`
- **Description:** The `Strict-Transport-Security` header was not set. While Azure Static Web Apps enforce HTTPS, HSTS tells browsers to always use HTTPS, preventing downgrade attacks.
- **Fix Applied:** Added `"Strict-Transport-Security": "max-age=31536000; includeSubDomains"` to `globalHeaders`.

### 7. No Rate Limiting on Mutation Endpoints

- **Severity:** Medium
- **File:** `dashboard/api/jobs-trigger/index.ts`, `dashboard/api/settings/index.ts`, `dashboard/api/sites-stale/index.ts`
- **Description:** POST/PUT endpoints that trigger runbooks, modify settings, or update site actions have no rate limiting. An authenticated user could trigger hundreds of runbook executions rapidly. Azure Static Web Apps does not provide built-in rate limiting.
- **Recommendation:** Add rate limiting via Azure API Management front-end, or implement a simple in-memory/table-based throttle (e.g., check if a job was triggered in the last N minutes before allowing another trigger). At minimum, the `jobs-trigger` endpoint should prevent duplicate concurrent triggers of the same job type.

### 8. Owner Email Exposed in Stale Sites Response

- **Severity:** Low
- **File:** `dashboard/api/shared/transforms.ts:106`
- **Description:** The `mapStaleSiteEntity` function includes `ownerEmail` in the response payload. While the dashboard is authenticated and internal, exposing email addresses in API responses can be a data minimization concern under privacy policies.
- **Recommendation:** Consider whether this field is needed in the API response or if it should be masked (e.g., `j***@northhighland.com`).

### 9. Function authLevel Set to `anonymous`

- **Severity:** Low
- **File:** All `function.json` files
- **Description:** All function bindings use `"authLevel": "anonymous"`. This is correct and expected for Azure Static Web Apps managed functions, where auth is enforced at the SWA routing layer via `staticwebapp.config.json`. The `authLevel` setting only applies to standalone Azure Functions, not SWA-managed functions. Documented here for completeness.
- **Status:** No action needed.

### 10. Table Name Not Validated in table-client

- **Severity:** Low
- **File:** `dashboard/api/shared/table-client.ts:20`
- **Description:** The `getTableClient` function accepts any string as `tableName` and passes it directly to `TableClient`. All callers use hardcoded table names, so this is not exploitable in the current code. However, if a future endpoint accepts a table name from user input, it could be used to access arbitrary tables.
- **Recommendation:** Consider adding an allowlist of valid table names in `getTableClient` for defense-in-depth.

---

## Positive Findings

The following security controls are already well-implemented:

1. **Auth enforcement via SWA config** -- All routes require `authenticated` role. Mutation endpoints (POST/PUT) have explicit route-level auth rules.
2. **HTTP method enforcement** -- Both `function.json` and `staticwebapp.config.json` restrict methods. Code also validates methods and returns 405.
3. **OData injection prevention** -- Most endpoints use the `odata` tagged template literal correctly, and filter values are validated against allowlists before being used in queries.
4. **Generic error messages** -- All endpoints return `"An internal error occurred."` to clients, with detailed errors logged server-side only. (Exception was jobs-trigger, now fixed.)
5. **Security headers** -- Good set of headers including `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and `Cache-Control: no-store`.
6. **Input validation on settings** -- The settings endpoint has thorough per-field validators with strict patterns for URLs, emails, and numeric ranges.
7. **Audit logging** -- All mutation operations log the authenticated user and action via `[AUDIT]` prefix.
8. **Managed Identity auth** -- No stored credentials; uses `ManagedIdentityCredential` for both Table Storage and Automation Account access.

---

## Files Modified

| File | Change |
|------|--------|
| `dashboard/api/jobs/index.ts` | Fixed OData injection (raw string to `odata` template) |
| `dashboard/api/jobs-trigger/index.ts` | Removed error message leakage |
| `dashboard/api/dashboard-overview/index.ts` | Added `range` parameter validation |
| `dashboard/api/quota-status/index.ts` | Added `sort` and `top` parameter validation |
| `dashboard/api/sites-stale/index.ts` | Added `category` parameter validation |
| `dashboard/public/staticwebapp.config.json` | Added HSTS header |
