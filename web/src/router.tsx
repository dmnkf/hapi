import { useCallback, useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import { useTabSwipe } from '@/hooks/useTabSwipe'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { useQueryClient } from '@tanstack/react-query'
import {
    Navigate,
    Outlet,
    createRootRoute,
    createRoute,
    createRouter,
    useLocation,
    useMatchRoute,
    useNavigate,
    useParams,
} from '@tanstack/react-router'
import { App } from '@/App'
import { SessionChat } from '@/components/SessionChat'
import { SessionList } from '@/components/SessionList'
import { NewSession } from '@/components/NewSession'
import { WorkspaceBrowser } from '@/components/WorkspaceBrowser'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { startViewTransition } from '@/lib/viewTransition'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { isTelegramApp } from '@/hooks/useTelegram'
import { useMessages } from '@/hooks/queries/useMessages'
import { useMachines } from '@/hooks/queries/useMachines'
import { useSession } from '@/hooks/queries/useSession'
import { useSessions } from '@/hooks/queries/useSessions'
import { useSlashCommands } from '@/hooks/queries/useSlashCommands'
import { useSkills } from '@/hooks/queries/useSkills'
import { useSendMessage } from '@/hooks/mutations/useSendMessage'
import { queryKeys } from '@/lib/query-keys'
import { useToast } from '@/lib/toast-context'
import { useTranslation } from '@/lib/use-translation'
import { fetchLatestMessages, seedMessageWindowFromSession } from '@/lib/message-window-store'
import { clearDraftsAfterSend } from '@/lib/clearDraftsAfterSend'
import type { Machine } from '@/types/api'
import { FocusBanner } from '@/components/FocusBanner'
import { enterFocusQueue, syncFocusIndexToSession } from '@/lib/focusQueue'
import { useFocusQueue } from '@/hooks/useFocusQueue'
import FilesPage from '@/routes/sessions/files'
import FilePage from '@/routes/sessions/file'
import TerminalPage from '@/routes/sessions/terminal'
import SettingsPage from '@/routes/settings'

function BackIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

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

function FolderOpenIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
    )
}

function SettingsIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    )
}

function getMachineTitle(machine: Machine): string {
    if (machine.metadata?.displayName) return machine.metadata.displayName
    if (machine.metadata?.host) return machine.metadata.host
    return machine.id.slice(0, 8)
}

function SessionsPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const pathname = useLocation({ select: location => location.pathname })
    const matchRoute = useMatchRoute()
    const { t } = useTranslation()
    const { sessions, isLoading, error, refetch } = useSessions(api)
    const { machines } = useMachines(api, true)

    const handleRefresh = useCallback(() => {
        void refetch()
    }, [refetch])
    const sidebar = useSidebarResize()
    const {
        containerRef: pullRef,
        pullDistance,
        isRefreshing: isPullRefreshing,
        pastThreshold,
        indicatorHeight,
    } = usePullToRefresh(handleRefresh)

    const projectCount = useMemo(() => new Set(sessions.map(s =>
        s.metadata?.worktree?.basePath ?? s.metadata?.path ?? 'Other'
    )).size, [sessions])
    const stats = useMemo(() => {
        let active = 0
        let pending = 0
        let thinking = 0
        for (const s of sessions) {
            if (s.metadata?.archivedBy) continue
            if (s.active) active++
            if (s.pendingRequestsCount > 0) pending += s.pendingRequestsCount
            if (s.thinking) thinking++
        }
        const connectedMachines = machines.filter(m => m.active).length
        return { active, pending, thinking, connectedMachines }
    }, [sessions, machines])

    const enterFocus = useCallback(() => {
        let machineFilter: string | null = null
        try {
            const stored = localStorage.getItem('hapi:sessionMachineFilter')
            if (stored && stored !== 'all') machineFilter = stored
        } catch { /* ignore */ }

        const pendingIds = sessions
            .filter(s => s.pendingRequestsCount > 0 && !s.metadata?.archivedBy)
            .filter(s => {
                if (!machineFilter) return true
                const id = s.metadata?.machineId ?? '__unknown__'
                return id === machineFilter
            })
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(s => s.id)

        const first = enterFocusQueue(pendingIds)
        if (first) {
            startViewTransition(() =>
                navigate({
                    to: '/sessions/$sessionId',
                    params: { sessionId: first },
                    search: { focus: 1 },
                })
            )
        }
    }, [sessions, navigate])
    const machineLabelsById = useMemo(() => {
        const labels: Record<string, string> = {}
        for (const machine of machines) {
            labels[machine.id] = getMachineTitle(machine)
        }
        return labels
    }, [machines])
    const sessionMatch = matchRoute({ to: '/sessions/$sessionId', fuzzy: true })
    const selectedSessionId = sessionMatch && sessionMatch.sessionId !== 'new' ? sessionMatch.sessionId : null
    const isSessionsIndex = pathname === '/sessions' || pathname === '/sessions/'

    return (
        <div className="flex h-full min-h-0">
            <div
                className={`${isSessionsIndex ? 'flex' : 'hidden lg:flex'} w-full shrink-0 flex-col bg-[var(--app-bg)]`}
                style={{ '--sidebar-w': `${sidebar.width}px` } as CSSProperties}
            >
                <div className="glass-bar sticky top-0 z-20 border-b border-[var(--app-divider)] pt-[env(safe-area-inset-top)]">
                    <div className="mx-auto w-full max-w-content px-3 py-2">
                        <div className="flex items-center justify-between">
                            <div className="text-xs text-[var(--app-hint)]">
                                {t('sessions.count', { n: sessions.length, m: projectCount })}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => navigate({ to: '/browse' })}
                                    className="p-1.5 rounded-full text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                                    title={t('browse.nav')}
                                >
                                    <FolderOpenIcon className="h-5 w-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate({ to: '/settings' })}
                                    className="p-1.5 rounded-full text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                                    title={t('settings.title')}
                                >
                                    <SettingsIcon className="h-5 w-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate({ to: '/sessions/new' })}
                                    className="session-list-new-button p-1.5 rounded-full text-[var(--app-link)] transition-colors"
                                    title={t('sessions.new')}
                                >
                                    <PlusIcon className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                        {/* Dashboard summary */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                            {stats.active > 0 ? (
                                <span className="inline-flex items-center gap-1 text-[var(--app-badge-success-text)]">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--app-badge-success-text)]" />
                                    {t('dashboard.active', { n: stats.active })}
                                </span>
                            ) : null}
                            {stats.thinking > 0 ? (
                                <span className="inline-flex items-center gap-1 text-[var(--app-accent-blue)] animate-pulse">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--app-accent-blue)]" />
                                    {t('dashboard.thinking', { n: stats.thinking })}
                                </span>
                            ) : null}
                            {stats.pending > 0 ? (
                                <button
                                    type="button"
                                    onClick={enterFocus}
                                    title={t('focus.enter')}
                                    className="inline-flex items-center gap-1 rounded-full text-[var(--app-badge-warning-text)] transition-colors hover:bg-[var(--app-subtle-bg)] px-1.5 -mx-1.5 py-0.5"
                                >
                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--app-badge-warning-text)]" />
                                    {t('dashboard.pending', { n: stats.pending })}
                                </button>
                            ) : null}
                            <span className="inline-flex items-center gap-1 text-[var(--app-hint)]">
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                                {t('dashboard.machines', { n: stats.connectedMachines })}
                            </span>
                        </div>
                    </div>
                </div>

                <div ref={pullRef} className="app-scroll-y flex-1 min-h-0 desktop-scrollbar-left">
                    {/* Pull-to-refresh indicator */}
                    <div
                        className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
                        style={{
                            height: isPullRefreshing ? `${indicatorHeight}px` : `${pullDistance}px`,
                            transition: pullDistance === 0 || isPullRefreshing ? 'height 0.2s ease-out' : 'none',
                        }}
                    >
                        {(pullDistance > 0 || isPullRefreshing) && (
                            <svg
                                className={`h-5 w-5 text-[var(--app-hint)] ${isPullRefreshing ? 'animate-spin' : ''}`}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{
                                    transform: isPullRefreshing ? undefined : `rotate(${pastThreshold ? 180 : 0}deg)`,
                                    transition: 'transform 0.2s ease-out',
                                }}
                            >
                                {isPullRefreshing ? (
                                    <>
                                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                    </>
                                ) : (
                                    <>
                                        <polyline points="7 13 12 18 17 13" />
                                        <line x1="12" y1="6" x2="12" y2="18" />
                                    </>
                                )}
                            </svg>
                        )}
                    </div>
                    {error ? (
                        <div className="mx-auto w-full max-w-content px-3 py-2">
                            <div className="text-sm text-red-600">{error}</div>
                        </div>
                    ) : null}
                    <SessionList
                        sessions={sessions}
                        selectedSessionId={selectedSessionId}
                        onSelect={(sessionId) => startViewTransition(() => navigate({
                            to: '/sessions/$sessionId',
                            params: { sessionId },
                        }))}
                        onNewSession={() => navigate({ to: '/sessions/new' })}
                        onBrowse={() => navigate({ to: '/browse' })}
                        onRefresh={handleRefresh}
                        isLoading={isLoading}
                        renderHeader={false}
                        api={api}
                        machineLabelsById={machineLabelsById}
                    />
                </div>
            </div>

            {/* Resize handle - desktop only */}
            <div
                className="sidebar-resize-handle hidden lg:block shrink-0"
                data-dragging={sidebar.isDragging || undefined}
                onPointerDown={sidebar.onPointerDown}
            />

            <div className={`${isSessionsIndex ? 'hidden lg:flex' : 'flex'} min-w-0 flex-1 flex-col bg-[var(--app-bg)]`}>
                <div className="flex-1 min-h-0">
                    <Outlet />
                </div>
            </div>
        </div>
    )
}

