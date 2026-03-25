import { randomUUID } from 'node:crypto';
import type {
    ExecuteSlashCommandResponse,
    ParsedSlashCommandInput,
    SlashCommandDefinition
} from '@hapi/protocol/slashCommands';
import type { McpServerStatusEntry, ReviewTarget, SkillListEntry } from './appServerTypes';
import type { EnhancedMode } from './loop';
import type { CodexSession } from './session';
import { listSlashCommands as listPromptSlashCommands } from '@/modules/common/slashCommands';

type SlashCommandSessionEvent = Parameters<CodexSession['sendSessionEvent']>[0];

type SlashCommandOutput = {
    sendAgentMessage: (message: unknown) => void;
    sendSessionEvent: (event: SlashCommandSessionEvent) => void;
};

type McpServerConfigEntry = {
    command: string | null;
    args: string[];
    enabled: boolean | null;
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
        name: 'mcp',
        description: 'List configured MCP servers and their status',
        source: 'builtin',
        kind: 'action',
        availability: 'both',
        argPolicy: 'none',
        webSupported: true,
        discoverable: true
    },
    {
        name: 'skills',
        description: 'List available skills for the current working directory',
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
        '- `/mcp`',
        '- `/skills`',
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

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => asString(entry))
        .filter((entry): entry is string => Boolean(entry));
}

function formatCommandPart(value: string): string {
    return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : JSON.stringify(value);
}

function formatCommand(command: string | null, args: string[]): string {
    if (!command) {
        return '(unknown)';
    }

    return [command, ...args]
        .map((part) => formatCommandPart(part))
        .join(' ');
}

function formatAuthStatus(value: string | null): string {
    if (!value) {
        return 'Unknown';
    }

    const normalized = value.trim().toLowerCase();
    switch (normalized) {
        case 'unsupported':
            return 'Unsupported';
        case 'authenticated':
            return 'Authenticated';
        case 'not_authenticated':
        case 'not-authenticated':
            return 'Not authenticated';
        case 'oauth_required':
        case 'oauth-required':
            return 'OAuth required';
        default:
            return normalized
                .split(/[_-\s]+/)
                .filter(Boolean)
                .map((part) => part === 'oauth' ? 'OAuth' : `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
                .join(' ');
    }
}

function formatNamedCollection(
    value: unknown,
    options?: {
        unavailable?: boolean;
    }
): string {
    if (options?.unavailable) {
        return '(unavailable)';
    }

    if (!Array.isArray(value) || value.length === 0) {
        return '(none)';
    }

    const labels = value
        .map((entry) => {
            if (typeof entry === 'string' && entry.trim().length > 0) {
                return entry.trim();
            }

            const record = asRecord(entry);
            return asString(
                record?.name
                ?? record?.uriTemplate
                ?? record?.uri
                ?? record?.title
                ?? record?.id
            );
        })
        .filter((entry): entry is string => Boolean(entry));

    if (labels.length > 0) {
        return labels.join(', ');
    }

    return `${value.length} item${value.length === 1 ? '' : 's'}`;
}

function parseMcpServerConfigs(configResult: unknown): Record<string, McpServerConfigEntry> {
    const root = asRecord(configResult);
    const config = asRecord(root?.config ?? configResult);
    const mcpServers = asRecord(config?.mcp_servers ?? config?.mcpServers);
    const results: Record<string, McpServerConfigEntry> = {};

    if (!mcpServers) {
        return results;
    }

    for (const [name, rawEntry] of Object.entries(mcpServers)) {
        const entry = asRecord(rawEntry);
        results[name] = {
            command: asString(entry?.command),
            args: asStringArray(entry?.args),
            enabled: asBoolean(entry?.enabled)
        };
    }

    return results;
}

function formatMcpStatusMessage(args: {
    config: unknown;
    statuses: McpServerStatusEntry[];
}): string {
    const configEntries = parseMcpServerConfigs(args.config);
    const statusEntries = new Map<string, Record<string, unknown>>();

    for (const statusEntry of args.statuses) {
        const statusRecord = asRecord(statusEntry);
        if (!statusRecord) {
            continue;
        }
        const name = asString(statusRecord?.name);
        if (!name) {
            continue;
        }
        statusEntries.set(name, statusRecord);
    }

    const names = Array.from(new Set([
        ...Object.keys(configEntries),
        ...statusEntries.keys()
    ])).sort((left, right) => left.localeCompare(right));

    const body: string[] = [];
    if (names.length === 0) {
        body.push('No MCP servers configured.');
    }

    for (const name of names) {
        const configEntry = configEntries[name];
        const statusEntry = statusEntries.get(name) ?? null;
        const statusLabel = configEntry?.enabled === false
            ? 'disabled'
            : (configEntry?.enabled === true || statusEntry)
                ? 'enabled'
                : 'unknown';
        const authLabel = statusEntry
            ? formatAuthStatus(asString(statusEntry.authStatus))
            : 'Unavailable';
        const toolNames = statusEntry
            ? Object.keys(asRecord(statusEntry.tools) ?? {}).sort().join(', ') || '(none)'
            : '(unavailable)';

        body.push(`• ${name}`);
        body.push(`  • Status: ${statusLabel}`);
        body.push(`  • Auth: ${authLabel}`);
        body.push(`  • Command: ${formatCommand(configEntry?.command ?? null, configEntry?.args ?? [])}`);
        body.push(`  • Tools: ${toolNames}`);
        body.push(`  • Resources: ${formatNamedCollection(statusEntry?.resources, { unavailable: !statusEntry })}`);
        body.push(`  • Resource templates: ${formatNamedCollection(statusEntry?.resourceTemplates, { unavailable: !statusEntry })}`);
        body.push('');
    }

    while (body.length > 0 && body[body.length - 1] === '') {
        body.pop();
    }

    return [
        '🔌  MCP Tools',
        '',
        '```text',
        ...body,
        '```'
    ].join('\n');
}

function truncateText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }

    if (maxLength <= 3) {
        return value.slice(0, maxLength);
    }

    return `${value.slice(0, maxLength - 3)}...`;
}

