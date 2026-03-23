import { ApiClient, ApiSessionClient } from '@/lib';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { AgentSessionBase } from '@/agent/sessionBase';
import type { EnhancedMode, PermissionMode } from './loop';
import type { CodexCliOverrides } from './utils/codexCliOverrides';
import type { SessionModel } from '@/api/types';
import type { CodexStatusSnapshot } from './utils/statusSnapshot';

export class CodexSession extends AgentSessionBase<EnhancedMode> {
    readonly codexArgs?: string[];
    readonly codexCliOverrides?: CodexCliOverrides;
    readonly startedBy: 'runner' | 'terminal';
    private readonly modelReasoningEffort?: string;
    private latestTokenUsage: Record<string, unknown> | null = null;
    private currentTurnId: string | null = null;
    private statusSnapshotProvider: (() => Promise<CodexStatusSnapshot>) | null = null;

    constructor(opts: {
        api: ApiClient;
        client: ApiSessionClient;
        path: string;
        logPath: string;
        sessionId: string | null;
        messageQueue: MessageQueue2<EnhancedMode>;
        startedBy: 'runner' | 'terminal';
        codexArgs?: string[];
        codexCliOverrides?: CodexCliOverrides;
        permissionMode?: PermissionMode;
        model?: SessionModel;
        modelReasoningEffort?: string;
        collaborationMode?: EnhancedMode['collaborationMode'];
    }) {
        super({
            api: opts.api,
            client: opts.client,
            path: opts.path,
            logPath: opts.logPath,
            sessionId: opts.sessionId,
            messageQueue: opts.messageQueue,
            sessionLabel: 'CodexSession',
            sessionIdLabel: 'Codex',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                codexSessionId: sessionId
            }),
            permissionMode: opts.permissionMode,
            model: opts.model,
            collaborationMode: opts.collaborationMode
        });

        this.codexArgs = opts.codexArgs;
        this.codexCliOverrides = opts.codexCliOverrides;
        this.startedBy = opts.startedBy;
        this.permissionMode = opts.permissionMode;
        this.model = opts.model;
        this.modelReasoningEffort = opts.modelReasoningEffort;
        this.collaborationMode = opts.collaborationMode;
    }

    setPermissionMode = (mode: PermissionMode): void => {
        this.permissionMode = mode;
    };

    setModel = (model: SessionModel): void => {
        this.model = model;
    };

    setCollaborationMode = (mode: EnhancedMode['collaborationMode']): void => {
        this.collaborationMode = mode;
    };

    setLatestTokenUsage = (info: Record<string, unknown> | null): void => {
        this.latestTokenUsage = info;
    };

    getLatestTokenUsage = (): Record<string, unknown> | null => {
        return this.latestTokenUsage;
    };

    setCurrentTurnId = (turnId: string | null): void => {
        this.currentTurnId = turnId;
    };

    getCurrentTurnId = (): string | null => {
        return this.currentTurnId;
    };

    getModelReasoningEffort = (): string | undefined => {
        return this.modelReasoningEffort;
    };

    setStatusSnapshotProvider = (provider: (() => Promise<CodexStatusSnapshot>) | null): void => {
        this.statusSnapshotProvider = provider;
    };

    getStatusSnapshot = async (): Promise<CodexStatusSnapshot | null> => {
        if (!this.statusSnapshotProvider) {
            return null;
        }
        return await this.statusSnapshotProvider();
    };

    sendAgentMessage = (message: unknown): void => {
        this.client.sendAgentMessage(message);
    };

    sendUserMessage = (text: string): void => {
        this.client.sendUserMessage(text);
    };

    sendSessionEvent = (event: Parameters<ApiSessionClient['sendSessionEvent']>[0]): void => {
        this.client.sendSessionEvent(event);
    };
}
