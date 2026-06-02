export async function clearAppCacheAndReload(): Promise<void> {
    const tasks: Promise<unknown>[] = []

    if (typeof caches !== 'undefined') {
        tasks.push(
            caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
        )
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        tasks.push(
            navigator.serviceWorker.getRegistrations().then(regs =>
                Promise.all(regs.map(reg => reg.unregister()))
            )
        )
    }

    try {
        await Promise.all(tasks)
    } catch {
    }

    window.location.reload()
}
