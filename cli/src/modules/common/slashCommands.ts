import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';
import type {
    SlashCommandDefinition,
    SlashCommandsResponse
} from '@hapi/protocol/slashCommands';

export type SlashCommand = SlashCommandDefinition
export type ListSlashCommandsRequest = { agent: string }
export type ListSlashCommandsResponse = SlashCommandsResponse

/**
 * Interface for installed_plugins.json structure
 */
interface InstalledPluginsFile {
    version: number;
    plugins: Record<string, Array<{
        scope: string;
        installPath: string;
        version: string;
        installedAt: string;
        lastUpdated: string;
        gitCommitSha?: string;
    }>>;
}
function parseFrontmatter(fileContent: string): { description?: string; content: string } {
    // Match frontmatter: starts with ---, ends with ---
    const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (match) {
        const yamlContent = match[1];
        const body = match[2].trim();
        try {
            const parsed = parseYaml(yamlContent) as Record<string, unknown> | null;
            const description = typeof parsed?.description === 'string' ? parsed.description : undefined;
            return { description, content: body };
        } catch {
            // Invalid YAML - the --- block is not valid frontmatter, return entire file
            return { content: fileContent.trim() };
        }
    }
    // No frontmatter, entire file is content
    return { content: fileContent.trim() };
}

/**
 * Get the user commands directory for an agent type.
 * Returns null if the agent doesn't support user commands.
 */
function getUserCommandsDir(agent: string): string | null {
    if (agent !== 'codex') {
        return null;
    }
    const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
    return join(codexHome, 'prompts');
}

/**
 * Get the project commands directory for an agent type.
 * Returns null if the agent doesn't support project commands.
 */
function getProjectCommandsDir(agent: string, projectDir: string): string | null {
    if (agent !== 'codex') {
        return null;
    }
    return join(projectDir, '.codex', 'prompts');
}

/**
 * Scan a directory for commands (*.md files).
 * Returns commands with parsed frontmatter.
 */
async function scanCommandsDir(
    dir: string,
    source: 'user' | 'plugin' | 'project',
    pluginName?: string
): Promise<SlashCommandDefinition[]> {
    async function scanRecursive(currentDir: string, segments: string[]): Promise<SlashCommandDefinition[]> {
        const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => null);
        if (!entries) {
            return [];
        }

        const commandsByEntry = await Promise.all(
            entries.map(async (entry): Promise<SlashCommandDefinition[]> => {
                if (entry.name.startsWith('.') || entry.isSymbolicLink()) {
                    return [];
                }

                if (entry.isDirectory()) {
                    if (entry.name.includes(':')) return [];
                    return scanRecursive(join(currentDir, entry.name), [...segments, entry.name]);
                }

                if (!entry.isFile() || !entry.name.endsWith('.md')) {
                    return [];
                }

                const baseName = entry.name.slice(0, -3);
                if (!baseName || baseName.includes(':')) {
                    return [];
                }

                const localName = [...segments, baseName].join(':');
                const name = pluginName ? `${pluginName}:${localName}` : localName;
                const fallbackDescription = source === 'plugin' ? `${pluginName ?? 'plugin'} command` : 'Custom command';

                try {
                    const filePath = join(currentDir, entry.name);
                    const fileContent = await readFile(filePath, 'utf-8');
                    const parsed = parseFrontmatter(fileContent);

                    return [{
                        name,
                        description: parsed.description ?? fallbackDescription,
                        source,
                        kind: 'prompt-template',
                        availability: 'both',
                        argPolicy: 'none',
                        webSupported: true,
                        discoverable: true,
                        content: parsed.content,
                        pluginName,
                    }];
                } catch {
                    return [{
                        name,
                        description: fallbackDescription,
                        source,
                        kind: 'prompt-template',
                        availability: 'both',
                        argPolicy: 'none',
                        webSupported: true,
                        discoverable: true,
                        pluginName,
                    }];
                }
            })
        );

        return commandsByEntry.flat();
    }

    const commands = await scanRecursive(dir, []);
    return commands.sort((a, b) => a.name.localeCompare(b.name));
}

async function scanUserCommands(agent: string): Promise<SlashCommand[]> {
    const dir = getUserCommandsDir(agent);
    if (!dir) {
        return [];
    }
    return scanCommandsDir(dir, 'user');
}

async function scanProjectCommands(agent: string, projectDir?: string): Promise<SlashCommand[]> {
    if (!projectDir) {
        return [];
    }

    const dir = getProjectCommandsDir(agent, projectDir);
    if (!dir) {
        return [];
    }

    return scanCommandsDir(dir, 'project');
}

async function scanPluginCommands(agent: string): Promise<SlashCommand[]> {
    void agent
    return []
}

/**
 * List all available slash commands for an agent type.
 * Returns built-in commands, user-defined commands, plugin commands, and project commands.
 *
 * Merge order follows locality precedence for custom commands:
 * built-in -> global user -> plugin -> project (project overrides same-name globals).
 */
export async function listSlashCommands(agent: string, projectDir?: string): Promise<SlashCommand[]> {
    // Scan all command sources in parallel
    const [user, plugin, project] = await Promise.all([
        scanUserCommands(agent),
        scanPluginCommands(agent),
        scanProjectCommands(agent, projectDir),
    ]);

    const allCommands = [...user, ...plugin, ...project];

    // Keep insertion order while allowing latter commands to override prior ones.
    const commandMap = new Map<string, SlashCommand>();
    for (const command of allCommands) {
        if (commandMap.has(command.name)) {
            commandMap.delete(command.name);
        }
        commandMap.set(command.name, command);
    }

    return Array.from(commandMap.values());
}
