<#
.SYNOPSIS
    Deploys claudesharepoint infrastructure to Azure.

.DESCRIPTION
    Deploys all Azure resources via Bicep:
    - Automation Account (with managed identity, schedules, variables)
    - Storage Account (Table Storage + Blob Storage)
    - Static Web App (dashboard hosting)
    - Key Vault (secrets management)
    - Log Analytics workspace (monitoring)
    - Alert rules (job failure notifications)

.PARAMETER SubscriptionId
    Azure subscription ID for deployment.

.PARAMETER ResourceGroupName
    Resource group name (created if needed).

.PARAMETER ClientCode
    Short client identifier (2-10 lowercase alphanumeric).
    Used in resource naming: {type}-csp-{clientCode}

.PARAMETER Location
    Azure region (e.g., eastus, westus2).

.PARAMETER AlertRecipients
    Email for alert notifications. Required to enable metric alerts (job failure
    notifications). If omitted, the action group and alert rules are skipped.

.PARAMETER AdminUsers
    Comma-separated list of admin email addresses for dashboard RBAC.
    Users in this list can trigger jobs, update settings, and manage stale sites.

.PARAMETER SkipPrerequisites
    Skip prerequisite validation.

.EXAMPLE
    ./deploy.ps1 -SubscriptionId "..." -ResourceGroupName "rg-csp-nh" -ClientCode "nh" -Location "eastus"
#>

#Requires -Version 7.0
#Requires -Modules Az.Accounts, Az.Resources

param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$SubscriptionId,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ResourceGroupName,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9]{2,10}$')]
    [string]$ClientCode,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Location,

    [string]$AlertRecipients,

    [string]$AdminUsers,

    [switch]$SkipPrerequisites
)

$ErrorActionPreference = 'Stop'
$startTime = Get-Date

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  claudesharepoint - Deployment" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Started: $startTime"
Write-Host "Client Code: $ClientCode"
Write-Host "Resource Group: $ResourceGroupName"
Write-Host "Location: $Location"
Write-Host ""

#region Azure Authentication

$context = Get-AzContext -ErrorAction SilentlyContinue
if (-not $context) {
    Write-Host "Connecting to Azure..." -ForegroundColor White
    Connect-AzAccount -ErrorAction Stop | Out-Null
}
else {
    Write-Host "Connected as: $($context.Account.Id)" -ForegroundColor Green
}

Set-AzContext -SubscriptionId $SubscriptionId -ErrorAction Stop | Out-Null
Write-Host "Subscription: $SubscriptionId" -ForegroundColor Green

#endregion

#region Prerequisites

if (-not $SkipPrerequisites) {
    Write-Host ""
    Write-Host "=== Validating Prerequisites ===" -ForegroundColor Cyan

    $requiredProviders = @(
        'Microsoft.Automation',
        'Microsoft.KeyVault',
        'Microsoft.Storage',
        'Microsoft.Web',
        'Microsoft.OperationalInsights',
        'Microsoft.Insights'
    )

    foreach ($provider in $requiredProviders) {
        $status = (Get-AzResourceProvider -ProviderNamespace $provider -ErrorAction SilentlyContinue).RegistrationState | Select-Object -First 1
        if ($status -ne 'Registered') {
            Write-Host "  Registering: $provider" -ForegroundColor Yellow
            Register-AzResourceProvider -ProviderNamespace $provider | Out-Null
        }
        else {
            Write-Host "  [OK] $provider" -ForegroundColor Green
        }
    }

    $templatePath = Join-Path $PSScriptRoot 'main.bicep'
    if (-not (Test-Path $templatePath)) {
        throw "Bicep template not found: $templatePath"
    }
    Write-Host "  [OK] Bicep template found" -ForegroundColor Green
}

#endregion

#region Resource Group

Write-Host ""
Write-Host "=== Resource Group ===" -ForegroundColor Cyan

$rg = Get-AzResourceGroup -Name $ResourceGroupName -ErrorAction SilentlyContinue
if (-not $rg) {
    Write-Host "Creating resource group: $ResourceGroupName" -ForegroundColor White
    New-AzResourceGroup -Name $ResourceGroupName -Location $Location -ErrorAction Stop | Out-Null
    Write-Host "  [OK] Created" -ForegroundColor Green
}
else {
    Write-Host "  [OK] Exists" -ForegroundColor Green
}

