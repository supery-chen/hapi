import type { ChatBlock, CliOutputBlock, CliOutputGroupBlock } from '@/chat/types'

const CLI_TAG_REGEX = /<(?:local-command-[a-z-]+|command-(?:name|message|args))>/i
const CLI_COMMAND_NAME_REGEX = /<command-name>/i
const CLI_COMMAND_STDOUT_REGEX = /<local-command-stdout>/i

function getMetaSentFrom(meta: unknown): string | null {
    if (!meta || typeof meta !== 'object') return null
    const sentFrom = (meta as { sentFrom?: unknown }).sentFrom
    return typeof sentFrom === 'string' ? sentFrom : null
}

function hasCliOutputTags(text: string): boolean {
    return CLI_TAG_REGEX.test(text)
}

function hasCommandNameTag(text: string): boolean {
    return CLI_COMMAND_NAME_REGEX.test(text)
}

function hasLocalCommandStdoutTag(text: string): boolean {
    return CLI_COMMAND_STDOUT_REGEX.test(text)
}

export function isCliOutputText(text: string, meta: unknown): boolean {
    return getMetaSentFrom(meta) === 'cli' && hasCliOutputTags(text)
}

export function createCliOutputBlock(props: {
    id: string
    localId: string | null
    createdAt: number
    text: string
    source: CliOutputBlock['source']
    meta?: unknown
}): CliOutputBlock {
    return {
        kind: 'cli-output',
        id: props.id,
        localId: props.localId,
        createdAt: props.createdAt,
        text: props.text,
        source: props.source,
        meta: props.meta
    }
}

function createCliOutputGroupBlock(blocks: CliOutputBlock[]): CliOutputGroupBlock {
    const first = blocks[0]!
    const last = blocks[blocks.length - 1]!
    return {
        kind: 'cli-output-group',
        id: `cli-group:${last.id}`,
        createdAt: first.createdAt,
        source: first.source,
        blocks
    }
}

export function mergeCliOutputBlocks(blocks: ChatBlock[]): ChatBlock[] {
    const mergedCliBlocks: ChatBlock[] = []

    for (const block of blocks) {
        if (block.kind !== 'cli-output') {
            mergedCliBlocks.push(block)
            continue
        }

        const prev = mergedCliBlocks[mergedCliBlocks.length - 1]
        if (
            prev
            && prev.kind === 'cli-output'
            && prev.source === block.source
            && hasCommandNameTag(prev.text)
            && !hasLocalCommandStdoutTag(prev.text)
            && hasLocalCommandStdoutTag(block.text)
        ) {
            const separator = prev.text.endsWith('\n') || block.text.startsWith('\n') ? '' : '\n'
            mergedCliBlocks[mergedCliBlocks.length - 1] = { ...prev, text: `${prev.text}${separator}${block.text}` }
            continue
        }

        mergedCliBlocks.push(block)
    }

    const grouped: ChatBlock[] = []
    let pendingCliGroup: CliOutputBlock[] = []

    const flushPendingCliGroup = () => {
        if (pendingCliGroup.length === 0) {
            return
        }
        if (pendingCliGroup.length === 1) {
            grouped.push(pendingCliGroup[0]!)
        } else {
            grouped.push(createCliOutputGroupBlock(pendingCliGroup))
        }
        pendingCliGroup = []
    }

    for (const block of mergedCliBlocks) {
        if (block.kind === 'cli-output') {
            const previous = pendingCliGroup[pendingCliGroup.length - 1]
            if (!previous || previous.source === block.source) {
                pendingCliGroup.push(block)
                continue
            }
        }

        flushPendingCliGroup()

        if (block.kind === 'cli-output') {
            pendingCliGroup.push(block)
            continue
        }

        grouped.push(block)
    }

    flushPendingCliGroup()
    return grouped
}
