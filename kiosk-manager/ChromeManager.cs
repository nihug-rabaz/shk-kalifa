using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace KioskManager
{
    public class ChromeManager
    {
        private Process? _chromeProcess;
        private readonly AppConfig _config;

        public ChromeManager()
        {
            _config = Config.Instance;
        }

        public string? FindChromePath()
        {
            if (!string.IsNullOrEmpty(_config.ChromePath) && File.Exists(_config.ChromePath))
            {
                return _config.ChromePath;
            }

            string[] possiblePaths = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
            };

            foreach (string path in possiblePaths)
            {
                if (File.Exists(path))
                {
                    Logger.Info($"Chrome found at: {path}");
                    return path;
                }
            }

            Logger.Warning("Chrome not found in common locations");
            return null;
        }

        public bool StartKiosk()
        {
            if (!_config.AutoStartChrome)
            {
                return false;
            }

            string? chromePath = FindChromePath();
            if (chromePath == null)
            {
                Logger.Error("Chrome executable not found");
                return false;
            }

            StopKiosk();

            try
            {
                string url = $"http://localhost:{_config.Port}";
                string arguments = $"{_config.ChromeKioskArgs} \"{url}\"";

                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = chromePath,
                    Arguments = arguments,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                _chromeProcess = Process.Start(startInfo);
                if (_chromeProcess != null)
                {
                    Logger.Info($"Chrome started in kiosk mode (PID: {_chromeProcess.Id})");
                    return true;
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"Exception starting Chrome: {ex.Message}");
            }

            return false;
        }

        public void StopKiosk()
        {
            if (_chromeProcess != null && !_chromeProcess.HasExited)
            {
                try
                {
                    Logger.Info("Stopping Chrome...");
                    _chromeProcess.Kill();
                    _chromeProcess.WaitForExit(5000);
                    Logger.Info("Chrome stopped");
                }
                catch (Exception ex)
                {
                    Logger.Error($"Error stopping Chrome: {ex.Message}");
                }
                finally
                {
                    _chromeProcess = null;
                }
            }

            Process[] chromeProcesses = Process.GetProcessesByName("chrome");
            foreach (Process proc in chromeProcesses)
            {
                try
                {
                    proc.Kill();
                    Logger.Info($"Killed chrome process: {proc.Id}");
                }
                catch
                {
                }
            }
        }

        public bool IsChromeRunning()
        {
            if (_chromeProcess != null && !_chromeProcess.HasExited)
            {
                return true;
            }

            return Process.GetProcessesByName("chrome").Length > 0;
        }

        public void ReloadPage()
        {
            if (IsChromeRunning())
            {
                try
                {
                    System.Windows.Forms.SendKeys.SendWait("^{F5}");
                    System.Threading.Thread.Sleep(500);
                    System.Windows.Forms.SendKeys.SendWait("{F5}");
                    Logger.Info("Chrome page reloaded");
                }
                catch (Exception ex)
                {
                    Logger.Error($"Error reloading Chrome page: {ex.Message}");
                }
            }
        }
    }
}

