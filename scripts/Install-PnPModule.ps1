<#
.SYNOPSIS
    Installs PnP.PowerShell as a PowerShell 7.2 module in Azure Automation via REST API.

.DESCRIPTION
    Fallback script for installing PnP.PowerShell when the Bicep powershell72Modules
    resource type fails (e.g., PSGallery redirect issues). Uses the Azure REST API
    directly to install the module into the PS 7.2 runtime.

.PARAMETER ResourceGroupName
    Resource group containing the Automation Account.

.PARAMETER AutomationAccountName
    Name of the Automation Account.

.PARAMETER ModuleVersion
    PnP.PowerShell version to install. Default: latest.

.EXAMPLE
    ./Install-PnPModule.ps1 -ResourceGroupName "rg-csp-nh" -AutomationAccountName "aa-csp-nh"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupName,

    [Parameter(Mandatory = $true)]
    [string]$AutomationAccountName,

    [string]$ModuleVersion = ''
)

$ErrorActionPreference = 'Stop'

# Ensure we have an Azure context
$context = Get-AzContext
if (-not $context) {
    Write-Host "Not logged in to Azure. Run Connect-AzAccount first." -ForegroundColor Red
    exit 1
}

$subscriptionId = $context.Subscription.Id
Write-Host "Subscription: $subscriptionId"
Write-Host "Resource Group: $ResourceGroupName"
Write-Host "Automation Account: $AutomationAccountName"

# Build the PSGallery package URI
$packageUri = "https://www.powershellgallery.com/api/v2/package/PnP.PowerShell"
if ($ModuleVersion) {
    $packageUri = "$packageUri/$ModuleVersion"
}

Write-Host "Package URI: $packageUri"

# Get access token for ARM
$token = (Get-AzAccessToken -ResourceUrl "https://management.azure.com").Token

# Install as PowerShell 7.2 module via REST API
$apiVersion = "2023-11-01"
$uri = "https://management.azure.com/subscriptions/$subscriptionId/resourceGroups/$ResourceGroupName/providers/Microsoft.Automation/automationAccounts/$AutomationAccountName/powershell72Modules/PnP.PowerShell?api-version=$apiVersion"

$body = @{
    properties = @{
        contentLink = @{
            uri = $packageUri
        }
    }
} | ConvertTo-Json -Depth 5

$headers = @{
    Authorization  = "Bearer $token"
    "Content-Type" = "application/json"
}

Write-Host ""
Write-Host "Installing PnP.PowerShell as PS 7.2 module..."

$response = Invoke-RestMethod -Uri $uri -Method Put -Headers $headers -Body $body
Write-Host "Response: $($response.properties.provisioningState)"

# Poll for completion
$maxWait = 300  # 5 minutes
$elapsed = 0
$pollInterval = 10

while ($elapsed -lt $maxWait) {
    Start-Sleep -Seconds $pollInterval
    $elapsed += $pollInterval

    $status = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers
    $state = $status.properties.provisioningState

    Write-Host "  [$elapsed`s] Provisioning state: $state"

    if ($state -eq "Succeeded") {
        Write-Host ""
        Write-Host "PnP.PowerShell installed successfully!" -ForegroundColor Green
        exit 0
    }
    elseif ($state -in @("Failed", "Cancelled")) {
        Write-Host ""
        Write-Host "Module installation failed: $state" -ForegroundColor Red
        if ($status.properties.error) {
            Write-Host "Error: $($status.properties.error | ConvertTo-Json -Depth 3)" -ForegroundColor Red
        }
        exit 1
    }
}

Write-Host ""
Write-Host "Timed out waiting for module installation after ${maxWait}s" -ForegroundColor Yellow
Write-Host "Check the Automation Account modules page in Azure Portal" -ForegroundColor Yellow
