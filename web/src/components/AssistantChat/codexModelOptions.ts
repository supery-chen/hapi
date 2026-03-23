export type CodexComposerModelOption = {
    value: string | null
    label: string
}

const CODEX_MODEL_OPTIONS: CodexComposerModelOption[] = [
    { value: null, label: 'Auto' },
    { value: 'gpt-5.4', label: 'GPT-5.4' },
    { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
    { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
    { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' }
]

function normalizeCodexComposerModel(model?: string | null): string | null {
    const trimmedModel = model?.trim()
    if (!trimmedModel || trimmedModel === 'auto' || trimmedModel === 'default') {
        return null
    }

    return trimmedModel
}

export function getCodexComposerModelOptions(currentModel?: string | null): CodexComposerModelOption[] {
    const normalizedCurrentModel = normalizeCodexComposerModel(currentModel)
    if (!normalizedCurrentModel) {
        return CODEX_MODEL_OPTIONS
    }

    const isKnown = CODEX_MODEL_OPTIONS.some((option) => option.value === normalizedCurrentModel)
    if (isKnown) {
        return CODEX_MODEL_OPTIONS
    }

    return [
        CODEX_MODEL_OPTIONS[0]!,
        { value: normalizedCurrentModel, label: normalizedCurrentModel },
        ...CODEX_MODEL_OPTIONS.slice(1)
    ]
}

export function getNextCodexComposerModel(currentModel?: string | null): string | null {
    const normalizedCurrentModel = normalizeCodexComposerModel(currentModel)
    const options = getCodexComposerModelOptions(normalizedCurrentModel)
    const currentIndex = options.findIndex((option) => option.value === normalizedCurrentModel)

    if (currentIndex === -1) {
        return options[0]?.value ?? null
    }

    return options[(currentIndex + 1) % options.length]?.value ?? null
}
