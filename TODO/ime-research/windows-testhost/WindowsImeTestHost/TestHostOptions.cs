namespace WindowsImeTestHost;

internal sealed record TestHostOptions(
    bool SmokeMode,
    string? SnapshotPath,
    string? LiveSnapshotPath,
    string? StartupFocusTarget,
    bool DisableFunctionKit,
    bool FunctionKitContractTest,
    string? FunctionKitContractResultPath,
    string? FunctionKitRoot,
    string? FunctionKitEntry,
    string? FunctionKitManifest,
    string? FunctionKitStoragePath)
{
    public static TestHostOptions Parse(string[] args)
    {
        var smokeMode = false;
        string? snapshotPath = null;
        string? liveSnapshotPath = null;
        string? startupFocusTarget = null;
        var disableFunctionKit = false;
        var functionKitContractTest = false;
        string? functionKitContractResultPath = null;
        string? functionKitRoot = null;
        string? functionKitEntry = null;
        string? functionKitManifest = null;
        string? functionKitStoragePath = null;

        for (var index = 0; index < args.Length; index++)
        {
            var current = args[index];
            switch (current)
            {
                case "--smoke":
                    smokeMode = true;
                    break;
                case "--snapshot-file":
                    if (index + 1 >= args.Length)
                    {
                        throw new ArgumentException("Missing value for --snapshot-file.");
                    }

                    snapshotPath = args[++index];
                    break;
                case "--live-snapshot-file":
                    if (index + 1 >= args.Length)
                    {
                        throw new ArgumentException("Missing value for --live-snapshot-file.");
                    }

                    liveSnapshotPath = args[++index];
                    break;
                case "--startup-focus":
                    if (index + 1 >= args.Length)
                    {
                        throw new ArgumentException("Missing value for --startup-focus.");
                    }

                    startupFocusTarget = args[++index];
                    break;
                case "--disable-function-kit":
                    disableFunctionKit = true;
                    break;
                case "--function-kit-contract-test":
                    functionKitContractTest = true;
                    break;
                case "--function-kit-contract-result-file":
                    if (index + 1 >= args.Length)
                    {
                        throw new ArgumentException("Missing value for --function-kit-contract-result-file.");
                    }

                    functionKitContractResultPath = args[++index];
                    break;
                case "--function-kit-root":
                    if (index + 1 >= args.Length)
                    {
                        throw new ArgumentException("Missing value for --function-kit-root.");
                    }

                    functionKitRoot = args[++index];
                    break;
                case "--function-kit-entry":
                    if (index + 1 >= args.Length)
                    {
                        throw new ArgumentException("Missing value for --function-kit-entry.");
                    }

                    functionKitEntry = args[++index];
                    break;
                case "--function-kit-manifest":
                    if (index + 1 >= args.Length)
                    {
                        throw new ArgumentException("Missing value for --function-kit-manifest.");
                    }

                    functionKitManifest = args[++index];
                    break;
                case "--function-kit-storage-file":
                    if (index + 1 >= args.Length)
                    {
                        throw new ArgumentException("Missing value for --function-kit-storage-file.");
                    }

                    functionKitStoragePath = args[++index];
                    break;
                default:
                    throw new ArgumentException($"Unsupported argument: {current}");
            }
        }

        return new TestHostOptions(
            smokeMode,
            snapshotPath,
            liveSnapshotPath,
            startupFocusTarget,
            disableFunctionKit,
            functionKitContractTest,
            functionKitContractResultPath,
            functionKitRoot,
            functionKitEntry,
            functionKitManifest,
            functionKitStoragePath);
    }
}
