using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace WindowsImeTestHost;

internal sealed partial class MainForm
{
    private async Task InitializeFunctionKitIfNeededAsync(bool forceReload = false)
    {
        if (_options.DisableFunctionKit)
        {
            _functionKitLastError = "disabled-by-option";
            RefreshState();
            return;
        }

        var entryAbsolutePath = ResolveFunctionKitLocalPath(_functionKitRootPath, _functionKitEntryRelativePath.Replace("/", "\\"));
        if (!IsPathUnderRoot(entryAbsolutePath, _functionKitRootPath))
        {
            _functionKitLastError = $"entry-outside-root: {entryAbsolutePath}";
            AppendLog($"功能件入口越界：{entryAbsolutePath}");
            RefreshState();
            return;
        }

        if (!File.Exists(entryAbsolutePath))
        {
            _functionKitLastError = $"missing-entry: {entryAbsolutePath}";
            AppendLog($"功能件入口不存在：{entryAbsolutePath}");
            RefreshState();
            return;
        }

        try
        {
            _functionKitStorage ??= new FunctionKitStorageStore(_functionKitStoragePath);
            _functionKitHost ??= new FunctionKitPanelHost(_functionKitWebView);
            _functionKitHost.UiEnvelopeReceived -= OnFunctionKitUiEnvelopeReceived;
            _functionKitHost.UiEnvelopeReceived += OnFunctionKitUiEnvelopeReceived;

            _functionKitReady = false;
            _functionKitSessionId = "pending";
            _functionKitLastError = "none";
            _functionKitLastMessageType = forceReload ? "reload" : _functionKitLastMessageType;
            _grantedRuntimePermissions = Array.Empty<string>();

            await _functionKitHost.InitializeAsync(_functionKitRootPath, _functionKitEntryRelativePath);
            if (!string.Equals(_functionKitHost.LastNavigationStatus, "success", StringComparison.Ordinal))
            {
                _functionKitLastError = $"navigation:{_functionKitHost.LastNavigationStatus}";
            }
            await ProbeFunctionKitAsync();
            AppendLog($"功能件运行时已加载：{_functionKitEntryRelativePath}");
        }
        catch (Exception ex)
        {
            _functionKitLastError = ex.Message;
            AppendLog($"功能件运行时初始化失败：{ex.Message}");
        }

        RefreshState();
    }

