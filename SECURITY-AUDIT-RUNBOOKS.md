# Security Audit: PowerShell Runbooks

**Auditor:** Claude Opus 4.6 (automated)
**Date:** 2026-03-14
**Scope:** All runbooks in `runbooks/` and `runbooks/modules/SpaceAgent.psm1`
**Risk context:** These runbooks manage 7,000+ SharePoint sites for an enterprise client via Azure Automation.

---

## Executive Summary

The runbooks follow generally sound security patterns: managed identity authentication, Key Vault for secrets, DryRun-by-default safety, and admin escalation cleanup in `finally` blocks. However, several issues were identified ranging from **critical** (certificate file left on disk after crash) to **medium** (site URLs logged to job output) and **low** (missing input validation).

| Severity | Count | Fixed in this audit |
|----------|-------|---------------------|
| Critical | 2     | 0 (require code changes with testing) |
| High     | 3     | 0 |
| Medium   | 5     | 0 |
| Low      | 4     | 0 |

---

## Critical Findings

### C1. Certificate PFX written to temp disk with predictable filename

**Files:** All worker runbooks (`Invoke-VersionCleanup.ps1:119-121`, `Invoke-QuotaManager.ps1:119-121`, `Invoke-StaleSiteDetector.ps1:102-104`, `Invoke-RecycleBinCleaner.ps1:107-109`), `Invoke-Orchestrator.ps1:239-241`, `SpaceAgent.psm1:78-79`

**Issue:** The SPO certificate is retrieved from Key Vault as a Base64-encoded secret, decoded, and written to a PFX file in the temp directory. The filename is predictable (`spaceagent-{RunId}.pfx` or `sharepoint-cert.pfx`). While cleanup happens at the end of each runbook, if the runbook crashes mid-execution (unhandled exception, Azure Automation timeout, process kill), the PFX file persists on disk.

**Risk:** Any other runbook or process running on the same Azure Automation sandbox could read the certificate file and impersonate the app registration against SharePoint.

**Recommendation:**
1. Wrap the entire main processing block in a `try/finally` that guarantees certificate deletion.
2. Use `[System.Security.Cryptography.X509Certificates.X509Certificate2]` in-memory instead of writing to disk where possible (PnP supports `-CertificateBase64Encoded` parameter).
3. If disk write is unavoidable, use a cryptographically random filename: `$certTempPath = Join-Path $tempDir "$([System.IO.Path]::GetRandomFileName()).pfx"`.

**Current pattern (all workers):**
```powershell
# Cleanup only runs if execution reaches this point
if (Test-Path $certTempPath) {
    Remove-Item $certTempPath -Force -ErrorAction SilentlyContinue
}
```

**Recommended pattern:**
```powershell
try {
    # ... all processing ...
} finally {
    if ($certTempPath -and (Test-Path $certTempPath)) {
        Remove-Item $certTempPath -Force -ErrorAction SilentlyContinue
    }
}
```

### C2. Certificate cleanup not in `finally` block in Orchestrator

**File:** `Invoke-Orchestrator.ps1:239-241`

**Issue:** The orchestrator's `Connect-SpaceAgent` function saves a cert to `$certPath` but there is no cleanup at all for this file. The orchestrator disconnects PnP at line 471 but never deletes the cert file. The cert file path is stored inside the `$spConnection` hashtable but never referenced for deletion.

**Recommendation:** Add certificate cleanup in a `finally` block after the main orchestrator execution, using `$spConnection.CertificatePath`.

---

## High Findings

### H1. Site URLs logged in job output (information disclosure)

**Files:** All runbooks

**Issue:** Full SharePoint site URLs are written to `Write-Output` and `Write-Warning` throughout all runbooks (e.g., `Invoke-VersionCleanup.ps1:379`, `Invoke-Orchestrator.ps1:613`). Azure Automation job output is visible to anyone with `Reader` access on the Automation Account. Site URLs can reveal organizational structure, project names, and internal naming conventions.

**Examples:**
```powershell
Write-Output "[$siteIndex/$totalSites] Processing: $siteUrl"        # Every worker
Write-Output "  Started: $($job.JobId) -> $siteUrl"                 # Orchestrator
Write-Warning "  Failed to start child for ${siteUrl}: ..."         # Orchestrator
Write-Output "  Access denied - escalating to site admin..."        # After showing URL
```

**Risk:** Reconnaissance value for an attacker who gains Automation Account Reader access. Not critical on its own, but compounds with other access.

**Recommendation:** Consider truncating or hashing URLs in log output, or log only site IDs. At minimum, ensure Automation Account RBAC is tightly scoped.

### H2. Token/credential values flow through variables without SecureString

**Files:** All worker runbooks (e.g., `Invoke-VersionCleanup.ps1:111-114`)

