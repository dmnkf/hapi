import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useFocusQueue } from '@/hooks/useFocusQueue'
import { advanceFocusQueue, exitFocusQueue } from '@/lib/focusQueue'
import { startViewTransition } from '@/lib/viewTransition'
import { useTranslation } from '@/lib/use-translation'

function CloseIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    )
}

function ArrowRightIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
        </svg>
    )
}

function CheckIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    )
}

export function FocusBanner(props: { sessionId: string }) {
    const { sessionId } = props
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { active, ids, currentIndex } = useFocusQueue()

    const hasMore = currentIndex < ids.length - 1
    const total = ids.length

    const handleNext = useCallback(() => {
        const nextId = advanceFocusQueue(sessionId)
        if (nextId) {
            startViewTransition(() =>
                navigate({
                    to: '/sessions/$sessionId',
                    params: { sessionId: nextId },
                    search: { focus: 1 },
                })
            )
        } else {
            startViewTransition(() => navigate({ to: '/sessions' }))
        }
    }, [navigate, sessionId])

    const handleExit = useCallback(() => {
        exitFocusQueue()
        startViewTransition(() =>
            navigate({
                to: '/sessions/$sessionId',
                params: { sessionId },
                search: {},
            })
        )
    }, [navigate, sessionId])

    if (!active || total === 0) return null

    const indexForDisplay = ids.indexOf(sessionId)
    const position = indexForDisplay >= 0 ? indexForDisplay + 1 : currentIndex + 1

    return (
        <div className="glass-bar shrink-0 border-b border-[var(--app-divider)]">
            <div className="mx-auto flex w-full max-w-content items-center justify-between gap-2 px-3 py-1.5">
                <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-[var(--app-fg)]">
                    <span
                        aria-hidden="true"
                        className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--app-badge-warning-text)]"
                    />
                    <span className="truncate">
                        {t('focus.progress', { current: position, total })}
                    </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        onClick={handleNext}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--app-fg)] px-3 py-1 text-xs font-semibold text-[var(--app-bg)] transition-opacity hover:opacity-90"
                    >
                        <span>{hasMore ? t('focus.next') : t('focus.finish')}</span>
                        {hasMore ? <ArrowRightIcon /> : <CheckIcon />}
                    </button>
                    <button
                        type="button"
                        onClick={handleExit}
                        aria-label={t('focus.exit')}
                        title={t('focus.exit')}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]"
                    >
                        <CloseIcon />
                    </button>
                </div>
            </div>
        </div>
    )
}
