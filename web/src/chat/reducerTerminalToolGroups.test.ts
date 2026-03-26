import { describe, expect, it } from 'vitest'
import type { ChatBlock, ToolCallBlock } from './types'
import { mergeTerminalToolGroupBlocks } from './reducerTerminalToolGroups'

function terminalTool(id: string, name: string): ToolCallBlock {
    return {
        kind: 'tool-call',
        id,
        localId: null,
        createdAt: 1,
        tool: {
            id,
            name,
            state: 'completed',
            input: { command: `${name.toLowerCase()} command` },
            createdAt: 1,
            startedAt: 1,
            completedAt: 1,
            description: null
        },
        children: []
    }
}

function eventBlock(id: string): ChatBlock {
    return {
        kind: 'agent-event',
        id,
        createdAt: 1,
        event: { type: 'message', message: 'separator' }
    }
}

describe('mergeTerminalToolGroupBlocks', () => {
    it('groups consecutive terminal tool cards', () => {
        const result = mergeTerminalToolGroupBlocks([
            terminalTool('tool-1', 'CodexBash'),
            terminalTool('tool-2', 'Bash'),
            terminalTool('tool-3', 'shell_command')
        ])

        expect(result).toHaveLength(1)
        expect(result[0]?.kind).toBe('terminal-tool-group')
        if (result[0]?.kind === 'terminal-tool-group') {
            expect(result[0].blocks.map((block) => block.id)).toEqual(['tool-1', 'tool-2', 'tool-3'])
        }
    })

    it('does not group across non-terminal blocks', () => {
        const result = mergeTerminalToolGroupBlocks([
            terminalTool('tool-1', 'CodexBash'),
            eventBlock('event-1'),
            terminalTool('tool-2', 'Bash')
        ])

        expect(result.map((block) => block.kind)).toEqual(['tool-call', 'agent-event', 'tool-call'])
    })
})
