function Test-Prerequisites {
    <#
    .SYNOPSIS
        Validate that the environment can run the setup wizard.
    .OUTPUTS
        Hashtable with IsReady (bool), User (string), TenantId (string), SubscriptionId (string), SubscriptionName (string)
    #>
    param()

    $result = @{
        IsReady          = $true
        User             = ''
        TenantId         = ''
        SubscriptionId   = ''
        SubscriptionName = ''
        IsGlobalAdmin    = $false
        Errors           = @()
    }

    # Check PowerShell version
    if ($PSVersionTable.PSVersion.Major -lt 7) {
        $result.Errors += "PowerShell 7+ required (current: $($PSVersionTable.PSVersion))"
        $result.IsReady = $false
    }

    # Check Az module
    $azModule = Get-Module -Name Az.Accounts -ListAvailable -ErrorAction SilentlyContinue
    if (-not $azModule) {
        $result.Errors += "Az PowerShell module not installed. Run: Install-Module Az -Force"
        $result.IsReady = $false
    }

    # Check Azure context
    $context = Get-AzContext -ErrorAction SilentlyContinue
    if (-not $context) {
        # Try to connect (Cloud Shell auto-authenticates)
        try {
            Connect-AzAccount -ErrorAction Stop | Out-Null
            $context = Get-AzContext
        }
        catch {
            $result.Errors += "Not signed in to Azure. Run: Connect-AzAccount"
            $result.IsReady = $false
            return $result
        }
    }

    $result.User = $context.Account.Id
    $result.TenantId = $context.Tenant.Id
    $result.SubscriptionId = $context.Subscription.Id
    $result.SubscriptionName = $context.Subscription.Name

    # Check for Global Admin role via Azure AD
    try {
        $roles = az rest --method GET `
            --uri "https://graph.microsoft.com/v1.0/me/memberOf/microsoft.graph.directoryRole" `
            --query "value[].displayName" -o tsv 2>&1

        if ($roles -match "Global Administrator") {
            $result.IsGlobalAdmin = $true
        }
        else {
            $result.Errors += "Global Administrator role required for app registration and consent"
            $result.IsReady = $false
        }
    }
    catch {
        # If we can't check, warn but don't block — they might have the role
        # and the az rest call might just be failing in their environment
        $result.Errors += "Could not verify Global Admin role. Setup may fail at consent step."
    }

    # Check az CLI (needed for app registration)
    $azCli = Get-Command az -ErrorAction SilentlyContinue
    if (-not $azCli) {
        $result.Errors += "Azure CLI (az) not found. Required for app registration."
        $result.IsReady = $false
    }

    return $result
}
