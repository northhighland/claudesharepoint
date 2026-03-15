# Infrastructure Security Audit

**Date:** 2026-03-14
**Scope:** All Bicep modules, deployment scripts, and CI/CD workflows
**Standards:** ISO 27001, Cyber Essentials Plus (CE+)
**Auditor:** Automated (Claude Code)

---

## Summary

| Area | Status | Findings |
|------|--------|----------|
| Key Vault | IMPROVED | Purge protection added; diagnostic settings added; network ACLs still open |
| Storage Account | GOOD | TLS 1.2, HTTPS-only, shared key disabled, blob public access disabled |
| Automation Account | GOOD | System-assigned managed identity, diagnostics enabled |
| Static Web App | ACCEPTABLE | Standard SKU with managed identity; staging disabled |
| Function App | GOOD | HTTPS-only, FTPS disabled, TLS 1.2 enforced |
| Log Analytics | ACCEPTABLE | 30-day retention (configurable) |
| RBAC | GOOD | Scoped role assignments, least-privilege patterns |
| Networking | NEEDS WORK | Most resources allow public access |
| Tags | FIXED | Tags added to all resources |
| CI/CD | GOOD | OIDC auth, no stored credentials, concurrency controls |

---

## Findings and Remediation

### 1. Key Vault (`main.bicep`)

**FIXED - Purge protection not enabled**
- Severity: HIGH
- `enablePurgeProtection: true` was missing. Without it, deleted secrets can be permanently purged, violating ISO 27001 A.12.3 (backup/recovery) controls.
- **Fix applied:** Added `enablePurgeProtection: true` (line ~43).

**FIXED - No diagnostic settings**
- Severity: MEDIUM
- Key Vault audit logs are critical for ISO 27001 A.12.4 (logging and monitoring). Access events were not being sent to Log Analytics.
- **Fix applied:** Added `keyVaultDiagnostics` resource sending all logs and metrics to Log Analytics.

**OPEN - Network ACLs default to Allow**
- Severity: MEDIUM
- `defaultAction: 'Allow'` permits access from any network. For CE+ compliance, Key Vault should restrict to known networks.
- **Recommendation:** Change `defaultAction` to `'Deny'` and add IP rules or virtual network rules for authorized access. Note: this requires the Automation Account and Function App to access Key Vault via service endpoints or private endpoints, which adds deployment complexity. The current `bypass: 'AzureServices'` partially mitigates this for first-party Azure services.

### 2. Storage Account (`modules/storage-account.bicep`)

**GOOD - Already hardened:**
- `minimumTlsVersion: 'TLS1_2'` -- enforced
- `supportsHttpsTrafficOnly: true` -- enforced
- `allowBlobPublicAccess: false` -- blob containers not publicly accessible
- `allowSharedKeyAccess: false` -- forces managed identity / Azure AD auth (excellent)
- Blob containers set to `publicAccess: 'None'`
- Blob versioning enabled (NH policy)

**OPEN - Network ACLs default to Allow**
- Severity: MEDIUM
- Has specific IP rules (`4.59.15.66`, `8.31.229.4`) but `defaultAction: 'Allow'` means they are informational only -- all traffic is permitted regardless.
- **Recommendation:** Change `defaultAction` to `'Deny'` so only the listed IPs and Azure services can access the storage account. This is the intended behavior of the IP rules.

**OPEN - No diagnostic settings on storage account**
- Severity: LOW
- Storage account access logs are not forwarded to Log Analytics.
- **Recommendation:** Add diagnostic settings for blob and table services to capture read/write/delete operations.

### 3. Automation Account (`modules/automation-account.bicep`)

**GOOD:**
- System-assigned managed identity configured
- Diagnostic settings forwarding all logs and metrics to Log Analytics
- Variables are not encrypted (but contain only configuration values, not secrets)

**OPEN - Public network access enabled**
- Severity: LOW
- `publicNetworkAccess: true` is required for Azure portal management and webhook triggers. Acceptable for current use case.

**NOTE - Automation variables not encrypted**
- Severity: LOW
- All variables have `isEncrypted: false`. Current variables are configuration values (thresholds, names) not secrets, so this is acceptable. Secrets are correctly stored in Key Vault.

### 4. Static Web App (`modules/static-web-app.bicep`)

**GOOD:**
- Standard SKU (supports custom domains, auth providers)
- System-assigned managed identity
- Staging environments disabled (reduces attack surface)

**NOTE - No custom domain configured**
- Severity: INFORMATIONAL
- Using default `*.azurestaticapps.net` hostname. For production, a custom domain with managed certificate should be configured.

**NOTE - Enterprise CDN disabled**
- Severity: INFORMATIONAL
- `enterpriseGradeCdnStatus: 'Disabled'`. Consider enabling for DDoS protection at edge.