function SessionsIndexPage() {
    return null
}

function SessionPage(props: { view: 'activity' | 'chat' }) {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const goBack = useAppGoBack()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const { sessionId } = useParams({ from: '/sessions/$sessionId' })
    const {
        session,
        refetch: refetchSession,
    } = useSession(api, sessionId)
    const {
        messages,
        warning: messagesWarning,
        isLoading: messagesLoading,
        isLoadingMore: messagesLoadingMore,
        hasMore: messagesHasMore,
        loadMore: loadMoreMessages,
        refetch: refetchMessages,
        pendingCount,
        messagesVersion,
        flushPending,
        setAtBottom,
    } = useMessages(api, sessionId)
    const {
        sendMessage,
        retryMessage,
        isSending,
    } = useSendMessage(api, sessionId, {
        isSessionThinking: session?.thinking ?? false,
        onSuccess: (sentSessionId) => {
            clearDraftsAfterSend(sentSessionId, sessionId)
        },
        resolveSessionId: async (currentSessionId) => {
            if (!api || !session || session.active) {
                return currentSessionId
            }
            try {
                return await api.resumeSession(currentSessionId, { permissionMode: session.permissionMode ?? undefined })
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Resume failed'
                addToast({
                    title: 'Resume failed',
                    body: message,
                    sessionId: currentSessionId,
                    url: ''
                })
                throw error
            }
        },
        onSessionResolved: (resolvedSessionId) => {
            void (async () => {
                if (api) {
                    if (session && resolvedSessionId !== session.id) {
                        seedMessageWindowFromSession(session.id, resolvedSessionId)
                        queryClient.setQueryData(queryKeys.session(resolvedSessionId), {
                            session: { ...session, id: resolvedSessionId, active: true }
                        })
                    }
                    try {
                        await Promise.all([
                            queryClient.prefetchQuery({
                                queryKey: queryKeys.session(resolvedSessionId),
                                queryFn: () => api.getSession(resolvedSessionId),
                            }),
                            fetchLatestMessages(api, resolvedSessionId),
                        ])
                    } catch {
                    }
                }
                navigate({
                    to: '/sessions/$sessionId',
                    params: { sessionId: resolvedSessionId },
                    replace: true
                })
            })()
        },
        onBlocked: (reason) => {
            if (reason === 'no-api') {
                addToast({
                    title: t('send.blocked.title'),
                    body: t('send.blocked.noConnection'),
                    sessionId: sessionId ?? '',
                    url: ''
                })
            }
            // 'no-session' and 'pending' don't need toast - either invalid state or expected behavior
        }
    })

    // Get agent type from session metadata for slash commands
    const agentType = session?.metadata?.flavor ?? 'claude'
    const {
        commands: slashCommands,
        getSuggestions: getSlashSuggestions,
    } = useSlashCommands(api, sessionId, agentType, session)
    const {
        getSuggestions: getSkillSuggestions,
    } = useSkills(api, sessionId)

    const getAutocompleteSuggestions = useCallback(async (query: string) => {
        if (query.startsWith('$')) {
            return await getSkillSuggestions(query)
        }
        return await getSlashSuggestions(query)
    }, [getSkillSuggestions, getSlashSuggestions])

    const refreshSelectedSession = useCallback(() => {
        void refetchSession()
        void refetchMessages()
    }, [refetchMessages, refetchSession])

    const viewActivity = useCallback(() => {
        startViewTransition(() => navigate({
            to: '/sessions/$sessionId/activity',
            params: { sessionId }
        }))
    }, [navigate, sessionId])

    const viewChat = useCallback(() => {
        startViewTransition(() => navigate({
            to: '/sessions/$sessionId/chat',
            params: { sessionId }
        }))
    }, [navigate, sessionId])

    if (!session) {
        return (
            <div className="flex-1 flex items-center justify-center p-4">
                <LoadingState label="Loading session…" className="text-sm" />
            </div>
        )
    }

    return (
        <SessionChat
            api={api}
            session={session}
            messages={messages}
            messagesWarning={messagesWarning}
            hasMoreMessages={messagesHasMore}
            isLoadingMessages={messagesLoading}
            isLoadingMoreMessages={messagesLoadingMore}
            isSending={isSending}
            pendingCount={pendingCount}
            messagesVersion={messagesVersion}
            onBack={goBack}
            onRefresh={refreshSelectedSession}
            onLoadMore={loadMoreMessages}
            onSend={sendMessage}
            onFlushPending={flushPending}
            onAtBottomChange={setAtBottom}
            onRetryMessage={retryMessage}
            autocompleteSuggestions={getAutocompleteSuggestions}
            availableSlashCommands={slashCommands}
            view={props.view}
            onViewActivity={viewActivity}
            onViewChat={viewChat}
        />
    )
}

