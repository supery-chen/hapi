import { describe, expect, it, vi } from 'vitest'
import { makeRuntimeId } from './clientIds'

describe('makeRuntimeId', () => {
    it('uses crypto.randomUUID when available', () => {
        const originalCrypto = globalThis.crypto
        const randomUUID = vi.fn(() => 'uuid-123')
        Object.defineProperty(globalThis, 'crypto', {
            value: { randomUUID },
            configurable: true
        })

        try {
            expect(makeRuntimeId('attachment')).toBe('attachment-uuid-123')
            expect(randomUUID).toHaveBeenCalledTimes(1)
        } finally {
            Object.defineProperty(globalThis, 'crypto', {
                value: originalCrypto,
                configurable: true
            })
        }
    })

    it('falls back when crypto.randomUUID is unavailable', () => {
        const originalCrypto = globalThis.crypto
        Object.defineProperty(globalThis, 'crypto', {
            value: {},
            configurable: true
        })
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789)
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890)

        try {
            expect(makeRuntimeId('attachment')).toBe('attachment-1234567890-4fzzzxjy')
        } finally {
            randomSpy.mockRestore()
            nowSpy.mockRestore()
            Object.defineProperty(globalThis, 'crypto', {
                value: originalCrypto,
                configurable: true
            })
        }
    })
})
