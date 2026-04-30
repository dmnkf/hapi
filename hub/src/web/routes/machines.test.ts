import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { Machine, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createMachinesRoutes } from './machines'

function createMachine(overrides?: Partial<Machine>): Machine {
    return {
        id: 'machine-1',
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            host: 'localhost',
            platform: 'darwin',
            happyCliVersion: '1.0.0'
        },
        metadataVersion: 1,
        runnerState: null,
        runnerStateVersion: 1,
        ...overrides
    }
}

describe('machines routes', () => {
    it('returns Codex models for an online machine', async () => {
        const machine = createMachine()
        const engine = {
            getMachine: () => machine,
            getMachineByNamespace: () => machine,
            listCodexModelsForMachine: async () => ({
                success: true,
                models: [
                    { id: 'gpt-5.5', displayName: 'GPT-5.5', isDefault: true }
                ]
            })
        } as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.use('*', async (c, next) => {
            c.set('namespace', 'default')
            await next()
        })
        app.route('/api', createMachinesRoutes(() => engine as SyncEngine))

        const response = await app.request('/api/machines/machine-1/codex-models')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            success: true,
            models: [
                { id: 'gpt-5.5', displayName: 'GPT-5.5', isDefault: true }
            ]
        })
    })

    it('returns native Codex sessions for an online machine', async () => {
        const machine = createMachine()
        const engine = {
            getMachine: () => machine,
            getMachineByNamespace: () => machine,
            listNativeCodexSessions: async () => ({
                success: true,
                sessions: [
                    {
                        codexSessionId: 'codex-thread-1',
                        transcriptPath: '/home/me/.codex/sessions/thread.jsonl',
                        cwd: '/repo',
                        title: 'Fix reconnect',
                        updatedAt: 123,
                        messageCount: 2,
                        userMessageCount: 1,
                        agentMessageCount: 1
                    }
                ]
            })
        } as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.use('*', async (c, next) => {
            c.set('namespace', 'default')
            await next()
        })
        app.route('/api', createMachinesRoutes(() => engine as SyncEngine))

        const response = await app.request('/api/machines/machine-1/native-codex-sessions')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            success: true,
            sessions: [
                {
                    codexSessionId: 'codex-thread-1',
                    transcriptPath: '/home/me/.codex/sessions/thread.jsonl',
                    cwd: '/repo',
                    title: 'Fix reconnect',
                    updatedAt: 123,
                    messageCount: 2,
                    userMessageCount: 1,
                    agentMessageCount: 1
                }
            ]
        })
    })

    it('imports a native Codex session for an online machine', async () => {
        const machine = createMachine()
        const engine = {
            getMachine: () => machine,
            getMachineByNamespace: () => machine,
            importNativeCodexSession: async (_machineId: string, params: { codexSessionId?: string }) => ({
                success: true,
                sessionId: 'hapi-session-1',
                codexSessionId: params.codexSessionId ?? 'codex-thread-1',
                transcriptPath: '/home/me/.codex/sessions/thread.jsonl',
                importedMessages: 2,
                skippedMessages: 1
            })
        } as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.use('*', async (c, next) => {
            c.set('namespace', 'default')
            await next()
        })
        app.route('/api', createMachinesRoutes(() => engine as SyncEngine))

        const response = await app.request('/api/machines/machine-1/native-codex-sessions/import', {
            method: 'POST',
            body: JSON.stringify({ codexSessionId: 'codex-thread-1' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            success: true,
            sessionId: 'hapi-session-1',
            codexSessionId: 'codex-thread-1',
            transcriptPath: '/home/me/.codex/sessions/thread.jsonl',
            importedMessages: 2,
            skippedMessages: 1
        })
    })
})
