# Dependency Security Audit Report

**Date:** 2026-03-14
**Auditor:** Automated (Claude Code)
**Scope:** `dashboard/` and `dashboard/api/`

---

## 1. CVEs Found

### dashboard/ (npm audit)

#### FIXED - Critical: Next.js (14.2.3 -> 14.2.35)

The original Next.js 14.2.3 had **1 critical + 6 high** severity vulnerabilities:

| CVE / Advisory | Severity | Description | Status |
|---|---|---|---|
| [GHSA-f82v-jwr5-mffw](https://github.com/advisories/GHSA-f82v-jwr5-mffw) | **Critical** | Authorization Bypass in Next.js Middleware | **Fixed** (14.2.35) |
| [GHSA-gp8f-8m3g-qvj9](https://github.com/advisories/GHSA-gp8f-8m3g-qvj9) | High | Next.js Cache Poisoning | **Fixed** (14.2.35) |
| [GHSA-g77x-44xx-532m](https://github.com/advisories/GHSA-g77x-44xx-532m) | High | DoS in Next.js image optimization | **Fixed** (14.2.35) |
| [GHSA-7m27-7ghc-44w9](https://github.com/advisories/GHSA-7m27-7ghc-44w9) | High | DoS with Server Actions | **Fixed** (14.2.35) |
| [GHSA-3h52-269p-cp9r](https://github.com/advisories/GHSA-3h52-269p-cp9r) | High | Information exposure in dev server | **Fixed** (14.2.35) |
| [GHSA-g5qg-72qw-gw5v](https://github.com/advisories/GHSA-g5qg-72qw-gw5v) | High | Cache Key Confusion for Image Optimization | **Fixed** (14.2.35) |
| [GHSA-7gfc-8cq8-jh5f](https://github.com/advisories/GHSA-7gfc-8cq8-jh5f) | High | Authorization bypass vulnerability | **Fixed** (14.2.35) |
| [GHSA-4342-x723-ch2f](https://github.com/advisories/GHSA-4342-x723-ch2f) | High | Improper Middleware Redirect -> SSRF | **Fixed** (14.2.35) |
| [GHSA-xv57-4mr9-wg8v](https://github.com/advisories/GHSA-xv57-4mr9-wg8v) | High | Content Injection for Image Optimization | **Fixed** (14.2.35) |
| [GHSA-qpjv-v59x-3qc4](https://github.com/advisories/GHSA-qpjv-v59x-3qc4) | High | Race Condition to Cache Poisoning | **Fixed** (14.2.35) |
| [GHSA-mwv6-3258-q52c](https://github.com/advisories/GHSA-mwv6-3258-q52c) | High | DoS with Server Components | **Fixed** (14.2.35) |
| [GHSA-5j59-xgg2-r9c4](https://github.com/advisories/GHSA-5j59-xgg2-r9c4) | High | DoS with Server Components (follow-up) | **Fixed** (14.2.35) |

#### FIXED - High: minimatch ReDoS (via @typescript-eslint)

| Advisory | Severity | Description | Status |
|---|---|---|---|
| [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26) | High | minimatch ReDoS via repeated wildcards | **Fixed** (14.2.35 update resolved transitive dep) |
| [GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj) | High | minimatch ReDoS via GLOBSTAR segments | **Fixed** |
| [GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74) | High | minimatch ReDoS via nested extglobs | **Fixed** |

#### REMAINING - High: glob CLI command injection (dev-only)

| Advisory | Severity | Package | Status |
|---|---|---|---|
| [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2) | High | glob 10.2.0-10.4.5 (via eslint-config-next) | **Unfixable** without Next.js 15+ upgrade |

**Risk:** Low. This is a dev-time dependency only (ESLint plugin). The glob CLI command injection requires direct CLI usage of glob with `--cmd` flag, which does not happen in this project. Not exploitable in production.

#### REMAINING - High: Next.js DoS advisories (2 remaining)

| Advisory | Severity | Description | Status |
|---|---|---|---|
| [GHSA-9g9p-9gw9-jx7f](https://github.com/advisories/GHSA-9g9p-9gw9-jx7f) | High | DoS via Image Optimizer remotePatterns (self-hosted) | **Unfixable** without Next.js 15+ |
| [GHSA-h25m-26qc-wcjf](https://github.com/advisories/GHSA-h25m-26qc-wcjf) | High | HTTP request deserialization DoS (RSC) | **Unfixable** without Next.js 15+ |

**Risk:** Moderate. The Image Optimizer DoS only applies to self-hosted Next.js with remote patterns configured. This dashboard is deployed on Azure Static Web Apps (static export), so the Image Optimizer is not running in production. The RSC DoS requires insecure React Server Components usage.

### dashboard/api/ (npm audit)

**0 vulnerabilities found.** Clean audit.

### Azure SDK Packages

| Package | Installed Version | CVE | Status |
|---|---|---|---|
| @azure/identity | 4.13.0 | CVE-2024-35255 (fixed in 4.2.1) | **Not affected** - version is patched |
| @azure/data-tables | 13.2.2 | No known CVEs | **Clean** |
| @azure/msal-browser | 3.30.0 | No known CVEs | **Clean** |

---

## 2. Packages Updated

### dashboard/package.json

| Package | From | To | Reason |
|---|---|---|---|
| next | 14.2.3 | 14.2.35 | 1 critical + 12 high CVEs fixed |
| eslint-config-next | 14.2.3 | 14.2.35 | Match Next.js version, fixes minimatch transitive CVEs |

### dashboard/api/package.json

No changes applied. See "Manual Attention Required" below.

---

## 3. Node.js Version References

| File | Current | Required | Status |
|---|---|---|---|
| `.github/workflows/ci.yml` | 22 | 22 LTS | **OK** |
| `.github/workflows/deploy.yml` (deploy-api) | 22 | 22 LTS | **OK** |
| `.github/workflows/deploy.yml` (deploy-frontend) | 22 | 22 LTS | **OK** |
| `package.json` engines field | Not set | N/A | **OK** (no restriction) |
| Dockerfiles | None found | N/A | **OK** |

All CI/CD pipelines already reference Node.js 22. No changes needed.

---

## 4. Items Requiring Manual Attention

### HIGH PRIORITY: Upgrade to Next.js 15+ (future)

Next.js 14.2.x is the latest patched 14.x release, but 2 high-severity DoS advisories remain unfixable without upgrading to Next.js 15+. Since this dashboard uses static export on Azure Static Web Apps, the runtime DoS risk is minimal, but a planned migration to Next.js 15 should be scheduled.

### MEDIUM PRIORITY: @azure/functions v3 -> v4 Migration

Azure Functions runtime v3 reached end of extended support on December 13, 2022. Apps on v3 no longer receive security patches. The `@azure/functions` package in `dashboard/api/` is at v3.5.1.

**Why not auto-fixed:** The v4 SDK has a completely new programming model (breaking changes to `AzureFunction`, `Context`, `HttpRequest`, `HttpResponse` types). All API function files need to be rewritten to the v4 model. This requires a dedicated migration effort.

**Affected files:**
- `dashboard/api/dashboard-overview/index.ts`
- `dashboard/api/jobs/index.ts`
- `dashboard/api/jobs-trigger/index.ts`
- `dashboard/api/quota-status/index.ts`
- `dashboard/api/settings/index.ts`
- `dashboard/api/sites-stale/index.ts`
- `dashboard/api/shared/auth.ts`

### LOW PRIORITY: Major Version Upgrades Available

These packages have major version upgrades available but are not security-critical:

| Package | Current | Latest | Breaking Change Notes |
|---|---|---|---|
| @azure/msal-browser | 3.30.0 | 5.5.0 | Major rewrite; requires @azure/msal-react 5.x |
| @azure/msal-react | 2.2.0 | 5.0.7 | Must upgrade with msal-browser |
| react | 18.3.1 | 19.2.4 | React 19 - concurrent features, new APIs |
| react-dom | 18.3.1 | 19.2.4 | Must upgrade with React |
| eslint | 8.57.1 | 10.0.3 | Flat config required |
| lucide-react | 0.344.0 | 0.577.0 | Icon name changes possible |
| recharts | 2.15.4 | 3.8.0 | New API surface |
| tailwind-merge | 2.6.1 | 3.5.0 | API changes |
| @types/node | 20.19.37 | 25.5.0 | Type definitions only |
| @types/react | 18.3.28 | 19.2.14 | Must match React version |
| @types/react-dom | 18.3.7 | 19.2.3 | Must match React DOM version |

### NO ACTION: PnP.PowerShell

No known CVEs specific to PnP.PowerShell were found. General PowerShell CVE-2025-54100 (RCE via Invoke-WebRequest command injection) affects Windows PowerShell, not the PnP module itself.

---

## 5. Build Verification

| Target | Command | Result |
|---|---|---|
| Dashboard | `npm run build` | **PASS** - Next.js 14.2.35 builds successfully |
| API | `npm run build` | **PASS** - No changes made, builds as before |

---

## Summary

- **Before:** 7 vulnerabilities (1 critical, 6 high) in dashboard, 0 in API
- **After:** 4 vulnerabilities (4 high, dev-only or mitigated by deployment model) in dashboard, 0 in API
- **Critical CVEs eliminated:** Yes (middleware auth bypass fixed)
- **Node.js:** Already on v22 LTS across all CI/CD
- **Breaking changes deferred:** Next.js 15, @azure/functions v4, MSAL v5, React 19
