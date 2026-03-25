import { createHash } from 'node:crypto'
import type { RunnerLocallyPersistedState } from '@/persistence'

export type RunnerConnectionIdentity = {
    apiUrl: string
    machineId?: string
    cliApiTokenHash?: string
}

export function hashRunnerCliApiToken(token: string | null | undefined): string | undefined {
    const trimmed = token?.trim()
    if (!trimmed) {
        return undefined
    }
    return createHash('sha256').update(trimmed).digest('hex')
}

function normalizeLoopbackHost(host: string): string {
    const normalized = host.trim().toLowerCase()
    if (
        normalized === 'localhost'
        || normalized === '127.0.0.1'
        || normalized === '0.0.0.0'
        || normalized === '::1'
        || normalized === '[::1]'
        || normalized === '::'
        || normalized === '[::]'
    ) {
        return '127.0.0.1'
    }
    return normalized
}

export function normalizeRunnerApiUrl(raw: string | null | undefined): string | undefined {
    const trimmed = raw?.trim()
    if (!trimmed) {
        return undefined
    }

    try {
        const url = new URL(trimmed)
        const protocol = url.protocol.toLowerCase()
        const hostname = normalizeLoopbackHost(url.hostname)
        const port = url.port
        const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')
        return `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname}`
    } catch {
        return trimmed.replace(/\/+$/, '')
    }
}

export function isRunnerStateCompatibleWithIdentity(
    state: Pick<
        RunnerLocallyPersistedState,
        'startedWithApiUrl' | 'startedWithMachineId' | 'startedWithCliApiTokenHash'
    >,
    current: RunnerConnectionIdentity
): boolean {
    const normalizedStartedWithApiUrl = normalizeRunnerApiUrl(state.startedWithApiUrl)
    const normalizedCurrentApiUrl = normalizeRunnerApiUrl(current.apiUrl)

    if (!normalizedStartedWithApiUrl || !normalizedCurrentApiUrl || normalizedStartedWithApiUrl !== normalizedCurrentApiUrl) {
        return false
    }

    if (!current.machineId || state.startedWithMachineId !== current.machineId) {
        return false
    }

    if (!current.cliApiTokenHash || state.startedWithCliApiTokenHash !== current.cliApiTokenHash) {
        return false
    }

    return true
}
