#Requires -Version 7.0

<#
.SYNOPSIS
    claudesharepoint — One-command setup wizard for Azure Cloud Shell.

.DESCRIPTION
    Downloads all setup components from GitHub and runs an interactive 8-step
    deployment wizard. Deploys Azure infrastructure, configures SharePoint
    permissions, uploads runbooks, and provisions a monitoring dashboard.

.NOTES
    Organization: North Highland
    Usage:       irm https://raw.githubusercontent.com/northhighland/claudesharepoint/main/setup/Install-SpaceAgent.ps1 | iex
#>

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'   # Speed up Invoke-RestMethod in Cloud Shell

# ─────────────────────────────────────────────
#  Constants
# ─────────────────────────────────────────────

$RepoBaseUrl = "https://raw.githubusercontent.com/northhighland/claudesharepoint/main"
$ScriptVersion = "1.0.0"

# ─────────────────────────────────────────────
#  Temp working directory
# ─────────────────────────────────────────────

$workDir = Join-Path ([System.IO.Path]::GetTempPath()) "spaceagent-setup-$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -ItemType Directory -Path $workDir -Force | Out-Null

function Remove-WorkDir {
    if (Test-Path $workDir) {
        Remove-Item -Recurse -Force $workDir -ErrorAction SilentlyContinue
    }
}

# ─────────────────────────────────────────────
#  Download setup files
# ─────────────────────────────────────────────

$filesToDownload = @(
    "setup/helpers/Write-StepBanner.ps1",
    "setup/helpers/Test-Prerequisites.ps1",
    "setup/steps/01-Check-Environment.ps1",
    "setup/steps/02-Deploy-Resources.ps1",
    "setup/steps/03-Create-AppRegistration.ps1",
    "setup/steps/04-Generate-Certificate.ps1",
    "setup/steps/05-Grant-AdminConsent.ps1",
    "setup/steps/06-Upload-Runbooks.ps1",
    "setup/steps/07-Deploy-Dashboard.ps1",
    "setup/steps/08-Run-Assessment.ps1"
)

Write-Host ""
Write-Host "  Downloading setup files..." -ForegroundColor Gray

$downloadErrors = @()
foreach ($file in $filesToDownload) {
    $url       = "$RepoBaseUrl/$file"
    $localPath = Join-Path $workDir $file
    $localDir  = Split-Path $localPath -Parent

    if (-not (Test-Path $localDir)) {
        New-Item -ItemType Directory -Path $localDir -Force | Out-Null
    }

    try {
        Invoke-RestMethod -Uri $url -OutFile $localPath -ErrorAction Stop
    }
    catch {
        $downloadErrors += $file
        Write-Host "  Failed to download: $file" -ForegroundColor Red
    }
}

if ($downloadErrors.Count -gt 0) {
    Write-Host ""
    Write-Host "  ERROR: Could not download $($downloadErrors.Count) file(s)." -ForegroundColor Red
    Write-Host "  Check your network connection and verify the repository URL." -ForegroundColor Red
    Write-Host "  Repo: $RepoBaseUrl" -ForegroundColor Gray
    Write-Host ""
    Remove-WorkDir
    return
}

Write-Host "  Downloaded $($filesToDownload.Count) files." -ForegroundColor Gray

# ─────────────────────────────────────────────
#  Dot-source helpers
# ─────────────────────────────────────────────

. (Join-Path $workDir "setup/helpers/Write-StepBanner.ps1")
. (Join-Path $workDir "setup/helpers/Test-Prerequisites.ps1")

# ─────────────────────────────────────────────
#  Dot-source all step scripts
# ─────────────────────────────────────────────

Get-ChildItem (Join-Path $workDir "setup/steps") -Filter "*.ps1" |
    Sort-Object Name |
    ForEach-Object { . $_.FullName }

# ─────────────────────────────────────────────
#  Banner
# ─────────────────────────────────────────────

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    claudesharepoint — Setup Wizard"       -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "  Version $ScriptVersion | North Highland"       -ForegroundColor DarkGray
Write-Host ""

# ─────────────────────────────────────────────
#  Step 1 — Environment check
# ─────────────────────────────────────────────

$Config = @{
    RepoBaseUrl = $RepoBaseUrl
    WorkDir     = $workDir
}

try {
    $Config = Invoke-Step01_CheckEnvironment -Config $Config
}
catch {
    Write-Host ""
    Write-Host "  Setup cannot continue. Resolve the issues above and re-run." -ForegroundColor Red
    Write-Host ""
    Remove-WorkDir
    return
}

# Capture environment details from the prereq check
$prereqs = Test-Prerequisites
$Config.TenantId         = $prereqs.TenantId
$Config.User             = $prereqs.User

# ─────────────────────────────────────────────
#  Subscription selection
# ─────────────────────────────────────────────

