import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

export type CodexRemoteBackend = 'app-server' | 'acp';

function commandExists(command: string, pathValue: string | undefined): boolean {
    if (command.includes('/')) {
        try {
            accessSync(command, constants.X_OK);
            return true;
        } catch {
            return false;
        }
    }

    const pathEntries = (pathValue ?? '').split(delimiter).filter(Boolean);
    for (const pathEntry of pathEntries) {
        try {
            accessSync(join(pathEntry, command), constants.X_OK);
            return true;
        } catch {
        }
    }
    return false;
}

export function resolveCodexRemoteBackend(env: NodeJS.ProcessEnv = process.env): CodexRemoteBackend {
    const raw = (env.HAPI_CODEX_BACKEND ?? 'acp').trim().toLowerCase();
    if (raw === '' || raw === 'acp' || raw === 'codex-acp') {
        return 'acp';
    }
    if (raw === 'app-server' || raw === 'appserver') {
        return 'app-server';
    }
    if (raw === 'auto') {
        if (env.HAPI_CODEX_ACP_COMMAND) {
            return 'acp';
        }
        return commandExists('codex-acp', env.PATH) ? 'acp' : 'app-server';
    }

    throw new Error(
        `Invalid HAPI_CODEX_BACKEND=${env.HAPI_CODEX_BACKEND}. ` +
        'Expected app-server, acp, or auto.'
    );
}

export function describeCodexAcpSource(env: NodeJS.ProcessEnv = process.env): string {
    const command = env.HAPI_CODEX_ACP_COMMAND ?? 'npx';
    const args = env.HAPI_CODEX_ACP_ARGS ?? '-y @zed-industries/codex-acp';
    return `${command} ${args}`.trim();
}
