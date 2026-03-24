import { access, readFile, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, normalize, resolve } from 'node:path'
import type { CodexStatusSnapshot } from '@hapi/protocol/types'
import packageJson from '../../../package.json'
import type { CodexSession } from '../session'
import type { CodexAppServerClient } from '../codexAppServerClient'
import { formatCompactNumber } from './statusSummary'

type RecordLike = Record<string, unknown>

type RolloutMatchType = 'thread' | 'cwd' | 'none'

type RolloutFallback = {
    sessionMeta: RecordLike | null
    turnContext: RecordLike | null
    tokenCountInfo: RecordLike | null
    matchType: RolloutMatchType
}

function asRecord(value: unknown): RecordLike | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    return value as RecordLike
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizePath(value: string): string {
    return normalize(resolve(value))
}

function extractTokenUsage(raw: RecordLike | null): CodexStatusSnapshot['tokenUsage'] & {
    modelContextWindow: number | null
} {
    if (!raw) {
        return {
            total: null,
            input: null,
            output: null,
            reasoning: null,
            cachedInput: null,
            last: null,
            modelContextWindow: null
        }
    }

    const total = asRecord(raw.total)
        ?? asRecord(raw.total_token_usage)
        ?? raw
    const last = asRecord(raw.last)
        ?? asRecord(raw.last_token_usage)

    const totalInput = asNumber(total.inputTokens ?? total.input_tokens)
    const totalOutput = asNumber(total.outputTokens ?? total.output_tokens)
    const totalTokens = asNumber(total.totalTokens ?? total.total_tokens)
        ?? (totalInput !== null && totalOutput !== null ? totalInput + totalOutput : null)
    const cachedInput = asNumber(total.cachedInputTokens ?? total.cached_input_tokens ?? total.cache_read_input_tokens)
    const reasoning = asNumber(total.reasoningOutputTokens ?? total.reasoning_output_tokens)

    const lastInput = last ? asNumber(last.inputTokens ?? last.input_tokens) : null
    const lastOutput = last ? asNumber(last.outputTokens ?? last.output_tokens) : null
    const lastTotal = last
        ? asNumber(last.totalTokens ?? last.total_tokens)
            ?? (lastInput !== null && lastOutput !== null ? lastInput + lastOutput : null)
        : null

    return {
        total: totalTokens,
        input: totalInput,
        output: totalOutput,
        reasoning,
        cachedInput,
        last: last
            ? {
                total: lastTotal,
                input: lastInput,
                output: lastOutput
            }
            : null,
        modelContextWindow: asNumber(raw.modelContextWindow ?? raw.model_context_window)
    }
}

function buildContextWindow(tokenUsage: ReturnType<typeof extractTokenUsage>): CodexStatusSnapshot['contextWindow'] {
    const max = tokenUsage.modelContextWindow
    const used = tokenUsage.last?.input ?? tokenUsage.input
    const remaining = max !== null && used !== null ? Math.max(0, max - used) : null
    const percentLeft = max !== null && remaining !== null && max > 0
        ? Math.round((remaining / max) * 10000) / 100
        : null

    return {
        max,
        used,
        remaining,
        percentLeft,
        formula: max !== null && used !== null ? 'derived_from_last_input_tokens' : null
    }
}

function buildPermissions(session: CodexSession): CodexStatusSnapshot['permissions'] {
    const permissionMode = session.getPermissionMode() ?? null
    const sandbox = permissionMode === 'read-only'
        ? 'read-only'
        : permissionMode === 'yolo'
            ? 'danger-full-access'
            : 'workspace-write'
    const approvalPolicy = permissionMode === 'yolo'
        ? 'never'
        : permissionMode === 'safe-yolo'
            ? 'on-failure'
            : 'on-request'

    return {
        sandbox,
        approvalPolicy,
        label: `Custom (${sandbox}, ${approvalPolicy})`
    }
}

async function detectAgentsMd(cwd: string): Promise<CodexStatusSnapshot['agentsMd']> {
    const path = join(cwd, 'AGENTS.md')
    try {
        await access(path)
        return { exists: true, path }
    } catch {
        return { exists: false, path: null }
    }
}

