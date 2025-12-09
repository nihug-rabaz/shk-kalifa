# Start the Next.js application with PM2
# This script builds and starts the app if not already running

$ErrorActionPreference = "Stop"

$projectPath = $PSScriptRoot + "\.."
$projectPath = Resolve-Path $projectPath

Write-Host "Starting shk-kalifa application..." -ForegroundColor Cyan
Write-Host "Project path: $projectPath" -ForegroundColor Gray

Set-Location $projectPath

Write-Host "Checking if app is already running..." -ForegroundColor Cyan

try {
    $existingProcess = pm2 list | Select-String "shk-kalifa"
    if ($existingProcess) {
        Write-Host "App is already running. Restarting..." -ForegroundColor Yellow
        pm2 restart shk-kalifa
        Write-Host "App restarted successfully!" -ForegroundColor Green
        exit 0
    }
} catch {
    Write-Host "PM2 list check failed, continuing..." -ForegroundColor Gray
}

Write-Host "Checking if build exists..." -Foreground Cyan

if (-not (Test-Path ".next")) {
    Write-Host "Build not found. Building application..." -ForegroundColor Yellow
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Build failed"
        }
        Write-Host "Build completed successfully!" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Build failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Build found. Skipping build step." -ForegroundColor Gray
}

Write-Host "Starting application with PM2..." -ForegroundColor Cyan

try {
    pm2 delete shk-kalifa 2>$null
    
    pm2 start npm --name "shk-kalifa" -- start
    if ($LASTEXITCODE -ne 0) {
        throw "PM2 start failed"
    }
    
    pm2 save
    
    Write-Host "Application started successfully!" -ForegroundColor Green
    Write-Host "Waiting for server to be ready..." -ForegroundColor Cyan
    
    $maxAttempts = 30
    $attempt = 0
    $ready = $false
    
    while ($attempt -lt $maxAttempts -and -not $ready) {
        Start-Sleep -Seconds 2
        $attempt++
        
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:3000" -Method GET -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                $ready = $true
                Write-Host "Server is ready!" -ForegroundColor Green
            }
        } catch {
            Write-Host "Waiting for server... ($attempt/$maxAttempts)" -ForegroundColor Gray
        }
    }
    
    if (-not $ready) {
        Write-Host "WARNING: Server may not be ready yet" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "ERROR: Failed to start application" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host "`nApplication is running!" -ForegroundColor Green
pm2 list




