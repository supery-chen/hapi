import { logger } from '@/ui/logger'
import { readSettings } from '@/persistence'
import { isRunnerRunningCurrentlyInstalledHappyVersion } from '@/runner/controlClient'
import { spawnHappyCLI } from '@/utils/spawnHappyCLI'

type MachineExposureSettings = {
    exposeMachine?: boolean
    runnerAutoStartWhenRunningHappy?: boolean
}

export type ExposeMachineSource = 'environment' | 'settings' | 'legacy-settings' | 'default'

export function parseBooleanPreference(raw: string | undefined): boolean | null {
    if (!raw) return null
    const normalized = raw.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
    return null
}

export function resolveExposeMachinePreference(
    settings: MachineExposureSettings | null | undefined,
    envValue: string | undefined = process.env.HAPI_EXPOSE_MACHINE
): { value: boolean; source: ExposeMachineSource } {
    const envPreference = parseBooleanPreference(envValue)
    if (envPreference !== null) {
        return { value: envPreference, source: 'environment' }
    }

    if (typeof settings?.exposeMachine === 'boolean') {
        return { value: settings.exposeMachine, source: 'settings' }
    }

    if (typeof settings?.runnerAutoStartWhenRunningHappy === 'boolean') {
        return { value: settings.runnerAutoStartWhenRunningHappy, source: 'legacy-settings' }
    }

    return { value: true, source: 'default' }
}

export async function getExposeMachinePreference(): Promise<{ value: boolean; source: ExposeMachineSource }> {
    const settings = await readSettings()
    return resolveExposeMachinePreference(settings)
}

export function getLocalHubApiUrl(listenHost: string, listenPort: number): string {
    const normalizedHost = (() => {
        const trimmed = listenHost.trim()
        if (!trimmed || trimmed === '0.0.0.0' || trimmed === '::' || trimmed === '[::]') {
            return '127.0.0.1'
        }
        return trimmed
    })()

    return `http://${normalizedHost}:${listenPort}`
}

export async function ensureRunnerStartedForMachineExposure(apiUrl?: string): Promise<boolean> {
    const exposeMachine = await getExposeMachinePreference()
    if (!exposeMachine.value) {
        logger.debug(`[machine-exposure] Skipping runner start (source=${exposeMachine.source}, value=false)`)
        return false
    }

    if (await isRunnerRunningCurrentlyInstalledHappyVersion()) {
        logger.debug('[machine-exposure] Runner already running with matching version')
        return true
    }

    logger.debug(`[machine-exposure] Starting runner for local machine exposure (source=${exposeMachine.source})`)
    const child = spawnHappyCLI(['runner', 'start-sync'], {
        detached: true,
        stdio: 'ignore',
        env: {
            ...process.env,
            ...(apiUrl ? { HAPI_API_URL: apiUrl } : {})
        }
    })
    child.unref()

    await new Promise((resolve) => setTimeout(resolve, 200))
    return true
}
