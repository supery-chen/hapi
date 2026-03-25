import { describe, expect, it } from 'bun:test'
import { toSessionSummary } from '@hapi/protocol'
import type { SyncEvent } from '@hapi/protocol/types'
import { Store } from '../store'
import { RpcRegistry } from '../socket/rpcRegistry'
import type { EventPublisher } from './eventPublisher'
import { SessionCache } from './sessionCache'
import { SyncEngine } from './syncEngine'

function createPublisher(events: SyncEvent[]): EventPublisher {
    return {
        emit: (event: SyncEvent) => {
            events.push(event)
        }
    } as unknown as EventPublisher
}

describe('session model', () => {
    it('includes explicit model in session summaries', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-model-summary',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'default',
            'gpt-5.4'
        )

        expect(session.model).toBe('gpt-5.4')
        expect(toSessionSummary(session).model).toBe('gpt-5.4')
    })

    it('preserves model from old session when merging into resumed session', async () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const oldSession = cache.getOrCreateSession(
            'session-model-old',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'default',
            'gpt-5.4'
        )
        const newSession = cache.getOrCreateSession(
            'session-model-new',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'default'
        )

        await cache.mergeSessions(oldSession.id, newSession.id, 'default')

        const merged = cache.getSession(newSession.id)
        expect(merged?.model).toBe('gpt-5.4')
    })

    it('persists applied session model updates, including clear-to-auto', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-model-config',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'default',
            'gpt-5.4'
        )

        cache.applySessionConfig(session.id, { model: 'gpt-5.2' })
        expect(cache.getSession(session.id)?.model).toBe('gpt-5.2')
        expect(store.sessions.getSession(session.id)?.model).toBe('gpt-5.2')

        cache.applySessionConfig(session.id, { model: null })
        expect(cache.getSession(session.id)?.model).toBeNull()
        expect(store.sessions.getSession(session.id)?.model).toBeNull()
    })

    it('persists keepalive model changes, including clearing the model', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-model-heartbeat',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'default',
            'gpt-5.4'
        )

        cache.handleSessionAlive({
            sid: session.id,
            time: Date.now(),
            thinking: false,
            model: null
        })

        expect(cache.getSession(session.id)?.model).toBeNull()
        expect(store.sessions.getSession(session.id)?.model).toBeNull()
    })

    it('tracks collaboration mode updates in memory from config and keepalive', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-collaboration-mode',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'default',
            'gpt-5.4'
        )

        cache.applySessionConfig(session.id, { collaborationMode: 'plan' })
        expect(cache.getSession(session.id)?.collaborationMode).toBe('plan')

        cache.handleSessionAlive({
            sid: session.id,
            time: Date.now(),
            thinking: false,
            collaborationMode: 'default'
        })
        expect(cache.getSession(session.id)?.collaborationMode).toBe('default')
    })

    it('passes the stored resume settings when respawning a resumed session', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            {} as never,
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const session = engine.getOrCreateSession(
                'session-model-resume',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexSessionId: 'codex-thread-1',
                    modelReasoningEffort: 'xhigh'
                },
                null,
                'default',
                'gpt-5.4'
            )
            session.permissionMode = 'safe-yolo'
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', happyCliVersion: '0.1.0' },
                null,
                'default'
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            let capturedArgs: Record<string, unknown> | null = null
            ;(engine as any).rpcGateway.spawnSession = async (
                machineId: string,
                directory: string,
                agent: string,
                model?: string,
                modelReasoningEffort?: string,
                permissionMode?: string,
                _sessionType?: string,
                _worktreeName?: string,
                resumeSessionId?: string
            ) => {
                capturedArgs = {
                    machineId,
                    directory,
                    agent,
                    model,
                    modelReasoningEffort,
                    permissionMode,
                    resumeSessionId
                }
                return { type: 'success', sessionId: session.id }
            }
            ;(engine as any).waitForSessionActive = async () => true

            const result = await engine.resumeSession(session.id, 'default')

            expect(result).toEqual({ type: 'success', sessionId: session.id })
            expect(capturedArgs).not.toBeNull()
            expect(capturedArgs!).toEqual({
                machineId: 'machine-1',
                directory: '/tmp/project',
                agent: 'codex',
                model: 'gpt-5.4',
                modelReasoningEffort: 'xhigh',
                permissionMode: 'safe-yolo',
                resumeSessionId: 'codex-thread-1'
            })
        } finally {
            engine.stop()
        }
    })

    it('fresh-spawns and merges sessions when resume token is unavailable', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            {} as never,
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const session = engine.getOrCreateSession(
                'session-resume-fallback-old',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    modelReasoningEffort: 'high'
                },
                null,
                'default',
                'gpt-5.4'
            )
            store.messages.addMessage(session.id, {
                role: 'user',
                content: { type: 'text', text: '/skills' }
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', happyCliVersion: '0.1.0' },
                null,
                'default'
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            let capturedResumeSessionId: string | undefined
            let spawnedSessionId: string | null = null
            ;(engine as any).rpcGateway.spawnSession = async (
                _machineId: string,
                _directory: string,
                _agent: string,
                model?: string,
                _modelReasoningEffort?: string,
                _permissionMode?: string,
                _sessionType?: string,
                _worktreeName?: string,
                resumeSessionId?: string
            ) => {
                capturedResumeSessionId = resumeSessionId
                const spawned = engine.getOrCreateSession(
                    'session-resume-fallback-new',
                    {
                        path: '/tmp/project',
                        host: 'localhost',
                        machineId: 'machine-1',
                        flavor: 'codex',
                        codexSessionId: 'codex-thread-new'
                    },
                    null,
                    'default',
                    model
                )
                spawnedSessionId = spawned.id
                return { type: 'success', sessionId: spawned.id }
            }
            ;(engine as any).waitForSessionActive = async () => true

            const result = await engine.resumeSession(session.id, 'default')

            expect(capturedResumeSessionId).toBeUndefined()
            expect(result).toEqual({ type: 'success', sessionId: spawnedSessionId! })
            expect(engine.getSession(session.id)).toBeUndefined()
            expect(store.messages.getMessages(spawnedSessionId!)).toHaveLength(1)
        } finally {
            engine.stop()
        }
    })
})
