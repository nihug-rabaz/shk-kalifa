using System;
using System.IO;
using System.Windows.Forms;

namespace KioskManager
{
    public static class Logger
    {
        private static string _logPath = "";
        private static readonly object _lock = new object();

        public static void Initialize()
        {
            string exeDir = Path.GetDirectoryName(Application.ExecutablePath) ?? "";
            _logPath = Path.Combine(exeDir, "kiosk-manager.log");
        }

        public static void Log(string message, LogLevel level = LogLevel.Info)
        {
            lock (_lock)
            {
                try
                {
                    string timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                    string logMessage = $"[{timestamp}] [{level}] {message}";
                    
                    if (string.IsNullOrEmpty(_logPath))
                    {
                        Initialize();
                    }
                    
                    File.AppendAllText(_logPath, logMessage + Environment.NewLine);
                }
                catch
                {
                }
            }
        }

        public static void Info(string message) => Log(message, LogLevel.Info);
        public static void Warning(string message) => Log(message, LogLevel.Warning);
        public static void Error(string message) => Log(message, LogLevel.Error);
    }

    public enum LogLevel
    {
        Info,
        Warning,
        Error
    }
}




