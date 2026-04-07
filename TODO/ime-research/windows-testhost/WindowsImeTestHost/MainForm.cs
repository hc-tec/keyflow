using System.Text;
using System.Text.Json;
using FunctionKitRuntimeSdk.WindowsWebView2;
using Microsoft.Web.WebView2.WinForms;
using System.Windows.Forms;

namespace WindowsImeTestHost;

internal sealed partial class MainForm : Form
{
    private const string WebInputId = "ime-web-input";
    private const string WebTextareaId = "ime-web-textarea";
    private const string WebEditorId = "ime-web-editor";
    private const string DefaultFunctionKitManifestPath = "function-kits/chat-auto-reply/manifest.json";

    private readonly TestHostOptions _options;
    private readonly JsonSerializerOptions _snapshotJsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };
    private readonly string _workspaceRoot;
    private readonly string _functionKitRootPath;
    private readonly string _functionKitManifestPath;
    private readonly FunctionKitManifestMetadata _functionKitManifestMetadata;
    private readonly string _functionKitEntryRelativePath;
    private readonly string _functionKitStoragePath;
    private readonly string _functionKitKitId;
    private readonly IReadOnlyList<string> _allowedRuntimePermissions;
    private readonly IReadOnlyDictionary<string, string> _functionKitFixturePaths;
    private readonly System.Windows.Forms.Timer _statusTimer;
    private readonly TextBox _singleLineTextBox;
    private readonly TextBox _multiLineTextBox;
    private readonly RichTextBox _richTextBox;
    private readonly WebBrowser _webBrowser;
    private readonly WebView2 _functionKitWebView;
    private readonly TextBox _webInputSnapshotTextBox;
    private readonly TextBox _webTextareaSnapshotTextBox;
    private readonly TextBox _webEditorSnapshotTextBox;
    private readonly TextBox _activeHostTextBox;
    private readonly TextBox _activeWebElementTextBox;
    private readonly TextBox _lastFocusRequestTextBox;
    private readonly TextBox _browserReadyTextBox;
    private readonly TextBox _snapshotTextBox;
    private readonly TextBox _eventLogTextBox;
    private readonly TextBox _functionKitReadyStateTextBox;
    private readonly TextBox _functionKitSessionTextBox;
    private readonly TextBox _functionKitCommitTargetTextBox;
    private readonly TextBox _functionKitEntryTextBox;
    private readonly TextBox _functionKitStorageTextBox;
    private readonly TextBox _functionKitLastMessageTypeTextBox;
    private readonly TextBox _functionKitLastErrorTextBox;

    private FunctionKitPanelHost? _functionKitHost;
    private FunctionKitStorageStore? _functionKitStorage;
    private IReadOnlyList<string> _grantedRuntimePermissions = Array.Empty<string>();
    private bool _browserReady;
    private bool _smokeSequenceStarted;
    private bool _startupFocusApplied;
    private bool _functionKitReady;
    private int _keyEventCount;
    private int _functionKitRenderGeneration;
    private string _lastFocusRequest = "none";
    private string _lastCommitTarget = "none";
    private string _lastKeyEvent = "none";
    private string _functionKitSessionId = "pending";
    private string _functionKitLastMessageType = "none";
    private string _functionKitLastError = "none";
    private string _lastPersistedSnapshotJson = string.Empty;

    public MainForm(TestHostOptions options)
    {
        _options = options;
        _workspaceRoot = ResolveWorkspaceRoot();
        _functionKitRootPath = ResolveFunctionKitRootPath();
        _functionKitManifestPath = ResolveFunctionKitManifestPath();
        _functionKitManifestMetadata = FunctionKitManifestMetadata.Load(
            _functionKitManifestPath,
            _functionKitRootPath,
            _options.FunctionKitEntry);
        _functionKitKitId = _functionKitManifestMetadata.Id;
        _functionKitEntryRelativePath = _functionKitManifestMetadata.EntryRelativePath;
        _allowedRuntimePermissions = _functionKitManifestMetadata.RuntimePermissions;
        _functionKitFixturePaths = _functionKitManifestMetadata.FixturePaths;
        _functionKitStoragePath = ResolveFunctionKitStoragePath();

        Text = "Windows IME TestHost";
        Name = "ImeTestHostForm";
        KeyPreview = true;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(1440, 1040);
        Width = 1560;
        Height = 1120;

        _statusTimer = new System.Windows.Forms.Timer { Interval = 250 };
        _statusTimer.Tick += (_, _) => RefreshState();

        _singleLineTextBox = CreateEditableTextBox("singleLineInputTextBox", multiline: false, "单行输入框 / Single-line TextBox");
        _multiLineTextBox = CreateEditableTextBox("multiLineInputTextBox", multiline: true, "多行输入框 / Multi-line TextBox");
        _richTextBox = CreateRichTextBox();
        _webBrowser = CreateWebBrowser();
        _functionKitWebView = CreateFunctionKitWebView();
        _webInputSnapshotTextBox = CreateReadOnlyTextBox("webInputSnapshotTextBox", multiline: false);
        _webTextareaSnapshotTextBox = CreateReadOnlyTextBox("webTextareaSnapshotTextBox", multiline: true);
        _webEditorSnapshotTextBox = CreateReadOnlyTextBox("webEditorSnapshotTextBox", multiline: true);
        _activeHostTextBox = CreateReadOnlyTextBox("activeHostTextBox", multiline: false);
        _activeWebElementTextBox = CreateReadOnlyTextBox("activeWebElementTextBox", multiline: false);
        _lastFocusRequestTextBox = CreateReadOnlyTextBox("lastFocusRequestTextBox", multiline: false);
        _browserReadyTextBox = CreateReadOnlyTextBox("browserReadyTextBox", multiline: false);
        _snapshotTextBox = CreateReadOnlyTextBox("snapshotTextBox", multiline: true);
        _eventLogTextBox = CreateReadOnlyTextBox("eventLogTextBox", multiline: true);
        _functionKitReadyStateTextBox = CreateReadOnlyTextBox("functionKitReadyStateTextBox", multiline: false);
        _functionKitSessionTextBox = CreateReadOnlyTextBox("functionKitSessionTextBox", multiline: false);
        _functionKitCommitTargetTextBox = CreateReadOnlyTextBox("functionKitCommitTargetTextBox", multiline: false);
        _functionKitEntryTextBox = CreateReadOnlyTextBox("functionKitEntryTextBox", multiline: false);
        _functionKitStorageTextBox = CreateReadOnlyTextBox("functionKitStorageTextBox", multiline: false);
        _functionKitLastMessageTypeTextBox = CreateReadOnlyTextBox("functionKitLastMessageTypeTextBox", multiline: false);
        _functionKitLastErrorTextBox = CreateReadOnlyTextBox("functionKitLastErrorTextBox", multiline: false);

        Controls.Add(BuildRootLayout());

        RegisterInputDiagnostics("form", this);
        RegisterInputDiagnostics("single-line", _singleLineTextBox);
        RegisterInputDiagnostics("multi-line", _multiLineTextBox);
        RegisterInputDiagnostics("rich-text", _richTextBox);
        RegisterCommitTargetTracking("single-line", _singleLineTextBox);
        RegisterCommitTargetTracking("multi-line", _multiLineTextBox);
        RegisterCommitTargetTracking("rich-text", _richTextBox);

        Shown += OnShown;
        Activated += (_, _) => ApplyStartupFocusIfNeeded(force: true);
        FormClosed += (_, _) => _statusTimer.Stop();

        LoadWebDocument();
        RefreshState();
        _statusTimer.Start();
    }

    private async void OnShown(object? sender, EventArgs e)
    {
        if (_smokeSequenceStarted)
        {
            return;
        }

        var waitStartedAt = DateTime.UtcNow;
        while (!_browserReady && DateTime.UtcNow - waitStartedAt < TimeSpan.FromSeconds(4))
        {
            await Task.Delay(150);
        }

        await InitializeFunctionKitIfNeededAsync();

        if (!_options.DisableFunctionKit)
        {
            var functionKitWaitStartedAt = DateTime.UtcNow;
            while (!_functionKitReady &&
                   string.Equals(_functionKitLastError, "none", StringComparison.Ordinal) &&
                   DateTime.UtcNow - functionKitWaitStartedAt < TimeSpan.FromSeconds(4))
            {
                await Task.Delay(150);
            }

            if (!_functionKitReady && string.Equals(_functionKitLastError, "none", StringComparison.Ordinal))
            {
                await ProbeFunctionKitAsync();
            }
        }

        ApplyStartupFocusIfNeeded(force: true);
        await Task.Delay(120);
        ApplyStartupFocusIfNeeded(force: true);
        RefreshState();

        if (!_options.SmokeMode)
        {
            return;
        }

        _smokeSequenceStarted = true;
        AppendLog("Smoke 模式启动。");

        if (_options.FunctionKitContractTest)
        {
            var contractResult = await RunFunctionKitContractTestAsync();
            await PersistFunctionKitContractResultAsync(contractResult);
            if (!string.IsNullOrWhiteSpace(contractResult.FailureReason))
            {
                _functionKitLastError = contractResult.FailureReason;
                AppendLog($"FunctionKit contract 失败：{contractResult.FailureReason}");
            }
            else
            {
                AppendLog("FunctionKit contract 已通过。");
            }
        }
        else if (_functionKitReady && IsCommitEligibleTarget(_lastCommitTarget))
        {
            await RunFunctionKitSmokeCommitAsync();
        }

        if (!string.IsNullOrWhiteSpace(_options.SnapshotPath))
        {
            var snapshotPath = Path.GetFullPath(_options.SnapshotPath);
            var directory = Path.GetDirectoryName(snapshotPath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var json = JsonSerializer.Serialize(CaptureSnapshot(), _snapshotJsonOptions);
            await File.WriteAllTextAsync(snapshotPath, json, new UTF8Encoding(false));
            AppendLog($"Smoke 快照已写入：{snapshotPath}");
            RefreshState();
        }

        await Task.Delay(250);
        Close();
    }

    private void FocusHost(string hostName, Control control)
    {
        _lastFocusRequest = hostName;
        UpdateCommitTarget(hostName);
        Activate();
        BringToFront();
        ActiveControl = control;
        control.Select();
        control.Focus();
        AppendLog($"请求聚焦：{hostName}");
        RefreshState();
    }

    private void FocusWebElement(string elementId)
    {
        _lastFocusRequest = $"web:{elementId}";
        UpdateCommitTarget($"web:{elementId}");

        Activate();
        BringToFront();
        ActiveControl = _webBrowser;
        _webBrowser.Select();

        if (!_browserReady || _webBrowser.Document is null)
        {
            AppendLog($"网页尚未就绪，无法聚焦：{elementId}");
            RefreshState();
            return;
        }

        var element = _webBrowser.Document.GetElementById(elementId);
        element?.InvokeMember("focus");
        _webBrowser.Focus();
        AppendLog($"请求聚焦：web:{elementId}");
        RefreshState();
    }

    private void ClearAllInputs()
    {
        _singleLineTextBox.Clear();
        _multiLineTextBox.Clear();
        _richTextBox.Clear();
        SetWebElementValue(WebInputId, string.Empty);
        SetWebElementValue(WebTextareaId, string.Empty);
        SetWebEditorText(string.Empty);
        AppendLog("已清空全部输入控件。");
        RefreshState();
    }

    private void LoadWebDocument()
    {
        _browserReady = false;
        _webBrowser.DocumentText = """
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Windows IME TestHost Web Input</title>
    <style>
      body { font-family: Segoe UI, sans-serif; margin: 12px; }
      .section { margin-bottom: 16px; }
      label { display: block; font-weight: 600; margin-bottom: 6px; }
      input, textarea, div[contenteditable="true"] {
        width: 100%;
        box-sizing: border-box;
        font-size: 16px;
        padding: 8px;
        border: 1px solid #808080;
      }
      textarea { min-height: 92px; resize: vertical; }
      div[contenteditable="true"] { min-height: 92px; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div class="section">
      <label for="ime-web-input">HTML input</label>
      <input id="ime-web-input" type="text" autocomplete="off" />
    </div>
    <div class="section">
      <label for="ime-web-textarea">HTML textarea</label>
      <textarea id="ime-web-textarea"></textarea>
    </div>
    <div class="section">
      <label for="ime-web-editor">contenteditable</label>
      <div id="ime-web-editor" contenteditable="true"></div>
    </div>
  </body>
</html>
""";
        AppendLog("已重载网页输入场景。");
    }

    private void SetWebElementValue(string elementId, string value)
    {
        if (!_browserReady || _webBrowser.Document is null)
        {
            return;
        }

        var element = _webBrowser.Document.GetElementById(elementId);
        if (element is null)
        {
            return;
        }

        element.SetAttribute("value", value);
        if (string.Equals(element.TagName, "TEXTAREA", StringComparison.OrdinalIgnoreCase))
        {
            element.InnerText = value;
        }
    }

    private void SetWebEditorText(string value)
    {
        if (!_browserReady || _webBrowser.Document is null)
        {
            return;
        }

        var element = _webBrowser.Document.GetElementById(WebEditorId);
        if (element is null)
        {
            return;
        }

        element.InnerText = value;
    }

    private string GetWebElementValue(string elementId)
    {
        if (!_browserReady || _webBrowser.Document is null)
        {
            return string.Empty;
        }

        var element = _webBrowser.Document.GetElementById(elementId);
        if (element is null)
        {
            return string.Empty;
        }

        if (string.Equals(element.TagName, "INPUT", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(element.TagName, "TEXTAREA", StringComparison.OrdinalIgnoreCase))
        {
            return element.GetAttribute("value") ?? element.InnerText ?? string.Empty;
        }

        return element.InnerText ?? string.Empty;
    }

    private string GetActiveWebElementId()
    {
        if (!_browserReady || _webBrowser.Document is null)
        {
            return "none";
        }

        try
        {
            var activeElement = _webBrowser.Document.ActiveElement;
            return string.IsNullOrWhiteSpace(activeElement?.Id) ? "none" : activeElement.Id;
        }
        catch
        {
            return "none";
        }
    }

    private string GetActiveHost()
    {
        if (_singleLineTextBox.ContainsFocus)
        {
            return "single-line";
        }

        if (_multiLineTextBox.ContainsFocus)
        {
            return "multi-line";
        }

        if (_richTextBox.ContainsFocus)
        {
            return "rich-text";
        }

        if (_webBrowser.ContainsFocus || _webBrowser.Focused)
        {
            var webElementId = GetActiveWebElementId();
            return webElementId == "none" ? "web-browser" : $"web:{webElementId}";
        }

        if (_functionKitWebView.ContainsFocus || _functionKitWebView.Focused)
        {
            return "function-kit-panel";
        }

        return "none";
    }

    private string GetActiveControlName()
    {
        Control? current = ActiveControl;
        while (current is ContainerControl container &&
               container.ActiveControl is not null &&
               !ReferenceEquals(current, container.ActiveControl))
        {
            current = container.ActiveControl;
        }

        if (current is null)
        {
            return "none";
        }

        return string.IsNullOrWhiteSpace(current.Name)
            ? current.GetType().Name
            : current.Name;
    }

    private bool HasStartupFocusTarget(string target)
    {
        return target switch
        {
            "single-line" => _singleLineTextBox.ContainsFocus,
            "multi-line" => _multiLineTextBox.ContainsFocus,
            "rich-text" => _richTextBox.ContainsFocus,
            "web-input" => string.Equals(GetActiveHost(), $"web:{WebInputId}", StringComparison.OrdinalIgnoreCase),
            "web-textarea" => string.Equals(GetActiveHost(), $"web:{WebTextareaId}", StringComparison.OrdinalIgnoreCase),
            "web-editor" => string.Equals(GetActiveHost(), $"web:{WebEditorId}", StringComparison.OrdinalIgnoreCase),
            _ => false
        };
    }

    private HostSnapshot CaptureSnapshot()
    {
        return new HostSnapshot(
            DateTimeOffset.Now.ToString("O"),
            GetActiveHost(),
            GetActiveWebElementId(),
            _lastFocusRequest,
            ContainsFocus,
            GetActiveControlName(),
            _lastCommitTarget,
            _lastKeyEvent,
            _keyEventCount,
            _browserReady,
            !_options.DisableFunctionKit,
            _functionKitReady,
            _functionKitSessionId,
            _functionKitEntryRelativePath,
            _functionKitStoragePath,
            _functionKitLastMessageType,
            _functionKitLastError,
            _singleLineTextBox.Text,
            _multiLineTextBox.Text,
            _richTextBox.Text,
            GetWebElementValue(WebInputId),
            GetWebElementValue(WebTextareaId),
            GetWebElementValue(WebEditorId));
    }

    private void RefreshState()
    {
        var snapshot = CaptureSnapshot();
        SyncCommitTargetFromSnapshot(snapshot);

        var snapshotJson = JsonSerializer.Serialize(snapshot, _snapshotJsonOptions);

        _webInputSnapshotTextBox.Text = snapshot.WebInputText;
        _webTextareaSnapshotTextBox.Text = snapshot.WebTextareaText;
        _webEditorSnapshotTextBox.Text = snapshot.WebEditorText;
        _activeHostTextBox.Text = snapshot.ActiveHost;
        _activeWebElementTextBox.Text = snapshot.ActiveWebElement;
        _lastFocusRequestTextBox.Text = snapshot.LastFocusRequest;
        _browserReadyTextBox.Text = snapshot.BrowserReady ? "true" : "false";
        _functionKitReadyStateTextBox.Text = _options.DisableFunctionKit
            ? "disabled"
            : snapshot.FunctionKitReady
                ? "ready"
                : snapshot.FunctionKitLastError == "none"
                    ? "loading"
                    : "error";
        _functionKitSessionTextBox.Text = snapshot.FunctionKitSessionId;
        _functionKitCommitTargetTextBox.Text = snapshot.LastCommitTarget;
        _functionKitEntryTextBox.Text = snapshot.FunctionKitEntry;
        _functionKitStorageTextBox.Text = snapshot.FunctionKitStorageFile;
        _functionKitLastMessageTypeTextBox.Text = snapshot.FunctionKitLastMessageType;
        _functionKitLastErrorTextBox.Text = snapshot.FunctionKitLastError;
        _snapshotTextBox.Text = snapshotJson;
        PersistLiveSnapshotIfNeeded(snapshotJson);
    }

    private void PersistLiveSnapshotIfNeeded(string snapshotJson)
    {
        if (string.IsNullOrWhiteSpace(_options.LiveSnapshotPath) ||
            string.Equals(snapshotJson, _lastPersistedSnapshotJson, StringComparison.Ordinal))
        {
            return;
        }

        var snapshotPath = Path.GetFullPath(_options.LiveSnapshotPath);
        var directory = Path.GetDirectoryName(snapshotPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        File.WriteAllText(snapshotPath, snapshotJson, new UTF8Encoding(false));
        _lastPersistedSnapshotJson = snapshotJson;
    }

    private void ApplyStartupFocusIfNeeded(bool force = false)
    {
        if ((!force && _startupFocusApplied) || string.IsNullOrWhiteSpace(_options.StartupFocusTarget))
        {
            return;
        }

        var target = _options.StartupFocusTarget.Trim().ToLowerInvariant();
        if (HasStartupFocusTarget(target))
        {
            if (!_startupFocusApplied || force)
            {
                AppendLog($"startup focus 已确认：{target}");
            }
            _startupFocusApplied = true;
            RefreshState();
            return;
        }

        switch (target)
        {
            case "single-line":
                FocusHost("single-line", _singleLineTextBox);
                break;
            case "multi-line":
                FocusHost("multi-line", _multiLineTextBox);
                break;
            case "rich-text":
                FocusHost("rich-text", _richTextBox);
                break;
            case "web-input":
                FocusWebElement(WebInputId);
                break;
            case "web-textarea":
                FocusWebElement(WebTextareaId);
                break;
            case "web-editor":
                FocusWebElement(WebEditorId);
                break;
            default:
                AppendLog($"不支持的 startup focus：{_options.StartupFocusTarget}");
                break;
        }

        if (HasStartupFocusTarget(target))
        {
            _startupFocusApplied = true;
            AppendLog($"startup focus 已获得真实焦点：{target}");
        }
        else
        {
            _startupFocusApplied = false;
            AppendLog(
                $"startup focus 尚未生效：target={target}, activeHost={GetActiveHost()}, activeControl={GetActiveControlName()}, formContainsFocus={ContainsFocus}");
        }

        RefreshState();
    }

    private void AppendLog(string message)
    {
        var line = $"{DateTimeOffset.Now:HH:mm:ss.fff} {message}";
        if (_eventLogTextBox.TextLength == 0)
        {
            _eventLogTextBox.Text = line;
        }
        else
        {
            _eventLogTextBox.AppendText(Environment.NewLine + line);
        }
    }

    private void RegisterInputDiagnostics(string hostName, Control control)
    {
        control.KeyDown += (_, args) => RecordKeyEvent($"{hostName}:KeyDown:{args.KeyCode}");
        control.KeyPress += (_, args) =>
        {
            var printable = char.IsControl(args.KeyChar) ? ((int)args.KeyChar).ToString() : args.KeyChar.ToString();
            RecordKeyEvent($"{hostName}:KeyPress:{printable}");
        };
    }

    private void RegisterCommitTargetTracking(string hostName, Control control)
    {
        control.Enter += (_, _) => UpdateCommitTarget(hostName);
        control.MouseDown += (_, _) => UpdateCommitTarget(hostName);
    }

    private void RecordKeyEvent(string message)
    {
        _keyEventCount += 1;
        _lastKeyEvent = message;
        AppendLog($"键盘事件：{message}");
    }

    private void UpdateCommitTarget(string target)
    {
        if (!IsCommitEligibleTarget(target) ||
            string.Equals(_lastCommitTarget, target, StringComparison.Ordinal))
        {
            return;
        }

        _lastCommitTarget = target;
    }

    private void SyncCommitTargetFromSnapshot(HostSnapshot snapshot)
    {
        if (IsCommitEligibleTarget(snapshot.ActiveHost))
        {
            UpdateCommitTarget(snapshot.ActiveHost);
        }
    }

    private static bool IsCommitEligibleTarget(string target)
    {
        return target switch
        {
            "single-line" => true,
            "multi-line" => true,
            "rich-text" => true,
            var value when value.StartsWith("web:", StringComparison.Ordinal) => true,
            _ => false
        };
    }

    private static string ResolveCommitTargetLabel(string target)
    {
        return target switch
        {
            "single-line" => "单行输入框",
            "multi-line" => "多行输入框",
            "rich-text" => "RichTextBox",
            var value when value == $"web:{WebInputId}" => "网页 input",
            var value when value == $"web:{WebTextareaId}" => "网页 textarea",
            var value when value == $"web:{WebEditorId}" => "网页 contenteditable",
            _ => "未选择提交目标"
        };
    }

    private string ResolveFunctionKitRootPath()
    {
        return Path.GetFullPath(_options.FunctionKitRoot ?? Path.Combine(_workspaceRoot, "TODO"));
    }

    private string ResolveFunctionKitManifestPath()
    {
        return Path.GetFullPath(_options.FunctionKitManifest ?? Path.Combine(_functionKitRootPath, DefaultFunctionKitManifestPath));
    }

    private string ResolveFunctionKitStoragePath()
    {
        return Path.GetFullPath(_options.FunctionKitStoragePath ??
            Path.Combine(_functionKitRootPath, "ime-research", "logs", "function-kit-storage", $"{_functionKitKitId}.runtime.json"));
    }

    private string ResolveFunctionKitCachePath()
    {
        return Path.Combine(_functionKitRootPath, "ime-research", ".cache", "webview2", "windows-testhost");
    }

    private static string ResolveWorkspaceRoot()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            if (Directory.Exists(Path.Combine(current.FullName, "TODO", "function-kits")))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        return Directory.GetCurrentDirectory();
    }

    private static string ResolveFunctionKitLocalPath(string functionKitRootPath, string relativeOrAbsolutePath)
    {
        return Path.IsPathRooted(relativeOrAbsolutePath)
            ? Path.GetFullPath(relativeOrAbsolutePath)
            : Path.GetFullPath(Path.Combine(functionKitRootPath, relativeOrAbsolutePath));
    }

    private static bool IsPathUnderRoot(string candidatePath, string rootPath)
    {
        var normalizedCandidate = Path.GetFullPath(candidatePath)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var normalizedRoot = Path.GetFullPath(rootPath)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        return normalizedCandidate.StartsWith(normalizedRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ||
               string.Equals(normalizedCandidate, normalizedRoot, StringComparison.OrdinalIgnoreCase);
    }
}
