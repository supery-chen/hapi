import { MessagePrimitive, useAssistantState } from '@assistant-ui/react'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { Reasoning, ReasoningGroup } from '@/components/assistant-ui/reasoning'
import { HappyToolMessage } from '@/components/AssistantChat/messages/ToolMessage'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { CliOutputGroup } from '@/components/CliOutputGroup'
import type { CliOutputBlock as CliOutputBlockType } from '@/chat/types'
import type { ToolCallBlock } from '@/chat/types'
import { TerminalToolGroup } from '@/components/TerminalToolGroup'
import { useHappyChatContext } from '@/components/AssistantChat/context'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'

const TOOL_COMPONENTS = {
    Fallback: HappyToolMessage
} as const

const MESSAGE_PART_COMPONENTS = {
    Text: MarkdownText,
    Reasoning: Reasoning,
    ReasoningGroup: ReasoningGroup,
    tools: TOOL_COMPONENTS
} as const

const EMPTY_CLI_OUTPUT_GROUP_BLOCKS: CliOutputBlockType[] = []
const EMPTY_TERMINAL_TOOL_GROUP_BLOCKS: ToolCallBlock[] = []

export function HappyAssistantMessage() {
    const ctx = useHappyChatContext()
    const isCliOutput = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.kind === 'cli-output'
    })
    const cliText = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        if (custom?.kind !== 'cli-output') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    })
    const cliOutputGroupBlocks = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.kind === 'cli-output-group'
            ? custom.cliOutputBlocks ?? EMPTY_CLI_OUTPUT_GROUP_BLOCKS
            : EMPTY_CLI_OUTPUT_GROUP_BLOCKS
    })
    const terminalToolBlocks = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.kind === 'terminal-tool-group'
            ? custom.terminalToolBlocks ?? EMPTY_TERMINAL_TOOL_GROUP_BLOCKS
            : EMPTY_TERMINAL_TOOL_GROUP_BLOCKS
    })
    const toolOnly = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return false
        const parts = message.content
        return parts.length > 0 && parts.every((part) => part.type === 'tool-call')
    })
    const rootClass = toolOnly
        ? 'py-1 min-w-0 max-w-full overflow-x-hidden'
        : 'px-1 min-w-0 max-w-full overflow-x-hidden'

    if (isCliOutput) {
        return (
            <MessagePrimitive.Root className="px-1 min-w-0 max-w-full overflow-x-hidden">
                <CliOutputBlock text={cliText} />
            </MessagePrimitive.Root>
        )
    }

    if (cliOutputGroupBlocks.length > 0) {
        return (
            <MessagePrimitive.Root className="px-1 min-w-0 max-w-full overflow-x-hidden">
                <CliOutputGroup blocks={cliOutputGroupBlocks} source="assistant" />
            </MessagePrimitive.Root>
        )
    }

    if (terminalToolBlocks.length > 0) {
        return (
            <MessagePrimitive.Root className="px-1 min-w-0 max-w-full overflow-x-hidden">
                <TerminalToolGroup
                    api={ctx.api}
                    blocks={terminalToolBlocks}
                    metadata={ctx.metadata}
                    sessionId={ctx.sessionId}
                    onDone={ctx.onRefresh}
                    disabled={ctx.disabled}
                />
            </MessagePrimitive.Root>
        )
    }

    return (
        <MessagePrimitive.Root className={rootClass}>
            <MessagePrimitive.Content components={MESSAGE_PART_COMPONENTS} />
        </MessagePrimitive.Root>
    )
}
