namespace WindowsFunctionKitHost;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        var options = FunctionKitHostOptions.Parse(args);
        Application.Run(new MainForm(options));
    }
}
