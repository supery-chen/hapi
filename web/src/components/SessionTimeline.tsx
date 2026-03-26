import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChatBlock } from '@/chat/types'
import { TranscriptBlockList } from '@/components/TranscriptBlockList'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { useTranslation } from '@/lib/use-translation'

function JumpToBottomButton(props: { visible: boolean; count: number; onClick: () => void }) {
    const { t } = useTranslation()
    if (!props.visible) {
        return null
    }

    return (
        <button
            type="button"
            onClick={props.onClick}
            aria-label={t('misc.jumpToBottom')}
            title={t('misc.jumpToBottom')}
            className="absolute bottom-20 right-4 z-10 inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-[var(--app-button)] px-3 text-[var(--app-button-text)] shadow-lg transition-transform hover:scale-[1.03]"
        >
            <span aria-hidden="true" className="text-base leading-none">↓</span>
            {props.count > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
                    {props.count > 99 ? '99+' : props.count}
                </span>
            ) : null}
        </button>
    )
}

function MessageSkeleton() {
    const { t } = useTranslation()
    const rows = [
        { align: 'end', width: 'w-2/3', height: 'h-10' },
        { align: 'start', width: 'w-3/4', height: 'h-12' },
        { align: 'end', width: 'w-1/2', height: 'h-9' },
        { align: 'start', width: 'w-5/6', height: 'h-14' }
    ]

    return (
        <div role="status" aria-live="polite">
            <span className="sr-only">{t('misc.loadingMessages')}</span>
            <div className="space-y-3 animate-pulse">
                {rows.map((row, index) => (
                    <div key={`skeleton-${index}`} className={row.align === 'end' ? 'flex justify-end' : 'flex justify-start'}>
                        <div className={`${row.height} ${row.width} rounded-xl bg-[var(--app-subtle-bg)]`} />
                    </div>
                ))}
            </div>
        </div>
    )
}

