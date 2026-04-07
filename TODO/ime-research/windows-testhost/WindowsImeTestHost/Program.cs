namespace WindowsImeTestHost;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        TestHostOptions options;
        try
        {
            options = TestHostOptions.Parse(args);
        }
        catch (ArgumentException ex)
        {
            MessageBox.Show(ex.Message, "Windows IME TestHost", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 2;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm(options));
        return 0;
    }
}
