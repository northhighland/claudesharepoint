function Invoke-Step05_GrantAdminConsent {
    <#
    .SYNOPSIS
        Grant admin consent for the app registration's API permissions.
    .DESCRIPTION
        Constructs the admin consent URL, prompts the user to open it in a browser
        (Cloud Shell cannot launch browsers), then polls for consent status.
        Falls back to programmatic consent as a safety net.
    .PARAMETER Config
        Hashtable with setup configuration. Requires TenantId and AppId.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Config
    )

    $ErrorActionPreference = 'Stop'
    $stepNumber = 5

    Write-StepBanner -Step $stepNumber -Message 'Granting admin consent for API permissions'

    # ── Validate required config ──────────────────────────────────────────
    foreach ($key in @('TenantId', 'AppId')) {
        if ([string]::IsNullOrWhiteSpace($Config[$key])) {
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Missing required config: $key"
            throw "Config.$key is required for admin consent."
        }
    }

    $tenantId = $Config.TenantId
    $appId    = $Config.AppId

    # ── Build consent URL ─────────────────────────────────────────────────
    $consentUrl = "https://login.microsoftonline.com/$tenantId/adminconsent?client_id=$appId&redirect_uri=https://portal.azure.com"

    Write-Host ''
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Admin consent requires browser interaction.'
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Please open the following URL in your browser and approve the consent prompt:'
    Write-Host ''
    Write-Host "    $consentUrl" -ForegroundColor Yellow
    Write-Host ''
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Waiting for consent to be granted (timeout: 5 minutes)...'

    # ── Poll for consent ──────────────────────────────────────────────────
    $timeoutSeconds  = 300
    $pollInterval    = 10
    $elapsed         = 0
    $consentDetected = $false

    while ($elapsed -lt $timeoutSeconds) {
        try {
            $grants = az ad app permission list-grants --id $appId --query "[].scope" -o tsv 2>&1

            # If we get non-empty output without error, consent has been granted
            if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($grants)) {
                $consentDetected = $true
                break
            }
        }
        catch {
            # Swallow polling errors — the user may not have consented yet
        }

        # Show progress
        Write-Host '.' -NoNewline -ForegroundColor DarkGray
        Start-Sleep -Seconds $pollInterval
        $elapsed += $pollInterval
    }

    Write-Host ''  # End the progress dots line

    if (-not $consentDetected) {
        Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Consent not detected within $timeoutSeconds seconds."
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Attempting programmatic admin consent as fallback...'
    }
    else {
        Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Admin consent detected via browser.'
    }

    # ── Programmatic admin consent (backup / idempotent) ──────────────────
    try {
        az ad app permission admin-consent --id $appId 2>&1 | Out-Null

        if ($LASTEXITCODE -ne 0) {
            throw "az ad app permission admin-consent exited with code $LASTEXITCODE"
        }

        Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Programmatic admin consent applied successfully.'
    }
    catch {
        if ($consentDetected) {
            # Browser consent worked, programmatic is just a safety net
            Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Programmatic consent failed (browser consent already applied): $_"
        }
        else {
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Admin consent failed: $_"
            throw "Could not grant admin consent. Ensure you have Global Administrator privileges and try again."
        }
    }

    # ── Verify final state ────────────────────────────────────────────────
    try {
        # Brief pause for propagation
        Start-Sleep -Seconds 5

        $finalGrants = az ad app permission list-grants --id $appId --query "[].scope" -o tsv 2>&1

        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($finalGrants)) {
            Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Consented scopes: $finalGrants"
        }
        else {
            Write-StepBanner -Step $stepNumber -Status 'Warn' -Message 'Could not verify consent grants. They may still be propagating.'
        }
    }
    catch {
        Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Could not verify consent status: $_"
    }

    Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Admin consent step complete'

    return $Config
}
