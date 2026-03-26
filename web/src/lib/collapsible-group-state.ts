import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react'

const openStateByMemberId = new Map<string, boolean>()

function readOpenState(memberIds: readonly string[], fallback: boolean): boolean {
    for (const memberId of memberIds) {
        const stored = openStateByMemberId.get(memberId)
        if (stored !== undefined) {
            return stored
        }
    }
    return fallback
}

export function usePersistentGroupOpenState(
    memberIds: readonly string[],
    defaultOpen: boolean
): [boolean, (next: SetStateAction<boolean>) => void] {
    const memberIdsKey = useMemo(() => memberIds.join('\u0000'), [memberIds])
    const [open, setOpen] = useState<boolean>(() => readOpenState(memberIds, defaultOpen))

    useEffect(() => {
        setOpen(readOpenState(memberIds, defaultOpen))
    }, [memberIds, memberIdsKey, defaultOpen])

    const updateOpen = useCallback((next: SetStateAction<boolean>) => {
        setOpen((prev) => {
            const resolved = typeof next === 'function'
                ? (next as (value: boolean) => boolean)(prev)
                : next
            for (const memberId of memberIds) {
                openStateByMemberId.set(memberId, resolved)
            }
            return resolved
        })
    }, [memberIds])

    return [open, updateOpen]
}
