#Requires -Version 7.0
#Requires -Modules Az.Accounts, Az.KeyVault, Az.Storage, Az.Automation

# SpaceAgent.psm1 v2
# Shared module for claudesharepoint Azure Automation runbooks
# Provides authentication, site enumeration, Table Storage results, token refresh,
# Graph API retry, checkpoint persistence, notifications, and configuration
#
# v2 changes: Table Storage results, Teams/email notifications, batch splitting,
#              auto-admin escalation/cleanup, JobRuns tracking

#region Configuration Variables

# Token refresh interval (30 minutes - proven pattern from 11TB validation)
$script:TokenRefreshIntervalMinutes = 30
$script:OperationsPerRefresh = 500
$script:TokenRefreshTime = $null
$script:OperationsSinceRefresh = 0
$script:CurrentHeaders = $null
$script:CurrentToken = $null

#endregion

#region Authentication

function Connect-SpaceAgent {
    <#
    .SYNOPSIS
        Authenticate via managed identity + Key Vault and connect PnP
    .DESCRIPTION
        Connects to Azure using managed identity, retrieves the PnP certificate from
        Key Vault, and establishes a PnP Online connection. Returns connection metadata
        for downstream functions.
    .PARAMETER KeyVaultName
        Name of the Azure Key Vault containing the PnP certificate
    .PARAMETER CertificateName
        Name of the certificate in Key Vault (default: sharepoint-cert)
    .PARAMETER ClientId
        App registration client ID for PnP connection
    .PARAMETER TenantId
        Azure AD tenant ID
    .PARAMETER SiteUrl
        SharePoint site URL to connect to (typically admin center)
    .OUTPUTS
        Hashtable with ClientId, TenantId, CertificatePath, SiteUrl for reuse
    .EXAMPLE
        $conn = Connect-SpaceAgent -KeyVaultName 'kv-csp' -ClientId $clientId `
            -TenantId $tenantId -SiteUrl 'https://contoso-admin.sharepoint.com'
    #>
    [CmdletBinding()]
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory = $true)]
        [string]$KeyVaultName,

        [string]$CertificateName = 'sharepoint-cert',

        [Parameter(Mandatory = $true)]
        [string]$ClientId,

        [Parameter(Mandatory = $true)]
        [string]$TenantId,

        [Parameter(Mandatory = $true)]
        [string]$SiteUrl
    )

    # Connect to Azure with managed identity
    Write-Output "Connecting to Azure with managed identity..."
    Connect-AzAccount -Identity -ErrorAction Stop | Out-Null

    # Retrieve certificate from Key Vault
    Write-Output "Retrieving certificate '$CertificateName' from Key Vault '$KeyVaultName'..."
    $cert = Get-AzKeyVaultCertificate -VaultName $KeyVaultName -Name $CertificateName -ErrorAction Stop
    $secret = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name $cert.Name -AsPlainText -ErrorAction Stop
    $certBytes = [Convert]::FromBase64String($secret)

    $certPath = Join-Path $env:TEMP "$CertificateName.pfx"
    [System.IO.File]::WriteAllBytes($certPath, $certBytes)
    Write-Output "Certificate saved to: $certPath"

    # Connect PnP Online
    Write-Output "Connecting PnP Online to $SiteUrl..."
    Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Tenant $TenantId `
        -CertificatePath $certPath -ErrorAction Stop

    # Initialize token refresh tracking
    Initialize-TokenRefresh

    # Get initial Graph token
    $null = Get-GraphToken

    Write-Output "SpaceAgent connected successfully"

    return @{
        ClientId        = $ClientId
        TenantId        = $TenantId
        CertificatePath = $certPath
        SiteUrl         = $SiteUrl
        ConnectedAt     = (Get-Date).ToString("o")
    }
}

#endregion

#region Token Refresh Functions

function Initialize-TokenRefresh {
    <#
    .SYNOPSIS
        Initialize token refresh tracking for long-running operations
    .DESCRIPTION
        Sets up timing variables for proactive token refresh (30-minute interval)
    #>
    [CmdletBinding()]
    param()

    $script:TokenRefreshTime = Get-Date
    $script:OperationsSinceRefresh = 0
    Write-Verbose "Token refresh tracking initialized at $($script:TokenRefreshTime)"
}

function Get-GraphToken {
    <#
    .SYNOPSIS
        Get a fresh Graph API token via PnP connection
    .DESCRIPTION
        Retrieves access token for Microsoft Graph API. Assumes PnP connection already established.
    .OUTPUTS
        String - Bearer token for Graph API
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param()

    $token = Get-PnPAccessToken -ResourceTypeName Graph -ErrorAction Stop
    $script:CurrentToken = $token
    $script:CurrentHeaders = @{ "Authorization" = "Bearer $token" }
    $script:TokenRefreshTime = Get-Date
    $script:OperationsSinceRefresh = 0

    return $token
}

