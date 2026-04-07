namespace WindowsImeTestHost.Automation;

internal sealed record AutomationSettings(
    string TestHostExePath,
    string ResultPath,
    string Pinyin,
    string ExpectedText,
    string StartupFocusTarget,
    int LaunchTimeoutSeconds,
    int KeystrokeDelayMs,
    int CompositionDelayMs,
    int CommitDelayMs,
    bool ActivateWeasel,
    bool CloseHostOnFinish)
{
    public static AutomationSettings Parse(string[] args)
    {
        string? testHostExePath = null;
        string? resultPath = null;
        var pinyin = "nihao";
        var expectedText = "你好";
        var startupFocusTarget = "single-line";
        var launchTimeoutSeconds = 20;
        var keystrokeDelayMs = 120;
        var compositionDelayMs = 450;
        var commitDelayMs = 900;
        var activateWeasel = true;
        var closeHostOnFinish = true;

        for (var index = 0; index < args.Length; index++)
        {
            var current = args[index];
            switch (current)
            {
                case "--testhost-exe":
                    testHostExePath = ReadValue(args, ref index, current);
                    break;
                case "--result-file":
                    resultPath = ReadValue(args, ref index, current);
                    break;
                case "--pinyin":
                    pinyin = ReadValue(args, ref index, current);
                    break;
                case "--expected-text":
                    expectedText = ReadValue(args, ref index, current);
                    break;
                case "--startup-focus-target":
                    startupFocusTarget = ReadValue(args, ref index, current);
                    break;
                case "--launch-timeout-seconds":
                    launchTimeoutSeconds = ParsePositiveInt(ReadValue(args, ref index, current), current);
                    break;
                case "--keystroke-delay-ms":
                    keystrokeDelayMs = ParsePositiveInt(ReadValue(args, ref index, current), current);
                    break;
                case "--composition-delay-ms":
                    compositionDelayMs = ParsePositiveInt(ReadValue(args, ref index, current), current);
                    break;
                case "--commit-delay-ms":
                    commitDelayMs = ParsePositiveInt(ReadValue(args, ref index, current), current);
                    break;
                case "--no-activate-weasel":
                    activateWeasel = false;
                    break;
                case "--keep-host-open":
                    closeHostOnFinish = false;
                    break;
                default:
                    throw new ArgumentException($"Unsupported argument: {current}");
            }
        }

        if (string.IsNullOrWhiteSpace(testHostExePath))
        {
            throw new ArgumentException("Missing required argument: --testhost-exe");
        }

        if (string.IsNullOrWhiteSpace(resultPath))
        {
            throw new ArgumentException("Missing required argument: --result-file");
        }

        return new AutomationSettings(
            TestHostExePath: Path.GetFullPath(testHostExePath),
            ResultPath: Path.GetFullPath(resultPath),
            Pinyin: pinyin,
            ExpectedText: expectedText,
            StartupFocusTarget: startupFocusTarget,
            LaunchTimeoutSeconds: launchTimeoutSeconds,
            KeystrokeDelayMs: keystrokeDelayMs,
            CompositionDelayMs: compositionDelayMs,
            CommitDelayMs: commitDelayMs,
            ActivateWeasel: activateWeasel,
            CloseHostOnFinish: closeHostOnFinish);
    }

    private static string ReadValue(string[] args, ref int index, string argumentName)
    {
        if (index + 1 >= args.Length)
        {
            throw new ArgumentException($"Missing value for {argumentName}");
        }

        return args[++index];
    }

    private static int ParsePositiveInt(string value, string argumentName)
    {
        if (!int.TryParse(value, out var parsed) || parsed <= 0)
        {
            throw new ArgumentException($"{argumentName} expects a positive integer, got: {value}");
        }

        return parsed;
    }
}
