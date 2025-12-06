# Install PM2 globally if not already installed
# This script checks for Node.js and PM2, and installs PM2 if needed

$ErrorActionPreference = "Stop"

Write-Host "Checking Node.js installation..." -ForegroundColor Cyan

try {
    $nodeVersion = node --version
    Write-Host "Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js 18+ from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

Write-Host "Checking PM2 installation..." -ForegroundColor Cyan

try {
    $pm2Version = pm2 --version
    Write-Host "PM2 found: $pm2Version" -ForegroundColor Green
    Write-Host "PM2 is already installed. Skipping installation." -ForegroundColor Yellow
} catch {
    Write-Host "PM2 not found. Installing PM2 globally..." -ForegroundColor Yellow
    
    try {
        npm install -g pm2
        Write-Host "PM2 installed successfully!" -ForegroundColor Green
        
        $pm2Version = pm2 --version
        Write-Host "PM2 version: $pm2Version" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Failed to install PM2" -ForegroundColor Red
        Write-Host "Make sure you have administrator privileges" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "Setting up PM2 startup script..." -ForegroundColor Cyan

try {
    pm2 startup
    Write-Host "PM2 startup configured. Follow the instructions above to enable auto-start." -ForegroundColor Green
} catch {
    Write-Host "WARNING: Could not configure PM2 startup automatically" -ForegroundColor Yellow
    Write-Host "You may need to run 'pm2 startup' manually as administrator" -ForegroundColor Yellow
}

Write-Host "`nInstallation complete!" -ForegroundColor Green

