import { logger } from '@/ui/logger';
import { loop, type EnhancedMode, type PermissionMode } from './loop';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { registerKillSessionHandler } from '@/utils/registerKillSessionHandler';
import { randomUUID } from 'node:crypto';
import type { AgentState } from '@/api/types';
import type { CodexSession } from './session';
import { parseCodexCliOverrides } from './utils/codexCliOverrides';
import { bootstrapSession } from '@/agent/sessionFactory';
import { createModeChangeHandler, createRunnerLifecycle, setControlledByUser } from '@/agent/runnerLifecycle';
import { isPermissionModeAllowedForFlavor } from '@hapi/protocol';
import { CodexCollaborationModeSchema, PermissionModeSchema } from '@hapi/protocol/schemas';
import {
    type ExecuteSlashCommandRequest,
    type ExecuteSlashCommandResponse,
    type SlashCommandDefinition,
    type SlashCommandsResponse,
    ExecuteSlashCommandRequestSchema,
    parseSlashCommandInput
} from '@hapi/protocol/slashCommands';
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter';
import { getInvokedCwd } from '@/utils/invokedCwd';
import { listSlashCommands as listPromptSlashCommands } from '@/modules/common/slashCommands';
import { resolveCodexPermissionModeConfig } from './utils/permissionModeConfig';
import { extractCodexUsageSummary, formatCompactNumber } from './utils/statusSummary';

export { emitReadyIfIdle } from './utils/emitReadyIfIdle';

function formatCodexStatusMarkdown(session: CodexSession): string {
    const rawPermissionMode = session.getPermissionMode();
    const permissionMode: PermissionMode = rawPermissionMode === 'read-only'
        || rawPermissionMode === 'safe-yolo'
        || rawPermissionMode === 'yolo'
        || rawPermissionMode === 'default'
        ? rawPermissionMode
        : 'default';
    const model = session.getModel() ?? 'auto';
    const collaborationMode = session.getCollaborationMode() ?? 'default';
    const mode = session.mode;
    const threadId = session.sessionId ?? 'unavailable';
    const turnId = session.getCurrentTurnId() ?? 'idle';
    const tokenUsage = session.getLatestTokenUsage();
    const runtimeConfig = resolveCodexPermissionModeConfig(permissionMode);
    const usage = extractCodexUsageSummary(tokenUsage);

    return [
        '## Codex Status',
        '',
        `- Mode: \`${mode}\``,
        `- Session ID: \`${threadId}\``,
        `- Working directory: \`${session.path}\``,
        `- Model: \`${model}\``,
        `- Permission mode: \`${permissionMode}\``,
        `- Approval policy: \`${runtimeConfig.approvalPolicy}\``,
        `- Sandbox: \`${runtimeConfig.sandbox}\``,
        `- Collaboration mode: \`${collaborationMode}\``,
        `- Thinking: \`${session.thinking ? 'yes' : 'no'}\``,
        `- Active turn: \`${turnId}\``,
        '',
        '### Token usage',
        !usage
            ? '- No usage reported yet'
            : `- Total: ${formatCompactNumber(usage.totalTokens)} total (${formatCompactNumber(usage.inputTokens)} input + ${formatCompactNumber(usage.outputTokens)} output)`,
        !usage || usage.cachedInputTokens <= 0
            ? ''
            : `- Cached input: ${formatCompactNumber(usage.cachedInputTokens)}`,
        !usage || usage.reasoningOutputTokens <= 0
            ? ''
            : `- Reasoning output: ${formatCompactNumber(usage.reasoningOutputTokens)}`,
        '',
        '### Context window',
        !usage || usage.modelContextWindow === null
            ? ''
            : `- ${usage.contextLeftPercent}% left (${formatCompactNumber(usage.contextUsedTokens)} used / ${formatCompactNumber(usage.modelContextWindow)})`
    ].filter(Boolean).join('\n');
}

