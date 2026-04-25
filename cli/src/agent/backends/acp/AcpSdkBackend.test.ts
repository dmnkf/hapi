import { afterEach, describe, expect, it } from 'vitest';
import type { AgentMessage } from '@/agent/types';
import type { SessionCapabilities, SessionRuntimeSlashCommands } from '@hapi/protocol';
import { AcpSdkBackend } from './AcpSdkBackend';
import { ACP_SESSION_UPDATE_TYPES } from './constants';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

type BackendStatics = {
    UPDATE_QUIET_PERIOD_MS: number;
    UPDATE_DRAIN_TIMEOUT_MS: number;
    PRE_PROMPT_UPDATE_QUIET_PERIOD_MS: number;
    PRE_PROMPT_UPDATE_DRAIN_TIMEOUT_MS: number;
};

const backendStatics = AcpSdkBackend as unknown as BackendStatics;
const originalStatics = {
    updateQuietPeriodMs: backendStatics.UPDATE_QUIET_PERIOD_MS,
    updateDrainTimeoutMs: backendStatics.UPDATE_DRAIN_TIMEOUT_MS,
    prePromptUpdateQuietPeriodMs: backendStatics.PRE_PROMPT_UPDATE_QUIET_PERIOD_MS,
    prePromptUpdateDrainTimeoutMs: backendStatics.PRE_PROMPT_UPDATE_DRAIN_TIMEOUT_MS
};

afterEach(() => {
    backendStatics.UPDATE_QUIET_PERIOD_MS = originalStatics.updateQuietPeriodMs;
    backendStatics.UPDATE_DRAIN_TIMEOUT_MS = originalStatics.updateDrainTimeoutMs;
    backendStatics.PRE_PROMPT_UPDATE_QUIET_PERIOD_MS = originalStatics.prePromptUpdateQuietPeriodMs;
    backendStatics.PRE_PROMPT_UPDATE_DRAIN_TIMEOUT_MS = originalStatics.prePromptUpdateDrainTimeoutMs;
});

