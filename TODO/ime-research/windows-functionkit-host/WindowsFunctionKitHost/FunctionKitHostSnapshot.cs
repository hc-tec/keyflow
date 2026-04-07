using System.Text.Json.Nodes;

namespace WindowsFunctionKitHost;

internal sealed record FunctionKitHostSnapshot(
    string CapturedAt,
    bool WebViewReady,
    string SessionId,
    string LastUiMessageType,
    string LastHostMessageType,
    string ActiveTab,
    int RenderCount,
    int CandidateCount,
    string TargetInputText,
    string SourceMessage,
    string ConversationSummary,
    string[] PersonaChips,
    string[] GrantedPermissions,
    JsonObject StorageValues,
    string ManifestExecutionMode,
    string ResolvedExecutionMode,
    string? PreferredBackendClass,
    string? PreferredAdapter,
    string DiscoveryLaunchMode,
    string[] SlashCommands,
    string LastStatusLabel,
    string LastErrorCode);
