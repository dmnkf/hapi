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
import { RawJSONLinesSchema, type RawJSONLines } from '@/claude/types';
import { isClaudeChatVisibleMessage } from './chatVisibility';

export type NativeClaudeSessionSummary = {
    claudeSessionId: string;
    transcriptPath: string;
    cwd: string | null;
    title: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
    userMessageCount: number;
    agentMessageCount: number;
    model?: string;
};

export type ImportNativeClaudeSessionResult =
    | {
        success: true;
        sessionId: string;
        claudeSessionId: string;
        transcriptPath: string;
        importedMessages: number;
        skippedMessages: number;
    }
    | {
        success: false;
        error: string;
    };

type ParsedEvent = {
    event: RawJSONLines;
    lineIndex: number;
};

type ParsedTranscript = NativeClaudeSessionSummary & {
    events: ParsedEvent[];
};

const MAX_TRANSCRIPTS = 1000;
const INTERNAL_CLAUDE_EVENT_TYPES = new Set([
    'file-history-snapshot',
    'change',
    'queue-operation',
]);

const SYSTEM_INJECTION_PREFIXES = [
    '<task-notification>',
    '<command-name>',
    '<local-command-caveat>',
    '<system-reminder>',
];

function claudeConfigDir(): string {
    return process.env.CLAUDE_CONFIG_DIR || join(os.homedir(), '.claude');
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

function textFromContent(content: unknown): string | null {
    if (typeof content === 'string') {
        return content;
    }
    if (!Array.isArray(content)) {
        return null;
    }

    const parts: string[] = [];
    for (const item of content) {
        const record = asRecord(item);
        const text = record ? asString(record.text) : null;
        if (text) {
            parts.push(text);
        }
    }
    return parts.length > 0 ? parts.join('\n') : null;
}

function isExternalUserMessage(message: RawJSONLines): message is Extract<RawJSONLines, { type: 'user' }> {
    if (message.type !== 'user') return false;
    if (message.isSidechain === true) return false;
    if (message.isMeta === true) return false;

    const text = textFromContent(message.message.content);
    if (!text) return false;

    const trimmed = text.trimStart();
    for (const prefix of SYSTEM_INJECTION_PREFIXES) {
        if (trimmed.startsWith(prefix)) return false;
    }
    return true;
}

function sessionIdFromPath(filePath: string): string | null {
    const name = basename(filePath);
    return name.endsWith('.jsonl') ? name.slice(0, -'.jsonl'.length) : null;
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

function modelFromRawEvent(event: unknown): string | undefined {
    const record = asRecord(event);
    if (!record) return undefined;
    const direct = asString(record.model);
    if (direct) return direct;
    const message = asRecord(record.message);
    return message ? asString(message.model) ?? undefined : undefined;
}

async function parseTranscript(filePath: string): Promise<ParsedTranscript | null> {
    let content: string;
    try {
        content = await readFile(filePath, 'utf-8');
    } catch {
        return null;
    }

    const events: ParsedEvent[] = [];
    let claudeSessionId: string | null = sessionIdFromPath(filePath);
    let cwd: string | null = null;
    let model: string | undefined;
    let title: string | null = null;
    let firstTimestamp: number | null = null;
    let lastTimestamp: number | null = null;
    let messageCount = 0;
    let userMessageCount = 0;
    let agentMessageCount = 0;

    const lines = content.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.trim()) continue;

        let raw: unknown;
        try {
            raw = JSON.parse(line);
        } catch {
            continue;
        }

        const rawRecord = asRecord(raw);
        if (rawRecord?.type && INTERNAL_CLAUDE_EVENT_TYPES.has(String(rawRecord.type))) {
            continue;
        }

        const parsed = RawJSONLinesSchema.safeParse(raw);
        if (!parsed.success) {
            continue;
        }

        const event = parsed.data;
        claudeSessionId = event.sessionId ?? claudeSessionId;
        cwd = cwd ?? event.cwd ?? null;
        model = model ?? modelFromRawEvent(raw);
        const timestamp = parseTimestamp(event.timestamp);
        firstTimestamp = firstTimestamp ?? timestamp;
        lastTimestamp = timestamp ?? lastTimestamp;

        if (event.type === 'summary' || event.isMeta || event.isCompactSummary || !isClaudeChatVisibleMessage(event)) {
            events.push({ event, lineIndex: index });
            continue;
        }

        if (isExternalUserMessage(event)) {
            messageCount++;
            userMessageCount++;
            const text = textFromContent(event.message.content);
            if (text) {
                title = title ?? truncateTitle(text);
            }
        } else {
            messageCount++;
            agentMessageCount++;
        }

        events.push({ event, lineIndex: index });
    }

    if (!claudeSessionId) {
        return null;
    }

    const fileStat = await stat(filePath).catch(() => null);
    const updatedAt = lastTimestamp ?? fileStat?.mtimeMs ?? Date.now();
    const createdAt = firstTimestamp ?? fileStat?.birthtimeMs ?? updatedAt;

    return {
        claudeSessionId,
        transcriptPath: filePath,
        cwd,
        title: title ?? basename(filePath, '.jsonl'),
        createdAt,
        updatedAt,
        messageCount,
        userMessageCount,
        agentMessageCount,
        model,
        events
    };
}

