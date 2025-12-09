# Start Chrome in kiosk mode pointing to localhost:3000
# This script waits for the app to be ready, then opens Chrome in fullscreen kiosk mode

$ErrorActionPreference = "Stop"

$url = "http://localhost:3000"
$maxWaitTime = 60
$waitInterval = 2

Write-Host "Waiting for application to be ready at $url..." -ForegroundColor Cyan

$ready = $false
$elapsed = 0

while ($elapsed -lt $maxWaitTime -and -not $ready) {
    try {
        $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $ready = $true
            Write-Host "Application is ready!" -ForegroundColor Green
        }
    } catch {
        Write-Host "Waiting for application... ($elapsed seconds)" -ForegroundColor Gray
        Start-Sleep -Seconds $waitInterval
        $elapsed += $waitInterval
    }
}

if (-not $ready) {
    Write-Host "WARNING: Application may not be ready, but opening Chrome anyway..." -ForegroundColor Yellow
}

Write-Host "Checking if Chrome is already running..." -ForegroundColor Cyan

$chromeProcesses = Get-Process -Name "chrome" -ErrorAction SilentlyContinue
if ($chromeProcesses) {
    Write-Host "Chrome is already running. Closing existing instances..." -ForegroundColor Yellow
    Stop-Process -Name "chrome" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Write-Host "Starting Chrome in kiosk mode..." -ForegroundColor Cyan

$chromePaths = @(
    "$Env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$Env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$Env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

$chromePath = $null
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $chromePath = $path
        break
    }
}

if (-not $chromePath) {
    Write-Host "ERROR: Chrome not found. Please install Google Chrome." -ForegroundColor Red
    exit 1
}

Write-Host "Chrome found at: $chromePath" -ForegroundColor Green

$chromeArgs = @(
    "--kiosk",
    "--fullscreen",
    "--disable-infobars",
    "--disable-session-crashed-bubble",
    "--disable-restore-session-state",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-plugins",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-translate",
    "--hide-scrollbars",
    "--disable-features=TranslateUI",
    $url
)

try {
    Start-Process -FilePath $chromePath -ArgumentList $chromeArgs
    Write-Host "Chrome started in kiosk mode!" -ForegroundColor Green
    Write-Host "Press Ctrl+Alt+Delete to exit kiosk mode" -ForegroundColor Yellow
} catch {
    Write-Host "ERROR: Failed to start Chrome" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}



