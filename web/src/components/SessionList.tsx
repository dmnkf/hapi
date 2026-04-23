import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionSummary } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { useLongPress } from '@/hooks/useLongPress'
import { usePlatform } from '@/hooks/usePlatform'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { getSessionModelLabel } from '@/lib/sessionModelLabel'
import { useTranslation } from '@/lib/use-translation'

type SessionGroup = {
    key: string
    directory: string
    displayName: string
    pathSubtitle: string
    machineId: string | null
    sessions: SessionSummary[]
    latestUpdatedAt: number
    hasActiveSession: boolean
}

type StatusFilter = 'all' | 'active' | 'pending' | 'inactive'
type MachineFilter = 'all' | string

const FILTER_STORAGE_KEY = 'hapi:sessionFilter'
const MACHINE_FILTER_STORAGE_KEY = 'hapi:sessionMachineFilter'
const UNKNOWN_MACHINE_FILTER_KEY = '__unknown__'

const COMMON_LEAF_DIRS = new Set([
    'src', 'app', 'lib', 'bin', 'cmd', 'pkg', 'dist', 'build', 'out',
    'test', 'tests', 'spec', 'docs', 'scripts', 'config', 'public',
    'assets', 'static', 'resources', 'internal', 'packages', 'modules',
])

function getGroupDisplayName(directory: string): { name: string; subtitle: string } {
    if (directory === 'Other') return { name: directory, subtitle: '' }
    const parts = directory.split(/[\\/]+/).filter(Boolean)
    if (parts.length === 0) return { name: directory, subtitle: directory }
    if (parts.length === 1) return { name: parts[0], subtitle: directory }

    const last = parts[parts.length - 1]
    if (COMMON_LEAF_DIRS.has(last.toLowerCase()) && parts.length >= 2) {
        return { name: parts[parts.length - 2], subtitle: directory }
    }
    return { name: last, subtitle: directory }
}

export const UNKNOWN_MACHINE_ID = '__unknown__'

export function deduplicateSessionsByAgentId(
    sessions: SessionSummary[],
    selectedSessionId?: string | null
): SessionSummary[] {
    const byAgentId = new Map<string, SessionSummary[]>()
    const result: SessionSummary[] = []

    for (const session of sessions) {
        const agentId = session.metadata?.agentSessionId
        if (!agentId) {
            result.push(session)
            continue
        }
        const group = byAgentId.get(agentId)
        if (group) {
            group.push(session)
        } else {
            byAgentId.set(agentId, [session])
        }
    }

    for (const group of byAgentId.values()) {
        group.sort((a, b) => {
            if (a.active !== b.active) return a.active ? -1 : 1
            if (a.id === selectedSessionId) return -1
            if (b.id === selectedSessionId) return 1
            return b.updatedAt - a.updatedAt
        })
        result.push(group[0])
    }

    return result
}

function getGroupingPath(session: SessionSummary): string {
    return (
        session.metadata?.worktree?.worktreePath
        ?? session.metadata?.path
        ?? session.metadata?.worktree?.basePath
        ?? 'Other'
    )
}

function groupSessionsByDirectory(sessions: SessionSummary[]): SessionGroup[] {
    const groups = new Map<string, { directory: string; machineId: string | null; sessions: SessionSummary[] }>()

    sessions.forEach(session => {
        const path = getGroupingPath(session)
        const machineId = session.metadata?.machineId ?? null
        const key = `${machineId ?? UNKNOWN_MACHINE_ID}::${path}`
        if (!groups.has(key)) {
            groups.set(key, {
                directory: path,
                machineId,
                sessions: []
            })
        }
        groups.get(key)!.sessions.push(session)
    })

    return Array.from(groups.entries())
        .map(([key, group]) => {
            const sortedSessions = [...group.sessions].sort((a, b) => {
                const rankA = a.active ? (a.pendingRequestsCount > 0 ? 0 : 1) : 2
                const rankB = b.active ? (b.pendingRequestsCount > 0 ? 0 : 1) : 2
                if (rankA !== rankB) return rankA - rankB
                return b.updatedAt - a.updatedAt
            })
            const latestUpdatedAt = group.sessions.reduce(
                (max, s) => (s.updatedAt > max ? s.updatedAt : max),
                -Infinity
            )
            const hasActiveSession = group.sessions.some(s => s.active)
            const worktree = group.sessions[0]?.metadata?.worktree
            const allShareWorktree = worktree
                ? group.sessions.every(s => s.metadata?.worktree?.worktreePath === worktree.worktreePath)
                : false
            const { name: baseName, subtitle } = getGroupDisplayName(group.directory)
            const displayName = allShareWorktree && worktree
                ? (worktree.name || worktree.branch || baseName)
                : baseName

            return {
                key,
                directory: group.directory,
                displayName,
                pathSubtitle: subtitle,
                machineId: group.machineId,
                sessions: sortedSessions,
                latestUpdatedAt,
                hasActiveSession
            }
        })
        .sort((a, b) => {
            if (a.hasActiveSession !== b.hasActiveSession) {
                return a.hasActiveSession ? -1 : 1
            }
            return b.latestUpdatedAt - a.latestUpdatedAt
        })
}

