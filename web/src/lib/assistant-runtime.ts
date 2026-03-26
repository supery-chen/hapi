import { useCallback, useMemo } from 'react'
import type { AppendMessage, AttachmentAdapter, ThreadMessageLike } from '@assistant-ui/react'
import { useExternalStoreRuntime } from '@assistant-ui/react'
import type { AttachmentMetadata, Session } from '@/types/api'

type TextMessagePart = { type: 'text'; text: string }

const EMPTY_THREAD_MESSAGES: ThreadMessageLike[] = []

function getTextFromParts(parts: readonly { type: string }[] | undefined): string {
    if (!parts) return ''

    return parts
        .filter((part): part is TextMessagePart => part.type === 'text' && typeof (part as TextMessagePart).text === 'string')
        .map((part) => part.text)
        .join('\n')
        .trim()
}

type ExtractedAttachmentMetadata = { __attachmentMetadata: AttachmentMetadata }

function isAttachmentMetadataJson(text: string): ExtractedAttachmentMetadata | null {
    try {
        const parsed = JSON.parse(text) as unknown
        if (parsed && typeof parsed === 'object' && '__attachmentMetadata' in parsed) {
            return parsed as ExtractedAttachmentMetadata
        }
        return null
    } catch {
        return null
    }
}

function extractMessageContent(message: AppendMessage): { text: string; attachments: AttachmentMetadata[] } {
    if (message.role !== 'user') return { text: '', attachments: [] }

    // Extract attachments from attachment content
    const attachments: AttachmentMetadata[] = []
    const otherAttachmentTexts: string[] = []

    const attachmentParts = message.attachments?.flatMap((attachment) => attachment.content ?? []) ?? []
    for (const part of attachmentParts) {
        if (part.type === 'text' && typeof (part as TextMessagePart).text === 'string') {
            const textPart = part as TextMessagePart
            const extracted = isAttachmentMetadataJson(textPart.text)
            if (extracted) {
                attachments.push(extracted.__attachmentMetadata)
            } else {
                otherAttachmentTexts.push(textPart.text)
            }
        }
    }

    const contentText = getTextFromParts(message.content)
    const text = [otherAttachmentTexts.join('\n'), contentText]
        .filter((value) => value.length > 0)
        .join('\n\n')
        .trim()

    return { text, attachments }
}

export function useHappyComposerRuntime(props: {
    session: Session
    isSending: boolean
    onSendMessage: (text: string, attachments?: AttachmentMetadata[]) => void
    onAbort: () => Promise<void>
    attachmentAdapter?: AttachmentAdapter
    allowSendWhenInactive?: boolean
}) {
    const onNew = useCallback(async (message: AppendMessage) => {
        const { text, attachments } = extractMessageContent(message)
        if (!text && attachments.length === 0) return
        props.onSendMessage(text, attachments.length > 0 ? attachments : undefined)
    }, [props.onSendMessage])

    const onCancel = useCallback(async () => {
        await props.onAbort()
    }, [props.onAbort])

    const adapter = useMemo(() => ({
        isDisabled: props.isSending || (!props.session.active && !props.allowSendWhenInactive),
        isRunning: props.session.thinking,
        messages: EMPTY_THREAD_MESSAGES,
        convertMessage: (message: ThreadMessageLike) => message,
        onNew,
        onCancel,
        adapters: props.attachmentAdapter ? { attachments: props.attachmentAdapter } : undefined,
        unstable_capabilities: { copy: true }
    }), [
        props.session.active,
        props.isSending,
        props.allowSendWhenInactive,
        props.session.thinking,
        onNew,
        onCancel,
        props.attachmentAdapter
    ])

    return useExternalStoreRuntime(adapter)
}
