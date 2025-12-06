# Main setup script for kiosk mode
# This script sets up everything needed for automatic kiosk operation

param(
    [switch]$SkipPM2Install
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  shk-kalifa Kiosk Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectPath = $PSScriptRoot + "\.."
$projectPath = Resolve-Path $projectPath

Write-Host "Project path: $projectPath" -ForegroundColor Gray
Write-Host ""

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "WARNING: Not running as administrator" -ForegroundColor Yellow
    Write-Host "Some features may require administrator privileges" -ForegroundColor Yellow
    Write-Host ""
}

if (-not $SkipPM2Install) {
    Write-Host "Step 1: Installing PM2..." -ForegroundColor Cyan
    & "$PSScriptRoot\install-pm2.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: PM2 installation failed" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
}

Write-Host "Step 2: Building application..." -ForegroundColor Cyan
Set-Location $projectPath
try {
    npm install
    npm run build
    Write-Host "Build completed successfully!" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    exit 1
}
Write-Host ""

Write-Host "Step 3: Starting application..." -ForegroundColor Cyan
& "$PSScriptRoot\start-app.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to start application" -ForegroundColor Red
    exit 1
}
Write-Host ""

Write-Host "Step 4: Creating Task Scheduler tasks..." -ForegroundColor Cyan

$taskName1 = "shk-kalifa-start-app"
$taskName2 = "shk-kalifa-start-chrome"
$taskName3 = "shk-kalifa-usb-update"

$startAppScript = Join-Path $PSScriptRoot "start-app.ps1"
$startChromeScript = Join-Path $PSScriptRoot "start-chrome.ps1"
$updateUsbScript = Join-Path $PSScriptRoot "update-on-usb.ps1"

$userProfile = $Env:USERPROFILE

