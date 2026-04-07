namespace WindowsFunctionKitHost;

internal sealed class ChatAutoReplyPreviewEngine
{
    private int _seed;

    public object BuildContextPayload(
        string sourceMessage,
        string conversationSummary,
        IReadOnlyList<string> personaChips,
        string preferredTone,
        IReadOnlyList<string> modifiers,
        object? manifest = null,
        object? routing = null)
    {
        return new
        {
            context = new
            {
                sourceMessage,
                conversationSummary,
                personaChips
            },
            request = new
            {
                preferredTone,
                modifiers
            },
            manifest,
            routing
        };
    }

    public object BuildRenderPayload(
        string sourceMessage,
        string conversationSummary,
        IReadOnlyList<string> personaChips,
        string preferredTone,
        IReadOnlyList<string> modifiers,
        object? manifest = null,
        object? routing = null)
    {
        var modifierText = string.Join("；", modifiers);
        var candidates = GetVariant(_seed, preferredTone, modifierText);
        _seed += 1;

        return new
        {
            requestContext = new
            {
                sourceMessage,
                conversationSummary,
                personaChips
            },
            result = new
            {
                candidates,
                missing_context = Array.Empty<string>()
            },
            uiHints = new
            {
                allowRegenerate = true
            },
            manifest,
            routing
        };
    }

    private static object[] GetVariant(int seed, string preferredTone, string modifierText)
    {
        var toneSuffix = preferredTone switch
        {
            "direct" => "（偏直接）",
            "warm" => "（偏温和）",
            _ => "（平衡）"
        };

        var variants = new[]
        {
            new[]
            {
                CreateCandidate("candidate-1", "收到，我先把第一版整理出来，今晚前发你过一遍。", $"稳妥{toneSuffix}", "low", "确认动作与时间，但不过度承诺。", modifierText),
                CreateCandidate("candidate-2", "明白，我先把结构和关键点收一下，整理好后发你确认。", $"中性{toneSuffix}", "low", "强调先收口方案，适合信息还不完整时使用。", modifierText),
                CreateCandidate("candidate-3", "行，我先出个第一版，你晚上看完我们再定下一步。", $"配合{toneSuffix}", "medium", "语气更口语化，但时间边界略弱。", modifierText)
            },
            new[]
            {
                CreateCandidate("candidate-4", "可以，我先把第一版框架收敛一下，今晚发你看。", $"直接{toneSuffix}", "low", "更短更直接，适合追求效率的工作沟通。", modifierText),
                CreateCandidate("candidate-5", "收到，我先整理到可 review 的程度，晚上同步给你。", $"平衡{toneSuffix}", "low", "兼顾时间边界与可交付状态。", modifierText),
                CreateCandidate("candidate-6", "明白，我先把要点收口，晚点发你过一眼。", $"轻量{toneSuffix}", "medium", "更轻一些，但时间节点没有完全钉死。", modifierText)
            },
            new[]
            {
                CreateCandidate("candidate-7", "好，我先整理第一版，今晚确认完细节就发你。", $"温和{toneSuffix}", "low", "保留确认动作，避免过度承诺。", modifierText),
                CreateCandidate("candidate-8", "收到，我先把结构搭好，晚上发你看是否需要补充。", $"协作{toneSuffix}", "low", "强调共同 review，适合同事协作。", modifierText),
                CreateCandidate("candidate-9", "可以，我先出一版，晚上你看完我们再决定下一步。", $"推进{toneSuffix}", "medium", "更强调后续推进，但即时承诺较弱。", modifierText)
            }
        };

        return variants[seed % variants.Length];
    }

    private static object CreateCandidate(
        string id,
        string text,
        string tone,
        string risk,
        string rationale,
        string modifierText)
    {
        var finalRationale = string.IsNullOrWhiteSpace(modifierText)
            ? rationale
            : $"{rationale} 已附加指令：{modifierText}";

        return new
        {
            id,
            text,
            tone,
            risk,
            rationale = finalRationale
        };
    }
}
