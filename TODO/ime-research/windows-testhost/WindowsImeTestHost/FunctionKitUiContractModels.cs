using System.Text.Json.Serialization;

namespace WindowsImeTestHost;

internal sealed record FunctionKitUiStatusSnapshot(
    [property: JsonPropertyName("state")] string State,
    [property: JsonPropertyName("text")] string Text);

internal sealed record FunctionKitUiActionSnapshot(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("label")] string Label);

internal sealed record FunctionKitUiCandidateSnapshot(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("risk")] string Risk,
    [property: JsonPropertyName("actions")] IReadOnlyList<FunctionKitUiActionSnapshot> Actions);

internal sealed record FunctionKitUiSnapshot(
    [property: JsonPropertyName("surface")] string Surface,
    [property: JsonPropertyName("status")] FunctionKitUiStatusSnapshot Status,
    [property: JsonPropertyName("sourceMessage")] string SourceMessage,
    [property: JsonPropertyName("personaChips")] IReadOnlyList<string> PersonaChips,
    [property: JsonPropertyName("candidateCount")] int CandidateCount,
    [property: JsonPropertyName("firstCandidate")] FunctionKitUiCandidateSnapshot? FirstCandidate,
    [property: JsonPropertyName("availableCommands")] IReadOnlyList<string> AvailableCommands);

internal sealed record FunctionKitUiContractResult(
    [property: JsonPropertyName("generated_at")] string GeneratedAt,
    [property: JsonPropertyName("kit_id")] string KitId,
    [property: JsonPropertyName("render_fixture_path")] string? RenderFixturePath,
    [property: JsonPropertyName("expected_snapshot_path")] string? ExpectedSnapshotPath,
    [property: JsonPropertyName("render_snapshot_matched")] bool RenderSnapshotMatched,
    [property: JsonPropertyName("candidate_insert_observed")] bool CandidateInsertObserved,
    [property: JsonPropertyName("permission_denied_handled")] bool PermissionDeniedHandled,
    [property: JsonPropertyName("bridge_error_handled")] bool BridgeErrorHandled,
    [property: JsonPropertyName("failure_reason")] string? FailureReason,
    [property: JsonPropertyName("after_render")] FunctionKitUiSnapshot? AfterRender,
    [property: JsonPropertyName("expected_render")] FunctionKitUiSnapshot? ExpectedRender,
    [property: JsonPropertyName("after_permission_denied")] FunctionKitUiSnapshot? AfterPermissionDenied,
    [property: JsonPropertyName("after_bridge_error")] FunctionKitUiSnapshot? AfterBridgeError,
    [property: JsonPropertyName("commit_target_after_insert")] string CommitTargetAfterInsert);