**Issue:** Key Vault secrets are retrieved with `-AsPlainText` and stored in plain `$string` variables:
```powershell
$certSecret = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "sharepoint-cert" -AsPlainText
$clientId   = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "SPClientId"      -AsPlainText
```

These remain in memory as plaintext for the entire runbook execution. If a memory dump occurs or the process is debugged, these values are exposed.

**Risk:** Medium in Azure Automation sandbox (short-lived, isolated), but violates defense-in-depth.

**Recommendation:** Use `-AsPlainText` only at point of use, not at declaration. For the certificate, decode and use immediately rather than holding the Base64 string.

### H3. Admin escalation race condition (version cleanup & recycle bin)

**Files:** `Invoke-VersionCleanup.ps1:143-172`, `Invoke-RecycleBinCleaner.ps1:124-153`

**Issue:** The `Add-SiteAdmin` / `Remove-SiteAdmin` pattern has a timing vulnerability:
1. App is added as site collection admin
2. `Start-Sleep -Seconds 15` for propagation
3. Processing occurs
4. `finally` block removes admin access

If two child runbooks process the same site concurrently (possible if a site appears in multiple batches due to a bug, or during retry scenarios), one could remove admin access while the other is still processing. The `Remove-SiteAdmin` function in the inline workers passes an empty `@()` to `-Owners`, which could remove ALL owners rather than just the app.

**Recommendation:**
1. `Remove-SiteAdmin` should remove only the specific app identity, not set owners to empty array.
2. Add a check before removing: verify the app is actually in the admin list.
3. Consider a distributed lock mechanism (e.g., Table Storage row) to prevent concurrent admin escalation on the same site.

---

## Medium Findings

### M1. No input validation on `$SiteUrls` JSON parameter

**Files:** All worker runbooks (`Invoke-VersionCleanup.ps1:344`, `Invoke-QuotaManager.ps1:184`, etc.)

**Issue:** The `$SiteUrls` parameter is parsed with `ConvertFrom-Json` with no validation:
```powershell
$sites = $SiteUrls | ConvertFrom-Json
```

If malformed JSON is passed, the runbook will throw an unhandled exception. More critically, there is no validation that the resulting array contains valid SharePoint URLs. A crafted input like `["https://evil.com"]` would cause PnP to attempt a connection to an attacker-controlled endpoint, potentially leaking the certificate-based auth attempt.

**Recommendation:**
```powershell
$sites = $SiteUrls | ConvertFrom-Json
$sites = @($sites | Where-Object {
    $_ -is [string] -and $_ -match '^https://[a-zA-Z0-9-]+\.sharepoint\.com/'
})
if ($sites.Count -eq 0) {
    throw "No valid SharePoint URLs found in SiteUrls parameter"
}
```

### M2. Error messages may leak internal infrastructure details

**Files:** All runbooks (various `catch` blocks)

**Issue:** Several error handlers write raw exception messages to output:
```powershell
Write-Output "  ERROR: $($_.Exception.Message)"              # Multiple files
Write-Warning "Failed to add site admin for $SiteUrl : ..."  # Inline Add-SiteAdmin
```

Exception messages from PnP and Graph can contain internal details: tenant IDs, endpoint URLs, token fragments, and server-side error codes.

**Recommendation:** Classify and sanitize error messages before logging. The inline `Write-ErrorResult` function already categorizes errors -- use its output for logging instead of raw exception messages.

### M3. `Get-StorageToken` returns bearer token as plain string

**Files:** All runbooks with `Get-StorageToken` function

**Issue:** The function returns a bearer token as a plain string, which is then interpolated into HTTP headers. If any downstream logging captures the headers hashtable, the token is exposed.

**Risk:** Low in current code (headers are not logged), but fragile. A future `Write-Debug` or verbose logging change could leak tokens.

**Recommendation:** Mark token variables for garbage collection after use. Consider using a helper that constructs and executes the REST call internally rather than returning raw tokens.

### M4. Notification email body includes site URLs

**Files:** `Invoke-QuotaManager.ps1:329-335`, `Invoke-Orchestrator.ps1:350-370`

**Issue:** Alert emails include full site URLs in HTML table rows. These emails traverse Exchange Online and could be forwarded externally.

**Recommendation:** Consider whether full URLs are necessary in email notifications, or whether site titles and truncated identifiers would suffice.

### M5. `$DryRun` parameter is a `[switch]` on workers but passed as `[bool]` from orchestrator

**Files:** `Invoke-Orchestrator.ps1:593`, all worker `param()` blocks

**Issue:** The orchestrator passes `DryRun = $DryRun.IsPresent` (a boolean) to child runbooks via `Start-AzAutomationRunbook -Parameters`. The worker runbooks declare `[switch]$DryRun`. Azure Automation correctly maps boolean to switch, but this is an implicit conversion that could behave differently in local testing vs. Automation.

