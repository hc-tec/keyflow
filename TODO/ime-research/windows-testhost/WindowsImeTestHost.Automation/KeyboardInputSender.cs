namespace WindowsImeTestHost.Automation;

internal static class KeyboardInputSender
{
    private const uint KeyEventFKeyUp = 0x0002;

    public static void TypeAsciiText(string text, int delayMs)
    {
        foreach (var character in text)
        {
            TapVirtualKey(ToVirtualKey(character));
            Thread.Sleep(delayMs);
        }
    }

    public static void TapSpace(int delayMs)
    {
        TapVirtualKey(0x20);
        Thread.Sleep(delayMs);
    }

    public static void TapNumber1(int delayMs)
    {
        TapVirtualKey(0x31);
        Thread.Sleep(delayMs);
    }

    public static void TapShift(int delayMs)
    {
        TapVirtualKey(0x10);
        Thread.Sleep(delayMs);
    }

    private static void TapVirtualKey(ushort virtualKey)
    {
        keybd_event((byte)virtualKey, 0, 0, UIntPtr.Zero);
        keybd_event((byte)virtualKey, 0, KeyEventFKeyUp, UIntPtr.Zero);
    }

    private static ushort ToVirtualKey(char character)
    {
        return character switch
        {
            >= 'a' and <= 'z' => (ushort)char.ToUpperInvariant(character),
            >= 'A' and <= 'Z' => (ushort)character,
            >= '0' and <= '9' => (ushort)character,
            ' ' => 0x20,
            _ => throw new NotSupportedException($"Unsupported character for SendInput path: {character}")
        };
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
