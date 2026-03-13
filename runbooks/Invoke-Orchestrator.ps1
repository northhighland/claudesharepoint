# Invoke-Orchestrator.ps1
# Wave-based parallel dispatcher for Azure Automation child runbooks
# Dispatches site processing across child runbooks in waves of configurable size
# to stay within Azure Automation's concurrent job limits (default: 30)
#
# Usage:
#   Invoke-Orchestrator -JobType VersionCleanup -DryRun
#   Invoke-Orchestrator -JobType QuotaManager -WaveSize 20
#   Invoke-Orchestrator -JobType StaleSiteDetector -KeyVaultName "kv-spspace-client" -StorageAccountName "stspspaceclient"
#
# Requires: Az.Accounts, Az.Automation, Az.KeyVault, Az.Storage, PnP.PowerShell

#Requires -Version 7.0

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('VersionCleanup', 'QuotaManager', 'StaleSiteDetector', 'RecycleBinCleaner')]
    [string]$JobType,

    [string]$KeyVaultName = '',
    [string]$StorageAccountName = '',
    [int]$BatchSize = 0,
    [int]$WaveSize = 30,
    [switch]$DryRun
)

#region Initialization

$ErrorActionPreference = 'Stop'
$startTime = Get-Date
$runId = Get-Date -Format 'yyyyMMdd_HHmmss'

Write-Output "======================================"
Write-Output "  SHAREPOINT ORCHESTRATOR v1.0"
Write-Output "======================================"
Write-Output "Run ID:   $runId"
Write-Output "JobType:  $JobType"
Write-Output "WaveSize: $WaveSize"
Write-Output "DryRun:   $DryRun"
Write-Output "Started:  $startTime"
Write-Output ""

# Import SpaceAgent module
$modulePath = Join-Path $PSScriptRoot "modules" "SpaceAgent.psm1"
if (-not (Test-Path $modulePath)) {
    # Fallback for Azure Automation (module may be in different location)
    $modulePath = Join-Path (Split-Path $PSScriptRoot -Parent) "modules" "SpaceAgent.psm1"
}
if (Test-Path $modulePath) {
    Import-Module $modulePath -Force
    Write-Output "Loaded SpaceAgent module from: $modulePath"
}
else {
    throw "SpaceAgent module not found. Expected at: $modulePath"
}

#endregion

#region Helper Functions

function Split-IntoBatches {
    <#
    .SYNOPSIS
        Split an array into evenly sized batches (waves)
    .PARAMETER Items
        Array of items to split
    .PARAMETER Size
        Maximum items per batch
    .OUTPUTS
        Array of arrays, each containing up to $Size items
    #>
    [CmdletBinding()]
    [OutputType([array])]
    param(
        [Parameter(Mandatory = $true)]
        [array]$Items,

        [Parameter(Mandatory = $true)]
        [ValidateRange(1, [int]::MaxValue)]
        [int]$Size
    )

    $batches = @()
    for ($i = 0; $i -lt $Items.Count; $i += $Size) {
        $end = [Math]::Min($i + $Size, $Items.Count)
        $batch = @($Items[$i..($end - 1)])
        $batches += , $batch
    }

    return $batches
}

