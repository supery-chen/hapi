import { beforeEach, describe, expect, it } from 'vitest'
import {
    loadPreferredSpawnPermissionMode,
    savePreferredSpawnPermissionMode,
} from './preferences'

describe('NewSession preferences', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('loads defaults when storage is empty', () => {
        expect(loadPreferredSpawnPermissionMode()).toBe('default')
    })

    it('loads legacy boolean values from storage', () => {
        localStorage.setItem('hapi:newSession:yolo', 'true')

        expect(loadPreferredSpawnPermissionMode()).toBe('yolo')
    })

    it('loads new tri-state values from storage', () => {
        localStorage.setItem('hapi:newSession:yolo', 'safe-yolo')

        expect(loadPreferredSpawnPermissionMode()).toBe('safe-yolo')
    })

    it('persists new values to storage', () => {
        savePreferredSpawnPermissionMode('safe-yolo')

        expect(localStorage.getItem('hapi:newSession:yolo')).toBe('safe-yolo')
    })
})
