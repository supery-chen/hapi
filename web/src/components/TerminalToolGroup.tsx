import type { ApiClient } from '@/api/client'
import { useMemo } from 'react'
import type { SessionMetadataSummary } from '@/types/api'
import type { ToolCallBlock } from '@/chat/types'
import { ToolCard } from '@/components/ToolCard/ToolCard'
import { usePersistentGroupOpenState } from '@/lib/collapsible-group-state'
import { useTranslation } from '@/lib/use-translation'
import { getInputStringAny, truncate } from '@/lib/toolInputUtils'

function Chevron(props: { open: boolean }) {
    return (
        <svg
            className={`h-4 w-4 transition-transform ${props.open ? 'rotate-90' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
        >
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function extractCommandPreview(block: ToolCallBlock): string | null {
    const input = block.tool.input
    const commandArray = input && typeof input === 'object' && Array.isArray((input as { command?: unknown[] }).command)
        ? (input as { command: unknown[] }).command
        : null

    const command = commandArray
        ? commandArray.filter((part): part is string => typeof part === 'string').join(' ')
        : getInputStringAny(input, ['command', 'cmd'])

    return command ? truncate(command, 80) : null
}

export function TerminalToolGroup(props: {
    api: ApiClient
    blocks: ToolCallBlock[]
    metadata: SessionMetadataSummary | null
    sessionId: string
    onDone: () => void
    disabled: boolean
}) {
    const { t } = useTranslation()
    const memberIds = useMemo(
        () => props.blocks.map((block) => block.id),
        [props.blocks]
    )
    const defaultOpen = useMemo(
        () => props.blocks.some((block) => block.tool.state === 'pending' || block.tool.state === 'error'),
        [props.blocks]
    )
    const [open, setOpen] = usePersistentGroupOpenState(memberIds, defaultOpen)

    const preview = useMemo(() => {
        return props.blocks
            .map(extractCommandPreview)
            .filter((value): value is string => Boolean(value))
            .slice(0, 2)
            .join(' • ')
    }, [props.blocks])

    const statusCounts = useMemo(() => {
        let running = 0
        let pending = 0
        let error = 0

        for (const block of props.blocks) {
            if (block.tool.state === 'running') {
                running += 1
            } else if (block.tool.state === 'pending') {
                pending += 1
            } else if (block.tool.state === 'error') {
                error += 1
            }
        }

        return { running, pending, error }
    }, [props.blocks])

    return (
        <div className="py-1 min-w-0 max-w-full overflow-x-hidden">
            <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] shadow-sm">
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                >
                    <div className="min-w-0 flex items-center gap-2">
                        <span className="shrink-0 text-[var(--app-hint)]">
                            <Chevron open={open} />
                        </span>
                        <div className="min-w-0">
                            <div className="text-sm font-medium text-[var(--app-fg)]">
                                {t('terminal.toolGroupCount', {
                                    n: props.blocks.length,
                                    s: props.blocks.length === 1 ? '' : 's'
                                })}
                            </div>
                            {preview ? (
                                <div className="truncate text-xs text-[var(--app-hint)]">
                                    {preview}
                                </div>
                            ) : null}
                            {statusCounts.pending > 0 || statusCounts.running > 0 || statusCounts.error > 0 ? (
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                    {statusCounts.pending > 0 ? (
                                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                                            {statusCounts.pending} pending
                                        </span>
                                    ) : null}
                                    {statusCounts.running > 0 ? (
                                        <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-600">
                                            {statusCounts.running} running
                                        </span>
                                    ) : null}
                                    {statusCounts.error > 0 ? (
                                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600">
                                            {statusCounts.error} error
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <span className="shrink-0 text-xs text-[var(--app-hint)]">
                        {open ? t('terminal.collapse') : t('terminal.expand')}
                    </span>
                </button>

                {open ? (
                    <div className="flex flex-col gap-2 border-t border-[var(--app-divider)] p-2">
                        {props.blocks.map((block) => (
                            <ToolCard
                                key={block.id}
                                api={props.api}
                                sessionId={props.sessionId}
                                metadata={props.metadata}
                                disabled={props.disabled}
                                onDone={props.onDone}
                                block={block}
                            />
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
