import type { AgentState, SessionPermissionMode } from '@/api/types';
import { logger } from '@/ui/logger';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { AgentRegistry } from '@/agent/AgentRegistry';
import { convertAgentMessage } from '@/agent/messageConverter';
import { PermissionAdapter } from '@/agent/permissionAdapter';
import type { AgentBackend, PromptContent } from '@/agent/types';
import { startHappyServer } from '@/claude/utils/startHappyServer';
import { getHappyCliCommand } from '@/utils/spawnHappyCLI';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import { bootstrapSession } from '@/agent/sessionFactory';
import { setControlledByUser } from '@/agent/runnerLifecycle';
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter';
import { getInvokedCwd } from '@/utils/invokedCwd';
import { codexAcpModeForPermissionMode } from '@/codex/utils/codexAcpMode';
import { PermissionModeSchema } from '@hapi/protocol/schemas';
import { isPermissionModeAllowedForFlavor } from '@hapi/protocol';
import type { SessionEndReason } from '@hapi/protocol';

type ConfigurableBackend = AgentBackend & {
    setSessionConfigOption?: (sessionId: string, configId: string, value: string) => Promise<unknown>;
    getConfigOptionId?: (kind: 'mode' | 'model' | 'reasoning') => string | null;
};

function emitReadyIfIdle(props: {
    queueSize: () => number;
    shouldExit: boolean;
    thinking: boolean;
    sendReady: () => void;
}): void {
    if (props.shouldExit) return;
    if (props.thinking) return;
    if (props.queueSize() > 0) return;
    props.sendReady();
}

