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

function roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
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

    const total = asRecord(tokenUsage.total)
        ?? asRecord(tokenUsage.total_token_usage)
        ?? tokenUsage;
    const last = asRecord(tokenUsage.last)
        ?? asRecord(tokenUsage.last_token_usage);

    const inputTokens = asNumber(total.inputTokens ?? total.input_tokens);
    const outputTokens = asNumber(total.outputTokens ?? total.output_tokens);
    const totalTokens = asNumber(total.totalTokens ?? total.total_tokens)
        ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);

    if (inputTokens === null || outputTokens === null || totalTokens === null) {
        return null;
    }

    const cachedInputTokens = asNumber(total.cachedInputTokens ?? total.cached_input_tokens ?? total.cache_read_input_tokens) ?? 0;
    const reasoningOutputTokens = asNumber(total.reasoningOutputTokens ?? total.reasoning_output_tokens) ?? 0;
    const modelContextWindow = asNumber(tokenUsage.modelContextWindow ?? tokenUsage.model_context_window);

    // Keep the web header/status bar aligned with /status:
    // app-server `tokenUsage.total` is cumulative usage, not the current context occupancy.
    // The closer estimate for current context consumption is the latest turn input when present.
    const contextUsedTokens = asNumber(last?.inputTokens ?? last?.input_tokens)
        ?? inputTokens;
    const contextLeftPercent = modelContextWindow && modelContextWindow > 0
        ? Math.max(0, Math.min(100, roundToTwoDecimals(((modelContextWindow - contextUsedTokens) / modelContextWindow) * 100)))
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
