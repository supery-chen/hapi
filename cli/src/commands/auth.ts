import chalk from 'chalk'
import os from 'node:os'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { configuration } from '@/configuration'
import { readSettings, clearMachineId, updateSettings } from '@/persistence'
import { initializeApiUrl } from '@/ui/apiUrlInit'
import { getExposeMachinePreference } from '@/utils/machineExposure'
import type { CommandDefinition } from './types'

export async function handleAuthCommand(args: string[]): Promise<void> {
    const subcommand = args[0]

    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        showHelp()
        return
    }

    if (subcommand === 'status') {
        await initializeApiUrl()
        const settings = await readSettings()
        const exposeMachine = await getExposeMachinePreference()
        const envToken = process.env.CLI_API_TOKEN
        const settingsToken = settings.cliApiToken
        const hasToken = Boolean(envToken || settingsToken)
        const tokenSource = envToken ? 'environment' : (settingsToken ? 'settings file' : 'none')
        console.log(chalk.bold('\nDirect Connect Status\n'))
        console.log(chalk.gray(`  HAPI_API_URL: ${configuration.apiUrl}`))
        console.log(chalk.gray(`  CLI_API_TOKEN: ${hasToken ? 'set' : 'missing'}`))
        console.log(chalk.gray(`  Token Source: ${tokenSource}`))
        console.log(chalk.gray(`  Machine ID: ${settings.machineId ?? 'not set'}`))
        console.log(chalk.gray(`  Expose as machine: ${exposeMachine.value ? 'enabled' : 'disabled'} (${exposeMachine.source})`))
        console.log(chalk.gray(`  Host: ${os.hostname()}`))

        if (!hasToken) {
            console.log('')
            console.log(chalk.yellow('  Token not configured. To get your token:'))
            console.log(chalk.gray('    1. Check the server startup logs (first run shows generated token)'))
            console.log(chalk.gray('    2. Read ~/.hapi/settings.json on the server'))
            console.log(chalk.gray('    3. Ask your server administrator (if token is set via env var)'))
            console.log('')
            console.log(chalk.gray('  Then run: hapi auth login'))
        }
        return
    }

    if (subcommand === 'machine') {
        const machineSubcommand = args[1] ?? 'status'

        if (machineSubcommand === 'status') {
            const exposeMachine = await getExposeMachinePreference()
            console.log(chalk.bold('\nMachine Exposure\n'))
            console.log(chalk.gray(`  Expose as machine when running \`hapi hub\`: ${exposeMachine.value ? 'enabled' : 'disabled'}`))
            console.log(chalk.gray(`  Source: ${exposeMachine.source}`))
            if (exposeMachine.source === 'environment') {
                console.log(chalk.yellow('  HAPI_EXPOSE_MACHINE environment variable overrides local settings.'))
            }
            return
        }

        if (machineSubcommand === 'on' || machineSubcommand === 'enable') {
            await updateSettings((current) => ({
                ...current,
                exposeMachine: true
            }))
            console.log(chalk.green('Enabled local machine exposure for `hapi hub`.'))
            console.log(chalk.gray('Start `hapi hub` to ensure this machine is available in the web app.'))
            return
        }

        if (machineSubcommand === 'off' || machineSubcommand === 'disable') {
            await updateSettings((current) => ({
                ...current,
                exposeMachine: false
            }))
            console.log(chalk.green('Disabled local machine exposure for `hapi hub`.'))
            console.log(chalk.gray('Existing runner processes are not stopped automatically.'))
            return
        }

        console.error(chalk.red(`Unknown machine subcommand: ${machineSubcommand}`))
        showHelp()
        process.exit(1)
    }

    if (subcommand === 'login') {
        if (!process.stdin.isTTY) {
            console.error(chalk.red('Cannot prompt for token in non-TTY environment.'))
            console.error(chalk.gray('Set CLI_API_TOKEN environment variable instead.'))
            process.exit(1)
        }

        const rl = readline.createInterface({ input, output })

        try {
            const token = await rl.question(chalk.cyan('Enter CLI_API_TOKEN: '))

            if (!token.trim()) {
                console.error(chalk.red('Token cannot be empty'))
                process.exit(1)
            }

            await updateSettings(current => ({
                ...current,
                cliApiToken: token.trim()
            }))
            configuration._setCliApiToken(token.trim())
            console.log(chalk.green(`\nToken saved to ${configuration.settingsFile}`))
        } finally {
            rl.close()
        }
        return
    }

    if (subcommand === 'logout') {
        await updateSettings(current => ({
            ...current,
            cliApiToken: undefined
        }))
        await clearMachineId()
        console.log(chalk.green('Cleared local credentials (token and machineId).'))
        console.log(chalk.gray('Note: If CLI_API_TOKEN is set via environment variable, it will still be used.'))
        return
    }

    console.error(chalk.red(`Unknown auth subcommand: ${subcommand}`))
    showHelp()
    process.exit(1)
}

function showHelp(): void {
    console.log(`
${chalk.bold('hapi auth')} - Authentication management

${chalk.bold('Usage:')}
  hapi auth status            Show current configuration
  hapi auth login             Enter and save CLI_API_TOKEN
  hapi auth logout            Clear saved credentials
  hapi auth machine status    Show whether \`hapi hub\` exposes this machine
  hapi auth machine on        Auto-expose this machine when running \`hapi hub\`
  hapi auth machine off       Do not auto-expose this machine when running \`hapi hub\`

${chalk.bold('Token priority (highest to lowest):')}
  1. CLI_API_TOKEN environment variable
  2. ~/.hapi/settings.json
  3. Interactive prompt (on first run)
`)
}

export const authCommand: CommandDefinition = {
    name: 'auth',
    requiresRuntimeAssets: true,
    run: async ({ commandArgs }) => {
        try {
            await handleAuthCommand(commandArgs)
        } catch (error) {
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error')
            if (process.env.DEBUG) {
                console.error(error)
            }
            process.exit(1)
        }
    }
}
