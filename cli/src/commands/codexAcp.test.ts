import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    initializeTokenMock,
    maybeAutoStartServerMock,
    authAndSetupMachineIfNeededMock,
    registerCodexAcpAgentMock,
    runAgentSessionMock
} = vi.hoisted(() => ({
    initializeTokenMock: vi.fn(async () => {}),
    maybeAutoStartServerMock: vi.fn(async () => {}),
    authAndSetupMachineIfNeededMock: vi.fn(async () => {}),
    registerCodexAcpAgentMock: vi.fn(),
    runAgentSessionMock: vi.fn(async () => {})
}))

vi.mock('@/ui/tokenInit', () => ({
    initializeToken: initializeTokenMock
}))

vi.mock('@/utils/autoStartServer', () => ({
    maybeAutoStartServer: maybeAutoStartServerMock
}))

vi.mock('@/ui/auth', () => ({
    authAndSetupMachineIfNeeded: authAndSetupMachineIfNeededMock
}))

vi.mock('@/agent/runners/codexAcp', () => ({
    registerCodexAcpAgent: registerCodexAcpAgentMock
}))

vi.mock('@/agent/runners/runAgentSession', () => ({
    runAgentSession: runAgentSessionMock
}))

import { codexAcpCommand } from './codexAcp'

describe('codexAcpCommand', () => {
    beforeEach(() => {
        initializeTokenMock.mockClear()
        maybeAutoStartServerMock.mockClear()
        authAndSetupMachineIfNeededMock.mockClear()
        registerCodexAcpAgentMock.mockClear()
        runAgentSessionMock.mockClear()
    })

    it('passes runner starting mode and permission flags to the ACP session runner', async () => {
        await codexAcpCommand.run({
            args: [],
            subcommand: undefined,
            commandArgs: [
                '--started-by', 'runner',
                '--hapi-starting-mode', 'remote',
                '--permission-mode', 'yolo'
            ]
        })

        expect(initializeTokenMock).toHaveBeenCalledOnce()
        expect(maybeAutoStartServerMock).toHaveBeenCalledOnce()
        expect(authAndSetupMachineIfNeededMock).toHaveBeenCalledOnce()
        expect(registerCodexAcpAgentMock).toHaveBeenCalledOnce()
        expect(runAgentSessionMock).toHaveBeenCalledWith({
            agentType: 'codex',
            startedBy: 'runner',
            startingMode: 'remote',
            permissionMode: 'yolo'
        })
    })
})
