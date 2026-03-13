function Write-StepBanner {
    <#
    .SYNOPSIS
        Display a consistent "Step X of 8" banner with status indicators.
    #>
    param(
        [int]$Step,
        [int]$Total = 8,
        [string]$Message,
        [ValidateSet('Start', 'Success', 'Fail', 'Info', 'Warn')]
        [string]$Status = 'Start'
    )

    switch ($Status) {
        'Start' {
            Write-Host ""
            Write-Host " Step $Step of $Total " -NoNewline -BackgroundColor DarkCyan -ForegroundColor White
            Write-Host "  $Message" -ForegroundColor Cyan
        }
        'Success' {
            Write-Host "   ✓ $Message" -ForegroundColor Green
        }
        'Fail' {
            Write-Host "   ✗ $Message" -ForegroundColor Red
        }
        'Info' {
            Write-Host "   → $Message" -ForegroundColor Gray
        }
        'Warn' {
            Write-Host "   ! $Message" -ForegroundColor Yellow
        }
    }
}
