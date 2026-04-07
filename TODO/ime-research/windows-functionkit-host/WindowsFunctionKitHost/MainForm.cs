using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using FunctionKitRuntimeSdk.WindowsWebView2;
using Microsoft.Web.WebView2.WinForms;

namespace WindowsFunctionKitHost;

internal sealed class MainForm : Form
{
    private const string Surface = "panel";

    private sealed record RoutingSnapshot(
        string RequestedExecutionMode,
        string EffectiveExecutionMode,
        string? PreferredBackendClass,
        string? PreferredAdapter,
        string? LatencyTier,
        int? LatencyBudgetMs,
        bool? RequireStructuredJson,
        IReadOnlyList<string> RequiredCapabilities,
        IReadOnlyList<string> Notes,
        string RenderPath,
        string Reason);

    private readonly FunctionKitHostOptions _options;
    private readonly FunctionKitManifestMetadata _manifest;
    private readonly JsonFileFunctionKitStorage _storage;
    private readonly ChatAutoReplyPreviewEngine _previewEngine;
    private readonly FunctionKitRemoteClient _remoteClient;
    private readonly TextBox _sourceMessageTextBox;
    private readonly TextBox _conversationSummaryTextBox;
    private readonly TextBox _personaChipsTextBox;
    private readonly TextBox _targetInputTextBox;
    private readonly TextBox _sessionTextBox;
    private readonly TextBox _lastUiMessageTextBox;
    private readonly TextBox _lastHostMessageTextBox;
    private readonly TextBox _activeTabTextBox;
    private readonly TextBox _snapshotTextBox;
    private readonly TextBox _logTextBox;
    private readonly WebView2 _webView;
    private readonly Dictionary<string, CheckBox> _permissionCheckBoxes;
    private FunctionKitWebView2Host? _host;
    private bool _webViewReady;
    private bool _smokeComplete;
    private string _sessionId = "pending";
    private string _lastUiMessageType = "none";
    private string _lastHostMessageType = "none";
    private string _activeTab = "candidates";
    private string _lastStatusLabel = "waiting";
    private string _lastErrorCode = "none";
    private int _renderCount;
    private int _candidateCount;
    private string _lastPersistedSnapshotJson = string.Empty;
    private string KitId => _manifest.Id;

    public MainForm(FunctionKitHostOptions options)
    {
        _options = options;
        _manifest = FunctionKitManifestMetadata.Load(options.TodoRootPath, options.KitId, options.EntryRelativePath);
        _storage = new JsonFileFunctionKitStorage(options.StoragePath);
        _previewEngine = new ChatAutoReplyPreviewEngine();
        _remoteClient = new FunctionKitRemoteClient(options.HostServiceBaseUrl, TimeSpan.FromSeconds(options.HostServiceTimeoutSeconds));

        Text = "Windows Function Kit Host";
        Name = "WindowsFunctionKitHostForm";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(1440, 980);
        Width = 1560;
        Height = 1040;

        _sourceMessageTextBox = CreateEditableTextBox("sourceMessageTextBox", multiline: true);
        _conversationSummaryTextBox = CreateEditableTextBox("conversationSummaryTextBox", multiline: true);
        _personaChipsTextBox = CreateEditableTextBox("personaChipsTextBox", multiline: true);
        _targetInputTextBox = CreateEditableTextBox("targetInputTextBox", multiline: true);
        _sessionTextBox = CreateReadOnlyTextBox("sessionTextBox", multiline: false);
        _lastUiMessageTextBox = CreateReadOnlyTextBox("lastUiMessageTextBox", multiline: false);
        _lastHostMessageTextBox = CreateReadOnlyTextBox("lastHostMessageTextBox", multiline: false);
        _activeTabTextBox = CreateReadOnlyTextBox("activeTabTextBox", multiline: false);
        _snapshotTextBox = CreateReadOnlyTextBox("snapshotTextBox", multiline: true);
        _logTextBox = CreateReadOnlyTextBox("logTextBox", multiline: true);
        _webView = new WebView2
        {
            Name = "functionKitWebView",
            Dock = DockStyle.Fill
        };

        _permissionCheckBoxes = CreatePermissionCheckBoxes();
        ApplyManifestRuntimePermissions();
        SeedDefaultContext();
        HookStateRefresh();
        Controls.Add(BuildRootLayout());

        Shown += OnShown;
    }

    private Control BuildRootLayout()
    {
        var splitContainer = new SplitContainer
        {
            Dock = DockStyle.Fill,
            FixedPanel = FixedPanel.Panel1,
            SplitterDistance = 400,
            Name = "rootSplitContainer"
        };

        splitContainer.Panel1.Controls.Add(BuildHostPanel());
        splitContainer.Panel2.Controls.Add(BuildWorkspacePanel());
        return splitContainer;
    }

