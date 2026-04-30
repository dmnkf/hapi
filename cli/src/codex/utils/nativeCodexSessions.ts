import os from 'node:os';
import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { AGENT_MESSAGE_PAYLOAD_TYPE } from '@hapi/protocol';
import type { Metadata } from '@/api/types';
import type { ApiClient } from '@/api/api';
import type { Machine } from '@/api/types';
import { configuration } from '@/configuration';
import { runtimePath } from '@/projectPath';
import packageJson from '../../../package.json';
import { convertCodexEvent } from './codexEventConverter';

export type NativeCodexSessionSummary = {
    codexSessionId: string;
    transcriptPath: string;
    cwd: string | null;
    title: string;
    updatedAt: number;
    messageCount: number;
    userMessageCount: number;
    agentMessageCount: number;
    model?: string;
};

export type ImportNativeCodexSessionResult =
    | {
        success: true;
        sessionId: string;
        codexSessionId: string;
        transcriptPath: string;
        importedMessages: number;
        skippedMessages: number;
    }
    | {
        success: false;
        error: string;
    };

type ParsedTranscript = NativeCodexSessionSummary & {
    events: unknown[];
};

const MAX_TRANSCRIPTS = 1000;

function codexHome(): string {
    return process.env.CODEX_HOME || join(os.homedir(), '.codex');
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseTimestamp(value: unknown): number | null {
    const raw = asString(value);
    if (!raw) return null;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function truncateTitle(text: string): string {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (compact.length <= 80) return compact;
    return `${compact.slice(0, 77)}...`;
}

async function findJsonlFiles(root: string): Promise<string[]> {
    const files: string[] = [];

    async function walk(dir: string): Promise<void> {
        if (files.length >= MAX_TRANSCRIPTS) return;
        let entries: Dirent[];
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (files.length >= MAX_TRANSCRIPTS) return;
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
                files.push(fullPath);
            }
        }
    }

    await walk(root);
    return files;
}

function extractMetadataFromEvent(event: unknown): {
    sessionId?: string;
    cwd?: string;
    model?: string;
    timestamp?: number;
} {
    const record = asRecord(event);
    if (!record) return {};
    const payload = asRecord(record.payload);
    const timestamp = parseTimestamp(record.timestamp);

    if (record.type === 'session_meta' && payload) {
        return {
            sessionId: asString(payload.id) ?? undefined,
            cwd: asString(payload.cwd)
                ?? asString(payload.workingDirectory)
                ?? asString(payload.working_directory)
                ?? undefined,
            model: asString(payload.model) ?? undefined,
            timestamp: timestamp ?? undefined
        };
    }

    return {
        cwd: payload
            ? (asString(payload.cwd) ?? asString(payload.workingDirectory) ?? asString(payload.working_directory) ?? undefined)
            : undefined,
        model: payload ? (asString(payload.model) ?? undefined) : undefined,
        timestamp: timestamp ?? undefined
    };
}

async function parseTranscript(filePath: string): Promise<ParsedTranscript | null> {
    let content: string;
    try {
        content = await readFile(filePath, 'utf-8');
    } catch {
        return null;
    }

    const events: unknown[] = [];
    let codexSessionId: string | null = null;
    let cwd: string | null = null;
    let model: string | undefined;
    let title: string | null = null;
    let lastTimestamp: number | null = null;
    let messageCount = 0;
    let userMessageCount = 0;
    let agentMessageCount = 0;

    const lines = content.split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        let event: unknown;
        try {
            event = JSON.parse(line);
        } catch {
            continue;
        }

        events.push(event);
        const metadata = extractMetadataFromEvent(event);
        codexSessionId = codexSessionId ?? metadata.sessionId ?? null;
        cwd = cwd ?? metadata.cwd ?? null;
        model = model ?? metadata.model;
        lastTimestamp = metadata.timestamp ?? lastTimestamp;

        const converted = convertCodexEvent(event);
        if (converted?.sessionId) {
            codexSessionId = codexSessionId ?? converted.sessionId;
        }
        if (converted?.userMessage) {
            messageCount++;
            userMessageCount++;
            title = title ?? truncateTitle(converted.userMessage);
        }
        if (converted?.message) {
            messageCount++;
            agentMessageCount++;
        }
    }

    if (!codexSessionId) {
        return null;
    }

    const fileStat = await stat(filePath).catch(() => null);
    const updatedAt = lastTimestamp ?? fileStat?.mtimeMs ?? Date.now();

    return {
        codexSessionId,
        transcriptPath: filePath,
        cwd,
        title: title ?? basename(filePath, '.jsonl'),
        updatedAt,
        messageCount,
        userMessageCount,
        agentMessageCount,
        model,
        events
    };
}