// --- Icons ---

function PlusIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    )
}

function ChevronIcon(props: { className?: string; collapsed?: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`${props.className ?? ''} transition-transform duration-200 ${props.collapsed ? '' : 'rotate-90'}`}
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

function SearchIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    )
}

function MachineIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
    )
}

// --- Helpers ---

function getSessionTitle(session: SessionSummary): string {
    if (session.metadata?.name) {
        return session.metadata.name
    }
    if (session.metadata?.summary?.text) {
        return session.metadata.summary.text
    }
    if (session.metadata?.path) {
        const parts = session.metadata.path.split('/').filter(Boolean)
        return parts.length > 0 ? parts[parts.length - 1] : session.id.slice(0, 8)
    }
    return session.id.slice(0, 8)
}

function getSessionSubtitle(session: SessionSummary, title: string): string | null {
    const summary = session.metadata?.summary?.text
    if (summary && summary !== title) return summary
    const modelLabel = getSessionModelLabel(session)
    if (modelLabel) return modelLabel.value
    return null
}

function getAgentLabel(session: SessionSummary): string {
    const flavor = session.metadata?.flavor?.trim()
    if (flavor) return flavor
    return 'unknown'
}

const AGENT_COLORS: Record<string, string> = {
    claude: '#a855f7',
    codex: '#22c55e',
    gemini: '#3b82f6',
    cursor: '#f97316',
    opencode: '#6b7280',
}

function getAgentColor(session: SessionSummary): string {
    const label = getAgentLabel(session).toLowerCase()
    for (const [agent, color] of Object.entries(AGENT_COLORS)) {
        if (label.includes(agent)) return color
    }
    return '#6b7280'
}