function SwipeBackIndicator({ offset, progress }: { offset: number; progress: number }) {
    if (offset <= 0) return null
    return (
        <div
            className="fixed inset-0 z-50 pointer-events-none"
            style={{ opacity: progress * 0.3 }}
        >
            <div
                className="absolute left-0 top-0 h-full bg-[var(--app-fg)]"
                style={{
                    width: `${Math.min(offset, 80)}px`,
                    opacity: progress,
                    transition: offset === 0 ? 'all 150ms ease-out' : 'none',
                }}
            />
            <div
                className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center"
                style={{
                    left: `${Math.min(offset - 24, 56)}px`,
                    opacity: progress,
                    transition: offset === 0 ? 'all 150ms ease-out' : 'none',
                }}
            >
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--app-bg)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                        transform: `scale(${0.6 + progress * 0.4})`,
                        transition: offset === 0 ? 'transform 150ms ease-out' : 'none',
                    }}
                >
                    <polyline points="15 18 9 12 15 6" />
                </svg>
            </div>
        </div>
    )
}

function SessionDetailRoute() {
    const pathname = useLocation({ select: location => location.pathname })
    const navigate = useNavigate()
    const { sessionId } = useParams({ from: '/sessions/$sessionId' })
    const basePath = `/sessions/${sessionId}`
    const isActivity = pathname === basePath || pathname === `${basePath}/` || pathname.startsWith(`${basePath}/activity`)
    const isChat = pathname.startsWith(`${basePath}/chat`)
    const isFiles = pathname.startsWith(`${basePath}/files`) || pathname.startsWith(`${basePath}/file`)
    const isTerminal = pathname.startsWith(`${basePath}/terminal`)
    const focusQueue = useFocusQueue()
    const isFocusActive = focusQueue.active && focusQueue.ids.includes(sessionId)

    useEffect(() => {
        if (isFocusActive) {
            syncFocusIndexToSession(sessionId)
        }
    }, [sessionId, isFocusActive])

    const handleSwipeBack = useCallback(() => {
        startViewTransition(() => navigate({ to: '/sessions' }), 'back')
    }, [navigate])
    const { containerRef: swipeRef, offset: swipeOffset, progress: swipeProgress } = useSwipeBack(handleSwipeBack)

    // Tab order: Activity → Chat → Files → Terminal. Swipe-left advances, swipe-right
    // goes back. From Activity, swiping right falls back to swipe-back behavior
    // (handled by useSwipeBack at the left edge).
    const goNextTab = useCallback(() => {
        if (isActivity) {
            startViewTransition(() => navigate({
                to: '/sessions/$sessionId/chat',
                params: { sessionId }
            }))
        } else if (isChat) {
            startViewTransition(() => navigate({
                to: '/sessions/$sessionId/files',
                params: { sessionId }
            }))
        } else if (isFiles) {
            startViewTransition(() => navigate({
                to: '/sessions/$sessionId/terminal',
                params: { sessionId }
            }))
        }
    }, [navigate, sessionId, isActivity, isChat, isFiles])

    const goPrevTab = useCallback(() => {
        if (isTerminal) {
            startViewTransition(() => navigate({
                to: '/sessions/$sessionId/files',
                params: { sessionId }
            }))
        } else if (isFiles) {
            startViewTransition(() => navigate({
                to: '/sessions/$sessionId/chat',
                params: { sessionId }
            }))
        } else if (isChat) {
            startViewTransition(() => navigate({
                to: '/sessions/$sessionId/activity',
                params: { sessionId }
            }))
        }
    }, [navigate, sessionId, isTerminal, isFiles, isChat])

    const { containerRef: tabSwipeRef } = useTabSwipe({
        onSwipeLeft: goNextTab,
        onSwipeRight: goPrevTab,
    })

    return (
        <div
            ref={swipeRef}
            className="flex h-full min-h-0 flex-col [--app-floating-bottom-offset:0px]"
        >
            <SwipeBackIndicator offset={swipeOffset} progress={swipeProgress} />
            {isFocusActive ? <FocusBanner sessionId={sessionId} /> : null}
            <div ref={tabSwipeRef} className="flex-1 min-h-0">
                {isActivity ? <SessionPage view="activity" /> : isChat ? <SessionPage view="chat" /> : <Outlet />}
            </div>
        </div>
    )
}

function NewSessionPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const goBack = useAppGoBack()
    const queryClient = useQueryClient()
    const { machines, isLoading: machinesLoading, error: machinesError } = useMachines(api, true)
    const { t } = useTranslation()
    const { directory: initialDirectory, machineId: initialMachineId } = newSessionRoute.useSearch()

    const handleCancel = useCallback(() => {
        navigate({ to: '/sessions' })
    }, [navigate])

    const handleSuccess = useCallback((sessionId: string) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
        // Replace current page with /sessions to clear spawn flow from history
        navigate({ to: '/sessions', replace: true })
        // Then navigate to new session
        requestAnimationFrame(() => {
            navigate({
                to: '/sessions/$sessionId',
                params: { sessionId },
            })
        })
    }, [navigate, queryClient])

    const handleChooseFolder = useCallback((args: { machineId: string | null; directory: string }) => {
        // Forward the currently-selected machine so /browse opens scoped to
        // it rather than falling back to `hapi:lastMachineId`, which can
        // disagree if the user changed machines without yet creating a
        // session.
        navigate({
            to: '/browse',
            search: args.machineId ? { machineId: args.machineId } : {}
        })
    }, [navigate])

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="glass-bar sticky top-0 z-30 flex items-center gap-2 border-b border-[var(--app-divider)] p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
                {!isTelegramApp() && (
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <BackIcon />
                    </button>
                )}
                <div className="flex-1 font-semibold">{t('newSession.title')}</div>
            </div>

            <div
                className="app-scroll-y flex-1 min-h-0"
                style={{ paddingBottom: 'calc(var(--app-floating-bottom-offset, 0px) + env(safe-area-inset-bottom))' }}
            >
                {machinesError ? (
                    <div className="p-3 text-sm text-red-600">
                        {machinesError}
                    </div>
                ) : null}

                <NewSession
                    api={api}
                    machines={machines}
                    isLoading={machinesLoading}
                    onCancel={handleCancel}
                    onSuccess={handleSuccess}
                    onChooseFolder={handleChooseFolder}
                    initialDirectory={initialDirectory}
                    initialMachineId={initialMachineId}
                />
            </div>
        </div>
    )
}

