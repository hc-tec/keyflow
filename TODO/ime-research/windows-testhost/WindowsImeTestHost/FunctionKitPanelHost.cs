using System.IO;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace WindowsImeTestHost;

internal sealed class FunctionKitPanelHost
{
    private const string VirtualHostName = "function-kit.local";

    private readonly WebView2 _webView;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);
    private bool _configured;
    private string? _currentEntryRelativePath;
    private TaskCompletionSource<bool> _navigationCompletedSource = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public FunctionKitPanelHost(WebView2 webView)
    {
        _webView = webView;
    }

    public event EventHandler<JsonElement>? UiEnvelopeReceived;

    public string? CurrentEntryRelativePath => _currentEntryRelativePath;
    public string LastNavigationStatus { get; private set; } = "none";

    public async Task InitializeAsync(string assetRootPath, string entryRelativePath)
    {
        await _webView.EnsureCoreWebView2Async();
        ConfigureCoreWebView(assetRootPath);

        _currentEntryRelativePath = NormalizeRelativePath(entryRelativePath);
        _navigationCompletedSource = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        _webView.CoreWebView2.Navigate($"https://{VirtualHostName}/{_currentEntryRelativePath}");
        await Task.WhenAny(_navigationCompletedSource.Task, Task.Delay(TimeSpan.FromSeconds(10)));
    }

    public Task DispatchEnvelopeAsync(FunctionKitEnvelope envelope)
    {
        var json = JsonSerializer.Serialize(envelope, _jsonOptions);
        _webView.CoreWebView2.PostWebMessageAsJson(json);
        return Task.CompletedTask;
    }

    public Task DispatchEnvelopeJsonAsync(string envelopeJson)
    {
        _webView.CoreWebView2.PostWebMessageAsJson(envelopeJson);
        return Task.CompletedTask;
    }

    public Task<string> EvaluateScriptAsync(string script)
    {
        return _webView.CoreWebView2.ExecuteScriptAsync(script);
    }

    private void ConfigureCoreWebView(string assetRootPath)
    {
        if (_configured)
        {
            return;
        }

        var core = _webView.CoreWebView2;
        core.Settings.IsWebMessageEnabled = true;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.AreHostObjectsAllowed = false;

        core.WebMessageReceived += OnWebMessageReceived;
        core.NavigationStarting += OnNavigationStarting;
        core.NavigationCompleted += OnNavigationCompleted;
        core.NewWindowRequested += OnNewWindowRequested;
        core.PermissionRequested += OnPermissionRequested;
        core.DownloadStarting += OnDownloadStarting;
        core.WebResourceRequested += OnWebResourceRequested;
        core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
        core.SetVirtualHostNameToFolderMapping(
            VirtualHostName,
            assetRootPath,
            CoreWebView2HostResourceAccessKind.DenyCors);

        _configured = true;
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        using var document = JsonDocument.Parse(args.WebMessageAsJson);
        UiEnvelopeReceived?.Invoke(this, document.RootElement.Clone());
    }

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs args)
    {
        if (IsAllowedUri(args.Uri))
        {
            return;
        }

        args.Cancel = true;
    }

    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs args)
    {
        args.Handled = true;
    }

    private static void OnPermissionRequested(object? sender, CoreWebView2PermissionRequestedEventArgs args)
    {
        args.State = CoreWebView2PermissionState.Deny;
        args.Handled = true;
    }

    private static void OnDownloadStarting(object? sender, CoreWebView2DownloadStartingEventArgs args)
    {
        args.Cancel = true;
    }

    private void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs args)
    {
        LastNavigationStatus = args.IsSuccess ? "success" : $"error:{args.WebErrorStatus}";
        _navigationCompletedSource.TrySetResult(args.IsSuccess);
    }

    private void OnWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs args)
    {
        if (IsAllowedUri(args.Request.Uri))
        {
            return;
        }

        var responseBody = new MemoryStream(Encoding.UTF8.GetBytes("Blocked by FunctionKit host policy."));
        args.Response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(
            responseBody,
            403,
            "Blocked",
            "Content-Type: text/plain; charset=utf-8");
    }

    private static bool IsAllowedUri(string? rawUri)
    {
        if (string.IsNullOrWhiteSpace(rawUri))
        {
            return false;
        }

        if (!Uri.TryCreate(rawUri, UriKind.Absolute, out var uri))
        {
            return false;
        }

        if (string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(uri.Host, VirtualHostName, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(uri.Scheme, "data", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(uri.Scheme, "about", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return false;
    }

    private static string NormalizeRelativePath(string relativePath)
    {
        return relativePath.Replace("\\", "/").TrimStart('/');
    }
}
