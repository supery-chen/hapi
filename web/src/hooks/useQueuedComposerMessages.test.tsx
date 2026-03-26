// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useQueuedComposerMessages } from './useQueuedComposerMessages'

describe('useQueuedComposerMessages', () => {
    it('queues messages while the session is thinking and auto-sends when idle', async () => {
        const onSend = vi.fn(() => true)
        const onDispatched = vi.fn()

        const { result, rerender } = renderHook(
            ({ sessionId, thinking, isSending }) => useQueuedComposerMessages({
                sessionId,
                thinking,
                isSending,
                onSend,
                onDispatched
            }),
            {
                initialProps: {
                    sessionId: 'session-1',
                    thinking: true,
                    isSending: false
                }
            }
        )

        act(() => {
            expect(result.current.submitMessage('queued hello')).toBe('queued')
        })

        expect(result.current.queuedMessages).toHaveLength(1)
        expect(onSend).not.toHaveBeenCalled()

        rerender({ sessionId: 'session-1', thinking: false, isSending: false })

        await waitFor(() => {
            expect(onSend).toHaveBeenCalledWith('queued hello', undefined)
        })
        await waitFor(() => {
            expect(result.current.queuedMessages).toHaveLength(0)
        })
        expect(onDispatched).toHaveBeenCalledTimes(1)
    })

    it('supports canceling queued messages locally', () => {
        const { result } = renderHook(() => useQueuedComposerMessages({
            sessionId: 'session-1',
            thinking: true,
            isSending: false,
            onSend: vi.fn(() => true)
        }))

        act(() => {
            result.current.submitMessage('first queued')
            result.current.submitMessage('second queued')
        })

        const firstId = result.current.queuedMessages[0]?.id
        expect(firstId).toBeTruthy()

        act(() => {
            result.current.removeQueuedMessage(firstId!)
        })

        expect(result.current.queuedMessages).toHaveLength(1)
        expect(result.current.queuedMessages[0]?.text).toBe('second queued')
    })

    it('dispatches queued messages one by one across processing cycles', async () => {
        const onSend = vi.fn(() => true)
        const { result, rerender } = renderHook(
            ({ thinking, isSending }) => useQueuedComposerMessages({
                sessionId: 'session-1',
                thinking,
                isSending,
                onSend
            }),
            {
                initialProps: {
                    thinking: true,
                    isSending: false
                }
            }
        )

        act(() => {
            result.current.submitMessage('first')
            result.current.submitMessage('second')
        })

        rerender({ thinking: false, isSending: false })
        await waitFor(() => {
            expect(onSend).toHaveBeenCalledTimes(1)
        })
        expect(onSend).toHaveBeenLastCalledWith('first', undefined)
        await waitFor(() => {
            expect(result.current.queuedMessages).toHaveLength(1)
        })

        rerender({ thinking: true, isSending: false })
        rerender({ thinking: false, isSending: false })
        await waitFor(() => {
            expect(onSend).toHaveBeenCalledTimes(2)
        })
        expect(onSend).toHaveBeenLastCalledWith('second', undefined)
        await waitFor(() => {
            expect(result.current.queuedMessages).toHaveLength(0)
        })
    })
})
