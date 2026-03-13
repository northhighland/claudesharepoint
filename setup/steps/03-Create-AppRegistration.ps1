function Invoke-Step03_CreateAppRegistration {
    <#
    .SYNOPSIS
        Create or reuse an Azure AD app registration for SharePoint access.
    .DESCRIPTION
        Creates app registration "SpaceAgent-{ClientCode}" if it does not exist,
        adds required Microsoft Graph and SharePoint API permissions, creates a
        service principal, and grants the Automation Account managed identity
        Contributor access on the resource group.
    .PARAMETER Config
        Hashtable with setup configuration. Returns with added keys:
        AppId, AppObjectId, ServicePrincipalId.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Config
    )

    $ErrorActionPreference = 'Stop'
    $stepNumber = 3

    Write-StepBanner -Step $stepNumber -Message 'Creating app registration'

    $appDisplayName = "SpaceAgent-$($Config.ClientCode)"

    #region Permission GUIDs

    # Microsoft Graph application permissions
    $graphApiId = '00000003-0000-0000-c000-000000000000'
    $graphPermissions = @(
        @{ Id = '5a54b8b3-347c-476d-8f8e-42d5c7424d29'; Name = 'Sites.FullControl.All' }
        @{ Id = 'df021288-bdef-4463-88db-98f22de89214'; Name = 'User.Read.All' }
        @{ Id = 'b633e1c5-b582-4048-a93e-9f11b44c7e96'; Name = 'Mail.Send' }
    )

    # SharePoint Online application permissions
    $sharepointApiId = '00000003-0000-0ff1-ce00-000000000000'
    $sharepointPermissions = @(
        @{ Id = '678536fe-1083-478a-9c59-b99265e6b0d3'; Name = 'Sites.FullControl.All' }
    )

    #endregion

    #region Check for existing app registration

    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Checking for existing app: $appDisplayName"

    try {
        $existingAppJson = az ad app list --display-name $appDisplayName --query "[0]" -o json 2>&1
        $existingApp = $null
        if ($existingAppJson -and $existingAppJson -ne 'null') {
            $existingApp = $existingAppJson | ConvertFrom-Json
        }
    }
    catch {
        Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Could not query existing apps: $_"
        $existingApp = $null
    }

    #endregion

    #region Create or reuse app registration

    if ($existingApp -and $existingApp.appId) {
        $appId       = $existingApp.appId
        $appObjectId = $existingApp.id
        Write-StepBanner -Step $stepNumber -Status 'Success' -Message "App registration already exists: $appDisplayName ($appId)"
    }
    else {
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Creating app registration: $appDisplayName"
        try {
            $newAppJson = az ad app create `
                --display-name $appDisplayName `
                --sign-in-audience 'AzureADMyOrg' `
                -o json 2>&1

            $newApp = $newAppJson | ConvertFrom-Json
            $appId       = $newApp.appId
            $appObjectId = $newApp.id

            Write-StepBanner -Step $stepNumber -Status 'Success' -Message "App registration created: $appId"
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Failed to create app registration: $_"
            throw "Could not create app registration '$appDisplayName'. Ensure you have Application Administrator or Global Administrator role."
        }
    }

    #endregion

    #region Add API permissions

    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Adding Microsoft Graph permissions'

    foreach ($perm in $graphPermissions) {
        try {
            az ad app permission add `
                --id $appId `
                --api $graphApiId `
                --api-permissions "$($perm.Id)=Role" `
                --only-show-errors 2>&1 | Out-Null

            Write-StepBanner -Step $stepNumber -Status 'Success' -Message "  Graph: $($perm.Name)"
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "  Graph: $($perm.Name) -- may already exist or failed: $_"
        }
    }

    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Adding SharePoint permissions'

    foreach ($perm in $sharepointPermissions) {
        try {
            az ad app permission add `
                --id $appId `
                --api $sharepointApiId `
                --api-permissions "$($perm.Id)=Role" `
                --only-show-errors 2>&1 | Out-Null

            Write-StepBanner -Step $stepNumber -Status 'Success' -Message "  SharePoint: $($perm.Name)"
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "  SharePoint: $($perm.Name) -- may already exist or failed: $_"
        }
    }

    # Grant admin consent for all requested permissions
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Granting admin consent (requires Global Admin)'
    try {
        az ad app permission admin-consent --id $appId --only-show-errors 2>&1 | Out-Null
        Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Admin consent granted'
    }
    catch {
        Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Admin consent failed: $_"
        Write-StepBanner -Step $stepNumber -Status 'Warn' -Message 'A Global Admin must grant consent manually in Azure Portal > App registrations > API permissions.'
    }

    #endregion

    #region Create service principal

    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Creating service principal'

    $spId = $null
    try {
        # Check if SP already exists
        $existingSpJson = az ad sp show --id $appId -o json 2>&1
        if ($existingSpJson -and $LASTEXITCODE -eq 0) {
            $existingSp = $existingSpJson | ConvertFrom-Json
            $spId = $existingSp.id
            Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Service principal already exists: $spId"
        }
    }
    catch {
        # SP does not exist yet, create it
    }

    if (-not $spId) {
        try {
            $newSpJson = az ad sp create --id $appId -o json 2>&1
            $newSp = $newSpJson | ConvertFrom-Json
            $spId = $newSp.id
            Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Service principal created: $spId"
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Failed to create service principal: $_"
            throw "Could not create service principal for app $appId."
        }
    }

    #endregion

    #region Grant Automation Account managed identity Contributor on resource group

    if ($Config.AutomationPrincipalId) {
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Granting Automation Account managed identity Contributor role on resource group'

        try {
            $scope = "/subscriptions/$($Config.SubscriptionId)/resourceGroups/$($Config.ResourceGroupName)"

            # Check for existing assignment to avoid duplicate errors
            $existingAssignment = az role assignment list `
                --assignee $Config.AutomationPrincipalId `
                --role 'Contributor' `
                --scope $scope `
                --query "[0]" -o json 2>&1

            if ($existingAssignment -and $existingAssignment -ne 'null' -and $existingAssignment -ne '[]') {
                Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Contributor role assignment already exists'
            }
            else {
                az role assignment create `
                    --assignee-object-id $Config.AutomationPrincipalId `
                    --assignee-principal-type ServicePrincipal `
                    --role 'Contributor' `
                    --scope $scope `
                    --only-show-errors 2>&1 | Out-Null

                Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Contributor role assigned to Automation Account managed identity'
            }
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Could not assign Contributor role: $_"
            Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'You may need to assign this role manually.'
        }
    }
    else {
        Write-StepBanner -Step $stepNumber -Status 'Warn' -Message 'Automation Account principal ID not available. Skipping role assignment.'
    }

    #endregion

    #region Update Config

    $Config.AppId              = $appId
    $Config.AppObjectId        = $appObjectId
    $Config.ServicePrincipalId = $spId

    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "App ID:              $appId"
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "App Object ID:       $appObjectId"
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Service Principal:   $spId"

    #endregion

    Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'App registration complete'

    return $Config
}
