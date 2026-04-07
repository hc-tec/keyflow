using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace WindowsFunctionKitHost;

internal sealed record FunctionKitManifestMetadata(
    string Id,
    string EntryRelativePath,
    IReadOnlyList<string> RuntimePermissions,
    FunctionKitAiMetadata Ai,
    FunctionKitDiscoveryMetadata Discovery,
    string RemoteRenderPath,
    string ManifestPath)
{
    public static FunctionKitManifestMetadata Load(
        string todoRootPath,
        string fallbackKitId,
        string fallbackEntryRelativePath)
    {
        var manifestPath = Path.Combine(todoRootPath, "function-kits", fallbackKitId, "manifest.json");
        if (!File.Exists(manifestPath))
        {
            return CreateFallback(fallbackKitId, fallbackEntryRelativePath, manifestPath);
        }

        using var document = JsonDocument.Parse(File.ReadAllText(manifestPath, Encoding.UTF8));
        return Parse(document.RootElement, manifestPath, todoRootPath, fallbackKitId, fallbackEntryRelativePath);
    }

    public object? ResolveSlashQuery(string text)
    {
        if (!Discovery.SlashEnabled || string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var trimmed = text.Trim();
        if (!trimmed.StartsWith("/", StringComparison.Ordinal) || trimmed.StartsWith("//", StringComparison.Ordinal))
        {
            return null;
        }

        var query = trimmed[1..].Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(query))
        {
            return new
            {
                query,
                launchMode = Discovery.LaunchMode,
                browse = true,
                commands = Discovery.Commands,
                aliases = Discovery.Aliases
            };
        }

        bool HasPrefix(IReadOnlyList<string> values) =>
            values.Any(value => value.StartsWith(query, StringComparison.OrdinalIgnoreCase));

        var regexMatches = Discovery.RegexMatchers
            .Where(pattern =>
            {
                try
                {
                    return Regex.IsMatch(query, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
                }
                catch
                {
                    return false;
                }
            })
            .ToArray();

        return new
        {
            query,
            launchMode = Discovery.LaunchMode,
            matched = HasPrefix(Discovery.Commands) || HasPrefix(Discovery.Aliases) || HasPrefix(Discovery.Tags) || regexMatches.Length > 0,
            commands = Discovery.Commands.Where(value => value.StartsWith(query, StringComparison.OrdinalIgnoreCase)).ToArray(),
            aliases = Discovery.Aliases.Where(value => value.StartsWith(query, StringComparison.OrdinalIgnoreCase)).ToArray(),
            tags = Discovery.Tags.Where(value => value.StartsWith(query, StringComparison.OrdinalIgnoreCase)).ToArray(),
            regexMatchers = regexMatches
        };
    }

    private static FunctionKitManifestMetadata Parse(
        JsonElement root,
        string manifestPath,
        string todoRootPath,
        string fallbackKitId,
        string fallbackEntryRelativePath)
    {
        var manifestDirectory = Path.GetDirectoryName(manifestPath) ?? todoRootPath;

        var kitId = ReadString(root, "id") ?? fallbackKitId;
        var entryRelativePath =
            ReadString(root, "entry", "bundle", "html") is { Length: > 0 } htmlRelativePath
                ? Path.GetRelativePath(todoRootPath, Path.GetFullPath(Path.Combine(manifestDirectory, htmlRelativePath))).Replace("\\", "/")
                : fallbackEntryRelativePath.Replace("\\", "/");

        var runtimePermissions =
            ReadStringArray(root, "runtimePermissions") is { Count: > 0 } declaredPermissions
                ? declaredPermissions
                : DefaultRuntimePermissions;

        var backendHints = ReadJsonObject(root, "ai", "backendHints") ?? new JsonObject();
        var discoveryRoot = ReadJsonObject(root, "discovery") ?? new JsonObject();
        var slashRoot = ReadJsonObject(root, "discovery", "slash") ?? new JsonObject();

        return new FunctionKitManifestMetadata(
            Id: kitId,
            EntryRelativePath: entryRelativePath,
            RuntimePermissions: runtimePermissions,
            Ai: new FunctionKitAiMetadata(
                ExecutionMode: ReadString(root, "ai", "executionMode") ?? "local-demo",
                BackendHints: new FunctionKitAiBackendHints(
                    PreferredBackendClass: ReadString(root, "ai", "backendHints", "preferredBackendClass"),
                    PreferredAdapter: ReadString(root, "ai", "backendHints", "preferredAdapter"),
                    LatencyTier: ReadString(root, "ai", "backendHints", "latencyTier"),
                    LatencyBudgetMs: ReadInt(root, "ai", "backendHints", "latencyBudgetMs"),
                    RequireStructuredJson: ReadBool(root, "ai", "backendHints", "requireStructuredJson"),
                    RequiredCapabilities: ReadStringArray(root, "ai", "backendHints", "requiredCapabilities"),
                    Notes: ReadStringArray(root, "ai", "backendHints", "notes"),
                    Raw: backendHints)),
            Discovery: new FunctionKitDiscoveryMetadata(
                LaunchMode: ReadStringNode(discoveryRoot, "launchMode") ?? "panel-first",
                SlashEnabled: ReadBoolNode(slashRoot, "enabled") ?? false,
                SlashCommands: ReadStringArrayNode(slashRoot, "commands"),
                SlashAliases: ReadStringArrayNode(slashRoot, "aliases"),
                SlashTags: ReadStringArrayNode(slashRoot, "tags"),
                SlashRegexMatchers: ReadRegexPatternsNode(slashRoot, "matchers")),
            RemoteRenderPath: $"/v1/function-kits/{kitId}/render",
            ManifestPath: manifestPath);
    }

    private static FunctionKitManifestMetadata CreateFallback(
        string fallbackKitId,
        string fallbackEntryRelativePath,
        string manifestPath)
    {
        return new FunctionKitManifestMetadata(
            Id: fallbackKitId,
            EntryRelativePath: fallbackEntryRelativePath.Replace("\\", "/"),
            RuntimePermissions: DefaultRuntimePermissions,
            Ai: new FunctionKitAiMetadata(
                ExecutionMode: "local-demo",
                BackendHints: new FunctionKitAiBackendHints(
                    PreferredBackendClass: null,
                    PreferredAdapter: null,
                    LatencyTier: null,
                    LatencyBudgetMs: null,
                    RequireStructuredJson: null,
                    RequiredCapabilities: [],
                    Notes: [],
                    Raw: new JsonObject())),
            Discovery: new FunctionKitDiscoveryMetadata(
                LaunchMode: "panel-first",
                SlashEnabled: false,
                SlashCommands: [],
                SlashAliases: [],
                SlashTags: [],
                SlashRegexMatchers: []),
            RemoteRenderPath: $"/v1/function-kits/{fallbackKitId}/render",
            ManifestPath: manifestPath);
    }

    private static string? ReadString(JsonElement root, params string[] path)
    {
        return TryGetElement(root, out var element, path) && element.ValueKind == JsonValueKind.String
            ? element.GetString()
            : null;
    }

    private static int? ReadInt(JsonElement root, params string[] path)
    {
        return TryGetElement(root, out var element, path) && element.ValueKind == JsonValueKind.Number
            ? element.GetInt32()
            : null;
    }

    private static bool? ReadBool(JsonElement root, params string[] path)
    {
        return TryGetElement(root, out var element, path) && (element.ValueKind == JsonValueKind.True || element.ValueKind == JsonValueKind.False)
            ? element.GetBoolean()
            : null;
    }

    private static JsonObject? ReadJsonObject(JsonElement root, params string[] path)
    {
        if (!TryGetElement(root, out var element, path) || element.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return JsonNode.Parse(element.GetRawText()) as JsonObject;
    }

    private static IReadOnlyList<string> ReadStringArray(JsonElement root, params string[] path)
    {
        if (!TryGetElement(root, out var element, path) || element.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return element.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString())
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Cast<string>()
            .ToArray();
    }

    private static string? ReadStringNode(JsonObject root, string propertyName)
    {
        return root[propertyName] is JsonValue value ? value.GetValue<string?>() : null;
    }

    private static bool? ReadBoolNode(JsonObject root, string propertyName)
    {
        return root[propertyName] is JsonValue value ? value.GetValue<bool?>() : null;
    }

    private static IReadOnlyList<string> ReadStringArrayNode(JsonObject root, string propertyName)
    {
        return root[propertyName] is JsonArray array
            ? array
                .Select(item => item?.GetValue<string>())
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Cast<string>()
                .ToArray()
            : [];
    }

    private static IReadOnlyList<string> ReadRegexPatternsNode(JsonObject root, string propertyName)
    {
        return root[propertyName] is JsonArray array
            ? array
                .OfType<JsonObject>()
                .Select(item => item["pattern"] as JsonValue)
                .Select(item => item?.GetValue<string>())
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Cast<string>()
                .ToArray()
            : [];
    }

    private static bool TryGetElement(JsonElement root, out JsonElement result, params string[] path)
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

    private static readonly IReadOnlyList<string> DefaultRuntimePermissions =
    [
        "context.read",
        "input.insert",
        "input.replace",
        "candidates.regenerate",
        "settings.open",
        "storage.read",
        "storage.write",
        "panel.state.write"
    ];
}

internal sealed record FunctionKitAiMetadata(
    string ExecutionMode,
    FunctionKitAiBackendHints BackendHints);

internal sealed record FunctionKitAiBackendHints(
    string? PreferredBackendClass,
    string? PreferredAdapter,
    string? LatencyTier,
    int? LatencyBudgetMs,
    bool? RequireStructuredJson,
    IReadOnlyList<string> RequiredCapabilities,
    IReadOnlyList<string> Notes,
    JsonObject Raw);

internal sealed record FunctionKitDiscoveryMetadata(
    string LaunchMode,
    bool SlashEnabled,
    IReadOnlyList<string> SlashCommands,
    IReadOnlyList<string> SlashAliases,
    IReadOnlyList<string> SlashTags,
    IReadOnlyList<string> SlashRegexMatchers)
{
    public IReadOnlyList<string> Commands => SlashCommands;

    public IReadOnlyList<string> Aliases => SlashAliases;

    public IReadOnlyList<string> Tags => SlashTags;

    public IReadOnlyList<string> RegexMatchers => SlashRegexMatchers;
}
