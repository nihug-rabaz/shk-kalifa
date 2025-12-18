# Kiosk Manager

Windows application for managing the Next.js kiosk application automatically.

## Features

- System Tray integration
- Automatic startup on Windows login
- Health monitoring of the Next.js application
- Automatic Git updates on startup and USB connection
- Automatic build and dependency installation
- Chrome kiosk mode management
- USB monitoring for automatic updates
- Process monitoring and auto-restart

## Configuration

Edit `appsettings.json` to configure:

- `ProjectPath`: Path where the project should be located
- `GitRepositoryUrl`: Git repository URL (default: https://github.com/nihug-rabaz/shk-kalifa.git)
- `Port`: Port number for the Next.js app (default: 3000)
- `HealthCheckInterval`: Health check interval in seconds (default: 10)
- `ExitPassword`: Password required to exit the application
- `AutoStartChrome`: Whether to automatically start Chrome in kiosk mode

## Building

1. Install .NET 6 SDK or later
2. Open terminal in `kiosk-manager` directory
3. Run: `dotnet build -c Release`
4. The EXE will be in `bin/Release/net6.0-windows/`

## Setup Auto-Start

After building, run:

```powershell
.\SetupAutoStart.ps1 "path\to\KioskManager.exe"
```

Or manually create a Task Scheduler task that runs the EXE on login.

## Usage

1. Configure `appsettings.json` with your project path
2. Run `KioskManager.exe`
3. The application will:
   - Check if project directory exists, clone if not
   - Check for NPM installation
   - Check for Git updates
   - Build if needed
   - Start the Next.js application
   - Monitor health
   - Start Chrome in kiosk mode when ready

## System Tray Menu

Right-click the system tray icon for:
- **Open UI**: Opens the application in default browser
- **Status**: Shows current status
- **Exit**: Requires password to exit

## Logs

Logs are written to `kiosk-manager.log` in the same directory as the EXE.




