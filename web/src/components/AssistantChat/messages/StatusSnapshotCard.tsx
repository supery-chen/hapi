import type { CodexStatusSnapshot } from '@/types/api'

function formatCompactNumber(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
        return 'n/a'
    }

    const absValue = Math.abs(value)
    if (absValue >= 1_000_000_000) {
        return `${Math.round((value / 1_000_000_000) * 10) / 10}B`
    }
    if (absValue >= 1_000_000) {
        return `${Math.round((value / 1_000_000) * 10) / 10}M`
    }
    if (absValue >= 1_000) {
        return `${Math.round((value / 1_000) * 10) / 10}K`
    }
    return String(value)
}

function formatDateTime(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return value
    }
    return date.toLocaleString()
}

function joinParts(parts: Array<string | null | undefined>): string {
    return parts.filter((part): part is string => Boolean(part && part.trim())).join(' | ')
}

function renderMaybe(value: string | null | undefined, fallback = 'n/a'): string {
    if (!value) {
        return fallback
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : fallback
}

function Field(props: {
    label: string
    value: string
    mono?: boolean
}) {
    return (
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--app-hint)]">
                {props.label}
            </div>
            <div className={`mt-1 text-sm text-[var(--app-fg)] ${props.mono ? 'font-mono break-all' : 'break-words'}`}>
                {props.value}
            </div>
        </div>
    )
}

export function StatusSnapshotCard(props: {
    snapshot: CodexStatusSnapshot
}) {
    const { snapshot } = props

    const modelValue = joinParts([
        renderMaybe(snapshot.model.name, 'auto'),
        snapshot.model.reasoningEffort ? `reasoning ${snapshot.model.reasoningEffort}` : null,
        snapshot.model.summary ? `summary ${snapshot.model.summary}` : null
    ])

    const providerValue = joinParts([
        renderMaybe(snapshot.modelProvider.name),
        snapshot.modelProvider.endpoint,
        snapshot.modelProvider.source !== 'unknown' ? `source ${snapshot.modelProvider.source}` : null
    ])

    const sessionValue = joinParts([
        snapshot.threadId ? `thread ${snapshot.threadId}` : null,
        snapshot.rolloutSessionId ? `rollout ${snapshot.rolloutSessionId}` : null
    ]) || 'n/a'

    const tokenUsageValue = joinParts([
        `total ${formatCompactNumber(snapshot.tokenUsage.total)}`,
        `in ${formatCompactNumber(snapshot.tokenUsage.input)}`,
        `out ${formatCompactNumber(snapshot.tokenUsage.output)}`,
        snapshot.tokenUsage.reasoning !== null ? `reason ${formatCompactNumber(snapshot.tokenUsage.reasoning)}` : null,
        snapshot.tokenUsage.cachedInput !== null ? `cached ${formatCompactNumber(snapshot.tokenUsage.cachedInput)}` : null
    ])

    const lastTurnValue = snapshot.tokenUsage.last
        ? joinParts([
            `total ${formatCompactNumber(snapshot.tokenUsage.last.total)}`,
            `in ${formatCompactNumber(snapshot.tokenUsage.last.input)}`,
            `out ${formatCompactNumber(snapshot.tokenUsage.last.output)}`
        ])
        : 'n/a'

    const contextValue = joinParts([
        snapshot.contextWindow.max !== null ? `max ${formatCompactNumber(snapshot.contextWindow.max)}` : null,
        snapshot.contextWindow.used !== null ? `used ${formatCompactNumber(snapshot.contextWindow.used)}` : null,
        snapshot.contextWindow.remaining !== null ? `left ${formatCompactNumber(snapshot.contextWindow.remaining)}` : null,
        snapshot.contextWindow.percentLeft !== null ? `${snapshot.contextWindow.percentLeft}% left` : null
    ]) || 'n/a'

    const agentsValue = snapshot.agentsMd.exists
        ? renderMaybe(snapshot.agentsMd.path)
        : 'not found'

    return (
        <div className="py-1">
            <div className="mx-auto w-full max-w-content">
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--app-hint)]">
                                Codex Status
                            </div>
                            <div className="mt-1 text-xs text-[var(--app-hint)]">
                                CLI {snapshot.cliVersion}
                            </div>
                        </div>
                        <div className="text-right text-xs text-[var(--app-hint)]">
                            {formatDateTime(snapshot.updatedAt)}
                        </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Field label="Session" value={sessionValue} mono />
                        <Field label="Model" value={modelValue} />
                        <Field label="Provider" value={providerValue} />
                        <Field label="Directory" value={snapshot.directory} mono />
                        <Field label="Permissions" value={snapshot.permissions.label} />
                        <Field label="Account" value={snapshot.account.label} />
                        <Field label="Collaboration" value={renderMaybe(snapshot.collaborationMode.mode)} />
                        <Field label="AGENTS.md" value={agentsValue} mono={snapshot.agentsMd.exists} />
                        <Field label="Token Usage" value={tokenUsageValue} />
                        <Field label="Last Turn" value={lastTurnValue} />
                        <Field label="Context Window" value={contextValue} />
                        <Field label="Limits" value={snapshot.limits.label} />
                    </div>
                </div>
            </div>
        </div>
    )
}
