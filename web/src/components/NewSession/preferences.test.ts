import { beforeEach, describe, expect, it } from 'vitest'
import {
    loadPreferredYoloMode,
    savePreferredYoloMode,
} from './preferences'

describe('NewSession preferences', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('loads defaults when storage is empty', () => {
        expect(loadPreferredYoloMode()).toBe(false)
    })

    it('loads saved values from storage', () => {
        localStorage.setItem('hapi:newSession:yolo', 'true')

        expect(loadPreferredYoloMode()).toBe(true)
    })

    it('persists new values to storage', () => {
        savePreferredYoloMode(true)

        expect(localStorage.getItem('hapi:newSession:yolo')).toBe('true')
    })
})
