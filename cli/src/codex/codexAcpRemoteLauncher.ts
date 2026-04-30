import React from 'react';

import { convertAgentMessage } from '@/agent/messageConverter';
import { PermissionAdapter } from '@/agent/permissionAdapter';
import type { AgentMessage, McpServerStdio, PromptContent } from '@/agent/types';
import { createCodexAcpBackend } from '@/agent/runners/codexAcp';
import {
    RemoteLauncherBase,
    type RemoteLauncherDisplayContext,
    type RemoteLauncherExitReason
} from '@/modules/common/remote/RemoteLauncherBase';
import { logger } from '@/ui/logger';
import { CodexDisplay } from '@/ui/ink/CodexDisplay';
import { buildHapiMcpBridge } from './utils/buildHapiMcpBridge';
import { codexAcpModeForPermissionMode } from './utils/codexAcpMode';
import type { CodexSession } from './session';
import type { CodexPermissionMode } from '@hapi/protocol/types';
import type { EnhancedMode } from './loop';

type HappyServer = Awaited<ReturnType<typeof buildHapiMcpBridge>>['server'];
type CodexAcpBackend = ReturnType<typeof createCodexAcpBackend>;

function toAcpMcpServers(config: Record<string, { command: string; args: string[] }>): McpServerStdio[] {
    return Object.entries(config).map(([name, entry]) => ({
        name,
        command: entry.command,
        args: entry.args,
        env: []
    }));
}

class CodexAcpRemoteLauncher extends RemoteLauncherBase {
    private readonly session: CodexSession;
    private backend: CodexAcpBackend | null = null;
    private permissionAdapter: PermissionAdapter | null = null;
    private happyServer: HappyServer | null = null;
    private abortController = new AbortController();
    private activeAcpSessionId: string | null = null;
    private displayPermissionMode: CodexPermissionMode | null = null;
    private displayModel: string | null = null;
    private displayReasoningEffort: string | null = null;
    private appliedConfig: {
        permissionMode?: CodexPermissionMode;
        model?: string;
        modelReasoningEffort?: string;
    } = {};

    constructor(session: CodexSession) {
        super(process.env.DEBUG ? session.logPath : undefined);
        this.session = session;
    }

    public async launch(): Promise<RemoteLauncherExitReason> {
        if (this.session.codexArgs && this.session.codexArgs.length > 0) {
            logger.debug(
                `[codex-acp-remote] CLI args [${this.session.codexArgs.join(', ')}] are ignored in ACP remote mode. ` +
                'Use HAPI_CODEX_ACP_ARGS for codex-acp process flags.'
            );
        }

        return this.start({
            onExit: () => this.handleExitFromUi(),
            onSwitchToLocal: () => this.handleSwitchFromUi()
        });
    }

    protected createDisplay(context: RemoteLauncherDisplayContext): React.ReactElement {
        return React.createElement(CodexDisplay, context);
    }

