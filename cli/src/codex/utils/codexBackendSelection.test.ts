import { describe, expect, it } from 'vitest';
import { resolveCodexRemoteBackend } from './codexBackendSelection';

describe('resolveCodexRemoteBackend', () => {
    it('uses codex-acp by default', () => {
        expect(resolveCodexRemoteBackend({} as NodeJS.ProcessEnv)).toBe('acp');
    });

    it('uses codex-acp when explicitly requested', () => {
        expect(resolveCodexRemoteBackend({
            HAPI_CODEX_BACKEND: 'acp'
        } as NodeJS.ProcessEnv)).toBe('acp');
    });

    it('does not use auth projection settings for backend selection', () => {
        expect(resolveCodexRemoteBackend({
            HAPI_CODEX_ACP_REUSE_HERMES_AUTH: '1'
        } as NodeJS.ProcessEnv)).toBe('acp');
    });

    it('uses the legacy app-server backend when explicitly requested', () => {
        expect(resolveCodexRemoteBackend({
            HAPI_CODEX_BACKEND: 'app-server'
        } as NodeJS.ProcessEnv)).toBe('app-server');
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