#endregion

#region Deployment

Write-Host ""
Write-Host "=== Infrastructure Deployment ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Resources to create:" -ForegroundColor White
Write-Host "  Automation Account:  aa-csp-$ClientCode"
Write-Host "  Key Vault:           kv-csp-$ClientCode"
Write-Host "  Storage Account:     stcsp$ClientCode"
Write-Host "  Static Web App:      swa-csp-$ClientCode"
Write-Host "  Log Analytics:       log-csp-$ClientCode"
if ($AlertRecipients) {
    Write-Host "  Action Group:        ag-csp-$ClientCode"
    Write-Host "  Alert Recipients:    $AlertRecipients"
}
if ($AdminUsers) {
    Write-Host "  Admin Users:         $AdminUsers"
}
Write-Host ""

$templatePath = Join-Path $PSScriptRoot 'main.bicep'
$deploymentName = "csp-$ClientCode-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

$deployParams = @{
    clientCode         = $ClientCode
    location           = $Location
    enableStorageAccount = $true
    enableLogAnalytics = $true
}

if ($AlertRecipients) {
    $deployParams.alertRecipients = $AlertRecipients
}
if ($AdminUsers) {
    $deployParams.adminUsers = $AdminUsers
}

Write-Host "Deploying (this may take 3-5 minutes)..." -ForegroundColor White

$deployment = New-AzResourceGroupDeployment `
    -Name $deploymentName `
    -ResourceGroupName $ResourceGroupName `
    -TemplateFile $templatePath `
    -TemplateParameterObject $deployParams `
    -ErrorAction Stop

if ($deployment.ProvisioningState -ne 'Succeeded') {
    throw "Deployment failed: $($deployment.ProvisioningState)"
}

Write-Host "  [OK] Deployment succeeded" -ForegroundColor Green

#endregion

#region Validation

Write-Host ""
Write-Host "=== Post-Deployment Validation ===" -ForegroundColor Cyan

$resources = @(
    @{ Type = 'Automation Account'; Name = "aa-csp-$ClientCode" }
    @{ Type = 'Key Vault'; Name = "kv-csp-$ClientCode" }
    @{ Type = 'Storage Account'; Name = "stcsp$ClientCode" }
)

foreach ($r in $resources) {
    $found = Get-AzResource -Name $r.Name -ResourceGroupName $ResourceGroupName -ErrorAction SilentlyContinue
    if ($found) {
        Write-Host "  [OK] $($r.Type): $($r.Name)" -ForegroundColor Green
    }
    else {
        Write-Host "  [FAIL] $($r.Type): $($r.Name)" -ForegroundColor Red
    }
}

#endregion

#region Summary

$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Deployment Complete" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Duration: $([math]::Round($duration.TotalMinutes, 1)) minutes"
Write-Host ""

if ($deployment.Outputs) {
    Write-Host "Outputs:" -ForegroundColor Cyan
    foreach ($key in $deployment.Outputs.Keys) {
        Write-Host "  ${key}: $($deployment.Outputs[$key].Value)"
    }
}

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Upload SharePoint certificate to Key Vault:"
Write-Host "     az keyvault certificate import --vault-name kv-csp-$ClientCode --name sharepoint-cert --file cert.pfx"
Write-Host ""
Write-Host "  2. Set SharePoint secrets:"
Write-Host "     az keyvault secret set --vault-name kv-csp-$ClientCode --name SPClientId --value 'your-client-id'"
Write-Host "     az keyvault secret set --vault-name kv-csp-$ClientCode --name SPTenantId --value 'your-tenant-id'"
Write-Host "     az keyvault secret set --vault-name kv-csp-$ClientCode --name SPAdminUrl --value 'https://northhighland-admin.sharepoint.com'"
Write-Host ""
Write-Host "  3. Import runbooks to Automation Account"
Write-Host "  4. Deploy dashboard to Static Web App"
Write-Host ""

#endregion
