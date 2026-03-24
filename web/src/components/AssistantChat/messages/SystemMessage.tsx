import { useAssistantState } from '@assistant-ui/react'
import { CodexStatusSnapshotSchema } from '@hapi/protocol/schemas'
import { getEventPresentation } from '@/chat/presentation'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'
import { StatusSnapshotCard } from '@/components/AssistantChat/messages/StatusSnapshotCard'

export function HappySystemMessage() {
    const role = useAssistantState(({ message }) => message.role)
    const text = useAssistantState(({ message }) => {
        if (message.role !== 'system') return ''
        return message.content[0]?.type === 'text' ? message.content[0].text : ''
    })
    const icon = useAssistantState(({ message }) => {
        if (message.role !== 'system') return null
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        const event = custom?.kind === 'event' ? custom.event : undefined
        return event ? getEventPresentation(event).icon : null
    })
    const rawStatusSnapshot = useAssistantState(({ message }) => {
        if (message.role !== 'system') return null
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        const event = custom?.kind === 'event' ? custom.event : undefined
        if (!event || event.type !== 'status') return null
        return event.snapshot ?? null
    })
    const parsedStatusSnapshot = rawStatusSnapshot
        ? CodexStatusSnapshotSchema.safeParse(rawStatusSnapshot)
        : null
    const statusSnapshot = parsedStatusSnapshot?.success ? parsedStatusSnapshot.data : null

    if (role !== 'system') return null

    if (statusSnapshot) {
        return <StatusSnapshotCard snapshot={statusSnapshot} />
    }

    return (
        <div className="py-1">
            <div className="mx-auto w-fit max-w-[92%] px-2 text-center text-xs text-[var(--app-hint)] opacity-80">
                <span className="inline-flex items-center gap-1">
                    {icon ? <span aria-hidden="true">{icon}</span> : null}
                    <span>{text}</span>
                </span>
            </div>
        </div>
    )
}