function formatRelativeTime(value: number, t: (key: string, params?: Record<string, string | number>) => string): string | null {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value
    if (!Number.isFinite(ms)) return null
    const delta = Date.now() - ms
    if (delta < 60_000) return t('session.time.justNow')
    const minutes = Math.floor(delta / 60_000)
    if (minutes < 60) return t('session.time.minutesAgo', { n: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('session.time.hoursAgo', { n: hours })
    const days = Math.floor(hours / 24)
    if (days < 7) return t('session.time.daysAgo', { n: days })
    return new Date(ms).toLocaleDateString()
}

function matchesSearch(session: SessionSummary, query: string): boolean {
    const q = query.toLowerCase()
    const fields = [
        session.metadata?.name,
        session.metadata?.summary?.text,
        session.metadata?.path,
        session.metadata?.flavor,
        session.model,
    ]
    return fields.some(f => f && f.toLowerCase().includes(q))
}

function matchesFilter(session: SessionSummary, filter: StatusFilter): boolean {
    switch (filter) {
        case 'all': return true
        case 'active': return session.active
        case 'pending': return session.pendingRequestsCount > 0
        case 'inactive': return !session.active
    }
}

function loadSavedFilter(): StatusFilter {
    try {
        const stored = localStorage.getItem(FILTER_STORAGE_KEY)
        if (stored === 'active' || stored === 'pending' || stored === 'inactive' || stored === 'all') {
            return stored
        }
    } catch { /* ignore */ }
    return 'all'
}

// --- Machine Filter Bar ---

type MachineEntry = { id: string | null; label: string; count: number }

function MachineFilterBar(props: {
    machines: MachineEntry[]
    filter: MachineFilter
    totalCount: number
    onFilterChange: (f: MachineFilter) => void
}) {
    const { machines, filter, totalCount, onFilterChange } = props
    const { t } = useTranslation()

    const chips: { key: MachineFilter; label: string; count: number }[] = [
        { key: 'all', label: t('sessions.machine.all'), count: totalCount },
        ...machines.map(m => ({
            key: (m.id ?? UNKNOWN_MACHINE_FILTER_KEY) as MachineFilter,
            label: m.label,
            count: m.count,
        })),
    ]

    return (
        <div className="flex gap-2 overflow-x-auto px-3 py-2 scrollbar-none">
            {chips.map(chip => {
                const isSelected = filter === chip.key
                return (
                    <button
                        key={chip.key}
                        type="button"
                        onClick={() => onFilterChange(chip.key)}
                        title={chip.label}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors max-w-[220px] ${
                            isSelected
                                ? 'bg-[var(--app-fg)] text-[var(--app-bg)]'
                                : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)] hover:bg-[var(--app-secondary-bg)]'
                        }`}
                    >
                        <span className="truncate">{chip.label}</span>
                        <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none shrink-0 ${
                            isSelected
                                ? 'bg-[var(--app-bg)] text-[var(--app-fg)]'
                                : 'bg-[var(--app-border)] text-[var(--app-hint)]'
                        }`}>
                            {chip.count}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

// --- Filter Bar ---

function FilterBar(props: {
    sessions: SessionSummary[]
    filter: StatusFilter
    onFilterChange: (f: StatusFilter) => void
}) {
    const { sessions, filter, onFilterChange } = props
    const { t } = useTranslation()

    const counts = useMemo(() => ({
        all: sessions.length,
        active: sessions.filter(s => s.active).length,
        pending: sessions.filter(s => s.pendingRequestsCount > 0).length,
        inactive: sessions.filter(s => !s.active).length,
    }), [sessions])

    const chips: { key: StatusFilter; label: string }[] = [
        { key: 'all', label: t('sessions.filter.all') },
        { key: 'active', label: t('sessions.filter.active') },
        { key: 'pending', label: t('sessions.filter.pending') },
        { key: 'inactive', label: t('sessions.filter.inactive') },
    ]

    return (
        <div className="flex gap-2 overflow-x-auto px-3 py-2 scrollbar-none">
            {chips.map(chip => {
                const isSelected = filter === chip.key
                const count = counts[chip.key]
                return (
                    <button
                        key={chip.key}
                        type="button"
                        onClick={() => onFilterChange(chip.key)}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            isSelected
                                ? 'bg-[var(--app-fg)] text-[var(--app-bg)]'
                                : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)] hover:bg-[var(--app-secondary-bg)]'
                        }`}
                    >
                        {chip.label}
                        <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none ${
                            isSelected
                                ? 'bg-[var(--app-bg)] text-[var(--app-fg)]'
                                : 'bg-[var(--app-border)] text-[var(--app-hint)]'
                        }`}>
                            {count}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

// --- Swipe Hook ---

const SWIPE_THRESHOLD = 50
const SWIPE_ACTION_WIDTH = 140

function useSwipeReveal() {
    const containerRef = useRef<HTMLDivElement>(null)
    const startXRef = useRef(0)
    const startYRef = useRef(0)
    const currentOffsetRef = useRef(0)
    const isSwipingRef = useRef(false)
    const [offset, setOffset] = useState(0)
    const [revealed, setRevealed] = useState(false)

    const resetSwipe = useCallback(() => {
        setOffset(0)
        setRevealed(false)
        currentOffsetRef.current = 0
    }, [])

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const touch = e.touches[0]
        startXRef.current = touch.clientX
        startYRef.current = touch.clientY
        isSwipingRef.current = false
    }, [])

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        const touch = e.touches[0]
        const dx = touch.clientX - startXRef.current
        const dy = touch.clientY - startYRef.current

        // If vertical movement is dominant, don't swipe
        if (!isSwipingRef.current && Math.abs(dy) > Math.abs(dx)) return

        const base = revealed ? -SWIPE_ACTION_WIDTH : 0
        const raw = base + dx
        // Clamp: can't swipe right past 0, max left is action width + small overshoot
        const clamped = Math.max(-(SWIPE_ACTION_WIDTH + 20), Math.min(0, raw))

        if (Math.abs(dx) > 10) {
            isSwipingRef.current = true
        }

        if (isSwipingRef.current) {
            setOffset(clamped)
            currentOffsetRef.current = clamped
        }
    }, [revealed])

    const handleTouchEnd = useCallback(() => {
        if (!isSwipingRef.current) return

        const finalOffset = currentOffsetRef.current

        if (revealed) {
            // Already revealed: if swiped back past half, close
            if (finalOffset > -SWIPE_THRESHOLD) {
                resetSwipe()
            } else {
                setOffset(-SWIPE_ACTION_WIDTH)
                currentOffsetRef.current = -SWIPE_ACTION_WIDTH
            }
        } else {
            // Not revealed: if swiped past threshold, reveal
            if (finalOffset < -SWIPE_THRESHOLD) {
                setOffset(-SWIPE_ACTION_WIDTH)
                currentOffsetRef.current = -SWIPE_ACTION_WIDTH
                setRevealed(true)
            } else {
                resetSwipe()
            }
        }

        isSwipingRef.current = false
    }, [revealed, resetSwipe])

    return {
        containerRef,
        offset,
        revealed,
        resetSwipe,
        isSwipingRef,
        handlers: {
            onTouchStart: handleTouchStart,
            onTouchMove: handleTouchMove,
            onTouchEnd: handleTouchEnd,
        },
    }
}

// --- Swipe Action Icons ---

function ArchiveIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <rect x="2" y="3" width="20" height="5" rx="1" />
            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
            <path d="M10 12h4" />
        </svg>
    )
}

function TrashIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
    )
}