export async function listNativeCodexSessions(): Promise<NativeCodexSessionSummary[]> {
    const root = join(codexHome(), 'sessions');
    const files = await findJsonlFiles(root);
    const parsed = await Promise.all(files.map(parseTranscript));
    return parsed
        .filter((item): item is ParsedTranscript => item !== null)
        .map(({ events: _events, ...summary }) => summary)
        .sort((a, b) => b.updatedAt - a.updatedAt);
}

function buildMetadata(machine: Machine, summary: NativeCodexSessionSummary): Metadata {
    const happyLibDir = runtimePath();
    return {
        path: summary.cwd ?? os.homedir(),
        host: machine.metadata?.host ?? process.env.HAPI_HOSTNAME ?? os.hostname(),
        version: packageJson.version,
        os: os.platform(),
        machineId: machine.id,
        homeDir: os.homedir(),
        happyHomeDir: configuration.happyHomeDir,
        happyLibDir,
        happyToolsDir: resolve(happyLibDir, 'tools', 'unpacked'),
        startedFromRunner: true,
        startedBy: 'runner',
        lifecycleState: 'imported',
        lifecycleStateSince: Date.now(),
        flavor: 'codex',
        name: summary.title,
        summary: {
            text: summary.title,
            updatedAt: summary.updatedAt
        },
        codexSessionId: summary.codexSessionId,
        codexTranscriptPath: summary.transcriptPath,
        importedFromNativeCodex: true
    };
}

function messageContentForImport(converted: NonNullable<ReturnType<typeof convertCodexEvent>>): unknown | null {
    if (converted.userMessage) {
        return {
            role: 'user',
            content: {
                type: 'text',
                text: converted.userMessage
            },
            meta: {
                sentFrom: 'cli',
                importedFrom: 'native-codex'
            }
        };
    }

    if (converted.message) {
        return {
            role: 'agent',
            content: {
                type: AGENT_MESSAGE_PAYLOAD_TYPE,
                data: converted.message
            },
            meta: {
                sentFrom: 'cli',
                importedFrom: 'native-codex'
            }
        };
    }

    return null;
}

export async function importNativeCodexSession(opts: {
    api: ApiClient;
    machine: Machine;
    codexSessionId?: string;
    transcriptPath?: string;
}): Promise<ImportNativeCodexSessionResult> {
    const summaries = await listNativeCodexSessions();
    const summary = summaries.find((candidate) => {
        if (opts.transcriptPath && candidate.transcriptPath !== opts.transcriptPath) return false;
        if (opts.codexSessionId && candidate.codexSessionId !== opts.codexSessionId) return false;
        return Boolean(opts.transcriptPath || opts.codexSessionId);
    });

    if (!summary) {
        return { success: false, error: 'Native Codex session not found' };
    }

    const parsed = await parseTranscript(summary.transcriptPath);
    if (!parsed) {
        return { success: false, error: 'Failed to parse native Codex transcript' };
    }

    const session = await opts.api.getOrCreateSession({
        tag: `codex-native:${parsed.codexSessionId}`,
        metadata: buildMetadata(opts.machine, parsed),
        state: {},
        model: parsed.model
    });

    let importedMessages = 0;
    let skippedMessages = 0;
    for (let index = 0; index < parsed.events.length; index += 1) {
        const converted = convertCodexEvent(parsed.events[index]);
        if (!converted) {
            skippedMessages++;
            continue;
        }
        const content = messageContentForImport(converted);
        if (!content) {
            skippedMessages++;
            continue;
        }
        const kind = converted.userMessage ? 'user' : 'agent';
        await opts.api.importSessionMessage({
            sessionId: session.id,
            content,
            localId: `codex-native:${parsed.codexSessionId}:${index}:${kind}`
        });
        importedMessages++;
    }

    return {
        success: true,
        sessionId: session.id,
        codexSessionId: parsed.codexSessionId,
        transcriptPath: parsed.transcriptPath,
        importedMessages,
        skippedMessages
    };
}