Write-Host ""
Write-Host "  ── Select Subscription ──" -ForegroundColor Cyan
Write-Host ""

$subscriptions = Get-AzSubscription -TenantId $prereqs.TenantId -ErrorAction Stop | Where-Object { $_.State -eq 'Enabled' }

if ($subscriptions.Count -eq 0) {
    Write-Host "  No active subscriptions found in this tenant." -ForegroundColor Red
    Remove-WorkDir
    return
}
elseif ($subscriptions.Count -eq 1) {
    $selectedSub = $subscriptions[0]
    Write-Host "  Only one subscription found:" -ForegroundColor White
    Write-Host "    $($selectedSub.Name) ($($selectedSub.Id))" -ForegroundColor Cyan
    $confirm = Read-Host "  Use this subscription? [Y/n]"
    if ($confirm -match '^[nN]') {
        Write-Host "  Setup cancelled." -ForegroundColor Yellow
        Remove-WorkDir
        return
    }
}
else {
    Write-Host "  Available subscriptions:" -ForegroundColor White
    Write-Host ""
    for ($i = 0; $i -lt $subscriptions.Count; $i++) {
        $marker = if ($subscriptions[$i].Id -eq $prereqs.SubscriptionId) { " (current)" } else { "" }
        Write-Host "    [$($i + 1)] $($subscriptions[$i].Name)$marker" -ForegroundColor Cyan
        Write-Host "        $($subscriptions[$i].Id)" -ForegroundColor DarkGray
    }
    Write-Host ""

    while ($true) {
        $choice = Read-Host "  Select subscription (1-$($subscriptions.Count))"
        if ($choice -match '^\d+$' -and [int]$choice -ge 1 -and [int]$choice -le $subscriptions.Count) {
            $selectedSub = $subscriptions[[int]$choice - 1]
            break
        }
        Write-Host "  Invalid selection. Enter a number 1-$($subscriptions.Count)." -ForegroundColor Yellow
    }
}

$Config.SubscriptionId   = $selectedSub.Id
$Config.SubscriptionName = $selectedSub.Name

Write-Host ""
Write-Host "  Using: $($Config.SubscriptionName) ($($Config.SubscriptionId))" -ForegroundColor Green
Write-Host ""

# Set the active context to the selected subscription
Set-AzContext -SubscriptionId $Config.SubscriptionId -ErrorAction Stop | Out-Null

# ─────────────────────────────────────────────
#  Interactive prompts
# ─────────────────────────────────────────────

Write-Host ""
Write-Host "  ── Configuration ──" -ForegroundColor Cyan
Write-Host ""

# Client code
while ($true) {
    $clientCode = Read-Host "  Client code (2-10 chars, lowercase alphanumeric, e.g. 'contoso')"
    $clientCode = $clientCode.Trim().ToLower()

    if ($clientCode -match '^[a-z0-9]{2,10}$') {
        break
    }

    Write-Host "  Invalid. Must be 2-10 lowercase letters/numbers only." -ForegroundColor Yellow
}

# Azure region
$location = Read-Host "  Azure region [eastus]"
$location = $location.Trim().ToLower()
if ([string]::IsNullOrWhiteSpace($location)) {
    $location = "eastus"
}

# Notification email
while ($true) {
    $notificationEmail = Read-Host "  Notification email"
    $notificationEmail = $notificationEmail.Trim()

    if ($notificationEmail -match '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
        break
    }

    Write-Host "  Invalid email format. Please try again." -ForegroundColor Yellow
}

# SharePoint admin URL
while ($true) {
    $spAdminUrl = Read-Host "  SharePoint admin URL (e.g. https://contoso-admin.sharepoint.com)"
    $spAdminUrl = $spAdminUrl.Trim()

    if ($spAdminUrl -match '^https://') {
        break
    }

    Write-Host "  URL must start with https://. Please try again." -ForegroundColor Yellow
}

# Build config hashtable
$Config.ClientCode         = $clientCode
$Config.Location           = $location
$Config.NotificationEmail  = $notificationEmail
$Config.SharePointAdminUrl = $spAdminUrl
$Config.ResourceGroupName  = "rg-csp-$clientCode"

# Confirm
Write-Host ""
Write-Host "  ── Review ──" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Client code:       $clientCode"                         -ForegroundColor White
Write-Host "  Azure region:      $location"                           -ForegroundColor White
Write-Host "  Email:             $notificationEmail"                  -ForegroundColor White
Write-Host "  SP Admin URL:      $spAdminUrl"                         -ForegroundColor White
Write-Host "  Resource group:    $($Config.ResourceGroupName)"        -ForegroundColor White
Write-Host "  Subscription:      $($Config.SubscriptionName)"        -ForegroundColor White
Write-Host "  Tenant:            $($Config.TenantId)"                -ForegroundColor White
Write-Host ""

