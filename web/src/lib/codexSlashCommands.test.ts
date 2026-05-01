import { describe, expect, it } from 'vitest'
import { getBuiltinSlashCommands } from './codexSlashCommands'

describe('getBuiltinSlashCommands', () => {
    it('exposes Codex built-ins as prompt slash commands', () => {
        expect(getBuiltinSlashCommands('codex')).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'review' }),
            expect.objectContaining({ name: 'compact' }),
            expect.objectContaining({ name: 'clear' }),
            expect.objectContaining({ name: 'model' }),
            expect.objectContaining({ name: 'approval' }),
            expect.objectContaining({ name: 'sandbox' }),
            expect.objectContaining({ name: 'help' }),
            expect.objectContaining({ name: 'status' }),
        ]))
    })
})
