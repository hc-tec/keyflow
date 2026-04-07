using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace FunctionKitRuntimeSdk.WindowsWebView2;

public sealed record FunctionKitSlashQuerySnapshot(
    bool Active,
    string Mode,
    string Raw,
    string Query,
    bool Matched,
    string? MatchKind,
    string? MatchedValue);

public sealed record FunctionKitDiscoveryMetadata(
    string LaunchMode,
    IReadOnlyList<string> Commands,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<string> Tags,
    IReadOnlyList<string> RegexMatchers);

public sealed record FunctionKitAiBackendHints(
    string? PreferredBackendClass,
    string? PreferredAdapter,
    string? LatencyTier,
    int? LatencyBudgetMs,
    bool RequireStructuredJson,
    IReadOnlyList<string> RequiredCapabilities,
    IReadOnlyList<string> Notes);

public sealed record FunctionKitAiMetadata(
    string ExecutionMode,
    FunctionKitAiBackendHints BackendHints);

public sealed record FunctionKitManifestMetadata(
    string Id,
    string Name,
    string Description,
    string EntryRelativePath,
    IReadOnlyList<string> RuntimePermissions,
    IReadOnlyDictionary<string, string> FixturePaths,
    FunctionKitDiscoveryMetadata Discovery,
    FunctionKitAiMetadata Ai)
{
    private static readonly IReadOnlyList<string> FallbackRuntimePermissions =
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

    private static readonly HashSet<char> SeparatorCharacters =
    [
        '(', ')', '[', ']', '{', '}', '"', '\'', '`', '.', ',', '!', '?', ';', ':', '<', '>', '|', '\\'
    ];

    public string RemoteRenderPath => $"/v1/function-kits/{Id}/render";

    public FunctionKitSlashQuerySnapshot? ResolveSlashQuery(string text, int? caretIndex = null)
    {
        var token = ParseSlashToken(text, caretIndex);
        if (token is null)
        {
            return null;
        }

        var query = token.Query;
        if (string.IsNullOrWhiteSpace(query))
        {
            return token with
            {
                Matched = true,
                MatchKind = "browse",
                MatchedValue = string.Empty
            };
        }

        if (TryMatch(Discovery.Commands, query, out var commandKind, out var commandValue))
        {
            return token with
            {
                Matched = true,
                MatchKind = commandKind,
                MatchedValue = commandValue
            };
        }

        if (TryMatch(Discovery.Aliases, query, out var aliasKind, out var aliasValue))
        {
            return token with
            {
                Matched = true,
                MatchKind = aliasKind.Replace("command", "alias", StringComparison.Ordinal),
                MatchedValue = aliasValue
            };
        }

        if (TryMatch(Discovery.Tags, query, out var tagKind, out var tagValue))
        {
            return token with
            {
                Matched = true,
                MatchKind = tagKind.Replace("command", "tag", StringComparison.Ordinal),
                MatchedValue = tagValue
            };
        }

        foreach (var pattern in Discovery.RegexMatchers)
        {
            try
            {
                if (Regex.IsMatch(query, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
                {
                    return token with
                    {
                        Matched = true,
                        MatchKind = "regex",
                        MatchedValue = pattern
                    };
                }
            }
            catch
            {
                continue;
            }
        }

        if (!string.IsNullOrWhiteSpace(Name) &&
            Name.Contains(query, StringComparison.OrdinalIgnoreCase))
        {
            return token with
            {
                Matched = true,
                MatchKind = "name-substring",
                MatchedValue = Name
            };
        }

        if (!string.IsNullOrWhiteSpace(Description) &&
            Description.Contains(query, StringComparison.OrdinalIgnoreCase))
        {
            return token with
            {
                Matched = true,
                MatchKind = "description-substring",
                MatchedValue = Description
            };
        }

        return token;
    }

    public static FunctionKitManifestMetadata Load(
        string manifestPath,
        string functionKitRootPath,
        string? entryOverride = null)
    {
        var fallbackEntry = !string.IsNullOrWhiteSpace(entryOverride)
            ? Path.GetRelativePath(
                    functionKitRootPath,
                    ResolveLocalPath(functionKitRootPath, entryOverride))
                .Replace("\\", "/", StringComparison.Ordinal)
            : "function-kits/chat-auto-reply/ui/app/index.html";

        if (!File.Exists(manifestPath))
        {
            return new FunctionKitManifestMetadata(
                Id: "chat-auto-reply",
                Name: "Chat Auto Reply",
                Description: string.Empty,
                EntryRelativePath: fallbackEntry,
                RuntimePermissions: FallbackRuntimePermissions,
                FixturePaths: new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
                Discovery: new FunctionKitDiscoveryMetadata(
                    LaunchMode: "quick-action",
                    Commands: ["reply"],
                    Aliases: ["auto-reply", "chat-reply"],
                    Tags: ["chat", "message"],
                    RegexMatchers: []),
                Ai: new FunctionKitAiMetadata(
                    ExecutionMode: "local-demo",
                    BackendHints: new FunctionKitAiBackendHints(
                        PreferredBackendClass: null,
                        PreferredAdapter: null,
                        LatencyTier: null,
                        LatencyBudgetMs: null,
                        RequireStructuredJson: false,
                        RequiredCapabilities: [],
                        Notes: [])));
        }

        var json = File.ReadAllText(manifestPath, new UTF8Encoding(false));
        var root = JsonNode.Parse(json)?.AsObject()
                   ?? throw new InvalidOperationException($"Invalid manifest JSON: {manifestPath}");
        var manifestDirectory = Path.GetDirectoryName(manifestPath) ?? functionKitRootPath;

        var id = root["id"]?.GetValue<string>()?.Trim();
        var name = root["name"]?.GetValue<string>()?.Trim();
        var description = root["description"]?.GetValue<string>()?.Trim() ?? string.Empty;

        var entryRelativePath = fallbackEntry;
        if (string.IsNullOrWhiteSpace(entryOverride))
        {
            var htmlPath = root["entry"]?["bundle"]?["html"]?.GetValue<string>()?.Trim();
            if (!string.IsNullOrWhiteSpace(htmlPath))
            {
                var absoluteHtmlPath = Path.GetFullPath(Path.Combine(manifestDirectory, htmlPath));
                entryRelativePath = Path.GetRelativePath(functionKitRootPath, absoluteHtmlPath)
                    .Replace("\\", "/", StringComparison.Ordinal);
            }
        }

        var fixturePaths = LoadFixturePaths(root, manifestDirectory, functionKitRootPath);
        var runtimePermissions = ReadDistinctStringList(root["runtimePermissions"]);
        if (runtimePermissions.Count == 0)
        {
            runtimePermissions = FallbackRuntimePermissions;
        }

        var discoveryNode = root["discovery"]?.AsObject();
        var slashNode = discoveryNode?["slash"]?.AsObject();
        var aiNode = root["ai"]?.AsObject();
        var backendHintsNode = aiNode?["backendHints"]?.AsObject();

        return new FunctionKitManifestMetadata(
            Id: string.IsNullOrWhiteSpace(id) ? "chat-auto-reply" : id,
            Name: string.IsNullOrWhiteSpace(name) ? "Chat Auto Reply" : name,
            Description: description,
            EntryRelativePath: entryRelativePath,
            RuntimePermissions: runtimePermissions,
            FixturePaths: fixturePaths,
            Discovery: new FunctionKitDiscoveryMetadata(
                LaunchMode: discoveryNode?["launchMode"]?.GetValue<string>()?.Trim() ?? "panel-first",
                Commands: NormalizeSlashTokens(ReadDistinctStringList(slashNode?["commands"])),
                Aliases: NormalizeSlashTokens(ReadDistinctStringList(slashNode?["aliases"])),
                Tags: NormalizeSlashTokens(ReadDistinctStringList(slashNode?["tags"])),
                RegexMatchers: ReadRegexMatchers(slashNode?["matchers"])),
            Ai: new FunctionKitAiMetadata(
                ExecutionMode: aiNode?["executionMode"]?.GetValue<string>()?.Trim() ?? "local-demo",
                BackendHints: new FunctionKitAiBackendHints(
                    PreferredBackendClass: backendHintsNode?["preferredBackendClass"]?.GetValue<string>()?.Trim(),
                    PreferredAdapter: backendHintsNode?["preferredAdapter"]?.GetValue<string>()?.Trim(),
                    LatencyTier: backendHintsNode?["latencyTier"]?.GetValue<string>()?.Trim(),
                    LatencyBudgetMs: ReadNullableInt(backendHintsNode?["latencyBudgetMs"]),
                    RequireStructuredJson: backendHintsNode?["requireStructuredJson"]?.GetValue<bool>() ?? false,
                    RequiredCapabilities: ReadDistinctStringList(backendHintsNode?["requiredCapabilities"]),
                    Notes: ReadDistinctStringList(backendHintsNode?["notes"]))));
    }

    private static FunctionKitSlashQuerySnapshot? ParseSlashToken(string text, int? caretIndex)
    {
        if (string.IsNullOrEmpty(text))
        {
            return null;
        }

        var normalizedCaret = Math.Clamp(caretIndex ?? text.Length, 0, text.Length);
        var tokenStart = normalizedCaret;
        while (tokenStart > 0 && !IsSeparator(text[tokenStart - 1]))
        {
            tokenStart -= 1;
        }

        var tokenEnd = normalizedCaret;
        while (tokenEnd < text.Length && !IsSeparator(text[tokenEnd]))
        {
            tokenEnd += 1;
        }

        var rawToken = text[tokenStart..tokenEnd];
        if (!rawToken.StartsWith("/", StringComparison.Ordinal))
        {
            return null;
        }

        if (tokenStart > 0 && !IsSeparator(text[tokenStart - 1]))
        {
            return null;
        }

        var rawQuery = rawToken[1..];
        if (rawToken.StartsWith("//", StringComparison.Ordinal) || rawQuery.Contains('/', StringComparison.Ordinal))
        {
            return null;
        }

        if (rawQuery.Any(character => !IsCommandCharacter(character)))
        {
            return null;
        }

        var normalizedQuery = NormalizeSlashToken(rawQuery);
        return new FunctionKitSlashQuerySnapshot(
            Active: true,
            Mode: normalizedQuery.Length == 0 ? "slash-detecting" : "slash-searching",
            Raw: rawToken,
            Query: normalizedQuery,
            Matched: false,
            MatchKind: null,
            MatchedValue: null);
    }

    private static bool TryMatch(
        IReadOnlyList<string> candidates,
        string query,
        out string kind,
        out string matchedValue)
    {
        var exact = candidates.FirstOrDefault(value => string.Equals(value, query, StringComparison.Ordinal));
        if (!string.IsNullOrWhiteSpace(exact))
        {
            kind = "command-exact";
            matchedValue = exact;
            return true;
        }

        var prefix = candidates.FirstOrDefault(value => value.StartsWith(query, StringComparison.Ordinal));
        if (!string.IsNullOrWhiteSpace(prefix))
        {
            kind = "command-prefix";
            matchedValue = prefix;
            return true;
        }

        kind = string.Empty;
        matchedValue = string.Empty;
        return false;
    }

    private static IReadOnlyDictionary<string, string> LoadFixturePaths(
        JsonObject root,
        string manifestDirectory,
        string functionKitRootPath)
    {
        var fixturePaths = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        AddFixturePaths(root, "tests", fixturePaths, manifestDirectory, functionKitRootPath);
        AddFixturePaths(root, "hostBridge", fixturePaths, manifestDirectory, functionKitRootPath);
        return fixturePaths;
    }

    private static void AddFixturePaths(
        JsonObject root,
        string sectionName,
        IDictionary<string, string> fixturePaths,
        string manifestDirectory,
        string functionKitRootPath)
    {
        if (root[sectionName] is not JsonObject sectionNode ||
            sectionNode["fixtures"] is not JsonArray fixturesNode)
        {
            return;
        }

        foreach (var item in fixturesNode)
        {
            var relativePath = item?.GetValue<string>()?.Trim();
            if (string.IsNullOrWhiteSpace(relativePath))
            {
                continue;
            }

            var absolutePath = Path.GetFullPath(Path.Combine(manifestDirectory, relativePath));
            if (!File.Exists(absolutePath) || !IsPathUnderRoot(absolutePath, functionKitRootPath))
            {
                continue;
            }

            fixturePaths[Path.GetFileName(absolutePath)] = absolutePath;
        }
    }

    private static IReadOnlyList<string> ReadDistinctStringList(JsonNode? node)
    {
        if (node is not JsonArray array)
        {
            return [];
        }

        var values = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in array)
        {
            var text = item?.GetValue<string>()?.Trim();
            if (string.IsNullOrWhiteSpace(text) || !seen.Add(text))
            {
                continue;
            }

            values.Add(text);
        }

        return values;
    }

    private static IReadOnlyList<string> NormalizeSlashTokens(IReadOnlyList<string> values)
    {
        var normalized = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var value in values)
        {
            var token = NormalizeSlashToken(value);
            if (string.IsNullOrWhiteSpace(token) || !seen.Add(token))
            {
                continue;
            }

            normalized.Add(token);
        }

        return normalized;
    }

    private static IReadOnlyList<string> ReadRegexMatchers(JsonNode? node)
    {
        if (node is not JsonArray array)
        {
            return [];
        }

        var patterns = new List<string>();
        foreach (var item in array)
        {
            if (item is not JsonObject matcherNode)
            {
                continue;
            }

            var pattern = matcherNode["pattern"]?.GetValue<string>()?.Trim();
            if (!string.IsNullOrWhiteSpace(pattern))
            {
                patterns.Add(pattern);
            }
        }

        return patterns;
    }

    private static int? ReadNullableInt(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        try
        {
            return node.GetValue<int>();
        }
        catch
        {
            return null;
        }
    }

    private static string NormalizeSlashToken(string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : value.Trim().TrimStart('/').ToLowerInvariant();
    }

    private static bool IsSeparator(char character)
    {
        return char.IsWhiteSpace(character) || SeparatorCharacters.Contains(character);
    }

    private static bool IsCommandCharacter(char character)
    {
        return char.IsLetterOrDigit(character) || character is '_' or '-';
    }

    private static string ResolveLocalPath(string functionKitRootPath, string relativeOrAbsolutePath)
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
