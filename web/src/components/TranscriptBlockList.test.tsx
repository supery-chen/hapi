import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ApiClient } from '@/api/client'
import { HappyChatProvider } from '@/components/AssistantChat/context'
import { TranscriptBlockList } from './TranscriptBlockList'

describe('TranscriptBlockList', () => {
    it('renders agent text blocks outside ThreadPrimitive.Messages', () => {
        const { container } = render(
            <HappyChatProvider
                value={{
                    api: {} as ApiClient,
                    sessionId: 'session-1',
                    metadata: null,
                    disabled: false,
                    onRefresh: vi.fn()
                }}
            >
                <TranscriptBlockList
                    blocks={[{
                        kind: 'agent-text',
                        id: 'agent-1',
                        localId: null,
                        createdAt: 1,
                        text: 'Hello **world**'
                    }]}
                />
            </HappyChatProvider>
        )

        expect(container.textContent).toContain('Hello world')
    })
})
