import { useLocation, useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from '@/lib/use-translation'

function ChatIcon(props: { className?: string }) {
    return (
        <svg
            className={props.className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    )
}

function FolderIcon(props: { className?: string }) {
    return (
        <svg
            className={props.className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
    )
}

function TerminalIcon(props: { className?: string }) {
    return (
        <svg
            className={props.className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
    )
}

type Tab = {
    key: string
    label: string
    icon: typeof ChatIcon
    path: string
}

export function SessionTabBar() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { sessionId } = useParams({ from: '/sessions/$sessionId' })
    const pathname = useLocation({ select: (location) => location.pathname })

    const basePath = `/sessions/${sessionId}`

    const tabs: Tab[] = [
        {
            key: 'chat',
            label: t('session.tab.chat'),
            icon: ChatIcon,
            path: basePath,
        },
        {
            key: 'files',
            label: t('session.tab.files'),
            icon: FolderIcon,
            path: `${basePath}/files`,
        },
        {
            key: 'terminal',
            label: t('session.tab.terminal'),
            icon: TerminalIcon,
            path: `${basePath}/terminal`,
        },
    ]

    const activeTab = pathname.startsWith(`${basePath}/terminal`)
        ? 'terminal'
        : pathname.startsWith(`${basePath}/file`)
            ? 'files'
            : 'chat'

    return (
        <nav
            className="lg:hidden shrink-0 glass-bar mx-3 mb-2 rounded-2xl border border-[var(--app-divider)]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
            <div className="flex items-center justify-around h-[52px]">
                {tabs.map((tab) => {
                    const isActive = tab.key === activeTab
                    const Icon = tab.icon
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => navigate({ to: tab.path })}
                            className={`flex flex-1 flex-col items-center justify-center gap-0.5 h-full transition-colors ${
                                isActive
                                    ? 'text-[var(--app-fg)]'
                                    : 'text-[var(--app-hint)]'
                            }`}
                        >
                            <Icon className="h-5 w-5" />
                            <span className="text-[10px] leading-tight">{tab.label}</span>
                        </button>
                    )
                })}
            </div>
        </nav>
    )
}