function formatSkillLabel(skill: Record<string, unknown>): string {
    const interfaceInfo = asRecord(skill.interface);
    return asString(interfaceInfo?.displayName)
        ?? asString(skill.name)
        ?? 'Unnamed Skill';
}

function formatSkillDescription(skill: Record<string, unknown>): string {
    const interfaceInfo = asRecord(skill.interface);
    const description = asString(interfaceInfo?.shortDescription)
        ?? asString(skill.shortDescription)
        ?? asString(skill.description)
        ?? 'No description';

    return truncateText(description, 100);
}

function getSkillScopePriority(scope: string | null): number {
    switch ((scope ?? '').toLowerCase()) {
        case 'system':
            return 0;
        case 'project':
            return 1;
        case 'user':
            return 2;
        default:
            return 3;
    }
}

function formatSkillsMessage(skills: SkillListEntry[]): string {
    const items = skills
        .map((skill) => asRecord(skill))
        .filter((skill): skill is Record<string, unknown> => Boolean(skill))
        .sort((left, right) => {
            const scopeOrder = getSkillScopePriority(asString(left.scope)) - getSkillScopePriority(asString(right.scope));
            if (scopeOrder !== 0) {
                return scopeOrder;
            }

            return formatSkillLabel(left).localeCompare(formatSkillLabel(right), undefined, { sensitivity: 'base' });
        });

    if (items.length === 0) {
        return [
            'Skills',
            '',
            'No skills available.'
        ].join('\n');
    }

    const labelWidth = Math.min(
        Math.max(...items.map((skill) => formatSkillLabel(skill).length)),
        22
    );

    const lines = items.map((skill) => {
        const label = formatSkillLabel(skill);
        const description = formatSkillDescription(skill);
        const enabled = asBoolean(skill.enabled);
        const suffix = enabled === false ? ' (disabled)' : '';
        return `${truncateText(label, labelWidth).padEnd(labelWidth)}  [Skill] ${description}${suffix}`;
    });

    return [
        'Skills',
        '',
        '```text',
        ...lines,
        '```'
    ].join('\n');
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

    if (command.name === 'mcp') {
        try {
            const result = await runtimeProvider.listMcpServers();
            output.sendAgentMessage({
                type: 'message',
                message: formatMcpStatusMessage(result),
                id: randomUUID()
            });
            return buildHandledResult(command.name, true);
        } catch (error) {
            output.sendAgentMessage({
                type: 'message',
                message: `/mcp failed: ${getErrorMessage(error, 'Unable to load MCP server status')}`,
                id: randomUUID()
            });
            return buildHandledResult(command.name, true);
        }
    }

    if (command.name === 'skills') {
        try {
            const skills = await runtimeProvider.listSkills();
            output.sendAgentMessage({
                type: 'message',
                message: formatSkillsMessage(skills),
                id: randomUUID()
            });
            return buildHandledResult(command.name, true);
        } catch (error) {
            output.sendAgentMessage({
                type: 'message',
                message: `/skills failed: ${getErrorMessage(error, 'Unable to load skills')}`,
                id: randomUUID()
            });
            return buildHandledResult(command.name, true);
        }
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
