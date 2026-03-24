import { randomUUID } from 'node:crypto';
import type {
    ExecuteSlashCommandResponse,
    ParsedSlashCommandInput,
    SlashCommandDefinition
} from '@hapi/protocol/slashCommands';
import type { ReviewTarget } from './appServerTypes';
import type { EnhancedMode } from './loop';
import type { CodexSession } from './session';
import { listSlashCommands as listPromptSlashCommands } from '@/modules/common/slashCommands';

type SlashCommandSessionEvent = Parameters<CodexSession['sendSessionEvent']>[0];

type SlashCommandOutput = {
    sendAgentMessage: (message: unknown) => void;
    sendSessionEvent: (event: SlashCommandSessionEvent) => void;
};

type ExecuteCodexSlashCommandArgs = {
    command: SlashCommandDefinition;
    parsedInput: Extract<ParsedSlashCommandInput, { kind: 'slash' }>;
    output: SlashCommandOutput;
    runtimeSession: CodexSession | null;
    workingDirectory: string;
    queuePrompt: (content: string, mode: EnhancedMode) => void;
    currentMode: EnhancedMode;
};

const BUILTIN_COMMANDS: SlashCommandDefinition[] = [
    {
        name: 'status',
        description: 'Show current session configuration and token usage',
        source: 'builtin',
        kind: 'action',
        availability: 'both',
        argPolicy: 'none',
        webSupported: true,
        discoverable: true
    },
    {
        name: 'help',
        description: 'Show available slash commands',
        source: 'builtin',
        kind: 'action',
        availability: 'both',
        argPolicy: 'none',
        webSupported: true,
        discoverable: true
    },
    {
        name: 'review',
        description: 'Review uncommitted changes, a branch, a commit, or custom instructions',
        source: 'builtin',
        kind: 'action',
        availability: 'both',
        argPolicy: 'raw-tail',
        webSupported: true,
        discoverable: true
    },
    {
        name: 'compact',
        description: 'Request conversation context compaction',
        source: 'builtin',
        kind: 'action',
        availability: 'both',
        argPolicy: 'none',
        webSupported: true,
        discoverable: true
    },
    {
        name: 'undo',
        description: 'Roll back the last conversation turn or a given number of turns',
        source: 'builtin',
        kind: 'action',
        availability: 'both',
        argPolicy: 'raw-tail',
        webSupported: true,
        discoverable: true
    }
];

function findBuiltinSlashCommand(name: string): SlashCommandDefinition | undefined {
    return BUILTIN_COMMANDS.find((command) => command.name === name);
}

function renderSlashHelp(commands: SlashCommandDefinition[]): string {
    const lines = [
        '## Slash Commands',
        '',
        'Built-in:',
        ...BUILTIN_COMMANDS.map((command) => `- \`/${command.name}\` ${command.description ?? ''}`.trim()),
    ];

    const customCommands = commands.filter((command) => command.source !== 'builtin');
    if (customCommands.length > 0) {
        lines.push('', 'Custom prompt commands:');
        for (const command of customCommands) {
            lines.push(`- \`/${command.name}\` ${command.description ?? ''}`.trim());
        }
    }

    lines.push(
        '',
        'Examples:',
        '- `/review`',
        '- `/review branch main`',
        '- `/review commit abc123 Fix login flow`',
        '- `/review investigate recent diff for auth regressions`',
        '- `/compact`',
        '- `/undo`',
        '- `/undo 2`'
    );

    return lines.join('\n');
}

function buildInvalidArguments(message: string): ExecuteSlashCommandResponse {
    return {
        ok: false,
        code: 'invalid-arguments',
        message
    };
}

function buildUnsupported(message: string): ExecuteSlashCommandResponse {
    return {
        ok: false,
        code: 'unsupported',
        message
    };
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return fallback;
}

function buildHandledResult(commandName: string, emittedMessages: boolean): ExecuteSlashCommandResponse {
    return {
        ok: true,
        handled: true,
        commandName,
        emittedMessages
    };
}

export function parseReviewTarget(rawTail: string): ReviewTarget | null {
    const trimmed = rawTail.trim();
    if (!trimmed) {
        return { type: 'uncommittedChanges' };
    }

    const [head, ...rest] = trimmed.split(/\s+/);
    const keyword = head.toLowerCase();

    if (keyword === 'branch') {
        const branch = rest.join(' ').trim();
        return branch ? { type: 'baseBranch', branch } : null;
    }

    if (keyword === 'commit') {
        const sha = rest.shift()?.trim() ?? '';
        const title = rest.join(' ').trim();
        if (!sha) {
            return null;
        }
        return {
            type: 'commit',
            sha,
            title: title || null
        };
    }

    return {
        type: 'custom',
        instructions: trimmed
    };
}

export function parseUndoCount(rawTail: string): number | null {
    const trimmed = rawTail.trim();
    if (!trimmed) {
        return 1;
    }

    if (!/^\d+$/.test(trimmed)) {
        return null;
    }

    const value = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(value) || value < 1) {
        return null;
    }

    return value;
}

