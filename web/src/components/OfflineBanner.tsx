import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useTranslation } from '@/lib/use-translation'

export function OfflineBanner() {
    const { t } = useTranslation()
    const isOnline = useOnlineStatus()

    if (isOnline) {
        return null
    }

    return (
        <div className="glass-bar fixed top-0 left-0 right-0 text-[var(--app-badge-warning-text)] text-center py-2 text-sm font-medium z-50 border-b border-[var(--app-badge-warning-border)]">
            {t('offline.message')}
        </div>
    )
}
