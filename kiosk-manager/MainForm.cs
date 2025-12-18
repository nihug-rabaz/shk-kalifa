using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace KioskManager
{
    public partial class MainForm : Form
    {
        private NotifyIcon? _notifyIcon;
        private ContextMenuStrip? _contextMenu;
        private AppManager _appManager = null!;
        private ChromeManager _chromeManager = null!;
        private HealthMonitor _healthMonitor = null!;
        private UsbMonitor _usbMonitor = null!;
        private ProcessWatcher _processWatcher = null!;
        private bool _isInitializing = false;

        public MainForm()
        {
            InitializeComponent();
            InitializeManagers();
        }

        private void InitializeComponent()
        {
            this.WindowState = FormWindowState.Minimized;
            this.ShowInTaskbar = false;
            this.Visible = false;

            _contextMenu = new ContextMenuStrip();
            _contextMenu.Items.Add("Open UI", null, OnOpenUI);
            _contextMenu.Items.Add("Status", null, OnShowStatus);
            _contextMenu.Items.Add("-");
            _contextMenu.Items.Add("Exit", null, OnExit);

            _notifyIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                ContextMenuStrip = _contextMenu,
                Text = "Kiosk Manager",
                Visible = true
            };

            _notifyIcon.DoubleClick += OnOpenUI;
        }

        private void InitializeManagers()
        {
            Logger.Initialize();
            Logger.Info("Kiosk Manager starting...");

            Config.Initialize("");
            _appManager = new AppManager();
            _chromeManager = new ChromeManager();
            _healthMonitor = new HealthMonitor();
            _usbMonitor = new UsbMonitor(_appManager, _chromeManager);
            _processWatcher = new ProcessWatcher(_appManager, _chromeManager, _healthMonitor);

            _healthMonitor.HealthStatusChanged += OnHealthStatusChanged;
            _usbMonitor.UsbConnected += OnUsbConnected;

            _ = InitializeAsync();
        }

        private async Task InitializeAsync()
        {
            _isInitializing = true;
            UpdateIcon(SystemIcons.Warning, "Initializing...");

            try
            {
                Logger.Info("Checking if project exists...");
                bool projectExists = await _appManager.EnsureProjectExists();
                if (!projectExists)
                {
                    Logger.Error("Failed to ensure project exists");
                    UpdateIcon(SystemIcons.Error, "Failed to initialize project");
                    return;
                }

                Logger.Info("Checking NPM installation...");
                if (!_appManager.CheckNpmInstalled())
                {
                    Logger.Warning("NPM is not installed - attempting to install...");
                    UpdateIcon(SystemIcons.Warning, "Installing NPM...");
                    
                    bool installed = await _appManager.InstallNpm();
                    if (!installed)
                    {
                        Logger.Error("Failed to install NPM. Please install Node.js manually.");
                        UpdateIcon(SystemIcons.Error, "NPM installation failed");
                        return;
                    }
                    
                    Logger.Info("NPM installed successfully");
                }

                Logger.Info("Checking for updates...");
                bool hasUpdates = await _appManager.CheckForUpdates();
                if (hasUpdates)
                {
                    Logger.Info("Updates found - pulling changes");
                    await _appManager.PullUpdates();
                    await _appManager.InstallDependencies();
                }

                Logger.Info("Checking build...");
                if (!_appManager.CheckBuildExists())
                {
                    Logger.Info("Build not found - installing dependencies and building");
                    await _appManager.InstallDependencies();
                    await _appManager.BuildProject();
                }

                Logger.Info("Starting application...");
                if (!_appManager.StartApp())
                {
                    Logger.Error("Failed to start application");
                    UpdateIcon(SystemIcons.Error, "Failed to start app");
                    return;
                }

                await Task.Delay(5000);

                _healthMonitor.Start();
                _usbMonitor.Start();
                _processWatcher.Start();

                await Task.Delay(10000);

                if (_healthMonitor.IsHealthy && _chromeManager.FindChromePath() != null)
                {
                    _chromeManager.StartKiosk();
                }

                _isInitializing = false;
                UpdateIcon(SystemIcons.Information, "Running");
                Logger.Info("Initialization complete");
            }
            catch (Exception ex)
            {
                Logger.Error($"Initialization error: {ex.Message}");
                UpdateIcon(SystemIcons.Error, "Initialization failed");
                _isInitializing = false;
            }
        }

        private void OnHealthStatusChanged(object? sender, bool isHealthy)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => OnHealthStatusChanged(sender, isHealthy)));
                return;
            }

            if (isHealthy)
            {
                UpdateIcon(SystemIcons.Information, "Healthy");

                if (Config.Instance.AutoStartChrome && !_chromeManager.IsChromeRunning() && _healthMonitor.IsHealthy)
                {
                    Logger.Info("Chrome is not running and health is healthy - starting Chrome");
                    _chromeManager.StartKiosk();
                }
            }
            else
            {
                UpdateIcon(SystemIcons.Warning, "Unhealthy");
            }
        }

        private void OnUsbConnected(object? sender, EventArgs e)
        {
            Logger.Info("USB connected event received");
        }

        private void UpdateIcon(Icon icon, string tooltip)
        {
            if (_notifyIcon != null)
            {
                _notifyIcon.Icon = icon;
                _notifyIcon.Text = $"Kiosk Manager - {tooltip}";
            }
        }

        private void OnOpenUI(object? sender, EventArgs e)
        {
            try
            {
                string url = $"http://localhost:{Config.Instance.Port}";
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                Logger.Error($"Error opening UI: {ex.Message}");
                MessageBox.Show($"Error opening UI: {ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OnShowStatus(object? sender, EventArgs e)
        {
            string status = $"Status:\n\n" +
                          $"App Running: {_appManager.IsAppRunning()}\n" +
                          $"Health: {(_healthMonitor.IsHealthy ? "Healthy" : "Unhealthy")}\n" +
                          $"Chrome Running: {_chromeManager.IsChromeRunning()}\n" +
                          $"Initializing: {_isInitializing}";

            MessageBox.Show(status, "Kiosk Manager Status", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void OnExit(object? sender, EventArgs e)
        {
            using (PasswordDialog dialog = new PasswordDialog())
            {
                if (dialog.ShowDialog() == DialogResult.OK)
                {
                    if (dialog.Password == Config.Instance.ExitPassword)
                    {
                        Shutdown();
                    }
                    else
                    {
                        MessageBox.Show("Incorrect password", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
            }
        }

        private void Shutdown()
        {
            Logger.Info("Shutting down...");

            _processWatcher?.Stop();
            _usbMonitor?.Stop();
            _healthMonitor?.Stop();
            _chromeManager?.StopKiosk();
            _appManager?.StopApp();

            if (_notifyIcon != null)
            {
                _notifyIcon.Visible = false;
                _notifyIcon.Dispose();
            }

            Application.Exit();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                this.Hide();
            }
            else
            {
                Shutdown();
            }
            base.OnFormClosing(e);
        }
    }

    public class PasswordDialog : Form
    {
        private TextBox _passwordBox;
        private Button _okButton;
        private Button _cancelButton;

        public string Password => _passwordBox.Text;

        public PasswordDialog()
        {
            this.Text = "Enter Password";
            this.Size = new Size(300, 150);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.MaximizeBox = false;
            this.MinimizeBox = false;

            Label label = new Label
            {
                Text = "Enter exit password:",
                Location = new Point(10, 10),
                Size = new Size(260, 20)
            };

            _passwordBox = new TextBox
            {
                Location = new Point(10, 35),
                Size = new Size(260, 20),
                PasswordChar = '*',
                UseSystemPasswordChar = true
            };

            _okButton = new Button
            {
                Text = "OK",
                DialogResult = DialogResult.OK,
                Location = new Point(100, 70),
                Size = new Size(75, 25)
            };

            _cancelButton = new Button
            {
                Text = "Cancel",
                DialogResult = DialogResult.Cancel,
                Location = new Point(185, 70),
                Size = new Size(75, 25)
            };

            this.Controls.Add(label);
            this.Controls.Add(_passwordBox);
            this.Controls.Add(_okButton);
            this.Controls.Add(_cancelButton);

            this.AcceptButton = _okButton;
            this.CancelButton = _cancelButton;
        }
    }
}

