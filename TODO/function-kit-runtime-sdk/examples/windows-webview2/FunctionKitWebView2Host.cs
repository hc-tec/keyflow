using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FunctionKitRuntimeSdk.WindowsWebView2;

public sealed class FunctionKitWebView2Host
{
    private readonly WebView2 _webView;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

    public event EventHandler<JsonElement>? UiEnvelopeReceived;

    public FunctionKitWebView2Host(WebView2 webView)
    {
        _webView = webView;
    }

    public async Task InitializeAsync(string assetRootPath, string entryRelativePath, bool enableDevTools = false)
    {
        await _webView.EnsureCoreWebView2Async();

        _webView.CoreWebView2.Settings.IsWebMessageEnabled = true;
        _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        _webView.CoreWebView2.Settings.AreDevToolsEnabled = enableDevTools;
        _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
        _webView.CoreWebView2.WebMessageReceived -= OnWebMessageReceived;
        _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
        _webView.CoreWebView2.NavigationStarting -= OnNavigationStarting;
        _webView.CoreWebView2.NavigationStarting += OnNavigationStarting;

        _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "function-kit.local",
            assetRootPath,
            CoreWebView2HostResourceAccessKind.Allow
        );

        var normalizedEntry = entryRelativePath.Replace("\\", "/").TrimStart('/');
        _webView.CoreWebView2.Navigate($"https://function-kit.local/{normalizedEntry}");
    }

    public Task DispatchEnvelopeAsync<TEnvelope>(TEnvelope envelope)
    {
        var json = JsonSerializer.Serialize(envelope, _jsonOptions);
        _webView.CoreWebView2.PostWebMessageAsJson(json);
        return Task.CompletedTask;
    }

    public Task DispatchReadyAckAsync(
        string? replyTo,
        string kitId,
        string surface,
        string sessionId,
        IReadOnlyList<string> grantedPermissions,
        object? hostInfo = null)
    {
        return DispatchEnvelopeAsync(BuildEnvelope(
            type: "bridge.ready.ack",
            replyTo: replyTo,
            kitId: kitId,
            surface: surface,
            payload: new
            {
                sessionId,
                grantedPermissions,
                hostInfo = hostInfo ?? new
                {
                    platform = "windows",
                    runtime = "webview2"
                }
            }));
    }

    public Task DispatchPermissionsSyncAsync(
        string kitId,
        string surface,
        IReadOnlyList<string> grantedPermissions)
    {
        return DispatchEnvelopeAsync(BuildEnvelope(
            type: "permissions.sync",
            replyTo: null,
            kitId: kitId,
            surface: surface,
            payload: new
            {
                grantedPermissions
            }));
    }

    public Task DispatchContextSyncAsync(string? replyTo, string kitId, string surface, object payload)
    {
        return DispatchEnvelopeAsync(BuildEnvelope(
            type: "context.sync",
            replyTo: replyTo,
            kitId: kitId,
            surface: surface,
            payload: payload));
    }

    public Task DispatchCandidatesRenderAsync(string? replyTo, string kitId, string surface, object payload)
    {
        return DispatchEnvelopeAsync(BuildEnvelope(
            type: "candidates.render",
            replyTo: replyTo,
            kitId: kitId,
            surface: surface,
            payload: payload));
    }

    public Task DispatchStorageSyncAsync(string? replyTo, string kitId, string surface, object payload)
    {
        return DispatchEnvelopeAsync(BuildEnvelope(
            type: "storage.sync",
            replyTo: replyTo,
            kitId: kitId,
            surface: surface,
            payload: payload));
    }

    public Task DispatchPanelStateAckAsync(string? replyTo, string kitId, string surface, object payload)
    {
        return DispatchEnvelopeAsync(BuildEnvelope(
            type: "panel.state.ack",
            replyTo: replyTo,
            kitId: kitId,
            surface: surface,
            payload: payload));
    }

    public Task DispatchHostStateUpdateAsync(string kitId, string surface, string label, object? details = null)
    {
        return DispatchEnvelopeAsync(BuildEnvelope(
            type: "host.state.update",
            replyTo: null,
            kitId: kitId,
            surface: surface,
            payload: new
            {
                label,
                details
            }));
    }

    public Task DispatchPermissionDeniedAsync(
        string? replyTo,
        string kitId,
        string surface,
        string permission)
    {
        return DispatchEnvelopeAsync(BuildEnvelope(
            type: "permission.denied",
            replyTo: replyTo,
            kitId: kitId,
            surface: surface,
            payload: new { },
            error: new
            {
                code = "permission_denied",
                message = $"Permission not granted: {permission}",
                retryable = false,
                details = new
                {
                    permission
                }
            }));
    }

    public Task DispatchBridgeErrorAsync(
        string? replyTo,
        string kitId,
        string surface,
        string code,
        string message,
        bool retryable,
        object? details = null)
    {
        return DispatchEnvelopeAsync(BuildEnvelope(
            type: "bridge.error",
            replyTo: replyTo,
            kitId: kitId,
            surface: surface,
            payload: new { },
            error: new
            {
                code,
                message,
                retryable,
                details
            }));
    }

    private Dictionary<string, object?> BuildEnvelope(
        string type,
        string? replyTo,
        string kitId,
        string surface,
        object payload,
        object? error = null)
    {
        var envelope = new Dictionary<string, object?>
        {
            ["version"] = "1.0.0",
            ["messageId"] = $"host-{type}-{Guid.NewGuid():N}",
            ["timestamp"] = DateTimeOffset.Now,
            ["kitId"] = kitId,
            ["surface"] = surface,
            ["source"] = "host-adapter",
            ["target"] = "function-kit-ui",
            ["type"] = type,
            ["payload"] = payload
        };

        if (!string.IsNullOrWhiteSpace(replyTo))
        {
            envelope["replyTo"] = replyTo;
        }

        if (error is not null)
        {
            envelope["error"] = error;
        }

        return envelope;
    }

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs args)
    {
        if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri))
        {
            args.Cancel = true;
            return;
        }

        if (!string.Equals(uri.Host, "function-kit.local", StringComparison.OrdinalIgnoreCase))
        {
            args.Cancel = true;
        }
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        using var document = JsonDocument.Parse(args.WebMessageAsJson);
        UiEnvelopeReceived?.Invoke(this, document.RootElement.Clone());
    }
}