function Invoke-WithTokenRefresh {
    <#
    .SYNOPSIS
        Execute operation with automatic token refresh
    .DESCRIPTION
        Wraps Graph API operations with proactive token refresh (every 30 min or 500 ops)
        and retry on 401 errors.
    .PARAMETER Operation
        ScriptBlock to execute
    .PARAMETER SiteUrl
        SharePoint site URL for reconnection if needed
    .PARAMETER ClientId
        App registration client ID
    .PARAMETER TenantId
        Azure AD tenant ID
    .PARAMETER CertificatePath
        Path to PFX certificate file
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Operation,

        [Parameter(Mandatory = $true)]
        [string]$SiteUrl,

        [Parameter(Mandatory = $true)]
        [string]$ClientId,

        [Parameter(Mandatory = $true)]
        [string]$TenantId,

        [Parameter(Mandatory = $true)]
        [string]$CertificatePath
    )

    $script:OperationsSinceRefresh++
    $timeSinceRefresh = ((Get-Date) - $script:TokenRefreshTime).TotalMinutes

    # Proactive refresh: before token expires (every 30 min or 500 operations)
    if ($timeSinceRefresh -ge $script:TokenRefreshIntervalMinutes -or
        $script:OperationsSinceRefresh -ge $script:OperationsPerRefresh) {

        Write-Output "Refreshing token (${timeSinceRefresh}min elapsed, $($script:OperationsSinceRefresh) operations)"

        Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Tenant $TenantId `
            -CertificatePath $CertificatePath -ErrorAction Stop
        $null = Get-GraphToken
    }

    # Execute with retry on 401
    try {
        & $Operation
    }
    catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 401) {
            Write-Output "Token expired (401) - forcing refresh"
            Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Tenant $TenantId `
                -CertificatePath $CertificatePath -ErrorAction Stop
            $null = Get-GraphToken
            & $Operation  # Retry
        }
        else {
            throw
        }
    }
}

#endregion

#region Graph API Functions

function Invoke-GraphWithRetry {
    <#
    .SYNOPSIS
        Execute Graph API call with retry and throttle handling
    .DESCRIPTION
        Handles 429 (throttling), 503/504 (service unavailable), and throws on 401
        for caller to refresh token. Respects Retry-After header for throttling.
    .PARAMETER Uri
        Graph API endpoint URI
    .PARAMETER Headers
        Request headers (including Authorization)
    .PARAMETER Method
        HTTP method (GET, DELETE, POST, PATCH)
    .PARAMETER Body
        Request body for POST/PATCH (optional)
    .PARAMETER MaxRetries
        Maximum retry attempts (default: 5)
    .PARAMETER TimeoutSec
        Request timeout in seconds (default: 60)
    .PARAMETER ApiDelayMs
        Delay before each API call to prevent throttling (default: 100)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,

        [Parameter(Mandatory = $true)]
        [hashtable]$Headers,

        [ValidateSet('GET', 'DELETE', 'POST', 'PATCH')]
        [string]$Method = 'GET',

        [object]$Body,

        [int]$MaxRetries = 5,

        [int]$TimeoutSec = 60,

        [int]$ApiDelayMs = 100
    )

    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            # Add delay before API call to prevent 429 throttling
            if ($ApiDelayMs -gt 0) {
                Start-Sleep -Milliseconds $ApiDelayMs
            }

            $params = @{
                Uri         = $Uri
                Headers     = $Headers
                Method      = $Method
                TimeoutSec  = $TimeoutSec
                ErrorAction = 'Stop'
            }

            if ($Body -and $Method -in @('POST', 'PATCH')) {
                $params['Body'] = ($Body | ConvertTo-Json -Depth 10)
                $params['ContentType'] = 'application/json'
            }

            return Invoke-RestMethod @params
        }
        catch {
            $statusCode = $_.Exception.Response.StatusCode.value__

            if ($statusCode -eq 401) {
                # Token expired - throw for caller to handle refresh
                throw
            }
            elseif ($statusCode -eq 429) {
                # Throttled - respect Retry-After header
                $retryAfter = 30  # Default 30 seconds
                if ($_.Exception.Response.Headers["Retry-After"]) {
                    $retryAfter = [int]$_.Exception.Response.Headers["Retry-After"]
                }
                Write-Warning "Throttled (429) - waiting $retryAfter seconds (attempt $attempt/$MaxRetries)"
                Start-Sleep -Seconds $retryAfter
            }
            elseif ($statusCode -eq 503 -or $statusCode -eq 504) {
                # Service unavailable - exponential backoff
                $wait = 10 * $attempt
                Write-Warning "Service unavailable ($statusCode) - waiting $wait seconds (attempt $attempt/$MaxRetries)"
                Start-Sleep -Seconds $wait
            }
            else {
                # Unknown error on last attempt - rethrow
                if ($attempt -eq $MaxRetries) {
                    throw
                }
                # Otherwise, brief pause and retry
                Start-Sleep -Seconds 2
            }

            if ($attempt -eq $MaxRetries) {
                throw "Max retries ($MaxRetries) exceeded for $Uri. Last error: $($_.Exception.Message)"
            }
        }
    }
}

#endregion

#region Site Enumeration

