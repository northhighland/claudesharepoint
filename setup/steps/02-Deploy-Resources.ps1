function Invoke-Step02_DeployResources {
    <#
    .SYNOPSIS
        Deploy Azure infrastructure via Bicep template.
    .DESCRIPTION
        Downloads Bicep files from the repo, creates the resource group if needed,
        and runs New-AzResourceGroupDeployment. Captures deployment outputs and
        adds them to the Config hashtable.
    .PARAMETER Config
        Hashtable with setup configuration. Returns with added keys:
        KeyVaultName, AutomationAccountName, StorageAccountName,
        StaticWebAppHostname, AutomationPrincipalId.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Config
    )

    $ErrorActionPreference = 'Stop'
    $stepNumber = 2

    Write-StepBanner -Step $stepNumber -Message 'Deploying Azure infrastructure'

    #region Download Bicep files

    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "csp-bicep-$(Get-Date -Format 'yyyyMMddHHmmss')"
    $modulesDir = Join-Path $tempDir 'modules'

    try {
        New-Item -ItemType Directory -Path $modulesDir -Force | Out-Null
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Downloading Bicep templates to $tempDir"

        $filesToDownload = @(
            @{ Remote = 'infrastructure/main.bicep';                        Local = Join-Path $tempDir 'main.bicep' }
            @{ Remote = 'infrastructure/modules/automation-account.bicep';  Local = Join-Path $modulesDir 'automation-account.bicep' }
            @{ Remote = 'infrastructure/modules/storage-account.bicep';     Local = Join-Path $modulesDir 'storage-account.bicep' }
            @{ Remote = 'infrastructure/modules/static-web-app.bicep';      Local = Join-Path $modulesDir 'static-web-app.bicep' }
        )

        foreach ($file in $filesToDownload) {
            $url = "$($Config.RepoBaseUrl)/$($file.Remote)"
            try {
                Invoke-WebRequest -Uri $url -OutFile $file.Local -UseBasicParsing -ErrorAction Stop
                Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Downloaded $($file.Remote)"
            }
            catch {
                Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Failed to download $url"
                throw "Could not download Bicep file: $url -- $_"
            }
        }
    }
    catch {
        # Clean up temp directory on download failure
        if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue }
        throw
    }

    #endregion

    #region Ensure correct subscription context

    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Setting subscription context: $($Config.SubscriptionId)"
    Set-AzContext -SubscriptionId $Config.SubscriptionId -ErrorAction Stop | Out-Null

    #endregion

    #region Create resource group if needed

    $rgName = $Config.ResourceGroupName
    $location = $Config.Location

    $rg = Get-AzResourceGroup -Name $rgName -ErrorAction SilentlyContinue
    if (-not $rg) {
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Creating resource group: $rgName ($location)"
        try {
            New-AzResourceGroup -Name $rgName -Location $location -ErrorAction Stop | Out-Null
            Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Resource group created: $rgName"
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Failed to create resource group: $_"
            throw
        }
    }
    else {
        Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Resource group exists: $rgName"
    }

    #endregion

    #region Deploy Bicep template

    $templatePath = Join-Path $tempDir 'main.bicep'
    $deploymentName = "csp-$($Config.ClientCode)-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

    $deployParams = @{
        clientCode           = $Config.ClientCode
        location             = $location
        enableStorageAccount = $true
        enableLogAnalytics   = $true
    }

    if (-not [string]::IsNullOrWhiteSpace($Config.NotificationEmail)) {
        $deployParams.alertRecipients = $Config.NotificationEmail
    }

    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Starting deployment: $deploymentName"
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Resources to create:'
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "  Key Vault:           kv-csp-$($Config.ClientCode)"
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "  Automation Account:  aa-csp-$($Config.ClientCode)"
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "  Storage Account:     stcsp$($Config.ClientCode)"
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "  Static Web App:      swa-csp-$($Config.ClientCode)"
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "  Log Analytics:       log-csp-$($Config.ClientCode)"
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'This may take 3-5 minutes...'

    try {
        $deployment = New-AzResourceGroupDeployment `
            -Name $deploymentName `
            -ResourceGroupName $rgName `
            -TemplateFile $templatePath `
            -TemplateParameterObject $deployParams `
            -ErrorAction Stop

        if ($deployment.ProvisioningState -ne 'Succeeded') {
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Deployment state: $($deployment.ProvisioningState)"
            throw "Bicep deployment did not succeed. State: $($deployment.ProvisioningState)"
        }

        Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Bicep deployment succeeded'
    }
    catch {
        Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Deployment failed: $_"
        throw
    }

    #endregion

    #region Capture outputs

    if ($deployment.Outputs) {
        $Config.KeyVaultName          = $deployment.Outputs['keyVaultName'].Value
        $Config.AutomationAccountName = $deployment.Outputs['automationAccountName'].Value
        $Config.StorageAccountName    = $deployment.Outputs['storageAccountName'].Value
        $Config.StaticWebAppHostname  = $deployment.Outputs['staticWebAppHostname'].Value
        $Config.AutomationPrincipalId = $deployment.Outputs['automationAccountPrincipalId'].Value

        Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Key Vault:          $($Config.KeyVaultName)"
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Automation Account: $($Config.AutomationAccountName)"
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Storage Account:    $($Config.StorageAccountName)"
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Static Web App:     $($Config.StaticWebAppHostname)"
    }
    else {
        Write-StepBanner -Step $stepNumber -Status 'Warn' -Message 'No deployment outputs captured. Deriving resource names from convention.'
        $Config.KeyVaultName          = "kv-csp-$($Config.ClientCode)"
        $Config.AutomationAccountName = "aa-csp-$($Config.ClientCode)"
        $Config.StorageAccountName    = "stcsp$($Config.ClientCode)"
        $Config.StaticWebAppHostname  = ''
        $Config.AutomationPrincipalId = ''
    }

    #endregion

    #region Clean up temp files

    if (Test-Path $tempDir) {
        Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Cleaned up temporary Bicep files'
    }

    #endregion

    Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Infrastructure deployment complete'

    return $Config
}
