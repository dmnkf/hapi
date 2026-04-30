import type { AgentState } from '@/types/api'
import type { ChatBlock, ChatToolCall, ToolCallBlock } from '@/chat/types'
import { getInputStringAny, truncate } from '@/lib/toolInputUtils'

export type ActivityApprovalItem = {
    kind: 'approval'
    id: string
    tool: ChatToolCall
    title: string
    subtitle: string | null
    filePath: string | null
    targetToolId: string | null
    createdAt: number
}

export type ActivityToolItem = {
    kind: 'tool'
    id: string
    state: ChatToolCall['state']
    toolName: string
    title: string
    subtitle: string | null
    filePath: string | null
    targetToolId: string
    createdAt: number
}

export type ActivityFileItem = {
    path: string
    action: string
    toolName: string
    targetToolId: string
    updatedAt: number
}

export type SessionActivity = {
    approvals: ActivityApprovalItem[]
    runningTools: ActivityToolItem[]
    recentTools: ActivityToolItem[]
    files: ActivityFileItem[]
}

function flattenToolBlocks(blocks: readonly ChatBlock[], rootToolId: string | null = null): Array<{ block: ToolCallBlock; targetToolId: string }> {
    const result: Array<{ block: ToolCallBlock; targetToolId: string }> = []

    for (const block of blocks) {
        if (block.kind !== 'tool-call') continue
        const targetToolId = rootToolId ?? block.id
        result.push({ block, targetToolId })
        result.push(...flattenToolBlocks(block.children, targetToolId))
    }

    return result
}

function getFilePath(input: unknown): string | null {
    return getInputStringAny(input, [
        'file_path',
        'path',
        'full_path',
        'fullPath',
        'relative_path',
        'relativePath'
    ])
}

function getToolSubtitle(tool: ChatToolCall): string | null {
    const filePath = getFilePath(tool.input)
    if (filePath) return filePath
    if (tool.description) return truncate(tool.description, 120)
    return null
}

function getToolTitle(tool: ChatToolCall): string {
    if (tool.description) return truncate(tool.description, 72)
    return tool.name
}

function getFileAction(toolName: string): string {
    const normalized = toolName.toLowerCase()
    if (normalized.includes('edit') || normalized.includes('write')) return 'Modified'
    if (normalized.includes('read') || normalized.includes('open')) return 'Read'
    if (normalized.includes('grep') || normalized.includes('glob') || normalized.includes('search')) return 'Searched'
    return 'Touched'
}

function toToolItem(block: ToolCallBlock, targetToolId: string): ActivityToolItem {
    return {
        kind: 'tool',
        id: block.id,
        state: block.tool.state,
        toolName: block.tool.name,
        title: getToolTitle(block.tool),
        subtitle: getToolSubtitle(block.tool),
        filePath: getFilePath(block.tool.input),
        targetToolId,
        createdAt: block.tool.createdAt
    }
}

function toApprovalItem(block: ToolCallBlock, targetToolId: string): ActivityApprovalItem | null {
    const permission = block.tool.permission
    if (!permission || permission.status !== 'pending') return null

    return {
        kind: 'approval',
        id: permission.id,
        tool: block.tool,
        title: getToolTitle(block.tool),
        subtitle: getToolSubtitle(block.tool),
        filePath: getFilePath(block.tool.input),
        targetToolId,
        createdAt: permission.createdAt ?? block.tool.createdAt
    }
}

export function buildSessionActivity(blocks: readonly ChatBlock[], agentState: AgentState | null | undefined): SessionActivity {
    const flattened = flattenToolBlocks(blocks)
    const approvals: ActivityApprovalItem[] = []
    const runningTools: ActivityToolItem[] = []
    const recentTools: ActivityToolItem[] = []
    const filesByPath = new Map<string, ActivityFileItem>()
    const seenApprovalIds = new Set<string>()

    for (const { block, targetToolId } of flattened) {
        const approval = toApprovalItem(block, targetToolId)
        if (approval) {
            approvals.push(approval)
            seenApprovalIds.add(approval.id)
        }

        if ((block.tool.state === 'running' || block.tool.state === 'pending') && !approval) {
            runningTools.push(toToolItem(block, targetToolId))
        } else if (block.tool.state === 'completed' || block.tool.state === 'error') {
            recentTools.push(toToolItem(block, targetToolId))
        }

        const filePath = getFilePath(block.tool.input)
        if (filePath) {
            const existing = filesByPath.get(filePath)
            const next: ActivityFileItem = {
                path: filePath,
                action: getFileAction(block.tool.name),
                toolName: block.tool.name,
                targetToolId,
                updatedAt: block.tool.completedAt ?? block.tool.createdAt
            }
            if (!existing || next.updatedAt >= existing.updatedAt) {
                filesByPath.set(filePath, next)
            }
        }
    }

    const requests = agentState?.requests ?? null
    if (requests) {
        for (const [id, request] of Object.entries(requests)) {
            if (seenApprovalIds.has(id)) continue
            const tool: ChatToolCall = {
                id,
                name: request.tool,
                state: 'pending',
                input: request.arguments,
                createdAt: request.createdAt ?? Date.now(),
                startedAt: null,
                completedAt: null,
                description: null,
                permission: {
                    id,
                    status: 'pending',
                    createdAt: request.createdAt ?? null
                }
            }
            approvals.push({
                kind: 'approval',
                id,
                tool,
                title: getToolTitle(tool),
                subtitle: getToolSubtitle(tool),
                filePath: getFilePath(tool.input),
                targetToolId: null,
                createdAt: request.createdAt ?? Date.now()
            })
        }
    }

    return {
        approvals: approvals.sort((a, b) => a.createdAt - b.createdAt),
        runningTools: runningTools.sort((a, b) => b.createdAt - a.createdAt),
        recentTools: recentTools.sort((a, b) => b.createdAt - a.createdAt).slice(0, 8),
        files: [...filesByPath.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)
    }
}

export function getActivityQueueCount(activity: SessionActivity, backgroundTaskCount = 0): number {
    return activity.approvals.length + activity.runningTools.length + backgroundTaskCount
}
