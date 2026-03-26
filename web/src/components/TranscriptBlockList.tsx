import { memo, useMemo, useState, type CSSProperties } from 'react'
import { CodexStatusSnapshotSchema } from '@hapi/protocol/schemas'
import type { AgentEvent, ChatBlock, ToolCallBlock } from '@/chat/types'
import { getEventPresentation } from '@/chat/presentation'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { CliOutputGroup } from '@/components/CliOutputGroup'
import { TerminalToolGroup } from '@/components/TerminalToolGroup'
import { ToolCard } from '@/components/ToolCard/ToolCard'
import { LazyRainbowText } from '@/components/LazyRainbowText'
import { MessageStatusIndicator } from '@/components/AssistantChat/messages/MessageStatusIndicator'
import { MessageAttachments } from '@/components/AssistantChat/messages/MessageAttachments'
import { StatusSnapshotCard } from '@/components/AssistantChat/messages/StatusSnapshotCard'
import { useHappyChatContext } from '@/components/AssistantChat/context'

const BLOCK_VISIBILITY_STYLE: CSSProperties = {
    contentVisibility: 'auto',
    containIntrinsicSize: '180px 360px',
}

function ReasoningBlock(props: { text: string }) {
    const [open, setOpen] = useState(false)

    return (
        <div className="px-1 min-w-0 max-w-full overflow-x-hidden" style={BLOCK_VISIBILITY_STYLE}>
            <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-3 py-2 shadow-sm">
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    className="flex w-full items-center justify-between gap-3 text-left text-xs font-medium text-[var(--app-hint)]"
                >
                    <span>Reasoning</span>
                    <span>{open ? 'Collapse' : 'Expand'}</span>
                </button>
                {open ? (
                    <div className="mt-2 border-l-2 border-[var(--app-divider)] pl-3 text-sm text-[var(--app-hint)]">
                        <MarkdownRenderer content={props.text} />
                    </div>
                ) : null}
            </div>
        </div>
    )
}

function splitTaskChildren(block: ToolCallBlock): { pending: ChatBlock[]; rest: ChatBlock[] } {
    const pending: ChatBlock[] = []
    const rest: ChatBlock[] = []

    for (const child of block.children) {
        if (child.kind === 'tool-call' && child.tool.permission?.status === 'pending') {
            pending.push(child)
        } else {
            rest.push(child)
        }
    }

    return { pending, rest }
}

function EventBlock(props: { event: AgentEvent }) {
    const rawStatusSnapshot = props.event.type === 'status'
        ? props.event.snapshot
        : null
    const parsedStatusSnapshot = rawStatusSnapshot
        ? CodexStatusSnapshotSchema.safeParse(rawStatusSnapshot)
        : null

    if (parsedStatusSnapshot?.success) {
        return <StatusSnapshotCard snapshot={parsedStatusSnapshot.data} />
    }

    const presentation = getEventPresentation(props.event)
    return (
        <div className="py-1" style={BLOCK_VISIBILITY_STYLE}>
            <div className="mx-auto w-fit max-w-[92%] px-2 text-center text-xs text-[var(--app-hint)] opacity-80">
                <span className="inline-flex items-center gap-1">
                    {presentation.icon ? <span aria-hidden="true">{presentation.icon}</span> : null}
                    <span>{presentation.text}</span>
                </span>
            </div>
        </div>
    )
}

function TranscriptToolBlock(props: { block: ToolCallBlock; nested?: boolean }) {
    const ctx = useHappyChatContext()
    const { block } = props
    const isTask = block.tool.name === 'Task'
    const taskChildren = isTask ? splitTaskChildren(block) : null

    return (
        <div className="py-1 min-w-0 max-w-full overflow-x-hidden" style={BLOCK_VISIBILITY_STYLE}>
            <ToolCard
                api={ctx.api}
                sessionId={ctx.sessionId}
                metadata={ctx.metadata}
                disabled={ctx.disabled}
                onDone={ctx.onRefresh}
                block={block}
            />

            {block.children.length > 0 ? (
                isTask ? (
                    <>
                        {taskChildren && taskChildren.pending.length > 0 ? (
                            <div className="mt-2 pl-3">
                                <TranscriptBlockList blocks={taskChildren.pending} nested />
                            </div>
                        ) : null}
                        {taskChildren && taskChildren.rest.length > 0 ? (
                            <details className="mt-2">
                                <summary className="cursor-pointer text-xs text-[var(--app-hint)]">
                                    Task details ({taskChildren.rest.length})
                                </summary>
                                <div className="mt-2 pl-3">
                                    <TranscriptBlockList blocks={taskChildren.rest} nested />
                                </div>
                            </details>
                        ) : null}
                    </>
                ) : (
                    <div className="mt-2 pl-3">
                        <TranscriptBlockList blocks={block.children} nested />
                    </div>
                )
            ) : null}
        </div>
    )
}

