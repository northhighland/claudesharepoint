#Requires -Version 7.0
<#
.SYNOPSIS
    Worker runbook: Clears second-stage recycle bins across a batch of SharePoint sites.

.DESCRIPTION
    Processes a JSON array of site URLs, enumerating second-stage recycle bin items
    and optionally clearing them to reclaim storage. Handles admin escalation for
    sites where the app identity lacks access. Results are written to Azure Table
    Storage (RecycleBinResults).

    Designed to run as an Azure Automation child runbook invoked by Invoke-Orchestrator.

.PARAMETER SiteUrls
    JSON string array of SharePoint site URLs to process.

.PARAMETER RunId
    Unique identifier for this orchestrator job run (used as PartitionKey in Table Storage).

.PARAMETER KeyVaultName
    Name of the Azure Key Vault containing SPO credentials and certificates.

.PARAMETER StorageAccountName
    Name of the Azure Storage Account for writing results to Table Storage.

.PARAMETER DryRun
    When set, counts recycle bin items and sizes but does not delete them.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrls,

    [Parameter(Mandatory = $true)]
    [string]$RunId,

    [Parameter(Mandatory = $true)]
    [string]$KeyVaultName,

    [Parameter(Mandatory = $true)]
    [string]$StorageAccountName,

    [switch]$DryRun
)

# ---------------------------------------------------------------------------
# Module import and Azure authentication
# ---------------------------------------------------------------------------
$ErrorActionPreference = "Stop"

# Import PnP.PowerShell (required for SharePoint operations)
try {
    Import-Module PnP.PowerShell -Force -ErrorAction Stop
    Write-Output "[INFO] Loaded PnP.PowerShell module"
} catch {
    Write-Warning "PnP.PowerShell not available: $($_.Exception.Message)"
}

# Import SpaceAgent module (optional — worker has inline fallbacks)
$moduleLoaded = $false
if ($PSScriptRoot) {
    $modulePath = Join-Path $PSScriptRoot "modules" "SpaceAgent.psm1"
    if (Test-Path $modulePath) {
        Import-Module $modulePath -Force; $moduleLoaded = $true
        Write-Output "[INFO] Loaded SpaceAgent module from: $modulePath"
    }
}
if (-not $moduleLoaded) {
    try { Import-Module SpaceAgent -Force -ErrorAction Stop; $moduleLoaded = $true; Write-Output "[INFO] Loaded SpaceAgent from Automation modules" }
    catch { Write-Output "[INFO] SpaceAgent module not available — using inline helpers" }
}

# Authenticate with managed identity
Connect-AzAccount -Identity | Out-Null
Write-Output "[INFO] Authenticated with managed identity"

# Retrieve SPO credentials from Key Vault
$certSecret = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "sharepoint-cert" -AsPlainText
$clientId   = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "SPClientId"      -AsPlainText
$tenantId   = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "SPTenantId"      -AsPlainText
$adminUrl   = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "SPAdminUrl"      -AsPlainText

# Build temp certificate file for PnP (fallback chain for temp dir)
$certBytes = [Convert]::FromBase64String($certSecret)
$tempDir = if ($env:TEMP) { $env:TEMP } elseif ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { '/tmp' }
$certTempPath = Join-Path $tempDir "spaceagent-recycle-$RunId.pfx"
Write-Output "[INFO] Saving cert to: $certTempPath"
[System.IO.File]::WriteAllBytes($certTempPath, $certBytes)

# Table Storage result table name
$resultTableName = "RecycleBinResults"

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

