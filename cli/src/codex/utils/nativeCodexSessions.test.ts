import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ApiClient } from '@/api/api';
import type { Machine } from '@/api/types';
import { importNativeCodexSession, listNativeCodexSessions } from './nativeCodexSessions';

let tempHome: string | null = null;
const originalCodexHome = process.env.CODEX_HOME;

afterEach(async () => {
    if (tempHome) {
        await rm(tempHome, { recursive: true, force: true });
        tempHome = null;
    }
    if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME;
    } else {
        process.env.CODEX_HOME = originalCodexHome;
    }
});

async function writeTranscript(lines: unknown[]): Promise<string> {
    tempHome = await mkdtemp(join(tmpdir(), 'hapi-native-codex-'));
    process.env.CODEX_HOME = tempHome;
    const sessionDir = join(tempHome, 'sessions', '2026', '04');
    await mkdir(sessionDir, { recursive: true });
    const transcriptPath = join(sessionDir, 'thread.jsonl');
    await writeFile(transcriptPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');
    return transcriptPath;
}

describe('native Codex sessions', () => {
    it('lists native transcript summaries from CODEX_HOME', async () => {
        const transcriptPath = await writeTranscript([
            { type: 'session_meta', timestamp: '2026-04-30T10:00:00.000Z', payload: { id: 'thread-1', cwd: '/repo', model: 'gpt-5.4' } },
            { type: 'event_msg', timestamp: '2026-04-30T10:01:00.000Z', payload: { type: 'user_message', message: 'hello codex' } },
            { type: 'event_msg', timestamp: '2026-04-30T10:02:00.000Z', payload: { type: 'agent_message', message: 'hello user' } }
        ]);

        await expect(listNativeCodexSessions()).resolves.toEqual([
            {
                codexSessionId: 'thread-1',
                transcriptPath,
                cwd: '/repo',
                title: 'hello codex',
                updatedAt: Date.parse('2026-04-30T10:02:00.000Z'),
                messageCount: 2,
                userMessageCount: 1,
                agentMessageCount: 1,
                model: 'gpt-5.4'
            }
        ]);
    });

    it('imports native transcript messages with stable local ids', async () => {
        const transcriptPath = await writeTranscript([
            { type: 'session_meta', payload: { id: 'thread-1', cwd: '/repo' } },
            { type: 'event_msg', payload: { type: 'user_message', message: 'hello codex' } },
            { type: 'event_msg', payload: { type: 'agent_message', message: 'hello user' } }
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

        await expect(importNativeCodexSession({
            api,
            machine,
            codexSessionId: 'thread-1'
        })).resolves.toEqual({
            success: true,
            sessionId: 'hapi-session-1',
            codexSessionId: 'thread-1',
            transcriptPath,
            importedMessages: 2,
            skippedMessages: 1
        });
        expect(imported.map((message) => message.localId)).toEqual([
            'codex-native:thread-1:1:user',
            'codex-native:thread-1:2:agent'
        ]);
    });
});
