import { describe, expect, it } from 'vitest'
import { mergeCliOutputBlocks } from './reducerCliOutput'
import type { ChatBlock } from './types'

function cli(id: string, source: 'user' | 'assistant', text: string): ChatBlock {
    return {
        kind: 'cli-output',
        id,
        localId: null,
        createdAt: 1,
        source,
        text
    }
}

function userText(id: string): ChatBlock {
    return {
        kind: 'user-text',
        id,
        localId: null,
        createdAt: 1,
        text: 'hello'
    }
}

describe('mergeCliOutputBlocks', () => {
    it('groups consecutive cli output blocks from the same source', () => {
        const result = mergeCliOutputBlocks([
            cli('cli-1', 'assistant', '<command-name>ls</command-name>'),
            cli('cli-2', 'assistant', '<local-command-stderr>stderr</local-command-stderr>'),
            cli('cli-3', 'assistant', '<command-name>pwd</command-name>'),
        ])

        expect(result).toHaveLength(1)
        expect(result[0]?.kind).toBe('cli-output-group')
        if (result[0]?.kind === 'cli-output-group') {
            expect(result[0].blocks.map((block) => block.id)).toEqual(['cli-1', 'cli-2', 'cli-3'])
            expect(result[0].id).toBe('cli-group:cli-3')
        }
    })

    it('does not group cli output across non-cli blocks', () => {
        const result = mergeCliOutputBlocks([
            cli('cli-1', 'assistant', '<command-name>ls</command-name>'),
            userText('user-1'),
            cli('cli-2', 'assistant', '<command-name>pwd</command-name>'),
        ])

        expect(result.map((block) => block.kind)).toEqual(['cli-output', 'user-text', 'cli-output'])
    })
})