// --- Session Item ---

function SessionItem(props: {
    session: SessionSummary
    onSelect: (sessionId: string) => void
    api: ApiClient | null
    selected?: boolean
}) {
    const { t } = useTranslation()
    const { session: s, onSelect, api, selected = false } = props
    const { haptic } = usePlatform()
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuAnchorPoint, setMenuAnchorPoint] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
    const [renameOpen, setRenameOpen] = useState(false)
    const [archiveOpen, setArchiveOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)

    const { archiveSession, renameSession, deleteSession, isPending } = useSessionActions(
        api,
        s.id,
        s.metadata?.flavor ?? null
    )

    const swipe = useSwipeReveal()

    const longPressHandlers = useLongPress({
        onLongPress: (point) => {
            if (swipe.isSwipingRef.current) return
            haptic.impact('medium')
            setMenuAnchorPoint(point)
            setMenuOpen(true)
        },
        onClick: () => {
            if (swipe.isSwipingRef.current) return
            if (swipe.revealed) {
                swipe.resetSwipe()
                return
            }
            if (!menuOpen) {
                onSelect(s.id)
            }
        },
        threshold: 500
    })

    const sessionName = getSessionTitle(s)
    const subtitle = getSessionSubtitle(s, sessionName)
    const agentColor = getAgentColor(s)
    const agentLabel = getAgentLabel(s)

    return (
        <>
            <div
                ref={swipe.containerRef}
                className="relative overflow-hidden"
                {...swipe.handlers}
            >
                {/* Swipe action buttons (behind the card) */}
                <div
                    className="absolute inset-y-0 right-0 flex"
                    style={{ width: SWIPE_ACTION_WIDTH }}
                >
                    <button
                        type="button"
                        onClick={() => {
                            swipe.resetSwipe()
                            setArchiveOpen(true)
                        }}
                        className="flex flex-1 flex-col items-center justify-center gap-1 bg-[var(--app-badge-warning-text)] text-white text-[11px] font-medium"
                    >
                        <ArchiveIcon />
                        {t('session.action.archive')}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            swipe.resetSwipe()
                            setDeleteOpen(true)
                        }}
                        className="flex flex-1 flex-col items-center justify-center gap-1 bg-red-500 text-white text-[11px] font-medium"
                    >
                        <TrashIcon />
                        {t('session.action.delete')}
                    </button>
                </div>

                {/* Sliding foreground card */}
                <button
                    type="button"
                    {...longPressHandlers}
                    className={`session-list-item relative z-[1] flex w-full flex-col gap-1 px-3 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)] select-none bg-[var(--app-bg)] ${selected ? 'bg-[var(--app-secondary-bg)] ring-1 ring-inset ring-[var(--app-border)]' : ''}`}
                    style={{
                        WebkitTouchCallout: 'none',
                        transform: `translateX(${swipe.offset}px)`,
                        transition: swipe.offset === 0 || swipe.offset === -SWIPE_ACTION_WIDTH ? 'transform 150ms ease-out' : 'none',
                    }}
                    aria-current={selected ? 'page' : undefined}
                >
                    {/* Row 1: agent badge + title + right-side indicators */}
    {/* Row 1: agent dot + title + time + status */}
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: agentColor }}
                                title={agentLabel}
                            />
                            <span className="truncate text-sm font-medium">
                                {sessionName}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-xs">
                            {s.thinking ? (
                                <span className="text-[var(--app-accent-blue)] animate-pulse font-medium">
                                    {t('session.item.thinking')}
                                </span>
                            ) : null}
                            {s.pendingRequestsCount > 0 ? (
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--app-badge-warning-text)] px-1.5 text-[10px] font-bold leading-none text-white">
                                    {s.pendingRequestsCount}
                                </span>
                            ) : null}
                            <span className="text-[var(--app-hint)]">
                                {formatRelativeTime(s.updatedAt, t)}
                            </span>
                        </div>
                    </div>

                    {/* Row 2: subtitle + inline metadata */}
                    {subtitle ? (
                        <div className="truncate pl-[18px] text-xs text-[var(--app-hint)]">
                            {subtitle}
                        </div>
                    ) : null}
                </button>
            </div>

            <SessionActionMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                sessionActive={s.active}
                onRename={() => setRenameOpen(true)}
                onArchive={() => setArchiveOpen(true)}
                onDelete={() => setDeleteOpen(true)}
                anchorPoint={menuAnchorPoint}
            />

            <RenameSessionDialog
                isOpen={renameOpen}
                onClose={() => setRenameOpen(false)}
                currentName={sessionName}
                onRename={renameSession}
                isPending={isPending}
            />

            <ConfirmDialog
                isOpen={archiveOpen}
                onClose={() => setArchiveOpen(false)}
                title={t('dialog.archive.title')}
                description={t('dialog.archive.description', { name: sessionName })}
                confirmLabel={t('dialog.archive.confirm')}
                confirmingLabel={t('dialog.archive.confirming')}
                onConfirm={archiveSession}
                isPending={isPending}
                destructive
            />

            <ConfirmDialog
                isOpen={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                title={t('dialog.delete.title')}
                description={t('dialog.delete.description', { name: sessionName })}
                confirmLabel={t('dialog.delete.confirm')}
                confirmingLabel={t('dialog.delete.confirming')}
                onConfirm={deleteSession}
                isPending={isPending}
                destructive
            />
        </>
    )
}