function Update-JobRun {
    <#
    .SYNOPSIS
        Create or update a JobRun record in Azure Table Storage
    .PARAMETER StorageAccountName
        Azure Storage account name
    .PARAMETER RunId
        Unique run identifier
    .PARAMETER JobType
        Type of job being orchestrated
    .PARAMETER Status
        Current status: Running, Completed, Failed
    .PARAMETER TotalSites
        Total number of sites to process
    .PARAMETER TotalWaves
        Total number of waves
    .PARAMETER CompletedWaves
        Number of waves completed so far
    .PARAMETER Details
        Optional hashtable with additional details
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$StorageAccountName,

        [Parameter(Mandatory = $true)]
        [string]$RunId,

        [Parameter(Mandatory = $true)]
        [string]$JobType,

        [Parameter(Mandatory = $true)]
        [ValidateSet('Running', 'Completed', 'Failed')]
        [string]$Status,

        [int]$TotalSites = 0,
        [int]$TotalWaves = 0,
        [int]$CompletedWaves = 0,
        [hashtable]$Details = @{}
    )

    $context = New-AzStorageContext -StorageAccountName $StorageAccountName -UseConnectedAccount
    $tableName = 'OrchestratorJobRuns'

    # Ensure table exists
    $table = Get-AzStorageTable -Name $tableName -Context $context -ErrorAction SilentlyContinue
    if (-not $table) {
        $table = New-AzStorageTable -Name $tableName -Context $context
    }

    $cloudTable = $table.CloudTable

    # Build entity
    $partitionKey = $JobType
    $rowKey = $RunId

    $entity = [Microsoft.Azure.Cosmos.Table.DynamicTableEntity]::new($partitionKey, $rowKey)
    $entity.Properties.Add('Status', [Microsoft.Azure.Cosmos.Table.EntityProperty]::GeneratePropertyForString($Status))
    $entity.Properties.Add('TotalSites', [Microsoft.Azure.Cosmos.Table.EntityProperty]::GeneratePropertyForInt($TotalSites))
    $entity.Properties.Add('TotalWaves', [Microsoft.Azure.Cosmos.Table.EntityProperty]::GeneratePropertyForInt($TotalWaves))
    $entity.Properties.Add('CompletedWaves', [Microsoft.Azure.Cosmos.Table.EntityProperty]::GeneratePropertyForInt($CompletedWaves))
    $entity.Properties.Add('DryRun', [Microsoft.Azure.Cosmos.Table.EntityProperty]::GeneratePropertyForBool($DryRun.IsPresent))
    $entity.Properties.Add('UpdatedAt', [Microsoft.Azure.Cosmos.Table.EntityProperty]::GeneratePropertyForString((Get-Date).ToString("o")))

    if ($Details.Count -gt 0) {
        $detailsJson = $Details | ConvertTo-Json -Depth 5 -Compress
        $entity.Properties.Add('Details', [Microsoft.Azure.Cosmos.Table.EntityProperty]::GeneratePropertyForString($detailsJson))
    }

    # InsertOrMerge to create or update
    [Microsoft.Azure.Cosmos.Table.TableOperation]$operation = [Microsoft.Azure.Cosmos.Table.TableOperation]::InsertOrMerge($entity)
    $cloudTable.Execute($operation) | Out-Null

    Write-Verbose "JobRun updated: $partitionKey/$rowKey -> $Status"
}

function Connect-SpaceAgent {
    <#
    .SYNOPSIS
        Connect to SharePoint admin center using Key Vault certificate
    .PARAMETER KeyVaultName
        Azure Key Vault containing the certificate and connection secrets
    .OUTPUTS
        Hashtable with ClientId, TenantId, AdminUrl, CertificatePath for reuse
    #>
    [CmdletBinding()]
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory = $true)]
        [string]$KeyVaultName
    )

    Write-Output "Retrieving certificate from Key Vault..."
    $certPath = Get-CertificateFromKeyVault -KeyVaultName $KeyVaultName

    $clientId = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "SPClientId" -AsPlainText
    $tenantId = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "SPTenantId" -AsPlainText
    $adminUrl = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "SPAdminUrl" -AsPlainText

    Write-Output "Connecting to SharePoint admin: $adminUrl"
    Connect-PnPOnline -Url $adminUrl -ClientId $clientId -Tenant $tenantId -CertificatePath $certPath -ErrorAction Stop
    Initialize-TokenRefresh

    Write-Output "SharePoint admin connection established"

    return @{
        ClientId        = $clientId
        TenantId        = $tenantId
        AdminUrl        = $adminUrl
        CertificatePath = $certPath
    }
}

function Get-AllSites {
    <#
    .SYNOPSIS
        Get all SharePoint sites, filtered by exclusion patterns and batch size
    .PARAMETER AdminUrl
        SharePoint admin center URL
    .PARAMETER ExclusionPatterns
        URL patterns to exclude
    .PARAMETER BatchSize
        Maximum number of sites to return (0 = unlimited)
    .OUTPUTS
        Array of site objects
    #>
    [CmdletBinding()]
    [OutputType([array])]
    param(
        [Parameter(Mandatory = $true)]
        [string]$AdminUrl,

        [string[]]$ExclusionPatterns = @(),

        [int]$BatchSize = 0
    )

    $sites = Get-FilteredSites -AdminUrl $AdminUrl -ExclusionPatterns $ExclusionPatterns

    if ($BatchSize -gt 0 -and $BatchSize -lt $sites.Count) {
        $sites = $sites | Select-Object -First $BatchSize
        Write-Output "Batch limited to: $($sites.Count) sites"
    }

    return @($sites)
}

