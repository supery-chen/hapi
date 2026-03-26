import { useCallback, useEffect, useRef, useState } from 'react'
import type { AttachmentMetadata } from '@/types/api'
import { makeClientSideId } from '@/lib/messages'

export type QueuedComposerMessage = {
    id: string
    text: string
    attachments: AttachmentMetadata[]
    createdAt: number
}

export type SubmitQueuedMessageResult = 'sent' | 'queued' | 'blocked'

const AUTO_SEND_FALLBACK_UNLOCK_MS = 1_500

export function useQueuedComposerMessages(args: {
    sessionId: string
    thinking: boolean
    isSending: boolean
    onSend: (text: string, attachments?: AttachmentMetadata[]) => boolean
    onDispatched?: () => void
}): {
    queuedMessages: QueuedComposerMessage[]
    submitMessage: (text: string, attachments?: AttachmentMetadata[]) => SubmitQueuedMessageResult
    removeQueuedMessage: (id: string) => void
} {
    const { sessionId, thinking, isSending, onSend, onDispatched } = args
    const [queuedMessages, setQueuedMessages] = useState<QueuedComposerMessage[]>([])
    const dispatchLockedRef = useRef(false)
    const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const clearDispatchLock = useCallback(() => {
        dispatchLockedRef.current = false
        if (unlockTimerRef.current) {
            clearTimeout(unlockTimerRef.current)
            unlockTimerRef.current = null
        }
    }, [])

    useEffect(() => () => {
        clearDispatchLock()
    }, [clearDispatchLock])

    useEffect(() => {
        clearDispatchLock()
        setQueuedMessages([])
    }, [sessionId, clearDispatchLock])

    useEffect(() => {
        if (thinking || isSending) {
            clearDispatchLock()
        }
    }, [thinking, isSending, clearDispatchLock])

    const removeQueuedMessage = useCallback((id: string) => {
        setQueuedMessages((current) => current.filter((message) => message.id !== id))
    }, [])

    const submitMessage = useCallback((text: string, attachments?: AttachmentMetadata[]): SubmitQueuedMessageResult => {
        const normalizedAttachments = attachments ?? []

        if (thinking) {
            setQueuedMessages((current) => [
                ...current,
                {
                    id: makeClientSideId('queued'),
                    text,
                    attachments: normalizedAttachments,
                    createdAt: Date.now()
                }
            ])
            return 'queued'
        }

        const accepted = onSend(
            text,
            normalizedAttachments.length > 0 ? normalizedAttachments : undefined
        )
        if (accepted) {
            onDispatched?.()
            return 'sent'
        }
        return 'blocked'
    }, [thinking, onDispatched, onSend])

    useEffect(() => {
        if (thinking || isSending || dispatchLockedRef.current || queuedMessages.length === 0) {
            return
        }

        const nextMessage = queuedMessages[0]
        if (!nextMessage) {
            return
        }

        dispatchLockedRef.current = true
        const accepted = onSend(
            nextMessage.text,
            nextMessage.attachments.length > 0 ? nextMessage.attachments : undefined
        )

        if (!accepted) {
            dispatchLockedRef.current = false
            return
        }

        setQueuedMessages((current) => current.filter((message) => message.id !== nextMessage.id))
        onDispatched?.()

        unlockTimerRef.current = setTimeout(() => {
            dispatchLockedRef.current = false
            unlockTimerRef.current = null
        }, AUTO_SEND_FALLBACK_UNLOCK_MS)
    }, [thinking, isSending, onDispatched, onSend, queuedMessages])

    return {
        queuedMessages,
        submitMessage,
        removeQueuedMessage
    }
}
