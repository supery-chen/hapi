import type { ChatBlock, TerminalToolGroupBlock, ToolCallBlock } from '@/chat/types'

const TERMINAL_TOOL_NAMES = new Set([
    'Bash',
    'CodexBash',
    'shell_command'
])

export function isTerminalToolBlock(block: ChatBlock): block is ToolCallBlock {
    return block.kind === 'tool-call' && TERMINAL_TOOL_NAMES.has(block.tool.name)
}

function createTerminalToolGroupBlock(blocks: ToolCallBlock[]): TerminalToolGroupBlock {
    const first = blocks[0]!
    const last = blocks[blocks.length - 1]!
    return {
        kind: 'terminal-tool-group',
        id: `terminal-tool-group:${last.id}`,
        createdAt: first.createdAt,
        blocks
    }
}

export function mergeTerminalToolGroupBlocks(blocks: ChatBlock[]): ChatBlock[] {
    const grouped: ChatBlock[] = []
    let pendingTerminalBlocks: ToolCallBlock[] = []

    const flushPending = () => {
        if (pendingTerminalBlocks.length === 0) {
            return
        }
        if (pendingTerminalBlocks.length === 1) {
            grouped.push(pendingTerminalBlocks[0]!)
        } else {
            grouped.push(createTerminalToolGroupBlock(pendingTerminalBlocks))
        }
        pendingTerminalBlocks = []
    }

    for (const block of blocks) {
        if (isTerminalToolBlock(block)) {
            pendingTerminalBlocks.push(block)
            continue
        }

        flushPending()
        grouped.push(block)
    }

    flushPending()
    return grouped
}
