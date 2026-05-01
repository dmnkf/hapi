import type { SlashCommand } from '@/types/api'

const BUILTIN_COMMANDS: Record<string, SlashCommand[]> = {
    claude: [
        { name: 'clear', description: 'Clear conversation history and free up context', source: 'builtin' },
        { name: 'compact', description: 'Clear conversation history but keep a summary in context', source: 'builtin' },
        { name: 'context', description: 'Visualize current context usage as a colored grid', source: 'builtin' },
        { name: 'cost', description: 'Show the total cost and duration of the current session', source: 'builtin' },
        { name: 'doctor', description: 'Diagnose and verify your Claude Code installation and settings', source: 'builtin' },
        { name: 'plan', description: 'View or open the current session plan', source: 'builtin' },
        { name: 'stats', description: 'Show your Claude Code usage statistics and activity', source: 'builtin' },
        { name: 'status', description: 'Show Claude Code status including version, model, account, and API connectivity', source: 'builtin' },
    ],
    codex: [
        { name: 'review', description: 'Run Codex code review mode', source: 'builtin' },
        { name: 'r', description: 'Alias for /review', source: 'builtin' },
        { name: 'compact', description: 'Compact conversation history into a summary', source: 'builtin' },
        { name: 'use', description: 'Load a Codex skill for the current task', source: 'builtin' },
        { name: 'apps', description: 'List available and connected app connectors', source: 'builtin' },
        { name: 'clear', description: 'Clear conversation history while keeping configuration', source: 'builtin' },
        { name: 'c', description: 'Alias for /clear', source: 'builtin' },
        { name: 'reset', description: 'Reset conversation history and session state', source: 'builtin' },
        { name: 'model', description: 'Switch Codex model for the current session', source: 'builtin' },
        { name: 'approval', description: 'Change Codex approval mode for the current session', source: 'builtin' },
        { name: 'sandbox', description: 'Change Codex sandbox mode for the current session', source: 'builtin' },
        { name: 'help', description: 'Show Codex help and available commands', source: 'builtin' },
        { name: 'h', description: 'Alias for /help', source: 'builtin' },
        { name: 'status', description: 'Show Codex session status and current configuration', source: 'builtin' },
        { name: 's', description: 'Alias for /status', source: 'builtin' },
    ],
    gemini: [
        { name: 'about', description: 'Show version info', source: 'builtin' },
        { name: 'clear', description: 'Clear the screen and conversation history', source: 'builtin' },
        { name: 'compress', description: 'Compress the context by replacing it with a summary', source: 'builtin' },
        { name: 'stats', description: 'Check session stats', source: 'builtin' },
    ],
    opencode: [],
}

export function getBuiltinSlashCommands(agentType: string): SlashCommand[] {
    return BUILTIN_COMMANDS[agentType] ?? BUILTIN_COMMANDS.claude ?? []
}