function Get-AllSites {
    <#
    .SYNOPSIS
        Enumerate all SharePoint sites via SPO Admin, filtering exclusions
    .DESCRIPTION
        Retrieves all tenant sites excluding OneDrive, redirect templates, and any
        configured exclusion patterns. Returns site objects with Url, Title, and
        StorageUsageCurrent properties.
    .PARAMETER ExclusionPatterns
        Array of URL patterns to exclude (supports wildcards)
    .PARAMETER IncludeGroupSites
        Include group-connected sites (default: true)
    .OUTPUTS
        Array of site objects (Url, Title, StorageUsageCurrent, Template)
    .EXAMPLE
        $sites = Get-AllSites -ExclusionPatterns @('search', 'compliance', 'appcatalog')
    #>
    [CmdletBinding()]
    [OutputType([array])]
    param(
        [string[]]$ExclusionPatterns = @(),

        [bool]$IncludeGroupSites = $true
    )

    Write-Output "Enumerating tenant sites..."

    # Get all sites excluding OneDrive personal sites
    $allSites = Get-PnPTenantSite -IncludeOneDriveSites:$false |
        Where-Object {
            $_.Template -notlike "*REDIRECT*" -and
            $_.Url -notlike "*-my.sharepoint.com*"
        } |
        Select-Object Url, Title, StorageUsageCurrent, Template

    Write-Output "Total sites found: $($allSites.Count)"

    # Apply exclusion patterns
    if ($ExclusionPatterns.Count -gt 0) {
        $filteredSites = $allSites | Where-Object {
            $url = $_.Url
            $excluded = $false
            foreach ($pattern in $ExclusionPatterns) {
                if ($url -like "*$pattern*") {
                    $excluded = $true
                    Write-Verbose "Excluding site: $url (matched pattern: $pattern)"
                    break
                }
            }
            -not $excluded
        }
        Write-Output "Sites after exclusions: $($filteredSites.Count) (excluded $($allSites.Count - $filteredSites.Count))"
        return @($filteredSites)
    }

    return @($allSites)
}

function Split-IntoBatches {
    <#
    .SYNOPSIS
        Divide an array into configurable batch sizes
    .DESCRIPTION
        Splits an input array into an array of sub-arrays, each containing at most
        BatchSize elements. Useful for processing sites in manageable chunks.
    .PARAMETER Items
        Array of items to split
    .PARAMETER BatchSize
        Maximum number of items per batch (default: 50)
    .OUTPUTS
        Array of arrays, each containing up to BatchSize items
    .EXAMPLE
        $batches = Split-IntoBatches -Items $sites -BatchSize 25
        foreach ($batch in $batches) { Process-Batch $batch }
    #>
    [CmdletBinding()]
    [OutputType([array])]
    param(
        [Parameter(Mandatory = $true)]
        [array]$Items,

        [ValidateRange(1, 10000)]
        [int]$BatchSize = 50
    )

    if ($Items.Count -eq 0) {
        return @()
    }

    $batches = [System.Collections.Generic.List[array]]::new()

    for ($i = 0; $i -lt $Items.Count; $i += $BatchSize) {
        $end = [Math]::Min($i + $BatchSize - 1, $Items.Count - 1)
        $batch = @($Items[$i..$end])
        $batches.Add($batch)
    }

    Write-Output "Split $($Items.Count) items into $($batches.Count) batches of max $BatchSize"
    return @($batches.ToArray())
}

#endregion

#region Site Admin Escalation

function Add-SiteAdmin {
    <#
    .SYNOPSIS
        Auto-escalate permissions when 403 received, adding app as site admin
    .DESCRIPTION
        Adds the service principal as a site collection administrator to gain access
        to sites that return 403. Tracks escalated sites for cleanup via Remove-SiteAdmin.
        Uses Set-PnPTenantSite via the admin connection.
    .PARAMETER SiteUrl
        URL of the site to escalate admin access on
    .PARAMETER AdminUrl
        SharePoint admin center URL (for context switching)
    .PARAMETER ClientId
        App registration client ID (used as the admin identity)
    .PARAMETER TenantId
        Azure AD tenant ID
    .PARAMETER CertificatePath
        Path to PFX certificate file
    .OUTPUTS
        Boolean - $true if admin was successfully added
    .EXAMPLE
        $added = Add-SiteAdmin -SiteUrl 'https://contoso.sharepoint.com/sites/hr' `
            -AdminUrl 'https://contoso-admin.sharepoint.com' -ClientId $clientId `
            -TenantId $tenantId -CertificatePath $certPath
    #>
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory = $true)]
        [string]$SiteUrl,

        [Parameter(Mandatory = $true)]
        [string]$AdminUrl,

        [Parameter(Mandatory = $true)]
        [string]$ClientId,

        [Parameter(Mandatory = $true)]
        [string]$TenantId,

        [Parameter(Mandatory = $true)]
        [string]$CertificatePath
    )

    try {
        Write-Output "Escalating admin access on: $SiteUrl"

        # Connect to admin center to set site admin
        Connect-PnPOnline -Url $AdminUrl -ClientId $ClientId -Tenant $TenantId `
            -CertificatePath $CertificatePath -ErrorAction Stop

        # Add the app as site collection admin
        Set-PnPTenantSite -Url $SiteUrl -Owners @($ClientId) -ErrorAction Stop

        Write-Output "Admin access granted on: $SiteUrl"

        # Reconnect to the target site
        Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Tenant $TenantId `
            -CertificatePath $CertificatePath -ErrorAction Stop

        # Refresh token after reconnection
        $null = Get-GraphToken

        return $true
    }
    catch {
        Write-Warning "Failed to escalate admin on ${SiteUrl}: $($_.Exception.Message)"
        return $false
    }
}

