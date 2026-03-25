import type { CodexPermissionMode } from '@hapi/protocol/types'

export interface SpawnSessionOptions {
    machineId?: string
    directory: string
    sessionId?: string
    resumeSessionId?: string
    approvedNewDirectoryCreation?: boolean
    agent?: 'codex'
    model?: string
    modelReasoningEffort?: string
    yolo?: boolean
    permissionMode?: CodexPermissionMode
    token?: string
    sessionType?: 'simple' | 'worktree'
    worktreeName?: string
}

export type SpawnSessionResult =
    | { type: 'success'; sessionId: string }
    | { type: 'requestToApproveDirectoryCreation'; directory: string }
    | { type: 'error'; errorMessage: string }
