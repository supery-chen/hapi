import { useCallback, useRef } from 'react'
import type { ApiClient } from '@/api/client'
import type { FileSearchItem } from '@/types/api'
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

function rankFileSearchItem(item: FileSearchItem, searchTerm: string): number {
    const path = item.fullPath.toLowerCase()
    const name = item.fileName.toLowerCase()

    if (!searchTerm) {
        return item.fileType === 'folder' ? 0 : 1
    }
    if (path === searchTerm || name === searchTerm) return 0
    if (name.startsWith(searchTerm)) return 1
    if (path.startsWith(searchTerm)) return 2
    if (name.includes(searchTerm)) return 3
    if (path.includes(searchTerm)) return 4

    const distance = Math.min(
        levenshteinDistance(searchTerm, name),
        levenshteinDistance(searchTerm, path)
    )

    return distance <= Math.max(2, Math.floor(searchTerm.length / 2))
        ? 5 + distance
        : Number.POSITIVE_INFINITY
}

function toSuggestion(item: FileSearchItem): Suggestion {
    const fullPath = item.fileType === 'folder'
        ? `@${item.fullPath}/`
        : `@${item.fullPath}`

    return {
        key: `${item.fileType}:${item.fullPath}`,
        text: fullPath,
        label: fullPath,
        source: 'builtin'
    }
}

export function useFileSuggestions(
    api: ApiClient | null,
    sessionId: string | null
): {
    getSuggestions: (query: string) => Promise<Suggestion[]>
} {
    const cacheRef = useRef(new Map<string, FileSearchItem[]>())

    const getSuggestions = useCallback(async (queryText: string): Promise<Suggestion[]> => {
        if (!api || !sessionId) {
            return []
        }

        const searchTerm = queryText.startsWith('@')
            ? queryText.slice(1).trim().toLowerCase()
            : queryText.trim().toLowerCase()

        if (!searchTerm) {
            return []
        }

        const cacheKey = searchTerm
        const cached = cacheRef.current.get(cacheKey)
        const items = cached
            ?? await (async () => {
                const response = await api.searchSessionFiles(sessionId, searchTerm, 300)
                const nextItems = response.success && response.files ? response.files : []
                cacheRef.current.set(cacheKey, nextItems)
                return nextItems
            })()

        return items
            .map((item) => ({ item, score: rankFileSearchItem(item, searchTerm) }))
            .filter((entry) => Number.isFinite(entry.score))
            .sort((left, right) => {
                if (left.score !== right.score) {
                    return left.score - right.score
                }
                if (left.item.fileType !== right.item.fileType) {
                    return left.item.fileType === 'folder' ? -1 : 1
                }
                return left.item.fullPath.localeCompare(right.item.fullPath)
            })
            .slice(0, 50)
            .map(({ item }) => toSuggestion(item))
    }, [api, sessionId])

    return { getSuggestions }
}
