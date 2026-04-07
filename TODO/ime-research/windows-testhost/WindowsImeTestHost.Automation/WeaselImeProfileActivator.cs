using System.Runtime.InteropServices;

namespace WindowsImeTestHost.Automation;

internal static class WeaselImeProfileActivator
{
    private const uint TfProfileTypeInputProcessor = 0x00000001;
    private const uint TfIppmfEnableProfile = 0x00000001;
    private const uint TfIppmfDontCareCurrentInputLanguage = 0x00000004;
    private const uint TfIppmfForSession = 0x20000000;
    private const int HResultSFalse = 1;
    private const ushort LangIdChineseSimplified = 0x0804;

    private static readonly Guid InputProcessorProfilesClsid = new("33C53A50-F456-4884-B049-85FD643ECFED");
    private static readonly Guid KeyboardCategoryGuid = new("34745C63-B2F0-4784-8B67-5E12C8701A31");
    private static readonly Guid WeaselTextServiceClsid = new("A3F4CDED-B1E9-41EE-9CA6-7B4D0DE6CB0A");
    private static readonly Guid WeaselProfileGuid = new("3D02CAB6-2B8E-4781-BA20-1C9267529467");

    public static WeaselActivationSnapshot TryActivateForSession()
    {
        ITfInputProcessorProfileMgr? profileManager = null;

        try
        {
            var managerType = Type.GetTypeFromCLSID(InputProcessorProfilesClsid, throwOnError: true)!;
            profileManager = (ITfInputProcessorProfileMgr)Activator.CreateInstance(managerType)!;

            var before = TryGetActiveProfile(profileManager);
            var activateHr = profileManager.ActivateProfile(
                TfProfileTypeInputProcessor,
                LangIdChineseSimplified,
                WeaselTextServiceClsid,
                WeaselProfileGuid,
                IntPtr.Zero,
                TfIppmfDontCareCurrentInputLanguage | TfIppmfEnableProfile | TfIppmfForSession);

            var after = TryGetActiveProfile(profileManager);
            var succeeded = activateHr >= 0 && after?.MatchesWeasel == true;
            var message = succeeded
                ? "TSF session activation succeeded."
                : $"TSF session activation did not confirm Weasel. HRESULT=0x{activateHr:X8}.";

            return new WeaselActivationSnapshot(
                Succeeded: succeeded,
                HResultHex: $"0x{activateHr:X8}",
                Message: message,
                Before: before,
                After: after);
        }
        catch (Exception ex)
        {
            return new WeaselActivationSnapshot(
                Succeeded: false,
                HResultHex: null,
                Message: ex.Message,
                Before: null,
                After: null);
        }
        finally
        {
            if (profileManager is not null && Marshal.IsComObject(profileManager))
            {
                Marshal.ReleaseComObject(profileManager);
            }
        }
    }

    private static ActiveProfileSnapshot? TryGetActiveProfile(ITfInputProcessorProfileMgr profileManager)
    {
        var result = profileManager.GetActiveProfile(KeyboardCategoryGuid, out var profile);
        if (result == HResultSFalse)
        {
            return null;
        }

        if (result < 0)
        {
            return new ActiveProfileSnapshot(
                ProfileType: 0,
                LanguageIdHex: string.Empty,
                Clsid: Guid.Empty.ToString("D"),
                GuidProfile: Guid.Empty.ToString("D"),
                CategoryId: KeyboardCategoryGuid.ToString("D"),
                HklSubstituteHex: string.Empty,
                HklHex: string.Empty,
                FlagsHex: $"0x{result:X8}",
                MatchesWeasel: false);
        }

        return new ActiveProfileSnapshot(
            ProfileType: profile.dwProfileType,
            LanguageIdHex: $"0x{profile.langid:X4}",
            Clsid: profile.clsid.ToString("D"),
            GuidProfile: profile.guidProfile.ToString("D"),
            CategoryId: profile.catid.ToString("D"),
            HklSubstituteHex: $"0x{profile.hklSubstitute.ToInt64():X}",
            HklHex: $"0x{profile.hkl.ToInt64():X}",
            FlagsHex: $"0x{profile.dwFlags:X8}",
            MatchesWeasel: profile.clsid == WeaselTextServiceClsid && profile.guidProfile == WeaselProfileGuid);
    }

    internal sealed record WeaselActivationSnapshot(
        bool Succeeded,
        string? HResultHex,
        string Message,
        ActiveProfileSnapshot? Before,
        ActiveProfileSnapshot? After);

    internal sealed record ActiveProfileSnapshot(
        uint ProfileType,
        string LanguageIdHex,
        string Clsid,
        string GuidProfile,
        string CategoryId,
        string HklSubstituteHex,
        string HklHex,
        string FlagsHex,
        bool MatchesWeasel);

    [StructLayout(LayoutKind.Sequential)]
    private struct TF_INPUTPROCESSORPROFILE
    {
        public uint dwProfileType;
        public ushort langid;
        public Guid clsid;
        public Guid guidProfile;
        public Guid catid;
        public IntPtr hklSubstitute;
        public uint dwCaps;
        public IntPtr hkl;
        public uint dwFlags;
    }

    [ComImport]
    [Guid("71C6E74C-0F28-11D8-A82A-00065B84435C")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ITfInputProcessorProfileMgr
    {
        [PreserveSig]
        int ActivateProfile(
            uint dwProfileType,
            ushort langid,
            [MarshalAs(UnmanagedType.LPStruct)] Guid clsid,
            [MarshalAs(UnmanagedType.LPStruct)] Guid guidProfile,
            IntPtr hkl,
            uint dwFlags);

        [PreserveSig]
        int DeactivateProfile(
            uint dwProfileType,
            ushort langid,
            [MarshalAs(UnmanagedType.LPStruct)] Guid clsid,
            [MarshalAs(UnmanagedType.LPStruct)] Guid guidProfile,
            IntPtr hkl,
            uint dwFlags);

        [PreserveSig]
        int GetProfile(
            uint dwProfileType,
            ushort langid,
            [MarshalAs(UnmanagedType.LPStruct)] Guid clsid,
            [MarshalAs(UnmanagedType.LPStruct)] Guid guidProfile,
            IntPtr hkl,
            out TF_INPUTPROCESSORPROFILE profile);

        [PreserveSig]
        int EnumProfiles(ushort langid, out IntPtr enumProfiles);

        [PreserveSig]
        int ReleaseInputProcessor(
            [MarshalAs(UnmanagedType.LPStruct)] Guid rclsid,
            uint dwFlags);

        [PreserveSig]
        int RegisterProfile(
            [MarshalAs(UnmanagedType.LPStruct)] Guid rclsid,
            ushort langid,
            [MarshalAs(UnmanagedType.LPStruct)] Guid guidProfile,
            [MarshalAs(UnmanagedType.LPWStr)] string description,
            uint descriptionLength,
            [MarshalAs(UnmanagedType.LPWStr)] string iconFile,
            uint iconFileLength,
            uint iconIndex,
            IntPtr hklSubstitute,
            uint preferredLayout,
            [MarshalAs(UnmanagedType.Bool)] bool enabledByDefault,
            uint dwFlags);

        [PreserveSig]
        int UnregisterProfile(
            [MarshalAs(UnmanagedType.LPStruct)] Guid rclsid,
            ushort langid,
            [MarshalAs(UnmanagedType.LPStruct)] Guid guidProfile,
            uint dwFlags);

        [PreserveSig]
        int GetActiveProfile(
            [MarshalAs(UnmanagedType.LPStruct)] Guid catid,
            out TF_INPUTPROCESSORPROFILE profile);
    }
}
