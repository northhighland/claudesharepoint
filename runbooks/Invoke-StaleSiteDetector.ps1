#Requires -Version 7.0
<#
.SYNOPSIS
    Worker runbook: Scores SharePoint sites for staleness and recommends actions.

.DESCRIPTION
    Processes a JSON array of site URLs, collecting activity metrics via Graph API
    and SharePoint Online, then calculates a staleness score (0-100). Sites are
    categorized as Active, LowActivity, Dormant, RecommendArchive, or RecommendDelete.
    Results are written to Azure Table Storage (StaleSiteRecommendations).

    Designed to run as an Azure Automation child runbook invoked by Invoke-Orchestrator.

.PARAMETER SiteUrls
    JSON string array of SharePoint site URLs to process.

.PARAMETER RunId
    Unique identifier for this orchestrator job run (used as PartitionKey in Table Storage).

.PARAMETER KeyVaultName
    Name of the Azure Key Vault containing SPO credentials and certificates.

.PARAMETER StorageAccountName
    Name of the Azure Storage Account for writing results to Table Storage.
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
$certTempPath = Join-Path $tempDir "spaceagent-stale-$RunId.pfx"
Write-Output "[INFO] Saving cert to: $certTempPath"
[System.IO.File]::WriteAllBytes($certTempPath, $certBytes)

# Table Storage result table name
$resultTableName = "StaleSiteRecommendations"

# Staleness scoring weights (from config/defaults.json)
$ScoreWeights = @{
    NoActivity180Days   = 40
    NoActiveUsers90Days = 25
    LessThan10Files     = 15
    LessThan100MB       = 10
    OlderThan2Years     = 10
}

# Category thresholds
$Categories = @{
    Active           = @{ Min = 0;  Max = 20 }
    LowActivity      = @{ Min = 21; Max = 50 }
    Dormant          = @{ Min = 51; Max = 70 }
    RecommendArchive = @{ Min = 71; Max = 85 }
    RecommendDelete  = @{ Min = 86; Max = 100 }
}

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

