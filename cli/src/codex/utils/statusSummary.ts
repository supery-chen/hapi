function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export type CodexUsageSummary = {
    totalTokens: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    modelContextWindow: number | null;
    contextUsedTokens: number;
    contextLeftPercent: number | null;
};

function roundToSingleDecimal(value: number): number {
    return Math.round(value * 10) / 10;
}

export function formatCompactNumber(value: number): string {
    const absValue = Math.abs(value);
    if (absValue >= 1_000_000_000) {
        return `${roundToSingleDecimal(value / 1_000_000_000)}B`;
    }
    if (absValue >= 1_000_000) {
        return `${roundToSingleDecimal(value / 1_000_000)}M`;
    }
    if (absValue >= 1_000) {
        return `${roundToSingleDecimal(value / 1_000)}K`;
    }
    return String(value);
}

export function extractCodexUsageSummary(tokenUsage: Record<string, unknown> | null): CodexUsageSummary | null {
    if (!tokenUsage) {
        return null;
    }

    const nested = asRecord(tokenUsage.total)
        ?? asRecord(tokenUsage.last)
        ?? asRecord(tokenUsage.total_token_usage)
        ?? asRecord(tokenUsage.last_token_usage);
    const source = nested ?? tokenUsage;

    const inputTokens = asNumber(source.inputTokens ?? source.input_tokens);
    const outputTokens = asNumber(source.outputTokens ?? source.output_tokens);
    const totalTokens = asNumber(source.totalTokens ?? source.total_tokens)
        ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);

    if (inputTokens === null || outputTokens === null || totalTokens === null) {
        return null;
    }

    const cachedInputTokens = asNumber(source.cachedInputTokens ?? source.cached_input_tokens ?? source.cache_read_input_tokens) ?? 0;
    const reasoningOutputTokens = asNumber(source.reasoningOutputTokens ?? source.reasoning_output_tokens) ?? 0;
    const modelContextWindow = asNumber(tokenUsage.modelContextWindow ?? tokenUsage.model_context_window);
    const contextUsedTokens = Math.max(0, inputTokens - cachedInputTokens + outputTokens);
    const contextLeftPercent = modelContextWindow && modelContextWindow > 0
        ? Math.max(0, Math.min(100, Math.round(((modelContextWindow - contextUsedTokens) / modelContextWindow) * 100)))
        : null;

    return {
        totalTokens,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        reasoningOutputTokens,
        modelContextWindow,
        contextUsedTokens,
        contextLeftPercent
    };
}
