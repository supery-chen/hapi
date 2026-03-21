import { describe, expect, it } from 'vitest'
import { getLocalHubApiUrl, parseBooleanPreference, resolveExposeMachinePreference } from './machineExposure'

describe('machineExposure', () => {
    it('parses boolean preferences from environment values', () => {
        expect(parseBooleanPreference('true')).toBe(true)
        expect(parseBooleanPreference('YES')).toBe(true)
        expect(parseBooleanPreference('0')).toBe(false)
        expect(parseBooleanPreference('off')).toBe(false)
        expect(parseBooleanPreference('maybe')).toBeNull()
        expect(parseBooleanPreference(undefined)).toBeNull()
    })

    it('resolves exposeMachine preference with correct precedence', () => {
        expect(resolveExposeMachinePreference({ exposeMachine: false }, 'true')).toEqual({
            value: true,
            source: 'environment'
        })

        expect(resolveExposeMachinePreference({ exposeMachine: false }, undefined)).toEqual({
            value: false,
            source: 'settings'
        })

        expect(resolveExposeMachinePreference({ runnerAutoStartWhenRunningHappy: true }, undefined)).toEqual({
            value: true,
            source: 'legacy-settings'
        })

        expect(resolveExposeMachinePreference({}, undefined)).toEqual({
            value: true,
            source: 'default'
        })
    })

    it('builds a loopback-safe local hub api url', () => {
        expect(getLocalHubApiUrl('127.0.0.1', 3006)).toBe('http://127.0.0.1:3006')
        expect(getLocalHubApiUrl('0.0.0.0', 3006)).toBe('http://127.0.0.1:3006')
        expect(getLocalHubApiUrl('::', 3006)).toBe('http://127.0.0.1:3006')
    })
})