function Connect-PnPSite {
    param([string]$Url)
    Connect-PnPOnline -Url $Url -ClientId $clientId -Tenant $tenantId `
        -CertificatePath $certTempPath -ErrorAction Stop
}

function Get-GraphToken {
    $resource = "https://graph.microsoft.com"
    $tokenObj = Get-AzAccessToken -ResourceUrl $resource
    return $tokenObj.Token
}

function Get-GraphHeaders {
    $token = Get-GraphToken
    return @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
}

function Invoke-WithTokenRefresh {
    param(
        [scriptblock]$ScriptBlock,
        [string]$SiteUrl,
        [string]$Operation = "Operation",
        [int]$MaxRetries = 3
    )

    $attempt = 0
    $delay = 10
    while ($attempt -lt $MaxRetries) {
        try {
            return & $ScriptBlock
        } catch {
            $attempt++
            $msg = $_.Exception.Message
            $isTokenError = $msg -match "token|unauthorized|401|expired"
            $isThrottled  = $msg -match "throttl|429|Too Many Requests|retry"

            if ($isTokenError -and $attempt -lt $MaxRetries) {
                Write-Output "[WARN] $Operation - token expired, reconnecting (attempt $attempt)..."
                try { Disconnect-PnPOnline -ErrorAction SilentlyContinue } catch {}
                Connect-PnPSite -Url $SiteUrl
                continue
            }

            if ($isThrottled -and $attempt -lt $MaxRetries) {
                Write-Output "[WARN] $Operation - throttled, waiting ${delay}s (attempt $attempt)..."
                Start-Sleep -Seconds $delay
                $delay = [Math]::Min($delay * 2, 300)
                continue
            }

            throw
        }
    }
}

function Get-GraphSiteId {
    <#
    .SYNOPSIS Resolves a SharePoint site URL to a Graph site ID.
    #>
    param([string]$SiteUrl)

    $headers = Get-GraphHeaders
    $uri = [Uri]$SiteUrl
    $hostname = $uri.Host
    $sitePath = $uri.AbsolutePath.TrimEnd('/')

    $endpoint = "https://graph.microsoft.com/v1.0/sites/${hostname}:${sitePath}"
    $siteInfo = Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Get
    return $siteInfo.id
}

function Get-SiteAnalytics {
    <#
    .SYNOPSIS Retrieves site activity analytics from Graph API.
    Returns last activity date and active user counts for 30/90 day periods.
    #>
    param([string]$GraphSiteId)

    $headers = Get-GraphHeaders
    $analytics = @{
        LastActivityDate    = $null
        ActiveUsers30Days   = 0
        ActiveUsers90Days   = 0
    }

    # Get site analytics - last 90 days
    try {
        $endpoint = "https://graph.microsoft.com/v1.0/sites/$GraphSiteId/analytics/allTime"
        $response = Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Get -ErrorAction Stop
        if ($response.lastActivityDateTime) {
            $analytics.LastActivityDate = [datetime]$response.lastActivityDateTime
        }
    } catch {
        Write-Warning "    Could not retrieve allTime analytics: $($_.Exception.Message)"
    }

    # Get recent activity details via site usage detail report
    try {
        $endpoint = "https://graph.microsoft.com/v1.0/sites/$GraphSiteId/analytics/lastSevenDays"
        $response = Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Get -ErrorAction Stop
        # lastSevenDays gives us a signal of active users
        if ($response.access) {
            $analytics.ActiveUsers30Days = $response.access.actionCount
        }
    } catch {
        Write-Warning "    Analytics unavailable: $($_.Exception.Message)"
    }

    # Try site-level getActivitiesByInterval for more granular data
    try {
        $now = Get-Date
        $thirtyDaysAgo = $now.AddDays(-30).ToString("yyyy-MM-dd")
        $ninetyDaysAgo = $now.AddDays(-90).ToString("yyyy-MM-dd")

        $endpoint = "https://graph.microsoft.com/v1.0/sites/$GraphSiteId/getActivitiesByInterval(startDateTime='$ninetyDaysAgo',endDateTime='$($now.ToString("yyyy-MM-dd"))',interval='month')"
        $response = Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Get -ErrorAction SilentlyContinue

        if ($response.value) {
            # Count unique users across intervals
            $allActivities = $response.value
            $analytics.ActiveUsers90Days = ($allActivities | Where-Object { $_.access } |
                Measure-Object -Property { $_.access.actionCount } -Sum).Sum

            # Filter to last 30 days
            $thirtyDayActivities = $allActivities | Where-Object {
                $_.startDateTime -and [datetime]$_.startDateTime -ge [datetime]$thirtyDaysAgo
            }
            if ($thirtyDayActivities) {
                $analytics.ActiveUsers30Days = ($thirtyDayActivities | Where-Object { $_.access } |
                    Measure-Object -Property { $_.access.actionCount } -Sum).Sum
            }
        }
    } catch {
        Write-Warning "    Analytics unavailable: $($_.Exception.Message)"
    }

    return $analytics
}

function Get-SiteFileCount {
    <#
    .SYNOPSIS Counts total files in a site using Graph API drives endpoint.
    #>
    param([string]$GraphSiteId)

    $headers = Get-GraphHeaders
    $totalFiles = 0

    try {
        $drivesEndpoint = "https://graph.microsoft.com/v1.0/sites/$GraphSiteId/drives"
        $drives = Invoke-RestMethod -Uri $drivesEndpoint -Headers $headers -Method Get

        foreach ($drive in $drives.value) {
            if ($drive.quota -and $drive.quota.fileCount) {
                $totalFiles += $drive.quota.fileCount
            } else {
                # Fallback: count root items
                try {
                    $rootEndpoint = "https://graph.microsoft.com/v1.0/drives/$($drive.id)/root/children?`$top=1&`$count=true"
                    $rootResponse = Invoke-RestMethod -Uri $rootEndpoint -Headers $headers -Method Get -ErrorAction SilentlyContinue
                    if ($rootResponse.'@odata.count') {
                        $totalFiles += $rootResponse.'@odata.count'
                    } elseif ($rootResponse.value) {
                        $totalFiles += $rootResponse.value.Count
                    }
                } catch {
                    Write-Warning "    Analytics unavailable: $($_.Exception.Message)"
                }
            }
        }
    } catch {
        Write-Warning "    Could not enumerate drives for file count"
    }

    return $totalFiles
}

function Get-StalenessScore {
    <#
    .SYNOPSIS Calculates a 0-100 staleness score based on site metrics.
    #>
    param([hashtable]$Metrics)

    $score = 0
    $now = Get-Date
    $reasons = @()

    # No activity in 180+ days = 40 points
    $lastActivity = $Metrics.LastActivityDate
    if ($null -eq $lastActivity -or ($now - $lastActivity).TotalDays -ge 180) {
        $score += $ScoreWeights.NoActivity180Days
        $daysSinceActivity = if ($lastActivity) { [math]::Round(($now - $lastActivity).TotalDays) } else { "never" }
        $reasons += "NoActivity180Days (last: $daysSinceActivity)"
    }

    # No active users in 90 days = 25 points
    if ($Metrics.ActiveUsers90Days -le 0) {
        $score += $ScoreWeights.NoActiveUsers90Days
        $reasons += "NoActiveUsers90Days"
    }

    # Fewer than 10 files = 15 points
    if ($Metrics.TotalFileCount -lt 10) {
        $score += $ScoreWeights.LessThan10Files
        $reasons += "LessThan10Files ($($Metrics.TotalFileCount))"
    }

    # Less than 100 MB storage = 10 points
    if ($Metrics.StorageUsedMB -lt 100) {
        $score += $ScoreWeights.LessThan100MB
        $reasons += "LessThan100MB ($([math]::Round($Metrics.StorageUsedMB, 1)) MB)"
    }

    # Site older than 2 years = 10 points
    if ($Metrics.SiteCreatedDate -and ($now - $Metrics.SiteCreatedDate).TotalDays -ge 730) {
        $score += $ScoreWeights.OlderThan2Years
        $ageYears = [math]::Round(($now - $Metrics.SiteCreatedDate).TotalDays / 365, 1)
        $reasons += "OlderThan2Years ($ageYears yrs)"
    }

    # Clamp to 0-100
    $score = [Math]::Max(0, [Math]::Min(100, $score))

    return @{
        Score   = $score
        Reasons = $reasons
    }
}

function Get-StalenessCategory {
    <#
    .SYNOPSIS Maps a numeric staleness score to a named category.
    #>
    param([int]$Score)

    foreach ($cat in $Categories.GetEnumerator()) {
        if ($Score -ge $cat.Value.Min -and $Score -le $cat.Value.Max) {
            return $cat.Key
        }
    }

    return "Unknown"
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
        PartitionKey        = $RunId
        RowKey              = $rowKey
        SiteUrl             = $Result.SiteUrl
        SiteTitle           = $Result.SiteTitle
        StalenessScore      = $Result.StalenessScore
        Category            = $Result.Category
        Reasons             = ($Result.Reasons -join "; ")
        LastModifiedDate    = if ($Result.LastModifiedDate) { $Result.LastModifiedDate.ToString("o") } else { "" }
        LastActivityDate    = if ($Result.LastActivityDate) { $Result.LastActivityDate.ToString("o") } else { "" }
        ActiveUsers30Days   = $Result.ActiveUsers30Days
        ActiveUsers90Days   = $Result.ActiveUsers90Days
        TotalFileCount      = $Result.TotalFileCount
        StorageUsedMB       = $Result.StorageUsedMB
        SiteCreatedDate     = if ($Result.SiteCreatedDate) { $Result.SiteCreatedDate.ToString("o") } else { "" }
        SiteAgeYears        = $Result.SiteAgeYears
        Status              = $Result.Status
        ErrorMessage        = $Result.ErrorMessage
        ErrorCode           = $Result.ErrorCode
        ErrorSource         = $Result.ErrorSource
        CompletedAt         = (Get-Date -Format "o")
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
    Processed         = 0
    Active            = 0
    LowActivity       = 0
    Dormant           = 0
    RecommendArchive  = 0
    RecommendDelete   = 0
    Errors            = 0
}

Write-Output "============================================"
Write-Output "  STALE SITE DETECTOR WORKER"
Write-Output "  RunId: $RunId"
Write-Output "  Sites: $totalSites"
Write-Output "============================================"

foreach ($siteUrl in $sites) {
    $siteIndex++

    $result = @{
        SiteUrl           = $siteUrl
        SiteTitle         = ""
        StalenessScore    = 0
        Category          = "Unknown"
        Reasons           = @()
        LastModifiedDate  = $null
        LastActivityDate  = $null
        ActiveUsers30Days = 0
        ActiveUsers90Days = 0
        TotalFileCount    = 0
        StorageUsedMB     = 0
        SiteCreatedDate   = $null
        SiteAgeYears      = 0
        Status            = "Success"
        ErrorMessage      = ""
        ErrorCode         = ""
        ErrorSource       = ""
    }

    Write-Output ""
    Write-Output "[$siteIndex/$totalSites] Analysing: $siteUrl"

    try {
        # --- Connect PnP and gather SPO-level properties ---
        Connect-PnPSite -Url $siteUrl

        $web  = Get-PnPWeb -Includes Title, LastItemModifiedDate, Created
        $site = Get-PnPSite -Includes Usage

        $result.SiteTitle        = $web.Title
        $result.LastModifiedDate = $web.LastItemModifiedDate
        $result.SiteCreatedDate  = $web.Created
        $result.StorageUsedMB    = [math]::Round($site.Usage.Storage / 1MB, 2)

        $now = Get-Date
        if ($web.Created) {
            $result.SiteAgeYears = [math]::Round(($now - $web.Created).TotalDays / 365, 1)
        }

        Write-Output "  Site: $($web.Title)"
        Write-Output "  Created: $($web.Created.ToString('yyyy-MM-dd')) | Last modified: $($web.LastItemModifiedDate.ToString('yyyy-MM-dd'))"
        Write-Output "  Storage: $([math]::Round($result.StorageUsedMB, 1)) MB"

        try { Disconnect-PnPOnline -ErrorAction SilentlyContinue } catch {}

        # --- Gather Graph API metrics ---
        $graphSiteId = $null
        try {
            $graphSiteId = Get-GraphSiteId -SiteUrl $siteUrl
        } catch {
            Write-Warning "  Could not resolve Graph site ID: $($_.Exception.Message)"
        }

        if ($graphSiteId) {
            # Activity analytics
            $analytics = Get-SiteAnalytics -GraphSiteId $graphSiteId
            $result.LastActivityDate  = $analytics.LastActivityDate
            $result.ActiveUsers30Days = $analytics.ActiveUsers30Days
            $result.ActiveUsers90Days = $analytics.ActiveUsers90Days

            if ($analytics.LastActivityDate) {
                Write-Output "  Last activity: $($analytics.LastActivityDate.ToString('yyyy-MM-dd'))"
            } else {
                Write-Output "  Last activity: unknown"
            }
            Write-Output "  Active users (30d/90d): $($analytics.ActiveUsers30Days) / $($analytics.ActiveUsers90Days)"

            # File count
            $result.TotalFileCount = Get-SiteFileCount -GraphSiteId $graphSiteId
            Write-Output "  Total files: $($result.TotalFileCount)"
        }

        # --- Calculate staleness score ---
        $metrics = @{
            LastActivityDate  = if ($result.LastActivityDate) { $result.LastActivityDate } else { $result.LastModifiedDate }
            ActiveUsers90Days = $result.ActiveUsers90Days
            TotalFileCount    = $result.TotalFileCount
            StorageUsedMB     = $result.StorageUsedMB
            SiteCreatedDate   = $result.SiteCreatedDate
        }

        $scoring = Get-StalenessScore -Metrics $metrics
        $result.StalenessScore = $scoring.Score
        $result.Reasons        = $scoring.Reasons
        $result.Category       = Get-StalenessCategory -Score $scoring.Score

        # Update stats
        $stats.Processed++
        switch ($result.Category) {
            "Active"           { $stats.Active++ }
            "LowActivity"      { $stats.LowActivity++ }
            "Dormant"          { $stats.Dormant++ }
            "RecommendArchive" { $stats.RecommendArchive++ }
            "RecommendDelete"  { $stats.RecommendDelete++ }
        }

        $categoryColor = switch ($result.Category) {
            "Active"           { "Active" }
            "LowActivity"      { "LowActivity" }
            "Dormant"          { "Dormant" }
            "RecommendArchive" { "ARCHIVE" }
            "RecommendDelete"  { "DELETE" }
            default            { "Unknown" }
        }

        Write-Output "  Score: $($result.StalenessScore)/100 -> [$categoryColor]"
        if ($result.Reasons.Count -gt 0) {
            Write-Output "  Factors: $($result.Reasons -join ', ')"
        }

    } catch {
        $result.Status = "Error"
        $result.ErrorMessage = $_.Exception.Message
        $errInfo = Write-ErrorResult -ErrorRecord $_ -Operation "StaleSiteDetector"
        $result.ErrorCode = $errInfo.ErrorCode
        $result.ErrorSource = $errInfo.ErrorSource
        $stats.Errors++
        Write-Output "  ERROR [$($errInfo.ErrorCode)]: $($_.Exception.Message)"
    } finally {
        # Disconnect PnP
        try { Disconnect-PnPOnline -ErrorAction SilentlyContinue } catch {}

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
    Active           = $stats.Active
    LowActivity      = $stats.LowActivity
    Dormant          = $stats.Dormant
    RecommendArchive = $stats.RecommendArchive
    RecommendDelete  = $stats.RecommendDelete
    Errors           = $stats.Errors
    CompletedAt      = (Get-Date -Format "o")
}

Write-Output ""
Write-Output "============================================"
Write-Output "  STALE SITE DETECTOR COMPLETE"
Write-Output "  Sites processed:    $($stats.Processed)"
Write-Output "  Active:             $($stats.Active)"
Write-Output "  Low Activity:       $($stats.LowActivity)"
Write-Output "  Dormant:            $($stats.Dormant)"
Write-Output "  Recommend Archive:  $($stats.RecommendArchive)"
Write-Output "  Recommend Delete:   $($stats.RecommendDelete)"
Write-Output "  Errors:             $($stats.Errors)"
Write-Output "============================================"

$summary | ConvertTo-Json -Depth 3 | Write-Output
