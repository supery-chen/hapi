import { describe, expect, it, vi } from 'vitest'
import type { EnhancedMode } from './loop'

const remoteLauncherMock = vi.fn<(session: unknown) => Promise<'exit'>>(async () => 'exit')

vi.mock('./codexRemoteLauncher', () => ({
    codexRemoteLauncher: (session: unknown) => remoteLauncherMock(session)
}))

import { loop } from './loop'
import type { ApiClient, ApiSessionClient } from '@/lib'
import { MessageQueue2 } from '@/utils/MessageQueue2'

describe('codex loop', () => {
    it('starts the remote launcher only', async () => {
        remoteLauncherMock.mockClear()

        const queue = new MessageQueue2<EnhancedMode>(() => 'mode')
        const onSessionReady = vi.fn()

        await loop({
            path: '/tmp/project',
            messageQueue: queue,
            session: {
                keepAlive: () => {}
            } as ApiSessionClient,
            api: {} as ApiClient,
            onSessionReady
        })

        expect(remoteLauncherMock).toHaveBeenCalledTimes(1)
        expect(onSessionReady).toHaveBeenCalledTimes(1)
    })
})
