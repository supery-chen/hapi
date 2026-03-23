import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createMessagesRoutes } from './messages'

function createSession() {
    return {
        id: 'session-1',
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex' as const
        },
        metadataVersion: 1,
        agentState: {
            requests: {},
            completedRequests: {}
        },
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 1,
        model: 'gpt-5.4',
        permissionMode: 'default' as const,
        collaborationMode: 'default' as const
    }
}

describe('messages routes', () => {
    it('submits slash input through submitInput', async () => {
        const session = createSession()
        const submitCalls: Array<{ sessionId: string; text: string }> = []
        const engine = {
            resolveSessionAccess: () => ({ ok: true, sessionId: session.id, session }),
            submitInput: async (sessionId: string, payload: { text: string }) => {
                submitCalls.push({ sessionId, text: payload.text })
                return { ok: true, kind: 'slash-command' as const, commandName: 'status' }
            }
        } as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.use('*', async (c, next) => {
            c.set('namespace', 'default')
            await next()
        })
        app.route('/api', createMessagesRoutes(() => engine as SyncEngine))

        const response = await app.request('/api/sessions/session-1/input', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: '/status' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            ok: true,
            kind: 'slash-command',
            commandName: 'status'
        })
        expect(submitCalls).toEqual([{ sessionId: 'session-1', text: '/status' }])
    })
})
