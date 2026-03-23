import { z } from 'zod'

export const SLASH_COMMAND_SOURCES = ['builtin', 'user', 'plugin', 'project'] as const
export type SlashCommandSource = typeof SLASH_COMMAND_SOURCES[number]

export const SLASH_COMMAND_KINDS = ['action', 'prompt-template'] as const
export type SlashCommandKind = typeof SLASH_COMMAND_KINDS[number]

export const SLASH_COMMAND_AVAILABILITY = ['both', 'local-only', 'remote-only'] as const
export type SlashCommandAvailability = typeof SLASH_COMMAND_AVAILABILITY[number]

export const SLASH_COMMAND_ARG_POLICIES = ['none', 'raw-tail'] as const
export type SlashCommandArgPolicy = typeof SLASH_COMMAND_ARG_POLICIES[number]

export const SlashCommandDefinitionSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    source: z.enum(SLASH_COMMAND_SOURCES),
    kind: z.enum(SLASH_COMMAND_KINDS),
    availability: z.enum(SLASH_COMMAND_AVAILABILITY),
    argPolicy: z.enum(SLASH_COMMAND_ARG_POLICIES),
    webSupported: z.boolean(),
    discoverable: z.boolean(),
    content: z.string().optional(),
    pluginName: z.string().optional()
})

export type SlashCommandDefinition = z.infer<typeof SlashCommandDefinitionSchema>

export const SlashCommandsResponseSchema = z.object({
    success: z.boolean(),
    commands: z.array(SlashCommandDefinitionSchema).optional(),
    error: z.string().optional()
})

export type SlashCommandsResponse = z.infer<typeof SlashCommandsResponseSchema>

export const ExecuteSlashCommandRequestSchema = z.object({
    rawInput: z.string().min(1),
    source: z.enum(['webapp', 'telegram'])
})

export type ExecuteSlashCommandRequest = z.infer<typeof ExecuteSlashCommandRequestSchema>

export const ExecuteSlashCommandSuccessSchema = z.object({
    ok: z.literal(true),
    handled: z.literal(true),
    commandName: z.string().min(1),
    emittedMessages: z.boolean()
})

export const ExecuteSlashCommandErrorCodeSchema = z.enum([
    'not-found',
    'unsupported',
    'invalid-arguments',
    'attachments-not-supported',
    'not-available-in-current-mode'
])

export type ExecuteSlashCommandErrorCode = z.infer<typeof ExecuteSlashCommandErrorCodeSchema>

export const ExecuteSlashCommandErrorSchema = z.object({
    ok: z.literal(false),
    code: ExecuteSlashCommandErrorCodeSchema,
    message: z.string().min(1)
})

export const ExecuteSlashCommandResponseSchema = z.union([
    ExecuteSlashCommandSuccessSchema,
    ExecuteSlashCommandErrorSchema
])

export type ExecuteSlashCommandResponse = z.infer<typeof ExecuteSlashCommandResponseSchema>

export type ParsedSlashCommandInput =
    | { kind: 'not-slash' }
    | { kind: 'escaped'; text: string }
    | {
        kind: 'slash'
        rawInput: string
        commandName: string
        rawTail: string
    }

export function parseSlashCommandInput(input: string): ParsedSlashCommandInput {
    const trimmed = input.trim()
    if (!trimmed.startsWith('/')) {
        return { kind: 'not-slash' }
    }

    if (trimmed.includes('\n')) {
        return { kind: 'not-slash' }
    }

    if (trimmed.startsWith('//')) {
        return {
            kind: 'escaped',
            text: trimmed.slice(1)
        }
    }

    const withoutPrefix = trimmed.slice(1).trimStart()
    if (!withoutPrefix) {
        return { kind: 'not-slash' }
    }

    const firstWhitespaceIndex = withoutPrefix.search(/\s/)
    if (firstWhitespaceIndex === -1) {
        return {
            kind: 'slash',
            rawInput: trimmed,
            commandName: withoutPrefix,
            rawTail: ''
        }
    }

    return {
        kind: 'slash',
        rawInput: trimmed,
        commandName: withoutPrefix.slice(0, firstWhitespaceIndex),
        rawTail: withoutPrefix.slice(firstWhitespaceIndex).trim()
    }
}
