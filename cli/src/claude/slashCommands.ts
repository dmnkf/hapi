import type { RuntimeSlashCommand, SessionRuntimeSlashCommands } from '@hapi/protocol'

function normalizeSlashCommandName(name: string): string | null {
    const trimmed = name.trim()
    if (!trimmed) {
        return null
    }

    return trimmed.startsWith('/') ? trimmed.slice(1).trim() || null : trimmed
}

export function runtimeSlashCommandsFromClaudeSdk(commands?: string[]): SessionRuntimeSlashCommands | null {
    if (!commands) {
        return null
    }

    const byName = new Map<string, RuntimeSlashCommand>()
    for (const command of commands) {
        const name = normalizeSlashCommandName(command)
        if (!name) {
            continue
        }

        byName.set(name, {
            name,
            source: 'runtime'
        })
    }

    return {
        commands: Array.from(byName.values()),
        source: 'dynamic',
        updatedAt: Date.now()
    }
}
