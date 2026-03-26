import { logger } from '@/ui/logger';
import { loop, type EnhancedMode, type PermissionMode } from './loop';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { registerKillSessionHandler } from '@/utils/registerKillSessionHandler';
import type { AgentState } from '@/api/types';
import type { CodexSession } from './session';
import { parseCodexCliOverrides } from './utils/codexCliOverrides';
import { bootstrapSession } from '@/agent/sessionFactory';
import { createRunnerLifecycle } from '@/agent/runnerLifecycle';
import { isPermissionModeAllowedForFlavor } from '@hapi/protocol';
import { CodexCollaborationModeSchema, PermissionModeSchema } from '@hapi/protocol/schemas';
import {
    type ExecuteSlashCommandRequest,
    type ExecuteSlashCommandResponse,
    type SlashCommandsResponse,
    ExecuteSlashCommandRequestSchema,
    parseSlashCommandInput
} from '@hapi/protocol/slashCommands';
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter';
import { getInvokedCwd } from '@/utils/invokedCwd';
import { executeCodexSlashCommand, listCodexSlashCommands } from './slashCommands';

export { emitReadyIfIdle } from './utils/emitReadyIfIdle';

export async function runCodex(opts: {
    startedBy?: 'runner' | 'terminal';
    codexArgs?: string[];
    permissionMode?: PermissionMode;
    resumeSessionId?: string;
    hapiSessionId?: string;
    model?: string;
    modelReasoningEffort?: string;
}): Promise<void> {
    const workingDirectory = getInvokedCwd();
    const startedBy = opts.startedBy ?? 'terminal';

    logger.debug(`[codex] Starting with options: startedBy=${startedBy}`);

    const state: AgentState = {};
    const { api, session, sessionInfo } = await bootstrapSession({
        flavor: 'codex',
        startedBy,
        workingDirectory,
        sessionId: opts.hapiSessionId,
        agentState: state,
        model: opts.model,
        metadataOverrides: opts.modelReasoningEffort
            ? { modelReasoningEffort: opts.modelReasoningEffort }
            : undefined
    });

    const messageQueue = new MessageQueue2<EnhancedMode>((mode) => hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
        modelReasoningEffort: mode.modelReasoningEffort,
        collaborationMode: mode.collaborationMode
    }));

    const codexCliOverrides = parseCodexCliOverrides(opts.codexArgs);
    const sessionWrapperRef: { current: CodexSession | null } = { current: null };

    let currentPermissionMode: PermissionMode = opts.permissionMode ?? sessionInfo.permissionMode ?? 'default';
    let currentModel = opts.model ?? sessionInfo.model ?? undefined;
    const currentModelReasoningEffort = opts.modelReasoningEffort ?? sessionInfo.metadata?.modelReasoningEffort;
    let currentCollaborationMode: EnhancedMode['collaborationMode'] = sessionInfo.collaborationMode ?? 'default';

    const lifecycle = createRunnerLifecycle({
        session,
        logTag: 'codex',
        stopKeepAlive: () => sessionWrapperRef.current?.stopKeepAlive()
    });

    lifecycle.registerProcessHandlers();
    registerKillSessionHandler(session.rpcHandlerManager, lifecycle.cleanupAndExit);

    const syncSessionMode = () => {
        const sessionInstance = sessionWrapperRef.current;
        if (!sessionInstance) {
            return;
        }
        const sessionModel = sessionInstance.getModel();
        if (sessionModel !== undefined) {
            currentModel = sessionModel ?? undefined;
        }
        sessionInstance.setPermissionMode(currentPermissionMode);
        sessionInstance.setModel(currentModel ?? null);
        sessionInstance.setCollaborationMode(currentCollaborationMode);
        logger.debug(
            `[Codex] Synced session config for keepalive: ` +
            `permissionMode=${currentPermissionMode}, model=${currentModel ?? 'auto'}, collaborationMode=${currentCollaborationMode}`
        );
    };

    session.onUserMessage((message) => {
        const sessionPermissionMode = sessionWrapperRef.current?.getPermissionMode();
        if (sessionPermissionMode && isPermissionModeAllowedForFlavor(sessionPermissionMode, 'codex')) {
            currentPermissionMode = sessionPermissionMode as PermissionMode;
        }
        const sessionModel = sessionWrapperRef.current?.getModel();
        if (sessionModel !== undefined) {
            currentModel = sessionModel ?? undefined;
        }
        const sessionCollaborationMode = sessionWrapperRef.current?.getCollaborationMode();
        if (sessionCollaborationMode) {
            currentCollaborationMode = sessionCollaborationMode;
        }

        const messagePermissionMode = currentPermissionMode;
        logger.debug(
            `[Codex] User message received with permission mode: ${currentPermissionMode}, ` +
            `model: ${currentModel ?? 'auto'}, collaborationMode: ${currentCollaborationMode}`
        );

        const enhancedMode: EnhancedMode = {
            permissionMode: messagePermissionMode ?? 'default',
            model: currentModel,
            modelReasoningEffort: currentModelReasoningEffort,
            collaborationMode: currentCollaborationMode
        };
        const formattedText = formatMessageWithAttachments(message.content.text, message.content.attachments);
        messageQueue.push(formattedText, enhancedMode);
    });

    session.rpcHandlerManager.registerHandler<undefined, SlashCommandsResponse>('listSlashCommands', async () => {
        const commands = await listCodexSlashCommands(workingDirectory);
        return { success: true, commands };
    });

    session.rpcHandlerManager.registerHandler<ExecuteSlashCommandRequest, ExecuteSlashCommandResponse>('executeSlashCommand', async (payload) => {
        const parsedPayload = ExecuteSlashCommandRequestSchema.safeParse(payload);
        if (!parsedPayload.success) {
            return {
                ok: false,
                code: 'invalid-arguments',
                message: 'Invalid slash command payload'
            };
        }

        const parsedInput = parseSlashCommandInput(parsedPayload.data.rawInput);
        if (parsedInput.kind !== 'slash') {
            return {
                ok: false,
                code: 'not-found',
                message: 'Input is not a slash command'
            };
        }

        const commands = await listCodexSlashCommands(workingDirectory);
        const command = commands.find((candidate) => candidate.name === parsedInput.commandName);
        if (!command) {
            return {
                ok: false,
                code: 'not-found',
                message: `Unknown slash command: /${parsedInput.commandName}`
            };
        }

        const runtimeSession = sessionWrapperRef.current;

        if (command.argPolicy === 'none' && parsedInput.rawTail) {
            return {
                ok: false,
                code: 'invalid-arguments',
                message: `/${command.name} does not accept arguments`
            };
        }

        session.sendUserMessage(parsedInput.rawInput, {
            sentFrom: parsedPayload.data.source,
            transport: 'slash-command',
            commandName: command.name
        });

        const enhancedMode: EnhancedMode = {
            permissionMode: currentPermissionMode ?? 'default',
            model: currentModel,
            modelReasoningEffort: currentModelReasoningEffort,
            collaborationMode: currentCollaborationMode
        };

        return await executeCodexSlashCommand({
            command,
            parsedInput,
            output: {
                sendAgentMessage: (message) => session.sendAgentMessage(message),
                sendSessionEvent: (event) => session.sendSessionEvent(event)
            },
            runtimeSession,
            workingDirectory,
            queuePrompt: (content, mode) => {
                messageQueue.push(content, mode);
            },
            currentMode: enhancedMode
        });
    });

    const formatFailureReason = (message: string): string => {
        const maxLength = 200;
        if (message.length <= maxLength) {
            return message;
        }
        return `${message.slice(0, maxLength)}...`;
    };

    const resolvePermissionMode = (value: unknown): PermissionMode => {
        const parsed = PermissionModeSchema.safeParse(value);
        if (!parsed.success || !isPermissionModeAllowedForFlavor(parsed.data, 'codex')) {
            throw new Error('Invalid permission mode');
        }
        return parsed.data as PermissionMode;
    };

    const resolveCollaborationMode = (value: unknown): EnhancedMode['collaborationMode'] => {
        if (value === null) {
            return 'default';
        }
        const parsed = CodexCollaborationModeSchema.safeParse(value);
        if (!parsed.success) {
            throw new Error('Invalid collaboration mode');
        }
        return parsed.data;
    };

    session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid session config payload');
        }
        const config = payload as { permissionMode?: unknown; model?: unknown; collaborationMode?: unknown };

        if (config.permissionMode !== undefined) {
            currentPermissionMode = resolvePermissionMode(config.permissionMode);
        }

        if (config.model !== undefined) {
            if (config.model !== null && typeof config.model !== 'string') {
                throw new Error('Invalid model');
            }
            currentModel = config.model ?? undefined;
        }

        if (config.collaborationMode !== undefined) {
            currentCollaborationMode = resolveCollaborationMode(config.collaborationMode);
        }

        syncSessionMode();
        return {
            applied: {
                permissionMode: currentPermissionMode,
                model: currentModel ?? null,
                collaborationMode: currentCollaborationMode
            }
        };
    });

    try {
        await loop({
            path: workingDirectory,
            messageQueue,
            api,
            session,
            codexArgs: opts.codexArgs,
            codexCliOverrides,
            startedBy,
            permissionMode: currentPermissionMode,
            model: currentModel,
            collaborationMode: currentCollaborationMode,
            resumeSessionId: opts.resumeSessionId,
            onSessionReady: (instance) => {
                sessionWrapperRef.current = instance;
                syncSessionMode();
            }
        });
    } catch (error) {
        lifecycle.markCrash(error);
        logger.debug('[codex] Loop error:', error);
    } finally {
        await lifecycle.cleanupAndExit();
    }
}