describe('AcpSdkBackend', () => {
    it('emits capabilities from ACP session setup config', async () => {
        const backend = new AcpSdkBackend({ command: 'opencode' });
        const capabilities: SessionCapabilities[] = [];
        backend.onSessionCapabilities((value) => capabilities.push(value));

        const backendInternal = backend as unknown as {
            transport: {
                sendRequest: (...args: unknown[]) => Promise<unknown>;
            } | null;
        };

        backendInternal.transport = {
            sendRequest: async () => ({
                sessionId: 'session-1',
                configOptions: [
                    {
                        id: 'model',
                        name: 'Model',
                        category: 'model',
                        type: 'select',
                        currentValue: 'gemini-flash',
                        options: [
                            { value: 'gemini-flash', name: 'Gemini Flash' },
                            { value: 'gemini-pro', name: 'Gemini Pro' }
                        ]
                    },
                    {
                        id: 'reasoning',
                        name: 'Reasoning',
                        category: 'thought_level',
                        type: 'select',
                        currentValue: 'low',
                        options: [
                            { value: 'low', name: 'Low' },
                            { value: 'high', name: 'High' }
                        ]
                    }
                ],
                modes: {
                    currentModeId: 'code',
                    availableModes: [
                        { id: 'ask', name: 'Ask' },
                        { id: 'code', name: 'Code' }
                    ]
                }
            })
        };

        await backend.newSession({ cwd: '/tmp', mcpServers: [] });

        expect(capabilities).toEqual([
            {
                models: [
                    { id: 'gemini-flash', label: 'Gemini Flash', isDefault: true },
                    { id: 'gemini-pro', label: 'Gemini Pro', isDefault: undefined }
                ],
                reasoningEfforts: ['low', 'high'],
                effortOptions: ['low', 'high'],
                collaborationModes: ['ask', 'code'],
                source: 'dynamic',
                probedAt: expect.any(Number)
            }
        ]);
    });

    it('can suppress ACP modes when they are runtime permission presets', async () => {
        const backend = new AcpSdkBackend({
            command: 'codex-acp',
            discovery: {
                exposeModeConfigAsCollaborationModes: false
            }
        });
        const capabilities: SessionCapabilities[] = [];
        backend.onSessionCapabilities((value) => capabilities.push(value));

        const backendInternal = backend as unknown as {
            transport: {
                sendRequest: (...args: unknown[]) => Promise<unknown>;
            } | null;
        };

        backendInternal.transport = {
            sendRequest: async () => ({
                sessionId: 'session-1',
                configOptions: [
                    {
                        id: 'mode',
                        name: 'Mode',
                        category: 'mode',
                        currentValue: 'suggest',
                        options: [
                            { value: 'read-only', name: 'Read Only' },
                            { value: 'suggest', name: 'Suggest' },
                            { value: 'auto-edit', name: 'Auto Edit' },
                            { value: 'full-auto', name: 'Full Auto' }
                        ]
                    },
                    {
                        id: 'model',
                        name: 'Model',
                        category: 'model',
                        currentValue: 'gpt-5.4',
                        options: [
                            { value: 'gpt-5.4', name: 'GPT-5.4' }
                        ]
                    }
                ],
                modes: {
                    currentModeId: 'suggest',
                    availableModes: ['read-only', 'suggest', 'auto-edit', 'full-auto']
                }
            })
        };

        await backend.newSession({ cwd: '/tmp', mcpServers: [] });

        expect(capabilities).toEqual([
            {
                models: [
                    { id: 'gpt-5.4', label: 'GPT-5.4', isDefault: true }
                ],
                source: 'dynamic',
                probedAt: expect.any(Number)
            }
        ]);
        expect(backend.getConfigOptionId('mode')).toBe('mode');
        expect(backend.getConfigOptionId('model')).toBe('model');
    });

    it('sends ACP session config option updates and republishes returned capabilities', async () => {
        const backend = new AcpSdkBackend({ command: 'codex-acp' });
        const calls: Array<{ method: string; params: unknown }> = [];
        const capabilities: SessionCapabilities[] = [];
        backend.onSessionCapabilities((value) => capabilities.push(value));

        const backendInternal = backend as unknown as {
            transport: {
                sendRequest: (...args: unknown[]) => Promise<unknown>;
            } | null;
        };

        backendInternal.transport = {
            sendRequest: async (method, params) => {
                calls.push({ method: String(method), params });
                return {
                    configOptions: [
                        {
                            id: 'model',
                            name: 'Model',
                            category: 'model',
                            currentValue: 'gpt-5.4',
                            options: [
                                { value: 'gpt-5.4', name: 'GPT-5.4' },
                                { value: 'o3', name: 'o3' }
                            ]
                        }
                    ]
                };
            }
        };

        await backend.setSessionConfigOption('session-1', 'model', 'gpt-5.4');

        expect(calls).toEqual([
            {
                method: 'session/set_config_option',
                params: {
                    sessionId: 'session-1',
                    configId: 'model',
                    value: 'gpt-5.4'
                }
            }
        ]);
        expect(capabilities).toEqual([
            {
                models: [
                    { id: 'gpt-5.4', label: 'GPT-5.4', isDefault: true },
                    { id: 'o3', label: 'o3', isDefault: undefined }
                ],
                source: 'dynamic',
                probedAt: expect.any(Number)
            }
        ]);
    });

    it('emits runtime slash commands and capability updates from ACP notifications', () => {
        const backend = new AcpSdkBackend({ command: 'opencode' });
        const capabilities: SessionCapabilities[] = [];
        const slashCommands: SessionRuntimeSlashCommands[] = [];
        backend.onSessionCapabilities((value) => capabilities.push(value));
        backend.onSlashCommands((value) => slashCommands.push(value));

        const backendInternal = backend as unknown as {
            activeSessionId: string | null;
            handleSessionUpdate: (params: unknown) => void;
        };
        backendInternal.activeSessionId = 'session-1';

        backendInternal.handleSessionUpdate({
            sessionId: 'session-1',
            update: {
                sessionUpdate: ACP_SESSION_UPDATE_TYPES.availableCommandsUpdate,
                availableCommands: [
                    {
                        name: 'test',
                        description: 'Run tests',
                        input: { hint: 'target' }
                    },
                    {
                        name: '/plan',
                        description: 'Create a plan'
                    }
                ]
            }
        });

        backendInternal.handleSessionUpdate({
            sessionId: 'session-1',
            update: {
                sessionUpdate: ACP_SESSION_UPDATE_TYPES.configOptionUpdate,
                configOptions: [
                    {
                        id: 'mode',
                        name: 'Mode',
                        category: 'mode',
                        type: 'select',
                        currentValue: 'code',
                        options: [
                            { value: 'ask', name: 'Ask' },
                            { value: 'code', name: 'Code' }
                        ]
                    }
                ]
            }
        });

        backendInternal.handleSessionUpdate({
            sessionId: 'session-1',
            update: {
                sessionUpdate: ACP_SESSION_UPDATE_TYPES.currentModeUpdate,
                currentModeId: 'review'
            }
        });

        expect(slashCommands).toEqual([
            {
                commands: [
                    { name: 'test', description: 'Run tests', source: 'runtime', inputHint: 'target' },
                    { name: 'plan', description: 'Create a plan', source: 'runtime', inputHint: undefined }
                ],
                source: 'dynamic',
                updatedAt: expect.any(Number)
            }
        ]);
        expect(capabilities).toEqual([
            {
                collaborationModes: ['ask', 'code'],
                source: 'dynamic',
                probedAt: expect.any(Number)
            },
            {
                collaborationModes: ['ask', 'code', 'review'],
                source: 'dynamic',
                probedAt: expect.any(Number)
            }
        ]);
    });

    it('allows the permission handler to resolve requests immediately', async () => {
        const backend = new AcpSdkBackend({ command: 'opencode' });
        let capturedRequestId: string | null = null;

        backend.onPermissionRequest((request) => {
            capturedRequestId = request.id;
            void backend.respondToPermission(request.sessionId, request, {
                outcome: 'selected',
                optionId: 'allow-once'
            });
        });

        const backendInternal = backend as unknown as {
            handlePermissionRequest: (params: unknown, requestId: string | number | null) => Promise<unknown>;
        };

        await expect(backendInternal.handlePermissionRequest({
            sessionId: 'session-1',
            toolCall: {
                toolCallId: 'tool-approve',
                title: 'hapi_change_title',
                rawInput: { title: 'Rename chat' }
            },
            options: [
                {
                    optionId: 'allow-once',
                    name: 'Allow once',
                    kind: 'allow_once'
                }
            ]
        }, null)).resolves.toEqual({
            outcome: {
                outcome: 'selected',
                optionId: 'allow-once'
            }
        });

        expect(capturedRequestId).toBe('tool-approve');
    });

    it('emits turn_complete after trailing tool updates from the same turn', async () => {
        backendStatics.UPDATE_QUIET_PERIOD_MS = 8;
        backendStatics.UPDATE_DRAIN_TIMEOUT_MS = 200;
        backendStatics.PRE_PROMPT_UPDATE_QUIET_PERIOD_MS = 1;
        backendStatics.PRE_PROMPT_UPDATE_DRAIN_TIMEOUT_MS = 50;

        const backend = new AcpSdkBackend({ command: 'opencode' });
        const backendInternal = backend as unknown as {
            transport: {
                sendRequest: (...args: unknown[]) => Promise<unknown>;
                close: () => Promise<void>;
            } | null;
            handleSessionUpdate: (params: unknown) => void;
        };

        const messages: AgentMessage[] = [];

        // Deterministic sequencing (no real-time setTimeout fragility): the
        // mock sendRequest emits the mid-turn chunk first, schedules the
        // trailing tool events via queueMicrotask to deliver them AFTER
        // sendRequest's promise resolves but BEFORE the post-prompt drain
        // exits, and then returns the stop reason. This reproduces
        // "trailing tool updates arriving after sendRequest returns but
        // within the drain window" without relying on wall-clock timing
        // that jitters on slow CI runners.
        backendInternal.transport = {
            sendRequest: async () => {
                // Emit mid-turn chunk
                backendInternal.handleSessionUpdate({
                    sessionId: 'session-1',
                    update: {
                        sessionUpdate: ACP_SESSION_UPDATE_TYPES.agentMessageChunk,
                        content: { type: 'text', text: 'final answer' }
                    }
                });

                // Queue trailing tool events on microtask queue. These will
                // fire AFTER this async function's return value settles
                // but still before prompt()'s drain loop completes its
                // first quiet-check setTimeout.
                queueMicrotask(() => {
                    backendInternal.handleSessionUpdate({
                        sessionId: 'session-1',
                        update: {
                            sessionUpdate: ACP_SESSION_UPDATE_TYPES.toolCall,
                            toolCallId: 'tool-1',
                            title: 'Read',
                            rawInput: { path: 'README.md' },
                            status: 'in_progress'
                        }
                    });
                    backendInternal.handleSessionUpdate({
                        sessionId: 'session-1',
                        update: {
                            sessionUpdate: ACP_SESSION_UPDATE_TYPES.toolCallUpdate,
                            toolCallId: 'tool-1',
                            status: 'completed',
                            rawOutput: { ok: true }
                        }
                    });
                });

                return { stopReason: 'end_turn' };
            },
            close: async () => {}
        };

        await backend.prompt('session-1', [{ type: 'text', text: 'hello' }], (message) => {
            messages.push(message);
        });

        expect(messages.map((message) => message.type)).toEqual([
            'tool_call',
            'tool_result',
            'text',
            'turn_complete'
        ]);
    });
});
