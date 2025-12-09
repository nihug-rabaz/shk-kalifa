# Auto-update script triggered on USB connection
# This script stops the app, pulls latest changes, rebuilds, and restarts

$ErrorActionPreference = "Continue"

$projectPath = $PSScriptRoot + "\.."
$projectPath = Resolve-Path $projectPath

$logFile = Join-Path $projectPath "kiosk-setup\update-log.txt"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $logFile -Value $logMessage
}

Write-Log "USB detected - Starting update process..."

Set-Location $projectPath

Write-Log "Stopping PM2 process..."
try {
    pm2 stop shk-kalifa 2>$null
    Start-Sleep -Seconds 2
    Write-Log "PM2 process stopped"
} catch {
    Write-Log "WARNING: Could not stop PM2 process (may not be running)"
}

Write-Log "Fetching latest changes from Git..."
try {
    git fetch origin main
    if ($LASTEXITCODE -ne 0) {
        throw "Git fetch failed"
    }
    Write-Log "Git fetch completed"
} catch {
    Write-Log "ERROR: Git fetch failed - $($_.Exception.Message)"
    Write-Log "Attempting to continue anyway..."
}

Write-Log "Pulling latest changes..."
try {
    $pullOutput = git pull origin main 2>&1
    Write-Log "Git pull output: $pullOutput"
    
    if ($LASTEXITCODE -ne 0) {
        throw "Git pull failed"
    }
    Write-Log "Git pull completed"
} catch {
    Write-Log "ERROR: Git pull failed - $($_.Exception.Message)"
    Write-Log "Attempting to continue anyway..."
}

$packageJsonChanged = $false
try {
    $gitStatus = git status --porcelain package.json package-lock.json
    if ($gitStatus) {
        $packageJsonChanged = $true
        Write-Log "package.json changed - will run npm install"
    }
} catch {
    Write-Log "WARNING: Could not check package.json status"
}

if ($packageJsonChanged) {
    Write-Log "Installing/updating dependencies..."
    try {
        npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed"
        }
        Write-Log "Dependencies installed successfully"
    } catch {
        Write-Log "ERROR: npm install failed - $($_.Exception.Message)"
    }
}

Write-Log "Building application..."
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed"
    }
    Write-Log "Build completed successfully"
} catch {
    Write-Log "ERROR: Build failed - $($_.Exception.Message)"
    Write-Log "Attempting to restart with existing build..."
}

Write-Log "Restarting PM2 process..."
try {
    pm2 restart shk-kalifa
    if ($LASTEXITCODE -ne 0) {
        pm2 start npm --name "shk-kalifa" -- start
    }
    pm2 save
    Write-Log "PM2 process restarted"
} catch {
    Write-Log "ERROR: Failed to restart PM2 - $($_.Exception.Message)"
}

Write-Log "Waiting for server to be ready..."
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
            Write-Log "Server is ready!"
        }
    } catch {
        if ($attempt % 5 -eq 0) {
            Write-Log "Waiting for server... ($attempt/$maxAttempts)"
        }
    }
}

if ($ready) {
    Write-Log "Reloading Chrome..."
    try {
        $chromeProcesses = Get-Process -Name "chrome" -ErrorAction SilentlyContinue
        if ($chromeProcesses) {
            Add-Type -AssemblyName System.Windows.Forms
            [System.Windows.Forms.SendKeys]::SendWait("^{F5}")
            Start-Sleep -Milliseconds 500
            [System.Windows.Forms.SendKeys]::SendWait("{F5}")
            Write-Log "Chrome reloaded"
        } else {
            Write-Log "Chrome not found - will be started by startup script"
        }
    } catch {
        Write-Log "WARNING: Could not reload Chrome - $($_.Exception.Message)"
    }
} else {
    Write-Log "WARNING: Server may not be ready yet"
}

Write-Log "Update process completed!"




