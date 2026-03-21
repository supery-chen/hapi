import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configuration } from '@/configuration'

const {
    readSettingsMock,
    clearMachineIdMock,
    updateSettingsMock,
    initializeApiUrlMock,
    getExposeMachinePreferenceMock
} = vi.hoisted(() => ({
    readSettingsMock: vi.fn(),
    clearMachineIdMock: vi.fn(),
    updateSettingsMock: vi.fn(),
    initializeApiUrlMock: vi.fn(async () => {
        configuration._setApiUrl('https://hapi.example.com')
    }),
    getExposeMachinePreferenceMock: vi.fn(async () => ({ value: true, source: 'default' as const }))
}))

vi.mock('@/persistence', () => ({
    readSettings: readSettingsMock,
    clearMachineId: clearMachineIdMock,
    updateSettings: updateSettingsMock
}))

vi.mock('@/ui/apiUrlInit', () => ({
    initializeApiUrl: initializeApiUrlMock
}))

vi.mock('@/utils/machineExposure', () => ({
    getExposeMachinePreference: getExposeMachinePreferenceMock
}))

import { handleAuthCommand } from './auth'

function stripAnsi(value: string): string {
    return value.replace(/\u001B\[[0-9;]*m/g, '')
}

describe('handleAuthCommand', () => {
    beforeEach(() => {
        configuration._setApiUrl('http://localhost:3006')
        readSettingsMock.mockReset()
        clearMachineIdMock.mockReset()
        updateSettingsMock.mockReset()
        initializeApiUrlMock.mockClear()
        getExposeMachinePreferenceMock.mockReset()
        getExposeMachinePreferenceMock.mockResolvedValue({ value: true, source: 'default' })
    })

    it('loads the configured api url before printing status', async () => {
        readSettingsMock.mockResolvedValue({
            apiUrl: 'https://hapi.example.com',
            cliApiToken: 'token-from-settings',
            machineId: 'machine-123'
        })

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        try {
            await handleAuthCommand(['status'])
            expect(initializeApiUrlMock).toHaveBeenCalledOnce()

            const output = logSpy.mock.calls
                .map((call) => stripAnsi(String(call[0])))
                .join('\n')

            expect(output).toContain('HAPI_API_URL: https://hapi.example.com')
            expect(output).toContain('CLI_API_TOKEN: set')
            expect(output).toContain('Machine ID: machine-123')
            expect(output).toContain('Expose as machine: enabled (default)')
        } finally {
            logSpy.mockRestore()
        }
    })

    it('allows toggling machine exposure', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        try {
            await handleAuthCommand(['machine', 'off'])
            expect(updateSettingsMock).toHaveBeenCalledWith(expect.any(Function))

            const offUpdater = updateSettingsMock.mock.calls[0]?.[0]
            expect(offUpdater({})).toEqual({ exposeMachine: false })

            await handleAuthCommand(['machine', 'on'])
            const onUpdater = updateSettingsMock.mock.calls[1]?.[0]
            expect(onUpdater({})).toEqual({ exposeMachine: true })
        } finally {
            logSpy.mockRestore()
        }
    })
})
