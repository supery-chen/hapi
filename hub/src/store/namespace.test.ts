import { describe, expect, it } from 'bun:test'
import { Store } from './index'

describe('Store namespace filtering', () => {
    it('filters sessions by namespace', () => {
        const store = new Store(':memory:')
        const sessionAlpha = store.sessions.getOrCreateSession('tag', { path: '/alpha' }, null, 'alpha')
        const sessionBeta = store.sessions.getOrCreateSession('tag', { path: '/beta' }, null, 'beta')

        const sessionsAlpha = store.sessions.getSessionsByNamespace('alpha')
        const ids = sessionsAlpha.map((session) => session.id)

        expect(ids).toContain(sessionAlpha.id)
        expect(ids).not.toContain(sessionBeta.id)
    })

    it('supports creating or reusing a session with a preferred id', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSessionWithId(
            'tag-preferred',
            { path: '/alpha' },
            null,
            'alpha',
            'gpt-5.4',
            'preferred-session-id'
        )

        const same = store.sessions.getOrCreateSessionWithId(
            'another-tag',
            { path: '/alpha' },
            null,
            'alpha',
            'gpt-5.4',
            'preferred-session-id'
        )

        expect(session.id).toBe('preferred-session-id')
        expect(same.id).toBe('preferred-session-id')
    })

    it('filters machines by namespace and blocks mismatches', () => {
        const store = new Store(':memory:')
        const machineAlpha = store.machines.getOrCreateMachine('machine-1', { host: 'alpha' }, null, 'alpha')
        store.machines.getOrCreateMachine('machine-2', { host: 'beta' }, null, 'beta')

        const machinesAlpha = store.machines.getMachinesByNamespace('alpha')
        const ids = machinesAlpha.map((machine) => machine.id)

        expect(ids).toContain(machineAlpha.id)
        expect(ids).not.toContain('machine-2')
        expect(() => store.machines.getOrCreateMachine('machine-1', { host: 'beta' }, null, 'beta')).toThrow()
    })
})
