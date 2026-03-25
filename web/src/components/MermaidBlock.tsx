import { useEffect, useId, useState } from 'react'

type MermaidBlockProps = {
    chart: string
}

let mermaidInitialized = false
let mermaidLoader: Promise<(typeof import('mermaid'))['default']> | null = null

async function getMermaid() {
    if (!mermaidLoader) {
        mermaidLoader = import('mermaid').then((module) => module.default)
    }

    const mermaid = await mermaidLoader
    if (!mermaidInitialized) {
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'default',
            suppressErrorRendering: true
        })
        mermaidInitialized = true
    }

    return mermaid
}

export function MermaidBlock(props: MermaidBlockProps) {
    const id = useId()
    const [svg, setSvg] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false

        async function render() {
            try {
                const mermaid = await getMermaid()
                const result = await mermaid.render(`mermaid-${id.replace(/[:]/g, '-')}`, props.chart)
                if (cancelled) return
                setSvg(result.svg)
                setError(null)
            } catch (renderError) {
                if (cancelled) return
                setSvg(null)
                setError(renderError instanceof Error ? renderError.message : 'Failed to render Mermaid diagram')
            }
        }

        void render()

        return () => {
            cancelled = true
        }
    }, [id, props.chart])

    if (error) {
        return (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Mermaid render failed: {error}
            </div>
        )
    }

    if (!svg) {
        return (
            <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3 text-sm text-[var(--app-hint)]">
                Rendering Mermaid diagram…
            </div>
        )
    }

    return (
        <div className="overflow-x-auto rounded-md border border-[var(--app-border)] bg-white p-3">
            <div
                className="min-w-fit"
                dangerouslySetInnerHTML={{ __html: svg }}
            />
        </div>
    )
}