export async function runCodex(opts: {
    startedBy?: 'runner' | 'terminal';
    codexArgs?: string[];
    permissionMode?: PermissionMode;
    resumeSessionId?: string;
    model?: string;
    modelReasoningEffort?: string;
}): Promise<void> {
    const workingDirectory = getInvokedCwd();
    const startedBy = opts.startedBy ?? 'terminal';

    logger.debug(`[codex] Starting with options: startedBy=${startedBy}`);

    let state: AgentState = {
        controlledByUser: false
    };
    const { api, session } = await bootstrapSession({
        flavor: 'codex',
        startedBy,
        workingDirectory,
        agentState: state,
        model: opts.model
    });

    const startingMode: 'local' | 'remote' = startedBy === 'runner' ? 'remote' : 'local';

    setControlledByUser(session, startingMode);

    const messageQueue = new MessageQueue2<EnhancedMode>((mode) => hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
        modelReasoningEffort: mode.modelReasoningEffort,
        collaborationMode: mode.collaborationMode
    }));

    const codexCliOverrides = parseCodexCliOverrides(opts.codexArgs);
    const sessionWrapperRef: { current: CodexSession | null } = { current: null };

    let currentPermissionMode: PermissionMode = opts.permissionMode ?? 'default';
    let currentModel = opts.model;
    const currentModelReasoningEffort = opts.modelReasoningEffort;
    let currentCollaborationMode: EnhancedMode['collaborationMode'] = 'default';

    const lifecycle = createRunnerLifecycle({
        session,
        logTag: 'codex',
        stopKeepAlive: () => sessionWrapperRef.current?.stopKeepAlive()
    });

    lifecycle.registerProcessHandlers();
    registerKillSessionHandler(session.rpcHandlerManager, lifecycle.cleanupAndExit);

    const buildCommandList = async (): Promise<SlashCommandDefinition[]> => {
        const builtinStatus: SlashCommandDefinition = {
            name: 'status',
            description: 'Show current session configuration and token usage',
            source: 'builtin',
            kind: 'action',
            availability: 'both',
            argPolicy: 'none',
            webSupported: true,
            discoverable: true
        };
        const promptCommands = await listPromptSlashCommands('codex', workingDirectory);
        return [
            builtinStatus,
            ...promptCommands.filter((command) => command.name !== builtinStatus.name)
        ];
    };

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
        const commands = await buildCommandList();
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

        const commands = await buildCommandList();
        const command = commands.find((candidate) => candidate.name === parsedInput.commandName);
        if (!command) {
            return {
                ok: false,
                code: 'not-found',
                message: `Unknown slash command: /${parsedInput.commandName}`
            };
        }

        const runtimeSession = sessionWrapperRef.current;
        const currentMode = runtimeSession?.mode ?? startingMode;

        if (command.availability === 'local-only' && currentMode !== 'local') {
            return {
                ok: false,
                code: 'not-available-in-current-mode',
                message: `/${command.name} is only available in local mode`
            };
        }

        if (command.availability === 'remote-only' && currentMode !== 'remote') {
            return {
                ok: false,
                code: 'not-available-in-current-mode',
                message: `/${command.name} is only available in remote mode`
            };
        }

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

        if (command.kind === 'action' && command.name === 'status') {
            if (!runtimeSession) {
                return {
                    ok: false,
                    code: 'unsupported',
                    message: 'Codex session runtime unavailable'
                };
            }
            session.sendAgentMessage({
                type: 'message',
                message: formatCodexStatusMarkdown(runtimeSession),
                id: randomUUID()
            });
            return {
                ok: true,
                handled: true,
                commandName: command.name,
                emittedMessages: true
            };
        }

        if (command.kind === 'prompt-template' && command.content) {
            const enhancedMode: EnhancedMode = {
                permissionMode: currentPermissionMode ?? 'default',
                model: currentModel,
                modelReasoningEffort: currentModelReasoningEffort,
                collaborationMode: currentCollaborationMode
            };
            messageQueue.push(command.content, enhancedMode);
            return {
                ok: true,
                handled: true,
                commandName: command.name,
                emittedMessages: true
            };
        }

        return {
            ok: false,
            code: 'unsupported',
            message: `/${command.name} is not supported by the web executor`
        };
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
            startingMode,
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
            onModeChange: createModeChangeHandler(session),
            onSessionReady: (instance) => {
                sessionWrapperRef.current = instance;
                syncSessionMode();
            }
        });
    } catch (error) {
        lifecycle.markCrash(error);
        logger.debug('[codex] Loop error:', error);
    } finally {
        const localFailure = sessionWrapperRef.current?.localLaunchFailure;
        if (localFailure?.exitReason === 'exit') {
            lifecycle.setExitCode(1);
            lifecycle.setArchiveReason(`Local launch failed: ${formatFailureReason(localFailure.message)}`);
        }
        await lifecycle.cleanupAndExit();
    }
}
