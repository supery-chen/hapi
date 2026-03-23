import type { AttachmentMetadata } from '@/api/types'

/**
 * Codex accepts file attachments via @path references in the prompt.
 */
export function formatAttachmentsForCodex(attachments: AttachmentMetadata[] | undefined): string {
    if (!attachments || attachments.length === 0) {
        return ''
    }
    return attachments.map(a => `@${a.path}`).join(' ')
}

/**
 * Combines text and formatted attachments into a single prompt string.
 */
export function formatMessageWithAttachments(
    text: string,
    attachments: AttachmentMetadata[] | undefined
): string {
    const attachmentText = formatAttachmentsForCodex(attachments)
    if (!attachmentText) {
        return text
    }
    if (!text) {
        return attachmentText
    }
    return `${attachmentText}\n\n${text}`
}
