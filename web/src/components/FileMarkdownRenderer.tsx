import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { defaultComponents } from '@/components/assistant-ui/markdown-text'
import { MermaidBlock } from '@/components/MermaidBlock'

type FileMarkdownRendererProps = {
    content: string
}

const { SyntaxHighlighter, CodeHeader, ...markdownComponents } = defaultComponents

const fileMarkdownComponents: Components = {
    ...markdownComponents,
    code(props) {
        const className = props.className ?? ''
        const language = className.replace(/^language-/, '').trim().toLowerCase()
        const childrenText = String(props.children ?? '').replace(/\n$/, '')

        if (language === 'mermaid') {
            return <MermaidBlock chart={childrenText} />
        }

        if (props.node?.position?.start.line !== props.node?.position?.end.line || className.startsWith('language-')) {
            return (
                <code className={cn('aui-md-codeblockcode font-mono', props.className)}>
                    {props.children}
                </code>
            )
        }

        return (
            <code
                className={cn(
                    'aui-md-code break-words rounded bg-[var(--app-inline-code-bg)] px-[0.3em] py-[0.1em] font-mono text-[0.9em]',
                    props.className
                )}
            >
                {props.children}
            </code>
        )
    }
}

export function FileMarkdownRenderer(props: FileMarkdownRendererProps) {
    return (
        <div className={cn('aui-md min-w-0 max-w-full break-words text-base')}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={fileMarkdownComponents}
            >
                {props.content}
            </ReactMarkdown>
        </div>
    )
}
