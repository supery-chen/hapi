import { Children, isValidElement, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { MARKDOWN_PLUGINS, defaultComponents } from '@/components/assistant-ui/markdown-text'
import { SyntaxHighlighter } from '@/components/assistant-ui/shiki-highlighter'
import { CopyIcon, CheckIcon } from '@/components/icons'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
    content: string
    components?: Components
}

type CodeBlockProps = {
    code: string
    language?: string
}

function extractCodeLanguage(className?: string): string | undefined {
    if (!className) return undefined
    const match = /(?:^|\s)language-([A-Za-z0-9_-]+)/.exec(className)
    return match?.[1]?.toLowerCase()
}

function MarkdownCodeBlock(props: CodeBlockProps) {
    const { copied, copy } = useCopyToClipboard()
    const language = props.language && props.language !== 'unknown' ? props.language : ''

    return (
        <div className="aui-md-pre-wrapper min-w-0 w-full max-w-full overflow-x-auto overflow-y-hidden">
            <div className="aui-md-codeheader flex items-center justify-between rounded-t-md bg-[var(--app-code-bg)] px-2 py-1">
                <div className="min-w-0 flex-1 pr-2 text-xs font-mono text-[var(--app-hint)]">
                    {language}
                </div>
                <button
                    type="button"
                    onClick={() => copy(props.code)}
                    className="shrink-0 rounded p-1 text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]"
                    title="Copy"
                >
                    {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                </button>
            </div>
            <SyntaxHighlighter code={props.code} language={props.language ?? ''} />
        </div>
    )
}

const assistantMarkdownComponents = defaultComponents as Components & Record<string, unknown>
const {
    SyntaxHighlighter: _unusedSyntaxHighlighter,
    CodeHeader: _unusedCodeHeader,
    code: _unusedCode,
    pre: _unusedPre,
    ...baseMarkdownComponents
} = assistantMarkdownComponents

function MarkdownContent(props: MarkdownRendererProps) {
    const mergedComponents: Components = {
        ...baseMarkdownComponents,
        pre(preProps: ComponentPropsWithoutRef<'pre'>) {
            const child = Children.only(preProps.children)
            if (!isValidElement(child)) {
                return (
                    <pre
                        {...preProps}
                        className={cn(
                            'aui-md-pre m-0 w-max min-w-full rounded-b-md rounded-t-none bg-[var(--app-code-bg)] p-2 text-sm',
                            preProps.className
                        )}
                    />
                )
            }

            const codeProps = child.props as {
                className?: string
                children?: ReactNode
            }
            const className = typeof codeProps.className === 'string' ? codeProps.className : undefined
            const language = extractCodeLanguage(className)
            const code = String(codeProps.children ?? '').replace(/\n$/, '')

            return <MarkdownCodeBlock code={code} language={language} />
        },
        code(codeProps) {
            return (
                <code
                    className={cn(
                        'aui-md-code break-words rounded bg-[var(--app-inline-code-bg)] px-[0.3em] py-[0.1em] font-mono text-[0.9em]',
                        codeProps.className
                    )}
                >
                    {codeProps.children}
                </code>
            )
        },
        ...props.components
    }

    return (
        <div className={cn('aui-md min-w-0 max-w-full break-words text-base')}>
            <ReactMarkdown
                remarkPlugins={MARKDOWN_PLUGINS}
                components={mergedComponents}
            >
                {props.content}
            </ReactMarkdown>
        </div>
    )
}

export function MarkdownRenderer(props: MarkdownRendererProps) {
    return <MarkdownContent {...props} />
}
