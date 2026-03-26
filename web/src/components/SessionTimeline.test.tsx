import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ApiClient } from '@/api/client'
import { HappyChatProvider } from '@/components/AssistantChat/context'
import { I18nProvider } from '@/lib/i18n-context'
import { SessionTimeline } from './SessionTimeline'

let scrollTopMap = new WeakMap<HTMLElement, number>()
let resizeObserverCallback: ResizeObserverCallback | null = null

describe('SessionTimeline', () => {
    beforeEach(() => {
        scrollTopMap = new WeakMap()
        resizeObserverCallback = null

        const IntersectionObserverMock = class {
            observe() {}
            unobserve() {}
            disconnect() {}
            takeRecords() {
                return []
            }
        }

        Object.defineProperty(globalThis, 'IntersectionObserver', {
            configurable: true,
            writable: true,
            value: IntersectionObserverMock
        })

        const ResizeObserverMock = class {
            constructor(callback: ResizeObserverCallback) {
                resizeObserverCallback = callback
            }
            observe() {}
            unobserve() {}
            disconnect() {}
        }

        Object.defineProperty(globalThis, 'ResizeObserver', {
            configurable: true,
            writable: true,
            value: ResizeObserverMock
        })

        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            writable: true,
            value: vi.fn().mockImplementation(() => ({
                matches: false,
                media: '',
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }))
        })

        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
            configurable: true,
            get() {
                return 1000
            }
        })

        Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
            configurable: true,
            get() {
                return 400
            }
        })

        Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
            configurable: true,
            get() {
                return scrollTopMap.get(this as HTMLElement) ?? 0
            },
            set(value: number) {
                scrollTopMap.set(this as HTMLElement, value)
            }
        })

        Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
            configurable: true,
            value(options: { top?: number } | number) {
                if (typeof options === 'number') {
                    scrollTopMap.set(this as HTMLElement, options)
                    return
                }
                scrollTopMap.set(this as HTMLElement, options.top ?? 0)
            }
        })
    })

    it('scrolls to bottom on initial mount', () => {
        const { container } = render(
            <I18nProvider>
                <HappyChatProvider
                    value={{
                        api: {} as ApiClient,
                        sessionId: 'session-1',
                        metadata: null,
                        disabled: false,
                        onRefresh: vi.fn()
                    }}
                >
                    <SessionTimeline
                        blocks={[{
                            kind: 'user-text',
                            id: 'user-1',
                            localId: null,
                            createdAt: 1,
                            text: 'hello'
                        }]}
                        messagesWarning={null}
                        hasMoreMessages={false}
                        isLoadingMessages={false}
                        isLoadingMoreMessages={false}
                        pendingCount={0}
                        rawMessagesCount={1}
                        normalizedMessagesCount={1}
                        onLoadMore={vi.fn(async () => undefined)}
                        onFlushPending={vi.fn()}
                        onAtBottomChange={vi.fn()}
                    />
                </HappyChatProvider>
            </I18nProvider>
        )

        const viewport = container.querySelector('.overflow-y-auto') as HTMLDivElement | null
        expect(viewport).not.toBeNull()
        expect(viewport?.scrollTop).toBe(1000)
    })

    it('shows a jump-to-bottom button when scrolled away from the bottom', () => {
        const { container } = render(
            <I18nProvider>
                <HappyChatProvider
                    value={{
                        api: {} as ApiClient,
                        sessionId: 'session-1',
                        metadata: null,
                        disabled: false,
                        onRefresh: vi.fn()
                    }}
                >
                    <SessionTimeline
                        blocks={[{
                            kind: 'user-text',
                            id: 'user-1',
                            localId: null,
                            createdAt: 1,
                            text: 'hello'
                        }]}
                        messagesWarning={null}
                        hasMoreMessages={false}
                        isLoadingMessages={false}
                        isLoadingMoreMessages={false}
                        pendingCount={3}
                        rawMessagesCount={1}
                        normalizedMessagesCount={1}
                        onLoadMore={vi.fn(async () => undefined)}
                        onFlushPending={vi.fn()}
                        onAtBottomChange={vi.fn()}
                    />
                </HappyChatProvider>
            </I18nProvider>
        )

        const viewport = container.querySelector('.overflow-y-auto') as HTMLDivElement
        viewport.scrollTop = 0
        fireEvent.scroll(viewport)

        const button = screen.getByRole('button', { name: 'Jump to latest' })
        expect(button).toBeInTheDocument()

        fireEvent.click(button)
        expect(viewport.scrollTop).toBe(1000)
    })

    it('keeps sticking to bottom when content height grows after initial render', () => {
        let scrollHeightValue = 1000

        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
            configurable: true,
            get() {
                return scrollHeightValue
            }
        })

        const { container } = render(
            <I18nProvider>
                <HappyChatProvider
                    value={{
                        api: {} as ApiClient,
                        sessionId: 'session-1',
                        metadata: null,
                        disabled: false,
                        onRefresh: vi.fn()
                    }}
                >
                    <SessionTimeline
                        blocks={[{
                            kind: 'agent-text',
                            id: 'agent-1',
                            localId: null,
                            createdAt: 1,
                            text: '```ts\nconsole.log(1)\n```'
                        }]}
                        messagesWarning={null}
                        hasMoreMessages={false}
                        isLoadingMessages={false}
                        isLoadingMoreMessages={false}
                        pendingCount={0}
                        rawMessagesCount={1}
                        normalizedMessagesCount={1}
                        onLoadMore={vi.fn(async () => undefined)}
                        onFlushPending={vi.fn()}
                        onAtBottomChange={vi.fn()}
                    />
                </HappyChatProvider>
            </I18nProvider>
        )

        const viewport = container.querySelector('.overflow-y-auto') as HTMLDivElement
        expect(viewport.scrollTop).toBe(1000)

        scrollHeightValue = 1400
        resizeObserverCallback?.([], {} as ResizeObserver)

        expect(viewport.scrollTop).toBe(1400)
    })
})
