import { describe, expect, it } from 'vitest';
import { parseCodexAppServerSlashCommand } from './appServerSlashCommands';

describe('parseCodexAppServerSlashCommand', () => {
    it('detects Codex app-server control commands', () => {
        expect(parseCodexAppServerSlashCommand('/clear')).toEqual({ type: 'clear' });
        expect(parseCodexAppServerSlashCommand('/c')).toEqual({ type: 'clear' });
        expect(parseCodexAppServerSlashCommand('/reset')).toEqual({ type: 'clear' });
        expect(parseCodexAppServerSlashCommand('/compact')).toEqual({ type: 'compact' });
        expect(parseCodexAppServerSlashCommand('/review')).toEqual({
            type: 'review',
            target: { type: 'uncommittedChanges' }
        });
        expect(parseCodexAppServerSlashCommand('/r check staged changes')).toEqual({
            type: 'review',
            target: { type: 'custom', instructions: 'check staged changes' }
        });
    });

    it('leaves non-control slash commands on the prompt path', () => {
        expect(parseCodexAppServerSlashCommand('/model gpt-5.4')).toBeNull();
        expect(parseCodexAppServerSlashCommand('/status')).toBeNull();
        expect(parseCodexAppServerSlashCommand('please /review this')).toBeNull();
    });
});
