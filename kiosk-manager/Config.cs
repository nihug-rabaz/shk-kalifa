using System;
using System.IO;
using System.Windows.Forms;
using Newtonsoft.Json;

namespace KioskManager
{
    public class AppConfig
    {
        public string ProjectPath { get; set; } = "";
        public string GitRepositoryUrl { get; set; } = "https://github.com/nihug-rabaz/shk-kalifa.git";
        public int Port { get; set; } = 3000;
        public int HealthCheckInterval { get; set; } = 10;
        public string HealthEndpoint { get; set; } = "/api/health";
        public string ExitPassword { get; set; } = "admin123";
        public string ChromePath { get; set; } = "";
        public string GitBranch { get; set; } = "main";
        public string GitRemote { get; set; } = "origin";
        public bool AutoStartChrome { get; set; } = true;
        public string ChromeKioskArgs { get; set; } = "--kiosk --fullscreen --disable-infobars";
    }

    public class Config
    {
        private static AppConfig? _instance;
        private static readonly object _lock = new object();
        private static string _configPath = "";

        public static AppConfig Instance
        {
            get
            {
                if (_instance == null)
                {
                    lock (_lock)
                    {
                        if (_instance == null)
                        {
                            Load();
                        }
                    }
                }
                return _instance!;
            }
        }

        public static void Initialize(string configPath)
        {
            _configPath = configPath;
            Load();
        }

        private static void Load()
        {
            if (string.IsNullOrEmpty(_configPath))
            {
                string exeDir = Path.GetDirectoryName(Application.ExecutablePath) ?? "";
                _configPath = Path.Combine(exeDir, "appsettings.json");
            }

            if (File.Exists(_configPath))
            {
                try
                {
                    string json = File.ReadAllText(_configPath);
                    _instance = JsonConvert.DeserializeObject<AppConfig>(json) ?? new AppConfig();
                }
                catch
                {
                    _instance = new AppConfig();
                }
            }
            else
            {
                _instance = new AppConfig();
                Save();
            }
        }

        public static void Save()
        {
            if (string.IsNullOrEmpty(_configPath))
            {
                string exeDir = Path.GetDirectoryName(Application.ExecutablePath) ?? "";
                _configPath = Path.Combine(exeDir, "appsettings.json");
            }

            try
            {
                string json = JsonConvert.SerializeObject(_instance, Formatting.Indented);
                File.WriteAllText(_configPath, json);
            }
            catch
            {
            }
        }
    }
}

