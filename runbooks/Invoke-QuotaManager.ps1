#Requires -Version 7.0
<#
.SYNOPSIS
    Worker runbook: Auto-increases SharePoint site quotas when usage exceeds 90%.

.DESCRIPTION
    Processes a JSON array of site URLs, checks current storage usage against quota,
    and automatically increases the quota by QuotaIncrementGB when usage is above 90%.
    Sites that remain above AlertThreshold after increase are flagged for alert.
    Results are written to Azure Table Storage (QuotaStatus).

    Designed to run as an Azure Automation child runbook invoked by Invoke-Orchestrator.

.PARAMETER SiteUrls
    JSON string array of SharePoint site URLs to process.

.PARAMETER RunId
    Unique identifier for this orchestrator job run (used as PartitionKey in Table Storage).

.PARAMETER KeyVaultName
    Name of the Azure Key Vault containing SPO credentials and certificates.

.PARAMETER StorageAccountName
    Name of the Azure Storage Account for writing results to Table Storage.

.PARAMETER QuotaIncrementGB
    Amount in GB to increase site quota when usage exceeds 90%. Default: 25.

.PARAMETER AlertThreshold
    Percentage threshold above which a site is flagged for alert even after quota increase. Default: 95.

.PARAMETER DryRun
    When set, calculates quota changes but does not apply them.
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

    [Parameter(Mandatory = $false)]
    [int]$QuotaIncrementGB = 25,

    [Parameter(Mandatory = $false)]
    [int]$AlertThreshold = 95,

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
$certTempPath = Join-Path ([System.IO.Path]::GetTempPath()) "spaceagent-quota-$RunId.pfx"
[System.IO.File]::WriteAllBytes($certTempPath, $certBytes)

# Storage context for Table Storage output
$storageCtx = (Get-AzStorageAccount -ResourceGroupName (Get-AutomationVariable -Name "ResourceGroupName") -Name $StorageAccountName).Context
$tableName  = "QuotaStatus"
$table      = Get-AzStorageTable -Name $tableName -Context $storageCtx -ErrorAction SilentlyContinue
if (-not $table) {
    New-AzStorageTable -Name $tableName -Context $storageCtx | Out-Null
    $table = Get-AzStorageTable -Name $tableName -Context $storageCtx
}
$cloudTable = $table.CloudTable

# Warning threshold (below alert, above which we increase quota)
$WarningThreshold = 90

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