function Remove-SiteAdmin {
    <#
    .SYNOPSIS
        Remove admin access after processing to maintain least privilege
    .DESCRIPTION
        Removes the service principal as a site collection administrator. Should be
        called after processing completes for sites where Add-SiteAdmin was used.
    .PARAMETER SiteUrl
        URL of the site to remove admin access from
    .PARAMETER AdminUrl
        SharePoint admin center URL
    .PARAMETER ClientId
        App registration client ID
    .PARAMETER TenantId
        Azure AD tenant ID
    .PARAMETER CertificatePath
        Path to PFX certificate file
    .EXAMPLE
        Remove-SiteAdmin -SiteUrl 'https://contoso.sharepoint.com/sites/hr' `
            -AdminUrl 'https://contoso-admin.sharepoint.com' -ClientId $clientId `
            -TenantId $tenantId -CertificatePath $certPath
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$SiteUrl,

        [Parameter(Mandatory = $true)]
        [string]$AdminUrl,

        [Parameter(Mandatory = $true)]
        [string]$ClientId,

        [Parameter(Mandatory = $true)]
        [string]$TenantId,

        [Parameter(Mandatory = $true)]
        [string]$CertificatePath
    )

    try {
        Write-Output "Removing admin access from: $SiteUrl"

        # Connect to admin center
        Connect-PnPOnline -Url $AdminUrl -ClientId $ClientId -Tenant $TenantId `
            -CertificatePath $CertificatePath -ErrorAction Stop

        # Remove the app as site collection admin
        # Use Remove-PnPSiteCollectionAdmin after connecting to the target site
        Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Tenant $TenantId `
            -CertificatePath $CertificatePath -ErrorAction Stop

        Remove-PnPSiteCollectionAdmin -Owners @($ClientId) -ErrorAction Stop

        Write-Output "Admin access removed from: $SiteUrl"
    }
    catch {
        # Non-fatal - log but do not throw. Cleanup failures should not block processing.
        Write-Warning "Failed to remove admin from ${SiteUrl}: $($_.Exception.Message)"
    }
}

#endregion

#region Table Storage Functions

function Write-TableResult {
    <#
    .SYNOPSIS
        Write results to Azure Table Storage using Az.Storage
    .DESCRIPTION
        Writes a result row to Azure Table Storage. Uses managed identity for authentication.
        Automatically handles entity creation with PartitionKey/RowKey structure.
    .PARAMETER StorageAccountName
        Azure Storage account name
    .PARAMETER TableName
        Table name (created if it does not exist)
    .PARAMETER PartitionKey
        Partition key for the entity (e.g., job type, date, site collection)
    .PARAMETER RowKey
        Row key for the entity (must be unique within partition)
    .PARAMETER Properties
        Hashtable of additional properties to write (values must be Table Storage compatible types)
    .PARAMETER StorageContext
        Optional pre-created storage context. If not provided, creates one via managed identity.
    .EXAMPLE
        Write-TableResult -StorageAccountName 'stcsp' -TableName 'SiteResults' `
            -PartitionKey '2025-02-05' -RowKey 'https://contoso.sharepoint.com/sites/hr' `
            -Properties @{
                SiteTitle = 'HR Site'
                VersionsFound = 1234
                SpaceReclaimedMB = 567.89
                FilesScanned = 5000
                Status = 'Completed'
            }
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$StorageAccountName,

        [Parameter(Mandatory = $true)]
        [string]$TableName,

        [Parameter(Mandatory = $true)]
        [string]$PartitionKey,

        [Parameter(Mandatory = $true)]
        [string]$RowKey,

        [Parameter(Mandatory = $true)]
        [hashtable]$Properties,

        [object]$StorageContext
    )

    try {
        # Get or create storage context
        if (-not $StorageContext) {
            $StorageContext = New-AzStorageContext -StorageAccountName $StorageAccountName -UseConnectedAccount
        }

        # Ensure table exists
        $table = Get-AzStorageTable -Name $TableName -Context $StorageContext -ErrorAction SilentlyContinue
        if (-not $table) {
            $table = New-AzStorageTable -Name $TableName -Context $StorageContext -ErrorAction Stop
            Write-Verbose "Created table: $TableName"
        }

        # Get the CloudTable reference
        $cloudTable = $table.CloudTable

        # Build the entity
        $entity = [Microsoft.Azure.Cosmos.Table.DynamicTableEntity]::new($PartitionKey, $RowKey)

        # Add timestamp
        $entity.Properties.Add("Timestamp_Custom", [Microsoft.Azure.Cosmos.Table.EntityProperty]::GeneratePropertyForString((Get-Date).ToString("o")))

        # Add all properties
        foreach ($key in $Properties.Keys) {
            $value = $Properties[$key]
            if ($null -eq $value) {
                $entity.Properties.Add($key, [Microsoft.Azure.Cosmos.Table.EntityProperty]::GeneratePropertyForString(""))
            }
            elseif ($value -is [int] -or $value -is [int64]) {
                $entity.Properties.Add($key, [Microsoft.Azure.Cosmos.Table.EntityProperty]::GeneratePropertyForLong([int64]$value))
            }
            elseif ($value -is [double] -or $value -is [decimal] -or $value -is [float]) {
                $entity.Properties.Add($key, [Microsoft.Azure.Cosmos.Table.EntityProperty]::GeneratePropertyForDouble([double]$value))
            }
            elseif ($value -is [bool]) {
                $entity.Properties.Add($key, [Microsoft.Azure.Cosmos.Table.EntityProperty]::GeneratePropertyForBool($value))
            }
            elseif ($value -is [datetime]) {
                $entity.Properties.Add($key, [Microsoft.Azure.Cosmos.Table.EntityProperty]::GeneratePropertyForDateTimeOffset([DateTimeOffset]$value))
            }
            else {
                $entity.Properties.Add($key, [Microsoft.Azure.Cosmos.Table.EntityProperty]::GeneratePropertyForString([string]$value))
            }
        }

        # Insert or merge (upsert)
        $null = $cloudTable.Execute([Microsoft.Azure.Cosmos.Table.TableOperation]::InsertOrMerge($entity))

        Write-Verbose "Table result written: $TableName [$PartitionKey / $RowKey]"
    }
    catch {
        Write-Warning "Failed to write table result to ${TableName}: $($_.Exception.Message)"
        throw
    }
}

