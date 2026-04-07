namespace WindowsImeTestHost;

internal sealed record FunctionKitError(string Code, string Message, bool Retryable, object? Details = null);

internal sealed record FunctionKitEnvelope(
    string Version,
    string MessageId,
    DateTimeOffset Timestamp,
    string KitId,
    string Surface,
    string Source,
    string Target,
    string Type,
    object Payload,
    string? ReplyTo = null,
    FunctionKitError? Error = null);

internal static class FunctionKitEnvelopeFactory
{
    private const string ProtocolVersion = "1.0.0";
    private const string Surface = "panel";

    public static FunctionKitEnvelope CreateReadyAck(
        string kitId,
        string? replyTo,
        string sessionId,
        IReadOnlyList<string> grantedPermissions)
    {
        return Create(
            kitId,
            "bridge.ready.ack",
            new
            {
                sessionId,
                grantedPermissions,
                hostInfo = new
                {
                    platform = "windows",
                    runtime = "webview2"
                }
            },
            replyTo);
    }

    public static FunctionKitEnvelope CreatePermissionsSync(
        string kitId,
        IReadOnlyList<string> grantedPermissions)
    {
        return Create(
            kitId,
            "permissions.sync",
            new
            {
                grantedPermissions
            });
    }

    public static FunctionKitEnvelope CreateContextSync(
        string kitId,
        object payload,
        string? replyTo)
    {
        return Create(kitId, "context.sync", payload, replyTo);
    }

    public static FunctionKitEnvelope CreateCandidatesRender(
        string kitId,
        object payload,
        string? replyTo = null)
    {
        return Create(kitId, "candidates.render", payload, replyTo);
    }

    public static FunctionKitEnvelope CreateStorageSync(
        string kitId,
        object payload,
        string? replyTo)
    {
        return Create(kitId, "storage.sync", payload, replyTo);
    }

    public static FunctionKitEnvelope CreatePanelStateAck(
        string kitId,
        object payload,
        string? replyTo)
    {
        return Create(kitId, "panel.state.ack", payload, replyTo);
    }

    public static FunctionKitEnvelope CreateHostStateUpdate(
        string kitId,
        string label,
        object? detail = null)
    {
        return Create(
            kitId,
            "host.state.update",
            new
            {
                label,
                detail
            });
    }

    public static FunctionKitEnvelope CreatePermissionDenied(
        string kitId,
        string permission,
        string? replyTo)
    {
        return Create(
            kitId,
            "permission.denied",
            new { },
            replyTo,
            new FunctionKitError(
                "permission_denied",
                $"Permission not granted: {permission}",
                false,
                new { permission }));
    }

    public static FunctionKitEnvelope CreateBridgeError(
        string kitId,
        string code,
        string message,
        bool retryable,
        object? details = null,
        string? replyTo = null)
    {
        return Create(
            kitId,
            "bridge.error",
            new { },
            replyTo,
            new FunctionKitError(code, message, retryable, details));
    }

    private static FunctionKitEnvelope Create(
        string kitId,
        string type,
        object payload,
        string? replyTo = null,
        FunctionKitError? error = null)
    {
        return new FunctionKitEnvelope(
            ProtocolVersion,
            $"host-{type.Replace('.', '-')}-{Guid.NewGuid():N}",
            DateTimeOffset.Now,
            kitId,
            Surface,
            "host-adapter",
            "function-kit-ui",
            type,
            payload,
            replyTo,
            error);
    }
}