    private async Task ClearFunctionKitStorageAsync()
    {
        _functionKitStorage ??= new FunctionKitStorageStore(_functionKitStoragePath);
        _functionKitStorage.Clear();
        AppendLog($"功能件存储已清空：{_functionKitStorage.StoragePath}");

        if (_functionKitReady)
        {
            await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateStorageSync(
                _functionKitKitId,
                new { values = new { } },
                replyTo: null));
            await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateHostStateUpdate(
                _functionKitKitId,
                "功能件存储已清空",
                new { storageFile = _functionKitStorage.StoragePath }));
        }

        RefreshState();
    }

    private async Task RunFunctionKitSmokeCommitAsync()
    {
        if (_functionKitHost is null)
        {
            return;
        }

        var waitStartedAt = DateTime.UtcNow;
        while (DateTime.UtcNow - waitStartedAt < TimeSpan.FromSeconds(3))
        {
            var raw = await _functionKitHost.EvaluateScriptAsync(
                "document.querySelectorAll('[data-action=\"insert\"]').length");
            if (int.TryParse(raw, out var count) && count > 0)
            {
                break;
            }

            await Task.Delay(100);
        }

        var before = GetTextForTarget(_lastCommitTarget);
        await _functionKitHost.EvaluateScriptAsync(
            "(function(){ const button = document.querySelector('[data-action=\"insert\"]'); if (button) { button.click(); return true; } return false; })();");

        var commitStartedAt = DateTime.UtcNow;
        while (DateTime.UtcNow - commitStartedAt < TimeSpan.FromSeconds(3))
        {
            if (!string.Equals(before, GetTextForTarget(_lastCommitTarget), StringComparison.Ordinal))
            {
                AppendLog("Smoke 已完成功能件候选插入验证。");
                return;
            }

            await Task.Delay(100);
        }

        AppendLog("Smoke 未在时限内观察到功能件候选插入结果。");
    }

    private async Task ProbeFunctionKitAsync()
    {
        if (_functionKitHost is null)
        {
            return;
        }

        try
        {
            var raw = await _functionKitHost.EvaluateScriptAsync("""
JSON.stringify({
  href: globalThis.location?.href ?? null,
  readyState: document.readyState,
  hasSdk: typeof globalThis.FunctionKitRuntimeSDK !== "undefined",
  hasChromeBridge: typeof globalThis.chrome?.webview !== "undefined",
  runtimeScript: document.querySelector('script[src*="function-kit-runtime"]')?.src ?? null,
  allScripts: Array.from(document.scripts).map(script => script.src),
  statusText: document.getElementById("statusText")?.textContent ?? null,
  sessionMeta: document.getElementById("sessionMeta")?.textContent ?? null
})
""");
            var decoded = JsonSerializer.Deserialize<string>(raw) ?? raw;
            AppendLog($"FunctionKit probe：{decoded}");
            if (decoded.Contains("\"hasSdk\":false", StringComparison.Ordinal))
            {
                _functionKitLastError = $"sdk_not_loaded:{decoded}";
            }
        }
        catch (Exception ex)
        {
            _functionKitLastError = $"probe_failed:{ex.Message}";
            AppendLog($"FunctionKit probe 失败：{ex.Message}");
        }
    }

    private void OnFunctionKitUiEnvelopeReceived(object? sender, JsonElement envelope)
    {
        if (InvokeRequired)
        {
            BeginInvoke(() => OnFunctionKitUiEnvelopeReceived(sender, envelope.Clone()));
            return;
        }

        _functionKitLastMessageType = GetStringProperty(envelope, "type") ?? "unknown";
        AppendLog($"FunctionKit UI -> Host：{_functionKitLastMessageType}");
        _ = HandleFunctionKitUiEnvelopeAsync(envelope.Clone());
    }

    private async Task HandleFunctionKitUiEnvelopeAsync(JsonElement envelope)
    {
        var messageType = GetStringProperty(envelope, "type") ?? "unknown";
        var replyTo = GetStringProperty(envelope, "messageId");

        try
        {
            if (!TryValidateFunctionKitUiEnvelope(envelope, out var validationCode, out var validationMessage))
            {
                _functionKitLastError = validationCode;
                AppendLog($"FunctionKit 无效消息：{validationCode} / {validationMessage}");
                if (!string.IsNullOrWhiteSpace(replyTo))
                {
                    await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateBridgeError(
                        _functionKitKitId,
                        validationCode,
                        validationMessage,
                        false,
                        details: new { messageType },
                        replyTo));
                }
                return;
            }

            if (messageType != "bridge.ready" && !_functionKitReady)
            {
                await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateBridgeError(
                    _functionKitKitId,
                    "runtime_not_ready",
                    "Function kit runtime is not ready yet.",
                    true,
                    details: new { messageType },
                    replyTo));
                return;
            }

            switch (messageType)
            {
                case "bridge.ready":
                    await HandleBridgeReadyAsync(envelope, replyTo);
                    break;
                case "context.request":
                    if (await EnsurePermissionAsync(envelope, "context.read"))
                    {
                        await DispatchContextSnapshotAsync(replyTo, renderCandidates: true);
                    }
                    break;
                case "candidates.regenerate":
                    if (await EnsurePermissionAsync(envelope, "candidates.regenerate"))
                    {
                        _functionKitRenderGeneration += 1;
                        await DispatchCandidatesRenderAsync(replyTo, reason: "user-regenerate");
                    }
                    break;
                case "candidate.insert":
                    if (await EnsurePermissionAsync(envelope, "input.insert"))
                    {
                        await HandleCandidateCommitAsync(envelope, replace: false);
                    }
                    break;
                case "candidate.replace":
                    if (await EnsurePermissionAsync(envelope, "input.replace"))
                    {
                        await HandleCandidateCommitAsync(envelope, replace: true);
                    }
                    break;
                case "settings.open":
                    if (await EnsurePermissionAsync(envelope, "settings.open"))
                    {
                        await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateHostStateUpdate(
                            _functionKitKitId,
                            "当前 PoC 暂未实现原生设置页",
                            new { messageType }));
                    }
                    break;
                case "storage.get":
                    if (await EnsurePermissionAsync(envelope, "storage.read"))
                    {
                        await HandleStorageGetAsync(envelope, replyTo);
                    }
                    break;
                case "storage.set":
                    if (await EnsurePermissionAsync(envelope, "storage.write"))
                    {
                        await HandleStorageSetAsync(envelope, replyTo);
                    }
                    break;
                case "panel.state.update":
                    if (await EnsurePermissionAsync(envelope, "panel.state.write"))
                    {
                        await HandlePanelStateUpdateAsync(envelope, replyTo);
                    }
                    break;
                default:
                    await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateBridgeError(
                        _functionKitKitId,
                        "unsupported_message",
                        $"Unsupported message type: {messageType}",
                        false,
                        details: new { messageType },
                        replyTo));
                    break;
            }
        }
        catch (Exception ex)
        {
            _functionKitLastError = ex.Message;
            AppendLog($"FunctionKit 处理失败：{ex.Message}");
            await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateBridgeError(
                _functionKitKitId,
                "host_exception",
                ex.Message,
                true,
                details: new { messageType },
                replyTo));
        }
        finally
        {
            RefreshState();
        }
    }

    private async Task<FunctionKitUiContractResult> RunFunctionKitContractTestAsync()
    {
        if (_functionKitHost is null)
        {
            return CreateFunctionKitContractFailure("host_not_initialized");
        }

        var renderFixturePath = TryGetFunctionKitFixturePath("bridge.host-to-ui.render.basic.json");
        var expectedSnapshotPath = TryGetFunctionKitFixturePath("runtime.snapshot.panel.basic.json");
        if (string.IsNullOrWhiteSpace(renderFixturePath) || string.IsNullOrWhiteSpace(expectedSnapshotPath))
        {
            return CreateFunctionKitContractFailure("missing_contract_fixtures");
        }

        FunctionKitUiSnapshot? expectedRender;
        try
        {
            expectedRender = LoadFunctionKitUiSnapshot(expectedSnapshotPath);
        }
        catch (Exception ex)
        {
            return CreateFunctionKitContractFailure($"invalid_expected_snapshot:{ex.Message}");
        }

        var permissionsFixturePath = TryGetFunctionKitFixturePath("bridge.host-to-ui.permissions.basic.json");
        var storageFixturePath = TryGetFunctionKitFixturePath("bridge.host-to-ui.storage-sync.basic.json");
        var permissionDeniedFixturePath = TryGetFunctionKitFixturePath("bridge.host-to-ui.permission-denied.basic.json");
        var errorFixturePath = TryGetFunctionKitFixturePath("bridge.host-to-ui.error.basic.json");

        if (!string.IsNullOrWhiteSpace(permissionsFixturePath))
        {
            await DispatchFunctionKitFixtureAsync(permissionsFixturePath);
            await Task.Delay(150);
        }

        if (!string.IsNullOrWhiteSpace(storageFixturePath))
        {
            await DispatchFunctionKitFixtureAsync(storageFixturePath);
            await Task.Delay(150);
        }

        await DispatchFunctionKitFixtureAsync(renderFixturePath);
        var afterRender = await WaitForFunctionKitUiSnapshotAsync(
            snapshot => snapshot.CandidateCount == expectedRender.CandidateCount &&
                        string.Equals(snapshot.SourceMessage, expectedRender.SourceMessage, StringComparison.Ordinal),
            TimeSpan.FromSeconds(3));

        var renderSnapshotMatched = afterRender is not null &&
                                    TryMatchFunctionKitUiSnapshots(afterRender, expectedRender, out _);

        var candidateInsertObserved = false;
        var commitTargetAfterInsert = GetTextForTarget(_lastCommitTarget);
        if (afterRender?.FirstCandidate is not null && IsCommitEligibleTarget(_lastCommitTarget))
        {
            await _functionKitHost.EvaluateScriptAsync(
                "(function(){ const button = document.querySelector('#candidateList .candidate-card [data-action=\"insert\"]:not([disabled])'); if (button) { button.click(); return true; } return false; })();");

            candidateInsertObserved = await WaitForConditionAsync(
                () => string.Equals(_functionKitLastMessageType, "candidate.insert", StringComparison.Ordinal) &&
                      GetTextForTarget(_lastCommitTarget).Contains(afterRender.FirstCandidate.Text, StringComparison.Ordinal),
                TimeSpan.FromSeconds(3));
            commitTargetAfterInsert = GetTextForTarget(_lastCommitTarget);
        }

        FunctionKitUiSnapshot? afterPermissionDenied = null;
        var permissionDeniedHandled = true;
        if (!string.IsNullOrWhiteSpace(permissionDeniedFixturePath))
        {
            var expectedPermissionDeniedMessage = LoadFixtureErrorMessage(permissionDeniedFixturePath);
            await DispatchFunctionKitFixtureAsync(permissionDeniedFixturePath);
            afterPermissionDenied = await WaitForFunctionKitUiSnapshotAsync(
                snapshot => string.Equals(snapshot.Status.Text, expectedPermissionDeniedMessage, StringComparison.Ordinal),
                TimeSpan.FromSeconds(3));
            permissionDeniedHandled = afterPermissionDenied is not null &&
                                      string.Equals(afterPermissionDenied.Status.State, "error", StringComparison.Ordinal) &&
                                      string.Equals(afterPermissionDenied.Status.Text, expectedPermissionDeniedMessage, StringComparison.Ordinal);
        }

        FunctionKitUiSnapshot? afterBridgeError = null;
        var bridgeErrorHandled = true;
        if (!string.IsNullOrWhiteSpace(errorFixturePath))
        {
            var expectedBridgeErrorMessage = LoadFixtureErrorMessage(errorFixturePath);
            await DispatchFunctionKitFixtureAsync(errorFixturePath);
            afterBridgeError = await WaitForFunctionKitUiSnapshotAsync(
                snapshot => string.Equals(snapshot.Status.Text, expectedBridgeErrorMessage, StringComparison.Ordinal),
                TimeSpan.FromSeconds(3));
            bridgeErrorHandled = afterBridgeError is not null &&
                                 string.Equals(afterBridgeError.Status.State, "error", StringComparison.Ordinal) &&
                                 string.Equals(afterBridgeError.Status.Text, expectedBridgeErrorMessage, StringComparison.Ordinal);
        }

        var failureReason = !renderSnapshotMatched
            ? "render_snapshot_mismatch"
            : !candidateInsertObserved
                ? "candidate_insert_not_observed"
                : !permissionDeniedHandled
                    ? "permission_denied_not_rendered"
                    : !bridgeErrorHandled
                        ? "bridge_error_not_rendered"
                        : null;

        return new FunctionKitUiContractResult(
            DateTimeOffset.Now.ToString("O"),
            _functionKitKitId,
            renderFixturePath,
            expectedSnapshotPath,
            renderSnapshotMatched,
            candidateInsertObserved,
            permissionDeniedHandled,
            bridgeErrorHandled,
            failureReason,
            afterRender,
            expectedRender,
            afterPermissionDenied,
            afterBridgeError,
            commitTargetAfterInsert);
    }

    private FunctionKitUiContractResult CreateFunctionKitContractFailure(string failureReason)
    {
        return new FunctionKitUiContractResult(
            DateTimeOffset.Now.ToString("O"),
            _functionKitKitId,
            null,
            null,
            false,
            false,
            false,
            false,
            failureReason,
            null,
            null,
            null,
            null,
            GetTextForTarget(_lastCommitTarget));
    }

    private async Task PersistFunctionKitContractResultAsync(FunctionKitUiContractResult result)
    {
        if (string.IsNullOrWhiteSpace(_options.FunctionKitContractResultPath))
        {
            return;
        }

        var outputPath = Path.GetFullPath(_options.FunctionKitContractResultPath);
        var directory = Path.GetDirectoryName(outputPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var json = JsonSerializer.Serialize(result, _snapshotJsonOptions);
        await File.WriteAllTextAsync(outputPath, json, new UTF8Encoding(false));
        AppendLog($"FunctionKit contract 结果已写入：{outputPath}");
    }

    private async Task DispatchFunctionKitFixtureAsync(string fixturePath)
    {
        if (_functionKitHost is null)
        {
            return;
        }

        var json = await File.ReadAllTextAsync(fixturePath, Encoding.UTF8);
        await _functionKitHost.DispatchEnvelopeJsonAsync(json);
        AppendLog($"FunctionKit fixture -> UI：{Path.GetFileName(fixturePath)}");
    }

    private async Task<FunctionKitUiSnapshot?> WaitForFunctionKitUiSnapshotAsync(
        Func<FunctionKitUiSnapshot, bool> predicate,
        TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        FunctionKitUiSnapshot? lastSnapshot = null;
        while (DateTime.UtcNow < deadline)
        {
            lastSnapshot = await CaptureFunctionKitUiSnapshotAsync();
            if (lastSnapshot is not null && predicate(lastSnapshot))
            {
                return lastSnapshot;
            }

            await Task.Delay(120);
        }

        return lastSnapshot;
    }

    private async Task<bool> WaitForConditionAsync(Func<bool> predicate, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            if (predicate())
            {
                return true;
            }

            await Task.Delay(120);
        }

        return false;
    }

    private async Task<FunctionKitUiSnapshot?> CaptureFunctionKitUiSnapshotAsync()
    {
        if (_functionKitHost is null)
        {
            return null;
        }

        const string snapshotScript = """
JSON.stringify((() => {
  const statusBar = document.getElementById("statusBar");
  const candidateCards = Array.from(document.querySelectorAll("#candidateList .candidate-card"));
  const firstCandidate = candidateCards[0] ?? null;
  const firstCandidateActions = firstCandidate
    ? Array.from(firstCandidate.querySelectorAll("[data-action]"))
        .map((button) => ({
          type: button.dataset.action ?? "",
          label: button.textContent?.trim() ?? ""
        }))
    : [];

  const commandSet = [];
  const addCommand = (value) => {
    if (value && !commandSet.includes(value)) {
      commandSet.push(value);
    }
  };

  const mapButtonToCommand = (button) => {
    if (button.id === "refreshButton") {
      return "candidates.regenerate";
    }
    if (button.dataset.command === "requestContext") {
      return "context.request";
    }
    if (button.dataset.command === "openSettings") {
      return "settings.open";
    }
    if (button.dataset.action === "insert") {
      return "candidate.insert";
    }
    if (button.dataset.action === "replace") {
      return "candidate.replace";
    }
    if (button.dataset.action === "regenerate") {
      return "candidates.regenerate";
    }
    return null;
  };

  Array.from(document.querySelectorAll("button"))
    .filter((button) => !button.disabled)
    .forEach((button) => addCommand(mapButtonToCommand(button)));

  return {
    surface: "panel",
    status: {
      state: statusBar?.dataset.state ?? "unknown",
      text: document.getElementById("statusText")?.textContent?.trim() ?? ""
    },
    sourceMessage: document.getElementById("sourceMessage")?.textContent?.trim() ?? "",
    personaChips: Array.from(document.querySelectorAll("#personaChips .chip"))
      .map((chip) => chip.textContent?.trim() ?? "")
      .filter(Boolean),
    candidateCount: candidateCards.length,
    firstCandidate: firstCandidate
      ? {
          id: firstCandidate.dataset.id ?? "",
          text: firstCandidate.querySelector(".candidate-card__text")?.textContent?.trim() ?? "",
          risk: firstCandidate.querySelector(".risk")?.textContent?.trim() ?? "",
          actions: firstCandidateActions
        }
      : null,
    availableCommands: commandSet.slice().sort()
  };
})())
""";

        var raw = await _functionKitHost.EvaluateScriptAsync(snapshotScript);
        var json = JsonSerializer.Deserialize<string>(raw);
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        return JsonSerializer.Deserialize<FunctionKitUiSnapshot>(json, _snapshotJsonOptions);
    }

    private FunctionKitUiSnapshot LoadFunctionKitUiSnapshot(string snapshotPath)
    {
        var json = File.ReadAllText(snapshotPath, Encoding.UTF8);
        return JsonSerializer.Deserialize<FunctionKitUiSnapshot>(json, _snapshotJsonOptions)
               ?? throw new InvalidOperationException($"Invalid function kit snapshot: {snapshotPath}");
    }

    private string LoadFixtureErrorMessage(string fixturePath)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(fixturePath, Encoding.UTF8));
        if (document.RootElement.TryGetProperty("error", out var error) &&
            error.ValueKind == JsonValueKind.Object &&
            error.TryGetProperty("message", out var message) &&
            message.ValueKind == JsonValueKind.String)
        {
            return message.GetString() ?? string.Empty;
        }

        return string.Empty;
    }

    private string? TryGetFunctionKitFixturePath(string fileName)
    {
        return _functionKitFixturePaths.TryGetValue(fileName, out var path) ? path : null;
    }

    private static bool TryMatchFunctionKitUiSnapshots(
        FunctionKitUiSnapshot actual,
        FunctionKitUiSnapshot expected,
        out string mismatchReason)
    {
        var actualNode = JsonSerializer.SerializeToNode(actual);
        var expectedNode = JsonSerializer.SerializeToNode(expected);
        if (JsonNode.DeepEquals(actualNode, expectedNode))
        {
            mismatchReason = string.Empty;
            return true;
        }

        mismatchReason = $"expected={expectedNode} actual={actualNode}";
        return false;
    }

    private bool TryValidateFunctionKitUiEnvelope(
        JsonElement envelope,
        out string validationCode,
        out string validationMessage)
    {
        validationCode = "none";
        validationMessage = string.Empty;

        if (envelope.ValueKind != JsonValueKind.Object)
        {
            validationCode = "invalid_envelope_shape";
            validationMessage = "Envelope must be a JSON object.";
            return false;
        }

        if (!string.Equals(GetStringProperty(envelope, "version"), "1.0.0", StringComparison.Ordinal))
        {
            validationCode = "invalid_protocol_version";
            validationMessage = "Unsupported function kit protocol version.";
            return false;
        }

        if (!string.Equals(GetStringProperty(envelope, "source"), "function-kit-ui", StringComparison.Ordinal))
        {
            validationCode = "invalid_envelope_source";
            validationMessage = "UI envelope source must be function-kit-ui.";
            return false;
        }

        if (!string.Equals(GetStringProperty(envelope, "target"), "host-adapter", StringComparison.Ordinal))
        {
            validationCode = "invalid_envelope_target";
            validationMessage = "UI envelope target must be host-adapter.";
            return false;
        }

        if (!string.Equals(GetStringProperty(envelope, "surface"), "panel", StringComparison.Ordinal))
        {
            validationCode = "invalid_envelope_surface";
            validationMessage = "UI envelope surface must be panel.";
            return false;
        }

        if (!string.Equals(GetStringProperty(envelope, "kitId"), _functionKitKitId, StringComparison.Ordinal))
        {
            validationCode = "invalid_envelope_kit";
            validationMessage = "UI envelope kitId does not match current function kit.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(GetStringProperty(envelope, "messageId")))
        {
            validationCode = "missing_message_id";
            validationMessage = "UI envelope messageId is required.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(GetStringProperty(envelope, "type")))
        {
            validationCode = "missing_message_type";
            validationMessage = "UI envelope type is required.";
            return false;
        }

        if (!TryGetPayloadObject(envelope))
        {
            validationCode = "invalid_payload";
            validationMessage = "UI envelope payload must be an object.";
            return false;
        }

        return true;
    }

    private static bool TryGetPayloadObject(JsonElement envelope)
    {
        return envelope.TryGetProperty("payload", out var payload) &&
               payload.ValueKind == JsonValueKind.Object;
    }

    private async Task HandleBridgeReadyAsync(JsonElement envelope, string? replyTo)
    {
        var requestedPermissions = GetRequestedPermissions(envelope);
        _grantedRuntimePermissions = requestedPermissions.Count == 0
            ? _allowedRuntimePermissions
            : _allowedRuntimePermissions.Intersect(requestedPermissions, StringComparer.Ordinal).ToArray();
        _functionKitSessionId = $"session-{_functionKitKitId}-{Guid.NewGuid():N}";
        _functionKitReady = true;
        _functionKitLastError = "none";

        await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateReadyAck(
            _functionKitKitId,
            replyTo,
            _functionKitSessionId,
            _grantedRuntimePermissions));
        await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreatePermissionsSync(
            _functionKitKitId,
            _grantedRuntimePermissions));
    }

    private async Task HandleCandidateCommitAsync(JsonElement envelope, bool replace)
    {
        var payload = GetPayload(envelope);
        var text = GetStringProperty(payload, "text") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(text))
        {
            await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateBridgeError(
                _functionKitKitId,
                "missing_candidate_text",
                "Candidate text is empty.",
                false,
                details: new { replace },
                replyTo: GetStringProperty(envelope, "messageId")));
            return;
        }

        if (!TryCommitToLastTarget(text, replace, out var detail))
        {
            await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateBridgeError(
                _functionKitKitId,
                "missing_commit_target",
                "No commit target is available. Focus a host input first.",
                false,
                details: new { lastCommitTarget = _lastCommitTarget, replace },
                replyTo: GetStringProperty(envelope, "messageId")));
            return;
        }

        await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateHostStateUpdate(
            _functionKitKitId,
            replace ? "候选已替换到提交目标" : "候选已插入到提交目标",
            new
            {
                commitTarget = _lastCommitTarget,
                detail
            }));
    }

    private async Task HandleStorageGetAsync(JsonElement envelope, string? replyTo)
    {
        _functionKitStorage ??= new FunctionKitStorageStore(_functionKitStoragePath);
        var payload = GetPayload(envelope);
        var keys = payload.ValueKind == JsonValueKind.Object && payload.TryGetProperty("keys", out var keysElement) && keysElement.ValueKind == JsonValueKind.Array
            ? keysElement.EnumerateArray().Select(item => item.GetString()).Where(value => !string.IsNullOrWhiteSpace(value)).Cast<string>().ToArray()
            : Array.Empty<string>();

        var values = _functionKitStorage.GetValues(keys);
        await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateStorageSync(
            _functionKitKitId,
            new { values },
            replyTo));
    }

    private async Task HandleStorageSetAsync(JsonElement envelope, string? replyTo)
    {
        _functionKitStorage ??= new FunctionKitStorageStore(_functionKitStoragePath);
        var payload = GetPayload(envelope);
        if (payload.ValueKind == JsonValueKind.Object && payload.TryGetProperty("values", out var values))
        {
            _functionKitStorage.SetValues(values);
        }

        await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateStorageSync(
            _functionKitKitId,
            new
            {
                values = _functionKitStorage.GetValues(Array.Empty<string>())
            },
            replyTo));
    }

    private async Task HandlePanelStateUpdateAsync(JsonElement envelope, string? replyTo)
    {
        var payload = GetPayload(envelope);
        var patch = payload.ValueKind == JsonValueKind.Object && payload.TryGetProperty("patch", out var patchElement)
            ? patchElement.Clone()
            : default;

        await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreatePanelStateAck(
            _functionKitKitId,
            new { patch },
            replyTo));
    }

    private async Task<bool> EnsurePermissionAsync(JsonElement envelope, string permission)
    {
        if (_grantedRuntimePermissions.Contains(permission, StringComparer.Ordinal))
        {
            return true;
        }

        await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreatePermissionDenied(
            _functionKitKitId,
            permission,
            GetStringProperty(envelope, "messageId")));
        return false;
    }

    private async Task DispatchContextSnapshotAsync(string? replyTo, bool renderCandidates)
    {
        await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateContextSync(
            _functionKitKitId,
            BuildContextSyncPayload(),
            replyTo));

        if (renderCandidates)
        {
            await DispatchCandidatesRenderAsync(replyTo, reason: "context-sync");
        }
    }

    private async Task DispatchCandidatesRenderAsync(string? replyTo, string reason)
    {
        await DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelopeFactory.CreateCandidatesRender(
            _functionKitKitId,
            BuildRenderPayload(reason),
            replyTo));
    }

    private async Task DispatchFunctionKitEnvelopeAsync(FunctionKitEnvelope envelope)
    {
        if (_functionKitHost is null)
        {
            return;
        }

        AppendLog($"FunctionKit Host -> UI：{envelope.Type}");
        await _functionKitHost.DispatchEnvelopeAsync(envelope);
    }

    private object BuildContextSyncPayload()
    {
        var snapshot = CaptureSnapshot();
        return new
        {
            requestContext = new
            {
                sourceMessage = ResolveSourceMessage(),
                personaChips = ResolvePersonaChips(),
                commitTarget = snapshot.LastCommitTarget
            },
            hostSnapshot = snapshot,
            grantedPermissions = _grantedRuntimePermissions,
            manifest = BuildFunctionKitManifestSnapshot(),
            routing = BuildFunctionKitRoutingSnapshot("context-sync"),
            slash = BuildFunctionKitSlashSnapshot()
        };
    }

    private object BuildRenderPayload(string reason)
    {
        var sourceMessage = ResolveSourceMessage();
        var personaChips = ResolvePersonaChips();
        var targetLabel = ResolveCommitTargetLabel(_lastCommitTarget);
        var generation = _functionKitRenderGeneration % 3;

        var candidates = generation switch
        {
            0 => new object[]
            {
                new
                {
                    id = "c1",
                    text = "收到，我先把第一版整理出来，今晚前发你过一遍。",
                    tone = "稳妥",
                    risk = "low",
                    rationale = $"承接当前任务，适合先给出明确动作。提交目标：{targetLabel}。",
                    actions = BuildCandidateActions()
                },
                new
                {
                    id = "c2",
                    text = "明白，我先把结构和关键点收一下，整理好后发你确认。",
                    tone = "中性",
                    risk = "low",
                    rationale = $"避免过度承诺，适合信息还没完全收口时使用。提交目标：{targetLabel}。",
                    actions = BuildCandidateActions()
                },
                new
                {
                    id = "c3",
                    text = "行，我先出个第一版，你晚上看完我们再定下一步。",
                    tone = "配合",
                    risk = "medium",
                    rationale = $"更口语一些，但时间边界略弱。提交目标：{targetLabel}。",
                    actions = BuildCandidateActions()
                }
            },
            1 => new object[]
            {
                new
                {
                    id = "c4",
                    text = "可以，我先把版本收口一下，晚些发你看。",
                    tone = "简洁",
                    risk = "medium",
                    rationale = $"回复更短，适合候选栏快速确认。提交目标：{targetLabel}。",
                    actions = BuildCandidateActions()
                },
                new
                {
                    id = "c5",
                    text = "收到，我先把核心点整理出来，确认后马上同步你。",
                    tone = "专业",
                    risk = "low",
                    rationale = $"强调先收核心点，减少误承诺。提交目标：{targetLabel}。",
                    actions = BuildCandidateActions()
                },
                new
                {
                    id = "c6",
                    text = "明白，我先做一版，整理完发你过目。",
                    tone = "中性",
                    risk = "low",
                    rationale = $"适合比较稳的协作场景。提交目标：{targetLabel}。",
                    actions = BuildCandidateActions()
                }
            },
            _ => new object[]
            {
                new
                {
                    id = "c7",
                    text = "好的，我先按这个方向整理，出完第一版再发你确认。",
                    tone = "协作",
                    risk = "low",
                    rationale = $"明确先做后确认，链路清晰。提交目标：{targetLabel}。",
                    actions = BuildCandidateActions()
                },
                new
                {
                    id = "c8",
                    text = "收到，我先整理一版框架，晚点同步你。",
                    tone = "简洁",
                    risk = "medium",
                    rationale = $"边界更保守，适合还不想给出具体时间时使用。提交目标：{targetLabel}。",
                    actions = BuildCandidateActions()
                },
                new
                {
                    id = "c9",
                    text = "行，我先把内容梳一下，整理好后发你看。",
                    tone = "自然",
                    risk = "low",
                    rationale = $"口语感更强，但仍保持动作明确。提交目标：{targetLabel}。",
                    actions = BuildCandidateActions()
                }
            }
        };

        return new
        {
            requestContext = new
            {
                sourceMessage,
                personaChips
            },
            result = new
            {
                candidates,
                missing_context = Array.Empty<string>()
            },
            uiHints = new
            {
                allowRegenerate = _grantedRuntimePermissions.Contains("candidates.regenerate", StringComparer.Ordinal),
                reason
            },
            manifest = BuildFunctionKitManifestSnapshot(),
            routing = BuildFunctionKitRoutingSnapshot(reason),
            slash = BuildFunctionKitSlashSnapshot()
        };
    }

    private bool TryCommitToLastTarget(string text, bool replace, out string detail)
    {
        detail = string.Empty;
        if (!IsCommitEligibleTarget(_lastCommitTarget))
        {
            return false;
        }

        switch (_lastCommitTarget)
        {
            case "single-line":
                CommitToTextBox(_singleLineTextBox, text, replace);
                break;
            case "multi-line":
                CommitToTextBox(_multiLineTextBox, text, replace);
                break;
            case "rich-text":
                CommitToRichTextBox(_richTextBox, text, replace);
                break;
            case var target when target.StartsWith("web:", StringComparison.Ordinal):
                var elementId = target["web:".Length..];
                CommitToWebElement(elementId, text, replace);
                break;
            default:
                return false;
        }

        detail = $"target={_lastCommitTarget}, mode={(replace ? "replace" : "insert")}, length={text.Length}";
        AppendLog($"功能件提交：{detail}");
        RefreshState();
        return true;
    }

    private void CommitToWebElement(string elementId, string text, bool replace)
    {
        if (string.Equals(elementId, WebEditorId, StringComparison.Ordinal))
        {
            var nextValue = replace ? text : GetWebElementValue(elementId) + text;
            SetWebEditorText(nextValue);
            return;
        }

        var existingValue = GetWebElementValue(elementId);
        SetWebElementValue(elementId, replace ? text : existingValue + text);
    }

    private static void CommitToTextBox(TextBoxBase control, string text, bool replace)
    {
        control.Text = replace ? text : control.Text + text;
        control.SelectionStart = control.TextLength;
        control.SelectionLength = 0;
    }

    private static void CommitToRichTextBox(RichTextBox control, string text, bool replace)
    {
        control.Text = replace ? text : control.Text + text;
        control.SelectionStart = control.TextLength;
        control.SelectionLength = 0;
    }

    private string ResolveSourceMessage()
    {
        var currentTargetText = GetTextForTarget(_lastCommitTarget);
        return string.IsNullOrWhiteSpace(currentTargetText)
            ? "对方刚刚说：这周先把第一版方案整理出来，晚上我再看。"
            : currentTargetText.Trim();
    }

    private string[] ResolvePersonaChips()
    {
        return
        [
            ResolveCommitTargetLabel(_lastCommitTarget),
            "工作沟通",
            "浏览器面板",
            "显式提交",
            $"Launch:{_functionKitManifestMetadata.Discovery.LaunchMode}",
            $"Ai:{_functionKitManifestMetadata.Ai.ExecutionMode}"
        ];
    }

    private object BuildFunctionKitManifestSnapshot()
    {
        return new
        {
            kitId = _functionKitManifestMetadata.Id,
            entry = _functionKitManifestMetadata.EntryRelativePath,
            runtimePermissions = _functionKitManifestMetadata.RuntimePermissions,
            discovery = new
            {
                launchMode = _functionKitManifestMetadata.Discovery.LaunchMode,
                commands = _functionKitManifestMetadata.Discovery.Commands,
                aliases = _functionKitManifestMetadata.Discovery.Aliases,
                tags = _functionKitManifestMetadata.Discovery.Tags
            },
            ai = new
            {
                executionMode = _functionKitManifestMetadata.Ai.ExecutionMode,
                backendHints = new
                {
                    preferredBackendClass = _functionKitManifestMetadata.Ai.BackendHints.PreferredBackendClass,
                    preferredAdapter = _functionKitManifestMetadata.Ai.BackendHints.PreferredAdapter,
                    latencyTier = _functionKitManifestMetadata.Ai.BackendHints.LatencyTier,
                    latencyBudgetMs = _functionKitManifestMetadata.Ai.BackendHints.LatencyBudgetMs,
                    requireStructuredJson = _functionKitManifestMetadata.Ai.BackendHints.RequireStructuredJson,
                    requiredCapabilities = _functionKitManifestMetadata.Ai.BackendHints.RequiredCapabilities,
                    notes = _functionKitManifestMetadata.Ai.BackendHints.Notes
                }
            }
        };
    }

    private object BuildFunctionKitRoutingSnapshot(string reason)
    {
        return new
        {
            requestedExecutionMode = _functionKitManifestMetadata.Ai.ExecutionMode,
            effectiveExecutionMode = "local-demo",
            preferredBackendClass = _functionKitManifestMetadata.Ai.BackendHints.PreferredBackendClass,
            preferredAdapter = _functionKitManifestMetadata.Ai.BackendHints.PreferredAdapter,
            latencyTier = _functionKitManifestMetadata.Ai.BackendHints.LatencyTier,
            latencyBudgetMs = _functionKitManifestMetadata.Ai.BackendHints.LatencyBudgetMs,
            renderPath = _functionKitManifestMetadata.RemoteRenderPath,
            reason
        };
    }

    private object? BuildFunctionKitSlashSnapshot()
    {
        return _functionKitManifestMetadata.ResolveSlashQuery(GetTextForTarget(_lastCommitTarget));
    }

    private string GetTextForTarget(string target)
    {
        return target switch
        {
            "single-line" => _singleLineTextBox.Text,
            "multi-line" => _multiLineTextBox.Text,
            "rich-text" => _richTextBox.Text,
            var value when value == $"web:{WebInputId}" => GetWebElementValue(WebInputId),
            var value when value == $"web:{WebTextareaId}" => GetWebElementValue(WebTextareaId),
            var value when value == $"web:{WebEditorId}" => GetWebElementValue(WebEditorId),
            _ => string.Empty
        };
    }

    private IReadOnlyList<string> GetRequestedPermissions(JsonElement envelope)
    {
        var payload = GetPayload(envelope);
        if (payload.ValueKind != JsonValueKind.Object ||
            !payload.TryGetProperty("requestedPermissions", out var requestedPermissions) ||
            requestedPermissions.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        return requestedPermissions
            .EnumerateArray()
            .Select(item => item.GetString())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.Ordinal)
            .Cast<string>()
            .ToArray();
    }

    private static JsonElement GetPayload(JsonElement envelope)
    {
        if (envelope.ValueKind == JsonValueKind.Object && envelope.TryGetProperty("payload", out var payload))
        {
            return payload;
        }

        return default;
    }

    private static string? GetStringProperty(JsonElement element, string propertyName)
    {
        if (element.ValueKind == JsonValueKind.Object &&
            element.TryGetProperty(propertyName, out var property) &&
            property.ValueKind == JsonValueKind.String)
        {
            return property.GetString();
        }

        return null;
    }

    private static object[] BuildCandidateActions()
    {
        return
        [
            new
            {
                type = "insert",
                label = "插入"
            },
            new
            {
                type = "replace",
                label = "替换"
            }
        ];
    }
}