### 5. Function App (`modules/function-app.bicep`)

**GOOD:**
- `httpsOnly: true` -- HTTP traffic redirected to HTTPS
- `ftpsState: 'Disabled'` -- no FTP/FTPS access
- `minTlsVersion: '1.2'` -- TLS 1.2 enforced
- System-assigned managed identity
- Identity-based storage access (`AzureWebJobsStorage__accountName` instead of connection string)
- Secret storage type set to `files` (local filesystem, no external dependency)

**OPEN - No diagnostic settings**
- Severity: MEDIUM
- Function App execution logs, HTTP logs, and platform logs are not forwarded to Log Analytics.
- **Recommendation:** Add diagnostic settings resource for the Function App.

### 6. RBAC (`main.bicep`)

**GOOD - Principle of least privilege followed:**
- Automation Account identity: `Key Vault Secrets User` (read-only secrets), `Storage Table Data Contributor`, `Storage Blob Data Contributor`, `Automation Contributor` (for self-dispatch)
- Function App identity: `Storage Table Data Contributor`, `Storage Blob Data Owner` (required by Functions runtime), `Storage Queue Data Contributor` (required by Functions runtime), `Automation Operator` (trigger jobs, no modify)
- All assignments use `principalType: 'ServicePrincipal'`

**OPEN - Some RBAC scoped to resource group instead of specific resources**
- Severity: LOW
- Storage roles for both Automation Account and Function App are scoped to `resourceGroup()` rather than the specific storage account resource. This is noted in the Bicep as necessary because module outputs cannot be used as scope. Acceptable tradeoff given single-storage-account design.
- `Automation Contributor` for the Automation Account is scoped to `resourceGroup()` for the same reason.

### 7. Tags

**FIXED - No resource tags**
- Severity: MEDIUM
- No resources had tags for cost management, compliance tracking, or ownership.
- **Fix applied:** Added `tags` parameter with defaults (`project`, `managedBy`, `environment`) to `main.bicep` and propagated to all modules and resources.

### 8. CI/CD (`deploy.yml`, `ci.yml`)

**GOOD:**
- OIDC-based authentication (`id-token: write` + `azure/login` with client-id/tenant-id) -- no stored credentials
- Concurrency controls prevent parallel deployments
- Permissions scoped to minimum (`id-token: write`, `contents: read`)
- Change detection via `dorny/paths-filter` -- only deploys what changed
- CI validates Bicep with `az bicep build`

**NOTE - Infrastructure deployment lacks parameter validation**
- Severity: LOW
- `deploy.yml` deploys with minimal parameters (`clientCode=nh`). Alert recipients and admin users are not set in CI, which means no alerting in automated deployments.

### 9. Deploy Script (`deploy.ps1`)

**GOOD:**
- Input validation with `ValidatePattern` and `ValidateNotNullOrEmpty`
- `ErrorActionPreference = 'Stop'` for fail-fast
- Prerequisite checking (resource providers, template existence)
- Post-deployment validation
- No hardcoded secrets

**NOTE - No explicit RBAC check for deployer**
- Severity: LOW
- Script does not verify the deployer has sufficient permissions before starting. Deployment will fail with Azure errors if permissions are insufficient, which is acceptable.

---

## Changes Applied

| File | Change |
|------|--------|
| `infrastructure/main.bicep` | Added `enablePurgeProtection: true` to Key Vault |
| `infrastructure/main.bicep` | Added Key Vault diagnostic settings resource |
| `infrastructure/main.bicep` | Added `tags` parameter with defaults; applied to Key Vault and Log Analytics |
| `infrastructure/main.bicep` | Passed `tags` to all module invocations |
| `infrastructure/modules/storage-account.bicep` | Added `tags` parameter; applied to storage account |
| `infrastructure/modules/automation-account.bicep` | Added `tags` parameter; applied to automation account |
| `infrastructure/modules/static-web-app.bicep` | Added `tags` parameter; applied to static web app |
| `infrastructure/modules/function-app.bicep` | Added `tags` parameter; applied to app service plan and function app |

## Recommended Follow-up Actions

1. **HIGH**: Change Key Vault `networkAcls.defaultAction` to `'Deny'` and configure service endpoints or private endpoints for Automation Account and Function App access.
2. **HIGH**: Change Storage Account `networkAcls.defaultAction` to `'Deny'` (the IP rules are currently ineffective with `Allow` default).
3. **MEDIUM**: Add diagnostic settings for Storage Account (blob and table services) and Function App.
4. **LOW**: Configure custom domain with managed TLS certificate on Static Web App.
5. **LOW**: Add `alertRecipients` parameter to CI/CD deploy workflow for production alerting.

## Validation

All changes validated with `az bicep build --file infrastructure/main.bicep` -- compilation successful.