// --- Main Component ---

export function SessionList(props: {
    sessions: SessionSummary[]
    onSelect: (sessionId: string) => void
    onNewSession: () => void
    onRefresh: () => void
    isLoading: boolean
    renderHeader?: boolean
    api: ApiClient | null
    machineLabelsById?: Record<string, string>
    selectedSessionId?: string | null
}) {
    const { t } = useTranslation()
    const { renderHeader = true, api, selectedSessionId, machineLabelsById = {} } = props

    // --- Filter state ---
    const [filter, setFilter] = useState<StatusFilter>(loadSavedFilter)
    const handleFilterChange = (f: StatusFilter) => {
        setFilter(f)
        try { localStorage.setItem(FILTER_STORAGE_KEY, f) } catch { /* ignore */ }
    }

    // --- Machine filter state ---
    const [machineFilter, setMachineFilter] = useState<MachineFilter>(() => {
        try {
            const stored = localStorage.getItem(MACHINE_FILTER_STORAGE_KEY)
            return stored && stored.length > 0 ? stored : 'all'
        } catch { return 'all' }
    })
    const handleMachineFilterChange = (f: MachineFilter) => {
        setMachineFilter(f)
        try { localStorage.setItem(MACHINE_FILTER_STORAGE_KEY, f) } catch { /* ignore */ }
    }

    const resolveMachineLabel = (machineId: string | null): string => {
        if (machineId && machineLabelsById[machineId]) {
            return machineLabelsById[machineId]
        }
        if (machineId) {
            return machineId.slice(0, 8)
        }
        return t('machine.unknown')
    }

    // Derive machines present in the session list (ignoring current machine filter so
    // all options stay visible and counts reflect the unfiltered picture).
    const machineEntries = useMemo<MachineEntry[]>(() => {
        const counts = new Map<string | null, number>()
        for (const s of props.sessions) {
            const id = s.metadata?.machineId ?? null
            counts.set(id, (counts.get(id) ?? 0) + 1)
        }
        return [...counts.entries()]
            .map(([id, count]) => ({ id, label: resolveMachineLabel(id), count }))
            .sort((a, b) => b.count - a.count)
    }, [props.sessions, machineLabelsById, t])

    // If the stored filter references a machine no longer present, reset to 'all'.
    useEffect(() => {
        if (machineFilter === 'all') return
        const ids = new Set(machineEntries.map(m => m.id ?? UNKNOWN_MACHINE_FILTER_KEY))
        if (!ids.has(machineFilter)) {
            handleMachineFilterChange('all')
        }
    }, [machineEntries, machineFilter])

    // --- Search state ---
    const [searchQuery, setSearchQuery] = useState('')

    // --- Filtered sessions ---
    const filteredSessions = useMemo(() => {
        let result = props.sessions
        if (machineFilter !== 'all') {
            const target = machineFilter === UNKNOWN_MACHINE_FILTER_KEY ? null : machineFilter
            result = result.filter(s => (s.metadata?.machineId ?? null) === target)
        }
        if (filter !== 'all') {
            result = result.filter(s => matchesFilter(s, filter))
        }
        if (searchQuery.trim()) {
            result = result.filter(s => matchesSearch(s, searchQuery.trim()))
        }
        return result
    }, [props.sessions, filter, searchQuery, machineFilter])

    const groups = useMemo(
        () => groupSessionsByDirectory(deduplicateSessionsByAgentId(filteredSessions, selectedSessionId)),
        [filteredSessions, selectedSessionId]
    )
    const [collapseOverrides, setCollapseOverrides] = useState<Map<string, boolean>>(
        () => new Map()
    )
    const isGroupCollapsed = (group: SessionGroup): boolean => {
        const override = collapseOverrides.get(group.key)
        if (override !== undefined) return override
        const hasSelectedSession = selectedSessionId
            ? group.sessions.some(session => session.id === selectedSessionId)
            : false
        return !group.hasActiveSession && !hasSelectedSession
    }

    const toggleGroup = (groupKey: string, isCollapsed: boolean) => {
        setCollapseOverrides(prev => {
            const next = new Map(prev)
            next.set(groupKey, !isCollapsed)
            return next
        })
    }

    useEffect(() => {
        if (!selectedSessionId) return
        setCollapseOverrides(prev => {
            const group = groups.find(g =>
                g.sessions.some(s => s.id === selectedSessionId)
            )
            if (!group || !prev.has(group.key) || !prev.get(group.key)) return prev
            const next = new Map(prev)
            next.delete(group.key)
            return next
        })
    }, [selectedSessionId, groups])

    useEffect(() => {
        setCollapseOverrides(prev => {
            if (prev.size === 0) return prev
            const next = new Map(prev)
            const knownGroups = new Set(groups.map(group => group.key))
            let changed = false
            for (const groupKey of next.keys()) {
                if (!knownGroups.has(groupKey)) {
                    next.delete(groupKey)
                    changed = true
                }
            }
            return changed ? next : prev
        })
    }, [groups])

    return (
        <div className="mx-auto w-full max-w-content flex flex-col">
            {renderHeader ? (
                <div className="flex items-center justify-between px-3 py-1">
                    <div className="text-xs text-[var(--app-hint)]">
                        {t('sessions.count', { n: props.sessions.length, m: groups.length })}
                    </div>
                    <button
                        type="button"
                        onClick={props.onNewSession}
                        className="session-list-new-button p-1.5 rounded-full text-[var(--app-link)] transition-colors"
                        title={t('sessions.new')}
                    >
                        <PlusIcon className="h-5 w-5" />
                    </button>
                </div>
            ) : null}

            {/* Machine filter bar — only when >1 machine has sessions */}
            {machineEntries.length > 1 ? (
                <MachineFilterBar
                    machines={machineEntries}
                    filter={machineFilter}
                    totalCount={props.sessions.length}
                    onFilterChange={handleMachineFilterChange}
                />
            ) : null}

            {/* Filter bar */}
            <FilterBar
                sessions={props.sessions}
                filter={filter}
                onFilterChange={handleFilterChange}
            />

            {/* Search bar */}
            <div className="relative px-3 pb-2">
                <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--app-hint)] pointer-events-none" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={t('sessions.search')}
                    className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] py-1.5 pl-8 pr-3 text-sm text-[var(--app-fg)] placeholder-[var(--app-hint)] outline-none focus:ring-1 focus:ring-[var(--app-link)] transition-colors"
                />
            </div>

            {/* Skeleton loading */}
            {props.isLoading && props.sessions.length === 0 ? (
                <div className="flex flex-col gap-3 px-3 py-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex flex-col gap-2 py-3">
                            <div className="flex items-center gap-2.5">
                                <div className="skeleton h-5 w-14 rounded-full" />
                                <div className="skeleton h-4 flex-1 max-w-[200px]" />
                            </div>
                            <div className="skeleton h-3 ml-8 w-3/4" />
                            <div className="skeleton h-1 ml-8 w-1/2 rounded-full" />
                        </div>
                    ))}
                </div>
            ) : null}

            {/* Empty state */}
            {!props.isLoading && filteredSessions.length === 0 && props.sessions.length > 0 ? (
                <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                    <SearchIcon className="h-8 w-8 text-[var(--app-hint)] opacity-40" />
                    <p className="text-sm text-[var(--app-hint)]">{t('sessions.noResults')}</p>
                </div>
            ) : null}

            {/* Session groups */}
            <div className="flex flex-col">
                {groups.map((group) => {
                    const isCollapsed = isGroupCollapsed(group)
                    const machineLabel = resolveMachineLabel(group.machineId)
                    const statusDotColor = group.hasActiveSession
                        ? 'bg-[var(--app-badge-success-text)]'
                        : 'bg-[var(--app-hint)]'
                    return (
                        <div key={group.key} className="mt-2 first:mt-0">
                            <button
                                type="button"
                                onClick={() => toggleGroup(group.key, isCollapsed)}
                                className="glass-bar sticky top-0 z-10 flex w-full flex-col gap-0.5 px-3 py-1.5 text-left border-b border-[var(--app-divider)] transition-colors hover:bg-[var(--app-subtle-bg)]"
                            >
                                <div className="flex items-center gap-2 min-w-0 w-full">
                                    <ChevronIcon
                                        className="h-4 w-4 text-[var(--app-hint)] shrink-0"
                                        collapsed={isCollapsed}
                                    />
                                    <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColor}`} />
                                    <span className="font-semibold text-sm break-words min-w-0" title={group.directory}>
                                        {group.displayName}
                                    </span>
                                    <span className="shrink-0 rounded-full bg-[var(--app-subtle-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-hint)]">
                                        {group.sessions.length}
                                    </span>
                                </div>
                                <div className="flex min-w-0 w-full items-center gap-2 pl-6 text-[11px] text-[var(--app-hint)]">
                                    <span className="inline-flex items-center gap-1">
                                        <MachineIcon className="h-3 w-3 shrink-0" />
                                        {machineLabel}
                                    </span>
                                    {group.pathSubtitle && group.pathSubtitle !== group.displayName ? (
                                        <>
                                            <span className="text-[var(--app-border)]">|</span>
                                            <span className="min-w-0 truncate" title={group.pathSubtitle}>
                                                {group.pathSubtitle}
                                            </span>
                                        </>
                                    ) : null}
                                </div>
                            </button>
                            <div
                                className="session-group-content"
                                data-collapsed={isCollapsed}
                            >
                                <div className="session-group-inner">
                                    <div className="flex flex-col gap-px">
                                        {group.sessions.map((s) => (
                                            <SessionItem
                                                key={s.id}
                                                session={s}
                                                onSelect={props.onSelect}
                                                api={api}
                                                selected={s.id === selectedSessionId}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
