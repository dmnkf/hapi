import { describe, expect, it } from 'vitest'
import { runtimeSlashCommandsFromClaudeSdk } from './slashCommands'

describe('runtimeSlashCommandsFromClaudeSdk', () => {
    it('normalizes Claude SDK slash command names for session runtime updates', () => {
        const result = runtimeSlashCommandsFromClaudeSdk(['/clear', 'compact', ' /plan ', '', '/clear'])

        expect(result).toMatchObject({
            commands: [
                { name: 'clear', source: 'runtime' },
                { name: 'compact', source: 'runtime' },
                { name: 'plan', source: 'runtime' },
            ],
            source: 'dynamic'
        })
        expect(typeof result?.updatedAt).toBe('number')
    })

    it('returns null when the SDK did not report slash commands', () => {
        expect(runtimeSlashCommandsFromClaudeSdk()).toBeNull()
    })
})
