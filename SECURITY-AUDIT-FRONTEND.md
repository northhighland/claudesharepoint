# Frontend Security Audit Report

**Scope:** `dashboard/src/` -- Next.js 14 Static Web App dashboard
**Date:** 2026-03-14
**Auditor:** Automated (Claude)

---

## Summary

The frontend codebase is generally well-structured with no critical vulnerabilities found. Several medium and low-severity findings were identified and fixes applied where feasible.

| Severity | Count | Fixed |
|----------|-------|-------|
| Critical | 0     | --    |
| High     | 1     | 1     |
| Medium   | 4     | 3     |
| Low      | 5     | 1     |
| Info     | 3     | --    |

---

## Findings

### HIGH-1: Settings API route method mismatch (FIXED)

**File:** `dashboard/public/staticwebapp.config.json:29`
**Issue:** The settings route was configured with `"methods": ["PUT"]` but the frontend sends `POST` requests via `updateSettings()`. This means the SWA route authorization rule never matches POST requests to `/api/settings`, causing them to fall through to the wildcard `GET`-only rule, effectively blocking settings updates for authenticated users.
**Fix:** Changed to `"methods": ["GET", "POST"]` to match the actual API contract.

### MED-1: Error messages expose internal details (FIXED)

**File:** `dashboard/src/app/page.tsx:23`
**Issue:** API error messages were displayed verbatim to users, including HTTP status codes, response bodies, and potentially internal hostnames or stack traces from the Function App.
**Fix:** Replaced with a generic user-facing error message. The `ErrorBanner` component's expandable details section still provides troubleshooting guidance without leaking server internals.

### MED-2: No client-side input validation on settings form (FIXED)

**File:** `dashboard/src/app/settings/page.tsx`
**Issue:** Numeric inputs accepted any value including 0, negative numbers, or extremely large values via `parseInt(e.target.value) || 0`. The Teams Webhook URL field accepted non-HTTPS URLs. No email format validation on the notification email field.
**Fix:** Added `validateForm()` with range checks (expireAfterDays: 1-3650, maxMajorVersions: 1-10000, quotaIncrementGB: 0.5-1000), HTTPS enforcement for webhook URLs, and basic email format validation. Validation errors are displayed before the form submits. Note: server-side validation is also required (see API audit).

### MED-3: Full email addresses displayed in stale sites table (FIXED)

**File:** `dashboard/src/components/stale-sites/site-table.tsx:214`
**Issue:** Owner email addresses were displayed in full in the stale sites table. While all users are authenticated, the principle of data minimization applies -- not all dashboard users need to see full email addresses at a glance.
**Fix:** Added `maskEmail()` helper that shows `j****n@northhighland.com` format. Full email is still available in the HTML `title` attribute on hover for users who need it, and is passed unmasked to the Notify API call.

### MED-4: CSP missing frame-ancestors, base-uri, form-action directives (FIXED)

**File:** `dashboard/public/staticwebapp.config.json:63`
**Issue:** The Content-Security-Policy was missing `frame-ancestors`, `base-uri`, and `form-action` directives. While `X-Frame-Options: DENY` covers clickjacking, CSP `frame-ancestors 'none'` is the modern standard and should also be set for defense-in-depth.
**Fix:** Added `frame-ancestors 'none'; base-uri 'self'; form-action 'self'` to the CSP header.

### LOW-1: CSP uses unsafe-inline for scripts and styles

**File:** `dashboard/public/staticwebapp.config.json:63`
**Issue:** Both `script-src` and `style-src` include unsafe-inline. This weakens XSS protections.
**Mitigation:** Next.js static export (`output: 'export'`) injects inline scripts for page hydration and Tailwind CSS uses inline styles. Removing unsafe-inline would break the application. To eliminate this, the app would need to switch to nonce-based CSP with a custom server, which is incompatible with Azure Static Web Apps' static hosting model. **Accepted risk** given that no user-controlled content is rendered unsanitized (see XSS analysis below).

### LOW-2: Tenant ID exposed in staticwebapp.config.json

**File:** `dashboard/public/staticwebapp.config.json:6`
**Issue:** The Azure AD tenant ID (`5c572e77-1a4e-4518-b82d-617cad976e5f`) is hardcoded in the OpenID issuer URL. Tenant IDs are not considered secrets by Microsoft and are discoverable via public endpoints, but exposing them in a public repository marginally increases reconnaissance surface.
**Recommendation:** This file is committed to the repo. If the repo is public, consider using SWA application settings for the tenant ID. If the repo is private (as expected for North Highland), this is acceptable.

### LOW-3: Internal SharePoint URLs visible in quota history table

**File:** `dashboard/src/components/quota/quota-history.tsx:70`
**Issue:** Full SharePoint site URLs were displayed, which can reveal internal organizational structure (team names, project names, department structure).
**Fix:** Truncated URL display to show only hostname/first-path-segment with ellipsis. Full URL preserved in `title` attribute for authenticated admin use.

### LOW-4: /.auth/me response trusted without additional validation

