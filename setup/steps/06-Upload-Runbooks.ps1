function Invoke-Step06_UploadRunbooks {
    <#
    .SYNOPSIS
        Download and import runbooks, module, variables, and schedule links into the Automation Account.
    .DESCRIPTION
        Downloads runbook source files from the repo, packages the SpaceAgent module,
        imports runbooks as PowerShell 7.2, publishes them, sets Automation Variables,
        and links schedules to the orchestrator.
    .PARAMETER Config
        Hashtable with setup configuration. Requires RepoBaseUrl, ResourceGroupName,
        AutomationAccountName, KeyVaultName, StorageAccountName, NotificationEmail.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Config
    )

    $ErrorActionPreference = 'Stop'
    $stepNumber = 6

    Write-StepBanner -Step $stepNumber -Message 'Uploading runbooks and configuring Automation Account'

    # ── Validate required config ──────────────────────────────────────────
    $requiredKeys = @('RepoBaseUrl', 'ResourceGroupName', 'AutomationAccountName',
                      'KeyVaultName', 'StorageAccountName', 'NotificationEmail')
    foreach ($key in $requiredKeys) {
        if ([string]::IsNullOrWhiteSpace($Config[$key])) {
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Missing required config: $key"
            throw "Config.$key is required for runbook upload."
        }
    }

    $rg      = $Config.ResourceGroupName
    $aaName  = $Config.AutomationAccountName
    $baseUrl = $Config.RepoBaseUrl

    # ── Define source files ───────────────────────────────────────────────
    $moduleFile = @{
        RelativePath = 'runbooks/modules/SpaceAgent.psm1'
        ModuleName   = 'SpaceAgent'
    }

    $runbookFiles = @(
        @{ RelativePath = 'runbooks/Invoke-Orchestrator.ps1';       Name = 'Invoke-Orchestrator'       },
        @{ RelativePath = 'runbooks/Invoke-VersionCleanup.ps1';     Name = 'Invoke-VersionCleanup'     },
        @{ RelativePath = 'runbooks/Invoke-QuotaManager.ps1';       Name = 'Invoke-QuotaManager'       },
        @{ RelativePath = 'runbooks/Invoke-StaleSiteDetector.ps1';  Name = 'Invoke-StaleSiteDetector'  },
        @{ RelativePath = 'runbooks/Invoke-RecycleBinCleaner.ps1';  Name = 'Invoke-RecycleBinCleaner'  }
    )

    $configFileRelativePath = 'runbooks/config/defaults.json'

    # ── Create temp working directory ─────────────────────────────────────
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "spaceagent-runbooks-$(Get-Date -Format 'yyyyMMddHHmmss')"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    try {
        # ── Download files ────────────────────────────────────────────────
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Downloading runbook files from repository...'

        $allFiles = @($moduleFile.RelativePath) + ($runbookFiles | ForEach-Object { $_.RelativePath }) + @($configFileRelativePath)

        foreach ($relativePath in $allFiles) {
            $sourceUrl  = "$baseUrl/$relativePath"
            $localDir   = Join-Path $tempDir (Split-Path $relativePath -Parent)
            $localPath  = Join-Path $tempDir $relativePath

            if (-not (Test-Path $localDir)) {
                New-Item -ItemType Directory -Path $localDir -Force | Out-Null
            }

            try {
                Invoke-WebRequest -Uri $sourceUrl -OutFile $localPath -UseBasicParsing -ErrorAction Stop
            }
            catch {
                Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Failed to download: $relativePath"
                throw "Could not download $sourceUrl : $_"
            }
        }

        $downloadCount = $allFiles.Count
        Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Downloaded $downloadCount files"

        # ── Package and import the SpaceAgent module ──────────────────────
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Packaging SpaceAgent module...'

        $moduleSrcPath = Join-Path $tempDir $moduleFile.RelativePath
        $moduleZipDir  = Join-Path $tempDir 'module-package' 'SpaceAgent'
        $moduleZipPath = Join-Path $tempDir 'SpaceAgent.zip'

        New-Item -ItemType Directory -Path $moduleZipDir -Force | Out-Null
        Copy-Item -Path $moduleSrcPath -Destination (Join-Path $moduleZipDir 'SpaceAgent.psm1') -Force

        # Create a minimal module manifest for import
        $manifestPath = Join-Path $moduleZipDir 'SpaceAgent.psd1'
        $manifestContent = @"
@{
    RootModule        = 'SpaceAgent.psm1'
    ModuleVersion     = '1.0.0'
    GUID              = '$(New-Guid)'
    Author            = 'SharePoint Space Agent'
    Description       = 'Shared module for SharePoint Space Agent runbooks'
    PowerShellVersion = '7.2'
}
"@
        Set-Content -Path $manifestPath -Value $manifestContent -Encoding utf8

        Compress-Archive -Path (Join-Path $tempDir 'module-package' 'SpaceAgent') -DestinationPath $moduleZipPath -Force

        # Upload module to a temporary blob so New-AzAutomationModule can reference it
        # Alternative: use -ContentLinkUri with a SAS token, or upload directly
        try {
            # Check if module already exists (idempotent)
            $existingModule = Get-AzAutomationModule -ResourceGroupName $rg -AutomationAccountName $aaName -Name 'SpaceAgent' -ErrorAction SilentlyContinue

            if ($existingModule -and $existingModule.ProvisioningState -eq 'Succeeded') {
                Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'SpaceAgent module already exists, updating...'
            }

            # Upload the zip to blob storage and get a SAS URL for the module import
            $storageAccount = Get-AzStorageAccount -ResourceGroupName $rg -Name $Config.StorageAccountName
            $storageCtx     = $storageAccount.Context

            # Ensure container exists
            $containerName = 'automation-modules'
            $container = Get-AzStorageContainer -Name $containerName -Context $storageCtx -ErrorAction SilentlyContinue
            if (-not $container) {
                New-AzStorageContainer -Name $containerName -Context $storageCtx -Permission Off | Out-Null
            }

            # Upload zip
            Set-AzStorageBlobContent -File $moduleZipPath -Container $containerName -Blob 'SpaceAgent.zip' `
                -Context $storageCtx -Force | Out-Null

            # Generate SAS token (valid 1 hour)
            $sasToken = New-AzStorageBlobSASToken -Container $containerName -Blob 'SpaceAgent.zip' `
                -Context $storageCtx -Permission 'r' -ExpiryTime (Get-Date).AddHours(1) -FullUri

            New-AzAutomationModule -ResourceGroupName $rg -AutomationAccountName $aaName `
                -Name 'SpaceAgent' -ContentLinkUri $sasToken -ErrorAction Stop | Out-Null

            Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'SpaceAgent module imported'
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Module import failed: $_"
            throw
        }

        # ── Import and publish runbooks ───────────────────────────────────
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Importing runbooks...'

        $importedCount = 0
        foreach ($rb in $runbookFiles) {
            $rbPath = Join-Path $tempDir $rb.RelativePath
            $rbName = $rb.Name

            try {
                # Check if runbook already exists (idempotent)
                $existing = Get-AzAutomationRunbook -ResourceGroupName $rg -AutomationAccountName $aaName `
                    -Name $rbName -ErrorAction SilentlyContinue

                Import-AzAutomationRunbook -ResourceGroupName $rg -AutomationAccountName $aaName `
                    -Name $rbName -Path $rbPath -Type PowerShell72 -Force -ErrorAction Stop | Out-Null

                Publish-AzAutomationRunbook -ResourceGroupName $rg -AutomationAccountName $aaName `
                    -Name $rbName -ErrorAction Stop | Out-Null

                $importedCount++
                Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Imported: $rbName"
            }
            catch {
                Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Failed to import $rbName : $_"
                throw
            }
        }

        # ── Upload defaults.json as Automation Variable ───────────────────
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Uploading configuration defaults...'

        try {
            $defaultsJson = Get-Content -Path (Join-Path $tempDir $configFileRelativePath) -Raw
            Set-AutomationVariable -Name 'DefaultsConfig' -Value $defaultsJson -ResourceGroupName $rg `
                -AutomationAccountName $aaName
        }
        catch {
            # Fallback: use Az cmdlet directly
            try {
                $defaultsJson = Get-Content -Path (Join-Path $tempDir $configFileRelativePath) -Raw

                $existingVar = Get-AzAutomationVariable -ResourceGroupName $rg -AutomationAccountName $aaName `
                    -Name 'DefaultsConfig' -ErrorAction SilentlyContinue

                if ($existingVar) {
                    Set-AzAutomationVariable -ResourceGroupName $rg -AutomationAccountName $aaName `
                        -Name 'DefaultsConfig' -Value $defaultsJson -Encrypted $false | Out-Null
                }
                else {
                    New-AzAutomationVariable -ResourceGroupName $rg -AutomationAccountName $aaName `
                        -Name 'DefaultsConfig' -Value $defaultsJson -Encrypted $false | Out-Null
                }
            }
            catch {
                Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Could not upload defaults.json as variable: $_"
            }
        }

        # ── Set Automation Variables ──────────────────────────────────────
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Setting Automation Account variables...'

        $variables = @{
            'KeyVaultName'       = $Config.KeyVaultName
            'StorageAccountName' = $Config.StorageAccountName
            'TeamsWebhookUrl'    = ''
            'NotificationEmail'  = $Config.NotificationEmail
        }

        foreach ($varName in $variables.Keys) {
            try {
                $existing = Get-AzAutomationVariable -ResourceGroupName $rg -AutomationAccountName $aaName `
                    -Name $varName -ErrorAction SilentlyContinue

                if ($existing) {
                    Set-AzAutomationVariable -ResourceGroupName $rg -AutomationAccountName $aaName `
                        -Name $varName -Value $variables[$varName] -Encrypted $false | Out-Null
                }
                else {
                    New-AzAutomationVariable -ResourceGroupName $rg -AutomationAccountName $aaName `
                        -Name $varName -Value $variables[$varName] -Encrypted $false | Out-Null
                }

                Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Variable set: $varName"
            }
            catch {
                Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Failed to set variable $varName : $_"
                throw
            }
        }

        # ── Link schedules to orchestrator ────────────────────────────────
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Linking schedules to Invoke-Orchestrator...'

        $scheduleLinks = @(
            @{ ScheduleName = 'VersionCleanup-Weekly';     JobType = 'VersionCleanup'     },
            @{ ScheduleName = 'QuotaManager-Daily';        JobType = 'QuotaManager'       },
            @{ ScheduleName = 'StaleSiteDetector-Monthly';  JobType = 'StaleSiteDetector'  },
            @{ ScheduleName = 'RecycleBinCleaner-Weekly';  JobType = 'RecycleBinCleaner'  }
        )

        $linkedCount = 0
        foreach ($link in $scheduleLinks) {
            try {
                # Verify the schedule exists
                $schedule = Get-AzAutomationSchedule -ResourceGroupName $rg -AutomationAccountName $aaName `
                    -Name $link.ScheduleName -ErrorAction SilentlyContinue

                if (-not $schedule) {
                    Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Schedule '$($link.ScheduleName)' not found. Skipping link."
                    continue
                }

                # Check for existing link (idempotent)
                $existingLink = Get-AzAutomationScheduledRunbook -ResourceGroupName $rg -AutomationAccountName $aaName `
                    -RunbookName 'Invoke-Orchestrator' -ScheduleName $link.ScheduleName -ErrorAction SilentlyContinue

                if ($existingLink) {
                    # Remove existing link to re-create with correct parameters
                    Unregister-AzAutomationScheduledRunbook -ResourceGroupName $rg -AutomationAccountName $aaName `
                        -RunbookName 'Invoke-Orchestrator' -ScheduleName $link.ScheduleName -Force -ErrorAction SilentlyContinue
                }

                $runbookParams = @{ JobType = $link.JobType }

                Register-AzAutomationScheduledRunbook -ResourceGroupName $rg -AutomationAccountName $aaName `
                    -RunbookName 'Invoke-Orchestrator' -ScheduleName $link.ScheduleName `
                    -Parameters $runbookParams -ErrorAction Stop | Out-Null

                $linkedCount++
                Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Linked: $($link.ScheduleName) -> Invoke-Orchestrator -JobType $($link.JobType)"
            }
            catch {
                Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Failed to link schedule '$($link.ScheduleName)': $_"
                # Non-fatal: schedules can be linked manually
            }
        }

        # ── Summary ──────────────────────────────────────────────────────
        Write-Host ''
        Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Runbooks uploaded: $importedCount / $($runbookFiles.Count)"
        Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Schedules linked:  $linkedCount / $($scheduleLinks.Count)"
        Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Runbook upload step complete'
    }
    finally {
        # ── Cleanup temp directory ────────────────────────────────────────
        if (Test-Path $tempDir) {
            Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    return $Config
}