export function SessionTimeline(props: {
    blocks: ChatBlock[]
    messagesWarning: string | null
    hasMoreMessages: boolean
    isLoadingMessages: boolean
    isLoadingMoreMessages: boolean
    pendingCount: number
    rawMessagesCount: number
    normalizedMessagesCount: number
    onLoadMore: () => Promise<unknown>
    onFlushPending: () => void
    onAtBottomChange: (atBottom: boolean) => void
}) {
    const { t } = useTranslation()
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const contentRef = useRef<HTMLDivElement | null>(null)
    const loadLockRef = useRef(false)
    const pendingScrollRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null)
    const loadStartedRef = useRef(false)
    const prevLoadingMoreRef = useRef(false)
    const isLoadingMoreRef = useRef(props.isLoadingMoreMessages)
    const isLoadingMessagesRef = useRef(props.isLoadingMessages)
    const hasMoreMessagesRef = useRef(props.hasMoreMessages)
    const onLoadMoreRef = useRef(props.onLoadMore)
    const onAtBottomChangeRef = useRef(props.onAtBottomChange)
    const onFlushPendingRef = useRef(props.onFlushPending)
    const lastScrollTopRef = useRef(0)
    const atBottomRef = useRef(true)
    const prevBlocksRef = useRef<ChatBlock[]>(props.blocks)
    const didInitialScrollRef = useRef(false)
    const [isAtBottom, setIsAtBottom] = useState(true)
    const [autoStickToBottom, setAutoStickToBottom] = useState(true)
    const autoStickToBottomRef = useRef(autoStickToBottom)

    useEffect(() => {
        autoStickToBottomRef.current = autoStickToBottom
    }, [autoStickToBottom])

    useEffect(() => {
        isLoadingMessagesRef.current = props.isLoadingMessages
    }, [props.isLoadingMessages])

    useEffect(() => {
        hasMoreMessagesRef.current = props.hasMoreMessages
    }, [props.hasMoreMessages])

    useEffect(() => {
        onLoadMoreRef.current = props.onLoadMore
    }, [props.onLoadMore])

    useEffect(() => {
        onAtBottomChangeRef.current = props.onAtBottomChange
    }, [props.onAtBottomChange])

    useEffect(() => {
        onFlushPendingRef.current = props.onFlushPending
    }, [props.onFlushPending])

    const handleLoadMore = useCallback(() => {
        if (isLoadingMessagesRef.current || isLoadingMoreRef.current || !hasMoreMessagesRef.current || loadLockRef.current) {
            return
        }

        const viewport = viewportRef.current
        if (!viewport) {
            return
        }

        pendingScrollRef.current = {
            scrollTop: viewport.scrollTop,
            scrollHeight: viewport.scrollHeight
        }
        loadLockRef.current = true
        loadStartedRef.current = false

        void onLoadMoreRef.current()
            .catch((error) => {
                pendingScrollRef.current = null
                loadLockRef.current = false
                console.error('Failed to load older messages:', error)
            })
            .finally(() => {
                if (!loadStartedRef.current && !isLoadingMoreRef.current && pendingScrollRef.current) {
                    pendingScrollRef.current = null
                    loadLockRef.current = false
                }
            })
    }, [])

    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) {
            return
        }

        const NEAR_BOTTOM_PX = 120
        const LOAD_MORE_TRIGGER_PX = 80
        const USER_SCROLL_UP_EPSILON_PX = 4

        const handleScroll = () => {
            const currentScrollTop = viewport.scrollTop
            const distanceFromBottom = viewport.scrollHeight - currentScrollTop - viewport.clientHeight
            const isNearBottom = distanceFromBottom <= NEAR_BOTTOM_PX
            const scrolledUp = currentScrollTop < lastScrollTopRef.current - USER_SCROLL_UP_EPSILON_PX

            if (scrolledUp) {
                if (autoStickToBottomRef.current) {
                    autoStickToBottomRef.current = false
                    setAutoStickToBottom(false)
                }
            } else if (isNearBottom) {
                if (!autoStickToBottomRef.current) {
                    autoStickToBottomRef.current = true
                    setAutoStickToBottom(true)
                }
            }

            if (isNearBottom !== atBottomRef.current) {
                atBottomRef.current = isNearBottom
                setIsAtBottom(isNearBottom)
                onAtBottomChangeRef.current(isNearBottom)
                if (isNearBottom) {
                    onFlushPendingRef.current()
                }
            }

            lastScrollTopRef.current = currentScrollTop

            if (scrolledUp && currentScrollTop <= LOAD_MORE_TRIGGER_PX) {
                handleLoadMore()
            }
        }

        viewport.addEventListener('scroll', handleScroll, { passive: true })
        handleScroll()
        return () => viewport.removeEventListener('scroll', handleScroll)
    }, [handleLoadMore])

    const scrollToBottom = useCallback(() => {
        const viewport = viewportRef.current
        if (!viewport) {
            return
        }

        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
        lastScrollTopRef.current = viewport.scrollTop
        autoStickToBottomRef.current = true
        setAutoStickToBottom(true)
        if (!atBottomRef.current) {
            atBottomRef.current = true
            setIsAtBottom(true)
            onAtBottomChangeRef.current(true)
        }
        onFlushPendingRef.current()
    }, [])

    useEffect(() => {
        const viewport = viewportRef.current
        const content = contentRef.current
        if (!viewport || !content || typeof ResizeObserver === 'undefined') {
            return
        }

        const observer = new ResizeObserver(() => {
            if (pendingScrollRef.current || !autoStickToBottomRef.current) {
                return
            }

            viewport.scrollTop = viewport.scrollHeight
            lastScrollTopRef.current = viewport.scrollTop
            if (!atBottomRef.current) {
                atBottomRef.current = true
                setIsAtBottom(true)
                onAtBottomChangeRef.current(true)
            }
        })

        observer.observe(content)
        return () => observer.disconnect()
    }, [])

    useLayoutEffect(() => {
        const viewport = viewportRef.current
        if (!viewport || didInitialScrollRef.current) {
            return
        }

        didInitialScrollRef.current = true
        viewport.scrollTop = viewport.scrollHeight
        lastScrollTopRef.current = viewport.scrollTop
        atBottomRef.current = true
        setIsAtBottom(true)
    }, [])

    useLayoutEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) {
            prevBlocksRef.current = props.blocks
            return
        }

        if (pendingScrollRef.current) {
            const pending = pendingScrollRef.current
            const delta = viewport.scrollHeight - pending.scrollHeight
            viewport.scrollTop = pending.scrollTop + delta
            lastScrollTopRef.current = viewport.scrollTop
            pendingScrollRef.current = null
            loadLockRef.current = false
            prevBlocksRef.current = props.blocks
            return
        }

        if (prevBlocksRef.current === props.blocks) {
            return
        }
        prevBlocksRef.current = props.blocks

        if (autoStickToBottomRef.current) {
            viewport.scrollTop = viewport.scrollHeight
            lastScrollTopRef.current = viewport.scrollTop
            if (!atBottomRef.current) {
                atBottomRef.current = true
                setIsAtBottom(true)
                onAtBottomChangeRef.current(true)
            }
        }
    }, [props.blocks])

    useEffect(() => {
        isLoadingMoreRef.current = props.isLoadingMoreMessages
        if (props.isLoadingMoreMessages) {
            loadStartedRef.current = true
        }
        if (prevLoadingMoreRef.current && !props.isLoadingMoreMessages && pendingScrollRef.current) {
            pendingScrollRef.current = null
            loadLockRef.current = false
        }
        prevLoadingMoreRef.current = props.isLoadingMoreMessages
    }, [props.isLoadingMoreMessages])

    const showSkeleton = props.isLoadingMessages && props.rawMessagesCount === 0 && props.pendingCount === 0

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                <div ref={contentRef} className="mx-auto w-full max-w-content min-w-0 p-3">
                    {showSkeleton ? (
                        <MessageSkeleton />
                    ) : (
                        <>
                            {props.messagesWarning ? (
                                <div className="mb-3 rounded-md bg-amber-500/10 p-2 text-xs">
                                    {props.messagesWarning}
                                </div>
                            ) : null}

                            {props.hasMoreMessages && !props.isLoadingMessages ? (
                                <div className="mb-2 py-1">
                                    <div className="mx-auto w-fit">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleLoadMore}
                                            disabled={props.isLoadingMoreMessages || props.isLoadingMessages}
                                            aria-busy={props.isLoadingMoreMessages}
                                            className="gap-1.5 text-xs opacity-80 hover:opacity-100"
                                        >
                                            {props.isLoadingMoreMessages ? (
                                                <>
                                                    <Spinner size="sm" label={null} className="text-current" />
                                                    {t('misc.loading')}
                                                </>
                                            ) : (
                                                <>
                                                    <span aria-hidden="true">↑</span>
                                                    {t('misc.loadOlder')}
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            ) : null}

                            {import.meta.env.DEV && props.normalizedMessagesCount === 0 && props.rawMessagesCount > 0 ? (
                                <div className="mb-2 rounded-md bg-amber-500/10 p-2 text-xs">
                                    Message normalization returned 0 items for {props.rawMessagesCount} messages (see `web/src/chat/normalize.ts`).
                                </div>
                            ) : null}

                            <TranscriptBlockList blocks={props.blocks} />
                        </>
                    )}
                </div>
            </div>

            <JumpToBottomButton visible={!isAtBottom} count={props.pendingCount} onClick={scrollToBottom} />
        </div>
    )
}
