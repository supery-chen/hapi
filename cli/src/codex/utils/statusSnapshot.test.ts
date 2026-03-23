import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { formatCodexStatusMarkdown, readCodexRolloutStatusFallback } from './statusSnapshot'

describe('statusSnapshot', () => {
    let sandboxDir: string
    let originalCodexHome: string | undefined

    beforeEach(async () => {
        sandboxDir = await mkdtemp(join(tmpdir(), 'hapi-status-'))
        originalCodexHome = process.env.CODEX_HOME
        process.env.CODEX_HOME = sandboxDir
    })

    afterEach(async () => {
        if (originalCodexHome === undefined) {
            delete process.env.CODEX_HOME
        } else {
            process.env.CODEX_HOME = originalCodexHome
        }
        await rm(sandboxDir, { recursive: true, force: true })
    })

    it('reads rollout fallback fields from codex session logs', async () => {
        const dayDir = join(sandboxDir, 'sessions', '2026', '03', '23')
        await mkdir(dayDir, { recursive: true })
        const filePath = join(dayDir, 'rollout-test-thr_123.jsonl')
        await writeFile(filePath, [
            JSON.stringify({ type: 'session_meta', payload: { id: 'thr_123', cwd: '/repo', model_provider: 'openai' } }),
            JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.4', model_reasoning_effort: 'high' } }),
            JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total: { totalTokens: 100, inputTokens: 80, outputTokens: 20 }, last: { totalTokens: 12, inputTokens: 10, outputTokens: 2 }, modelContextWindow: 1000 } } })
        ].join('\n'))

        const fallback = await readCodexRolloutStatusFallback({
            threadId: 'thr_123',
            cwd: '/repo'
        })

        expect(fallback.sessionMeta?.id).toBe('thr_123')
        expect(fallback.turnContext?.model).toBe('gpt-5.4')
        expect(fallback.tokenCountInfo?.modelContextWindow).toBe(1000)
    })

    it('formats a rich markdown status report', () => {
        const markdown = formatCodexStatusMarkdown({
            threadId: 'thr_123',
            rolloutSessionId: 'thr_123',
            cliVersion: '0.1.0',
            model: {
                name: 'gpt-5.4',
                reasoningEffort: 'high',
                summary: 'auto'
            },
            modelProvider: {
                name: 'openai',
                endpoint: null,
                source: 'thread'
            },
            directory: '/repo',
            permissions: {
                sandbox: 'workspace-write',
                approvalPolicy: 'on-request',
                label: 'Custom (workspace-write, on-request)'
            },
            agentsMd: {
                exists: false,
                path: null
            },
            account: {
                mode: 'apiKey',
                label: 'API key configured'
            },
            collaborationMode: {
                mode: 'default'
            },
            tokenUsage: {
                total: 100,
                input: 80,
                output: 20,
                reasoning: 0,
                cachedInput: 0,
                last: {
                    total: 12,
                    input: 10,
                    output: 2
                }
            },
            contextWindow: {
                max: 1000,
                used: 10,
                remaining: 990,
                percentLeft: 99,
                formula: 'derived_from_last_input_tokens'
            },
            limits: {
                primary: null,
                secondary: null,
                label: 'data not available yet'
            },
            updatedAt: '2026-03-23T07:00:00.000Z'
        })

        expect(markdown).toContain('## Codex Status')
        expect(markdown).toContain('API key configured')
        expect(markdown).toContain('Model provider')
        expect(markdown).toContain('Context window')
    })
})
