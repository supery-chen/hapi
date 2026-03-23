import { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { logger } from '@/lib'

interface KillSessionRequest {
}

interface KillSessionResponse {
    success: boolean
    message: string
}

export function registerKillSessionHandler(
    rpcHandlerManager: RpcHandlerManager,
    killThisHappy: () => Promise<void>
): void {
    rpcHandlerManager.registerHandler<KillSessionRequest, KillSessionResponse>('killSession', async () => {
        logger.debug('Kill session request received')
        void killThisHappy()

        return {
            success: true,
            message: 'Killing hapi CLI process'
        }
    })
}
