function Invoke-Step01_CheckEnvironment {
    <#
    .SYNOPSIS
        Validate Azure environment prerequisites before proceeding with setup.
    .DESCRIPTION
        Calls Test-Prerequisites to verify PowerShell version, Az modules,
        Azure authentication, and Global Admin role. Displays results and
        exits if critical prerequisites are not met.
    .PARAMETER Config
        Hashtable with setup configuration. Returned unchanged.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Config
    )

    $ErrorActionPreference = 'Stop'
    $stepNumber = 1

    Write-StepBanner -Step $stepNumber -Message 'Checking environment prerequisites'

    # Dot-source the prerequisites helper
    $helpersPath = Join-Path $PSScriptRoot '..' 'helpers' 'Test-Prerequisites.ps1'
    if (-not (Test-Path $helpersPath)) {
        Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Helper not found: $helpersPath"
        throw "Test-Prerequisites.ps1 not found at $helpersPath"
    }
    . $helpersPath

    # Run prerequisite checks
    try {
        $prereqs = Test-Prerequisites
    }
    catch {
        Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Prerequisite check failed: $_"
        throw
    }

    # Display environment details
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Subscription:  $($prereqs.SubscriptionName) ($($prereqs.SubscriptionId))"
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "User:          $($prereqs.User)"
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Tenant:        $($prereqs.TenantId)"
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "PowerShell:    $($PSVersionTable.PSVersion)"

    # Evaluate Global Admin status
    if ($prereqs.IsGlobalAdmin) {
        Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Global Administrator role confirmed'
    }
    else {
        # Check if the failure was a hard block or an uncertain check
        $globalAdminError = $prereqs.Errors | Where-Object { $_ -match 'Could not verify Global Admin' }
        if ($globalAdminError) {
            Write-StepBanner -Step $stepNumber -Status 'Warn' -Message 'Could not verify Global Admin role. Setup may fail at consent step.'
            Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Continuing anyway -- ensure you have sufficient privileges.'
            # Remove the soft warning from errors so it does not trigger exit below
            $prereqs.Errors = $prereqs.Errors | Where-Object { $_ -notmatch 'Could not verify Global Admin' }
        }
    }

    # Check for blocking errors
    if (-not $prereqs.IsReady) {
        # Filter out the Global Admin uncertain warning (already handled above)
        $blockingErrors = $prereqs.Errors | Where-Object { $_ -notmatch 'Could not verify Global Admin' }

        if ($blockingErrors.Count -gt 0) {
            Write-Host ''
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message 'Environment prerequisites not met:'
            foreach ($err in $blockingErrors) {
                Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "  $err"
            }
            Write-Host ''
            throw "Environment check failed. Resolve the errors above and re-run the setup wizard."
        }
    }

    Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Environment check passed'

    return $Config
}