function buildReviewPrompt(target: ReviewTarget): string {
    const suffix = 'Focus on bugs, regressions, risky changes, and missing tests. Return prioritized findings.'

    switch (target.type) {
        case 'uncommittedChanges':
            return `Review the current code changes (staged, unstaged, and untracked files). ${suffix}`
        case 'baseBranch':
            return `Review the changes against base branch \`${target.branch}\`. ${suffix}`
        case 'commit':
            return `Review commit \`${target.sha}\`${target.title ? ` (${target.title})` : ''}. ${suffix}`
        case 'custom':
            return `Perform a code review with the following instructions:\n\n${target.instructions}\n\n${suffix}`
    }
}

export async function listCodexSlashCommands(workingDirectory: string): Promise<SlashCommandDefinition[]> {
    const promptCommands = await listPromptSlashCommands('codex', workingDirectory);
    return [
        ...BUILTIN_COMMANDS,
        ...promptCommands.filter((command) => !findBuiltinSlashCommand(command.name))
    ];
}

export async function executeCodexSlashCommand(args: ExecuteCodexSlashCommandArgs): Promise<ExecuteSlashCommandResponse> {
    const { command, parsedInput, output, runtimeSession, workingDirectory, queuePrompt, currentMode } = args;

    if (command.argPolicy === 'none' && parsedInput.rawTail) {
        return buildInvalidArguments(`/${command.name} does not accept arguments`);
    }

    if (command.source !== 'builtin') {
        if (command.kind === 'prompt-template' && command.content) {
            queuePrompt(command.content, currentMode);
            return {
                ok: true,
                handled: true,
                commandName: command.name,
                emittedMessages: true
            };
        }

        return buildUnsupported(`/${command.name} is not supported by the web executor`);
    }

    if (command.name === 'status') {
        if (!runtimeSession) {
            return buildUnsupported('Codex session runtime unavailable');
        }

        const snapshot = await runtimeSession.getStatusSnapshot();
        if (snapshot) {
            output.sendSessionEvent({
                type: 'status',
                snapshot
            });
        } else {
            output.sendSessionEvent({
                type: 'message',
                message: 'Status data unavailable'
            });
        }

        return buildHandledResult(command.name, true);
    }

    if (command.name === 'help') {
        const commands = await listCodexSlashCommands(workingDirectory);
        output.sendAgentMessage({
            type: 'message',
            message: renderSlashHelp(commands),
            id: randomUUID()
        });

        return buildHandledResult(command.name, true);
    }

    if (command.name === 'review') {
        const target = parseReviewTarget(parsedInput.rawTail);
        if (!target) {
            return buildInvalidArguments('Usage: /review [branch <name> | commit <sha> [title] | <custom instructions>]');
        }

        queuePrompt(buildReviewPrompt(target), currentMode);
        output.sendAgentMessage({
            type: 'message',
            message: 'Started code review for the current session.',
            id: randomUUID()
        });
        return buildHandledResult(command.name, true);
    }

    if (!runtimeSession) {
        return buildUnsupported('Codex session runtime unavailable');
    }

    const runtimeProvider = runtimeSession.getSlashCommandRuntimeProvider();
    if (!runtimeProvider) {
        return buildUnsupported(`/${command.name} is not available before the remote Codex runtime is ready`);
    }

    if (command.name === 'compact') {
        try {
            await runtimeProvider.startThreadCompaction();
            output.sendAgentMessage({
                type: 'message',
                message: 'Requested context compaction for the current thread.',
                id: randomUUID()
            });
            return buildHandledResult(command.name, true);
        } catch (error) {
            output.sendAgentMessage({
                type: 'message',
                message: `/compact failed: ${getErrorMessage(error, 'Unable to compact the current thread')}`,
                id: randomUUID()
            });
            return buildHandledResult(command.name, true);
        }
    }

    if (command.name === 'undo') {
        const numTurns = parseUndoCount(parsedInput.rawTail);
        if (numTurns === null) {
            return buildInvalidArguments('Usage: /undo [numTurns]');
        }

        try {
            await runtimeProvider.rollbackThread(numTurns);
            output.sendAgentMessage({
                type: 'message',
                message: numTurns === 1
                    ? 'Rolled back the last turn. Note: local file changes are not reverted automatically.'
                    : `Rolled back the last ${numTurns} turns. Note: local file changes are not reverted automatically.`,
                id: randomUUID()
            });
            return buildHandledResult(command.name, true);
        } catch (error) {
            output.sendAgentMessage({
                type: 'message',
                message: `/undo failed: ${getErrorMessage(error, 'Unable to roll back the current thread')}`,
                id: randomUUID()
            });
            return buildHandledResult(command.name, true);
        }
    }

    return buildUnsupported(`/${command.name} is not supported by the web executor`);
}