$confirm = Read-Host "  Proceed with deployment? (Y/n)"
if ($confirm -and $confirm.Trim().ToLower() -eq 'n') {
    Write-Host ""
    Write-Host "  Setup cancelled." -ForegroundColor Yellow
    Remove-WorkDir
    return
}

# ─────────────────────────────────────────────
#  Steps 2–8 — Sequential execution with retry
# ─────────────────────────────────────────────

$steps = @(
    @{ Number = 2; Name = 'Deploy Resources';        Function = 'Invoke-Step02_DeployResources' }
    @{ Number = 3; Name = 'Create App Registration';  Function = 'Invoke-Step03_CreateAppRegistration' }
    @{ Number = 4; Name = 'Generate Certificate';     Function = 'Invoke-Step04_GenerateCertificate' }
    @{ Number = 5; Name = 'Grant Admin Consent';      Function = 'Invoke-Step05_GrantAdminConsent' }
    @{ Number = 6; Name = 'Upload Runbooks';          Function = 'Invoke-Step06_UploadRunbooks' }
    @{ Number = 7; Name = 'Deploy Dashboard';         Function = 'Invoke-Step07_DeployDashboard' }
    @{ Number = 8; Name = 'Run Assessment';           Function = 'Invoke-Step08_RunAssessment' }
)

$completedSteps = @('Check Environment')

foreach ($step in $steps) {
    $success = $false

    while (-not $success) {
        try {
            $Config = & $step.Function -Config $Config
            $completedSteps += $step.Name
            $success = $true
        }
        catch {
            Write-Host ""
            Write-Host "  ERROR in Step $($step.Number) ($($step.Name)):" -ForegroundColor Red
            Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
            Write-Host ""

            $retry = Read-Host "  Retry this step? (Y/n)"
            if ($retry -and $retry.Trim().ToLower() -eq 'n') {
                Write-Host ""
                Write-Host "  ── Setup Incomplete ──" -ForegroundColor Yellow
                Write-Host ""
                Write-Host "  Completed steps:" -ForegroundColor White
                foreach ($cs in $completedSteps) {
                    Write-Host "    [done] $cs" -ForegroundColor Green
                }
                Write-Host ""
                Write-Host "  Remaining steps:" -ForegroundColor White
                $remaining = $steps | Where-Object { $_.Number -ge $step.Number }
                foreach ($rs in $remaining) {
                    Write-Host "    [skip] $($rs.Name)" -ForegroundColor Gray
                }
                Write-Host ""
                Write-Host "  To resume, re-run the installer. Existing resources will be reused." -ForegroundColor Gray
                Write-Host "  Resource group: $($Config.ResourceGroupName)" -ForegroundColor Gray
                Write-Host ""
                Remove-WorkDir
                return
            }

            Write-Host "  Retrying Step $($step.Number)..." -ForegroundColor Cyan
        }
    }
}

# ─────────────────────────────────────────────
#  Final summary
# ─────────────────────────────────────────────

# Extract results from Config (populated by step functions)
$hostname       = if ($Config.StaticWebAppHostname) { $Config.StaticWebAppHostname } else { "(pending deployment)" }
$sitesScanned   = if ($Config.AssessmentSitesScanned)   { $Config.AssessmentSitesScanned }   else { "N/A" }
$gbReclaimable  = if ($Config.AssessmentGBReclaimable)  { $Config.AssessmentGBReclaimable }  else { "N/A" }
$appId          = if ($Config.AppRegistrationId)        { $Config.AppRegistrationId }        else { "(see Azure AD)" }

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "    Setup Complete!"                              -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Dashboard:   https://$hostname"                 -ForegroundColor White
Write-Host "  Assessment:  $sitesScanned sites scanned, $gbReclaimable GB reclaimable" -ForegroundColor White
Write-Host ""
Write-Host "  Schedules enabled:" -ForegroundColor Cyan
Write-Host "    Version Cleanup    — Sunday 2:00 AM"          -ForegroundColor White
Write-Host "    Quota Manager      — Daily 6:00 AM"           -ForegroundColor White
Write-Host "    Stale Site Scan    — Monthly 1st"             -ForegroundColor White
Write-Host "    Recycle Bin Clean  — Sunday 10:00 AM"         -ForegroundColor White
Write-Host ""
Write-Host "  Resources:   $($Config.ResourceGroupName)"     -ForegroundColor White
Write-Host ""
Write-Host "  Uninstall:" -ForegroundColor Cyan
Write-Host "    Remove-AzResourceGroup -Name $($Config.ResourceGroupName) -Force" -ForegroundColor Gray
Write-Host "    az ad app delete --id $appId"                 -ForegroundColor Gray
Write-Host ""
Write-Host "  For support, contact your North Highland consultant." -ForegroundColor DarkGray
Write-Host ""

# ─────────────────────────────────────────────
#  Cleanup
# ─────────────────────────────────────────────

Remove-WorkDir
