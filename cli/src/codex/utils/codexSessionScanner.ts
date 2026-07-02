import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { BaseSessionScanner, SessionFileScanEntry, SessionFileScanResult, SessionFileScanStats } from '@/modules/common/session/BaseSessionScanner';
import { logger } from '@/ui/logger';
import type { CodexSessionEvent } from './codexEventConverter';

interface CodexSessionScannerOptions {
    transcriptPath: string | null;
    onEvent: (event: CodexSessionEvent) => void;
    onSessionId?: (sessionId: string) => void;
    replayExistingHistory?: boolean;
}

export interface CodexSessionScanner {
    cleanup: () => Promise<void>;
    setTranscriptPath: (transcriptPath: string) => Promise<void>;
}

export async function createCodexSessionScanner(opts: CodexSessionScannerOptions): Promise<CodexSessionScanner> {
    const scanner = new CodexSessionScannerImpl(opts);
    await scanner.start();

    return {
        cleanup: async () => {
            await scanner.cleanup();
        },
        setTranscriptPath: async (transcriptPath: string) => {
            await scanner.setTranscriptPath(transcriptPath);
        }
    };
}

class CodexSessionScannerImpl extends BaseSessionScanner<CodexSessionEvent> {
    private static readonly METADATA_PEEK_BYTES = 512 * 1024;
    private transcriptPath: string | null;
    private readonly onEvent: (event: CodexSessionEvent) => void;
    private readonly onSessionId?: (sessionId: string) => void;
    private readonly fileEpochByPath = new Map<string, number>();
    private readonly fileSizeByPath = new Map<string, number>();
    private replayExistingHistoryOnNextAttach: boolean;
    private observedSessionId: string | null = null;

    constructor(opts: CodexSessionScannerOptions) {
        super({ intervalMs: 2000 });
        this.transcriptPath = opts.transcriptPath;
        this.onEvent = opts.onEvent;
        this.onSessionId = opts.onSessionId;
        this.replayExistingHistoryOnNextAttach = opts.replayExistingHistory ?? false;
    }

    async setTranscriptPath(transcriptPath: string): Promise<void> {
        if (this.transcriptPath === transcriptPath) {
            return;
        }
        this.transcriptPath = transcriptPath;
        await this.prepareTranscript(transcriptPath);
        this.pruneWatchers(this.transcriptPath ? [this.transcriptPath] : []);
        this.invalidate();
    }

    protected async initialize(): Promise<void> {
        if (this.transcriptPath) {
            await this.prepareTranscript(this.transcriptPath);
        }
    }

    protected async findSessionFiles(): Promise<string[]> {
        if (!this.transcriptPath) {
            return [];
        }
        return [this.transcriptPath];
    }

    protected shouldWatchFile(filePath: string): boolean {
        return Boolean(this.transcriptPath && filePath === this.transcriptPath);
    }

    protected async parseSessionFile(filePath: string, cursor: number): Promise<SessionFileScanResult<CodexSessionEvent>> {
        return this.readSessionFile(filePath, cursor);
    }

    protected generateEventKey(_event: CodexSessionEvent, context: { filePath: string; lineIndex?: number }): string {
        const epoch = this.fileEpochByPath.get(context.filePath) ?? 0;
        return `${context.filePath}:${epoch}:${context.lineIndex ?? -1}`;
    }

    protected async handleFileScan(stats: SessionFileScanStats<CodexSessionEvent>): Promise<void> {
        for (const event of stats.events) {
            this.onEvent(event);
        }
        if (stats.newCount > 0) {
            logger.debug(`[codex-session-scanner] ${stats.newCount} new events from ${stats.filePath}`);
        }
        this.pruneWatchers(this.transcriptPath ? [this.transcriptPath] : []);
    }

    private async prepareTranscript(filePath: string): Promise<void> {
        if (this.replayExistingHistoryOnNextAttach) {
            // The first scan must replay existing transcript content; otherwise
            // Hapi would only see later appends and miss the already-written turn.
            this.replayExistingHistoryOnNextAttach = false;
            return;
        }

        await this.primeTranscript(filePath);
    }

    private async primeTranscript(filePath: string): Promise<void> {
        let currentSize = 0;
        try {
            currentSize = (await stat(filePath)).size;
        } catch (error) {
            logger.debug(`[codex-session-scanner] Failed to stat transcript ${filePath}: ${error}`);
            this.setCursor(filePath, 0);
            return;
        }

        this.fileSizeByPath.set(filePath, currentSize);
        await this.readSessionMetadata(filePath, currentSize);
        this.setCursor(filePath, currentSize);
    }

    private async readSessionMetadata(filePath: string, currentSize: number): Promise<void> {
        if (currentSize <= 0) {
            return;
        }

        const result = await this.readSessionFileRange(
            filePath,
            0,
            Math.min(currentSize, CodexSessionScannerImpl.METADATA_PEEK_BYTES)
        );
        for (const entry of result.events) {
            if (entry.event.type !== 'session_meta') {
                continue;
            }
            const sessionId = extractSessionId(entry.event);
            if (sessionId) {
                this.updateSessionId(sessionId);
                return;
            }
        }
    }

