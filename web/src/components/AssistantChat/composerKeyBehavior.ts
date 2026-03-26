export type ComposerKeyAction = 'none' | 'submit' | 'select-suggestion'

export function getComposerKeyAction(args: {
    key: string
    isTouch: boolean
    suggestionsOpen: boolean
    shiftKey?: boolean
    ctrlKey?: boolean
    altKey?: boolean
    metaKey?: boolean
}): ComposerKeyAction {
    const hasModifier = Boolean(args.shiftKey || args.ctrlKey || args.altKey || args.metaKey)

    if (args.suggestionsOpen) {
        if (!hasModifier && args.key === 'Enter') {
            return 'select-suggestion'
        }
        if (!args.isTouch && !hasModifier && args.key === 'Tab') {
            return 'select-suggestion'
        }
        return 'none'
    }

    if (args.key === 'Enter' && !args.isTouch && !hasModifier) {
        return 'submit'
    }

    return 'none'
}
