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

$modulePath = Join-Path $PSScriptRoot "modules" "SpaceAgent.psm1"
if (Test-Path $modulePath) {
    Import-Module $modulePath -Force
} else {
    Write-Warning "SpaceAgent module not found at $modulePath - using inline helpers"
}

# Authenticate with managed identity
Connect-AzAccount -Identity | Out-Null
Write-Output "[INFO] Authenticated with managed identity"

# Retrieve SPO credentials from Key Vault
$certSecret = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "SPOCertificate" -AsPlainText
$clientId   = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "SPOClientId"    -AsPlainText
$tenantId   = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "TenantId"       -AsPlainText
$adminUrl   = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "SPOAdminUrl"    -AsPlainText

# Build temp certificate file for PnP
$certBytes = [Convert]::FromBase64String($certSecret)
$certTempPath = Join-Path ([System.IO.Path]::GetTempPath()) "spaceagent-recycle-$RunId.pfx"
[System.IO.File]::WriteAllBytes($certTempPath, $certBytes)

# Storage context for Table Storage output
$storageCtx = (Get-AzStorageAccount -ResourceGroupName (Get-AutomationVariable -Name "ResourceGroupName") -Name $StorageAccountName).Context
$tableName  = "RecycleBinResults"
$table      = Get-AzStorageTable -Name $tableName -Context $storageCtx -ErrorAction SilentlyContinue
if (-not $table) {
    New-AzStorageTable -Name $tableName -Context $storageCtx | Out-Null
    $table = Get-AzStorageTable -Name $tableName -Context $storageCtx
}
$cloudTable = $table.CloudTable

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

function Write-TableResult {
    param([hashtable]$Result)

    $rowKey = [Uri]::EscapeDataString($Result.SiteUrl)

    $properties = @{
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

    Add-AzTableRow -Table $cloudTable -PartitionKey $RunId -RowKey $rowKey -Property $properties
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
        $recycleBinItems = $null
        $recycleSuccess = $false

        try {
            $recycleBinItems = Get-PnPRecycleBinItem -SecondStage -RowLimit 5000 -ErrorAction Stop
            $recycleSuccess = $true
        } catch {
            $errMsg = $_.Exception.Message
            if ($errMsg -match "Access denied|403|Forbidden|unauthorized" -and -not $adminEscalated) {
                Write-Output "  Recycle bin access denied - escalating..."
                $added = Add-SiteAdmin -SiteUrl $siteUrl
                if ($added) {
                    $adminEscalated = $true
                    $result.AdminEscalated = $true
                    $stats.AdminEscalated++

                    # Reconnect and retry
                    try { Disconnect-PnPOnline -ErrorAction SilentlyContinue } catch {}
                    Connect-PnPSite -Url $siteUrl
                    $recycleBinItems = Get-PnPRecycleBinItem -SecondStage -RowLimit 5000 -ErrorAction Stop
                    $recycleSuccess = $true
                }
            }

            if (-not $recycleSuccess) { throw }
        }

        # --- Process recycle bin items ---
        if ($recycleBinItems -and $recycleBinItems.Count -gt 0) {
            $totalSize   = ($recycleBinItems | Measure-Object -Property Size -Sum).Sum
            $totalSizeMB = [math]::Round($totalSize / 1MB, 2)

            $result.ItemsFound = $recycleBinItems.Count
            $result.SizeMB     = $totalSizeMB

            $stats.SitesWithData++
            $stats.TotalItems  += $recycleBinItems.Count
            $stats.TotalSizeMB += $totalSizeMB

            Write-Output "  Found: $($recycleBinItems.Count) items ($totalSizeMB MB)"

            if (-not $DryRun) {
                # Clear second-stage recycle bin
                try {
                    Clear-PnPRecycleBinItem -SecondStage -Force -ErrorAction Stop
                    $result.ItemsCleared     = $recycleBinItems.Count
                    $result.SpaceReclaimedMB = $totalSizeMB
                    $stats.ItemsCleared      += $recycleBinItems.Count
                    $stats.SpaceReclaimedMB  += $totalSizeMB

                    Write-Output "  CLEARED: $($recycleBinItems.Count) items ($totalSizeMB MB reclaimed)"
                } catch {
                    $result.Status = "PartialError"
                    $result.ErrorMessage = "Clear failed: $($_.Exception.Message)"
                    Write-Warning "  Failed to clear: $($_.Exception.Message)"
                }
            } else {
                # DryRun: report what would be cleared
                $result.ItemsCleared     = $recycleBinItems.Count  # would-clear count
                $result.SpaceReclaimedMB = $totalSizeMB
                $stats.ItemsCleared      += $recycleBinItems.Count
                $stats.SpaceReclaimedMB  += $totalSizeMB

                Write-Output "  WOULD CLEAR: $($recycleBinItems.Count) items ($totalSizeMB MB)"
            }
        } else {
            Write-Output "  Empty - no second-stage items"
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