export async function runAgentSession(opts: {
    agentType: string;
    startedBy?: 'runner' | 'terminal';
    startingMode?: 'local' | 'remote';
    permissionMode?: SessionPermissionMode;
}): Promise<void> {
    const workingDirectory = getInvokedCwd();
    const startedBy = opts.startedBy ?? 'terminal';
    const startingMode: 'local' | 'remote' = startedBy === 'runner'
        ? 'remote'
        : opts.startingMode ?? 'local';
    const initialState: AgentState = {
        controlledByUser: startingMode === 'local'
    };
    const { session, sessionInfo } = await bootstrapSession({
        flavor: opts.agentType,
        startedBy,
        workingDirectory,
        agentState: initialState
    });

    setControlledByUser(session, startingMode);

    const messageQueue = new MessageQueue2<Record<string, never>>(() => hashObject({}));

    session.onUserMessage((message, localId) => {
        const formattedText = formatMessageWithAttachments(message.content.text, message.content.attachments);
        messageQueue.push(formattedText, {}, localId);
    });

    let currentPermissionMode: SessionPermissionMode = opts.permissionMode ?? sessionInfo.permissionMode ?? 'default';

    const backend: AgentBackend = AgentRegistry.create(opts.agentType);
    backend.onSessionCapabilities?.((capabilities) => {
        session.emitSessionCapabilities(capabilities);
    });
    backend.onSlashCommands?.((slashCommands) => {
        session.emitSessionSlashCommands(slashCommands);
    });
    await backend.initialize();

    const permissionAdapter = new PermissionAdapter(session, backend, () => currentPermissionMode);

    const happyServer = await startHappyServer(session);
    const bridgeCommand = getHappyCliCommand(['mcp', '--url', happyServer.url]);
    const mcpServers = [
        {
            name: 'happy',
            command: bridgeCommand.command,
            args: bridgeCommand.args,
            env: []
        }
    ];

    const agentSessionId = await backend.newSession({
        cwd: workingDirectory,
        mcpServers
    });

    const applyRuntimeConfig = async () => {
        if (opts.agentType !== 'codex') {
            return;
        }
        const configurableBackend = backend as ConfigurableBackend;
        if (!configurableBackend.setSessionConfigOption) {
            return;
        }
        const acpMode = codexAcpModeForPermissionMode(currentPermissionMode);
        if (!acpMode) {
            return;
        }
        const modeConfigId = configurableBackend.getConfigOptionId?.('mode');
        if (!modeConfigId) {
            logger.debug('[ACP] Codex ACP mode config option not advertised; skipping permission mode sync');
            return;
        }
        try {
            await configurableBackend.setSessionConfigOption(
                agentSessionId,
                modeConfigId,
                acpMode
            );
        } catch (error) {
            logger.debug('[ACP] Failed to apply Codex ACP permission mode', error);
        }
    };

    let thinking = false;
    let shouldExit = false;
    let waitAbortController: AbortController | null = null;

    const syncKeepAlive = () => {
        session.keepAlive(thinking, startingMode, {
            permissionMode: currentPermissionMode
        });
    };

    const resolvePermissionMode = (value: unknown): SessionPermissionMode => {
        const parsed = PermissionModeSchema.safeParse(value);
        if (!parsed.success || !isPermissionModeAllowedForFlavor(parsed.data, opts.agentType)) {
            throw new Error('Invalid permission mode');
        }
        return parsed.data as SessionPermissionMode;
    };

    session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid session config payload');
        }
        const config = payload as { permissionMode?: unknown };

        if (config.permissionMode !== undefined) {
            currentPermissionMode = resolvePermissionMode(config.permissionMode);
        }

        await applyRuntimeConfig();
        syncKeepAlive();
        return { applied: { permissionMode: currentPermissionMode } };
    });

    await applyRuntimeConfig();
    syncKeepAlive();
    const keepAliveInterval = setInterval(() => {
        syncKeepAlive();
    }, 2000);

    const sendReady = () => {
        session.sendSessionEvent({ type: 'ready' });
    };

    const handleAbort = async () => {
        logger.debug('[ACP] Abort requested');
        await backend.cancelPrompt(agentSessionId);
        await permissionAdapter.cancelAll('User aborted');
        thinking = false;
        syncKeepAlive();
        sendReady();
        if (waitAbortController) {
            waitAbortController.abort();
        }
    };

    session.rpcHandlerManager.registerHandler('abort', async () => {
        await handleAbort();
    });

    const handleKillSession = async () => {
        if (shouldExit) return;
        shouldExit = true;
        await permissionAdapter.cancelAll('Session killed');
        if (waitAbortController) {
            waitAbortController.abort();
        }
    };

    registerKillSessionHandler(session.rpcHandlerManager, handleKillSession);

    let sessionEndReason: SessionEndReason = 'completed';
    try {
        while (!shouldExit) {
            waitAbortController = new AbortController();
            const batch = await messageQueue.waitForMessagesAndGetAsString(waitAbortController.signal);
            waitAbortController = null;
            if (!batch) {
                if (shouldExit) {
                    break;
                }
                continue;
            }

            const promptContent: PromptContent[] = [{
                type: 'text',
                text: batch.message
            }];

            thinking = true;
            syncKeepAlive();

            try {
                await backend.prompt(agentSessionId, promptContent, (message) => {
                    const converted = convertAgentMessage(message);
                    if (converted) {
                        session.sendAgentMessage(converted);
                    }
                });
            } catch (error) {
                logger.warn('[ACP] Prompt failed', error);
                session.sendSessionEvent({
                    type: 'message',
                    message: 'Agent prompt failed. Check logs for details.'
                });
            } finally {
                thinking = false;
                syncKeepAlive();
                await permissionAdapter.cancelAll('Prompt finished');
                emitReadyIfIdle({
                    queueSize: () => messageQueue.size(),
                    shouldExit,
                    thinking,
                    sendReady
                });
            }
        }
        if (shouldExit) {
            sessionEndReason = 'terminated';
        }
    } catch (error) {
        sessionEndReason = 'error';
        throw error;
    } finally {
        clearInterval(keepAliveInterval);
        await permissionAdapter.cancelAll('Session ended');
        session.sendSessionDeath(sessionEndReason);
        await session.flush();
        session.close();
        await backend.disconnect();
        happyServer.stop();
    }
}