function Send-Notification {
    <#
    .SYNOPSIS
        Send orchestrator completion notification
    .PARAMETER Config
        Configuration hashtable (must contain NotificationEmail and SendFromAddress)
    .PARAMETER Summary
        Run summary hashtable
    .PARAMETER JobType
        Type of job that was executed
    .PARAMETER RunId
        Run identifier
    .PARAMETER Status
        Final status: Completed or Failed
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Config,

        [Parameter(Mandatory = $true)]
        [hashtable]$Summary,

        [Parameter(Mandatory = $true)]
        [string]$JobType,

        [Parameter(Mandatory = $true)]
        [string]$RunId,

        [Parameter(Mandatory = $true)]
        [ValidateSet('Completed', 'Failed')]
        [string]$Status
    )

    $toAddresses = @()
    $fromAddress = $null

    # Get notification settings from config or automation variables
    $notifyEmail = $Config.NotificationEmail
    if (-not $notifyEmail) {
        $notifyEmail = Get-AutomationVariable -Name 'NotificationEmail' -ErrorAction SilentlyContinue
    }
    $fromEmail = $Config.SendFromAddress
    if (-not $fromEmail) {
        $fromEmail = Get-AutomationVariable -Name 'SendFromAddress' -ErrorAction SilentlyContinue
    }

    if (-not $notifyEmail -or -not $fromEmail) {
        Write-Output "Notification skipped: email addresses not configured"
        return
    }

    $toAddresses = @($notifyEmail -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $fromAddress = $fromEmail

    $statusEmoji = if ($Status -eq 'Completed') { 'SUCCESS' } else { 'FAILURE' }
    $subject = "[$statusEmoji] Orchestrator: $JobType - $RunId"

    $body = @"
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #0a1628 0%, #0f2140 100%); padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px;">SharePoint Orchestrator</h1>
        <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">$JobType - Run $RunId</p>
    </div>
    <div style="background-color: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #64748b;">Status</td><td style="padding: 6px 0; font-weight: 600;">$Status</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Total Sites</td><td style="padding: 6px 0;">$($Summary.TotalSites)</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Waves</td><td style="padding: 6px 0;">$($Summary.TotalWaves)</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Succeeded</td><td style="padding: 6px 0;">$($Summary.ChildJobsSucceeded)</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Failed</td><td style="padding: 6px 0;">$($Summary.ChildJobsFailed)</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Duration</td><td style="padding: 6px 0;">$($Summary.DurationMinutes) minutes</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">DryRun</td><td style="padding: 6px 0;">$($Summary.DryRun)</td></tr>
        </table>
    </div>
</body>
</html>
"@

    try {
        Send-ReportEmail -FromAddress $fromAddress -ToAddresses $toAddresses -Subject $subject -Body $body
        Write-Output "Notification sent to: $($toAddresses -join ', ')"
    }
    catch {
        Write-Warning "Failed to send notification: $($_.Exception.Message)"
    }
}

#endregion

#region Azure Authentication

Write-Output "Connecting to Azure with managed identity..."
try {
    Connect-AzAccount -Identity | Out-Null
    Write-Output "Azure authentication successful"
}
catch {
    Write-Error "Failed to authenticate with managed identity: $($_.Exception.Message)"
    throw
}

#endregion

#region Configuration

Write-Output "Loading configuration..."

$config = Get-SpaceAgentConfig

# Check DisableSchedule flag
if ($config.DisableSchedule -eq $true) {
    Write-Output ""
    Write-Output "*** EXECUTION PAUSED ***"
    Write-Output "DisableSchedule variable is set to true."
    Write-Output "To resume, set DisableSchedule to false in Automation Variables."
    Write-Output ""
    exit 0
}

