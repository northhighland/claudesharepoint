function Invoke-Step08_RunAssessment {
    <#
    .SYNOPSIS
        Run a dry-run assessment to validate the deployment and estimate reclaimable space.
    .DESCRIPTION
        Triggers the Invoke-Orchestrator runbook with a small-batch dry run, polls for
        completion, then queries Azure Table Storage for results. Displays an aggregate
        summary. Failure here is non-fatal — all resources are already deployed.
    .PARAMETER Config
        Hashtable with setup configuration. Requires ResourceGroupName,
        AutomationAccountName, StorageAccountName.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Config
    )

    $ErrorActionPreference = 'Stop'
    $stepNumber = 8

    Write-StepBanner -Step $stepNumber -Message 'Running initial assessment (dry-run)'

    # ── Validate required config ──────────────────────────────────────────
    $requiredKeys = @('ResourceGroupName', 'AutomationAccountName', 'StorageAccountName')
    foreach ($key in $requiredKeys) {
        if ([string]::IsNullOrWhiteSpace($Config[$key])) {
            Write-StepBanner -Step $stepNumber -Status 'Fail' -Message "Missing required config: $key"
            throw "Config.$key is required for the assessment run."
        }
    }

    $rg     = $Config.ResourceGroupName
    $aaName = $Config.AutomationAccountName

    # ── Trigger orchestrator dry-run ──────────────────────────────────────
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Starting Invoke-Orchestrator (VersionCleanup, BatchSize=50, DryRun=true)...'

    $runbookParams = @{
        JobType   = 'VersionCleanup'
        BatchSize = '50'
        DryRun    = 'true'
    }

    $job = $null
    try {
        $job = Start-AzAutomationRunbook `
            -AutomationAccountName $aaName `
            -ResourceGroupName $rg `
            -Name 'Invoke-Orchestrator' `
            -Parameters $runbookParams `
            -ErrorAction Stop

        if (-not $job) {
            throw 'Start-AzAutomationRunbook returned null.'
        }

        $jobId = $job.JobId
        Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Job started: $jobId"
    }
    catch {
        Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Could not start assessment job: $_"
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'All resources are deployed. You can run the assessment manually from the Azure portal.'

        $Config['AssessmentResults'] = @{
            Status  = 'NotStarted'
            Message = "Job start failed: $_"
        }
        return $Config
    }

    # ── Poll for job completion ───────────────────────────────────────────
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Waiting for job to complete (timeout: 10 minutes)...'

    $timeoutSeconds = 600
    $pollInterval   = 15
    $elapsed        = 0
    $terminalStates = @('Completed', 'Failed', 'Stopped', 'Suspended')
    $jobStatus      = $null

    while ($elapsed -lt $timeoutSeconds) {
        try {
            $jobDetails = Get-AzAutomationJob `
                -AutomationAccountName $aaName `
                -ResourceGroupName $rg `
                -Id $jobId `
                -ErrorAction Stop

            $jobStatus = $jobDetails.Status

            if ($jobStatus -in $terminalStates) {
                break
            }
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Error polling job status: $_"
        }

        Write-Host '.' -NoNewline -ForegroundColor DarkGray
        Start-Sleep -Seconds $pollInterval
        $elapsed += $pollInterval
    }

    Write-Host ''  # End progress dots line

    # ── Handle job outcome ────────────────────────────────────────────────
    if ($elapsed -ge $timeoutSeconds -and $jobStatus -notin $terminalStates) {
        Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Job did not complete within $($timeoutSeconds / 60) minutes (last status: $jobStatus)."
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'The job is still running. Check the Azure portal for results.'

        $Config['AssessmentResults'] = @{
            Status  = 'Timeout'
            JobId   = $jobId
            Message = "Job still running after $($timeoutSeconds / 60) minutes."
        }
        return $Config
    }

    if ($jobStatus -eq 'Failed') {
        Write-StepBanner -Step $stepNumber -Status 'Warn' -Message 'Assessment job failed.'

        try {
            $jobOutput = Get-AzAutomationJobOutput `
                -AutomationAccountName $aaName `
                -ResourceGroupName $rg `
                -Id $jobId `
                -Stream 'Error' `
                -ErrorAction Stop

            foreach ($entry in $jobOutput) {
                $summary = $entry.Summary
                if (-not [string]::IsNullOrWhiteSpace($summary)) {
                    Write-StepBanner -Step $stepNumber -Status 'Info' -Message "  Error: $summary"
                }
            }
        }
        catch {
            Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Could not retrieve job error details: $_"
        }

        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'All resources are deployed. Investigate the error and re-run from the Azure portal.'

        $Config['AssessmentResults'] = @{
            Status  = 'Failed'
            JobId   = $jobId
            Message = 'Assessment job failed. See Automation Account job logs for details.'
        }
        return $Config
    }

    Write-StepBanner -Step $stepNumber -Status 'Success' -Message "Job completed with status: $jobStatus"

    # ── Retrieve job output to get RunId ──────────────────────────────────
    $runId = $null
    try {
        $jobOutput = Get-AzAutomationJobOutput `
            -AutomationAccountName $aaName `
            -ResourceGroupName $rg `
            -Id $jobId `
            -Stream 'Output' `
            -ErrorAction Stop

        foreach ($entry in $jobOutput) {
            $summary = $entry.Summary
            if ($summary -match 'RunId[:\s]+([a-f0-9\-]+)') {
                $runId = $Matches[1]
                break
            }
        }

        if (-not $runId) {
            # Fall back: use the job ID as RunId
            $runId = $jobId
            Write-StepBanner -Step $stepNumber -Status 'Info' -Message "RunId not found in output. Using JobId: $jobId"
        }
        else {
            Write-StepBanner -Step $stepNumber -Status 'Info' -Message "RunId: $runId"
        }
    }
    catch {
        $runId = $jobId
        Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Could not read job output: $_. Using JobId as RunId."
    }

    # ── Query results from Azure Table Storage ────────────────────────────
    Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Querying assessment results from Table Storage...'

    $sitesScanned    = 0
    $totalVersions   = 0
    $reclaimableBytes = 0

    try {
        $storageAccount = Get-AzStorageAccount -ResourceGroupName $rg -Name $Config.StorageAccountName -ErrorAction Stop
        $storageCtx     = $storageAccount.Context

        # Check if the results table exists
        $tableName = 'VersionCleanupResults'
        $table = Get-AzStorageTable -Name $tableName -Context $storageCtx -ErrorAction SilentlyContinue

        if ($table) {
            $cloudTable = $table.CloudTable

            # Query rows for this RunId
            $filter = [Microsoft.Azure.Cosmos.Table.TableQuery]::GenerateFilterCondition(
                'PartitionKey',
                [Microsoft.Azure.Cosmos.Table.QueryComparisons]::Equal,
                $runId
            )

            $results = Get-AzTableRow -Table $cloudTable -CustomFilter $filter -ErrorAction Stop

            if ($results -and $results.Count -gt 0) {
                $sitesScanned = $results.Count

                foreach ($row in $results) {
                    if ($row.PSObject.Properties['VersionCount']) {
                        $totalVersions += [int]$row.VersionCount
                    }
                    if ($row.PSObject.Properties['ReclaimableBytes']) {
                        $reclaimableBytes += [long]$row.ReclaimableBytes
                    }
                }
            }
            else {
                Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'No result rows found for this RunId. The table may use a different partition key.'

                # Fallback: try querying by RowKey prefix or scan recent entries
                $allRows = Get-AzTableRow -Table $cloudTable -ErrorAction SilentlyContinue | Select-Object -First 100
                if ($allRows -and $allRows.Count -gt 0) {
                    $sitesScanned = $allRows.Count
                    foreach ($row in $allRows) {
                        if ($row.PSObject.Properties['VersionCount']) {
                            $totalVersions += [int]$row.VersionCount
                        }
                        if ($row.PSObject.Properties['ReclaimableBytes']) {
                            $reclaimableBytes += [long]$row.ReclaimableBytes
                        }
                    }
                    Write-StepBanner -Step $stepNumber -Status 'Info' -Message '(Used fallback query for recent results)'
                }
            }
        }
        else {
            Write-StepBanner -Step $stepNumber -Status 'Info' -Message "Table '$tableName' not found. Results may be stored differently."
        }
    }
    catch {
        Write-StepBanner -Step $stepNumber -Status 'Warn' -Message "Could not query Table Storage: $_"
        Write-StepBanner -Step $stepNumber -Status 'Info' -Message 'Check the Automation Account job output for assessment details.'
    }

    # ── Format and display summary ────────────────────────────────────────
    $reclaimableGB = [math]::Round($reclaimableBytes / 1GB, 1)

    Write-Host ''
    Write-Host '  ┌──────────────────────────────────────────────┐' -ForegroundColor Cyan
    Write-Host '  │          Assessment Results (Dry Run)        │' -ForegroundColor Cyan
    Write-Host '  ├──────────────────────────────────────────────┤' -ForegroundColor Cyan

    if ($sitesScanned -gt 0) {
        Write-Host "  │  Sites scanned:        $($sitesScanned.ToString().PadLeft(10))         │" -ForegroundColor White
        Write-Host "  │  Versions found:       $($totalVersions.ToString().PadLeft(10))         │" -ForegroundColor White
        Write-Host "  │  Space reclaimable:    $("$reclaimableGB GB".PadLeft(10))         │" -ForegroundColor Green
    }
    else {
        Write-Host '  │  No results available yet.                 │' -ForegroundColor Yellow
        Write-Host '  │  Check the Azure portal for job output.    │' -ForegroundColor Yellow
    }

    Write-Host '  └──────────────────────────────────────────────┘' -ForegroundColor Cyan
    Write-Host ''

    # ── Store results in Config ───────────────────────────────────────────
    $Config['AssessmentResults'] = @{
        Status           = 'Completed'
        JobId            = $jobId
        RunId            = $runId
        SitesScanned     = $sitesScanned
        TotalVersions    = $totalVersions
        ReclaimableBytes = $reclaimableBytes
        ReclaimableGB    = $reclaimableGB
    }

    Write-StepBanner -Step $stepNumber -Status 'Success' -Message 'Assessment step complete'

    return $Config
}