export async function listNativeClaudeSessions(): Promise<NativeClaudeSessionSummary[]> {
    const root = join(claudeConfigDir(), 'projects');
    const files = await findJsonlFiles(root);
    const parsed = await Promise.all(files.map(parseTranscript));
    return parsed
        .filter((item): item is ParsedTranscript => item !== null)
        .map(({ events: _events, ...summary }) => summary)
        .sort((a, b) => b.updatedAt - a.updatedAt);
}

function buildMetadata(machine: Machine, summary: NativeClaudeSessionSummary): Metadata {
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
        flavor: 'claude',
        name: summary.title,
        summary: {
            text: summary.title,
            updatedAt: summary.updatedAt
        },
        claudeSessionId: summary.claudeSessionId,
        claudeTranscriptPath: summary.transcriptPath,
        importedFromNativeClaude: true
    };
}

function messageContentForImport(event: RawJSONLines): unknown | null {
    if (event.type === 'summary' || event.isMeta || event.isCompactSummary || !isClaudeChatVisibleMessage(event)) {
        return null;
    }

    if (isExternalUserMessage(event)) {
        const text = textFromContent(event.message.content);
        if (!text) {
            return null;
        }
        return {
            role: 'user',
            content: {
                type: 'text',
                text
            },
            meta: {
                sentFrom: 'cli',
                importedFrom: 'native-claude'
            }
        };
    }

    return {
        role: 'agent',
        content: {
            type: AGENT_MESSAGE_PAYLOAD_TYPE,
            data: event
        },
        meta: {
            sentFrom: 'cli',
            importedFrom: 'native-claude'
        }
    };
}

export async function importNativeClaudeSession(opts: {
    api: ApiClient;
    machine: Machine;
    claudeSessionId?: string;
    transcriptPath?: string;
}): Promise<ImportNativeClaudeSessionResult> {
    const summaries = await listNativeClaudeSessions();
    const summary = summaries.find((candidate) => {
        if (opts.transcriptPath && candidate.transcriptPath !== opts.transcriptPath) return false;
        if (opts.claudeSessionId && candidate.claudeSessionId !== opts.claudeSessionId) return false;
        return Boolean(opts.transcriptPath || opts.claudeSessionId);
    });

    if (!summary) {
        return { success: false, error: 'Native Claude session not found' };
    }

    const parsed = await parseTranscript(summary.transcriptPath);
    if (!parsed) {
        return { success: false, error: 'Failed to parse native Claude transcript' };
    }

    const session = await opts.api.getOrCreateSession({
        tag: `claude-native:${parsed.claudeSessionId}`,
        metadata: buildMetadata(opts.machine, parsed),
        state: {},
        model: parsed.model
    });

    let importedMessages = 0;
    let skippedMessages = 0;
    for (const item of parsed.events) {
        const content = messageContentForImport(item.event);
        if (!content) {
            skippedMessages++;
            continue;
        }
        const kind = isExternalUserMessage(item.event) ? 'user' : 'agent';
        await opts.api.importSessionMessage({
            sessionId: session.id,
            content,
            localId: `claude-native:${parsed.claudeSessionId}:${item.lineIndex}:${kind}`
        });
        importedMessages++;
    }

    return {
        success: true,
        sessionId: session.id,
        claudeSessionId: parsed.claudeSessionId,
        transcriptPath: parsed.transcriptPath,
        importedMessages,
        skippedMessages
    };
}
