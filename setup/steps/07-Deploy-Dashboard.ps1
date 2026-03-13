function Invoke-Step07_DeployDashboard {
    <#
    .SYNOPSIS
        Build and deploy the monitoring dashboard to Azure Static Web App.
    .DESCRIPTION
        Downloads a pre-built dashboard artifact from GitHub releases, or falls back
        to building from source. Deploys to the Static Web App, configures app settings,
        and enables Azure AD authentication.
    .PARAMETER Config
        Hashtable with setup configuration. Requires ResourceGroupName, RepoBaseUrl,
        SubscriptionId, AutomationAccountName, StorageAccountName, StaticWebAppHostname.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Config
    )

    $ErrorActionPreference = 'Stop'
    $stepNumber = 7

    Write-StepBanner -Step $stepNumber -Message 'Deploying monitoring dashboard'

    # ── Validate required config ──────────────────────────────────────────
    $requiredKeys = @('ResourceGroupName', 'RepoBaseUrl', 'SubscriptionId',
                      'AutomationAccountName', 'StorageAccountName', 'StaticWebAppHostname')
    foreach ($key in $requiredKeys) {
        if ([string]::IsNullOrWhiteSpace($Config[$key])) {
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Missing required config: $key"
            throw "Config.$key is required for dashboard deployment."
        }
    }

    $rg             = $Config.ResourceGroupName
    $swaName        = $Config.StaticWebAppHostname -replace '\..*$', ''  # Extract app name from hostname
    $tempDir        = Join-Path ([System.IO.Path]::GetTempPath()) "spaceagent-dashboard-$(Get-Date -Format 'yyyyMMddHHmmss')"
    $buildOutputDir = $null

    # Try to resolve the SWA name from hostname; fall back to convention
    if ($Config.ContainsKey('StaticWebAppName') -and -not [string]::IsNullOrWhiteSpace($Config.StaticWebAppName)) {
        $swaName = $Config.StaticWebAppName
    }
    else {
        # Discover the SWA in the resource group
        try {
            $swa = Get-AzStaticWebApp -ResourceGroupName $rg -ErrorAction Stop | Select-Object -First 1
            $swaName = $swa.Name
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Could not auto-detect Static Web App name: $_"
            throw "Cannot determine Static Web App name. Ensure Step 2 completed successfully."
        }
    }

    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    try {
        # ── Attempt 1: Download pre-built artifact ────────────────────────
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Checking for pre-built dashboard artifact...'

        $releaseUrl = ($Config.RepoBaseUrl -replace '/main/.*$', '') + '/releases/latest/download/dashboard-build.zip'
        $artifactZip = Join-Path $tempDir 'dashboard-build.zip'
        $preBuiltAvailable = $false

        try {
            Invoke-WebRequest -Uri $releaseUrl -OutFile $artifactZip -UseBasicParsing -ErrorAction Stop
            $preBuiltAvailable = $true
            Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Pre-built artifact downloaded'
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'No pre-built artifact available. Will build from source.'
        }

        if ($preBuiltAvailable) {
            $buildOutputDir = Join-Path $tempDir 'out'
            Expand-Archive -Path $artifactZip -DestinationPath $buildOutputDir -Force
        }
        else {
            # ── Attempt 2: Build from source ──────────────────────────────
            Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Downloading dashboard source files...'

            $dashboardSourceUrl = "$($Config.RepoBaseUrl)/dashboard"
            $dashboardDir = Join-Path $tempDir 'dashboard'
            New-Item -ItemType Directory -Path $dashboardDir -Force | Out-Null

            # Download package.json to determine dependencies
            $sourceFiles = @('package.json', 'package-lock.json', 'next.config.js', 'tsconfig.json')
            foreach ($file in $sourceFiles) {
                try {
                    Invoke-WebRequest -Uri "$dashboardSourceUrl/$file" -OutFile (Join-Path $dashboardDir $file) `
                        -UseBasicParsing -ErrorAction Stop
                }
                catch {
                    # Some files may not exist (e.g., next.config.js might be .mjs)
                    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Optional file not found: $file"
                }
            }

            # Download source directories
            foreach ($dir in @('src', 'public', 'api', 'app', 'pages', 'components', 'lib', 'styles')) {
                try {
                    # Download directory listing (GitHub API)
                    $repoApiBase = $Config.RepoBaseUrl -replace 'raw.githubusercontent.com/([^/]+)/([^/]+)/([^/]+)/(.*)', 'api.github.com/repos/$1/$2/contents/$4'
                    $dirApiUrl = "$repoApiBase/dashboard/$dir`?ref=main"
                    $dirContents = Invoke-RestMethod -Uri $dirApiUrl -UseBasicParsing -ErrorAction Stop

                    $localDir = Join-Path $dashboardDir $dir
                    New-Item -ItemType Directory -Path $localDir -Force | Out-Null

                    foreach ($item in $dirContents) {
                        if ($item.type -eq 'file') {
                            Invoke-WebRequest -Uri $item.download_url -OutFile (Join-Path $localDir $item.name) `
                                -UseBasicParsing -ErrorAction Stop
                        }
                    }
                }
                catch {
                    # Directory may not exist in this project structure
                }
            }

            # Check npm availability
            $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
            if (-not $npmCmd) {
                Write-StepBanner -Step $stepNumber -Status 'Fail' -Message 'npm is not available. Cannot build dashboard from source.'
                throw 'npm is required to build the dashboard. Use a pre-built artifact or install Node.js.'
            }

            Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Installing dependencies and building dashboard...'

            $prevLocation = Get-Location
            try {
                Set-Location $dashboardDir
                & npm install --production=false 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }

                & npm run build 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) { throw "npm run build failed with exit code $LASTEXITCODE" }
            }
            finally {
                Set-Location $prevLocation
            }

            # Determine build output (Next.js uses 'out' for static export, or '.next' for SSR)
            $buildOutputDir = Join-Path $dashboardDir 'out'
            if (-not (Test-Path $buildOutputDir)) {
                $buildOutputDir = Join-Path $dashboardDir 'build'
            }
            if (-not (Test-Path $buildOutputDir)) {
                Write-StepBanner -Step $stepNumber -Status 'Fail' -Message 'Build output directory not found (expected ./out or ./build).'
                throw 'Dashboard build did not produce expected output directory.'
            }

            Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Dashboard built from source'
        }

        # ── Deploy to Static Web App ─────────────────────────────────────
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Deploying to Static Web App: $swaName"

        # Get deployment token
        $deployToken = (Get-AzStaticWebAppSecret -ResourceGroupName $rg -Name $swaName -ErrorAction Stop).Properties.ApiKey

        if ([string]::IsNullOrWhiteSpace($deployToken)) {
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message 'Could not retrieve Static Web App deployment token.'
            throw 'Deployment token is required. Check Static Web App exists and permissions are correct.'
        }

        # Check for api directory
        $apiLocation = Join-Path $buildOutputDir '..' 'api'
        $apiArg = if (Test-Path $apiLocation) { "--api-location `"$apiLocation`"" } else { '' }

        # Deploy using SWA CLI if available, otherwise use az staticwebapp
        try {
            $swaCliResult = az staticwebapp deploy `
                --name $swaName `
                --resource-group $rg `
                --app-location $buildOutputDir `
                --output-location '' `
                --deployment-token $deployToken 2>&1

            if ($LASTEXITCODE -ne 0) {
                throw "az staticwebapp deploy failed: $swaCliResult"
            }

            Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Dashboard deployed to Static Web App'
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Deployment failed: $_"
            throw
        }

        # ── Configure app settings ───────────────────────────────────────
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Configuring app settings...'

        try {
            # Get storage account connection string
            $storageKeys = Get-AzStorageAccountKey -ResourceGroupName $rg -Name $Config.StorageAccountName -ErrorAction Stop
            $storageConnStr = "DefaultEndpointsProtocol=https;AccountName=$($Config.StorageAccountName);AccountKey=$($storageKeys[0].Value);EndpointSuffix=core.windows.net"

            $appSettings = @{
                'AZURE_STORAGE_CONNECTION_STRING' = $storageConnStr
                'AZURE_SUBSCRIPTION_ID'           = $Config.SubscriptionId
                'AZURE_RESOURCE_GROUP'            = $rg
                'AZURE_AUTOMATION_ACCOUNT'        = $Config.AutomationAccountName
            }

            # Set each app setting
            foreach ($settingName in $appSettings.Keys) {
                az staticwebapp appsettings set `
                    --name $swaName `
                    --resource-group $rg `
                    --setting-names "$settingName=$($appSettings[$settingName])" 2>&1 | Out-Null

                if ($LASTEXITCODE -ne 0) {
                    Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Failed to set app setting: $settingName"
                }
            }

            Write-StepBanner -Step $stepNumber -Status 'Success' -Message "App settings configured ($($appSettings.Count) settings)"
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "App settings configuration failed: $_"
            Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'App settings can be configured manually in the Azure portal.'
        }

        # ── Configure Azure AD authentication ────────────────────────────
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Configuring Azure AD authentication...'

        try {
            if (-not [string]::IsNullOrWhiteSpace($Config.AppId) -and -not [string]::IsNullOrWhiteSpace($Config.TenantId)) {
                az staticwebapp auth update `
                    --name $swaName `
                    --resource-group $rg `
                    --set "identityProviders.azureActiveDirectory.registration.clientIdSettingName=AZURE_CLIENT_ID" `
                    --set "identityProviders.azureActiveDirectory.registration.openIdIssuer=https://login.microsoftonline.com/$($Config.TenantId)/v2.0" 2>&1 | Out-Null

                # Set the client ID as an app setting for the auth config
                az staticwebapp appsettings set `
                    --name $swaName `
                    --resource-group $rg `
                    --setting-names "AZURE_CLIENT_ID=$($Config.AppId)" 2>&1 | Out-Null

                Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Azure AD authentication configured'
            }
            else {
                Write-StepBanner -Step $stepNumber -Status 'Warn' -Message 'AppId or TenantId not available. Skipping Azure AD auth configuration.'
            }
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Azure AD auth configuration failed: $_"
            Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Authentication can be configured manually in the Azure portal.'
        }

        # ── Get dashboard URL ────────────────────────────────────────────
        $dashboardUrl = "https://$($Config.StaticWebAppHostname)"

        try {
            $swaDetails = Get-AzStaticWebApp -ResourceGroupName $rg -Name $swaName -ErrorAction Stop
            if ($swaDetails.DefaultHostname) {
                $dashboardUrl = "https://$($swaDetails.DefaultHostname)"
            }
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Using configured hostname for dashboard URL."
        }

        $Config['DashboardUrl'] = $dashboardUrl

        Write-Host ''
        Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Dashboard URL: $dashboardUrl"
        Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Dashboard deployment complete'
    }
    finally {
        # ── Cleanup temp directory ────────────────────────────────────────
        if (Test-Path $tempDir) {
            Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    return $Config
}
