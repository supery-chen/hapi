import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { parseSlashCommandInput } from '@hapi/protocol/slashCommands'
import type { ApiClient } from '@/api/client'
import type { AttachmentMetadata, DecryptedMessage } from '@/types/api'
import { makeClientSideId } from '@/lib/messages'
import {
    appendOptimisticMessage,
    getMessageWindowState,
    updateMessageStatus,
} from '@/lib/message-window-store'
import { usePlatform } from '@/hooks/usePlatform'

type SendMessageInput = {
    sessionId: string
    text: string
    optimisticText: string
    localId: string
    createdAt: number
    attachments?: AttachmentMetadata[]
    optimistic: boolean
}

type BlockedReason = 'no-api' | 'no-session' | 'pending'

type UseSendMessageOptions = {
    resolveSessionId?: (sessionId: string) => Promise<string>
    onSessionResolved?: (sessionId: string) => void
    onBlocked?: (reason: BlockedReason) => void
}

function findMessageByLocalId(
    sessionId: string,
    localId: string,
): DecryptedMessage | null {
    const state = getMessageWindowState(sessionId)
    for (const message of state.messages) {
        if (message.localId === localId) return message
    }
    for (const message of state.pending) {
        if (message.localId === localId) return message
    }
    return null
}

export function useSendMessage(
    api: ApiClient | null,
    sessionId: string | null,
    options?: UseSendMessageOptions
): {
    sendMessage: (text: string, attachments?: AttachmentMetadata[]) => boolean
    retryMessage: (localId: string) => void
    isSending: boolean
} {
    const { haptic } = usePlatform()
    const [isResolving, setIsResolving] = useState(false)
    const resolveGuardRef = useRef(false)

    const mutation = useMutation({
        mutationFn: async (input: SendMessageInput) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            await api.submitInput(input.sessionId, input.text, input.localId, input.attachments)
        },
        onMutate: async (input) => {
            if (!input.optimistic) {
                return
            }
            const optimisticMessage: DecryptedMessage = {
                id: input.localId,
                seq: null,
                localId: input.localId,
                content: {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: input.optimisticText,
                        attachments: input.attachments
                    }
                },
                createdAt: input.createdAt,
                status: 'sending',
                originalText: input.text,
            }

            appendOptimisticMessage(input.sessionId, optimisticMessage)
        },
        onSuccess: (_, input) => {
            if (input.optimistic) {
                updateMessageStatus(input.sessionId, input.localId, 'sent')
            }
            haptic.notification('success')
        },
        onError: (_, input) => {
            if (input.optimistic) {
                updateMessageStatus(input.sessionId, input.localId, 'failed')
            }
            haptic.notification('error')
        },
    })

    const sendMessage = (text: string, attachments?: AttachmentMetadata[]): boolean => {
        if (!api) {
            options?.onBlocked?.('no-api')
            haptic.notification('error')
            return false
        }
        if (!sessionId) {
            options?.onBlocked?.('no-session')
            haptic.notification('error')
            return false
        }
        if (mutation.isPending || resolveGuardRef.current) {
            options?.onBlocked?.('pending')
            return false
        }
        const localId = makeClientSideId('local')
        const createdAt = Date.now()
        const parsedInput = parseSlashCommandInput(text)
        const isSlashCommand = (!attachments || attachments.length === 0) && parsedInput.kind === 'slash'
        const optimisticText = parsedInput.kind === 'escaped' ? parsedInput.text : text
        void (async () => {
            let targetSessionId = sessionId
            if (options?.resolveSessionId) {
                resolveGuardRef.current = true
                setIsResolving(true)
                try {
                    const resolved = await options.resolveSessionId(sessionId)
                    if (resolved && resolved !== sessionId) {
                        options.onSessionResolved?.(resolved)
                        targetSessionId = resolved
                    }
                } catch (error) {
                    haptic.notification('error')
                    console.error('Failed to resolve session before send:', error)
                    return
                } finally {
                    resolveGuardRef.current = false
                    setIsResolving(false)
                }
            }
            mutation.mutate({
                sessionId: targetSessionId,
                text,
                optimisticText,
                localId,
                createdAt,
                attachments,
                optimistic: !isSlashCommand,
            })
        })()
        return true
    }

    const retryMessage = (localId: string) => {
        if (!api) {
            options?.onBlocked?.('no-api')
            haptic.notification('error')
            return
        }
        if (!sessionId) {
            options?.onBlocked?.('no-session')
            haptic.notification('error')
            return
        }
        if (mutation.isPending || resolveGuardRef.current) {
            options?.onBlocked?.('pending')
            return
        }

        const message = findMessageByLocalId(sessionId, localId)
        if (!message?.originalText) return

        updateMessageStatus(sessionId, localId, 'sending')

        mutation.mutate({
            sessionId,
            text: message.originalText,
            optimisticText: message.originalText,
            localId,
            createdAt: message.createdAt,
            optimistic: true,
        })
    }

    return {
        sendMessage,
        retryMessage,
        isSending: mutation.isPending || isResolving,
    }
}
