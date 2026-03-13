#Requires -Version 7.0
<#
.SYNOPSIS
    Worker runbook: Cleans up old file versions on a batch of SharePoint sites.

.DESCRIPTION
    Processes a JSON array of site URLs, enumerating document libraries and deleting
    file versions older than ExpireAfterDays or exceeding MaxMajorVersions. Optionally
    applies a site-level version expiration policy. Results are written to Azure Table
    Storage (VersionCleanupResults).

    Designed to run as an Azure Automation child runbook invoked by Invoke-Orchestrator.

.PARAMETER SiteUrls
    JSON string array of SharePoint site URLs to process.

.PARAMETER RunId
    Unique identifier for this orchestrator job run (used as PartitionKey in Table Storage).

.PARAMETER KeyVaultName
    Name of the Azure Key Vault containing SPO credentials and certificates.

.PARAMETER StorageAccountName
    Name of the Azure Storage Account for writing results to Table Storage.

.PARAMETER ExpireAfterDays
    Delete versions older than this many days. Default: 90.

.PARAMETER MaxMajorVersions
    Maximum number of major versions to retain per file. Default: 100.

.PARAMETER DryRun
    When set, counts versions that would be deleted but does not actually delete them.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrls,

    [Parameter(Mandatory = $true)]
    [string]$RunId,

    [Parameter(Mandatory = $true)]
    [string]$KeyVaultName,

    [Parameter(Mandatory = $true)]
    [string]$StorageAccountName,

    [Parameter(Mandatory = $false)]
    [int]$ExpireAfterDays = 90,

    [Parameter(Mandatory = $false)]
    [int]$MaxMajorVersions = 100,

    [switch]$DryRun
)

# ---------------------------------------------------------------------------
# Module import and Azure authentication
# ---------------------------------------------------------------------------
$ErrorActionPreference = "Stop"

$modulePath = Join-Path $PSScriptRoot "modules" "SpaceAgent.psm1"
if (Test-Path $modulePath) {
    Import-Module $modulePath -Force
} else {
    Write-Warning "SpaceAgent module not found at $modulePath - using inline helpers"
}

# Authenticate with managed identity
Connect-AzAccount -Identity | Out-Null
Write-Output "[INFO] Authenticated with managed identity"

# Retrieve SPO certificate from Key Vault
$certSecret   = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "SPOCertificate" -AsPlainText
$clientId      = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "SPOClientId"    -AsPlainText
$tenantId      = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "TenantId"       -AsPlainText
$adminUrl      = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "SPOAdminUrl"    -AsPlainText

# Build temp certificate file for PnP
$certBytes = [Convert]::FromBase64String($certSecret)
$certTempPath = Join-Path ([System.IO.Path]::GetTempPath()) "spaceagent-$RunId.pfx"
[System.IO.File]::WriteAllBytes($certTempPath, $certBytes)

# Storage context for Table Storage output
$storageCtx = (Get-AzStorageAccount -ResourceGroupName (Get-AutomationVariable -Name "ResourceGroupName") -Name $StorageAccountName).Context
$tableName  = "VersionCleanupResults"
$table       = Get-AzStorageTable -Name $tableName -Context $storageCtx -ErrorAction SilentlyContinue
if (-not $table) {
    New-AzStorageTable -Name $tableName -Context $storageCtx | Out-Null
    $table = Get-AzStorageTable -Name $tableName -Context $storageCtx
}
$cloudTable = $table.CloudTable

# Versionable file extensions
$versionableExtensions = @(
    '.docx', '.doc', '.xlsx', '.xls',
    '.pptx', '.ppt', '.one', '.onetoc2',
    '.pdf', '.vsdx', '.vsd'
)

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

