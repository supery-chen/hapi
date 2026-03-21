import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { SlashCommandDefinition } from '@/types/api'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { queryKeys } from '@/lib/query-keys'

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

export function useSlashCommands(
    api: ApiClient | null,
    sessionId: string | null
): {
    commands: SlashCommandDefinition[]
    isLoading: boolean
    error: string | null
    getSuggestions: (query: string) => Promise<Suggestion[]>
} {
    const resolvedSessionId = sessionId ?? 'unknown'

    const query = useQuery({
        queryKey: queryKeys.slashCommands(resolvedSessionId),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.getSlashCommands(sessionId)
        },
        enabled: Boolean(api && sessionId),
        staleTime: Infinity,
        gcTime: 30 * 60 * 1000,
        retry: false,
    })

    const commands = useMemo(() => {
        if (!query.data?.success || !query.data.commands) {
            return []
        }
        return query.data.commands
    }, [query.data])

    const getSuggestions = useCallback(async (queryText: string): Promise<Suggestion[]> => {
        const searchTerm = queryText.startsWith('/')
            ? queryText.slice(1).toLowerCase()
            : queryText.toLowerCase()

        if (!searchTerm) {
            return commands.map((command) => ({
                key: `/${command.name}`,
                text: `/${command.name}`,
                label: `/${command.name}`,
                description: command.description,
                content: command.content,
                source: command.source,
                kind: command.kind,
                argPolicy: command.argPolicy
            }))
        }

        const maxDistance = Math.max(2, Math.floor(searchTerm.length / 2))
        return commands
            .map((command) => {
                const name = command.name.toLowerCase()
                let score: number
                if (name === searchTerm) score = 0
                else if (name.startsWith(searchTerm)) score = 1
                else if (name.includes(searchTerm)) score = 2
                else {
                    const distance = levenshteinDistance(searchTerm, name)
                    score = distance <= maxDistance ? 3 + distance : Number.POSITIVE_INFINITY
                }
                return { command, score }
            })
            .filter((entry) => Number.isFinite(entry.score))
            .sort((left, right) => left.score - right.score)
            .map(({ command }) => ({
                key: `/${command.name}`,
                text: `/${command.name}`,
                label: `/${command.name}`,
                description: command.description,
                content: command.content,
                source: command.source,
                kind: command.kind,
                argPolicy: command.argPolicy
            }))
    }, [commands])

    return {
        commands,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : null,
        getSuggestions,
    }
}
