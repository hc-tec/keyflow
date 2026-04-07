namespace WindowsFunctionKitHost;

internal sealed record FunctionKitHostOptions(
    bool SmokeMode,
    bool PreviewOnly,
    string? SnapshotPath,
    string WorkspaceRoot,
    string KitId,
    string EntryRelativePath,
    string HostServiceBaseUrl,
    int HostServiceTimeoutSeconds)
{
    public string TodoRootPath => Path.Combine(WorkspaceRoot, "TODO");

    public string StoragePath =>
        Path.Combine(TodoRootPath, "ime-research", "logs", "20260321_windows_functionkit_host_storage.json");

    public static FunctionKitHostOptions Parse(string[] args)
    {
        var smokeMode = false;
        var previewOnly = false;
        string? snapshotPath = null;
        var workspaceRoot = Directory.GetCurrentDirectory();
        var kitId = "chat-auto-reply";
        var entryRelativePath = "function-kits/chat-auto-reply/ui/app/index.html";
        var hostServiceBaseUrl = "http://127.0.0.1:18789";
        var hostServiceTimeoutSeconds = 20;

        for (var index = 0; index < args.Length; index++)
        {
            var current = args[index];
            switch (current)
            {
                case "--smoke":
                    smokeMode = true;
                    break;
                case "--preview-only":
                    previewOnly = true;
                    break;
                case "--snapshot-file":
                    snapshotPath = ReadValue(args, ref index, "--snapshot-file");
                    break;
                case "--workspace-root":
                    workspaceRoot = ReadValue(args, ref index, "--workspace-root");
                    break;
                case "--kit-id":
                    kitId = ReadValue(args, ref index, "--kit-id");
                    break;
                case "--entry-relative-path":
                    entryRelativePath = ReadValue(args, ref index, "--entry-relative-path");
                    break;
                case "--host-service-base-url":
                    hostServiceBaseUrl = ReadValue(args, ref index, "--host-service-base-url");
                    break;
                case "--host-service-timeout-seconds":
                    hostServiceTimeoutSeconds = int.Parse(ReadValue(args, ref index, "--host-service-timeout-seconds"));
                    break;
                default:
                    throw new ArgumentException($"Unsupported argument: {current}");
            }
        }

        return new FunctionKitHostOptions(
            SmokeMode: smokeMode,
            PreviewOnly: previewOnly,
            SnapshotPath: snapshotPath,
            WorkspaceRoot: Path.GetFullPath(workspaceRoot),
            KitId: kitId,
            EntryRelativePath: entryRelativePath.Replace("\\", "/"),
            HostServiceBaseUrl: hostServiceBaseUrl,
            HostServiceTimeoutSeconds: hostServiceTimeoutSeconds);
    }

    private static string ReadValue(string[] args, ref int index, string optionName)
    {
        if (index + 1 >= args.Length)
        {
            throw new ArgumentException($"Missing value for {optionName}.");
        }

        return args[++index];
    }
}
