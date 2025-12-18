using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;

namespace KioskManager
{
    public class ProcessWatcher
    {
        private CancellationTokenSource? _cancellationTokenSource;
        private Task? _watchingTask;
        private readonly AppManager _appManager;
        private readonly ChromeManager _chromeManager;
        private readonly HealthMonitor _healthMonitor;

        public ProcessWatcher(AppManager appManager, ChromeManager chromeManager, HealthMonitor healthMonitor)
        {
            _appManager = appManager;
            _chromeManager = chromeManager;
            _healthMonitor = healthMonitor;
        }

        public void Start()
        {
            Stop();

            _cancellationTokenSource = new CancellationTokenSource();
            _watchingTask = Task.Run(async () => await WatchProcessesAsync(_cancellationTokenSource.Token));
            Logger.Info("Process watcher started");
        }

        public void Stop()
        {
            if (_cancellationTokenSource != null)
            {
                _cancellationTokenSource.Cancel();
                _cancellationTokenSource = null;
            }

            if (_watchingTask != null)
            {
                try
                {
                    _watchingTask.Wait(TimeSpan.FromSeconds(2));
                }
                catch
                {
                }
                _watchingTask = null;
            }

            Logger.Info("Process watcher stopped");
        }

        private async Task WatchProcessesAsync(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    if (!_appManager.IsAppRunning())
                    {
                        Logger.Warning("Next.js app is not running - attempting to restart");
                        _appManager.StartApp();
                        await Task.Delay(10000, cancellationToken);
                    }

                    if (!_healthMonitor.IsHealthy && _appManager.IsAppRunning())
                    {
                        Logger.Warning("Health check failed but app is running - will retry");
                    }

                    if (_config.AutoStartChrome && !_chromeManager.IsChromeRunning() && _healthMonitor.IsHealthy)
                    {
                        Logger.Info("Chrome is not running but app is healthy - starting Chrome");
                        await Task.Delay(5000, cancellationToken);
                        _chromeManager.StartKiosk();
                    }

                    await Task.Delay(5000, cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Logger.Error($"Error in process watcher: {ex.Message}");
                    await Task.Delay(5000, cancellationToken);
                }
            }
        }

        private readonly AppConfig _config = Config.Instance;
    }
}

