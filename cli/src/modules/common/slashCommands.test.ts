import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { listSlashCommands } from './slashCommands'

describe('listSlashCommands', () => {
    const originalCodexHome = process.env.CODEX_HOME
    let sandboxDir: string
    let codexHomeDir: string
    let projectDir: string

    beforeEach(async () => {
        sandboxDir = await mkdtemp(join(tmpdir(), 'hapi-slash-commands-'))
        codexHomeDir = join(sandboxDir, 'global-codex')
        projectDir = join(sandboxDir, 'project')

        process.env.CODEX_HOME = codexHomeDir

        await mkdir(join(codexHomeDir, 'prompts'), { recursive: true })
        await mkdir(join(projectDir, '.codex', 'prompts'), { recursive: true })
    })

    afterEach(async () => {
        if (originalCodexHome === undefined) {
            delete process.env.CODEX_HOME
        } else {
            process.env.CODEX_HOME = originalCodexHome
        }

        await rm(sandboxDir, { recursive: true, force: true })
    })

    it('keeps backward-compatible behavior when projectDir is not provided', async () => {
        await writeFile(
            join(codexHomeDir, 'prompts', 'global-only.md'),
            ['---', 'description: Global only', '---', '', 'Global command body'].join('\n')
        )

        const commands = await listSlashCommands('codex')
        const command = commands.find(cmd => cmd.name === 'global-only')

        expect(command).toBeDefined()
        expect(command?.source).toBe('user')
        expect(command?.description).toBe('Global only')
        expect(command?.kind).toBe('prompt-template')
        expect(command?.webSupported).toBe(true)
    })

    it('loads project-level commands when projectDir is provided', async () => {
        await writeFile(
            join(projectDir, '.codex', 'prompts', 'project-only.md'),
            ['---', 'description: Project only', '---', '', 'Project command body'].join('\n')
        )

        const commands = await listSlashCommands('codex', projectDir)
        const command = commands.find(cmd => cmd.name === 'project-only')

        expect(command).toBeDefined()
        expect(command?.source).toBe('project')
        expect(command?.description).toBe('Project only')
    })

    it('prefers project command when project and global have same name', async () => {
        await writeFile(
            join(codexHomeDir, 'prompts', 'shared.md'),
            ['---', 'description: Global shared', '---', '', 'Global body'].join('\n')
        )
        await writeFile(
            join(projectDir, '.codex', 'prompts', 'shared.md'),
            ['---', 'description: Project shared', '---', '', 'Project body'].join('\n')
        )

        const commands = await listSlashCommands('codex', projectDir)
        const sharedCommands = commands.filter(cmd => cmd.name === 'shared')

        expect(sharedCommands).toHaveLength(1)
        expect(sharedCommands[0]?.source).toBe('project')
        expect(sharedCommands[0]?.description).toBe('Project shared')
        expect(sharedCommands[0]?.content).toBe('Project body')
        expect(sharedCommands[0]?.argPolicy).toBe('none')
    })

    it('loads nested project commands using colon-separated names', async () => {
        await mkdir(join(projectDir, '.codex', 'prompts', 'trellis'), { recursive: true })
        await writeFile(
            join(projectDir, '.codex', 'prompts', 'trellis', 'start.md'),
            ['---', 'description: Trellis start', '---', '', 'Start flow'].join('\n')
        )

        const commands = await listSlashCommands('codex', projectDir)
        const command = commands.find(cmd => cmd.name === 'trellis:start')

        expect(command).toBeDefined()
        expect(command?.source).toBe('project')
        expect(command?.description).toBe('Trellis start')
    })

    it('returns empty project commands when project directory does not exist', async () => {
        const nonExistentProjectDir = join(sandboxDir, 'not-exists')

        await expect(listSlashCommands('codex', nonExistentProjectDir)).resolves.toBeDefined()
    })
})
