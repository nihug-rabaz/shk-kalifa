$ErrorActionPreference = "Stop"

$exePath = $args[0]
if (-not $exePath) {
    Write-Host "Usage: .\SetupAutoStart.ps1 <path-to-KioskManager.exe>" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $exePath)) {
    Write-Host "Error: EXE file not found at $exePath" -ForegroundColor Red
    exit 1
}

$taskName = "KioskManager-AutoStart"
$exeDir = Split-Path -Parent $exePath

Write-Host "Setting up auto-start for Kiosk Manager..." -ForegroundColor Cyan
Write-Host "EXE Path: $exePath" -ForegroundColor Gray
Write-Host "Task Name: $taskName" -ForegroundColor Gray

try {
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-Host "Removing existing task..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }

    $action = New-ScheduledTaskAction -Execute $exePath -WorkingDirectory $exeDir
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal -UserId $Env:USERNAME -LogonType Interactive -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

    Write-Host "Auto-start task created successfully!" -ForegroundColor Green
    Write-Host "The Kiosk Manager will start automatically when you log in." -ForegroundColor Green
}
catch {
    Write-Host "Error creating scheduled task: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "You may need to run this script as Administrator" -ForegroundColor Yellow
    exit 1
}




