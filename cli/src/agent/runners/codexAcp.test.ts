import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/agent/backends/acp', () => {
    class FakeAcpSdkBackend {
        constructor(public readonly options: { command: string; args?: string[]; env?: Record<string, string> }) {}
        async initialize() {}
        async newSession() { return 'session-id'; }
        async prompt() {}
        async cancelPrompt() {}
        async respondToPermission() {}
        onPermissionRequest() {}
        async disconnect() {}
    }

    return { AcpSdkBackend: FakeAcpSdkBackend };
});

import { AgentRegistry } from '@/agent/AgentRegistry';
import { registerCodexAcpAgent } from './codexAcp';

describe('registerCodexAcpAgent', () => {
    const tempDirs: string[] = [];
    const originalHermesHome = process.env.HERMES_HOME;
    const originalCodexHome = process.env.CODEX_HOME;

    const fakeJwt = (claims: Record<string, unknown>): string => {
        const encode = (value: unknown) => Buffer
            .from(JSON.stringify(value))
            .toString('base64url');
        return `${encode({ alg: 'none' })}.${encode(claims)}.signature`;
    };

    const createTempDir = (prefix: string): string => {
        const dir = mkdtempSync(join(tmpdir(), prefix));
        tempDirs.push(dir);
        return dir;
    };

    const writeHermesCodexAuth = (hermesHome: string, accessToken: string): void => {
        writeFileSync(join(hermesHome, 'auth.json'), JSON.stringify({
            version: 1,
            providers: {
                'openai-codex': {
                    auth_mode: 'chatgpt',
                    tokens: {
                        access_token: accessToken,
                        refresh_token: 'hermes-refresh-token'
                    },
                    last_refresh: '2026-04-25T08:00:00.000Z'
                }
            }
        }));
    };

    beforeEach(() => {
        delete process.env.HAPI_CODEX_ACP_COMMAND;
        delete process.env.HAPI_CODEX_ACP_ARGS;
        delete process.env.HERMES_HOME;
        delete process.env.CODEX_HOME;
    });

    afterEach(() => {
        process.env.HERMES_HOME = originalHermesHome;
        process.env.CODEX_HOME = originalCodexHome;
        for (const dir of tempDirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('registers Codex as an ACP backend using the Zed codex-acp npm adapter by default', () => {
        registerCodexAcpAgent();

        const backend = AgentRegistry.create('codex') as unknown as {
            options: { command: string; args?: string[]; env?: Record<string, string> };
        };

        expect(backend.options.command).toBe('npx');
        expect(backend.options.args).toEqual(['-y', '@zed-industries/codex-acp']);
        expect(backend.options.env).toMatchObject({ PATH: process.env.PATH });
    });

    it('allows overriding the codex-acp command and args for installed binaries or local builds', () => {
        process.env.HAPI_CODEX_ACP_COMMAND = 'codex-acp';
        process.env.HAPI_CODEX_ACP_ARGS = '--foo "bar baz"';

        registerCodexAcpAgent();

        const backend = AgentRegistry.create('codex') as unknown as {
            options: { command: string; args?: string[] };
        };

        expect(backend.options.command).toBe('codex-acp');
        expect(backend.options.args).toEqual(['--foo', 'bar baz']);
    });

    it('projects Hermes openai-codex auth into an isolated CODEX_HOME for codex-acp', () => {
        const hermesHome = createTempDir('hapi-hermes-home-');
        const accessToken = fakeJwt({
            'https://api.openai.com/auth': {
                chatgpt_account_id: 'account-123',
                chatgpt_plan_type: 'pro'
            }
        });
        writeHermesCodexAuth(hermesHome, accessToken);
        process.env.HERMES_HOME = hermesHome;

        registerCodexAcpAgent();

        const backend = AgentRegistry.create('codex') as unknown as {
            options: { env?: Record<string, string> };
        };

        const codexHome = backend.options.env?.CODEX_HOME;
        expect(codexHome).toBeTruthy();
        expect(codexHome).not.toBe(hermesHome);
        const projectedAuth = JSON.parse(readFileSync(join(codexHome!, 'auth.json'), 'utf8'));
        expect(projectedAuth).toMatchObject({
            auth_mode: 'chatgptAuthTokens',
            OPENAI_API_KEY: null,
            tokens: {
                id_token: accessToken,
                access_token: accessToken,
                refresh_token: '',
                account_id: 'account-123'
            }
        });
    });

    it('does not override an explicit CODEX_HOME', () => {
        const hermesHome = createTempDir('hapi-hermes-home-');
        const codexHome = createTempDir('hapi-existing-codex-home-');
        writeHermesCodexAuth(hermesHome, fakeJwt({}));
        process.env.HERMES_HOME = hermesHome;
        process.env.CODEX_HOME = codexHome;

        registerCodexAcpAgent();

        const backend = AgentRegistry.create('codex') as unknown as {
            options: { env?: Record<string, string> };
        };

        expect(backend.options.env?.CODEX_HOME).toBe(codexHome);
    });
});