function parseAccountLabel(result: RecordLike | null): CodexStatusSnapshot['account'] {
    const account = result ? asRecord(result.account) : null
    const requiresOpenaiAuth = result ? result.requiresOpenaiAuth === true : null

    if (!account) {
        if (requiresOpenaiAuth === false) {
            return { mode: 'none', label: 'No OpenAI auth required' }
        }
        if (requiresOpenaiAuth === true) {
            return { mode: 'none', label: 'Not logged in' }
        }
        return { mode: 'unknown', label: 'Unknown' }
    }

    const type = asString(account.type)
    if (type === 'apiKey') {
        return { mode: 'apiKey', label: 'API key configured' }
    }
    if (type === 'chatgpt') {
        const planType = asString(account.planType ?? account.plan_type)
        const email = asString(account.email)
        const planLabel = planType ? `ChatGPT ${planType}` : 'ChatGPT'
        return {
            mode: 'chatgpt',
            label: email ? `Logged in as ${email} (${planLabel})` : `Logged in via ${planLabel}`
        }
    }

    return { mode: 'unknown', label: 'Unknown' }
}

function parseLimitsLabel(result: RecordLike | null): CodexStatusSnapshot['limits'] {
    const rateLimits = result ? asRecord(result.rateLimits ?? result.rate_limits) : null
    const primary = rateLimits ? asRecord(rateLimits.primary) : null
    const secondary = rateLimits ? asRecord(rateLimits.secondary) : null

    const formatLimit = (value: RecordLike | null): string | null => {
        if (!value) return null
        const usedPercent = asNumber(value.usedPercent ?? value.used_percent)
        const windowDurationMins = asNumber(value.windowDurationMins ?? value.window_duration_mins)
        if (usedPercent === null && windowDurationMins === null) return null
        if (usedPercent !== null && windowDurationMins !== null) {
            return `${usedPercent}% used / ${windowDurationMins}m`
        }
        if (usedPercent !== null) {
            return `${usedPercent}% used`
        }
        return `${windowDurationMins}m window`
    }

    const primaryLabel = formatLimit(primary)
    const secondaryLabel = formatLimit(secondary)
    const parts = [primaryLabel ? `Primary ${primaryLabel}` : null, secondaryLabel ? `Secondary ${secondaryLabel}` : null]
        .filter((value): value is string => Boolean(value))

    return {
        primary,
        secondary,
        label: parts.length > 0 ? parts.join(' • ') : 'data not available yet'
    }
}

function parseModelProvider(
    configResult: RecordLike | null,
    fallbackSessionMeta: RecordLike | null,
    threadModelProvider: string | null
): CodexStatusSnapshot['modelProvider'] {
    const config = configResult ? asRecord(configResult.config ?? configResult) : null
    const providerName = asString(
        config?.model_provider
        ?? config?.modelProvider
        ?? asRecord(config?.model)?.provider
        ?? asRecord(config?.provider)?.name
    )
    const providerEndpoint = asString(
        config?.provider_endpoint
        ?? config?.providerEndpoint
        ?? config?.openai_base_url
        ?? asRecord(config?.provider)?.endpoint
        ?? asRecord(config?.provider)?.base_url
    )

    if (providerName || providerEndpoint) {
        return {
            name: providerName,
            endpoint: providerEndpoint,
            source: 'config'
        }
    }

    const fallbackName = asString(
        fallbackSessionMeta?.model_provider
        ?? fallbackSessionMeta?.modelProvider
    )
    if (fallbackName) {
        return {
            name: fallbackName,
            endpoint: null,
            source: 'session_meta'
        }
    }

    if (threadModelProvider) {
        return {
            name: threadModelProvider,
            endpoint: null,
            source: 'thread'
        }
    }

    return {
        name: null,
        endpoint: null,
        source: 'unknown'
    }
}

async function listJsonlFiles(dir: string): Promise<string[]> {
    try {
        const entries = await readdir(dir, { withFileTypes: true })
        const results: string[] = []
        for (const entry of entries) {
            const full = join(dir, entry.name)
            if (entry.isDirectory()) {
                results.push(...await listJsonlFiles(full))
            } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
                results.push(full)
            }
        }
        return results
    } catch {
        return []
    }
}

