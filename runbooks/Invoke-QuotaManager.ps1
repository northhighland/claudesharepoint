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

    [Parameter(Mandatory = $false)]
    [bool]$DryRun = $false
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

# Inline fallback for Write-ErrorResult if module not loaded
if (-not $moduleLoaded -or -not (Get-Command Write-ErrorResult -ErrorAction SilentlyContinue)) {
    function Write-ErrorResult {
        param($ErrorRecord, [string]$Operation = "Unknown")
        $msg = if ($ErrorRecord -is [System.Management.Automation.ErrorRecord]) { $ErrorRecord.Exception.Message } else { [string]$ErrorRecord }
        $errorCode = "UNKNOWN_ERROR"; $errorSource = "Unknown"; $isRetryable = $false
        if ($msg -match "401|Unauthorized|token.*expired") { $errorCode = "AUTH_FAILURE"; $errorSource = "PnP"; $isRetryable = $true }
        elseif ($msg -match "403|Access denied|Forbidden") { $errorCode = "ACCESS_DENIED"; $errorSource = "PnP" }
        elseif ($msg -match "429|throttl|Too Many Requests") { $errorCode = "THROTTLE_429"; $errorSource = "Graph"; $isRetryable = $true }
        elseif ($msg -match "timeout|timed out|operation.*expired|TaskCanceledException") { $errorCode = "PNP_TIMEOUT"; $errorSource = "PnP"; $isRetryable = $true }
        elseif ($msg -match "list view threshold|exceeds the list view") { $errorCode = "LIST_THRESHOLD"; $errorSource = "PnP" }
        elseif ($msg -match "Key Vault|SecretNotFound|VaultNotFound") { $errorCode = "KEYVAULT_ACCESS"; $errorSource = "KeyVault" }
        elseif ($msg -match "module.*not found|Import-Module|CommandNotFoundException") { $errorCode = "MODULE_MISSING"; $errorSource = "Orchestrator" }
        elseif ($msg -match "table.*not found|TableNotFound|storage") { $errorCode = "TABLE_STORAGE_ERROR"; $errorSource = "TableStorage"; $isRetryable = $true }
        elseif ($msg -match "503|504|Service Unavailable") { $errorCode = "SERVICE_UNAVAILABLE"; $errorSource = "Graph"; $isRetryable = $true }
        elseif ($msg -match "site.*not found|404") { $errorCode = "SITE_NOT_FOUND"; $errorSource = "PnP" }
        elseif ($msg -match "Connect-PnPOnline|connection|disconnect") { $errorCode = "CONNECTION_FAILURE"; $errorSource = "PnP"; $isRetryable = $true }
        return @{ ErrorCode = $errorCode; ErrorSource = $errorSource; ErrorMessage = $msg.Substring(0, [Math]::Min($msg.Length, 500)); IsRetryable = $isRetryable; Operation = $Operation }
    }
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
$certTempPath = Join-Path $tempDir "spaceagent-quota-$RunId.pfx"
Write-Output "[INFO] Saving cert to: $certTempPath"
[System.IO.File]::WriteAllBytes($certTempPath, $certBytes)

# Table Storage result table name
$resultTableName = "QuotaStatus"

# Warning threshold (below alert, above which we increase quota)
$WarningThreshold = 90

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

function Connect-PnPAdmin {
    Connect-PnPOnline -Url $adminUrl -ClientId $clientId -Tenant $tenantId `
        -CertificatePath $certTempPath -ErrorAction Stop
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
        PartitionKey     = $RunId
        RowKey           = $rowKey
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
        ErrorCode        = $Result.ErrorCode
        ErrorSource      = $Result.ErrorSource
        CompletedAt      = (Get-Date -Format "o")
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
    Checked       = 0
    QuotaIncreased = 0
    AlertFlagged  = 0
    Errors        = 0
}
$flaggedSites = @()

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
        ErrorCode       = ""
        ErrorSource     = ""
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
                $flaggedSites += @{
                    Url        = $siteUrl
                    Title      = $result.SiteTitle
                    UsageGB    = $usageGB
                    QuotaGB    = $newQuotaGB
                    PercentUsed = $newPercentUsed
                }
                Write-Output "  ALERT: Still at $newPercentUsed% after increase - requires attention"
            }
        } else {
            $result.ActionTaken = "None"
            $result.NewQuotaGB  = $quotaGB
        }

    } catch {
        $result.Status = "Error"
        $result.ErrorMessage = $_.Exception.Message
        $errInfo = Write-ErrorResult -ErrorRecord $_ -Operation "QuotaManager"
        $result.ErrorCode = $errInfo.ErrorCode
        $result.ErrorSource = $errInfo.ErrorSource
        $stats.Errors++
        Write-Output "  ERROR [$($errInfo.ErrorCode)]: $($_.Exception.Message)"

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
# Quota capacity alert email
# ---------------------------------------------------------------------------
if ($stats.AlertFlagged -gt 0) {
    try {
        $sendFrom = Get-AutomationVariable -Name 'SendFromAddress' -ErrorAction SilentlyContinue
        $notifyTo = Get-AutomationVariable -Name 'NotificationEmail' -ErrorAction SilentlyContinue

        if ($sendFrom -and $notifyTo) {
            $toAddresses = @($notifyTo -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })

            # Build HTML table rows for flagged sites
            $siteRows = ($flaggedSites | ForEach-Object {
                "<tr><td style='padding:6px 12px;border-bottom:1px solid #e5e7eb;'>$($_.Title)</td>" +
                "<td style='padding:6px 12px;border-bottom:1px solid #e5e7eb;'>$($_.Url)</td>" +
                "<td style='padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;'>$($_.UsageGB) GB</td>" +
                "<td style='padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;'>$($_.QuotaGB) GB</td>" +
                "<td style='padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#dc2626;'>$($_.PercentUsed)%</td></tr>"
            }) -join "`n"

            $alertBody = @"
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 800px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px;">Quota Capacity Alert</h1>
        <p style="color: #fca5a5; margin: 8px 0 0 0; font-size: 14px;">$($stats.AlertFlagged) site(s) at critical capacity - Run $RunId</p>
    </div>
    <div style="background-color: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 14px; color: #64748b; margin-top: 0;">The following sites remain above ${AlertThreshold}% capacity after a ${QuotaIncrementGB} GB quota increase and require manual attention.</p>
        <table style="width: 100%; font-size: 13px; border-collapse: collapse; margin-top: 16px;">
            <thead>
                <tr style="background-color: #f8fafc;">
                    <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Site</th>
                    <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">URL</th>
                    <th style="padding: 8px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Usage</th>
                    <th style="padding: 8px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Quota</th>
                    <th style="padding: 8px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Used</th>
                </tr>
            </thead>
            <tbody>
                $siteRows
            </tbody>
        </table>
    </div>
</body>
</html>
"@

            $graphToken = (Get-AzAccessToken -ResourceUrl "https://graph.microsoft.com").Token
            $recipients = @($toAddresses | ForEach-Object {
                @{ emailAddress = @{ address = $_ } }
            })
            $mailPayload = @{
                message = @{
                    subject      = "[ALERT] Quota capacity: $($stats.AlertFlagged) site(s) at ${AlertThreshold}%+ - $RunId"
                    body         = @{ contentType = 'HTML'; content = $alertBody }
                    toRecipients = $recipients
                }
                saveToSentItems = $false
            }
            $graphHeaders = @{
                Authorization  = "Bearer $graphToken"
                'Content-Type' = 'application/json'
            }
            Invoke-RestMethod -Uri "https://graph.microsoft.com/v1.0/users/$sendFrom/sendMail" `
                -Method Post -Headers $graphHeaders `
                -Body ($mailPayload | ConvertTo-Json -Depth 10 -Compress)
            Write-Output "[INFO] Quota alert email sent to: $($toAddresses -join ', ')"
        } else {
            Write-Output "[INFO] Quota alert skipped: SendFromAddress or NotificationEmail not configured"
        }
    } catch {
        Write-Warning "Failed to send quota alert email: $($_.Exception.Message)"
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