function BrowsePage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const goBack = useAppGoBack()
    const { machines, isLoading: machinesLoading } = useMachines(api, true)
    const { t } = useTranslation()
    const { machineId: initialMachineId } = browseRoute.useSearch()

    const handleStartSession = useCallback((machineId: string, directory: string) => {
        navigate({
            to: '/sessions/new',
            search: { directory, machineId }
        })
    }, [navigate])

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-bg)] p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
                {!isTelegramApp() && (
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <BackIcon />
                    </button>
                )}
                <div className="flex-1 font-semibold">{t('browse.title')}</div>
            </div>

            <div className="flex-1 min-h-0">
                <WorkspaceBrowser
                    api={api}
                    machines={machines}
                    machinesLoading={machinesLoading}
                    onStartSession={handleStartSession}
                    initialMachineId={initialMachineId}
                />
            </div>
        </div>
    )
}

const rootRoute = createRootRoute({
    component: App,
})

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <Navigate to="/sessions" replace />,
})

const sessionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sessions',
    component: SessionsPage,
})

const sessionsIndexRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: '/',
    component: SessionsIndexPage,
})

const sessionDetailRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: '$sessionId',
    validateSearch: (search: Record<string, unknown>): { focus?: 1 } => {
        const focus = search.focus === 1 || search.focus === '1' || search.focus === true
        return focus ? { focus: 1 } : {}
    },
    component: SessionDetailRoute,
})

const sessionActivityRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'activity',
    component: () => null,
})

const sessionChatRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'chat',
    component: () => null,
})

const sessionFilesRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'files',
    validateSearch: (search: Record<string, unknown>): { tab?: 'changes' | 'directories' } => {
        const tabValue = typeof search.tab === 'string' ? search.tab : undefined
        const tab = tabValue === 'directories'
            ? 'directories'
            : tabValue === 'changes'
                ? 'changes'
                : undefined

        return tab ? { tab } : {}
    },
    component: FilesPage,
})

const sessionTerminalRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'terminal',
    component: TerminalPage,
})

type SessionFileSearch = {
    path: string
    staged?: boolean
    tab?: 'changes' | 'directories'
}

const sessionFileRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'file',
    validateSearch: (search: Record<string, unknown>): SessionFileSearch => {
        const path = typeof search.path === 'string' ? search.path : ''
        const staged = search.staged === true || search.staged === 'true'
            ? true
            : search.staged === false || search.staged === 'false'
                ? false
                : undefined

        const tabValue = typeof search.tab === 'string' ? search.tab : undefined
        const tab = tabValue === 'directories'
            ? 'directories'
            : tabValue === 'changes'
                ? 'changes'
                : undefined

        const result: SessionFileSearch = { path }
        if (staged !== undefined) {
            result.staged = staged
        }
        if (tab !== undefined) {
            result.tab = tab
        }
        return result
    },
    component: FilePage,
})

type NewSessionSearch = {
    directory?: string
    machineId?: string
}

const newSessionRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: 'new',
    validateSearch: (search: Record<string, unknown>): NewSessionSearch => {
        const result: NewSessionSearch = {}
        if (typeof search.directory === 'string' && search.directory) {
            result.directory = search.directory
        }
        if (typeof search.machineId === 'string' && search.machineId) {
            result.machineId = search.machineId
        }
        return result
    },
    component: NewSessionPage,
})

const browseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/browse',
    validateSearch: (search: Record<string, unknown>): { machineId?: string } => {
        if (typeof search.machineId === 'string' && search.machineId) {
            return { machineId: search.machineId }
        }
        return {}
    },
    component: BrowsePage,
})

const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: SettingsPage,
})

export const routeTree = rootRoute.addChildren([
    indexRoute,
    sessionsRoute.addChildren([
        sessionsIndexRoute,
        newSessionRoute,
        sessionDetailRoute.addChildren([
            sessionActivityRoute,
            sessionChatRoute,
            sessionTerminalRoute,
            sessionFilesRoute,
            sessionFileRoute,
        ]),
    ]),
    browseRoute,
    settingsRoute,
])

type RouterHistory = Parameters<typeof createRouter>[0]['history']

export function createAppRouter(history?: RouterHistory) {
    return createRouter({
        routeTree,
        history,
        scrollRestoration: true,
    })
}

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
    interface Register {
        router: AppRouter
    }
}
