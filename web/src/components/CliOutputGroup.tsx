import { useMemo } from 'react'
import type { CliOutputBlock as CliOutputBlockType } from '@/chat/types'
import { CliOutputBlock, extractCommandName } from '@/components/CliOutputBlock'
import { usePersistentGroupOpenState } from '@/lib/collapsible-group-state'
import { useTranslation } from '@/lib/use-translation'

function Chevron(props: { open: boolean }) {
    return (
        <svg
            className={`h-4 w-4 transition-transform ${props.open ? 'rotate-90' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
        >
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

export function CliOutputGroup(props: {
    blocks: CliOutputBlockType[]
    source: 'user' | 'assistant'
}) {
    const { t } = useTranslation()
    const memberIds = useMemo(
        () => props.blocks.map((block) => block.id),
        [props.blocks]
    )
    const [open, setOpen] = usePersistentGroupOpenState(memberIds, false)

    const preview = useMemo(() => {
        const labels = props.blocks
            .map((block) => extractCommandName(block.text))
            .filter((value): value is string => Boolean(value))
        return labels.slice(0, 2).join(' • ')
    }, [props.blocks])

    const alignClass = props.source === 'user' ? 'ml-auto w-full max-w-[92%]' : ''

    return (
        <div className={`px-1 min-w-0 max-w-full overflow-x-hidden ${alignClass}`}>
            <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] shadow-sm">
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                >
                    <div className="min-w-0 flex items-center gap-2">
                        <span className="shrink-0 text-[var(--app-hint)]">
                            <Chevron open={open} />
                        </span>
                        <div className="min-w-0">
                            <div className="text-sm font-medium text-[var(--app-fg)]">
                                {t('terminal.groupCount', {
                                    n: props.blocks.length,
                                    s: props.blocks.length === 1 ? '' : 's'
                                })}
                            </div>
                            {preview ? (
                                <div className="truncate text-xs text-[var(--app-hint)]">
                                    {preview}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <span className="shrink-0 text-xs text-[var(--app-hint)]">
                        {open ? t('terminal.collapse') : t('terminal.expand')}
                    </span>
                </button>

                {open ? (
                    <div className="flex flex-col gap-2 border-t border-[var(--app-divider)] p-2">
                        {props.blocks.map((block) => (
                            <CliOutputBlock key={block.id} text={block.text} />
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
