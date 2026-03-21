import { describe, expect, it } from 'vitest';
import { extractCodexUsageSummary, formatCompactNumber } from './statusSummary';

describe('statusSummary', () => {
    it('formats compact numbers', () => {
        expect(formatCompactNumber(466)).toBe('466');
        expect(formatCompactNumber(13_400)).toBe('13.4K');
        expect(formatCompactNumber(950_000)).toBe('950K');
    });

    it('extracts nested token usage summary and computes context usage', () => {
        const summary = extractCodexUsageSummary({
            total: {
                totalTokens: 13_400,
                inputTokens: 12_934,
                cachedInputTokens: 1_174,
                outputTokens: 466,
                reasoningOutputTokens: 111
            },
            last: {
                totalTokens: 1_000,
                inputTokens: 900,
                cachedInputTokens: 100,
                outputTokens: 100
            },
            modelContextWindow: 950_000
        });

        expect(summary).toEqual({
            totalTokens: 13_400,
            inputTokens: 12_934,
            cachedInputTokens: 1_174,
            outputTokens: 466,
            reasoningOutputTokens: 111,
            modelContextWindow: 950_000,
            contextUsedTokens: 12_226,
            contextLeftPercent: 99
        });
    });

    it('falls back to flat token usage payloads', () => {
        const summary = extractCodexUsageSummary({
            input_tokens: 120,
            output_tokens: 30,
            cache_read_input_tokens: 50
        });

        expect(summary).toEqual({
            totalTokens: 150,
            inputTokens: 120,
            cachedInputTokens: 50,
            outputTokens: 30,
            reasoningOutputTokens: 0,
            modelContextWindow: null,
            contextUsedTokens: 100,
            contextLeftPercent: null
        });
    });

    it('extracts legacy local codex token_count payloads', () => {
        const summary = extractCodexUsageSummary({
            total_token_usage: {
                input_tokens: 12_934,
                cached_input_tokens: 1_174,
                output_tokens: 466,
                reasoning_output_tokens: 111,
                total_tokens: 13_400
            },
            last_token_usage: {
                input_tokens: 900,
                cached_input_tokens: 100,
                output_tokens: 100,
                reasoning_output_tokens: 80,
                total_tokens: 1_000
            },
            model_context_window: 950_000
        });

        expect(summary).toEqual({
            totalTokens: 13_400,
            inputTokens: 12_934,
            cachedInputTokens: 1_174,
            outputTokens: 466,
            reasoningOutputTokens: 111,
            modelContextWindow: 950_000,
            contextUsedTokens: 12_226,
            contextLeftPercent: 99
        });
    });
});