try {
    Write-Host "Creating task: $taskName1 (Start app on login)..." -ForegroundColor Gray
    
    $action1 = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$startAppScript`""
    $trigger1 = New-ScheduledTaskTrigger -AtLogOn
    $principal1 = New-ScheduledTaskPrincipal -UserId $Env:USERNAME -LogonType Interactive -RunLevel Highest
    $settings1 = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    
    Register-ScheduledTask -TaskName $taskName1 -Action $action1 -Trigger $trigger1 -Principal $principal1 -Settings $settings1 -Force | Out-Null
    Write-Host "Task created successfully!" -ForegroundColor Green
    
    Write-Host "Creating task: $taskName2 (Start Chrome 10 seconds after login)..." -ForegroundColor Gray
    
    $action2 = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$startChromeScript`""
    $trigger2 = New-ScheduledTaskTrigger -AtLogOn
    $trigger2.Delay = "PT10S"
    $principal2 = New-ScheduledTaskPrincipal -UserId $Env:USERNAME -LogonType Interactive -RunLevel Highest
    $settings2 = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    
    Register-ScheduledTask -TaskName $taskName2 -Action $action2 -Trigger $trigger2 -Principal $principal2 -Settings $settings2 -Force | Out-Null
    Write-Host "Task created successfully!" -ForegroundColor Green
    
    Write-Host "Creating task: $taskName3 (USB update listener)..." -ForegroundColor Gray
    
    $action3 = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$updateUsbScript`""
    
    $query = @"
SELECT * FROM Win32_VolumeChangeEvent WHERE EventType = 2
"@
    
    $trigger3 = New-ScheduledTaskTrigger -AtStartup
    $principal3 = New-ScheduledTaskPrincipal -UserId $Env:USERNAME -LogonType Interactive -RunLevel Highest
    $settings3 = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    
    try {
        Register-ScheduledTask -TaskName $taskName3 -Action $action3 -Trigger $trigger3 -Principal $principal3 -Settings $settings3 -Force | Out-Null
        Write-Host "Task created successfully!" -ForegroundColor Green
    } catch {
        Write-Host "WARNING: Could not create USB update task with WMI trigger" -ForegroundColor Yellow
        Write-Host "Creating alternative task that runs update script..." -ForegroundColor Yellow
        
        $trigger3Alt = New-ScheduledTaskTrigger -Daily -At "00:00"
        Register-ScheduledTask -TaskName $taskName3 -Action $action3 -Trigger $trigger3Alt -Principal $principal3 -Settings $settings3 -Force | Out-Null
        Write-Host "Alternative task created (will need manual USB detection setup)" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "ERROR: Failed to create scheduled tasks" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "You may need to run this script as administrator" -ForegroundColor Yellow
}

Write-Host ""

Write-Host "Step 5: Setting up USB detection listener..." -ForegroundColor Cyan

$usbListenerScript = @"
# USB Detection Listener
# This script runs continuously and detects USB connections

`$ErrorActionPreference = "Continue"

`$projectPath = "$projectPath"
`$updateScript = "$updateUsbScript"

`$logFile = Join-Path `$projectPath "kiosk-setup\usb-listener-log.txt"

function Write-Log {
    param([string]`$Message)
    `$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    `$logMessage = "[`$timestamp] `$Message"
    Write-Host `$logMessage
    Add-Content -Path `$logFile -Value `$logMessage
}

Write-Log "USB Detection Listener started..."
Write-Log "Monitoring for USB connections..."

try {
    Register-WmiEvent -Query "SELECT * FROM Win32_VolumeChangeEvent WHERE EventType = 2" -Action {
        Write-Log "USB device detected! Starting update..."
        Start-Sleep -Seconds 2
        & `$updateScript
    } | Out-Null
    
    Write-Log "WMI Event registered successfully"
    Write-Log "Listener is running. Press Ctrl+C to stop."
    
    while (`$true) {
        Start-Sleep -Seconds 10
    }
} catch {
    Write-Log "ERROR: Failed to register WMI Event - `$(`$_.Exception.Message)"
    Write-Log "USB detection may not work automatically"
    Write-Log "You may need to run update-on-usb.ps1 manually when connecting USB"
}
"@

$usbListenerPath = Join-Path $PSScriptRoot "usb-listener.ps1"
$usbListenerScript | Out-File -FilePath $usbListenerPath -Encoding UTF8

Write-Host "USB listener script created at: $usbListenerPath" -ForegroundColor Green

Write-Host "Creating Task for USB listener (runs at startup)..." -ForegroundColor Cyan

try {
    $actionUsbListener = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$usbListenerPath`""
    $triggerUsbListener = New-ScheduledTaskTrigger -AtStartup
    $principalUsbListener = New-ScheduledTaskPrincipal -UserId $Env:USERNAME -LogonType Interactive -RunLevel Highest
    $settingsUsbListener = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    
    Register-ScheduledTask -TaskName "shk-kalifa-usb-listener" -Action $actionUsbListener -Trigger $triggerUsbListener -Principal $principalUsbListener -Settings $settingsUsbListener -Force | Out-Null
    Write-Host "USB listener task created successfully!" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Could not create USB listener task" -ForegroundColor Yellow
    Write-Host "You may need to run usb-listener.ps1 manually or set it up as a service" -ForegroundColor Yellow
}

Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Restart your computer to test auto-start" -ForegroundColor White
Write-Host "2. Connect a USB device to test auto-update" -ForegroundColor White
Write-Host "3. Check Task Scheduler for the created tasks" -ForegroundColor White
Write-Host ""
Write-Host "To manually start the kiosk:" -ForegroundColor Yellow
Write-Host "  .\kiosk-setup\start-app.ps1" -ForegroundColor White
Write-Host "  .\kiosk-setup\start-chrome.ps1" -ForegroundColor White
Write-Host ""
Write-Host "To manually update:" -ForegroundColor Yellow
Write-Host "  .\kiosk-setup\update-on-usb.ps1" -ForegroundColor White
Write-Host ""

