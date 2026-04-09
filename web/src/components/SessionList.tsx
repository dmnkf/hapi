import { useEffect, useMemo, useState } from 'react'
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

const FILTER_STORAGE_KEY = 'hapi:sessionFilter'

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

function groupSessionsByDirectory(sessions: SessionSummary[]): SessionGroup[] {
    const groups = new Map<string, { directory: string; machineId: string | null; sessions: SessionSummary[] }>()

    sessions.forEach(session => {
        const path = session.metadata?.worktree?.basePath ?? session.metadata?.path ?? 'Other'
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
            const { name, subtitle } = getGroupDisplayName(group.directory)

            return {
                key,
                directory: group.directory,
                displayName: name,
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

function BulbIcon(props: { className?: string }) {
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
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M12 2a7 7 0 0 0-4 12c.6.6 1 1.2 1 2h6c0-.8.4-1.4 1-2a7 7 0 0 0-4-12Z" />
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

function getTodoProgress(session: SessionSummary): { completed: number; total: number } | null {
    if (!session.todoProgress) return null
    if (session.todoProgress.completed === session.todoProgress.total) return null
    return session.todoProgress
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

// --- Session Item ---

function SessionItem(props: {
    session: SessionSummary
    onSelect: (sessionId: string) => void
    showPath?: boolean
    api: ApiClient | null
    selected?: boolean
}) {
    const { t } = useTranslation()
    const { session: s, onSelect, showPath = true, api, selected = false } = props
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

    const longPressHandlers = useLongPress({
        onLongPress: (point) => {
            haptic.impact('medium')
            setMenuAnchorPoint(point)
            setMenuOpen(true)
        },
        onClick: () => {
            if (!menuOpen) {
                onSelect(s.id)
            }
        },
        threshold: 500
    })

    const sessionName = getSessionTitle(s)
    const subtitle = getSessionSubtitle(s, sessionName)
    const modelLabel = getSessionModelLabel(s)
    const agentColor = getAgentColor(s)
    const agentLabel = getAgentLabel(s)
    const todoProgress = getTodoProgress(s)
    const todoPercent = todoProgress ? Math.round((todoProgress.completed / todoProgress.total) * 100) : 0

    return (
        <>
            <button
                type="button"
                {...longPressHandlers}
                className={`session-list-item flex w-full flex-col gap-1 px-3 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)] select-none ${selected ? 'bg-[var(--app-secondary-bg)] ring-1 ring-inset ring-[var(--app-border)]' : ''}`}
                style={{ WebkitTouchCallout: 'none' }}
                aria-current={selected ? 'page' : undefined}
            >
                {/* Row 1: agent badge + title + right-side indicators */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span
                            className="flex h-5 shrink-0 items-center gap-1.5 rounded-full px-1.5 text-[10px] font-semibold leading-none text-white"
                            style={{ backgroundColor: agentColor }}
                            title={agentLabel}
                        >
                            <span
                                className={`h-1.5 w-1.5 rounded-full ${s.active ? 'bg-white' : 'bg-white/50'}`}
                            />
                            {agentLabel.length <= 10 ? agentLabel : null}
                        </span>
                        <span className="truncate text-sm font-medium">
                            {sessionName}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs">
                        {s.thinking ? (
                            <span className="text-[#007AFF] animate-pulse font-medium">
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

                {/* Row 2: subtitle (summary or model) */}
                {subtitle ? (
                    <div className="truncate pl-8 text-xs text-[var(--app-hint)]">
                        {subtitle}
                    </div>
                ) : null}

                {/* Row 3: inline todo progress bar */}
                {todoProgress ? (
                    <div className="flex items-center gap-2 pl-8">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--app-subtle-bg)]">
                            <div
                                className="h-full rounded-full bg-[#007AFF] transition-all duration-300"
                                style={{ width: `${todoPercent}%` }}
                            />
                        </div>
                        <span className="flex items-center gap-1 shrink-0 text-[10px] text-[var(--app-hint)]">
                            <BulbIcon className="h-3 w-3" />
                            {todoProgress.completed}/{todoProgress.total}
                        </span>
                    </div>
                ) : null}

                {/* Row 4: metadata chips */}
                {showPath ? (
                    <div className="truncate pl-8 text-xs text-[var(--app-hint)]">
                        {s.metadata?.path ?? s.id}
                    </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 text-xs text-[var(--app-hint)]">
                    {modelLabel ? (
                        <span>{t(modelLabel.key)}: {modelLabel.value}</span>
                    ) : null}
                    {s.metadata?.worktree?.branch ? (
                        <span>{t('session.item.worktree')}: {s.metadata.worktree.branch}</span>
                    ) : null}
                </div>
            </button>

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

    // --- Search state ---
    const [searchQuery, setSearchQuery] = useState('')

    // --- Filtered sessions ---
    const filteredSessions = useMemo(() => {
        let result = props.sessions
        if (filter !== 'all') {
            result = result.filter(s => matchesFilter(s, filter))
        }
        if (searchQuery.trim()) {
            result = result.filter(s => matchesSearch(s, searchQuery.trim()))
        }
        return result
    }, [props.sessions, filter, searchQuery])

    const groups = useMemo(
        () => groupSessionsByDirectory(filteredSessions),
        [filteredSessions]
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

    const resolveMachineLabel = (machineId: string | null): string => {
        if (machineId && machineLabelsById[machineId]) {
            return machineLabelsById[machineId]
        }
        if (machineId) {
            return machineId.slice(0, 8)
        }
        return t('machine.unknown')
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

            {/* Session groups */}
            <div className="flex flex-col">
                {groups.map((group) => {
                    const isCollapsed = isGroupCollapsed(group)
                    const machineLabel = resolveMachineLabel(group.machineId)
                    const borderColor = group.hasActiveSession
                        ? 'border-l-[var(--app-badge-success-text)]'
                        : 'border-l-[var(--app-hint)]'
                    return (
                        <div key={group.key} className="mt-2 first:mt-0">
                            <button
                                type="button"
                                onClick={() => toggleGroup(group.key, isCollapsed)}
                                className={`sticky top-0 z-10 flex w-full flex-col gap-0.5 px-3 py-2.5 text-left bg-[var(--app-secondary-bg)] border-b border-[var(--app-border)] border-l-[3px] ${borderColor} transition-colors hover:bg-[var(--app-subtle-bg)]`}
                            >
                                <div className="flex items-center gap-2 min-w-0 w-full">
                                    <ChevronIcon
                                        className="h-4 w-4 text-[var(--app-hint)] shrink-0"
                                        collapsed={isCollapsed}
                                    />
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
                            {!isCollapsed ? (
                                <div className="flex flex-col divide-y divide-[var(--app-divider)] border-b border-[var(--app-divider)] border-l border-l-[var(--app-divider)]">
                                    {group.sessions.map((s) => (
                                        <SessionItem
                                            key={s.id}
                                            session={s}
                                            onSelect={props.onSelect}
                                            showPath={false}
                                            api={api}
                                            selected={s.id === selectedSessionId}
                                        />
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