function Update-JobRun {
    <#
    .SYNOPSIS
        Update JobRuns table with progress information
    .DESCRIPTION
        Writes or updates a row in the JobRuns table with PartitionKey=JobType and RowKey=RunId.
        Used to track overall run progress, status, and statistics.
    .PARAMETER StorageAccountName
        Azure Storage account name
    .PARAMETER JobType
        Type of job (e.g., 'Assessment', 'Cleanup', 'VersionPolicy'). Used as PartitionKey.
    .PARAMETER RunId
        Unique run identifier (e.g., timestamp-based). Used as RowKey.
    .PARAMETER Status
        Current status: Queued, Running, Completed, Failed, Cancelled
    .PARAMETER Properties
        Hashtable of additional properties (SitesTotal, SitesProcessed, Errors, SpaceReclaimedGB, etc.)
    .PARAMETER StorageContext
        Optional pre-created storage context
    .EXAMPLE
        Update-JobRun -StorageAccountName 'stcsp' -JobType 'Assessment' `
            -RunId '20250205_143000' -Status 'Running' -Properties @{
                SitesTotal = 500
                SitesProcessed = 150
                BatchNumber = 3
                StartedAt = (Get-Date).ToString("o")
            }
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$StorageAccountName,

        [Parameter(Mandatory = $true)]
        [string]$JobType,

        [Parameter(Mandatory = $true)]
        [string]$RunId,

        [Parameter(Mandatory = $true)]
        [ValidateSet('Queued', 'Running', 'Completed', 'Failed', 'Cancelled')]
        [string]$Status,

        [hashtable]$Properties = @{},

        [object]$StorageContext
    )

    # Merge status and timing into properties
    $mergedProps = @{
        Status    = $Status
        UpdatedAt = (Get-Date).ToString("o")
    }

    # Add completion time for terminal states
    if ($Status -in @('Completed', 'Failed', 'Cancelled')) {
        $mergedProps['CompletedAt'] = (Get-Date).ToString("o")
    }

    # Merge caller-provided properties
    foreach ($key in $Properties.Keys) {
        $mergedProps[$key] = $Properties[$key]
    }

    Write-TableResult -StorageAccountName $StorageAccountName -TableName 'JobRuns' `
        -PartitionKey $JobType -RowKey $RunId -Properties $mergedProps `
        -StorageContext $StorageContext

    Write-Output "JobRun updated: $JobType/$RunId -> $Status"
}

#endregion

#region Checkpoint Functions (Table Storage)

function Save-Checkpoint {
    <#
    .SYNOPSIS
        Save processing state to Azure Table Storage for resume capability
    .DESCRIPTION
        Persists checkpoint state to Table Storage for resume after failure/restart.
        Uses PartitionKey='Checkpoint' and RowKey=CheckpointName.
    .PARAMETER StorageAccountName
        Azure Storage account name
    .PARAMETER CheckpointName
        Name for this checkpoint (default: checkpoint-{date})
    .PARAMETER State
        Hashtable containing checkpoint state. Complex values are JSON-serialized.
    .PARAMETER StorageContext
        Optional pre-created storage context
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$StorageAccountName,

        [string]$CheckpointName,

        [Parameter(Mandatory = $true)]
        [hashtable]$State,

        [object]$StorageContext
    )

    if (-not $CheckpointName) {
        $CheckpointName = "checkpoint-$(Get-Date -Format 'yyyy-MM-dd')"
    }

    # Flatten state for table storage - serialize complex types as JSON strings
    $flatState = @{
        LastUpdated = (Get-Date).ToString("o")
    }

    foreach ($key in $State.Keys) {
        $value = $State[$key]
        if ($value -is [hashtable] -or $value -is [array] -or $value -is [System.Collections.IList]) {
            $flatState[$key] = ($value | ConvertTo-Json -Depth 10 -Compress)
        }
        else {
            $flatState[$key] = $value
        }
    }

    Write-TableResult -StorageAccountName $StorageAccountName -TableName 'Checkpoints' `
        -PartitionKey 'Checkpoint' -RowKey $CheckpointName -Properties $flatState `
        -StorageContext $StorageContext

    Write-Output "Checkpoint saved: $CheckpointName"
}

function Get-Checkpoint {
    <#
    .SYNOPSIS
        Load processing state from Azure Table Storage
    .DESCRIPTION
        Retrieves checkpoint state from Table Storage for resume operations.
    .PARAMETER StorageAccountName
        Azure Storage account name
    .PARAMETER CheckpointName
        Name of checkpoint to load (default: checkpoint-{date})
    .PARAMETER StorageContext
        Optional pre-created storage context
    .OUTPUTS
        Hashtable - Checkpoint state or $null if not found
    #>
    [CmdletBinding()]
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory = $true)]
        [string]$StorageAccountName,

        [string]$CheckpointName,

        [object]$StorageContext
    )

    if (-not $CheckpointName) {
        $CheckpointName = "checkpoint-$(Get-Date -Format 'yyyy-MM-dd')"
    }

    try {
        if (-not $StorageContext) {
            $StorageContext = New-AzStorageContext -StorageAccountName $StorageAccountName -UseConnectedAccount
        }

        $table = Get-AzStorageTable -Name 'Checkpoints' -Context $StorageContext -ErrorAction SilentlyContinue
        if (-not $table) {
            return $null
        }

        $cloudTable = $table.CloudTable
        $operation = [Microsoft.Azure.Cosmos.Table.TableOperation]::Retrieve('Checkpoint', $CheckpointName)
        $result = $cloudTable.Execute($operation)

        if ($result.Result) {
            $entity = $result.Result
            $state = @{}
            foreach ($prop in $entity.Properties.GetEnumerator()) {
                $state[$prop.Key] = $prop.Value.PropertyAsObject
            }
            Write-Output "Checkpoint loaded: $CheckpointName"
            return $state
        }

        return $null
    }
    catch {
        Write-Warning "Failed to load checkpoint ${CheckpointName}: $($_.Exception.Message)"
        return $null
    }
}

function Clear-Checkpoint {
    <#
    .SYNOPSIS
        Delete checkpoint after successful completion
    .PARAMETER StorageAccountName
        Azure Storage account name
    .PARAMETER CheckpointName
        Name of checkpoint to clear (default: checkpoint-{date})
    .PARAMETER StorageContext
        Optional pre-created storage context
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$StorageAccountName,

        [string]$CheckpointName,

        [object]$StorageContext
    )

    if (-not $CheckpointName) {
        $CheckpointName = "checkpoint-$(Get-Date -Format 'yyyy-MM-dd')"
    }

    try {
        if (-not $StorageContext) {
            $StorageContext = New-AzStorageContext -StorageAccountName $StorageAccountName -UseConnectedAccount
        }

        $table = Get-AzStorageTable -Name 'Checkpoints' -Context $StorageContext -ErrorAction SilentlyContinue
        if (-not $table) {
            return
        }

        $cloudTable = $table.CloudTable
        $entity = [Microsoft.Azure.Cosmos.Table.DynamicTableEntity]::new('Checkpoint', $CheckpointName)
        $entity.ETag = '*'
        $null = $cloudTable.Execute([Microsoft.Azure.Cosmos.Table.TableOperation]::Delete($entity))

        Write-Output "Checkpoint cleared: $CheckpointName"
    }
    catch {
        Write-Warning "Failed to clear checkpoint ${CheckpointName}: $($_.Exception.Message)"
    }
}

#endregion

#region Notification Functions

function Send-Notification {
    <#
    .SYNOPSIS
        Send notifications via Teams webhook and/or email via Graph API
    .DESCRIPTION
        Supports dual-channel notifications: Teams Incoming Webhook (Invoke-RestMethod POST)
        and email via Microsoft Graph API. Either or both channels can be used.
    .PARAMETER Title
        Notification title/subject
    .PARAMETER Message
        Main message body (plain text for Teams, also used for email if HtmlBody not provided)
    .PARAMETER HtmlBody
        Optional HTML body for email. If not provided, Message is used with basic HTML wrapping.
    .PARAMETER TeamsWebhookUrl
        Teams Incoming Webhook URL. If not provided, Teams notification is skipped.
    .PARAMETER EmailFrom
        Sender email address for Graph API email. If not provided, email is skipped.
    .PARAMETER EmailTo
        Array of recipient email addresses
    .PARAMETER Headers
        Graph API authorization headers (required if sending email). Uses $script:CurrentHeaders if not provided.
    .PARAMETER Severity
        Message severity: Info, Warning, Error, Success. Affects Teams card color.
    .PARAMETER Facts
        Optional hashtable of key-value facts to include in the Teams card / email details
    .EXAMPLE
        Send-Notification -Title "Assessment Complete" -Message "Processed 500 sites" `
            -TeamsWebhookUrl $webhookUrl -Severity 'Success' `
            -Facts @{ SitesProcessed = 500; SpaceFound = '1.2 TB' }
    .EXAMPLE
        Send-Notification -Title "Job Failed" -Message "Error in batch 3" `
            -TeamsWebhookUrl $webhookUrl -EmailFrom "reports@contoso.com" `
            -EmailTo @("admin@contoso.com") -Severity 'Error'
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,

        [Parameter(Mandatory = $true)]
        [string]$Message,

        [string]$HtmlBody,

        [string]$TeamsWebhookUrl,

        [string]$EmailFrom,

        [string[]]$EmailTo,

        [hashtable]$Headers,

        [ValidateSet('Info', 'Warning', 'Error', 'Success')]
        [string]$Severity = 'Info',

        [hashtable]$Facts
    )

    $results = @{
        TeamsSent = $false
        EmailSent = $false
        Errors    = @()
    }

    # Severity to color mapping for Teams
    $colorMap = @{
        Info    = '0078D4'  # Blue
        Warning = 'FFC107'  # Amber
        Error   = 'DC3545'  # Red
        Success = '28A745'  # Green
    }

    #--- Teams Webhook ---
    if ($TeamsWebhookUrl) {
        try {
            # Build MessageCard payload (legacy connector format for broad compatibility)
            $factsArray = @()
            if ($Facts) {
                foreach ($key in $Facts.Keys) {
                    $factsArray += @{
                        name  = $key
                        value = [string]$Facts[$key]
                    }
                }
            }

            $card = @{
                "@type"      = "MessageCard"
                "@context"   = "http://schema.org/extensions"
                themeColor   = $colorMap[$Severity]
                summary      = $Title
                sections     = @(
                    @{
                        activityTitle    = $Title
                        activitySubtitle = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss UTC")
                        text             = $Message
                        facts            = $factsArray
                        markdown         = $true
                    }
                )
            }

            $cardJson = $card | ConvertTo-Json -Depth 10

            Invoke-RestMethod -Uri $TeamsWebhookUrl -Method POST -Body $cardJson `
                -ContentType 'application/json' -TimeoutSec 30 -ErrorAction Stop

            $results.TeamsSent = $true
            Write-Output "Teams notification sent: $Title"
        }
        catch {
            $results.Errors += "Teams: $($_.Exception.Message)"
            Write-Warning "Failed to send Teams notification: $($_.Exception.Message)"
        }
    }

    #--- Email via Graph API ---
    if ($EmailFrom -and $EmailTo -and $EmailTo.Count -gt 0) {
        try {
            # Use provided headers or module-level headers
            $authHeaders = if ($Headers) { $Headers } else { $script:CurrentHeaders }
            if (-not $authHeaders) {
                throw "No authorization headers available. Call Get-GraphToken first or provide -Headers."
            }

            # Build email body
            $emailBody = if ($HtmlBody) {
                $HtmlBody
            }
            else {
                # Wrap plain text in basic HTML
                $factsHtml = ""
                if ($Facts) {
                    $factsHtml = "<table style='margin-top:12px;border-collapse:collapse;'>"
                    foreach ($key in $Facts.Keys) {
                        $factsHtml += "<tr><td style='padding:4px 12px 4px 0;font-weight:600;'>$key</td><td style='padding:4px 0;'>$($Facts[$key])</td></tr>"
                    }
                    $factsHtml += "</table>"
                }
                "<html><body><h2>$Title</h2><p>$Message</p>$factsHtml<hr/><p style='font-size:11px;color:#999;'>claudesharepoint | $(Get-Date -Format 'yyyy-MM-dd HH:mm')</p></body></html>"
            }

            # Build recipients
            $toRecipients = @($EmailTo | ForEach-Object {
                @{ emailAddress = @{ address = $_ } }
            })

            $mailPayload = @{
                message         = @{
                    subject      = $Title
                    body         = @{
                        contentType = "HTML"
                        content     = $emailBody
                    }
                    toRecipients = $toRecipients
                }
                saveToSentItems = $false
            }

            $mailJson = $mailPayload | ConvertTo-Json -Depth 10

            Invoke-RestMethod -Uri "https://graph.microsoft.com/v1.0/users/$EmailFrom/sendMail" `
                -Method POST -Headers $authHeaders -Body $mailJson `
                -ContentType 'application/json' -TimeoutSec 30 -ErrorAction Stop

            $results.EmailSent = $true
            Write-Output "Email notification sent to: $($EmailTo -join ', ')"
        }
        catch {
            $results.Errors += "Email: $($_.Exception.Message)"
            Write-Warning "Failed to send email notification: $($_.Exception.Message)"
        }
    }

    return $results
}