# Apply parameter overrides
if ($BatchSize -gt 0) { $config.BatchSize = $BatchSize }

# Resolve Key Vault and Storage Account names
if ([string]::IsNullOrWhiteSpace($KeyVaultName)) {
    $KeyVaultName = Get-AutomationVariable -Name 'KeyVaultName' -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($KeyVaultName)) {
        throw "KeyVaultName not provided and not found in Automation Variables"
    }
}

if ([string]::IsNullOrWhiteSpace($StorageAccountName)) {
    $StorageAccountName = Get-AutomationVariable -Name 'StorageAccountName' -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($StorageAccountName)) {
        throw "StorageAccountName not provided and not found in Automation Variables"
    }
}

Write-Output ""
Write-Output "Configuration:"
Write-Output "  KeyVaultName:       $KeyVaultName"
Write-Output "  StorageAccountName: $StorageAccountName"
Write-Output "  BatchSize:          $($config.BatchSize)"
Write-Output "  WaveSize:           $WaveSize"
Write-Output "  Exclusions:         $($config.ExclusionPatterns.Count) patterns"
Write-Output ""

#endregion

#region SharePoint Connection & Site Discovery

$spConnection = Connect-SpaceAgent -KeyVaultName $KeyVaultName

Write-Output ""
Write-Output "Discovering SharePoint sites..."

$sites = Get-AllSites -AdminUrl $spConnection.AdminUrl `
    -ExclusionPatterns $config.ExclusionPatterns `
    -BatchSize $config.BatchSize

Disconnect-PnPOnline -ErrorAction SilentlyContinue

if ($sites.Count -eq 0) {
    Write-Output "No sites to process after exclusions. Exiting."
    exit 0
}

Write-Output "Sites to process: $($sites.Count)"

#endregion

#region Wave Planning

$siteUrls = @($sites | ForEach-Object { $_.Url })
$waves = Split-IntoBatches -Items $siteUrls -Size $WaveSize
$totalWaves = $waves.Count

Write-Output ""
Write-Output "Wave Plan:"
Write-Output "  Total sites:  $($siteUrls.Count)"
Write-Output "  Wave size:    $WaveSize"
Write-Output "  Total waves:  $totalWaves"
Write-Output ""

#endregion

#region JobRun Record

