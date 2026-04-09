import { useCallback, useEffect, useRef, useState } from 'react'

const PULL_THRESHOLD = 60
const MAX_PULL = 120
const INDICATOR_HEIGHT = 48

type PullState = {
    active: boolean
    startY: number
    currentY: number
    locked: boolean
    cancelled: boolean
}

export function usePullToRefresh(onRefresh: () => void) {
    const containerRef = useRef<HTMLDivElement>(null)
    const stateRef = useRef<PullState>({
        active: false,
        startY: 0,
        currentY: 0,
        locked: false,
        cancelled: false,
    })
    const [pullDistance, setPullDistance] = useState(0)
    const [isRefreshing, setIsRefreshing] = useState(false)

    const reset = useCallback(() => {
        stateRef.current = {
            active: false,
            startY: 0,
            currentY: 0,
            locked: false,
            cancelled: false,
        }
        setPullDistance(0)
    }, [])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        function onTouchStart(e: TouchEvent) {
            if (isRefreshing) return
            const scrollTop = el!.scrollTop
            if (scrollTop > 0) return

            const touch = e.touches[0]
            stateRef.current = {
                active: true,
                startY: touch.clientY,
                currentY: touch.clientY,
                locked: false,
                cancelled: false,
            }
        }

        function onTouchMove(e: TouchEvent) {
            const s = stateRef.current
            if (!s.active || s.cancelled || isRefreshing) return

            const touch = e.touches[0]
            const dy = touch.clientY - s.startY

            // Decide direction once we have enough movement
            if (!s.locked) {
                if (dy < 0) {
                    // Scrolling up, not pulling
                    s.cancelled = true
                    setPullDistance(0)
                    return
                }
                if (dy > 10) {
                    s.locked = true
                }
            }

            if (!s.locked) return

            // Apply resistance: diminishing returns past threshold
            const raw = Math.max(0, dy)
            const resisted = raw > PULL_THRESHOLD
                ? PULL_THRESHOLD + (raw - PULL_THRESHOLD) * 0.4
                : raw
            const clamped = Math.min(MAX_PULL, resisted)

            s.currentY = touch.clientY
            setPullDistance(clamped)
        }

        function onTouchEnd() {
            const s = stateRef.current
            if (!s.active || s.cancelled || isRefreshing) {
                reset()
                return
            }

            const dy = s.currentY - s.startY
            if (s.locked && dy >= PULL_THRESHOLD) {
                // Trigger refresh
                setIsRefreshing(true)
                setPullDistance(INDICATOR_HEIGHT)
                onRefresh()
                // Auto-reset after a delay
                setTimeout(() => {
                    setIsRefreshing(false)
                    reset()
                }, 1000)
            } else {
                reset()
            }

            stateRef.current.active = false
        }

        el.addEventListener('touchstart', onTouchStart, { passive: true })
        el.addEventListener('touchmove', onTouchMove, { passive: true })
        el.addEventListener('touchend', onTouchEnd, { passive: true })
        el.addEventListener('touchcancel', reset, { passive: true })

        return () => {
            el.removeEventListener('touchstart', onTouchStart)
            el.removeEventListener('touchmove', onTouchMove)
            el.removeEventListener('touchend', onTouchEnd)
            el.removeEventListener('touchcancel', reset)
        }
    }, [onRefresh, reset, isRefreshing])

    const pastThreshold = pullDistance >= PULL_THRESHOLD

    return { containerRef, pullDistance, isRefreshing, pastThreshold, indicatorHeight: INDICATOR_HEIGHT }
}
