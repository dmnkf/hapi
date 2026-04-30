import { describe, expect, it } from 'vitest'
import type { AgentState } from '@/types/api'
import type { ChatBlock, ChatToolCall, ToolCallBlock, ToolPermission } from '@/chat/types'
import { buildSessionActivity, getActivityQueueCount } from '@/chat/activity'

type ToolBlockOverrides = Omit<Partial<ToolCallBlock>, 'tool'> & {
    id: string
    name: string
    tool?: Partial<ChatToolCall>
}

function toolBlock(overrides: ToolBlockOverrides): ToolCallBlock {
    const permission = overrides.tool?.permission
    return {
        kind: 'tool-call',
        id: overrides.id,
        localId: null,
        createdAt: overrides.createdAt ?? 1000,
        children: overrides.children ?? [],
        tool: {
            id: overrides.id,
            name: overrides.name,
            state: overrides.tool?.state ?? 'completed',
            input: overrides.tool?.input ?? {},
            createdAt: overrides.tool?.createdAt ?? overrides.createdAt ?? 1000,
            startedAt: overrides.tool?.startedAt ?? null,
            completedAt: overrides.tool?.completedAt ?? null,
            description: overrides.tool?.description ?? null,
            result: overrides.tool?.result,
            permission
        }
    }
}

function pendingPermission(id: string): ToolPermission {
    return {
        id,
        status: 'pending',
        createdAt: 1200
    }
}

describe('buildSessionActivity', () => {
    it('collects pending approvals, active tools, recent tools, and touched files', () => {
        const blocks: ChatBlock[] = [
            toolBlock({
                id: 'edit-1',
                name: 'Edit',
                createdAt: 1000,
                tool: {
                    state: 'pending',
                    input: { file_path: '/repo/src/app.ts' },
                    permission: pendingPermission('perm-1')
                }
            }),
            toolBlock({
                id: 'bash-1',
                name: 'Bash',
                createdAt: 2000,
                tool: {
                    state: 'running',
                    input: { command: 'bun test' }
                }
            }),
            toolBlock({
                id: 'read-1',
                name: 'Read',
                createdAt: 3000,
                tool: {
                    state: 'completed',
                    input: { file_path: '/repo/src/app.ts' },
                    completedAt: 3200
                }
            })
        ]

        const activity = buildSessionActivity(blocks, null)

        expect(activity.approvals.map((item) => item.id)).toEqual(['perm-1'])
        expect(activity.runningTools.map((item) => item.id)).toEqual(['bash-1'])
        expect(activity.recentTools.map((item) => item.id)).toEqual(['read-1'])
        expect(activity.files).toEqual([
            expect.objectContaining({
                path: '/repo/src/app.ts',
                action: 'Read',
                targetToolId: 'read-1'
            })
        ])
        expect(getActivityQueueCount(activity, 2)).toBe(4)
    })

    it('adds agentState requests that are not represented by loaded tool blocks', () => {
        const agentState: AgentState = {
            requests: {
                'request-1': {
                    tool: 'Bash',
                    arguments: { command: 'git push' },
                    createdAt: 5000
                }
            }
        }

        const activity = buildSessionActivity([], agentState)

        expect(activity.approvals).toHaveLength(1)
        expect(activity.approvals[0]).toEqual(expect.objectContaining({
            id: 'request-1',
            targetToolId: null,
            title: 'Bash'
        }))
    })

    it('targets nested task children at the parent tool message', () => {
        const blocks: ChatBlock[] = [
            toolBlock({
                id: 'task-1',
                name: 'Task',
                children: [
                    toolBlock({
                        id: 'child-1',
                        name: 'Edit',
                        tool: {
                            state: 'pending',
                            input: { file_path: '/repo/child.ts' },
                            permission: pendingPermission('child-perm')
                        }
                    })
                ]
            })
        ]

        const activity = buildSessionActivity(blocks, null)

        expect(activity.approvals[0]).toEqual(expect.objectContaining({
            id: 'child-perm',
            targetToolId: 'task-1'
        }))
    })
})
