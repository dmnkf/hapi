import { describe, expect, it } from 'vitest';

import { resolveCommand } from './registry';

describe('command registry', () => {
    it('routes hapi codex-acp to the experimental Codex ACP command', () => {
        const { command, context } = resolveCommand(['codex-acp', '--permission-mode', 'yolo']);

        expect(command.name).toBe('codex-acp');
        expect(context.commandArgs).toEqual(['--permission-mode', 'yolo']);
    });
});