    private Control BuildHostPanel()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 5,
            Padding = new Padding(12),
            Name = "hostPanel"
        };

        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 55));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 25));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 20));

        panel.Controls.Add(new Label
        {
            AutoSize = true,
            Text = "左侧是宿主侧上下文、权限和目标输入框；右侧是真正加载的浏览器式功能件 UI。",
            Name = "hostIntroLabel"
        }, 0, 0);
        panel.Controls.Add(BuildScenarioGroup(), 0, 1);
        panel.Controls.Add(BuildPermissionsGroup(), 0, 2);
        panel.Controls.Add(BuildCommandBar(), 0, 3);
        panel.Controls.Add(BuildStateGroup(), 0, 4);

        return panel;
    }

    private Control BuildScenarioGroup()
    {
        var group = new GroupBox
        {
            Dock = DockStyle.Fill,
            Text = "宿主上下文 / 目标输入框",
            Name = "scenarioGroup"
        };

        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 8,
            Padding = new Padding(12),
            Name = "scenarioTable"
        };

        table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 110));
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 90));
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 90));
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 110));

        table.Controls.Add(CreateFieldLabel("sourceMessageLabel", "当前消息"), 0, 0);
        table.Controls.Add(_sourceMessageTextBox, 0, 1);
        table.Controls.Add(CreateFieldLabel("conversationSummaryLabel", "会话摘要"), 0, 2);
        table.Controls.Add(_conversationSummaryTextBox, 0, 3);
        table.Controls.Add(CreateFieldLabel("personaChipsLabel", "Persona / 约束（逗号或换行分隔）"), 0, 4);
        table.Controls.Add(_personaChipsTextBox, 0, 5);
        table.Controls.Add(CreateFieldLabel("targetInputLabel", "目标输入框模拟"), 0, 6);
        table.Controls.Add(_targetInputTextBox, 0, 7);

        group.Controls.Add(table);
        return group;
    }

    private Control BuildPermissionsGroup()
    {
        var group = new GroupBox
        {
            Dock = DockStyle.Fill,
            Text = "权限策略",
            Name = "permissionsGroup"
        };

        var flow = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoScroll = true,
            Padding = new Padding(12),
            Name = "permissionsFlow"
        };

        foreach (var checkBox in _permissionCheckBoxes.Values)
        {
            flow.Controls.Add(checkBox);
        }

        group.Controls.Add(flow);
        return group;
    }
    private Control BuildCommandBar()
    {
        var flow = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            WrapContents = true,
            Name = "commandFlow"
        };

        flow.Controls.Add(CreateCommandButton("syncPermissionsButton", "同步权限", async () => await SyncPermissionsAsync()));
        flow.Controls.Add(CreateCommandButton("renderNowButton", "推送上下文并渲染", async () => await PushContextAndRenderAsync("host-manual", [])));
        flow.Controls.Add(CreateCommandButton("clearTargetButton", "清空目标输入", () =>
        {
            _targetInputTextBox.Clear();
            AppendLog("已清空目标输入框。");
            RefreshState();
        }));
        flow.Controls.Add(CreateCommandButton("snapshotNowButton", "写出当前快照", () =>
        {
            PersistSnapshotIfNeeded(force: true);
            AppendLog("已手工写出当前快照。");
        }));

        return flow;
    }

    private Control BuildStateGroup()
    {
        var group = new GroupBox
        {
            Dock = DockStyle.Fill,
            Text = "宿主状态",
            Name = "stateGroup"
        };

        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 4,
            Padding = new Padding(12),
            Name = "stateTable"
        };

        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        AddStateRow(table, 0, "session", _sessionTextBox);
        AddStateRow(table, 1, "last ui", _lastUiMessageTextBox);
        AddStateRow(table, 2, "last host", _lastHostMessageTextBox);
        AddStateRow(table, 3, "active tab", _activeTabTextBox);

        group.Controls.Add(table);
        return group;
    }

    private Control BuildWorkspacePanel()
    {
        var split = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Horizontal,
            SplitterDistance = 620,
            Name = "workspaceSplit"
        };

        split.Panel1.Padding = new Padding(12);
        split.Panel1.Controls.Add(_webView);
        split.Panel2.Controls.Add(BuildDiagnosticsPanel());
        return split;
    }

    private Control BuildDiagnosticsPanel()
    {
        var split = new SplitContainer
        {
            Dock = DockStyle.Fill,
            SplitterDistance = 520,
            Name = "diagnosticsSplit"
        };

        var snapshotGroup = new GroupBox
        {
            Dock = DockStyle.Fill,
            Text = "实时快照",
            Name = "snapshotGroup"
        };
        snapshotGroup.Controls.Add(_snapshotTextBox);

        var logGroup = new GroupBox
        {
            Dock = DockStyle.Fill,
            Text = "宿主日志",
            Name = "logGroup"
        };
        logGroup.Controls.Add(_logTextBox);

        split.Panel1.Padding = new Padding(12, 12, 6, 12);
        split.Panel2.Padding = new Padding(6, 12, 12, 12);
        split.Panel1.Controls.Add(snapshotGroup);
        split.Panel2.Controls.Add(logGroup);
        return split;
    }

    private Dictionary<string, CheckBox> CreatePermissionCheckBoxes()
    {
        return new Dictionary<string, CheckBox>
        {
            ["context.read"] = CreatePermissionCheckBox("contextReadCheckBox", "context.read", isChecked: true),
            ["input.insert"] = CreatePermissionCheckBox("inputInsertCheckBox", "input.insert", isChecked: true),
            ["input.replace"] = CreatePermissionCheckBox("inputReplaceCheckBox", "input.replace", isChecked: true),
            ["candidates.regenerate"] = CreatePermissionCheckBox("candidatesRegenerateCheckBox", "candidates.regenerate", isChecked: true),
            ["settings.open"] = CreatePermissionCheckBox("settingsOpenCheckBox", "settings.open", isChecked: true),
            ["storage.read"] = CreatePermissionCheckBox("storageReadCheckBox", "storage.read", isChecked: true),
            ["storage.write"] = CreatePermissionCheckBox("storageWriteCheckBox", "storage.write", isChecked: true),
            ["panel.state.write"] = CreatePermissionCheckBox("panelStateWriteCheckBox", "panel.state.write", isChecked: true)
        };
    }

    private void ApplyManifestRuntimePermissions()
    {
        var declaredPermissions = _manifest.RuntimePermissions.ToHashSet(StringComparer.Ordinal);
        foreach (var entry in _permissionCheckBoxes)
        {
            if (declaredPermissions.Contains(entry.Key))
            {
                entry.Value.Checked = true;
                entry.Value.Enabled = true;
                continue;
            }

            entry.Value.Checked = false;
            entry.Value.Enabled = false;
            entry.Value.Text = $"{entry.Key} (manifest-disabled)";
        }
    }

    private CheckBox CreatePermissionCheckBox(string name, string permission, bool isChecked)
    {
        var checkBox = new CheckBox
        {
            Name = name,
            Text = permission,
            Checked = isChecked,
            AutoSize = true
        };

        checkBox.CheckedChanged += async (_, _) =>
        {
            if (_webViewReady)
            {
                await SyncPermissionsAsync();
            }
        };

        return checkBox;
    }

    private void SeedDefaultContext()
    {
        _sourceMessageTextBox.Text = "对方刚刚说：这周先把第一版方案整理出来，晚上我再看。";
        _conversationSummaryTextBox.Text = "当前对话目标是把第一版方案收口，并明确今晚同步的时间边界。";
        _personaChipsTextBox.Text = "工作沟通, 简洁, 不强承诺, 可直接发送";
        _targetInputTextBox.Text = string.Empty;
    }

    private void HookStateRefresh()
    {
        _sourceMessageTextBox.TextChanged += (_, _) => RefreshState();
        _conversationSummaryTextBox.TextChanged += (_, _) => RefreshState();
        _personaChipsTextBox.TextChanged += (_, _) => RefreshState();
        _targetInputTextBox.TextChanged += (_, _) => RefreshState();
    }

    private static TextBox CreateEditableTextBox(string name, bool multiline)
    {
        return new TextBox
        {
            Name = name,
            Dock = DockStyle.Fill,
            Multiline = multiline,
            ScrollBars = multiline ? ScrollBars.Vertical : ScrollBars.None,
            Font = new Font("Segoe UI", 10.5F)
        };
    }

    private static TextBox CreateReadOnlyTextBox(string name, bool multiline)
    {
        return new TextBox
        {
            Name = name,
            Dock = DockStyle.Fill,
            Multiline = multiline,
            ReadOnly = true,
            ScrollBars = multiline ? ScrollBars.Both : ScrollBars.None,
            Font = new Font("Consolas", 10F),
            BackColor = SystemColors.Window
        };
    }

    private static Label CreateFieldLabel(string name, string text)
    {
        return new Label
        {
            Name = name,
            Text = text,
            Dock = DockStyle.Fill,
            AutoSize = true,
            TextAlign = ContentAlignment.MiddleLeft
        };
    }

    private Button CreateCommandButton(string name, string text, Action action)
    {
        var button = new Button
        {
            Name = name,
            Text = text,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(10, 6, 10, 6)
        };

        button.Click += (_, _) => action();
        return button;
    }

    private static void AddStateRow(TableLayoutPanel table, int row, string label, Control control)
    {
        table.Controls.Add(new Label
        {
            AutoSize = true,
            Text = label,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, row);

        table.Controls.Add(control, 1, row);
    }
    private async void OnShown(object? sender, EventArgs e)
    {
        try
        {
            await InitializeRuntimeAsync();
            AppendLog("Windows Function Kit Host 已启动。");
        }
        catch (Exception exception)
        {
            _lastStatusLabel = "初始化失败";
            _lastErrorCode = "host_init_failed";
            AppendLog($"初始化失败：{exception.Message}");
            PersistSnapshotIfNeeded(force: true);
            if (_options.SmokeMode)
            {
                BeginInvoke(Close);
            }
        }

        RefreshState();
    }

    private async Task InitializeRuntimeAsync()
    {
        if (!Directory.Exists(_options.TodoRootPath))
        {
            throw new DirectoryNotFoundException($"Missing TODO root: {_options.TodoRootPath}");
        }

        _host = new FunctionKitWebView2Host(_webView);
        _host.UiEnvelopeReceived += OnUiEnvelopeReceived;
        await _host.InitializeAsync(_options.TodoRootPath, _manifest.EntryRelativePath, enableDevTools: false);
        _webViewReady = true;
        _lastStatusLabel = "webview-ready";
        AppendLog($"WebView2 已就绪，功能件 {KitId} 已按 manifest 入口加载。");
        RefreshState();
    }

    private async void OnUiEnvelopeReceived(object? sender, JsonElement envelope)
    {
        var messageId = GetString(envelope, "messageId");
        var type = GetString(envelope, "type");
        _lastUiMessageType = type;
        _lastErrorCode = "none";
        AppendLog($"收到 UI 消息：{type} ({messageId})");
        RefreshState();

        try
        {
            switch (type)
            {
                case "bridge.ready":
                    await HandleBridgeReadyAsync(messageId);
                    break;
                case "context.request":
                    await HandleContextRequestAsync(envelope);
                    break;
                case "candidates.regenerate":
                    await HandleRegenerateAsync(envelope);
                    break;
                case "candidate.insert":
                    await HandleCandidateWriteAsync(envelope, replace: false);
                    break;
                case "candidate.replace":
                    await HandleCandidateWriteAsync(envelope, replace: true);
                    break;
                case "storage.get":
                    await HandleStorageGetAsync(envelope);
                    break;
                case "storage.set":
                    await HandleStorageSetAsync(envelope);
                    break;
                case "panel.state.update":
                    await HandlePanelStateUpdateAsync(envelope);
                    break;
                case "settings.open":
                    await HandleSettingsOpenAsync(envelope);
                    break;
                default:
                    await DispatchBridgeErrorAsync(
                        replyTo: messageId,
                        code: "unsupported_message_type",
                        message: $"Unsupported UI message type: {type}",
                        retryable: false,
                        details: new { type });
                    break;
            }
        }
        catch (Exception exception)
        {
            _lastErrorCode = "host_dispatch_failed";
            AppendLog($"处理 UI 消息失败：{exception.Message}");
            await DispatchBridgeErrorAsync(
                replyTo: messageId,
                code: "host_dispatch_failed",
                message: exception.Message,
                retryable: false,
                details: new { type });
        }

        RefreshState();
    }

    private async Task HandleBridgeReadyAsync(string replyTo)
    {
        EnsureHost();
        _sessionId = $"session-{DateTimeOffset.Now:yyyyMMddHHmmss}-{Guid.NewGuid().ToString("N")[..8]}";
        var grantedPermissions = GetGrantedPermissions();
        var hostInfo = BuildHostInfoSnapshot();

        await _host!.DispatchReadyAckAsync(replyTo, KitId, Surface, _sessionId, grantedPermissions, hostInfo);
        TrackHostMessage("bridge.ready.ack");
        await _host.DispatchPermissionsSyncAsync(KitId, Surface, grantedPermissions);
        TrackHostMessage("permissions.sync");
        _lastStatusLabel = "宿主握手完成";
        AppendLog($"已完成握手，session={_sessionId}，executionMode={_manifest.Ai.ExecutionMode}。");
    }

    private async Task HandleContextRequestAsync(JsonElement envelope)
    {
        EnsureHost();
        var replyTo = GetString(envelope, "messageId");
        if (!HasPermission("context.read"))
        {
            await DispatchPermissionDeniedAsync(replyTo, "context.read");
            return;
        }

        var modifiers = GetArrayStrings(envelope, "payload", "modifiers");
        var preferredTone = GetPreferredTone(envelope);
        await PushContextAndRenderAsync("ui-context-request", modifiers, preferredTone, replyTo);
    }

    private async Task HandleRegenerateAsync(JsonElement envelope)
    {
        EnsureHost();
        var replyTo = GetString(envelope, "messageId");
        if (!HasPermission("candidates.regenerate"))
        {
            await DispatchPermissionDeniedAsync(replyTo, "candidates.regenerate");
            return;
        }

        var modifiers = GetArrayStrings(envelope, "payload", "modifiers");
        var preferredTone = GetPreferredTone(envelope);
        await PushContextAndRenderAsync("ui-regenerate", modifiers, preferredTone, replyTo);
    }

    private async Task HandleCandidateWriteAsync(JsonElement envelope, bool replace)
    {
        EnsureHost();
        var replyTo = GetString(envelope, "messageId");
        var permission = replace ? "input.replace" : "input.insert";
        if (!HasPermission(permission))
        {
            await DispatchPermissionDeniedAsync(replyTo, permission);
            return;
        }

        var payload = envelope.GetProperty("payload");
        var text = payload.TryGetProperty("text", out var textElement) ? textElement.GetString() ?? string.Empty : string.Empty;
        var candidateId = payload.TryGetProperty("candidateId", out var candidateIdElement)
            ? candidateIdElement.GetString() ?? "unknown"
            : "unknown";

        if (replace || string.IsNullOrWhiteSpace(_targetInputTextBox.Text))
        {
            _targetInputTextBox.Text = text;
        }
        else
        {
            var prefix = _targetInputTextBox.Text.EndsWith(' ') || text.StartsWith(' ') ? string.Empty : " ";
            _targetInputTextBox.Text += prefix + text;
        }

        _lastStatusLabel = replace ? "候选已替换写回" : "候选已插入写回";
        AppendLog($"{_lastStatusLabel}：{candidateId}");
        await _host!.DispatchHostStateUpdateAsync(
            KitId,
            Surface,
            _lastStatusLabel,
            new
            {
                candidateId,
                textLength = text.Length,
                manifest = BuildManifestSnapshot(),
                slash = BuildSlashSnapshot()
            });
        TrackHostMessage("host.state.update");
    }

    private async Task HandleStorageGetAsync(JsonElement envelope)
    {
        EnsureHost();
        var replyTo = GetString(envelope, "messageId");
        if (!HasPermission("storage.read"))
        {
            await DispatchPermissionDeniedAsync(replyTo, "storage.read");
            return;
        }

        var keys = GetArrayStrings(envelope, "payload", "keys");
        var values = _storage.GetValues(keys);
        await _host!.DispatchStorageSyncAsync(replyTo, KitId, Surface, new { values });
        TrackHostMessage("storage.sync");
        _lastStatusLabel = $"storage.get({keys.Count})";
        AppendLog($"已返回存储键：{string.Join(", ", keys)}");
    }

    private async Task HandleStorageSetAsync(JsonElement envelope)
    {
        EnsureHost();
        var replyTo = GetString(envelope, "messageId");
        if (!HasPermission("storage.write"))
        {
            await DispatchPermissionDeniedAsync(replyTo, "storage.write");
            return;
        }

        if (!TryGetNestedElement(envelope, out var valuesElement, "payload", "values"))
        {
            throw new InvalidOperationException("storage.set payload.values is missing.");
        }

        var values = _storage.SetValues(valuesElement);
        if (values["lastActiveTab"] is JsonValue tabValue)
        {
            _activeTab = tabValue.ToString();
        }

        await _host!.DispatchStorageSyncAsync(replyTo, KitId, Surface, new { values });
        TrackHostMessage("storage.sync");
        _lastStatusLabel = "storage.set";
        AppendLog("已写入功能件存储。");
    }
    private async Task HandlePanelStateUpdateAsync(JsonElement envelope)
    {
        EnsureHost();
        var replyTo = GetString(envelope, "messageId");
        if (!HasPermission("panel.state.write"))
        {
            await DispatchPermissionDeniedAsync(replyTo, "panel.state.write");
            return;
        }

        if (!TryGetNestedElement(envelope, out var patchElement, "payload", "patch"))
        {
            throw new InvalidOperationException("panel.state.update payload.patch is missing.");
        }

        if (patchElement.ValueKind == JsonValueKind.Object &&
            patchElement.TryGetProperty("activeTab", out var activeTabElement))
        {
            _activeTab = activeTabElement.GetString() ?? _activeTab;
        }

        var patch = JsonSerializer.Deserialize<object>(patchElement.GetRawText()) ?? new { };
        await _host!.DispatchPanelStateAckAsync(replyTo, KitId, Surface, new { patch });
        TrackHostMessage("panel.state.ack");
        _lastStatusLabel = $"panel.state.update -> {_activeTab}";
        AppendLog($"已同步面板状态：activeTab={_activeTab}");
    }

    private async Task HandleSettingsOpenAsync(JsonElement envelope)
    {
        EnsureHost();
        var replyTo = GetString(envelope, "messageId");
        if (!HasPermission("settings.open"))
        {
            await DispatchPermissionDeniedAsync(replyTo, "settings.open");
            return;
        }

        _lastStatusLabel = "收到宿主设置请求";
        AppendLog("UI 请求打开宿主设置。当前 PoC 仅记录状态，不打开原生窗口。");
        await _host!.DispatchHostStateUpdateAsync(
            KitId,
            Surface,
            _lastStatusLabel,
            new
            {
                storagePath = _options.StoragePath,
                sessionId = _sessionId,
                manifest = BuildManifestSnapshot()
            });
        TrackHostMessage("host.state.update");
    }

    private async Task PushContextAndRenderAsync(string reason, IReadOnlyList<string> modifiers)
    {
        await PushContextAndRenderAsync(reason, modifiers, GetStoredPreferredTone(), replyTo: null);
    }

    private async Task PushContextAndRenderAsync(string reason, IReadOnlyList<string> modifiers, string preferredTone, string? replyTo)
    {
        EnsureHost();
        var personaChips = GetPersonaChips();
        var sourceMessage = _sourceMessageTextBox.Text.Trim();
        var conversationSummary = _conversationSummaryTextBox.Text.Trim();
        var manifestSnapshot = BuildManifestSnapshot();
        var slashSnapshot = BuildSlashSnapshot();
        var routingSnapshot = BuildRoutingSnapshot(reason);
        var contextPayload = _previewEngine.BuildContextPayload(
            sourceMessage,
            conversationSummary,
            personaChips,
            preferredTone,
            modifiers,
            manifest: manifestSnapshot,
            routing: new
            {
                ai = routingSnapshot,
                slash = slashSnapshot
            });

        await _host!.DispatchContextSyncAsync(replyTo, KitId, Surface, contextPayload);
        TrackHostMessage("context.sync");

        object renderPayload;
        if (_options.PreviewOnly)
        {
            renderPayload = _previewEngine.BuildRenderPayload(
                sourceMessage,
                conversationSummary,
                personaChips,
                preferredTone,
                modifiers,
                manifest: manifestSnapshot,
                routing: new
                {
                    ai = routingSnapshot,
                    slash = slashSnapshot
                });
            _candidateCount = 3;
            _lastStatusLabel = $"已用本地预览模式渲染 ({reason})";
            AppendLog(_lastStatusLabel);
        }
        else
        {
            try
            {
                var remotePayload = await _remoteClient.RenderAsync(new
                {
                    reason,
                    preferredTone,
                    modifiers,
                    context = new
                    {
                        sourceMessage,
                        conversationSummary,
                        personaChips
                    },
                    manifest = manifestSnapshot,
                    routing = new
                    {
                        ai = routingSnapshot,
                        slash = slashSnapshot
                    },
                    constraints = new
                    {
                        candidateCount = 3,
                        maxCharsPerCandidate = 120
                    }
                }, _manifest.RemoteRenderPath);

                renderPayload = remotePayload;
                _candidateCount = CountCandidates(remotePayload);
                _lastStatusLabel = $"已通过远程宿主渲染 ({reason})";
                AppendLog($"{_lastStatusLabel} endpoint={_remoteClient.BaseUrl}");
                await _host.DispatchHostStateUpdateAsync(
                    KitId,
                    Surface,
                    "远程候选已更新",
                    new
                    {
                        endpoint = _remoteClient.BaseUrl,
                        candidateCount = _candidateCount,
                        mode = routingSnapshot.EffectiveExecutionMode,
                        requestedMode = _manifest.Ai.ExecutionMode,
                        manifest = manifestSnapshot,
                        slash = slashSnapshot
                    });
                TrackHostMessage("host.state.update");
            }
            catch (FunctionKitRemoteClientException exception)
            {
                _candidateCount = 0;
                _lastStatusLabel = "远程宿主调用失败";
                _lastErrorCode = exception.Code;
                AppendLog($"{_lastStatusLabel}：{exception.Message}");
                await DispatchBridgeErrorAsync(
                    replyTo: replyTo,
                    code: exception.Code,
                    message: exception.Message,
                    retryable: exception.Retryable,
                    details: new
                    {
                        endpoint = _remoteClient.BaseUrl,
                        statusCode = exception.StatusCode,
                        details = exception.DetailsJson
                    });
                await _host.DispatchHostStateUpdateAsync(
                    KitId,
                    Surface,
                    _lastStatusLabel,
                    new
                    {
                        endpoint = _remoteClient.BaseUrl,
                        code = exception.Code,
                        statusCode = exception.StatusCode,
                        requestedMode = _manifest.Ai.ExecutionMode,
                        manifest = manifestSnapshot
                    });
                TrackHostMessage("host.state.update");
                RefreshState();
                return;
            }
        }

        await _host.DispatchCandidatesRenderAsync(replyTo, KitId, Surface, renderPayload);
        TrackHostMessage("candidates.render");

        _renderCount += 1;
        await MaybeCompleteSmokeAsync();
    }

    private async Task SyncPermissionsAsync()
    {
        if (!_webViewReady || _host is null)
        {
            return;
        }

        await _host.DispatchPermissionsSyncAsync(KitId, Surface, GetGrantedPermissions());
        TrackHostMessage("permissions.sync");
        _lastStatusLabel = "权限已同步";
        AppendLog("已向 UI 推送最新权限集。");
        RefreshState();
    }

    private async Task DispatchPermissionDeniedAsync(string? replyTo, string permission)
    {
        EnsureHost();
        await _host!.DispatchPermissionDeniedAsync(replyTo, KitId, Surface, permission);
        TrackHostMessage("permission.denied");
        _lastErrorCode = "permission_denied";
        AppendLog($"权限拒绝：{permission}");
    }

    private async Task DispatchBridgeErrorAsync(string? replyTo, string code, string message, bool retryable, object details)
    {
        if (_host is null)
        {
            return;
        }

        await _host.DispatchBridgeErrorAsync(replyTo, KitId, Surface, code, message, retryable, details);
        TrackHostMessage("bridge.error");
        _lastErrorCode = code;
    }

    private void TrackHostMessage(string type)
    {
        _lastHostMessageType = type;
    }

    private List<string> GetGrantedPermissions()
    {
        return _permissionCheckBoxes
            .Where(entry => entry.Value.Checked)
            .Where(entry => _manifest.RuntimePermissions.Contains(entry.Key, StringComparer.Ordinal))
            .Select(entry => entry.Key)
            .ToList();
    }

    private bool HasPermission(string permission)
    {
        return _permissionCheckBoxes.TryGetValue(permission, out var checkBox) && checkBox.Checked;
    }

    private List<string> GetPersonaChips()
    {
        return _personaChipsTextBox.Text
            .Split([',', '，', ';', '；', '\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private string GetStoredPreferredTone()
    {
        var snapshot = _storage.Snapshot();
        return snapshot["preferredTone"] is JsonValue value ? value.ToString() : "balanced";
    }

    private object BuildManifestSnapshot()
    {
        return new
        {
            kitId = KitId,
            entry = _manifest.EntryRelativePath,
            runtimePermissions = _manifest.RuntimePermissions,
            discovery = new
            {
                launchMode = _manifest.Discovery.LaunchMode,
                commands = _manifest.Discovery.Commands,
                aliases = _manifest.Discovery.Aliases,
                tags = _manifest.Discovery.Tags
            },
            ai = new
            {
                executionMode = _manifest.Ai.ExecutionMode,
                backendHints = new
                {
                    preferredBackendClass = _manifest.Ai.BackendHints.PreferredBackendClass,
                    preferredAdapter = _manifest.Ai.BackendHints.PreferredAdapter,
                    latencyTier = _manifest.Ai.BackendHints.LatencyTier,
                    latencyBudgetMs = _manifest.Ai.BackendHints.LatencyBudgetMs,
                    requireStructuredJson = _manifest.Ai.BackendHints.RequireStructuredJson,
                    requiredCapabilities = _manifest.Ai.BackendHints.RequiredCapabilities,
                    notes = _manifest.Ai.BackendHints.Notes
                }
            }
        };
    }

    private RoutingSnapshot BuildRoutingSnapshot(string reason)
    {
        var effectiveExecutionMode = _options.PreviewOnly ? "local-demo" : _manifest.Ai.ExecutionMode;
        return new RoutingSnapshot(
            RequestedExecutionMode: _manifest.Ai.ExecutionMode,
            EffectiveExecutionMode: effectiveExecutionMode,
            PreferredBackendClass: _manifest.Ai.BackendHints.PreferredBackendClass,
            PreferredAdapter: _manifest.Ai.BackendHints.PreferredAdapter,
            LatencyTier: _manifest.Ai.BackendHints.LatencyTier,
            LatencyBudgetMs: _manifest.Ai.BackendHints.LatencyBudgetMs,
            RequireStructuredJson: _manifest.Ai.BackendHints.RequireStructuredJson,
            RequiredCapabilities: _manifest.Ai.BackendHints.RequiredCapabilities,
            Notes: _manifest.Ai.BackendHints.Notes,
            RenderPath: _manifest.RemoteRenderPath,
            Reason: reason);
    }

    private object BuildHostInfoSnapshot()
    {
        return new
        {
            platform = "windows",
            runtime = "webview2",
            executionMode = _options.PreviewOnly ? "local-demo" : _manifest.Ai.ExecutionMode,
            requestedExecutionMode = _manifest.Ai.ExecutionMode,
            preferredBackendClass = _manifest.Ai.BackendHints.PreferredBackendClass,
            preferredAdapter = _manifest.Ai.BackendHints.PreferredAdapter,
            latencyTier = _manifest.Ai.BackendHints.LatencyTier,
            latencyBudgetMs = _manifest.Ai.BackendHints.LatencyBudgetMs,
            modeMessage = _options.PreviewOnly
                ? "Windows host is using local preview candidates."
                : $"Windows host routes remote inference via {_manifest.RemoteRenderPath}.",
            discovery = new
            {
                launchMode = _manifest.Discovery.LaunchMode,
                slashEnabled =
                    _manifest.Discovery.Commands.Count > 0 ||
                    _manifest.Discovery.Aliases.Count > 0 ||
                    _manifest.Discovery.Tags.Count > 0 ||
                    _manifest.Discovery.RegexMatchers.Count > 0,
                slashCommands = _manifest.Discovery.Commands,
                slashAliases = _manifest.Discovery.Aliases
            }
        };
    }

    private object? BuildSlashSnapshot()
    {
        return _manifest.ResolveSlashQuery(_targetInputTextBox.Text.Trim());
    }

    private FunctionKitHostSnapshot CaptureSnapshot()
    {
        var snapshot = _storage.Snapshot();
        var routingSnapshot = BuildRoutingSnapshot("snapshot");
        return new FunctionKitHostSnapshot(
            CapturedAt: DateTimeOffset.Now.ToString("O"),
            WebViewReady: _webViewReady,
            SessionId: _sessionId,
            LastUiMessageType: _lastUiMessageType,
            LastHostMessageType: _lastHostMessageType,
            ActiveTab: _activeTab,
            RenderCount: _renderCount,
            CandidateCount: _candidateCount,
            TargetInputText: _targetInputTextBox.Text,
            SourceMessage: _sourceMessageTextBox.Text,
            ConversationSummary: _conversationSummaryTextBox.Text,
            PersonaChips: GetPersonaChips().ToArray(),
            GrantedPermissions: GetGrantedPermissions().ToArray(),
            StorageValues: snapshot,
            ManifestExecutionMode: _manifest.Ai.ExecutionMode,
            ResolvedExecutionMode: routingSnapshot.EffectiveExecutionMode,
            PreferredBackendClass: _manifest.Ai.BackendHints.PreferredBackendClass,
            PreferredAdapter: _manifest.Ai.BackendHints.PreferredAdapter,
            DiscoveryLaunchMode: _manifest.Discovery.LaunchMode,
            SlashCommands: _manifest.Discovery.Commands.ToArray(),
            LastStatusLabel: _lastStatusLabel,
            LastErrorCode: _lastErrorCode);
    }

    private void RefreshState()
    {
        var snapshot = CaptureSnapshot();
        _sessionTextBox.Text = snapshot.SessionId;
        _lastUiMessageTextBox.Text = snapshot.LastUiMessageType;
        _lastHostMessageTextBox.Text = snapshot.LastHostMessageType;
        _activeTabTextBox.Text = snapshot.ActiveTab;

        var json = JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true });
        _snapshotTextBox.Text = json;
        PersistSnapshotIfNeeded(force: false, snapshotJson: json);
    }
    private void PersistSnapshotIfNeeded(bool force, string? snapshotJson = null)
    {
        if (string.IsNullOrWhiteSpace(_options.SnapshotPath))
        {
            return;
        }

        var resolvedPath = Path.GetFullPath(Path.Combine(_options.WorkspaceRoot, _options.SnapshotPath));
        var directory = Path.GetDirectoryName(resolvedPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var json = snapshotJson ?? JsonSerializer.Serialize(CaptureSnapshot(), new JsonSerializerOptions { WriteIndented = true });
        if (!force && string.Equals(json, _lastPersistedSnapshotJson, StringComparison.Ordinal))
        {
            return;
        }

        File.WriteAllText(resolvedPath, json, new UTF8Encoding(false));
        _lastPersistedSnapshotJson = json;
    }

    private async Task MaybeCompleteSmokeAsync()
    {
        if (!_options.SmokeMode || _smokeComplete)
        {
            return;
        }

        _smokeComplete = true;
        PersistSnapshotIfNeeded(force: true);
        AppendLog("Smoke 模式已完成首轮握手与渲染，准备退出。");
        await Task.Delay(500);
        BeginInvoke(Close);
    }

    private void AppendLog(string message)
    {
        var line = $"{DateTimeOffset.Now:HH:mm:ss.fff} {message}";
        if (_logTextBox.TextLength == 0)
        {
            _logTextBox.Text = line;
        }
        else
        {
            _logTextBox.AppendText(Environment.NewLine + line);
        }
    }

    private void EnsureHost()
    {
        if (_host is null)
        {
            throw new InvalidOperationException("WebView2 host is not initialized.");
        }
    }

    private static string GetString(JsonElement envelope, string propertyName)
    {
        return envelope.TryGetProperty(propertyName, out var element) ? element.GetString() ?? string.Empty : string.Empty;
    }

    private static bool TryGetNestedElement(JsonElement root, out JsonElement result, params string[] path)
    {
        result = root;
        foreach (var segment in path)
        {
            if (result.ValueKind != JsonValueKind.Object || !result.TryGetProperty(segment, out result))
            {
                return false;
            }
        }

        return true;
    }

    private static List<string> GetArrayStrings(JsonElement envelope, params string[] path)
    {
        if (!TryGetNestedElement(envelope, out var element, path))
        {
            return [];
        }

        if (element.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return element.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString() ?? string.Empty)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .ToList();
    }

    private string GetPreferredTone(JsonElement envelope)
    {
        if (TryGetNestedElement(envelope, out var element, "payload", "preferredTone") &&
            element.ValueKind == JsonValueKind.String)
        {
            return element.GetString() ?? "balanced";
        }

        return GetStoredPreferredTone();
    }

    private static int CountCandidates(JsonObject payload)
    {
        if (payload["result"] is JsonObject result &&
            result["candidates"] is JsonArray candidates)
        {
            return candidates.Count;
        }

        return 0;
    }
}
