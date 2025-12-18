using System;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace KioskManager
{
    public class HealthMonitor
    {
        private readonly AppConfig _config;
        private readonly HttpClient _httpClient;
        private CancellationTokenSource? _cancellationTokenSource;
        private Task? _monitoringTask;
        private bool _isHealthy = false;

        public event EventHandler<bool>? HealthStatusChanged;

        public bool IsHealthy => _isHealthy;

        public HealthMonitor()
        {
            _config = Config.Instance;
            _httpClient = new HttpClient
            {
                Timeout = TimeSpan.FromSeconds(5)
            };
        }

        public void Start()
        {
            Stop();

            _cancellationTokenSource = new CancellationTokenSource();
            _monitoringTask = Task.Run(async () => await MonitorHealthAsync(_cancellationTokenSource.Token));
            Logger.Info("Health monitor started");
        }

        public void Stop()
        {
            if (_cancellationTokenSource != null)
            {
                _cancellationTokenSource.Cancel();
                _cancellationTokenSource = null;
            }

            if (_monitoringTask != null)
            {
                try
                {
                    _monitoringTask.Wait(TimeSpan.FromSeconds(2));
                }
                catch
                {
                }
                _monitoringTask = null;
            }

            Logger.Info("Health monitor stopped");
        }

        private async Task MonitorHealthAsync(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    bool wasHealthy = _isHealthy;
                    _isHealthy = await CheckHealthAsync();

                    if (wasHealthy != _isHealthy)
                    {
                        HealthStatusChanged?.Invoke(this, _isHealthy);
                        Logger.Info($"Health status changed: {(_isHealthy ? "Healthy" : "Unhealthy")}");
                    }

                    await Task.Delay(_config.HealthCheckInterval * 1000, cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Logger.Error($"Error in health monitor: {ex.Message}");
                    await Task.Delay(_config.HealthCheckInterval * 1000, cancellationToken);
                }
            }
        }

        public async Task<bool> CheckHealthAsync()
        {
            try
            {
                string url = $"http://localhost:{_config.Port}{_config.HealthEndpoint}";
                HttpResponseMessage response = await _httpClient.GetAsync(url);
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }
    }
}