try {
    Update-JobRun -StorageAccountName $StorageAccountName `
        -RunId $runId -JobType $JobType -Status 'Running' `
        -TotalSites $siteUrls.Count -TotalWaves $totalWaves `
        -CompletedWaves 0 -Details @{
            StartedAt = $startTime.ToString("o")
            DryRun    = $DryRun.IsPresent
            WaveSize  = $WaveSize
        }
    Write-Output "JobRun record created: $JobType/$runId"
}
catch {
    Write-Warning "Failed to create JobRun record: $($_.Exception.Message)"
}

#endregion

#region Runbook Mapping

$runbookMap = @{
    'VersionCleanup'    = 'Invoke-VersionCleanup'
    'QuotaManager'      = 'Invoke-QuotaManager'
    'StaleSiteDetector' = 'Invoke-StaleSiteDetector'
    'RecycleBinCleaner' = 'Invoke-RecycleBinCleaner'
}

$childRunbookName = $runbookMap[$JobType]
Write-Output "Child runbook: $childRunbookName"

#endregion

#region Resolve Automation Account Context

# Get resource group and automation account from environment or automation variables
$resourceGroupName = $env:AZURE_RESOURCE_GROUP
if ([string]::IsNullOrWhiteSpace($resourceGroupName)) {
    $resourceGroupName = Get-AutomationVariable -Name 'ResourceGroupName' -ErrorAction SilentlyContinue
}
if ([string]::IsNullOrWhiteSpace($resourceGroupName)) {
    throw "ResourceGroupName not found in environment or Automation Variables"
}

$automationAccountName = $env:AZURE_AUTOMATION_ACCOUNT
if ([string]::IsNullOrWhiteSpace($automationAccountName)) {
    $automationAccountName = Get-AutomationVariable -Name 'AutomationAccountName' -ErrorAction SilentlyContinue
}
if ([string]::IsNullOrWhiteSpace($automationAccountName)) {
    throw "AutomationAccountName not found in environment or Automation Variables"
}

Write-Output "Automation Account: $automationAccountName (RG: $resourceGroupName)"
Write-Output ""

#endregion

#region Wave Execution

Write-Output "======================================"
Write-Output "  EXECUTING WAVES"
Write-Output "======================================"
Write-Output ""

$totalChildJobsSucceeded = 0
$totalChildJobsFailed = 0
$totalChildJobsTotal = 0
$waveErrors = @()

for ($waveIndex = 0; $waveIndex -lt $totalWaves; $waveIndex++) {
    $waveNumber = $waveIndex + 1
    $waveSites = $waves[$waveIndex]
    $waveStartTime = Get-Date

    Write-Output "--- Wave $waveNumber/$totalWaves ($($waveSites.Count) sites) ---"

    # Start child runbooks for this wave
    $childJobs = @()

    foreach ($siteUrl in $waveSites) {
        $totalChildJobsTotal++

        # Build child runbook parameters
        $childParams = @{
            SiteUrls = ($waveSites | ConvertTo-Json -Compress)
            RunId    = $runId
            DryRun   = $DryRun.IsPresent
        }

        # Add job-type-specific parameters from config
        switch ($JobType) {
            'VersionCleanup' {
                $childParams['ExpireAfterDays'] = $config.ExpireAfterDays
                $childParams['MaxMajorVersions'] = $config.MaxMajorVersions
            }
        }

        try {
            $job = Start-AzAutomationRunbook `
                -ResourceGroupName $resourceGroupName `
                -AutomationAccountName $automationAccountName `
                -Name $childRunbookName `
                -Parameters $childParams `
                -ErrorAction Stop

            $childJobs += $job
            Write-Output "  Started: $($job.JobId) -> $($waveSites.Count) sites"
        }
        catch {
            Write-Warning "  Failed to start child runbook: $($_.Exception.Message)"
            $totalChildJobsFailed++
            $waveErrors += @{
                Wave    = $waveNumber
                Sites   = $waveSites
                Error   = $_.Exception.Message
            }
        }

        # Only start one child job per wave (sites are batched in the JSON array)
        break
    }

    if ($childJobs.Count -eq 0) {
        Write-Warning "  No child jobs started for wave $waveNumber"
        continue
    }

    # Wait for wave completion
    Write-Output "  Waiting for wave $waveNumber to complete..."

    $pollIntervalSeconds = 30
    $waveComplete = $false
    $maxWaitMinutes = 120
    $waveDeadline = (Get-Date).AddMinutes($maxWaitMinutes)

    while (-not $waveComplete -and (Get-Date) -lt $waveDeadline) {
        Start-Sleep -Seconds $pollIntervalSeconds

        $allDone = $true
        $waveSucceeded = 0
        $waveFailed = 0

        foreach ($job in $childJobs) {
            $jobStatus = Get-AzAutomationJob `
                -ResourceGroupName $resourceGroupName `
                -AutomationAccountName $automationAccountName `
                -Id $job.JobId `
                -ErrorAction SilentlyContinue

            if (-not $jobStatus) {
                Write-Warning "  Could not retrieve status for job $($job.JobId)"
                continue
            }

            switch ($jobStatus.Status) {
                'Completed' { $waveSucceeded++ }
                'Failed'    { $waveFailed++ }
                'Stopped'   { $waveFailed++ }
                'Suspended' { $waveFailed++ }
                default     { $allDone = $false }
            }
        }

        if ($allDone) {
            $waveComplete = $true
        }
        else {
            $elapsed = [math]::Round(((Get-Date) - $waveStartTime).TotalSeconds)
            Write-Output "  Polling... ($elapsed`s elapsed, $waveSucceeded/$($childJobs.Count) done)"
        }
    }

    # Handle wave timeout
    if (-not $waveComplete) {
        Write-Warning "  Wave $waveNumber timed out after $maxWaitMinutes minutes"
        $waveFailed = $childJobs.Count - $waveSucceeded
    }

    $totalChildJobsSucceeded += $waveSucceeded
    $totalChildJobsFailed += $waveFailed

    $waveDuration = [math]::Round(((Get-Date) - $waveStartTime).TotalMinutes, 1)
    Write-Output "  Wave $waveNumber complete: $waveSucceeded succeeded, $waveFailed failed ($waveDuration min)"
    Write-Output ""

    # Update JobRun progress
    try {
        Update-JobRun -StorageAccountName $StorageAccountName `
            -RunId $runId -JobType $JobType -Status 'Running' `
            -TotalSites $siteUrls.Count -TotalWaves $totalWaves `
            -CompletedWaves $waveNumber -Details @{
                StartedAt       = $startTime.ToString("o")
                DryRun          = $DryRun.IsPresent
                WaveSize        = $WaveSize
                JobsSucceeded   = $totalChildJobsSucceeded
                JobsFailed      = $totalChildJobsFailed
                LastWaveDuration = $waveDuration
            }
    }
    catch {
        Write-Warning "Failed to update JobRun progress: $($_.Exception.Message)"
    }
}

#endregion

#region Completion

$endTime = Get-Date
$duration = $endTime - $startTime
$durationMinutes = [math]::Round($duration.TotalMinutes, 2)

$finalStatus = if ($totalChildJobsFailed -eq 0) { 'Completed' } else { 'Failed' }

Write-Output "======================================"
Write-Output "  ORCHESTRATOR SUMMARY"
Write-Output "======================================"
Write-Output ""
Write-Output "JobType:           $JobType"
Write-Output "RunId:             $runId"
Write-Output "Status:            $finalStatus"
Write-Output "Duration:          $durationMinutes minutes"
Write-Output "DryRun:            $DryRun"
Write-Output ""
Write-Output "Total Sites:       $($siteUrls.Count)"
Write-Output "Total Waves:       $totalWaves"
Write-Output "Wave Size:         $WaveSize"
Write-Output ""
Write-Output "Child Jobs Total:  $totalChildJobsTotal"
Write-Output "Child Jobs OK:     $totalChildJobsSucceeded"
Write-Output "Child Jobs Failed: $totalChildJobsFailed"
Write-Output ""

if ($waveErrors.Count -gt 0) {
    Write-Output "Errors:"
    foreach ($err in $waveErrors) {
        Write-Output "  Wave $($err.Wave): $($err.Error)"
    }
    Write-Output ""
}

# Update final JobRun status
try {
    Update-JobRun -StorageAccountName $StorageAccountName `
        -RunId $runId -JobType $JobType -Status $finalStatus `
        -TotalSites $siteUrls.Count -TotalWaves $totalWaves `
        -CompletedWaves $totalWaves -Details @{
            StartedAt      = $startTime.ToString("o")
            CompletedAt    = $endTime.ToString("o")
            DryRun         = $DryRun.IsPresent
            WaveSize       = $WaveSize
            JobsSucceeded  = $totalChildJobsSucceeded
            JobsFailed     = $totalChildJobsFailed
            DurationMinutes = $durationMinutes
        }
    Write-Output "JobRun record updated: $finalStatus"
}
catch {
    Write-Warning "Failed to update final JobRun record: $($_.Exception.Message)"
}

# Send notification
$summary = @{
    TotalSites         = $siteUrls.Count
    TotalWaves         = $totalWaves
    ChildJobsSucceeded = $totalChildJobsSucceeded
    ChildJobsFailed    = $totalChildJobsFailed
    DurationMinutes    = $durationMinutes
    DryRun             = $DryRun.IsPresent
}

try {
    Send-Notification -Config $config -Summary $summary `
        -JobType $JobType -RunId $runId -Status $finalStatus
}
catch {
    Write-Warning "Failed to send notification: $($_.Exception.Message)"
}

# Final status output
if ($finalStatus -eq 'Completed') {
    Write-Output ""
    Write-Output "*** ORCHESTRATOR COMPLETE ***"
    Write-Output "All waves executed successfully."
}
else {
    Write-Output ""
    Write-Output "*** ORCHESTRATOR FINISHED WITH ERRORS ***"
    Write-Output "$totalChildJobsFailed child job(s) failed. Review logs for details."
}

Write-Output ""
Write-Output "Completed: $endTime"

#endregion