**File:** `dashboard/src/components/layout/header.tsx:15-22`
**Issue:** The `/.auth/me` endpoint response is used to display the user's name and roles. In Azure SWA, this endpoint is managed by the platform and cannot be spoofed by clients. However, the response is trusted without checking the structure.
**Mitigation:** This is safe because `/.auth/me` is handled by the SWA reverse proxy before reaching the app, and its response cannot be tampered with by the client. The `x-ms-client-principal` header used by the API layer is similarly proxy-injected. No fix needed.

### LOW-5: Session cookie security relies on SWA defaults

**Issue:** Authentication cookies are managed by Azure Static Web Apps' built-in auth. Cookie attributes (HttpOnly, Secure, SameSite) are controlled by the platform, not the application code. SWA sets these correctly by default (HttpOnly, Secure, SameSite=Lax).
**Recommendation:** No action needed. Document that cookie security is platform-managed.

### INFO-1: No unsafe innerHTML usage found

All 36 components were reviewed. No use of unsafe HTML rendering patterns was found. All API data is rendered through React's JSX text interpolation, which auto-escapes HTML entities. **No XSS vectors identified.**

### INFO-2: No open redirect vulnerabilities

The only `window.location` usage is in:
- `auth.ts`: `window.location.origin` (reads current origin, not user input)
- `header.tsx`: `window.location.href = "/.auth/logout"` (hardcoded path)

No user-controlled values are used in redirects. **No open redirect vulnerabilities found.**

### INFO-3: No hardcoded secrets or API keys

Searched all source files for patterns matching API keys, tokens, secrets, passwords, and credentials. None found. Environment variables are used correctly:
- `NEXT_PUBLIC_AZURE_CLIENT_ID` -- public client ID (safe to expose)
- `NEXT_PUBLIC_AZURE_TENANT_ID` -- tenant ID (not a secret)
- `AAD_CLIENT_ID` / `AAD_CLIENT_SECRET` -- referenced by setting name only in SWA config, never in code

---

## Architecture Security Assessment

### Auth Flow (SWA Built-in Auth)
- All routes require `authenticated` role via `staticwebapp.config.json`
- Unauthenticated users are redirected to `/.auth/login/aad` (302)
- Logout via `/.auth/logout` clears the SWA session
- API calls include the SWA-injected `x-ms-client-principal` header automatically
- **Assessment: Secure.** No client-side token management, no token storage in localStorage.

### API Communication
- All API calls go through the relative `/api` prefix, which SWA proxies to the linked Function App
- HTTPS is enforced by SWA (Strict-Transport-Security header is set)
- No mixed content -- no absolute HTTP URLs in the codebase
- `fetchJSON` helper includes proper error handling without exposing internals (post-fix)

### Dependency Risk
- Next.js 14.2.3 -- check for CVEs (delegated to dependency audit)
- `@azure/msal-browser` 3.10.0, `@azure/msal-react` 2.0.12 -- included but unused (SWA handles auth). Consider removing to reduce attack surface.
- `recharts` 2.12.2, `swr` 2.2.5 -- no known CVEs at audit time
- `@azure/data-tables` 13.2.2 -- included in dashboard dependencies but appears unused in frontend code. Likely only needed in API functions.

### Security Headers (staticwebapp.config.json)
| Header | Value | Assessment |
|--------|-------|------------|
| X-Content-Type-Options | nosniff | Good |
| X-Frame-Options | DENY | Good |
| X-XSS-Protection | 0 | Good (disabled, as recommended by OWASP for modern browsers) |
| Referrer-Policy | strict-origin-when-cross-origin | Good |
| Content-Security-Policy | (see above) | Adequate with accepted risks |
| Permissions-Policy | camera=(), microphone=(), geolocation=(), payment=() | Good |
| Strict-Transport-Security | max-age=31536000; includeSubDomains | Good |
| Cache-Control | no-store | Good (prevents caching of sensitive data) |

---

## Files Modified

1. `dashboard/public/staticwebapp.config.json` -- Fixed settings route method, tightened CSP
2. `dashboard/src/app/settings/page.tsx` -- Added client-side input validation
3. `dashboard/src/app/page.tsx` -- Sanitized error message output
4. `dashboard/src/components/stale-sites/site-table.tsx` -- Added email masking
5. `dashboard/src/components/quota/quota-history.tsx` -- Truncated internal URLs

---

## Recommendations (Not Fixed -- Requires Architectural Decision)

1. **Remove unused MSAL dependencies** -- `@azure/msal-browser` and `@azure/msal-react` are imported in `auth.ts` but the `Providers` component explicitly notes SWA handles auth. Removing these saves ~200KB and eliminates unused attack surface.

2. **Remove `@azure/data-tables` from dashboard** -- This appears to be an API-side dependency that was added to the dashboard `package.json` by mistake. Frontend code never imports it.

3. **Add role-based access control** -- Currently all authenticated users can trigger jobs (including live runs) and modify settings. Consider adding an `admin` role requirement for destructive operations like `jobs-trigger` POST and `settings` POST routes in `staticwebapp.config.json`.

4. **Server-side validation** -- Client-side validation was added for settings, but the API endpoints must also validate inputs. Client-side validation is a UX convenience, not a security control.