#endregion

#region Configuration Functions

function Get-SpaceAgentConfig {
    <#
    .SYNOPSIS
        Load all configuration from Azure Automation Variables
    .DESCRIPTION
        Retrieves configuration values from Automation Variables with sensible defaults.
        All variables are optional - defaults are used when not set.
    .OUTPUTS
        Hashtable containing all configuration values
    .EXAMPLE
        $config = Get-SpaceAgentConfig
        if ($config.DisableSchedule) { Write-Output "Schedule disabled"; return }
    #>
    [CmdletBinding()]
    [OutputType([hashtable])]
    param()

    $config = @{
        DisableSchedule    = $false
        ExclusionPatterns  = @()
        LastAssessmentTime = $null
        ExpireAfterDays    = 90
        MaxMajorVersions   = 100
        BatchSize          = 50
        # v2 additions
        StorageAccountName = $null
        KeyVaultName       = $null
        ClientId           = $null
        TenantId           = $null
        AdminUrl           = $null
        TeamsWebhookUrl    = $null
        NotificationEmail  = $null
        EmailFrom          = $null
    }

    # Helper to safely load an Automation Variable
    $loadVar = {
        param([string]$Name)
        try {
            return Get-AutomationVariable -Name $Name -ErrorAction SilentlyContinue
        }
        catch {
            return $null
        }
    }

    # Boolean variables
    $disable = & $loadVar 'DisableSchedule'
    if ($null -ne $disable) { $config.DisableSchedule = [bool]$disable }

    # String variables (comma-separated -> array)
    $patterns = & $loadVar 'ExclusionPatterns'
    if ($patterns) {
        $config.ExclusionPatterns = @($patterns -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }

    # DateTime variables
    $lastAssess = & $loadVar 'LastAssessmentTime'
    if ($lastAssess) { $config.LastAssessmentTime = [DateTime]$lastAssess }

    # Integer variables
    $expire = & $loadVar 'ExpireAfterDays'
    if ($null -ne $expire) { $config.ExpireAfterDays = [int]$expire }

    $maxVers = & $loadVar 'MaxMajorVersions'
    if ($null -ne $maxVers) { $config.MaxMajorVersions = [int]$maxVers }

    $batch = & $loadVar 'BatchSize'
    if ($null -ne $batch) { $config.BatchSize = [int]$batch }

    # v2 string variables
    $storageAccount = & $loadVar 'StorageAccountName'
    if ($storageAccount) { $config.StorageAccountName = $storageAccount }

    $kvName = & $loadVar 'KeyVaultName'
    if ($kvName) { $config.KeyVaultName = $kvName }

    $clientId = & $loadVar 'ClientId'
    if ($clientId) { $config.ClientId = $clientId }

    $tenantId = & $loadVar 'TenantId'
    if ($tenantId) { $config.TenantId = $tenantId }

    $adminUrl = & $loadVar 'AdminUrl'
    if ($adminUrl) { $config.AdminUrl = $adminUrl }

    $webhook = & $loadVar 'TeamsWebhookUrl'
    if ($webhook) { $config.TeamsWebhookUrl = $webhook }

    $notifEmail = & $loadVar 'NotificationEmail'
    if ($notifEmail) { $config.NotificationEmail = $notifEmail }

    $emailFrom = & $loadVar 'EmailFrom'
    if ($emailFrom) { $config.EmailFrom = $emailFrom }

    return $config
}

function Set-LastAssessmentTime {
    <#
    .SYNOPSIS
        Update LastAssessmentTime Automation Variable
    .PARAMETER Time
        DateTime to set (defaults to current time)
    #>
    [CmdletBinding()]
    param(
        [DateTime]$Time = (Get-Date)
    )

    Set-AutomationVariable -Name 'LastAssessmentTime' -Value $Time.ToString("o")
    Write-Output "LastAssessmentTime updated: $($Time.ToString('o'))"
}

#endregion

# Export public functions
Export-ModuleMember -Function @(
    # Authentication
    'Connect-SpaceAgent'
    # Token Refresh
    'Initialize-TokenRefresh'
    'Get-GraphToken'
    'Invoke-WithTokenRefresh'
    # Graph API
    'Invoke-GraphWithRetry'
    # Site Enumeration
    'Get-AllSites'
    'Split-IntoBatches'
    # Site Admin Escalation
    'Add-SiteAdmin'
    'Remove-SiteAdmin'
    # Table Storage
    'Write-TableResult'
    'Update-JobRun'
    # Checkpoints
    'Save-Checkpoint'
    'Get-Checkpoint'
    'Clear-Checkpoint'
    # Notifications
    'Send-Notification'
    # Configuration
    'Get-SpaceAgentConfig'
    'Set-LastAssessmentTime'
)