const MemoTranscriptToolBlock = memo(TranscriptToolBlock, (prev, next) => (
    prev.block === next.block && prev.nested === next.nested
))

function TranscriptBlockViewImpl(props: { block: ChatBlock; nested?: boolean }) {
    const ctx = useHappyChatContext()
    const { block } = props

    if (block.kind === 'user-text') {
        const canRetry = block.status === 'failed' && typeof block.localId === 'string' && Boolean(ctx.onRetryMessage)
        const onRetry = canRetry ? () => ctx.onRetryMessage!(block.localId!) : undefined

        return (
            <div className="px-1 min-w-0 max-w-full overflow-x-hidden" style={BLOCK_VISIBILITY_STYLE}>
                <div className="ml-auto w-fit min-w-0 max-w-[92%] rounded-xl bg-[var(--app-secondary-bg)] px-3 py-2 text-[var(--app-fg)] shadow-sm">
                    <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1">
                            <LazyRainbowText text={block.text} />
                            {block.attachments && block.attachments.length > 0 ? (
                                <MessageAttachments attachments={block.attachments} />
                            ) : null}
                        </div>
                        {block.status ? (
                            <div className="shrink-0 self-end pb-0.5">
                                <MessageStatusIndicator status={block.status} onRetry={onRetry} />
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        )
    }

    if (block.kind === 'agent-text') {
        return (
            <div className="px-1 min-w-0 max-w-full overflow-x-hidden" style={BLOCK_VISIBILITY_STYLE}>
                <MarkdownRenderer content={block.text} />
            </div>
        )
    }

    if (block.kind === 'agent-reasoning') {
        return <ReasoningBlock text={block.text} />
    }

    if (block.kind === 'agent-event') {
        return <EventBlock event={block.event} />
    }

    if (block.kind === 'cli-output') {
        const alignClass = block.source === 'user' ? 'ml-auto w-full max-w-[92%]' : ''
        return (
            <div className="px-1 min-w-0 max-w-full overflow-x-hidden" style={BLOCK_VISIBILITY_STYLE}>
                <div className={alignClass}>
                    <CliOutputBlock text={block.text} />
                </div>
            </div>
        )
    }

    if (block.kind === 'cli-output-group') {
        return (
            <div style={BLOCK_VISIBILITY_STYLE}>
                <CliOutputGroup blocks={block.blocks} source={block.source} />
            </div>
        )
    }

    if (block.kind === 'terminal-tool-group') {
        return (
            <div style={BLOCK_VISIBILITY_STYLE}>
                <TerminalToolGroup
                    api={ctx.api}
                    blocks={block.blocks}
                    metadata={ctx.metadata}
                    sessionId={ctx.sessionId}
                    disabled={ctx.disabled}
                    onDone={ctx.onRefresh}
                />
            </div>
        )
    }

    return <MemoTranscriptToolBlock block={block} nested={props.nested} />
}

const TranscriptBlockView = memo(TranscriptBlockViewImpl, (prev, next) => (
    prev.block === next.block && prev.nested === next.nested
))

export const TranscriptBlockList = memo(function TranscriptBlockList(props: {
    blocks: ChatBlock[]
    nested?: boolean
}) {
    const className = useMemo(
        () => props.nested ? 'flex flex-col gap-3' : 'flex flex-col gap-3',
        [props.nested]
    )

    return (
        <div className={className}>
            {props.blocks.map((block) => (
                <TranscriptBlockView key={block.id} block={block} nested={props.nested} />
            ))}
        </div>
    )
}, (prev, next) => prev.blocks === next.blocks && prev.nested === next.nested)
