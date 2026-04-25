import { existsSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { AgentRegistry } from '@/agent/AgentRegistry';
import { AcpSdkBackend } from '@/agent/backends/acp';

type JsonRecord = Record<string, unknown>;

type HermesCodexAuth = {
    accessToken: string;
    accountId?: string;
};

function asRecord(value: unknown): JsonRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as JsonRecord
        : null;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function decodeJwtPayload(token: string): JsonRecord | null {
    const [, payload] = token.split('.');
    if (!payload) {
        return null;
    }

    try {
        return asRecord(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    } catch {
        return null;
    }
}

function chatgptAccountIdFromAccessToken(accessToken: string): string | undefined {
    const claims = decodeJwtPayload(accessToken);
    const authClaims = asRecord(claims?.['https://api.openai.com/auth']);
    return asString(authClaims?.chatgpt_account_id) ?? undefined;
}

function getHermesHome(): string {
    return process.env.HERMES_HOME || join(homedir(), '.hermes');
}

function readHermesCodexAuth(): HermesCodexAuth | null {
    const authPath = join(getHermesHome(), 'auth.json');
    if (!existsSync(authPath)) {
        return null;
    }

    let authStore: JsonRecord;
    try {
        authStore = JSON.parse(readFileSync(authPath, 'utf8')) as JsonRecord;
    } catch {
        return null;
    }

    const providerTokens = asRecord(
        asRecord(asRecord(authStore.providers)?.['openai-codex'])?.tokens
    );
    const providerAccessToken = asString(providerTokens?.access_token);
    if (providerAccessToken) {
        return {
            accessToken: providerAccessToken,
            accountId: chatgptAccountIdFromAccessToken(providerAccessToken)
        };
    }

    const pool = asRecord(authStore.credential_pool)?.['openai-codex'];
    if (Array.isArray(pool)) {
        for (const entry of pool) {
            const record = asRecord(entry);
            if (record?.auth_type !== 'oauth') {
                continue;
            }
            const accessToken = asString(record.access_token);
            if (accessToken) {
                return {
                    accessToken,
                    accountId: chatgptAccountIdFromAccessToken(accessToken)
                };
            }
        }
    }

    return null;
}

function createCodexHomeFromHermesAuth(auth: HermesCodexAuth): string {
    const codexHome = mkdtempSync(join(tmpdir(), 'hapi-codex-acp-'));
    const authPath = join(codexHome, 'auth.json');
    const tokens: JsonRecord = {
        id_token: auth.accessToken,
        access_token: auth.accessToken,
        refresh_token: ''
    };
    if (auth.accountId) {
        tokens.account_id = auth.accountId;
    }

    mkdirSync(codexHome, { recursive: true, mode: 0o700 });
    writeFileSync(authPath, JSON.stringify({
        auth_mode: 'chatgptAuthTokens',
        OPENAI_API_KEY: null,
        tokens,
        last_refresh: new Date().toISOString()
    }, null, 2));
    chmodSync(authPath, 0o600);
    return codexHome;
}

function withHermesCodexAuth(env: Record<string, string>): Record<string, string> {
    if (env.CODEX_HOME || env.HAPI_CODEX_ACP_REUSE_HERMES_AUTH === '0') {
        return env;
    }

    const auth = readHermesCodexAuth();
    if (!auth) {
        return env;
    }

    return {
        ...env,
        CODEX_HOME: createCodexHomeFromHermesAuth(auth)
    };
}

function buildEnv(): Record<string, string> {
    const env = Object.keys(process.env).reduce((acc, key) => {
        const value = process.env[key];
        if (typeof value === 'string') {
            acc[key] = value;
        }
        return acc;
    }, {} as Record<string, string>);

    return withHermesCodexAuth(env);
}

function splitArgs(value: string): string[] {
    const args: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    let escaping = false;

    for (const char of value) {
        if (escaping) {
            current += char;
            escaping = false;
            continue;
        }
        if (char === '\\') {
            escaping = true;
            continue;
        }
        if (quote) {
            if (char === quote) {
                quote = null;
            } else {
                current += char;
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (/\s/.test(char)) {
            if (current.length > 0) {
                args.push(current);
                current = '';
            }
            continue;
        }
        current += char;
    }

    if (current.length > 0) {
        args.push(current);
    }

    return args;
}

export function registerCodexAcpAgent(): void {
    const command = process.env.HAPI_CODEX_ACP_COMMAND || 'npx';
    const args = process.env.HAPI_CODEX_ACP_ARGS
        ? splitArgs(process.env.HAPI_CODEX_ACP_ARGS)
        : ['-y', '@zed-industries/codex-acp'];

    AgentRegistry.register('codex', () => new AcpSdkBackend({
        command,
        args,
        env: buildEnv()
    }));
}
