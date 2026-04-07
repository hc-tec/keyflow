using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Forms;

namespace WindowsImeTestHost.Automation;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        AutomationSettings settings;
        try
        {
            settings = AutomationSettings.Parse(args);
        }
        catch (ArgumentException ex)
        {
            Console.Error.WriteLine(ex.Message);
            return 2;
        }

        Directory.CreateDirectory(Path.GetDirectoryName(settings.ResultPath)!);

        try
        {
            var result = Run(settings);
            PersistResult(settings.ResultPath, result);
            Console.WriteLine($"E2E result written to {settings.ResultPath}");
            Console.WriteLine(result.Passed
                ? $"PASS: {result.MatchedAttemptName}"
                : "FAIL: no attempt produced the expected committed text.");
            return result.Passed ? 0 : 1;
        }
        catch (Exception ex)
        {
            var failure = AutomationRunResult.CreateCrashed(settings, ex);
            PersistResult(settings.ResultPath, failure);
            Console.Error.WriteLine(ex);
            return 1;
        }
    }

    private static AutomationRunResult Run(AutomationSettings settings)
    {
        if (!File.Exists(settings.TestHostExePath))
        {
            throw new FileNotFoundException("Windows IME TestHost executable not found.", settings.TestHostExePath);
        }

        var startedAt = DateTimeOffset.Now;
        var activationBeforeLaunch = settings.ActivateWeasel
            ? WeaselImeProfileActivator.TryActivateForSession()
            : null;

        var attempts = new List<AttemptResult>();
        foreach (var plan in BuildAttempts())
        {
            Console.WriteLine($"Running attempt: {plan.Name}");
            var attempt = RunAttempt(settings, plan);
            attempts.Add(attempt);
            if (attempt.Passed)
            {
                break;
            }
        }

        var matched = attempts.FirstOrDefault(attempt => attempt.Passed);
        return new AutomationRunResult(
            GeneratedAt: DateTimeOffset.Now,
            Passed: matched is not null,
            CrashMessage: null,
            TestHostExePath: settings.TestHostExePath,
            ResultPath: settings.ResultPath,
            Pinyin: settings.Pinyin,
            ExpectedText: settings.ExpectedText,
            MatchedAttemptName: matched?.Name,
            ActivationBeforeLaunch: activationBeforeLaunch,
            Attempts: attempts,
            ElapsedMilliseconds: (long)(DateTimeOffset.Now - startedAt).TotalMilliseconds);
    }

    private static AttemptResult RunAttempt(AutomationSettings settings, AttemptPlan plan)
    {
        var liveSnapshotPath = BuildAttemptSnapshotPath(settings.ResultPath, plan.Name);
        if (File.Exists(liveSnapshotPath))
        {
            File.Delete(liveSnapshotPath);
        }

        using var hostProcess = StartTestHost(settings, liveSnapshotPath);
        HostSnapshotPayload? readySnapshot = null;
        HostSnapshotPayload? finalSnapshot = null;
        var windowHandleHex = string.Empty;
        string? errorMessage = null;

        try
        {
            var windowHandle = WaitForMainWindow(hostProcess, settings.LaunchTimeoutSeconds);
            windowHandleHex = $"0x{windowHandle.ToInt64():X}";
            BringWindowToForeground(windowHandle);

            readySnapshot = WaitForSnapshot(
                liveSnapshotPath,
                TimeSpan.FromSeconds(settings.LaunchTimeoutSeconds),
                snapshot => snapshot.BrowserReady &&
                            (!snapshot.FunctionKitEnabled ||
                             snapshot.FunctionKitReady ||
                             !string.Equals(snapshot.FunctionKitLastError, "none", StringComparison.OrdinalIgnoreCase)) &&
                            snapshot.FormContainsFocus &&
                            string.Equals(snapshot.ActiveHost, settings.StartupFocusTarget, StringComparison.OrdinalIgnoreCase),
                () => BringWindowToForeground(windowHandle));
            Thread.Sleep(300);

            var activationAfterFocus = settings.ActivateWeasel
                ? WeaselImeProfileActivator.TryActivateForSession()
                : null;

            Thread.Sleep(250);

            if (plan.ToggleShiftBeforeTyping)
            {
                BringWindowToForeground(windowHandle);
                SendKeysToWindow(plan.InputMode, "{SHIFT}", settings.KeystrokeDelayMs, () => KeyboardInputSender.TapShift(settings.KeystrokeDelayMs));
                Thread.Sleep(150);
            }

            BringWindowToForeground(windowHandle);
            SendKeysToWindow(plan.InputMode, settings.Pinyin, settings.KeystrokeDelayMs, () => KeyboardInputSender.TypeAsciiText(settings.Pinyin, settings.KeystrokeDelayMs));
            Thread.Sleep(settings.CompositionDelayMs);

            BringWindowToForeground(windowHandle);
            if (plan.CommitWithSpace)
            {
                SendKeysToWindow(plan.InputMode, " ", settings.CommitDelayMs, () => KeyboardInputSender.TapSpace(settings.CommitDelayMs));
            }
            else
            {
                SendKeysToWindow(plan.InputMode, "1", settings.CommitDelayMs, () => KeyboardInputSender.TapNumber1(settings.CommitDelayMs));
            }

            finalSnapshot = WaitForSnapshot(
                liveSnapshotPath,
                TimeSpan.FromSeconds(4),
                snapshot => snapshot.KeyEventCount > readySnapshot.KeyEventCount ||
                            !string.IsNullOrWhiteSpace(snapshot.SingleLineText));

            var passed = string.Equals(finalSnapshot.SingleLineText, settings.ExpectedText, StringComparison.Ordinal);
            return new AttemptResult(
                Name: plan.Name,
                InputMode: plan.InputMode,
                ToggleShiftBeforeTyping: plan.ToggleShiftBeforeTyping,
                CommitKey: plan.CommitWithSpace ? "space" : "1",
                Passed: passed,
                ErrorMessage: null,
                ActivationAfterFocus: activationAfterFocus,
                WindowHandleHex: windowHandleHex,
                LiveSnapshotPath: liveSnapshotPath,
                ReadySnapshot: readySnapshot,
                FinalSnapshot: finalSnapshot);
        }
        catch (Exception ex)
        {
            errorMessage = ex.ToString();
        }
        finally
        {
            TryStopProcess(hostProcess);
        }

        finalSnapshot ??= TryReadSnapshot(liveSnapshotPath);
        return new AttemptResult(
            Name: plan.Name,
            InputMode: plan.InputMode,
            ToggleShiftBeforeTyping: plan.ToggleShiftBeforeTyping,
            CommitKey: plan.CommitWithSpace ? "space" : "1",
            Passed: false,
            ErrorMessage: errorMessage,
            ActivationAfterFocus: null,
            WindowHandleHex: windowHandleHex,
            LiveSnapshotPath: liveSnapshotPath,
            ReadySnapshot: readySnapshot,
            FinalSnapshot: finalSnapshot);
    }

    private static Process StartTestHost(AutomationSettings settings, string liveSnapshotPath)
    {
        var argumentList = new[]
        {
            "--live-snapshot-file", Quote(liveSnapshotPath),
            "--startup-focus", Quote(settings.StartupFocusTarget)
        };

        var startInfo = new ProcessStartInfo
        {
            FileName = settings.TestHostExePath,
            Arguments = string.Join(' ', argumentList),
            WorkingDirectory = Path.GetDirectoryName(settings.TestHostExePath)!,
            UseShellExecute = false
        };

        return Process.Start(startInfo)
               ?? throw new InvalidOperationException($"Failed to start test host: {settings.TestHostExePath}");
    }

    private static IntPtr WaitForMainWindow(Process hostProcess, int timeoutSeconds)
    {
        try
        {
            hostProcess.WaitForInputIdle(timeoutSeconds * 1000);
        }
        catch
        {
        }

        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(timeoutSeconds);
        while (DateTime.UtcNow < deadline)
        {
            hostProcess.Refresh();
            if (hostProcess.MainWindowHandle != IntPtr.Zero)
            {
                return hostProcess.MainWindowHandle;
            }

            Thread.Sleep(150);
        }

        throw new TimeoutException($"Timed out waiting for main window handle. PID={hostProcess.Id}");
    }

    private static HostSnapshotPayload WaitForSnapshot(
        string snapshotPath,
        TimeSpan timeout,
        Func<HostSnapshotPayload, bool> predicate,
        Action? onRetry = null)
    {
        var deadline = DateTime.UtcNow + timeout;
        HostSnapshotPayload? latest = null;

        while (DateTime.UtcNow < deadline)
        {
            latest = TryReadSnapshot(snapshotPath);
            if (latest is not null && predicate(latest))
            {
                return latest;
            }

            onRetry?.Invoke();
            Thread.Sleep(150);
        }

        if (latest is not null)
        {
            return latest;
        }

        throw new TimeoutException($"Timed out waiting for live snapshot: {snapshotPath}");
    }

    private static HostSnapshotPayload? TryReadSnapshot(string snapshotPath)
    {
        if (!File.Exists(snapshotPath))
        {
            return null;
        }

        try
        {
            var json = File.ReadAllText(snapshotPath, Encoding.UTF8);
            var payload = JsonSerializer.Deserialize<HostSnapshotPayload>(json);
            return payload is null ? null : payload with { SnapshotJson = json };
        }
        catch
        {
            return null;
        }
    }

    private static void BringWindowToForeground(IntPtr windowHandle)
    {
        ShowWindow(windowHandle, 9);
        SetForegroundWindow(windowHandle);
    }

    private static void TryStopProcess(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.CloseMainWindow();
                if (!process.WaitForExit(2000))
                {
                    process.Kill(entireProcessTree: true);
                    process.WaitForExit(5000);
                }
            }
        }
        catch
        {
        }
    }

    private static IReadOnlyList<AttemptPlan> BuildAttempts()
    {
        return new[]
        {
            new AttemptPlan("keybd-direct-number-1", "keybd", ToggleShiftBeforeTyping: false, CommitWithSpace: false),
            new AttemptPlan("keybd-direct-space", "keybd", ToggleShiftBeforeTyping: false, CommitWithSpace: true),
            new AttemptPlan("keybd-toggle-shift-number-1", "keybd", ToggleShiftBeforeTyping: true, CommitWithSpace: false),
            new AttemptPlan("keybd-toggle-shift-space", "keybd", ToggleShiftBeforeTyping: true, CommitWithSpace: true),
            new AttemptPlan("sendkeys-direct-number-1", "sendkeys", ToggleShiftBeforeTyping: false, CommitWithSpace: false),
            new AttemptPlan("sendkeys-direct-space", "sendkeys", ToggleShiftBeforeTyping: false, CommitWithSpace: true),
            new AttemptPlan("sendkeys-toggle-shift-number-1", "sendkeys", ToggleShiftBeforeTyping: true, CommitWithSpace: false),
            new AttemptPlan("sendkeys-toggle-shift-space", "sendkeys", ToggleShiftBeforeTyping: true, CommitWithSpace: true)
        };
    }

    private static void SendKeysToWindow(string inputMode, string sendKeysText, int delayMs, Action keybdAction)
    {
        if (string.Equals(inputMode, "sendkeys", StringComparison.OrdinalIgnoreCase))
        {
            SendKeys.SendWait(sendKeysText);
            Thread.Sleep(delayMs);
            return;
        }

        keybdAction();
    }

    private static string BuildAttemptSnapshotPath(string resultPath, string attemptName)
    {
        var directory = Path.GetDirectoryName(resultPath)!;
        var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(resultPath);
        return Path.Combine(directory, $"{fileNameWithoutExtension}.{attemptName}.live-snapshot.json");
    }

    private static string Quote(string value)
    {
        return $"\"{value.Replace("\"", "\\\"")}\"";
    }

    private static void PersistResult(string resultPath, AutomationRunResult result)
    {
        var json = JsonSerializer.Serialize(result, new JsonSerializerOptions
        {
            WriteIndented = true
        });
        File.WriteAllText(resultPath, json, new UTF8Encoding(false));
    }

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    private sealed record AttemptPlan(string Name, string InputMode, bool ToggleShiftBeforeTyping, bool CommitWithSpace);

    private sealed record AttemptResult(
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("input_mode")] string InputMode,
        [property: JsonPropertyName("toggle_shift_before_typing")] bool ToggleShiftBeforeTyping,
        [property: JsonPropertyName("commit_key")] string CommitKey,
        [property: JsonPropertyName("passed")] bool Passed,
        [property: JsonPropertyName("error_message")] string? ErrorMessage,
        [property: JsonPropertyName("activation_after_focus")] WeaselImeProfileActivator.WeaselActivationSnapshot? ActivationAfterFocus,
        [property: JsonPropertyName("window_handle_hex")] string WindowHandleHex,
        [property: JsonPropertyName("live_snapshot_path")] string LiveSnapshotPath,
        [property: JsonPropertyName("ready_snapshot")] HostSnapshotPayload? ReadySnapshot,
        [property: JsonPropertyName("final_snapshot")] HostSnapshotPayload? FinalSnapshot);

    private sealed record AutomationRunResult(
        [property: JsonPropertyName("generated_at")] DateTimeOffset GeneratedAt,
        [property: JsonPropertyName("passed")] bool Passed,
        [property: JsonPropertyName("crash_message")] string? CrashMessage,
        [property: JsonPropertyName("test_host_exe_path")] string TestHostExePath,
        [property: JsonPropertyName("result_path")] string ResultPath,
        [property: JsonPropertyName("pinyin")] string Pinyin,
        [property: JsonPropertyName("expected_text")] string ExpectedText,
        [property: JsonPropertyName("matched_attempt_name")] string? MatchedAttemptName,
        [property: JsonPropertyName("activation_before_launch")] WeaselImeProfileActivator.WeaselActivationSnapshot? ActivationBeforeLaunch,
        [property: JsonPropertyName("attempts")] IReadOnlyList<AttemptResult> Attempts,
        [property: JsonPropertyName("elapsed_milliseconds")] long ElapsedMilliseconds)
    {
        public static AutomationRunResult CreateCrashed(AutomationSettings settings, Exception ex)
        {
            return new AutomationRunResult(
                GeneratedAt: DateTimeOffset.Now,
                Passed: false,
                CrashMessage: ex.ToString(),
                TestHostExePath: settings.TestHostExePath,
                ResultPath: settings.ResultPath,
                Pinyin: settings.Pinyin,
                ExpectedText: settings.ExpectedText,
                MatchedAttemptName: null,
                ActivationBeforeLaunch: null,
                Attempts: Array.Empty<AttemptResult>(),
                ElapsedMilliseconds: 0);
        }
    }

    private sealed record HostSnapshotPayload(
        [property: JsonPropertyName("generated_at")] string GeneratedAt,
        [property: JsonPropertyName("active_host")] string ActiveHost,
        [property: JsonPropertyName("active_web_element")] string ActiveWebElement,
        [property: JsonPropertyName("last_focus_request")] string LastFocusRequest,
        [property: JsonPropertyName("form_contains_focus")] bool FormContainsFocus,
        [property: JsonPropertyName("active_control_name")] string ActiveControlName,
        [property: JsonPropertyName("last_key_event")] string LastKeyEvent,
        [property: JsonPropertyName("key_event_count")] int KeyEventCount,
        [property: JsonPropertyName("browser_ready")] bool BrowserReady,
        [property: JsonPropertyName("function_kit_enabled")] bool FunctionKitEnabled,
        [property: JsonPropertyName("function_kit_ready")] bool FunctionKitReady,
        [property: JsonPropertyName("function_kit_last_error")] string FunctionKitLastError,
        [property: JsonPropertyName("single_line_text")] string SingleLineText,
        [property: JsonPropertyName("multi_line_text")] string MultiLineText,
        [property: JsonPropertyName("rich_text")] string RichText,
        [property: JsonPropertyName("web_input_text")] string WebInputText,
        [property: JsonPropertyName("web_textarea_text")] string WebTextareaText,
        [property: JsonPropertyName("web_editor_text")] string WebEditorText)
    {
        [JsonPropertyName("snapshot_json")]
        public string SnapshotJson { get; init; } = string.Empty;
    }
}
