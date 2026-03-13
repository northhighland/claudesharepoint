function Invoke-Step04_GenerateCertificate {
    <#
    .SYNOPSIS
        Generate a self-signed certificate and configure it for app authentication.
    .DESCRIPTION
        Uses openssl (available in Azure Cloud Shell) to generate a self-signed
        certificate, uploads the PFX to Key Vault, attaches the public key to
        the app registration, and stores SharePoint connection secrets in Key Vault.
    .PARAMETER Config
        Hashtable with setup configuration. Requires: AppId, TenantId,
        SharePointAdminUrl, KeyVaultName, ClientCode. Returned unchanged.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Config
    )

    $ErrorActionPreference = 'Stop'
    $stepNumber = 4

    Write-StepBanner -Step $stepNumber -Message 'Generating certificate and configuring secrets'

    #region Validate required Config keys

    $requiredKeys = @('AppId', 'TenantId', 'SharePointAdminUrl', 'KeyVaultName', 'ClientCode')
    foreach ($key in $requiredKeys) {
        if ([string]::IsNullOrWhiteSpace($Config[$key])) {
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Missing required Config key: $key"
            throw "Config.$key is required but not set."
        }
    }

    #endregion

    #region Generate certificate with openssl

    $certDir = Join-Path ([System.IO.Path]::GetTempPath()) "csp-cert-$(Get-Date -Format 'yyyyMMddHHmmss')"
    New-Item -ItemType Directory -Path $certDir -Force | Out-Null

    $keyPath  = Join-Path $certDir 'spaceagent.key'
    $certPath = Join-Path $certDir 'spaceagent.pem'
    $pfxPath  = Join-Path $certDir 'spaceagent.pfx'

    $subject = "CN=SpaceAgent-$($Config.ClientCode)"

    # Generate a random PFX password
    $pfxPasswordPlain = [System.Guid]::NewGuid().ToString('N').Substring(0, 24)
    $pfxPassword = $pfxPasswordPlain

    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Generating self-signed certificate: $subject"
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Validity: 730 days (2 years)'

    try {
        # Generate private key and self-signed certificate
        $opensslGenResult = & openssl req `
            -x509 `
            -newkey rsa:2048 `
            -keyout $keyPath `
            -out $certPath `
            -days 730 `
            -nodes `
            -subj "/CN=SpaceAgent-$($Config.ClientCode)" `
            2>&1

        if ($LASTEXITCODE -ne 0) {
            throw "openssl req failed: $opensslGenResult"
        }
        Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Certificate and private key generated'

        # Convert to PFX
        $opensslPfxResult = & openssl pkcs12 `
            -export `
            -out $pfxPath `
            -inkey $keyPath `
            -in $certPath `
            -password "pass:$pfxPassword" `
            2>&1

        if ($LASTEXITCODE -ne 0) {
            throw "openssl pkcs12 failed: $opensslPfxResult"
        }
        Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'PFX file created'
    }
    catch {
        Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Certificate generation failed: $_"
        if (Test-Path $certDir) { Remove-Item -Recurse -Force $certDir -ErrorAction SilentlyContinue }
        throw
    }

    #endregion

    #region Upload PFX to Key Vault

    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Uploading certificate to Key Vault: $($Config.KeyVaultName)"

    try {
        az keyvault certificate import `
            --vault-name $Config.KeyVaultName `
            --name 'sharepoint-cert' `
            --file $pfxPath `
            --password $pfxPassword `
            --only-show-errors 2>&1 | Out-Null

        Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Certificate uploaded to Key Vault as "sharepoint-cert"'
    }
    catch {
        Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Failed to upload certificate to Key Vault: $_"
        if (Test-Path $certDir) { Remove-Item -Recurse -Force $certDir -ErrorAction SilentlyContinue }
        throw
    }

    #endregion

    #region Attach public key to app registration

    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Attaching certificate to app registration'

    try {
        az ad app credential reset `
            --id $Config.AppId `
            --cert "@$certPath" `
            --append `
            --only-show-errors 2>&1 | Out-Null

        Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Certificate attached to app registration'
    }
    catch {
        Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Failed to attach certificate to app: $_"
        if (Test-Path $certDir) { Remove-Item -Recurse -Force $certDir -ErrorAction SilentlyContinue }
        throw
    }

    #endregion

    #region Store SharePoint secrets in Key Vault

    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Storing SharePoint connection secrets in Key Vault'

    $secrets = @(
        @{ Name = 'SPClientId'; Value = $Config.AppId }
        @{ Name = 'SPTenantId'; Value = $Config.TenantId }
        @{ Name = 'SPAdminUrl'; Value = $Config.SharePointAdminUrl }
    )

    foreach ($secret in $secrets) {
        try {
            az keyvault secret set `
                --vault-name $Config.KeyVaultName `
                --name $secret.Name `
                --value $secret.Value `
                --only-show-errors 2>&1 | Out-Null

            Write-StepBanner -Step $stepNumber -Status 'Success' -Message "  $($secret.Name) stored"
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Failed to store $($secret.Name): $_"
            throw "Could not store secret '$($secret.Name)' in Key Vault '$($Config.KeyVaultName)'."
        }
    }

    #endregion

    #region Clean up temp files

    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Cleaning up temporary certificate files'

    try {
        if (Test-Path $certDir) {
            Remove-Item -Recurse -Force $certDir -ErrorAction Stop
            Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Temporary files removed'
        }
    }
    catch {
        Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Could not remove temp files at $certDir -- clean up manually"
    }

    #endregion

    Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Certificate generation and secret configuration complete'

    return $Config
}
