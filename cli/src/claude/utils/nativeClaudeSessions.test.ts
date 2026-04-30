import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ApiClient } from '@/api/api';
import type { Machine } from '@/api/types';
import { importNativeClaudeSession, listNativeClaudeSessions } from './nativeClaudeSessions';

let tempHome: string | null = null;
const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;

afterEach(async () => {
    if (tempHome) {
        await rm(tempHome, { recursive: true, force: true });
        tempHome = null;
    }
    if (originalClaudeConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
    } else {
        process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    }
});

async function writeTranscript(lines: unknown[]): Promise<string> {
    tempHome = await mkdtemp(join(tmpdir(), 'hapi-native-claude-'));
    process.env.CLAUDE_CONFIG_DIR = tempHome;
    const projectDir = join(tempHome, 'projects', '-repo');
    await mkdir(projectDir, { recursive: true });
    const transcriptPath = join(projectDir, 'claude-session-1.jsonl');
    await writeFile(transcriptPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');
    return transcriptPath;
}

describe('native Claude sessions', () => {
    it('lists native transcript summaries from CLAUDE_CONFIG_DIR', async () => {
        const transcriptPath = await writeTranscript([
            {
                type: 'system',
                uuid: 'system-1',
                subtype: 'init',
                sessionId: 'claude-session-1',
                cwd: '/repo',
                model: 'opus',
                timestamp: '2026-04-30T10:00:00.000Z'
            },
            {
                type: 'user',
                uuid: 'user-1',
                sessionId: 'claude-session-1',
                cwd: '/repo',
                timestamp: '2026-04-30T10:01:00.000Z',
                message: { role: 'user', content: 'hello claude' }
            },
            {
                type: 'assistant',
                uuid: 'assistant-1',
                sessionId: 'claude-session-1',
                cwd: '/repo',
                timestamp: '2026-04-30T10:02:00.000Z',
                message: { role: 'assistant', content: [{ type: 'text', text: 'hello user' }] }
            }
        ]);

        await expect(listNativeClaudeSessions()).resolves.toEqual([
            {
                claudeSessionId: 'claude-session-1',
                transcriptPath,
                cwd: '/repo',
                title: 'hello claude',
                createdAt: Date.parse('2026-04-30T10:00:00.000Z'),
                updatedAt: Date.parse('2026-04-30T10:02:00.000Z'),
                messageCount: 2,
                userMessageCount: 1,
                agentMessageCount: 1,
                model: 'opus'
            }
        ]);
    });

    it('imports native transcript messages with stable local ids', async () => {
        const transcriptPath = await writeTranscript([
            {
                type: 'system',
                uuid: 'system-1',
                subtype: 'init',
                sessionId: 'claude-session-1',
                cwd: '/repo',
                message: { role: 'system', content: '' }
            },
            {
                type: 'user',
                uuid: 'user-1',
                sessionId: 'claude-session-1',
                cwd: '/repo',
                message: { role: 'user', content: 'hello claude' }
            },
            {
                type: 'assistant',
                uuid: 'assistant-1',
                sessionId: 'claude-session-1',
                cwd: '/repo',
                message: { role: 'assistant', content: [{ type: 'text', text: 'hello user' }] }
            }
        ]);
        const imported: Array<{ localId?: string; content: unknown }> = [];
        const api = {
            getOrCreateSession: async () => ({ id: 'hapi-session-1' }),
            importSessionMessage: async (message: { localId?: string; content: unknown }) => {
                imported.push(message);
                return {} as never;
            }
        } as unknown as ApiClient;
        const machine = {
            id: 'machine-1',
            metadata: { host: 'localhost' }
        } as Machine;

        await expect(importNativeClaudeSession({
            api,
            machine,
            claudeSessionId: 'claude-session-1'
        })).resolves.toEqual({
            success: true,
            sessionId: 'hapi-session-1',
            claudeSessionId: 'claude-session-1',
            transcriptPath,
            importedMessages: 2,
            skippedMessages: 1
        });
        expect(imported.map((message) => message.localId)).toEqual([
            'claude-native:claude-session-1:1:user',
            'claude-native:claude-session-1:2:agent'
        ]);
    });
});
