import { useCallback, useRef } from 'react'
import type { ApiClient } from '@/api/client'
import type { Suggestion } from '@/hooks/useActiveSuggestions'

function levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length

    const matrix = Array.from({ length: b.length + 1 }, (_, i) =>
        Array.from({ length: a.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    )

    for (let i = 1; i <= b.length; i += 1) {
        for (let j = 1; j <= a.length; j += 1) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1
            matrix[i]![j] = Math.min(
                matrix[i - 1]![j]! + 1,
                matrix[i]![j - 1]! + 1,
                matrix[i - 1]![j - 1]! + cost
            )
        }
    }

    return matrix[b.length]![a.length]!
}

function detectSeparator(value: string): '/' | '\\' {
    return value.includes('\\') && !value.includes('/') ? '\\' : '/'
}

function trimTrailingSeparators(value: string): string {
    return value.replace(/[\\/]+$/, '')
}

function parseDirectoryQuery(query: string): { basePath: string | null; fragment: string; separator: '/' | '\\' } {
    const trimmed = query.trim()
    const separator = detectSeparator(trimmed)

    if (!trimmed) {
        return { basePath: null, fragment: '', separator }
    }

    const normalized = trimmed
    const endsWithSeparator = /[\\/]$/.test(normalized)

    if (endsWithSeparator) {
        const basePath = trimTrailingSeparators(normalized)
        return {
            basePath: basePath || separator,
            fragment: '',
            separator
        }
    }

    const lastSlash = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
    if (lastSlash === -1) {
        return {
            basePath: null,
            fragment: normalized,
            separator
        }
    }

    const basePath = normalized.slice(0, lastSlash)
    const fragment = normalized.slice(lastSlash + 1)
    return {
        basePath: basePath || separator,
        fragment,
        separator
    }
}

function rankSuggestion(label: string, fragment: string): number {
    const loweredLabel = label.toLowerCase()
    const loweredFragment = fragment.toLowerCase()

    if (!loweredFragment) return 0
    if (loweredLabel === loweredFragment) return 0
    if (loweredLabel.startsWith(loweredFragment)) return 1
    if (loweredLabel.includes(loweredFragment)) return 2

    const distance = levenshteinDistance(loweredFragment, loweredLabel)
    return distance <= Math.max(2, Math.floor(loweredFragment.length / 2))
        ? 3 + distance
        : Number.POSITIVE_INFINITY
}

function joinPath(basePath: string, name: string, separator: '/' | '\\'): string {
    if (basePath === separator) {
        return `${separator}${name}${separator}`
    }
    const trimmedBase = trimTrailingSeparators(basePath)
    return `${trimmedBase}${separator}${name}${separator}`
}

export function useMachineDirectoryAutocomplete(
    api: ApiClient,
    machineId: string | null
): {
    getSuggestions: (query: string, knownPaths: string[]) => Promise<Suggestion[]>
} {
    const cacheRef = useRef(new Map<string, string[]>())

    const getSuggestions = useCallback(async (query: string, knownPaths: string[]): Promise<Suggestion[]> => {
        const trimmed = query.trim()
        if (!trimmed) {
            return []
        }

        const { basePath, fragment, separator } = parseDirectoryQuery(trimmed)
        const normalizedKnownPaths = knownPaths
            .map((path) => trimTrailingSeparators(path))
            .filter(Boolean)

        const localSuggestions = normalizedKnownPaths
            .map((path) => ({
                text: /[\\/]$/.test(path) ? path : `${path}${separator}`,
                score: rankSuggestion(path.split(/[\\/]/).filter(Boolean).pop() ?? path, fragment || trimmed)
            }))
            .filter((entry) => Number.isFinite(entry.score))

        let remoteSuggestions: string[] = []
        if (api && machineId && basePath) {
            const cacheKey = `${machineId}:${basePath}`
            const cached = cacheRef.current.get(cacheKey)
            const directoryNames = cached ?? await (async () => {
                const response = await api.listMachineDirectory(machineId, basePath)
                const names = response.success && response.entries
                    ? response.entries
                        .filter((entry) => entry.type === 'directory')
                        .map((entry) => entry.name)
                    : []
                cacheRef.current.set(cacheKey, names)
                return names
            })()

            remoteSuggestions = directoryNames
                .map((name) => ({
                    text: joinPath(basePath, name, separator),
                    score: rankSuggestion(name, fragment)
                }))
                .filter((entry) => Number.isFinite(entry.score))
                .sort((left, right) => left.score - right.score || left.text.localeCompare(right.text))
                .map((entry) => entry.text)
        }

        const merged = new Map<string, number>()
        for (const entry of localSuggestions) {
            merged.set(entry.text, entry.score)
        }
        for (const text of remoteSuggestions) {
            const label = text.split(/[\\/]/).filter(Boolean).pop() ?? text
            const score = rankSuggestion(label, fragment)
            const existing = merged.get(text)
            merged.set(text, existing === undefined ? score : Math.min(existing, score))
        }

        return Array.from(merged.entries())
            .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
            .slice(0, 12)
            .map(([text]) => ({
                key: text,
                text,
                label: text
            }))
    }, [api, machineId])

    return { getSuggestions }
}