function Connect-PnPSite {
    param([string]$Url)
    Connect-PnPOnline -Url $Url -ClientId $clientId -Tenant $tenantId `
        -CertificatePath $certTempPath -ErrorAction Stop
}

function Add-SiteAdmin {
    <#
    .SYNOPSIS Temporarily adds the app as site collection admin.
    #>
    param([string]$SiteUrl)
    try {
        Connect-PnPSite -Url $adminUrl
        Set-PnPTenantSite -Identity $SiteUrl -Owners @($clientId) -ErrorAction Stop
        Disconnect-PnPOnline -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 15  # propagation delay
        return $true
    } catch {
        Write-Warning "Failed to add site admin for $SiteUrl : $($_.Exception.Message)"
        return $false
    }
}

function Remove-SiteAdmin {
    <#
    .SYNOPSIS Removes the app from site collection admins.
    #>
    param([string]$SiteUrl)
    try {
        Connect-PnPSite -Url $adminUrl
        Set-PnPTenantSite -Identity $SiteUrl -Owners @() -ErrorAction SilentlyContinue
        Disconnect-PnPOnline -ErrorAction SilentlyContinue
    } catch {
        Write-Warning "Failed to remove site admin for $SiteUrl : $($_.Exception.Message)"
    }
}

function Get-StorageToken {
    $tokenObj = Get-AzAccessToken -ResourceUrl "https://storage.azure.com/"
    return $tokenObj.Token
}

function Write-TableResult {
    param([hashtable]$Result)

    $rowKey = [Uri]::EscapeDataString($Result.SiteUrl)
    $token = Get-StorageToken
    $encodedRK = [Uri]::EscapeDataString($rowKey)
    $encodedPK = [Uri]::EscapeDataString($RunId)
    $uri = "https://${StorageAccountName}.table.core.windows.net/${resultTableName}(PartitionKey='${encodedPK}',RowKey='${encodedRK}')"

    $body = @{
        PartitionKey      = $RunId
        RowKey            = $rowKey
        SiteUrl           = $Result.SiteUrl
        SiteTitle         = $Result.SiteTitle
        ItemsFound        = $Result.ItemsFound
        SizeMB            = $Result.SizeMB
        ItemsCleared      = $Result.ItemsCleared
        SpaceReclaimedMB  = $Result.SpaceReclaimedMB
        AdminEscalated    = $Result.AdminEscalated
        DryRun            = $Result.DryRun
        Status            = $Result.Status
        ErrorMessage      = $Result.ErrorMessage
        CompletedAt       = (Get-Date -Format "o")
    }

    $headers = @{
        Authorization  = "Bearer $token"
        'Content-Type' = 'application/json'
        'x-ms-version' = '2020-12-06'
        'x-ms-date'    = (Get-Date).ToUniversalTime().ToString('R')
        Accept         = 'application/json;odata=nometadata'
    }

    Invoke-RestMethod -Uri $uri -Method Put -Headers $headers -Body ($body | ConvertTo-Json -Depth 5 -Compress) | Out-Null
}

# ---------------------------------------------------------------------------
# Main processing loop
# ---------------------------------------------------------------------------
$sites = $SiteUrls | ConvertFrom-Json
$totalSites = $sites.Count
$siteIndex = 0

$stats = @{
    Processed       = 0
    SitesWithData   = 0
    TotalItems      = 0
    TotalSizeMB     = 0
    ItemsCleared    = 0
    SpaceReclaimedMB = 0
    AdminEscalated  = 0
    Errors          = 0
}

Write-Output "============================================"
Write-Output "  RECYCLE BIN CLEANER WORKER"
Write-Output "  RunId: $RunId"
Write-Output "  Sites: $totalSites"
Write-Output "  Mode:  $(if ($DryRun) { 'DRY RUN' } else { 'LIVE' })"
Write-Output "============================================"

foreach ($siteUrl in $sites) {
    $siteIndex++
    $adminEscalated = $false

    $result = @{
        SiteUrl          = $siteUrl
        SiteTitle        = ""
        ItemsFound       = 0
        SizeMB           = 0
        ItemsCleared     = 0
        SpaceReclaimedMB = 0
        AdminEscalated   = $false
        DryRun           = [bool]$DryRun
        Status           = "Success"
        ErrorMessage     = ""
    }

    Write-Output ""
    Write-Output "[$siteIndex/$totalSites] Processing: $siteUrl"

    try {
        # --- Connect to site (with admin escalation on 403) ---
        $connected = $false
        try {
            Connect-PnPSite -Url $siteUrl
            $connected = $true
        } catch {
            if ($_.Exception.Message -match "Access denied|403|Forbidden|unauthorized") {
                Write-Output "  Access denied - escalating to site admin..."
                $added = Add-SiteAdmin -SiteUrl $siteUrl
                if ($added) {
                    $adminEscalated = $true
                    $result.AdminEscalated = $true
                    $stats.AdminEscalated++
                    Connect-PnPSite -Url $siteUrl
                    $connected = $true
                }
            }
            if (-not $connected) { throw }
        }

        # Get site title
        try {
            $web = Get-PnPWeb -Includes Title -ErrorAction SilentlyContinue
            $result.SiteTitle = $web.Title
        } catch {}

        # --- Get second-stage recycle bin items ---
        $recycleSuccess = $false

        # Helper: fetch one page with admin escalation retry
        $fetchPage = {
            param([int]$RowLimit)
            $items = $null
            $ok = $false
            try {
                $fetchParams = @{ SecondStage = $true; ErrorAction = 'Stop' }
                if ($RowLimit -gt 0) { $fetchParams['RowLimit'] = $RowLimit }
                $items = Get-PnPRecycleBinItem @fetchParams
                $ok = $true
            } catch {
                $errMsg = $_.Exception.Message
                if ($errMsg -match "Access denied|403|Forbidden|unauthorized" -and -not $adminEscalated) {
                    Write-Output "  Recycle bin access denied - escalating..."
                    $added = Add-SiteAdmin -SiteUrl $siteUrl
                    if ($added) {
                        $adminEscalated = $true
                        $result.AdminEscalated = $true
                        $stats.AdminEscalated++
                        try { Disconnect-PnPOnline -ErrorAction SilentlyContinue } catch {}
                        Connect-PnPSite -Url $siteUrl
                        $items = Get-PnPRecycleBinItem @fetchParams
                        $ok = $true
                    }
                }
                if (-not $ok) { throw }
            }
            return $items
        }

        if (-not $DryRun) {
            # --- LIVE MODE: paginated fetch-clear loop (5000 per batch) ---
            $batchNum = 0
            $siteHasData = $false
            do {
                $batchNum++
                $recycleBinItems = & $fetchPage 5000
                $recycleSuccess = $true

                if (-not $recycleBinItems -or $recycleBinItems.Count -eq 0) { break }

                if (-not $siteHasData) {
                    $siteHasData = $true
                    $stats.SitesWithData++
                }

                $batchSize   = ($recycleBinItems | Measure-Object -Property Size -Sum).Sum
                $batchSizeMB = [math]::Round($batchSize / 1MB, 2)
                $batchCount  = $recycleBinItems.Count

                $result.ItemsFound += $batchCount
                $result.SizeMB     += $batchSizeMB
                $stats.TotalItems  += $batchCount
                $stats.TotalSizeMB += $batchSizeMB

                Write-Output "  Batch $batchNum: $batchCount items ($batchSizeMB MB)"

                try {
                    Clear-PnPRecycleBinItem -SecondStage -Force -ErrorAction Stop
                    $result.ItemsCleared     += $batchCount
                    $result.SpaceReclaimedMB += $batchSizeMB
                    $stats.ItemsCleared      += $batchCount
                    $stats.SpaceReclaimedMB  += $batchSizeMB
                    Write-Output "  CLEARED batch $batchNum: $batchCount items ($batchSizeMB MB reclaimed)"
                } catch {
                    $result.Status = "PartialError"
                    $result.ErrorMessage = "Clear failed on batch ${batchNum}: $($_.Exception.Message)"
                    Write-Warning "  Failed to clear batch ${batchNum}: $($_.Exception.Message)"
                    break
                }
            } while ($batchCount -ge 5000)

            if ($result.ItemsFound -gt 0) {
                Write-Output "  Total: $($result.ItemsFound) items cleared ($([math]::Round($result.SpaceReclaimedMB, 2)) MB reclaimed)"
            } else {
                Write-Output "  Empty - no second-stage items"
            }

        } else {
            # --- DRYRUN MODE: fetch all for accurate count ---
            $recycleBinItems = $null
            try {
                $recycleBinItems = & $fetchPage 0
                $recycleSuccess = $true
            } catch {
                if ($_.Exception.Message -match "timeout|timed out|operation.*expired") {
                    Write-Warning "  Full enumeration timed out - falling back to 5000 estimate"
                    try {
                        $recycleBinItems = & $fetchPage 5000
                        $recycleSuccess = $true
                        if ($recycleBinItems -and $recycleBinItems.Count -ge 5000) {
                            Write-Warning "  Actual count may exceed 5000 (capped at RowLimit)"
                        }
                    } catch {
                        throw
                    }
                } else {
                    throw
                }
            }

            if ($recycleBinItems -and $recycleBinItems.Count -gt 0) {
                $totalSize   = ($recycleBinItems | Measure-Object -Property Size -Sum).Sum
                $totalSizeMB = [math]::Round($totalSize / 1MB, 2)

                $result.ItemsFound       = $recycleBinItems.Count
                $result.SizeMB           = $totalSizeMB
                $result.ItemsCleared     = $recycleBinItems.Count
                $result.SpaceReclaimedMB = $totalSizeMB

                $stats.SitesWithData++
                $stats.TotalItems       += $recycleBinItems.Count
                $stats.TotalSizeMB      += $totalSizeMB
                $stats.ItemsCleared     += $recycleBinItems.Count
                $stats.SpaceReclaimedMB += $totalSizeMB

                Write-Output "  WOULD CLEAR: $($recycleBinItems.Count) items ($totalSizeMB MB)"
            } else {
                Write-Output "  Empty - no second-stage items"
            }
        }

        $stats.Processed++

    } catch {
        $result.Status = "Error"
        $result.ErrorMessage = $_.Exception.Message
        $stats.Errors++
        Write-Output "  ERROR: $($_.Exception.Message)"
    } finally {
        # Disconnect PnP
        try { Disconnect-PnPOnline -ErrorAction SilentlyContinue } catch {}

        # Remove admin access if we escalated
        if ($adminEscalated) {
            Write-Output "  Cleaning up admin access..."
            Remove-SiteAdmin -SiteUrl $siteUrl
        }

        # Write result to Table Storage
        try {
            Write-TableResult -Result $result
        } catch {
            Write-Warning "  Failed to write table result: $($_.Exception.Message)"
        }
    }
}

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
if (Test-Path $certTempPath) {
    Remove-Item $certTempPath -Force -ErrorAction SilentlyContinue
}

# Structured output
$summary = @{
    RunId            = $RunId
    SitesProcessed   = $stats.Processed
    SitesWithData    = $stats.SitesWithData
    TotalItems       = $stats.TotalItems
    TotalSizeMB      = [math]::Round($stats.TotalSizeMB, 2)
    TotalSizeGB      = [math]::Round($stats.TotalSizeMB / 1024, 2)
    ItemsCleared     = $stats.ItemsCleared
    SpaceReclaimedMB = [math]::Round($stats.SpaceReclaimedMB, 2)
    SpaceReclaimedGB = [math]::Round($stats.SpaceReclaimedMB / 1024, 2)
    AdminEscalated   = $stats.AdminEscalated
    Errors           = $stats.Errors
    Mode             = if ($DryRun) { "DryRun" } else { "Live" }
    CompletedAt      = (Get-Date -Format "o")
}

Write-Output ""
Write-Output "============================================"
Write-Output "  RECYCLE BIN CLEANER COMPLETE"
Write-Output "  Sites processed:    $($stats.Processed)"
Write-Output "  Sites with data:    $($stats.SitesWithData)"
Write-Output "  Total items:        $($stats.TotalItems)"
Write-Output "  Total size:         $([math]::Round($stats.TotalSizeMB, 2)) MB ($([math]::Round($stats.TotalSizeMB / 1024, 2)) GB)"
Write-Output "  $(if ($DryRun) { 'Would clear' } else { 'Cleared' }):         $($stats.ItemsCleared) items"
Write-Output "  $(if ($DryRun) { 'Would reclaim' } else { 'Reclaimed' }):       $([math]::Round($stats.SpaceReclaimedMB, 2)) MB"
Write-Output "  Admin escalations:  $($stats.AdminEscalated)"
Write-Output "  Errors:             $($stats.Errors)"
Write-Output "  Mode: $(if ($DryRun) { 'DRY RUN' } else { 'LIVE' })"
Write-Output "============================================"

$summary | ConvertTo-Json -Depth 3 | Write-Output
