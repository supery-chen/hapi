export function isCodexFamilyFlavor(flavor?: string | null): boolean {
    return flavor === 'codex'
}

export function isKnownFlavor(flavor?: string | null): boolean {
    return isCodexFamilyFlavor(flavor)
}
