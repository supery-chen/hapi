import { MessageQueue2 } from '@/utils/MessageQueue2';
import { logger } from '@/ui/logger';
import { CodexSession } from './session';
import { codexRemoteLauncher } from './codexRemoteLauncher';
import { ApiClient, ApiSessionClient } from '@/lib';
import type { CodexCliOverrides } from './utils/codexCliOverrides';
import type { CodexCollaborationMode, CodexPermissionMode } from '@hapi/protocol/types';

export type PermissionMode = CodexPermissionMode;

export interface EnhancedMode {
    permissionMode: PermissionMode;
    model?: string;
    collaborationMode: CodexCollaborationMode;
    modelReasoningEffort?: string;
}

interface LoopOptions {
    path: string;
    startedBy?: 'runner' | 'terminal';
    messageQueue: MessageQueue2<EnhancedMode>;
    session: ApiSessionClient;
    api: ApiClient;
    codexArgs?: string[];
    codexCliOverrides?: CodexCliOverrides;
    permissionMode?: PermissionMode;
    model?: string;
    modelReasoningEffort?: string;
    collaborationMode?: CodexCollaborationMode;
    resumeSessionId?: string;
    onSessionReady?: (session: CodexSession) => void;
}

export async function loop(opts: LoopOptions): Promise<void> {
    const logPath = logger.getLogPath();
    const session = new CodexSession({
        api: opts.api,
        client: opts.session,
        path: opts.path,
        sessionId: opts.resumeSessionId ?? null,
        logPath,
        messageQueue: opts.messageQueue,
        startedBy: opts.startedBy ?? 'terminal',
        codexArgs: opts.codexArgs,
        codexCliOverrides: opts.codexCliOverrides,
        permissionMode: opts.permissionMode ?? 'default',
        model: opts.model,
        modelReasoningEffort: opts.modelReasoningEffort,
        collaborationMode: opts.collaborationMode ?? 'default'
    });

    opts.onSessionReady?.(session);
    logger.debug('[codex-loop] Remote-only launcher start');
    await codexRemoteLauncher(session);
}
