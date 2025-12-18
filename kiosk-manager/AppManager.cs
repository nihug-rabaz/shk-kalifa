using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Runtime.InteropServices;

namespace KioskManager
{
    public class AppManager
    {
        private Process? _nodeProcess;
        private readonly AppConfig _config;

        public AppManager()
        {
            _config = Config.Instance;
        }

        public async Task<bool> EnsureProjectExists()
        {
            Logger.Info($"Checking if project directory exists: {_config.ProjectPath}");

            if (Directory.Exists(_config.ProjectPath))
            {
                Logger.Info("Project directory exists");
                return true;
            }

            Logger.Info($"Project directory not found. Cloning repository from {_config.GitRepositoryUrl}");

            string parentDir = Path.GetDirectoryName(_config.ProjectPath) ?? "";
            string folderName = Path.GetFileName(_config.ProjectPath);

            if (!Directory.Exists(parentDir))
            {
                try
                {
                    Directory.CreateDirectory(parentDir);
                    Logger.Info($"Created parent directory: {parentDir}");
                }
                catch (Exception ex)
                {
                    Logger.Error($"Failed to create parent directory: {ex.Message}");
                    return false;
                }
            }

            try
            {
                ProcessStartInfo gitInfo = new ProcessStartInfo
                {
                    FileName = "git",
                    Arguments = $"clone {_config.GitRepositoryUrl} \"{_config.ProjectPath}\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    WorkingDirectory = parentDir
                };

                using (Process? gitProcess = Process.Start(gitInfo))
                {
                    if (gitProcess == null)
                    {
                        Logger.Error("Failed to start git clone process");
                        return false;
                    }

                    string output = await gitProcess.StandardOutput.ReadToEndAsync();
                    string error = await gitProcess.StandardError.ReadToEndAsync();
                    await gitProcess.WaitForExitAsync();

                    if (gitProcess.ExitCode == 0)
                    {
                        Logger.Info("Repository cloned successfully");
                        return true;
                    }
                    else
                    {
                        Logger.Error($"Git clone failed: {error}");
                        return false;
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"Exception during git clone: {ex.Message}");
                return false;
            }
        }

        private string? GetNpmPath()
        {
            RefreshEnvironmentPath();
            
            try
            {
                ProcessStartInfo npmInfo = new ProcessStartInfo
                {
                    FileName = "npm",
                    Arguments = "--version",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using (Process? npmProcess = Process.Start(npmInfo))
                {
                    if (npmProcess != null)
                    {
                        npmProcess.WaitForExit();
                        if (npmProcess.ExitCode == 0)
                        {
                            string version = npmProcess.StandardOutput.ReadToEnd().Trim();
                            Logger.Info($"NPM found in PATH: {version}");
                            return "npm";
                        }
                    }
                }
            }
            catch
            {
            }

            string[] commonPaths = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "npm.cmd"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "npm.cmd"),
                @"C:\Program Files\nodejs\npm.cmd",
                @"C:\Program Files (x86)\nodejs\npm.cmd",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Microsoft VS Code", "bin", "npm.cmd")
            };

            foreach (string npmPath in commonPaths)
            {
                if (File.Exists(npmPath))
                {
                    Logger.Info($"Found NPM at: {npmPath}");
                    string nodeDir = Path.GetDirectoryName(npmPath) ?? "";
                    if (!string.IsNullOrEmpty(nodeDir))
                    {
                        string currentPath = Environment.GetEnvironmentVariable("Path") ?? "";
                        if (!currentPath.Contains(nodeDir))
                        {
                            Environment.SetEnvironmentVariable("Path", currentPath + ";" + nodeDir, EnvironmentVariableTarget.Process);
                            Logger.Info($"Added {nodeDir} to PATH");
                            Thread.Sleep(500);
                        }

                        try
                        {
                            ProcessStartInfo testInfo = new ProcessStartInfo
                            {
                                FileName = "cmd.exe",
                                Arguments = $"/c \"{npmPath}\" --version",
                                UseShellExecute = false,
                                RedirectStandardOutput = true,
                                RedirectStandardError = true,
                                CreateNoWindow = true
                            };

                            using (Process? testProcess = Process.Start(testInfo))
                            {
                                if (testProcess != null)
                                {
                                    testProcess.WaitForExit();
                                    if (testProcess.ExitCode == 0)
                                    {
                                        string version = testProcess.StandardOutput.ReadToEnd().Trim();
                                        Logger.Info($"NPM verified: {version}");
                                        return npmPath;
                                    }
                                }
                            }

                            ProcessStartInfo pathTestInfo = new ProcessStartInfo
                            {
                                FileName = "npm",
                                Arguments = "--version",
                                UseShellExecute = false,
                                RedirectStandardOutput = true,
                                RedirectStandardError = true,
                                CreateNoWindow = true
                            };

                            using (Process? pathTestProcess = Process.Start(pathTestInfo))
                            {
                                if (pathTestProcess != null)
                                {
                                    pathTestProcess.WaitForExit();
                                    if (pathTestProcess.ExitCode == 0)
                                    {
                                        string version = pathTestProcess.StandardOutput.ReadToEnd().Trim();
                                        Logger.Info($"NPM verified via PATH: {version}");
                                        return "npm";
                                    }
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            Logger.Warning($"Error testing NPM at {npmPath}: {ex.Message}");
                        }
                    }
                }
            }

            return null;
        }

        public bool CheckNpmInstalled()
        {
            string? npmPath = GetNpmPath();
            if (npmPath == null)
            {
                Logger.Warning("NPM not found");
                return false;
            }

            try
            {
                ProcessStartInfo npmInfo = new ProcessStartInfo
                {
                    FileName = npmPath == "npm" ? "npm" : "cmd.exe",
                    Arguments = npmPath == "npm" ? "--version" : $"/c \"{npmPath}\" --version",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using (Process? npmProcess = Process.Start(npmInfo))
                {
                    if (npmProcess != null)
                    {
                        npmProcess.WaitForExit();
                        if (npmProcess.ExitCode == 0)
                        {
                            string version = npmProcess.StandardOutput.ReadToEnd().Trim();
                            Logger.Info($"NPM is installed: {version}");
                            return true;
                        }
                        else
                        {
                            string error = npmProcess.StandardError.ReadToEnd();
                            Logger.Warning($"NPM check failed: {error}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warning($"NPM check exception: {ex.Message}");
            }

            return false;
        }

        private bool TryFindNpmInCommonLocations()
        {
            string? npmPath = GetNpmPath();
            return npmPath != null;
        }

        private string? FindNodeInPath()
        {
            try
            {
                ProcessStartInfo nodeInfo = new ProcessStartInfo
                {
                    FileName = "node",
                    Arguments = "--version",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using (Process? nodeProcess = Process.Start(nodeInfo))
                {
                    if (nodeProcess != null)
                    {
                        nodeProcess.WaitForExit();
                        if (nodeProcess.ExitCode == 0)
                        {
                            string version = nodeProcess.StandardOutput.ReadToEnd().Trim();
                            return $"node {version}";
                        }
                    }
                }
            }
            catch
            {
            }
            return null;
        }

        private string? TryFindNodeInCommonLocations()
        {
            string[] commonPaths = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe"),
                @"C:\Program Files\nodejs\node.exe",
                @"C:\Program Files (x86)\nodejs\node.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Microsoft VS Code", "bin", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppData", "Roaming", "npm", "node_modules", "npm", "bin", "node.exe")
            };

            foreach (string nodePath in commonPaths)
            {
                if (File.Exists(nodePath))
                {
                    Logger.Info($"Found Node.js at: {nodePath}");
                    string nodeDir = Path.GetDirectoryName(nodePath) ?? "";
                    if (!string.IsNullOrEmpty(nodeDir))
                    {
                        string currentPath = Environment.GetEnvironmentVariable("Path") ?? "";
                        if (!currentPath.Contains(nodeDir))
                        {
                            Environment.SetEnvironmentVariable("Path", currentPath + ";" + nodeDir, EnvironmentVariableTarget.Process);
                            Logger.Info($"Added {nodeDir} to PATH");
                            
                            try
                            {
                                ProcessStartInfo nodeInfo = new ProcessStartInfo
                                {
                                    FileName = nodePath,
                                    Arguments = "--version",
                                    UseShellExecute = false,
                                    RedirectStandardOutput = true,
                                    CreateNoWindow = true
                                };

                                using (Process? nodeProcess = Process.Start(nodeInfo))
                                {
                                    if (nodeProcess != null)
                                    {
                                        nodeProcess.WaitForExit();
                                        if (nodeProcess.ExitCode == 0)
                                        {
                                            string version = nodeProcess.StandardOutput.ReadToEnd().Trim();
                                            return $"node {version}";
                                        }
                                    }
                                }
                            }
                            catch (Exception ex)
                            {
                                Logger.Warning($"Error testing Node.js at {nodePath}: {ex.Message}");
                            }
                        }
                        else
                        {
                            try
                            {
                                ProcessStartInfo nodeInfo = new ProcessStartInfo
                                {
                                    FileName = nodePath,
                                    Arguments = "--version",
                                    UseShellExecute = false,
                                    RedirectStandardOutput = true,
                                    CreateNoWindow = true
                                };

                                using (Process? nodeProcess = Process.Start(nodeInfo))
                                {
                                    if (nodeProcess != null)
                                    {
                                        nodeProcess.WaitForExit();
                                        if (nodeProcess.ExitCode == 0)
                                        {
                                            string version = nodeProcess.StandardOutput.ReadToEnd().Trim();
                                            return $"node {version}";
                                        }
                                    }
                                }
                            }
                            catch (Exception ex)
                            {
                                Logger.Warning($"Error testing Node.js at {nodePath}: {ex.Message}");
                            }
                        }
                    }
                }
            }

            return null;
        }

        private void RefreshEnvironmentPath()
        {
            try
            {
                string path = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.Machine) ?? "";
                string userPath = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.User) ?? "";
                string currentPath = Environment.GetEnvironmentVariable("Path") ?? "";
                
                string[] machinePaths = path.Split(';');
                string[] userPaths = userPath.Split(';');
                
                foreach (string p in machinePaths)
                {
                    if (!string.IsNullOrEmpty(p) && !currentPath.Contains(p))
                    {
                        Environment.SetEnvironmentVariable("Path", currentPath + ";" + p, EnvironmentVariableTarget.Process);
                    }
                }
                
                string updatedPath = Environment.GetEnvironmentVariable("Path") ?? "";
                foreach (string p in userPaths)
                {
                    if (!string.IsNullOrEmpty(p) && !updatedPath.Contains(p))
                    {
                        updatedPath += ";" + p;
                    }
                }
                Environment.SetEnvironmentVariable("Path", updatedPath, EnvironmentVariableTarget.Process);
                
                Logger.Info("Environment PATH refreshed");
            }
            catch (Exception ex)
            {
                Logger.Warning($"Failed to refresh PATH: {ex.Message}");
            }
        }

        public async Task<bool> InstallNpm()
        {
            Logger.Info("Attempting to install Node.js/NPM...");

            try
            {
                ProcessStartInfo wingetInfo = new ProcessStartInfo
                {
                    FileName = "winget",
                    Arguments = "install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using (Process? wingetProcess = Process.Start(wingetInfo))
                {
                    if (wingetProcess != null)
                    {
                        Logger.Info("Installing Node.js via winget...");
                        
                        var outputBuilder = new System.Text.StringBuilder();
                        var errorBuilder = new System.Text.StringBuilder();
                        
                        wingetProcess.OutputDataReceived += (sender, e) =>
                        {
                            if (!string.IsNullOrEmpty(e.Data))
                            {
                                outputBuilder.AppendLine(e.Data);
                                Logger.Info($"[winget] {e.Data}");
                            }
                        };
                        
                        wingetProcess.ErrorDataReceived += (sender, e) =>
                        {
                            if (!string.IsNullOrEmpty(e.Data))
                            {
                                errorBuilder.AppendLine(e.Data);
                                Logger.Warning($"[winget] {e.Data}");
                            }
                        };
                        
                        wingetProcess.BeginOutputReadLine();
                        wingetProcess.BeginErrorReadLine();
                        
                        using (CancellationTokenSource cts = new CancellationTokenSource(TimeSpan.FromMinutes(5)))
                        {
                            try
                            {
                                Task waitTask = Task.Run(() => wingetProcess.WaitForExit(), cts.Token);
                                Task delayTask = Task.Delay(TimeSpan.FromMinutes(5), cts.Token);
                                
                                Task completedTask = await Task.WhenAny(waitTask, delayTask);
                                
                                if (completedTask == delayTask)
                                {
                                    Logger.Warning("winget installation timed out after 5 minutes");
                                    try
                                    {
                                        if (!wingetProcess.HasExited)
                                        {
                                            wingetProcess.Kill();
                                            Logger.Info("winget process killed");
                                        }
                                    }
                                    catch { }
                                    cts.Cancel();
                                }
                                else
                                {
                                    await waitTask;
                                    await Task.Delay(500);
                                    
                                    int exitCode = wingetProcess.ExitCode;
                                    
                                    if (exitCode == 0)
                                    {
                                        Logger.Info("Node.js installed successfully via winget");
                                        await Task.Delay(5000);
                                        RefreshEnvironmentPath();
                                        return CheckNpmInstalled();
                                    }
                                    else if (exitCode == unchecked((int)0x8A15000B) || exitCode == unchecked((int)0x80070005))
                                    {
                                        Logger.Info("Node.js may already be installed. Checking NPM...");
                                        await Task.Delay(2000);
                                        RefreshEnvironmentPath();
                                        if (CheckNpmInstalled())
                                        {
                                            Logger.Info("NPM found after checking existing installation");
                                            return true;
                                        }
                                        Logger.Warning("Node.js appears to be installed but NPM is not accessible. You may need to restart the application or add Node.js to PATH manually.");
                                    }
                                    else
                                    {
                                        Logger.Warning($"winget installation failed (exit code: {exitCode})");
                                    }
                                }
                            }
                            catch (OperationCanceledException)
                            {
                                Logger.Warning("winget installation was cancelled");
                            }
                        }
                    }
                    else
                    {
                        Logger.Warning("Failed to start winget process");
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warning($"winget not available or failed: {ex.Message}");
            }

            try
            {
                Logger.Info("Trying chocolatey installation...");
                ProcessStartInfo chocoInfo = new ProcessStartInfo
                {
                    FileName = "choco",
                    Arguments = "install nodejs-lts -y",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using (Process? chocoProcess = Process.Start(chocoInfo))
                {
                    if (chocoProcess != null)
                    {
                        Logger.Info("Installing Node.js via chocolatey...");
                        
                        var outputBuilder = new System.Text.StringBuilder();
                        var errorBuilder = new System.Text.StringBuilder();
                        
                        chocoProcess.OutputDataReceived += (sender, e) =>
                        {
                            if (!string.IsNullOrEmpty(e.Data))
                            {
                                outputBuilder.AppendLine(e.Data);
                                Logger.Info($"[chocolatey] {e.Data}");
                            }
                        };
                        
                        chocoProcess.ErrorDataReceived += (sender, e) =>
                        {
                            if (!string.IsNullOrEmpty(e.Data))
                            {
                                errorBuilder.AppendLine(e.Data);
                                Logger.Warning($"[chocolatey] {e.Data}");
                            }
                        };
                        
                        chocoProcess.BeginOutputReadLine();
                        chocoProcess.BeginErrorReadLine();
                        
                        using (CancellationTokenSource cts = new CancellationTokenSource(TimeSpan.FromMinutes(5)))
                        {
                            try
                            {
                                Task waitTask = Task.Run(() => chocoProcess.WaitForExit(), cts.Token);
                                Task delayTask = Task.Delay(TimeSpan.FromMinutes(5), cts.Token);
                                
                                Task completedTask = await Task.WhenAny(waitTask, delayTask);
                                
                                if (completedTask == delayTask)
                                {
                                    Logger.Warning("chocolatey installation timed out after 5 minutes");
                                    try
                                    {
                                        if (!chocoProcess.HasExited)
                                        {
                                            chocoProcess.Kill();
                                            Logger.Info("chocolatey process killed");
                                        }
                                    }
                                    catch { }
                                    cts.Cancel();
                                }
                                else
                                {
                                    await waitTask;
                                    await Task.Delay(500);
                                    
                                    if (chocoProcess.ExitCode == 0)
                                    {
                                        Logger.Info("Node.js installed successfully via chocolatey");
                                        await Task.Delay(10000);
                                        RefreshEnvironmentPath();
                                        if (CheckNpmInstalled())
                                        {
                                            Logger.Info("NPM found after chocolatey installation");
                                            return true;
                                        }
                                        Logger.Warning("NPM not found in PATH after installation, searching in common locations...");
                                        if (TryFindNpmInCommonLocations())
                                        {
                                            Logger.Info("NPM found in common locations");
                                            return true;
                                        }
                                        Logger.Error("NPM still not accessible. You may need to restart the application.");
                                        return false;
                                    }
                                    else
                                    {
                                        Logger.Warning($"chocolatey installation failed (exit code: {chocoProcess.ExitCode})");
                                    }
                                }
                            }
                            catch (OperationCanceledException)
                            {
                                Logger.Warning("chocolatey installation was cancelled");
                            }
                        }
                    }
                    else
                    {
                        Logger.Warning("Failed to start chocolatey process");
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warning($"chocolatey not available or failed: {ex.Message}");
            }

            Logger.Error("Could not install Node.js automatically. Please install Node.js manually from https://nodejs.org/");
            Logger.Error("After installing Node.js, restart Kiosk Manager.");
            
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "https://nodejs.org/",
                    UseShellExecute = true
                });
            }
            catch
            {
            }

            return false;
        }

        public async Task<bool> CheckForUpdates()
        {
            if (!Directory.Exists(_config.ProjectPath))
            {
                return false;
            }

            try
            {
                ProcessStartInfo fetchInfo = new ProcessStartInfo
                {
                    FileName = "git",
                    Arguments = $"fetch {_config.GitRemote} {_config.GitBranch}",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    WorkingDirectory = _config.ProjectPath
                };

                using (Process? fetchProcess = Process.Start(fetchInfo))
                {
                    if (fetchProcess == null)
                    {
                        return false;
                    }

                    await fetchProcess.WaitForExitAsync();

                    ProcessStartInfo statusInfo = new ProcessStartInfo
                    {
                        FileName = "git",
                        Arguments = $"rev-list --count HEAD..{_config.GitRemote}/{_config.GitBranch}",
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        CreateNoWindow = true,
                        WorkingDirectory = _config.ProjectPath
                    };

                    using (Process? statusProcess = Process.Start(statusInfo))
                    {
                        if (statusProcess == null)
                        {
                            return false;
                        }

                        await statusProcess.WaitForExitAsync();
                        string output = await statusProcess.StandardOutput.ReadToEndAsync();
                        int count = int.TryParse(output.Trim(), out int result) ? result : 0;
                        return count > 0;
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"Error checking for updates: {ex.Message}");
                return false;
            }
        }

        public async Task<bool> PullUpdates()
        {
            if (!Directory.Exists(_config.ProjectPath))
            {
                return false;
            }

            Logger.Info("Pulling latest changes from Git");

            try
            {
                ProcessStartInfo fetchInfo = new ProcessStartInfo
                {
                    FileName = "git",
                    Arguments = $"fetch {_config.GitRemote} {_config.GitBranch}",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    WorkingDirectory = _config.ProjectPath
                };

                using (Process? fetchProcess = Process.Start(fetchInfo))
                {
                    if (fetchProcess != null)
                    {
                        await fetchProcess.WaitForExitAsync();
                        if (fetchProcess.ExitCode != 0)
                        {
                            string error = await fetchProcess.StandardError.ReadToEndAsync();
                            Logger.Warning($"Git fetch failed: {error}");
                        }
                    }
                }

                ProcessStartInfo resetInfo = new ProcessStartInfo
                {
                    FileName = "git",
                    Arguments = $"reset --hard {_config.GitRemote}/{_config.GitBranch}",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    WorkingDirectory = _config.ProjectPath
                };

                using (Process? resetProcess = Process.Start(resetInfo))
                {
                    if (resetProcess == null)
                    {
                        return false;
                    }

                    string resetOutput = await resetProcess.StandardOutput.ReadToEndAsync();
                    string resetError = await resetProcess.StandardError.ReadToEndAsync();
                    await resetProcess.WaitForExitAsync();

                    if (resetProcess.ExitCode == 0)
                    {
                        Logger.Info("Git reset completed successfully");
                        Logger.Info($"Git pull completed successfully");
                        return true;
                    }
                    else
                    {
                        Logger.Warning($"Git reset failed: {resetError}, trying regular pull");

                        ProcessStartInfo pullInfo = new ProcessStartInfo
                        {
                            FileName = "git",
                            Arguments = $"pull {_config.GitRemote} {_config.GitBranch}",
                            UseShellExecute = false,
                            RedirectStandardOutput = true,
                            RedirectStandardError = true,
                            CreateNoWindow = true,
                            WorkingDirectory = _config.ProjectPath
                        };

                        using (Process? pullProcess = Process.Start(pullInfo))
                        {
                            if (pullProcess == null)
                            {
                                return false;
                            }

                            string output = await pullProcess.StandardOutput.ReadToEndAsync();
                            string error = await pullProcess.StandardError.ReadToEndAsync();
                            await pullProcess.WaitForExitAsync();

                            if (pullProcess.ExitCode == 0)
                            {
                                Logger.Info("Git pull completed successfully");
                                return true;
                            }
                            else
                            {
                                Logger.Error($"Git pull failed: {error}");
                                return false;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"Exception during git pull: {ex.Message}");
                return false;
            }
        }

        public bool CheckBuildExists()
        {
            string buildPath = Path.Combine(_config.ProjectPath, ".next");
            bool exists = Directory.Exists(buildPath);
            Logger.Info($"Build exists: {exists}");
            return exists;
        }

        public async Task<bool> BuildProject()
        {
            if (!Directory.Exists(_config.ProjectPath))
            {
                return false;
            }

            string? npmPath = GetNpmPath();
            if (npmPath == null)
            {
                Logger.Error("NPM not found, cannot build project");
                return false;
            }

            Logger.Info("Building project...");

            try
            {
                ProcessStartInfo buildInfo = new ProcessStartInfo
                {
                    FileName = npmPath == "npm" ? "npm" : "cmd.exe",
                    Arguments = npmPath == "npm" ? "run build" : $"/c \"{npmPath}\" run build",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    WorkingDirectory = _config.ProjectPath
                };

                using (Process? buildProcess = Process.Start(buildInfo))
                {
                    if (buildProcess == null)
                    {
                        Logger.Error("Failed to start build process");
                        return false;
                    }

                    var outputBuilder = new System.Text.StringBuilder();
                    var errorBuilder = new System.Text.StringBuilder();

                    buildProcess.OutputDataReceived += (sender, e) =>
                    {
                        if (!string.IsNullOrEmpty(e.Data))
                        {
                            outputBuilder.AppendLine(e.Data);
                            Logger.Info($"[build] {e.Data}");
                        }
                    };

                    buildProcess.ErrorDataReceived += (sender, e) =>
                    {
                        if (!string.IsNullOrEmpty(e.Data))
                        {
                            errorBuilder.AppendLine(e.Data);
                            Logger.Warning($"[build] {e.Data}");
                        }
                    };

                    buildProcess.BeginOutputReadLine();
                    buildProcess.BeginErrorReadLine();

                    await buildProcess.WaitForExitAsync();

                    if (buildProcess.ExitCode == 0)
                    {
                        Logger.Info("Build completed successfully");
                        return true;
                    }
                    else
                    {
                        string error = errorBuilder.ToString();
                        if (string.IsNullOrEmpty(error))
                        {
                            error = await buildProcess.StandardError.ReadToEndAsync();
                        }
                        Logger.Error($"Build failed with exit code {buildProcess.ExitCode}: {error}");
                        return false;
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"Exception during build: {ex.Message}");
                return false;
            }
        }

        public async Task<bool> InstallDependencies()
        {
            if (!Directory.Exists(_config.ProjectPath))
            {
                return false;
            }

            string? npmPath = GetNpmPath();
            if (npmPath == null)
            {
                Logger.Error("NPM not found, cannot install dependencies");
                return false;
            }

            Logger.Info("Installing dependencies...");

            try
            {
                ProcessStartInfo installInfo = new ProcessStartInfo
                {
                    FileName = npmPath == "npm" ? "npm" : "cmd.exe",
                    Arguments = npmPath == "npm" ? "install" : $"/c \"{npmPath}\" install",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    WorkingDirectory = _config.ProjectPath
                };

                using (Process? installProcess = Process.Start(installInfo))
                {
                    if (installProcess == null)
                    {
                        Logger.Error("Failed to start install process");
                        return false;
                    }

                    await installProcess.WaitForExitAsync();

                    if (installProcess.ExitCode == 0)
                    {
                        Logger.Info("Dependencies installed successfully");
                        return true;
                    }
                    else
                    {
                        string error = await installProcess.StandardError.ReadToEndAsync();
                        Logger.Error($"npm install failed: {error}");
                        return false;
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"Exception during npm install: {ex.Message}");
                return false;
            }
        }

        public bool StartApp()
        {
            if (!Directory.Exists(_config.ProjectPath))
            {
                return false;
            }

            string? npmPath = GetNpmPath();
            if (npmPath == null)
            {
                Logger.Error("NPM not found, cannot start application");
                return false;
            }

            StopApp();

            Logger.Info("Starting Next.js application...");

            try
            {
                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = npmPath == "npm" ? "npm" : "cmd.exe",
                    Arguments = npmPath == "npm" ? "start" : $"/c \"{npmPath}\" start",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    WorkingDirectory = _config.ProjectPath,
                    Environment = { { "PORT", _config.Port.ToString() } }
                };

                _nodeProcess = Process.Start(startInfo);
                if (_nodeProcess == null)
                {
                    Logger.Error("Failed to start application process");
                    return false;
                }

                var outputBuilder = new System.Text.StringBuilder();
                var errorBuilder = new System.Text.StringBuilder();

                _nodeProcess.OutputDataReceived += (sender, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        outputBuilder.AppendLine(e.Data);
                        Logger.Info($"[app] {e.Data}");
                    }
                };

                _nodeProcess.ErrorDataReceived += (sender, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        errorBuilder.AppendLine(e.Data);
                        Logger.Warning($"[app] {e.Data}");
                    }
                };

                _nodeProcess.BeginOutputReadLine();
                _nodeProcess.BeginErrorReadLine();

                if (_nodeProcess.WaitForExit(5000))
                {
                    string error = errorBuilder.ToString();
                    if (string.IsNullOrEmpty(error))
                    {
                        error = outputBuilder.ToString();
                    }
                    Logger.Error($"Next.js application exited early with code {_nodeProcess.ExitCode}: {error}");
                    _nodeProcess.Dispose();
                    _nodeProcess = null;
                    return false;
                }

                Logger.Info($"Next.js application started (PID: {_nodeProcess.Id})");
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"Exception starting app: {ex.Message}");
                return false;
            }
        }

        public void StopApp()
        {
            if (_nodeProcess != null && !_nodeProcess.HasExited)
            {
                try
                {
                    Logger.Info("Stopping Next.js application...");
                    _nodeProcess.Kill();
                    _nodeProcess.WaitForExit(5000);
                    Logger.Info("Next.js application stopped");
                }
                catch (Exception ex)
                {
                    Logger.Error($"Error stopping app: {ex.Message}");
                }
                finally
                {
                    _nodeProcess = null;
                }
            }

            Process[] nodeProcesses = Process.GetProcessesByName("node");
            foreach (Process proc in nodeProcesses)
            {
                try
                {
                    string? commandLine = GetCommandLine(proc);
                    if (commandLine != null && commandLine.Contains("next"))
                    {
                        proc.Kill();
                        Logger.Info($"Killed node process: {proc.Id}");
                    }
                }
                catch
                {
                }
            }
        }

        private string? GetCommandLine(Process process)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "wmic",
                    Arguments = $"process where processid={process.Id} get commandline",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using (Process? wmicProcess = Process.Start(psi))
                {
                    if (wmicProcess != null)
                    {
                        wmicProcess.WaitForExit();
                        string output = wmicProcess.StandardOutput.ReadToEnd();
                        string[] lines = output.Split('\n');
                        if (lines.Length > 1)
                        {
                            return lines[1].Trim();
                        }
                    }
                }
            }
            catch
            {
            }
            return null;
        }

        public bool IsAppRunning()
        {
            if (_nodeProcess != null && !_nodeProcess.HasExited)
            {
                return true;
            }

            Process[] nodeProcesses = Process.GetProcessesByName("node");
            foreach (Process proc in nodeProcesses)
            {
                try
                {
                    string? commandLine = GetCommandLine(proc);
                    if (commandLine != null && commandLine.Contains("next"))
                    {
                        return true;
                    }
                }
                catch
                {
                }
            }

            return false;
        }
    }
}