function Connect-PnPAdmin {
    Connect-PnPOnline -Url $adminUrl -ClientId $clientId -Tenant $tenantId `
        -CertificatePath $certTempPath -ErrorAction Stop
}

function Write-TableResult {
    param([hashtable]$Result)

    $rowKey = [Uri]::EscapeDataString($Result.SiteUrl)

    $properties = @{
        SiteUrl          = $Result.SiteUrl
        SiteTitle        = $Result.SiteTitle
        UsageGB          = $Result.UsageGB
        QuotaGB          = $Result.QuotaGB
        PreviousQuotaGB  = $Result.PreviousQuotaGB
        PercentUsed      = $Result.PercentUsed
        ActionTaken      = $Result.ActionTaken
        NewQuotaGB       = $Result.NewQuotaGB
        AlertFlagged     = $Result.AlertFlagged
        DryRun           = $Result.DryRun
        Status           = $Result.Status
        ErrorMessage     = $Result.ErrorMessage
        CompletedAt      = (Get-Date -Format "o")
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
    Checked       = 0
    QuotaIncreased = 0
    AlertFlagged  = 0
    Errors        = 0
}

Write-Output "============================================"
Write-Output "  QUOTA MANAGER WORKER"
Write-Output "  RunId:            $RunId"
Write-Output "  Sites:            $totalSites"
Write-Output "  QuotaIncrementGB: $QuotaIncrementGB"
Write-Output "  AlertThreshold:   $AlertThreshold%"
Write-Output "  Mode:             $(if ($DryRun) { 'DRY RUN' } else { 'LIVE' })"
Write-Output "============================================"

# Connect to admin centre once
Connect-PnPAdmin

foreach ($siteUrl in $sites) {
    $siteIndex++

    $result = @{
        SiteUrl         = $siteUrl
        SiteTitle       = ""
        UsageGB         = 0
        QuotaGB         = 0
        PreviousQuotaGB = 0
        PercentUsed     = 0
        ActionTaken     = "None"
        NewQuotaGB      = 0
        AlertFlagged    = $false
        DryRun          = [bool]$DryRun
        Status          = "Success"
        ErrorMessage    = ""
    }

    Write-Output ""
    Write-Output "[$siteIndex/$totalSites] Checking: $siteUrl"

    try {
        # Get site usage information from admin centre
        # StorageUsageCurrent is in MB, StorageQuota is in MB
        $siteInfo = Get-PnPTenantSite -Identity $siteUrl -ErrorAction Stop

        $result.SiteTitle = $siteInfo.Title

        # Convert MB values to GB for readability
        $usageMB   = $siteInfo.StorageUsageCurrent
        $quotaMB   = $siteInfo.StorageQuota
        $usageGB   = [math]::Round($usageMB / 1024, 2)
        $quotaGB   = [math]::Round($quotaMB / 1024, 2)

        $result.UsageGB         = $usageGB
        $result.QuotaGB         = $quotaGB
        $result.PreviousQuotaGB = $quotaGB

        # Calculate percentage used (guard against division by zero)
        $percentUsed = if ($quotaMB -gt 0) { [math]::Round(($usageMB / $quotaMB) * 100, 1) } else { 0 }
        $result.PercentUsed = $percentUsed

        Write-Output "  $($siteInfo.Title): ${usageGB} GB / ${quotaGB} GB ($percentUsed%)"

        $stats.Checked++

        # Check if usage exceeds warning threshold
        if ($percentUsed -ge $WarningThreshold) {
            $newQuotaMB = $quotaMB + ($QuotaIncrementGB * 1024)
            $newQuotaGB = [math]::Round($newQuotaMB / 1024, 2)

            $result.ActionTaken = "QuotaIncreased"
            $result.NewQuotaGB  = $newQuotaGB

            if (-not $DryRun) {
                Set-PnPTenantSite -Identity $siteUrl -StorageQuota $newQuotaMB -ErrorAction Stop
                Write-Output "  INCREASED: $quotaGB GB -> $newQuotaGB GB (+$QuotaIncrementGB GB)"
            } else {
                Write-Output "  WOULD INCREASE: $quotaGB GB -> $newQuotaGB GB (+$QuotaIncrementGB GB)"
            }

            $stats.QuotaIncreased++

            # Re-calculate percentage with new quota
            $newPercentUsed = if ($newQuotaMB -gt 0) { [math]::Round(($usageMB / $newQuotaMB) * 100, 1) } else { 0 }

            # Check if still above alert threshold after increase
            if ($newPercentUsed -ge $AlertThreshold) {
                $result.AlertFlagged = $true
                $stats.AlertFlagged++
                Write-Output "  ALERT: Still at $newPercentUsed% after increase - requires attention"
            }
        } else {
            $result.ActionTaken = "None"
            $result.NewQuotaGB  = $quotaGB
        }

    } catch {
        $result.Status = "Error"
        $result.ErrorMessage = $_.Exception.Message
        $stats.Errors++
        Write-Output "  ERROR: $($_.Exception.Message)"

        # Reconnect admin if connection dropped
        try {
            Disconnect-PnPOnline -ErrorAction SilentlyContinue
            Connect-PnPAdmin
        } catch {
            Write-Warning "  Failed to reconnect to admin centre"
        }
    } finally {
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
try { Disconnect-PnPOnline -ErrorAction SilentlyContinue } catch {}

if (Test-Path $certTempPath) {
    Remove-Item $certTempPath -Force -ErrorAction SilentlyContinue
}

# Structured output
$summary = @{
    RunId           = $RunId
    SitesChecked    = $stats.Checked
    QuotaIncreased  = $stats.QuotaIncreased
    AlertFlagged    = $stats.AlertFlagged
    Errors          = $stats.Errors
    Mode            = if ($DryRun) { "DryRun" } else { "Live" }
    CompletedAt     = (Get-Date -Format "o")
}

Write-Output ""
Write-Output "============================================"
Write-Output "  QUOTA MANAGER COMPLETE"
Write-Output "  Sites checked:    $($stats.Checked)"
Write-Output "  Quotas increased: $($stats.QuotaIncreased)"
Write-Output "  Alerts flagged:   $($stats.AlertFlagged)"
Write-Output "  Errors:           $($stats.Errors)"
Write-Output "  Mode: $(if ($DryRun) { 'DRY RUN' } else { 'LIVE' })"
Write-Output "============================================"

$summary | ConvertTo-Json -Depth 3 | Write-Output