    private async readSessionFile(filePath: string, startOffset: number): Promise<SessionFileScanResult<CodexSessionEvent>> {
        let currentSize: number;
        try {
            currentSize = (await stat(filePath)).size;
        } catch (error) {
            logger.debug(`[codex-session-scanner] Failed to stat transcript ${filePath}: ${error}`);
            return { events: [], nextCursor: startOffset };
        }

        const previousSize = this.fileSizeByPath.get(filePath);
        let effectiveStartOffset = startOffset;

        if ((previousSize !== undefined && currentSize < previousSize) || effectiveStartOffset > currentSize) {
            effectiveStartOffset = 0;
            const nextEpoch = (this.fileEpochByPath.get(filePath) ?? 0) + 1;
            this.fileEpochByPath.set(filePath, nextEpoch);
        }
        this.fileSizeByPath.set(filePath, currentSize);

        if (effectiveStartOffset >= currentSize) {
            return { events: [], nextCursor: currentSize };
        }

        return this.readSessionFileRange(filePath, effectiveStartOffset, currentSize);
    }

    private readSessionFileRange(
        filePath: string,
        startOffset: number,
        endOffsetExclusive: number
    ): Promise<SessionFileScanResult<CodexSessionEvent>> {
        const events: SessionFileScanEntry<CodexSessionEvent>[] = [];
        let carry = Buffer.alloc(0);
        let lineStartOffset = startOffset;
        let nextCursor = startOffset;

        return new Promise((resolve) => {
            const stream = createReadStream(filePath, {
                start: startOffset,
                end: Math.max(startOffset, endOffsetExclusive) - 1
            });

            const handleLine = (lineBuffer: Buffer, offset: number, allowPartial: boolean): void => {
                let effectiveLine = lineBuffer;
                if (effectiveLine.length > 0 && effectiveLine[effectiveLine.length - 1] === 13) {
                    effectiveLine = effectiveLine.subarray(0, effectiveLine.length - 1);
                }
                const line = effectiveLine.toString('utf8');
                if (!line || line.trim().length === 0) {
                    return;
                }

                let parsed: unknown;
                try {
                    parsed = JSON.parse(line);
                } catch (error) {
                    if (!allowPartial) {
                        logger.debug(`[codex-session-scanner] Failed to parse transcript byte ${filePath}:${offset}: ${error}`);
                    }
                    return;
                }

                const event = parseCodexSessionEvent(parsed);
                if (!event) {
                    return;
                }

                if (event.type === 'session_meta') {
                    const sessionId = extractSessionId(event);
                    if (sessionId) {
                        this.updateSessionId(sessionId);
                    }
                }

                events.push({ event, lineIndex: offset });
            };

            stream.on('data', (chunk) => {
                const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                let buffer = carry.length > 0 ? Buffer.concat([carry, chunkBuffer]) : chunkBuffer;
                let searchFrom = 0;
                let newlineIndex = buffer.indexOf(10, searchFrom);

                while (newlineIndex !== -1) {
                    const lineBuffer = buffer.subarray(searchFrom, newlineIndex);
                    handleLine(lineBuffer, lineStartOffset, false);
                    nextCursor = lineStartOffset + lineBuffer.length + 1;
                    lineStartOffset = nextCursor;
                    searchFrom = newlineIndex + 1;
                    newlineIndex = buffer.indexOf(10, searchFrom);
                }

                carry = buffer.subarray(searchFrom);
            });

            stream.on('error', (error) => {
                logger.debug(`[codex-session-scanner] Failed to read transcript ${filePath}: ${error}`);
                resolve({ events, nextCursor });
            });

            stream.on('end', () => {
                if (carry.length > 0) {
                    const beforePartialCursor = nextCursor;
                    const beforePartialEvents = events.length;
                    handleLine(carry, lineStartOffset, true);
                    if (events.length > beforePartialEvents) {
                        nextCursor = endOffsetExclusive;
                    } else {
                        nextCursor = beforePartialCursor;
                    }
                }
                resolve({ events, nextCursor });
            });
        });
    }

    private updateSessionId(sessionId: string): void {
        if (this.observedSessionId === sessionId) {
            return;
        }
        this.observedSessionId = sessionId;
        this.onSessionId?.(sessionId);
    }
}

function parseCodexSessionEvent(value: unknown): CodexSessionEvent | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.type !== 'string' || record.type.length === 0) {
        return null;
    }
    return {
        timestamp: typeof record.timestamp === 'string' ? record.timestamp : undefined,
        type: record.type,
        payload: record.payload
    };
}

function extractSessionId(event: CodexSessionEvent): string | null {
    if (!event.payload || typeof event.payload !== 'object') {
        return null;
    }
    const payload = event.payload as Record<string, unknown>;
    return typeof payload.id === 'string' && payload.id.length > 0 ? payload.id : null;
}
