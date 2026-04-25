import { describe, expect, it } from 'vitest';
import { resolveCodexRemoteBackend } from './codexBackendSelection';

describe('resolveCodexRemoteBackend', () => {
    it('keeps the app-server backend by default', () => {
        expect(resolveCodexRemoteBackend({} as NodeJS.ProcessEnv)).toBe('app-server');
    });

    it('uses codex-acp when explicitly requested', () => {
        expect(resolveCodexRemoteBackend({
            HAPI_CODEX_BACKEND: 'acp'
        } as NodeJS.ProcessEnv)).toBe('acp');
    });

    it('uses codex-acp in auto mode when an ACP command override is configured', () => {
        expect(resolveCodexRemoteBackend({
            HAPI_CODEX_BACKEND: 'auto',
            HAPI_CODEX_ACP_COMMAND: 'codex-acp'
        } as NodeJS.ProcessEnv)).toBe('acp');
    });

    it('rejects unknown backend names', () => {
        expect(() => resolveCodexRemoteBackend({
            HAPI_CODEX_BACKEND: 'llama'
        } as NodeJS.ProcessEnv)).toThrow('Invalid HAPI_CODEX_BACKEND=llama');
    });
});
