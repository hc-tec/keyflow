using System.Text.Json.Serialization;

namespace WindowsImeTestHost;

internal sealed record HostSnapshot(
    [property: JsonPropertyName("generated_at")] string GeneratedAt,
    [property: JsonPropertyName("active_host")] string ActiveHost,
    [property: JsonPropertyName("active_web_element")] string ActiveWebElement,
    [property: JsonPropertyName("last_focus_request")] string LastFocusRequest,
    [property: JsonPropertyName("form_contains_focus")] bool FormContainsFocus,
    [property: JsonPropertyName("active_control_name")] string ActiveControlName,
    [property: JsonPropertyName("last_commit_target")] string LastCommitTarget,
    [property: JsonPropertyName("last_key_event")] string LastKeyEvent,
    [property: JsonPropertyName("key_event_count")] int KeyEventCount,
    [property: JsonPropertyName("browser_ready")] bool BrowserReady,
    [property: JsonPropertyName("function_kit_enabled")] bool FunctionKitEnabled,
    [property: JsonPropertyName("function_kit_ready")] bool FunctionKitReady,
    [property: JsonPropertyName("function_kit_session_id")] string FunctionKitSessionId,
    [property: JsonPropertyName("function_kit_entry")] string FunctionKitEntry,
    [property: JsonPropertyName("function_kit_storage_file")] string FunctionKitStorageFile,
    [property: JsonPropertyName("function_kit_last_message_type")] string FunctionKitLastMessageType,
    [property: JsonPropertyName("function_kit_last_error")] string FunctionKitLastError,
    [property: JsonPropertyName("single_line_text")] string SingleLineText,
    [property: JsonPropertyName("multi_line_text")] string MultiLineText,
    [property: JsonPropertyName("rich_text")] string RichText,
    [property: JsonPropertyName("web_input_text")] string WebInputText,
    [property: JsonPropertyName("web_textarea_text")] string WebTextareaText,
    [property: JsonPropertyName("web_editor_text")] string WebEditorText
);
