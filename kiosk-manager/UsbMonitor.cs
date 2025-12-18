using System;
using System.Management;
using System.Threading;
using System.Threading.Tasks;

namespace KioskManager
{
    public class UsbMonitor
    {
        private ManagementEventWatcher? _watcher;
        private readonly AppManager _appManager;
        private readonly ChromeManager _chromeManager;

        public event EventHandler? UsbConnected;

        public UsbMonitor(AppManager appManager, ChromeManager chromeManager)
        {
            _appManager = appManager;
            _chromeManager = chromeManager;
        }

        public void Start()
        {
            Stop();

            try
            {
                WqlEventQuery query = new WqlEventQuery("SELECT * FROM Win32_VolumeChangeEvent WHERE EventType = 2");
                _watcher = new ManagementEventWatcher(query);
                _watcher.EventArrived += OnUsbConnected;
                _watcher.Start();

                Logger.Info("USB monitor started");
            }
            catch (Exception ex)
            {
                Logger.Error($"Failed to start USB monitor: {ex.Message}");
            }
        }

        public void Stop()
        {
            if (_watcher != null)
            {
                try
                {
                    _watcher.Stop();
                    _watcher.Dispose();
                }
                catch
                {
                }
                _watcher = null;
            }

            Logger.Info("USB monitor stopped");
        }

        private async void OnUsbConnected(object sender, EventArrivedEventArgs e)
        {
            try
            {
                Logger.Info("USB device detected - starting update process");

                UsbConnected?.Invoke(this, EventArgs.Empty);

                _chromeManager.StopKiosk();
                _appManager.StopApp();

                await Task.Delay(2000);

                bool hasUpdates = await _appManager.CheckForUpdates();
                if (hasUpdates)
                {
                    Logger.Info("Updates found - pulling changes");
                    await _appManager.PullUpdates();
                    await _appManager.InstallDependencies();
                    await _appManager.BuildProject();
                }

                _appManager.StartApp();

                await Task.Delay(10000);

                if (_appManager.CheckBuildExists())
                {
                    _chromeManager.StartKiosk();
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"Error handling USB connection: {ex.Message}");
            }
        }
    }
}