function Connect-PnPSite {
    param([string]$Url)
    Connect-PnPOnline -Url $Url -ClientId $clientId -Tenant $tenantId `
        -CertificatePath $certTempPath -ErrorAction Stop
}

function Add-SiteAdmin {
    <#
    .SYNOPSIS Temporarily adds the app as site collection admin via the admin centre.
    #>
    param([string]$SiteUrl)
    try {
        Connect-PnPSite -Url $adminUrl
        Set-PnPTenantSite -Identity $SiteUrl -Owners @($clientId) -ErrorAction Stop
        Disconnect-PnPOnline -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 15  # propagation delay
        return $true
    } catch {
        Write-Warning "Failed to add site admin for $SiteUrl : $($_.Exception.Message)"
        return $false
    }
}

function Remove-SiteAdmin {
    <#
    .SYNOPSIS Removes the app from site collection admins.
    #>
    param([string]$SiteUrl)
    try {
        Connect-PnPSite -Url $adminUrl
        Set-PnPTenantSite -Identity $SiteUrl -Owners @() -ErrorAction SilentlyContinue
        Disconnect-PnPOnline -ErrorAction SilentlyContinue
    } catch {
        Write-Warning "Failed to remove site admin for $SiteUrl : $($_.Exception.Message)"
    }
}

function Invoke-WithTokenRefresh {
    <#
    .SYNOPSIS Executes a script block, reconnecting PnP if the token expires mid-operation.
    #>
    param(
        [scriptblock]$ScriptBlock,
        [string]$SiteUrl,
        [string]$Operation = "Operation",
        [int]$MaxRetries = 3
    )

    $attempt = 0
    $delay = 10
    while ($attempt -lt $MaxRetries) {
        try {
            return & $ScriptBlock
        } catch {
            $attempt++
            $msg = $_.Exception.Message
            $isTokenError  = $msg -match "token|unauthorized|401|expired"
            $isThrottled   = $msg -match "throttl|429|Too Many Requests|retry"

            if ($isTokenError -and $attempt -lt $MaxRetries) {
                Write-Output "[WARN] $Operation - token expired, reconnecting (attempt $attempt)..."
                try { Disconnect-PnPOnline -ErrorAction SilentlyContinue } catch {}
                Connect-PnPSite -Url $SiteUrl
                continue
            }

            if ($isThrottled -and $attempt -lt $MaxRetries) {
                Write-Output "[WARN] $Operation - throttled, waiting ${delay}s (attempt $attempt)..."
                Start-Sleep -Seconds $delay
                $delay = [Math]::Min($delay * 2, 300)
                continue
            }

            throw
        }
    }
}

function Get-GraphToken {
    <#
    .SYNOPSIS Obtains a Graph API access token via the managed identity.
    #>
    $resource = "https://graph.microsoft.com"
    $tokenObj = Get-AzAccessToken -ResourceUrl $resource
    return $tokenObj.Token
}

function Get-DocumentLibrariesViaGraph {
    <#
    .SYNOPSIS Lists document libraries for a site using the Graph API.
    #>
    param([string]$SiteUrl)

    $graphToken = Get-GraphToken
    $headers = @{ Authorization = "Bearer $graphToken" }

    # Extract hostname and site path from URL
    $uri = [Uri]$SiteUrl
    $hostname = $uri.Host
    $sitePath = $uri.AbsolutePath.TrimEnd('/')

    # Resolve the site ID
    $siteEndpoint = "https://graph.microsoft.com/v1.0/sites/${hostname}:${sitePath}"
    $siteInfo = Invoke-RestMethod -Uri $siteEndpoint -Headers $headers -Method Get
    $siteId = $siteInfo.id

    # List drives (document libraries)
    $drivesEndpoint = "https://graph.microsoft.com/v1.0/sites/$siteId/drives"
    $drivesResponse = Invoke-RestMethod -Uri $drivesEndpoint -Headers $headers -Method Get

    return $drivesResponse.value
}

function Get-FoldersRecursive {
    <#
    .SYNOPSIS Discovers folders iteratively using breadth-first traversal to avoid timeouts.
    #>
    param([string]$LibraryTitle)

    $library = Get-PnPList -Identity $LibraryTitle -Includes RootFolder
    $rootUrl = $library.RootFolder.ServerRelativeUrl
    $siteServerRelUrl = (Get-PnPWeb).ServerRelativeUrl
    if ($siteServerRelUrl -eq "/") { $siteServerRelUrl = "" }

    $queue      = [System.Collections.Queue]::new()
    $allFolders = [System.Collections.ArrayList]::new()

    $null = $allFolders.Add($rootUrl)
    $rootSiteRelative = $rootUrl -replace "^$siteServerRelUrl/", ""
    $queue.Enqueue($rootSiteRelative)

    $maxDepth = 20
    $depth = 0

    while ($queue.Count -gt 0 -and $depth -lt $maxDepth) {
        $depth++
        $levelCount = $queue.Count
        for ($i = 0; $i -lt $levelCount; $i++) {
            $folderPath = $queue.Dequeue()
            try {
                $children = Get-PnPFolderInFolder -FolderSiteRelativeUrl $folderPath -ErrorAction Stop
                foreach ($child in $children) {
                    if ($child.Name -notin @('Forms', '_private', '_catalogs', '_cts')) {
                        $null = $allFolders.Add($child.ServerRelativeUrl)
                        $childRel = $child.ServerRelativeUrl -replace "^$siteServerRelUrl/", ""
                        $queue.Enqueue($childRel)
                    }
                }
            } catch {
                # Continue on folder-level errors
            }
        }
    }

    return $allFolders.ToArray()
}

function Write-TableResult {
    <#
    .SYNOPSIS Writes a single site result row to Azure Table Storage.
    #>
    param([hashtable]$Result)

    $rowKey = [Uri]::EscapeDataString($Result.SiteUrl)

    $properties = @{
        SiteUrl             = $Result.SiteUrl
        SiteTitle           = $Result.SiteTitle
        LibrariesProcessed  = $Result.LibrariesProcessed
        FilesScanned        = $Result.FilesScanned
        FilesWithVersions   = $Result.FilesWithVersions
        VersionsFound       = $Result.VersionsFound
        VersionsDeleted     = $Result.VersionsDeleted
        SpaceReclaimedMB    = $Result.SpaceReclaimedMB
        PolicyApplied       = $Result.PolicyApplied
        AdminEscalated      = $Result.AdminEscalated
        DryRun              = $Result.DryRun
        Status              = $Result.Status
        ErrorMessage        = $Result.ErrorMessage
        CompletedAt         = (Get-Date -Format "o")
    }

    Add-AzTableRow -Table $cloudTable -PartitionKey $RunId -RowKey $rowKey -Property $properties
}

# ---------------------------------------------------------------------------
# Main processing loop
# ---------------------------------------------------------------------------
$sites = $SiteUrls | ConvertFrom-Json
$cutoffDate = (Get-Date).AddDays(-$ExpireAfterDays)
$totalSites = $sites.Count
$siteIndex = 0

Write-Output "============================================"
Write-Output "  VERSION CLEANUP WORKER"
Write-Output "  RunId:            $RunId"
Write-Output "  Sites:            $totalSites"
Write-Output "  ExpireAfterDays:  $ExpireAfterDays"
Write-Output "  MaxMajorVersions: $MaxMajorVersions"
Write-Output "  Mode:             $(if ($DryRun) { 'DRY RUN' } else { 'LIVE' })"
Write-Output "============================================"

foreach ($siteUrl in $sites) {
    $siteIndex++
    $adminEscalated = $false

    $result = @{
        SiteUrl            = $siteUrl
        SiteTitle          = ""
        LibrariesProcessed = 0
        FilesScanned       = 0
        FilesWithVersions  = 0
        VersionsFound      = 0
        VersionsDeleted    = 0
        SpaceReclaimedMB   = 0
        PolicyApplied      = $false
        AdminEscalated     = $false
        DryRun             = [bool]$DryRun
        Status             = "Success"
        ErrorMessage       = ""
    }

    Write-Output ""
    Write-Output "[$siteIndex/$totalSites] Processing: $siteUrl"

    try {
        # --- Connect to site (with admin escalation on 403) ---
        $connected = $false
        try {
            Connect-PnPSite -Url $siteUrl
            $connected = $true
        } catch {
            if ($_.Exception.Message -match "Access denied|403|Forbidden|unauthorized") {
                Write-Output "  Access denied - escalating to site admin..."
                $added = Add-SiteAdmin -SiteUrl $siteUrl
                if ($added) {
                    $adminEscalated = $true
                    $result.AdminEscalated = $true
                    Connect-PnPSite -Url $siteUrl
                    $connected = $true
                }
            }
            if (-not $connected) { throw }
        }

        # --- Gather site metadata ---
        $web = Get-PnPWeb -Includes Title
        $result.SiteTitle = $web.Title
        Write-Output "  Site: $($web.Title)"

        # --- Discover document libraries via Graph API ---
        $graphLibraries = @()
        try {
            $graphLibraries = Get-DocumentLibrariesViaGraph -SiteUrl $siteUrl
            Write-Output "  Found $($graphLibraries.Count) document libraries via Graph"
        } catch {
            Write-Warning "  Graph library enumeration failed, falling back to PnP"
            $graphLibraries = @()
        }

        # Fall back to PnP if Graph didn't work
        $pnpLibraries = Get-PnPList | Where-Object {
            $_.BaseTemplate -eq 101 -and
            $_.Hidden -eq $false -and
            $_.Title -notin @("Form Templates", "Site Assets", "Style Library")
        }
        Write-Output "  PnP libraries: $($pnpLibraries.Count)"

        # --- Process each library ---
        foreach ($library in $pnpLibraries) {
            $result.LibrariesProcessed++
            Write-Output "    Library: $($library.Title)"

            try {
                # Discover folders recursively
                $folderPaths = Invoke-WithTokenRefresh -ScriptBlock {
                    Get-FoldersRecursive -LibraryTitle $library.Title
                } -SiteUrl $siteUrl -Operation "Folder discovery for $($library.Title)"

                Write-Output "      Folders: $($folderPaths.Count)"

                $libraryTitle = $library.Title
                $siteServerRelUrl = (Get-PnPWeb).ServerRelativeUrl
                if ($siteServerRelUrl -eq "/") { $siteServerRelUrl = "" }

                # Enumerate files per folder
                foreach ($folderPath in $folderPaths) {
                    try {
                        $files = Invoke-WithTokenRefresh -ScriptBlock {
                            Get-PnPListItem -List $libraryTitle -FolderServerRelativeUrl $folderPath -PageSize 500 |
                                Where-Object { $_.FileSystemObjectType -eq "File" }
                        } -SiteUrl $siteUrl -Operation "File enum in $folderPath"

                        if (-not $files) { continue }

                        foreach ($file in $files) {
                            $fileName = $file.FieldValues.FileLeafRef
                            $fileRef  = $file.FieldValues.FileRef
                            $fileExt  = [System.IO.Path]::GetExtension($fileName).ToLower()

                            if ($fileExt -notin $versionableExtensions) { continue }

                            $result.FilesScanned++

                            try {
                                $versions = Invoke-WithTokenRefresh -ScriptBlock {
                                    Get-PnPFileVersion -Url $fileRef -ErrorAction Stop
                                } -SiteUrl $siteUrl -Operation "Versions for $fileName"

                                if (-not $versions -or $versions.Count -eq 0) { continue }

                                $result.FilesWithVersions++
                                $sortedVersions = $versions | Sort-Object -Property Created -Descending

                                $versionIdx = 0
                                foreach ($ver in $sortedVersions) {
                                    $versionIdx++
                                    $shouldDelete = $false

                                    # Rule 1: older than cutoff
                                    if ($ver.Created -lt $cutoffDate) {
                                        $shouldDelete = $true
                                    }
                                    # Rule 2: exceeds max major versions
                                    elseif ($versionIdx -gt $MaxMajorVersions) {
                                        $shouldDelete = $true
                                    }

                                    if ($shouldDelete) {
                                        $result.VersionsFound++
                                        $versionSizeMB = $ver.Size / 1MB
                                        $result.SpaceReclaimedMB += $versionSizeMB

                                        if (-not $DryRun) {
                                            try {
                                                $ver.DeleteObject()
                                                $ctx = Get-PnPContext
                                                $ctx.ExecuteQuery()
                                                $result.VersionsDeleted++
                                            } catch {
                                                Write-Warning "      Failed to delete version of $fileName : $($_.Exception.Message)"
                                            }
                                        } else {
                                            $result.VersionsDeleted++  # Would-delete count
                                        }
                                    }
                                }
                            } catch {
                                # Skip files where version enumeration fails
                            }
                        }
                    } catch {
                        $errMsg = $_.Exception.Message
                        if ($errMsg -notmatch "list view threshold") {
                            Write-Warning "      Folder error ($folderPath): $errMsg"
                        }
                    }
                }
            } catch {
                Write-Warning "    Library error ($($library.Title)): $($_.Exception.Message)"
            }
        }

        # --- Apply site-level version policy (non-DryRun only) ---
        if (-not $DryRun) {
            try {
                Connect-PnPSite -Url $adminUrl
                Set-PnPTenantSite -Identity $siteUrl `
                    -EnableAutoExpirationVersionTrim $true `
                    -ExpireVersionsAfterDays $ExpireAfterDays `
                    -MajorVersionLimit $MaxMajorVersions `
                    -ErrorAction Stop
                $result.PolicyApplied = $true
                Write-Output "  Version expiration policy applied"
                Disconnect-PnPOnline -ErrorAction SilentlyContinue
            } catch {
                Write-Warning "  Failed to apply version policy: $($_.Exception.Message)"
            }
        }

        $result.SpaceReclaimedMB = [math]::Round($result.SpaceReclaimedMB, 2)

        Write-Output "  Results: $($result.FilesScanned) files scanned, $($result.VersionsFound) versions eligible, $($result.VersionsDeleted) $(if ($DryRun) { 'would delete' } else { 'deleted' }), $($result.SpaceReclaimedMB) MB"

    } catch {
        $result.Status = "Error"
        $result.ErrorMessage = $_.Exception.Message
        Write-Output "  ERROR: $($_.Exception.Message)"
    } finally {
        # Disconnect PnP
        try { Disconnect-PnPOnline -ErrorAction SilentlyContinue } catch {}

        # Remove admin access if we escalated
        if ($adminEscalated) {
            Write-Output "  Cleaning up admin access..."
            Remove-SiteAdmin -SiteUrl $siteUrl
        }

        # Write result to Table Storage
        try {
            Write-TableResult -Result $result
        } catch {
            Write-Warning "  Failed to write table result: $($_.Exception.Message)"
        }
    }
}

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
if (Test-Path $certTempPath) {
    Remove-Item $certTempPath -Force -ErrorAction SilentlyContinue
}

# Structured output for Azure Automation job
$summary = @{
    RunId          = $RunId
    SitesProcessed = $totalSites
    TotalVersions  = ($sites | ForEach-Object { 0 } | Measure-Object -Sum).Sum  # placeholder
    Mode           = if ($DryRun) { "DryRun" } else { "Live" }
    CompletedAt    = (Get-Date -Format "o")
}

Write-Output ""
Write-Output "============================================"
Write-Output "  VERSION CLEANUP COMPLETE"
Write-Output "  Sites processed: $totalSites"
Write-Output "  Mode: $(if ($DryRun) { 'DRY RUN' } else { 'LIVE' })"
Write-Output "============================================"

$summary | ConvertTo-Json -Depth 3 | Write-Output
