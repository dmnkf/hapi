import type { QuickStartConfig } from './useQuickStartConfigs'
import { useTranslation } from '@/lib/use-translation'

function getProjectName(directory: string): string {
    const segments = directory.replace(/\/+$/, '').split('/')
    return segments[segments.length - 1] || directory
}

function getRelativeTime(timestamp: number, t: (key: string, params?: Record<string, string | number>) => string): string {
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return t('session.time.justNow')
    if (minutes < 60) return t('session.time.minutesAgo', { n: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('session.time.hoursAgo', { n: hours })
    const days = Math.floor(hours / 24)
    return t('session.time.daysAgo', { n: days })
}

export function QuickStartCards(props: {
    configs: QuickStartConfig[]
    isDisabled: boolean
    connectedMachineIds: Set<string>
    onSelect: (config: QuickStartConfig) => void
}) {
    const { t } = useTranslation()

    const availableConfigs = props.configs.filter((c) => props.connectedMachineIds.has(c.machineId))

    if (availableConfigs.length === 0) return null

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <label className="text-xs font-medium text-[var(--app-hint)]">
                {t('newSession.quickStart')}
            </label>
            <div className="flex flex-col gap-1.5">
                {availableConfigs.map((config, index) => (
                    <button
                        key={`${config.machineId}-${config.directory}-${index}`}
                        type="button"
                        disabled={props.isDisabled}
                        onClick={() => props.onSelect(config)}
                        className="flex items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-2 text-left transition-colors hover:bg-[var(--app-secondary-bg)] disabled:opacity-50"
                    >
                        <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium text-[var(--app-fg)]">
                                {getProjectName(config.directory)}
                            </span>
                            <span className="truncate text-xs text-[var(--app-hint)]">
                                {config.machineName}
                            </span>
                        </div>
                        <span className="shrink-0 rounded bg-[var(--app-secondary-bg)] px-1.5 py-0.5 text-xs capitalize text-[var(--app-fg)]">
                            {config.agent}
                        </span>
                        <span className="shrink-0 text-xs text-[var(--app-hint)]">
                            {getRelativeTime(config.timestamp, t)}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    )
}
