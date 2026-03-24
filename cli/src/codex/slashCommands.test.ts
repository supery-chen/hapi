import { describe, expect, it, vi } from 'vitest';
import type { SlashCommandDefinition } from '@hapi/protocol/slashCommands';
import {
    executeCodexSlashCommand,
    listCodexSlashCommands,
    parseReviewTarget,
    parseUndoCount
} from './slashCommands';
import type { EnhancedMode } from './loop';

vi.mock('@/modules/common/slashCommands', () => ({
    listSlashCommands: vi.fn(async () => ([
        {
            name: 'custom-prompt',
            description: 'Custom prompt',
            source: 'project',
            kind: 'prompt-template',
            availability: 'both',
            argPolicy: 'none',
            webSupported: true,
            discoverable: true,
            content: 'Prompt body'
        }
    ]))
}));

function createMode(): EnhancedMode {
    return {
        permissionMode: 'default',
        collaborationMode: 'default'
    };
}

function createBuiltinCommand(name: string): SlashCommandDefinition {
    const commands: SlashCommandDefinition[] = [
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
            description: 'Review target',
            source: 'builtin',
            kind: 'action',
            availability: 'both',
            argPolicy: 'raw-tail',
            webSupported: true,
            discoverable: true
        },
        {
            name: 'compact',
            description: 'Compact thread',
            source: 'builtin',
            kind: 'action',
            availability: 'both',
            argPolicy: 'none',
            webSupported: true,
            discoverable: true
        },
        {
            name: 'undo',
            description: 'Undo turns',
            source: 'builtin',
            kind: 'action',
            availability: 'both',
            argPolicy: 'raw-tail',
            webSupported: true,
            discoverable: true
        },
        {
            name: 'status',
            description: 'Status',
            source: 'builtin',
            kind: 'action',
            availability: 'both',
            argPolicy: 'none',
            webSupported: true,
            discoverable: true
        }
    ];

    const command = commands.find((candidate) => candidate.name === name);
    if (!command) {
        throw new Error(`Missing command ${name}`);
    }
    return command;
}

describe('codex slash commands', () => {
    it('lists builtin commands alongside prompt commands', async () => {
        const commands = await listCodexSlashCommands('/tmp/project');
        expect(commands.some((command) => command.name === 'status')).toBe(true);
        expect(commands.some((command) => command.name === 'help')).toBe(true);
        expect(commands.some((command) => command.name === 'review')).toBe(true);
        expect(commands.some((command) => command.name === 'compact')).toBe(true);
        expect(commands.some((command) => command.name === 'undo')).toBe(true);
        expect(commands.some((command) => command.name === 'custom-prompt')).toBe(true);
    });

    it('parses review targets from slash command tails', () => {
        expect(parseReviewTarget('')).toEqual({ type: 'uncommittedChanges' });
        expect(parseReviewTarget('branch main')).toEqual({ type: 'baseBranch', branch: 'main' });
        expect(parseReviewTarget('commit abc123 Fix test')).toEqual({
            type: 'commit',
            sha: 'abc123',
            title: 'Fix test'
        });
        expect(parseReviewTarget('inspect recent auth changes')).toEqual({
            type: 'custom',
            instructions: 'inspect recent auth changes'
        });
        expect(parseReviewTarget('branch')).toBeNull();
        expect(parseReviewTarget('commit')).toBeNull();
    });

    it('parses undo counts', () => {
        expect(parseUndoCount('')).toBe(1);
        expect(parseUndoCount('2')).toBe(2);
        expect(parseUndoCount('0')).toBeNull();
        expect(parseUndoCount('abc')).toBeNull();
    });

    it('executes /help as a local assistant message', async () => {
        const sendAgentMessage = vi.fn();

        const result = await executeCodexSlashCommand({
            command: createBuiltinCommand('help'),
            parsedInput: {
                kind: 'slash',
                rawInput: '/help',
                commandName: 'help',
                rawTail: ''
            },
            output: {
                sendAgentMessage,
                sendSessionEvent: vi.fn()
            },
            runtimeSession: null,
            workingDirectory: '/tmp/project',
            queuePrompt: vi.fn(),
            currentMode: createMode()
        });

        expect(result).toEqual({
            ok: true,
            handled: true,
            commandName: 'help',
            emittedMessages: true
        });
        expect(sendAgentMessage).toHaveBeenCalledTimes(1);
    });

    it('executes /review by queueing a review prompt', async () => {
        const queuePrompt = vi.fn();
        const sendAgentMessage = vi.fn();

        const result = await executeCodexSlashCommand({
            command: createBuiltinCommand('review'),
            parsedInput: {
                kind: 'slash',
                rawInput: '/review branch main',
                commandName: 'review',
                rawTail: 'branch main'
            },
            output: {
                sendAgentMessage,
                sendSessionEvent: vi.fn()
            },
            runtimeSession: null,
            workingDirectory: '/tmp/project',
            queuePrompt,
            currentMode: createMode()
        });

        expect(result).toEqual({
            ok: true,
            handled: true,
            commandName: 'review',
            emittedMessages: true
        });
        expect(queuePrompt).toHaveBeenCalledTimes(1);
        expect(queuePrompt.mock.calls[0]?.[0]).toContain('Review the changes against base branch `main`');
        expect(sendAgentMessage).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid /undo arguments', async () => {
        const result = await executeCodexSlashCommand({
            command: createBuiltinCommand('undo'),
            parsedInput: {
                kind: 'slash',
                rawInput: '/undo nope',
                commandName: 'undo',
                rawTail: 'nope'
            },
            output: {
                sendAgentMessage: vi.fn(),
                sendSessionEvent: vi.fn()
            },
            runtimeSession: {
                getSlashCommandRuntimeProvider: () => ({
                    startReview: vi.fn(async () => {}),
                    startThreadCompaction: vi.fn(async () => {}),
                    rollbackThread: vi.fn(async () => {})
                })
            } as never,
            workingDirectory: '/tmp/project',
            queuePrompt: vi.fn(),
            currentMode: createMode()
        });

        expect(result).toEqual({
            ok: false,
            code: 'invalid-arguments',
            message: 'Usage: /undo [numTurns]'
        });
    });

    it('queues prompt-template commands', async () => {
        const queuePrompt = vi.fn();

        const result = await executeCodexSlashCommand({
            command: {
                name: 'custom-prompt',
                description: 'Custom prompt',
                source: 'project',
                kind: 'prompt-template',
                availability: 'both',
                argPolicy: 'none',
                webSupported: true,
                discoverable: true,
                content: 'Prompt body'
            },
            parsedInput: {
                kind: 'slash',
                rawInput: '/custom-prompt',
                commandName: 'custom-prompt',
                rawTail: ''
            },
            output: {
                sendAgentMessage: vi.fn(),
                sendSessionEvent: vi.fn()
            },
            runtimeSession: null,
            workingDirectory: '/tmp/project',
            queuePrompt,
            currentMode: createMode()
        });

        expect(result).toEqual({
            ok: true,
            handled: true,
            commandName: 'custom-prompt',
            emittedMessages: true
        });
        expect(queuePrompt).toHaveBeenCalledWith('Prompt body', createMode());
    });
});
