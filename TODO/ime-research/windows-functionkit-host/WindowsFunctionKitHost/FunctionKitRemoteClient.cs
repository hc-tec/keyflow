using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace WindowsFunctionKitHost;

internal sealed class FunctionKitRemoteClient
{
    private readonly HttpClient _httpClient;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

    public FunctionKitRemoteClient(string baseUrl, TimeSpan timeout)
    {
        BaseUrl = NormalizeBaseUrl(baseUrl);
        _httpClient = new HttpClient
        {
            BaseAddress = new Uri(BaseUrl, UriKind.Absolute),
            Timeout = timeout
        };
    }

    public string BaseUrl { get; }

    public async Task<JsonObject> RenderAsync(
        object request,
        string renderPath,
        CancellationToken cancellationToken = default)
    {
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, NormalizeRenderPath(renderPath))
        {
            Content = new StringContent(
                JsonSerializer.Serialize(request, _jsonOptions),
                Encoding.UTF8,
                "application/json")
        };

        return await SendForJsonAsync(httpRequest, cancellationToken);
    }

    public async Task<JsonObject> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        using var httpRequest = new HttpRequestMessage(HttpMethod.Get, "/v1/openclaw/status");
        return await SendForJsonAsync(httpRequest, cancellationToken);
    }

    private async Task<JsonObject> SendForJsonAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw BuildException(response.StatusCode, body);
        }

        JsonNode? parsed;
        try
        {
            parsed = JsonNode.Parse(body);
        }
        catch (Exception exception)
        {
            throw new FunctionKitRemoteClientException(
                code: "remote_invalid_json",
                message: $"Remote service returned invalid JSON: {exception.Message}",
                retryable: false,
                statusCode: (int)response.StatusCode,
                detailsJson: body);
        }

        if (parsed is not JsonObject jsonObject)
        {
            throw new FunctionKitRemoteClientException(
                code: "remote_response_invalid",
                message: "Remote service returned a non-object JSON payload.",
                retryable: false,
                statusCode: (int)response.StatusCode,
                detailsJson: body);
        }

        return jsonObject;
    }

    private static FunctionKitRemoteClientException BuildException(HttpStatusCode statusCode, string body)
    {
        try
        {
            if (JsonNode.Parse(body) is JsonObject root &&
                root["error"] is JsonObject error)
            {
                return new FunctionKitRemoteClientException(
                    code: error["code"]?.GetValue<string>() ?? "remote_http_status",
                    message: error["message"]?.GetValue<string>() ?? $"Remote service returned HTTP {(int)statusCode}.",
                    retryable: error["retryable"]?.GetValue<bool>() ?? false,
                    statusCode: (int)statusCode,
                    detailsJson: error["details"]?.ToJsonString());
            }
        }
        catch
        {
            // Fall through to raw body handling.
        }

        return new FunctionKitRemoteClientException(
            code: "remote_http_status",
            message: $"Remote service returned HTTP {(int)statusCode}.",
            retryable: (int)statusCode >= 500,
            statusCode: (int)statusCode,
            detailsJson: body);
    }

    private static string NormalizeBaseUrl(string baseUrl)
    {
        var trimmed = baseUrl.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            throw new ArgumentException("Remote host service base URL must not be blank.", nameof(baseUrl));
        }

        return trimmed.EndsWith("/", StringComparison.Ordinal) ? trimmed[..^1] : trimmed;
    }

    private static string NormalizeRenderPath(string renderPath)
    {
        var trimmed = renderPath.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            throw new ArgumentException("Remote render path must not be blank.", nameof(renderPath));
        }

        return trimmed.StartsWith("/", StringComparison.Ordinal) ? trimmed : $"/{trimmed}";
    }
}

internal sealed class FunctionKitRemoteClientException : Exception
{
    public FunctionKitRemoteClientException(
        string code,
        string message,
        bool retryable,
        int? statusCode = null,
        string? detailsJson = null) : base(message)
    {
        Code = code;
        Retryable = retryable;
        StatusCode = statusCode;
        DetailsJson = detailsJson;
    }

    public string Code { get; }

    public bool Retryable { get; }

    public int? StatusCode { get; }

    public string? DetailsJson { get; }
}