    protected async runMainLoop(): Promise<void> {
        const session = this.session;
        const messageBuffer = this.messageBuffer;

        const { server: happyServer, mcpServers } = await buildHapiMcpBridge(session.client);
        this.happyServer = happyServer;

        const backend = createCodexAcpBackend();
        this.backend = backend;

        backend.onSessionCapabilities((capabilities) => {
            session.client.emitSessionCapabilities(capabilities);
        });
        backend.onSlashCommands((slashCommands) => {
            session.client.emitSessionSlashCommands(slashCommands);
        });
        backend.onStderrError((error) => {
            logger.debug('[codex-acp-remote] stderr error', error);
            session.sendSessionEvent({ type: 'message', message: error.message });
            messageBuffer.addMessage(error.message, 'status');
        });

        await backend.initialize();

        const acpMcpServers = toAcpMcpServers(mcpServers);
        const resumeSessionId = session.sessionId;
        let acpSessionId: string;
        if (resumeSessionId) {
            try {
                acpSessionId = await backend.loadSession({
                    sessionId: resumeSessionId,
                    cwd: session.path,
                    mcpServers: acpMcpServers
                }, (message: AgentMessage) => {
                    const converted = convertAgentMessage(message);
                    if (converted) {
                        session.sendAgentMessage(converted);
                    }
                });
            } catch (error) {
                logger.warn('[codex-acp-remote] resume failed, starting new session', error);
                session.sendSessionEvent({
                    type: 'message',
                    message: 'Codex ACP resume failed; starting a new session.'
                });
                acpSessionId = await backend.newSession({
                    cwd: session.path,
                    mcpServers: acpMcpServers
                });
            }
        } else {
            acpSessionId = await backend.newSession({
                cwd: session.path,
                mcpServers: acpMcpServers
            });
        }
        this.activeAcpSessionId = acpSessionId;
        session.onSessionFound(acpSessionId);

        this.permissionAdapter = new PermissionAdapter(
            session.client,
            backend,
            () => session.getPermissionMode()
        );

        this.setupAbortHandlers(session.client.rpcHandlerManager, {
            onAbort: () => this.handleAbort(),
            onSwitch: () => this.handleSwitchRequest()
        });

        await this.applyAcpConfig(acpSessionId, {
            permissionMode: (session.getPermissionMode() as CodexPermissionMode | undefined) ?? 'default',
            model: session.getModel() ?? undefined,
            modelReasoningEffort: (session.getModelReasoningEffort() ?? undefined) as EnhancedMode['modelReasoningEffort'],
            collaborationMode: (session.getCollaborationMode() ?? 'default') as EnhancedMode['collaborationMode']
        });
        this.applyDisplayMode({
            permissionMode: (session.getPermissionMode() as CodexPermissionMode | undefined) ?? 'default',
            model: session.getModel() ?? undefined,
            modelReasoningEffort: (session.getModelReasoningEffort() ?? undefined) as EnhancedMode['modelReasoningEffort'],
            collaborationMode: (session.getCollaborationMode() ?? 'default') as EnhancedMode['collaborationMode']
        });

        const sendReady = () => {
            session.sendSessionEvent({ type: 'ready' });
        };

        while (!this.shouldExit) {
            const waitSignal = this.abortController.signal;
            const batch = await session.queue.waitForMessagesAndGetAsString(waitSignal);
            if (!batch) {
                if (waitSignal.aborted && !this.shouldExit) {
                    continue;
                }
                break;
            }

            await this.applyAcpConfig(acpSessionId, batch.mode);
            this.applyDisplayMode(batch.mode);
            messageBuffer.addMessage(batch.message, 'user');

            const promptContent: PromptContent[] = [{
                type: 'text',
                text: batch.message
            }];

            session.onThinkingChange(true);

            try {
                await backend.prompt(acpSessionId, promptContent, (message: AgentMessage) => {
                    this.handleAgentMessage(message);
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.warn('[codex-acp-remote] prompt failed', { message: errorMessage });
                session.sendSessionEvent({
                    type: 'message',
                    message: `Codex ACP prompt failed: ${errorMessage}`
                });
                messageBuffer.addMessage(`Codex ACP prompt failed: ${errorMessage}`, 'status');
            } finally {
                session.onThinkingChange(false);
                await this.permissionAdapter?.cancelAll('Prompt finished');
                if (session.queue.size() === 0 && !this.shouldExit) {
                    sendReady();
                }
            }
        }
    }

    protected async cleanup(): Promise<void> {
        this.clearAbortHandlers(this.session.client.rpcHandlerManager);

        if (this.permissionAdapter) {
            await this.permissionAdapter.cancelAll('Session ended');
            this.permissionAdapter = null;
        }

        if (this.backend) {
            await this.backend.disconnect();
            this.backend = null;
        }

        if (this.happyServer) {
            this.happyServer.stop();
            this.happyServer = null;
        }
    }

    private async applyAcpConfig(sessionId: string, mode: EnhancedMode): Promise<void> {
        const backend = this.backend;
        if (!backend) {
            return;
        }

        if (mode.permissionMode !== this.appliedConfig.permissionMode) {
            const modeConfigId = backend.getConfigOptionId('mode');
            const acpMode = codexAcpModeForPermissionMode(mode.permissionMode) ?? 'suggest';
            const applied = modeConfigId
                ? await this.setConfigOption(sessionId, modeConfigId, acpMode)
                : false;
            if (applied) {
                this.appliedConfig.permissionMode = mode.permissionMode;
            }
        }

        const model = mode.model?.trim();
        const modelConfigId = backend.getConfigOptionId('model');
        if (model && modelConfigId && model !== this.appliedConfig.model) {
            const applied = await this.setConfigOption(sessionId, modelConfigId, model);
            if (applied) {
                this.appliedConfig.model = model;
            }
        }

        const reasoningEffort = mode.modelReasoningEffort?.trim();
        const reasoningConfigId = backend.getConfigOptionId('reasoning');
        if (reasoningEffort && reasoningConfigId && reasoningEffort !== this.appliedConfig.modelReasoningEffort) {
            const applied = await this.setConfigOption(sessionId, reasoningConfigId, reasoningEffort);
            if (applied) {
                this.appliedConfig.modelReasoningEffort = reasoningEffort;
            }
        }
    }

    private async setConfigOption(sessionId: string, configId: string, value: string): Promise<boolean> {
        const backend = this.backend;
        if (!backend) {
            return false;
        }

        try {
            await backend.setSessionConfigOption(sessionId, configId, value);
            return true;
        } catch (error) {
            logger.debug(`[codex-acp-remote] Failed to apply ACP config option ${configId}`, error);
            return false;
        }
    }

    private handleAgentMessage(message: AgentMessage): void {
        const converted = convertAgentMessage(message);
        if (converted) {
            this.session.sendAgentMessage(converted);
        }

        switch (message.type) {
            case 'text':
                this.messageBuffer.addMessage(message.text, 'assistant');
                break;
            case 'tool_call':
                this.messageBuffer.addMessage(`Tool call: ${message.name}`, 'tool');
                break;
            case 'tool_result':
                this.messageBuffer.addMessage('Tool result received', 'result');
                break;
            case 'plan':
                this.messageBuffer.addMessage('Plan updated', 'status');
                break;
            case 'reasoning':
                this.messageBuffer.addMessage(message.text, 'system');
                break;
            case 'error':
                this.messageBuffer.addMessage(message.message, 'status');
                break;
            case 'turn_complete':
                this.messageBuffer.addMessage('Turn complete', 'status');
                break;
            default: {
                const _exhaustive: never = message;
                return _exhaustive;
            }
        }
    }

    private applyDisplayMode(mode: EnhancedMode): void {
        if (mode.permissionMode && mode.permissionMode !== this.displayPermissionMode) {
            this.displayPermissionMode = mode.permissionMode;
            this.messageBuffer.addMessage(`[MODE:${mode.permissionMode}]`, 'system');
        }
        if (mode.model && mode.model !== this.displayModel) {
            this.displayModel = mode.model;
            this.messageBuffer.addMessage(`[MODEL:${mode.model}]`, 'system');
        }
        if (mode.modelReasoningEffort && mode.modelReasoningEffort !== this.displayReasoningEffort) {
            this.displayReasoningEffort = mode.modelReasoningEffort;
            this.messageBuffer.addMessage(`[REASONING:${mode.modelReasoningEffort}]`, 'system');
        }
    }

    private async handleAbort(): Promise<void> {
        const backend = this.backend;
        if (backend && this.activeAcpSessionId) {
            await backend.cancelPrompt(this.activeAcpSessionId);
        }
        await this.permissionAdapter?.cancelAll('User aborted');
        this.session.sendSessionEvent({ type: 'message', message: 'Session aborted' });
        this.session.queue.reset();
        this.session.onThinkingChange(false);
        this.abortController.abort();
        this.abortController = new AbortController();
        this.messageBuffer.addMessage('Turn aborted', 'status');
    }

    private async handleExitFromUi(): Promise<void> {
        await this.requestExit('exit', () => this.handleAbort());
    }

    private async handleSwitchFromUi(): Promise<void> {
        await this.requestExit('switch', () => this.handleAbort());
    }

    private async handleSwitchRequest(): Promise<void> {
        await this.requestExit('switch', () => this.handleAbort());
    }
}

export async function codexAcpRemoteLauncher(session: CodexSession): Promise<'switch' | 'exit'> {
    const launcher = new CodexAcpRemoteLauncher(session);
    return launcher.launch();
}