async function findBestRolloutFile(threadId: string | null, cwd: string): Promise<{
    file: string | null
    matchType: RolloutMatchType
}> {
    const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex')
    const root = join(codexHome, 'sessions')
    const files = await listJsonlFiles(root)
    const normalizedCwd = normalizePath(cwd)

    const candidates = await Promise.all(files.map(async (file) => {
        let score = Number.MAX_SAFE_INTEGER
        let matchType: Exclude<RolloutMatchType, 'none'> | null = null
        if (threadId && file.endsWith(`-${threadId}.jsonl`)) {
            score = 0
            matchType = 'thread'
        } else {
            try {
                const content = await readFile(file, 'utf8')
                for (const line of content.split('\n')) {
                    if (!line.trim()) continue
                    const parsed = asRecord(JSON.parse(line))
                    if (!parsed || parsed.type !== 'session_meta') continue
                    const payload = asRecord(parsed.payload)
                    const id = asString(payload?.id)
                    const payloadCwd = asString(payload?.cwd)
                    if (threadId && id === threadId) {
                        score = 0
                        matchType = 'thread'
                        break
                    }
                    if (!threadId && payloadCwd && normalizePath(payloadCwd) === normalizedCwd) {
                        score = Math.min(score, 1)
                        matchType = 'cwd'
                    }
                }
            } catch {
                return null
            }
        }

        if (score === Number.MAX_SAFE_INTEGER) {
            return null
        }

        try {
            const fileStat = await stat(file)
            return { file, score, mtimeMs: fileStat.mtimeMs, matchType }
        } catch {
            return { file, score, mtimeMs: 0, matchType }
        }
    }))

    const best = candidates
        .filter((value): value is { file: string; score: number; mtimeMs: number; matchType: Exclude<RolloutMatchType, 'none'> | null } => Boolean(value))
        .sort((left, right) => left.score - right.score || right.mtimeMs - left.mtimeMs)[0]

    return {
        file: best?.file ?? null,
        matchType: best?.matchType ?? 'none'
    }
}

export async function readCodexRolloutStatusFallback(args: {
    threadId: string | null
    cwd: string
}): Promise<RolloutFallback> {
    const result = await findBestRolloutFile(args.threadId, args.cwd)
    const file = result.file
    if (!file) {
        return {
            sessionMeta: null,
            turnContext: null,
            tokenCountInfo: null,
            matchType: 'none'
        }
    }

    let sessionMeta: RecordLike | null = null
    let turnContext: RecordLike | null = null
    let tokenCountInfo: RecordLike | null = null

    try {
        const content = await readFile(file, 'utf8')
        for (const line of content.split('\n')) {
            if (!line.trim()) continue
            const parsed = asRecord(JSON.parse(line))
            if (!parsed) continue

            if (parsed.type === 'session_meta') {
                sessionMeta = asRecord(parsed.payload)
                continue
            }

            if (parsed.type === 'turn_context') {
                turnContext = asRecord(parsed.payload)
                continue
            }

            if (parsed.type === 'event_msg') {
                const payload = asRecord(parsed.payload)
                if (payload?.type === 'token_count') {
                    tokenCountInfo = asRecord(payload.info)
                }
            }
        }
    } catch {
        return {
            sessionMeta: null,
            turnContext: null,
            tokenCountInfo: null,
            matchType: 'none'
        }
    }

    return {
        sessionMeta,
        turnContext,
        tokenCountInfo,
        matchType: result.matchType
    }
}

export async function buildCodexStatusSnapshot(args: {
    session: CodexSession
    appServerClient: CodexAppServerClient
    threadId: string | null
    threadModelProvider: string | null
}): Promise<CodexStatusSnapshot> {
    const { session, appServerClient, threadId, threadModelProvider } = args

    const [configResult, accountResult, rateLimitsResult, rolloutFallback, agentsMd] = await Promise.all([
        appServerClient.readConfig().catch(() => null),
        appServerClient.readAccount(false).catch(() => null),
        appServerClient.readRateLimits().catch(() => null),
        readCodexRolloutStatusFallback({ threadId, cwd: session.path }).catch(() => ({
            sessionMeta: null,
            turnContext: null,
            tokenCountInfo: null,
            matchType: 'none' as const
        })),
        detectAgentsMd(session.path)
    ])

    const tokenUsage = extractTokenUsage(
        session.getLatestTokenUsage()
            ?? rolloutFallback.tokenCountInfo
    )
    const contextWindow = buildContextWindow(tokenUsage)

    const fallbackModel = asString(
        rolloutFallback.turnContext?.model
        ?? rolloutFallback.turnContext?.model_name
    )
    const fallbackReasoningEffort = asString(
        rolloutFallback.turnContext?.model_reasoning_effort
        ?? rolloutFallback.turnContext?.reasoning_effort
    )

    return {
        threadId,
        rolloutSessionId: asString(rolloutFallback.sessionMeta?.id),
        cliVersion: packageJson.version,
        model: {
            name: session.getModel() ?? fallbackModel,
            reasoningEffort: session.getModelReasoningEffort() ?? fallbackReasoningEffort,
            summary: 'auto'
        },
        modelProvider: parseModelProvider(
            asRecord(configResult),
            rolloutFallback.sessionMeta,
            threadModelProvider
        ),
        directory: session.path,
        permissions: buildPermissions(session),
        agentsMd,
        account: parseAccountLabel(asRecord(accountResult)),
        collaborationMode: {
            mode: session.getCollaborationMode() ?? 'default'
        },
        tokenUsage: {
            total: tokenUsage.total,
            input: tokenUsage.input,
            output: tokenUsage.output,
            reasoning: tokenUsage.reasoning,
            cachedInput: tokenUsage.cachedInput,
            last: tokenUsage.last
        },
        contextWindow,
        limits: parseLimitsLabel(asRecord(rateLimitsResult)),
        updatedAt: new Date().toISOString()
    }
}

