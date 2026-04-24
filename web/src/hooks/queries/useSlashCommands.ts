import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import type { Session, SlashCommand } from '@/types/api'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { queryKeys } from '@/lib/query-keys'
import { getBuiltinSlashCommands } from '@/lib/codexSlashCommands'

function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length
    const matrix: number[][] = []
    for (let i = 0; i <= b.length; i++) matrix[i] = [i]
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            matrix[i][j] = b[i - 1] === a[j - 1]
                ? matrix[i - 1][j - 1]
                : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        }
    }
    return matrix[b.length][a.length]
}

function normalizeRuntimeName(name: string): string {
    return name.startsWith('/') ? name.slice(1) : name
}

function mergeCommands(commands: SlashCommand[]): SlashCommand[] {
    const byName = new Map<string, SlashCommand>()
    for (const command of commands) {
        if (byName.has(command.name)) {
            byName.delete(command.name)
        }
        byName.set(command.name, command)
    }
    return Array.from(byName.values())
}

function runtimeCommandsFromSession(session?: Session | null): SlashCommand[] {
    const runtimeCommands = session?.runtimeSlashCommands?.commands
    if (runtimeCommands && runtimeCommands.length > 0) {
        return runtimeCommands.map((command) => ({
            ...command,
            name: normalizeRuntimeName(command.name),
            source: 'runtime' as const
        }))
    }

    const metadataCommands = session?.metadata?.slashCommands
    if (!metadataCommands || metadataCommands.length === 0) {
        return []
    }

    return metadataCommands
        .map((command) => normalizeRuntimeName(command.trim()))
        .filter((command) => command.length > 0)
        .map((command) => ({
            name: command,
            source: 'runtime' as const
        }))
}

function suggestionDescription(command: SlashCommand): string | undefined {
    if (command.description) {
        return command.description
    }
    if (command.source === 'builtin' || command.source === 'runtime') {
        return undefined
    }
    return 'Custom command'
}

export function useSlashCommands(
    api: ApiClient | null,
    sessionId: string | null,
    agentType: string = 'claude',
    session?: Session | null
): {
    commands: SlashCommand[]
    isLoading: boolean
    error: string | null
    getSuggestions: (query: string) => Promise<Suggestion[]>
} {
    const resolvedSessionId = sessionId ?? 'unknown'

    // Fetch user-defined commands from the CLI (requires active session)
    const query = useQuery({
        queryKey: queryKeys.slashCommands(resolvedSessionId),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.getSlashCommands(sessionId)
        },
        enabled: Boolean(api && sessionId),
        staleTime: 5_000,
        gcTime: 30 * 60 * 1000,
        retry: false, // Don't retry RPC failures
    })

    // Runtime commands replace hardcoded built-ins; custom file/plugin commands
    // still merge in so local prompt files can provide expanded content.
    const commands = useMemo(() => {
        const builtin = getBuiltinSlashCommands(agentType)
        const sessionRuntime = runtimeCommandsFromSession(session)

        const apiCommands = query.data?.success && query.data.commands
            ? query.data.commands
            : []
        const apiRuntime = apiCommands.filter(cmd => cmd.source === 'runtime')
        const customCommands = apiCommands.filter(
            cmd => cmd.source === 'user' || cmd.source === 'plugin' || cmd.source === 'project'
        )
        const baseCommands = sessionRuntime.length > 0
            ? sessionRuntime
            : apiRuntime.length > 0
                ? apiRuntime
                : builtin

        return mergeCommands([...baseCommands, ...customCommands])
    }, [agentType, query.data, session])

    const isRuntimeReady = runtimeCommandsFromSession(session).length > 0

    const getSuggestions = useCallback(async (queryText: string): Promise<Suggestion[]> => {
        const searchTerm = queryText.startsWith('/')
            ? queryText.slice(1).toLowerCase()
            : queryText.toLowerCase()

        if (!searchTerm) {
            return commands.map(cmd => ({
                key: `/${cmd.name}`,
                text: `/${cmd.name}`,
                label: `/${cmd.name}`,
                description: suggestionDescription(cmd),
                content: cmd.content,
                source: cmd.source
            }))
        }

        const maxDistance = Math.max(2, Math.floor(searchTerm.length / 2))
        return commands
            .map(cmd => {
                const name = cmd.name.toLowerCase()
                let score: number
                if (name === searchTerm) score = 0
                else if (name.startsWith(searchTerm)) score = 1
                else if (name.includes(searchTerm)) score = 2
                else {
                    const dist = levenshteinDistance(searchTerm, name)
                    score = dist <= maxDistance ? 3 + dist : Infinity
                }
                return { cmd, score }
            })
            .filter(item => item.score < Infinity)
            .sort((a, b) => a.score - b.score)
            .map(({ cmd }) => ({
                key: `/${cmd.name}`,
                text: `/${cmd.name}`,
                label: `/${cmd.name}`,
                description: suggestionDescription(cmd),
                content: cmd.content,
                source: cmd.source
            }))
    }, [commands])

    return {
        commands,
        isLoading: isRuntimeReady ? false : query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load commands' : null,
        getSuggestions,
    }
}
