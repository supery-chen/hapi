// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import type { ApiClient } from '@/api/client'
import type { DecryptedMessage, MessagesResponse } from '@/types/api'
import {
    clearMessageWindow,
    fetchLatestMessages,
    fetchOlderMessages,
    getMessageWindowState,
    ingestIncomingMessages,
    setAtBottom,
} from './message-window-store'

function createMessage(seq: number): DecryptedMessage {
    return {
        id: `msg-${seq}`,
        seq,
        localId: null,
        createdAt: seq,
        content: {
            role: 'user',
            content: {
                type: 'text',
                text: `message ${seq}`
            }
        }
    }
}

function createPage(messages: DecryptedMessage[], beforeSeq: number | null, hasMore: boolean): MessagesResponse {
    return {
        messages,
        page: {
            limit: messages.length,
            beforeSeq,
            nextBeforeSeq: messages.length > 0 ? messages[0]?.seq ?? null : null,
            hasMore
        }
    }
}

describe('message-window-store pagination', () => {
    afterEach(() => {
        clearMessageWindow('session-test')
    })

    it('preserves newest messages when prepending older history', async () => {
        const latestMessages = Array.from({ length: 400 }, (_, index) => createMessage(401 + index))
        const olderMessages = Array.from({ length: 50 }, (_, index) => createMessage(351 + index))

        const api = {
            getMessages: async (_sessionId: string, options: { beforeSeq?: number | null }) => {
                if (options.beforeSeq == null) {
                    return createPage(latestMessages, null, true)
                }
                return createPage(olderMessages, options.beforeSeq, false)
            }
        } as Pick<ApiClient, 'getMessages'> as ApiClient

        await fetchLatestMessages(api, 'session-test')
        expect(getMessageWindowState('session-test').messages).toHaveLength(400)

        await fetchOlderMessages(api, 'session-test')
        const state = getMessageWindowState('session-test')

        expect(state.messages).toHaveLength(450)
        expect(state.messages[0]?.seq).toBe(351)
        expect(state.messages[state.messages.length - 1]?.seq).toBe(800)
    })

    it('buffers all incoming messages while browsing history to keep the viewport stable', async () => {
        const api = {
            getMessages: async () => createPage([createMessage(1), createMessage(2)], null, false)
        } as Pick<ApiClient, 'getMessages'> as ApiClient

        await fetchLatestMessages(api, 'session-test')
        setAtBottom('session-test', false)

        ingestIncomingMessages('session-test', [
            {
                id: 'msg-3',
                seq: 3,
                localId: null,
                createdAt: 3,
                content: {
                    role: 'agent',
                    content: {
                        type: 'output',
                        data: [{ type: 'text', text: 'assistant reply' }]
                    }
                }
            },
            createMessage(4)
        ])

        const state = getMessageWindowState('session-test')
        expect(state.messages.map((message) => message.id)).toEqual(['msg-1', 'msg-2'])
        expect(state.pendingCount).toBe(2)
    })
})