export function formatCodexStatusMarkdown(snapshot: CodexStatusSnapshot): string {
    const modelName = snapshot.model.name ?? 'auto'
    const modelProviderName = snapshot.modelProvider.name
        ? snapshot.modelProvider.endpoint
            ? `${snapshot.modelProvider.name} (${snapshot.modelProvider.endpoint})`
            : snapshot.modelProvider.name
        : 'unknown'
    const rolloutSession = snapshot.rolloutSessionId && snapshot.rolloutSessionId !== snapshot.threadId
        ? `- Rollout session ID: \`${snapshot.rolloutSessionId}\``
        : ''
    const lastUsage = snapshot.tokenUsage.last
    const permissionsLabel = snapshot.permissions.label
    const agentsMdLabel = snapshot.agentsMd.exists
        ? `Yes (\`${snapshot.agentsMd.path}\`)`
        : '<none>'
    const contextLabel = snapshot.contextWindow.max !== null && snapshot.contextWindow.used !== null
        ? `${snapshot.contextWindow.percentLeft}% left (${formatCompactNumber(snapshot.contextWindow.used)} used / ${formatCompactNumber(snapshot.contextWindow.max)})`
        : 'No context window data yet'

    return [
        '## Codex Status',
        '',
        '### Session',
        `- Thread ID: \`${snapshot.threadId ?? 'unavailable'}\``,
        rolloutSession,
        `- Working directory: \`${snapshot.directory}\``,
        `- AGENTS.md: ${agentsMdLabel}`,
        '',
        '### Model',
        `- Model: \`${modelName}\``,
        snapshot.model.reasoningEffort ? `- Reasoning effort: \`${snapshot.model.reasoningEffort}\`` : '',
        snapshot.model.summary ? `- Summary mode: \`${snapshot.model.summary}\`` : '',
        `- Model provider: \`${modelProviderName}\``,
        `- Collaboration mode: \`${snapshot.collaborationMode.mode}\``,
        '',
        '### Permissions',
        `- Approval policy: \`${snapshot.permissions.approvalPolicy ?? 'unknown'}\``,
        `- Sandbox: \`${snapshot.permissions.sandbox ?? 'unknown'}\``,
        `- Label: ${permissionsLabel}`,
        '',
        '### Account',
        `- ${snapshot.account.label}`,
        `- Limits: ${snapshot.limits.label}`,
        '',
        '### Token usage',
        snapshot.tokenUsage.total === null
            ? '- No usage reported yet'
            : `- Total: ${formatCompactNumber(snapshot.tokenUsage.total)} total (${formatCompactNumber(snapshot.tokenUsage.input ?? 0)} input + ${formatCompactNumber(snapshot.tokenUsage.output ?? 0)} output)`,
        snapshot.tokenUsage.cachedInput && snapshot.tokenUsage.cachedInput > 0
            ? `- Cached input: ${formatCompactNumber(snapshot.tokenUsage.cachedInput)}`
            : '',
        snapshot.tokenUsage.reasoning && snapshot.tokenUsage.reasoning > 0
            ? `- Reasoning output: ${formatCompactNumber(snapshot.tokenUsage.reasoning)}`
            : '',
        lastUsage
            ? `- Last turn: ${formatCompactNumber(lastUsage.total ?? 0)} total (${formatCompactNumber(lastUsage.input ?? 0)} input + ${formatCompactNumber(lastUsage.output ?? 0)} output)`
            : '',
        '',
        '### Context window',
        `- ${contextLabel}`,
        snapshot.contextWindow.formula ? `- Formula: \`${snapshot.contextWindow.formula}\`` : '',
        '',
        `Updated: ${snapshot.updatedAt}`
    ].filter(Boolean).join('\n')
}