**Recommendation:** Use `[bool]$DryRun = $false` in worker parameters instead of `[switch]` for clarity when invoked programmatically.

---

## Low Findings

### L1. Certificate path logged to output

**Files:** All worker runbooks (e.g., `Invoke-VersionCleanup.ps1:120`)

**Issue:** `Write-Output "[INFO] Saving cert to: $certTempPath"` exposes the filesystem path of the certificate on the sandbox worker.

**Recommendation:** Remove or reduce verbosity of cert path logging. Use `Write-Verbose` instead.

### L2. No maximum batch size validation on `$WaveSize`

**File:** `Invoke-Orchestrator.ps1:23`

**Issue:** `$WaveSize` has no upper bound. Setting it to 10000 would attempt to start 10000 concurrent child runbooks, exhausting the Automation Account's job queue and potentially impacting other tenants on the same Automation Account.

**Recommendation:** Add `[ValidateRange(1, 100)]` to `$WaveSize`.

### L3. Graph API token obtained via `Get-AzAccessToken` uses deprecated `.Token` property

**Files:** Multiple (e.g., `Invoke-Orchestrator.ps1:127,374`)

**Issue:** `(Get-AzAccessToken -ResourceUrl "...").Token` is deprecated in Az.Accounts 3.x+. The replacement is `(Get-AzAccessToken -ResourceUrl "..." -AsSecureString).Token | ConvertFrom-SecureString -AsPlainText` or the new `Get-AzAccessToken` that returns a SecureString by default.

**Recommendation:** Update to the non-deprecated pattern before Az.Accounts module upgrade forces a breaking change.

### L4. Hardcoded Key Vault secret names

**Files:** All runbooks

**Issue:** Secret names (`SPClientId`, `SPTenantId`, `SPAdminUrl`, `sharepoint-cert`) are hardcoded. If these need to change, every runbook must be updated.

**Recommendation:** Consider making these configurable via Automation Variables or a naming convention parameter, centralizing them in `SpaceAgent.psm1`.

---

## Positive Security Patterns Observed

1. **DryRun by default** (`Invoke-Orchestrator.ps1:29-31`): The orchestrator defaults to DryRun unless `-LiveRun` is explicitly passed. This is excellent safety design.

2. **Managed Identity authentication**: No stored credentials or connection strings. All Azure auth uses `Connect-AzAccount -Identity`.

3. **Key Vault for secrets**: All SPO credentials (client ID, tenant ID, certificate) are stored in Key Vault with managed identity access.

4. **Admin escalation cleanup in `finally` blocks**: Worker runbooks remove temporary admin access in `finally` blocks, ensuring cleanup even on error (except the crash scenario noted in C1).

5. **Token refresh with retry**: The `Invoke-WithTokenRefresh` pattern handles 401 and 429 responses gracefully with exponential backoff.

6. **No hardcoded credentials**: Zero instances of hardcoded passwords, tokens, or connection strings found.

7. **Table Storage via REST API with bearer tokens**: Avoids storing storage account keys; uses Entra ID access tokens.

---

## Permissions Scope Review

### App Registration (SPO)
The app registration requires:
- **Sites.FullControl.All** (SharePoint) -- needed for version deletion, recycle bin clearing, and admin escalation. This is the broadest possible SharePoint permission.
- **Sites.Read.All** (Graph) -- for analytics and site enumeration

**Recommendation:** `Sites.FullControl.All` is justified given the operations performed (delete versions, clear recycle bins, modify quotas, set version policies). Document this in the app registration description. Consider whether read-only operations (stale site detection) could use a separate, lower-privilege app registration.

### Managed Identity
The managed identity requires:
- Key Vault Secrets User (read secrets)
- Storage Table Data Contributor (read/write Table Storage)
- Automation Operator (start child runbooks)
- Mail.Send (Graph, for notifications)

**Recommendation:** These are appropriately scoped. Verify Mail.Send is limited to the specific sending mailbox via an application access policy, not tenant-wide.

---

## Recommended Priority Actions

1. **[Critical]** Wrap all runbook main logic in `try/finally` with cert cleanup, or switch to in-memory cert loading (`-CertificateBase64Encoded`).
2. **[Critical]** Add cert cleanup to orchestrator after `Connect-SpaceAgent`.
3. **[High]** Fix `Remove-SiteAdmin` to remove only the app identity, not set owners to empty array.
4. **[High]** Add URL validation to `$SiteUrls` parameter parsing in all workers.
5. **[Medium]** Sanitize error messages before writing to job output.
6. **[Medium]** Add `[ValidateRange]` to `$WaveSize` and other numeric parameters.
